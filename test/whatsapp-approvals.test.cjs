'use strict';

/**
 * Tests for WhatsApp "Send on approval" and Draft persistence (Reviewer Findings #2 & #3).
 *
 * Verifies:
 * 1. whatsAppProposalSendProblem correctly enforces the proposal state machine.
 * 2. WhatsAppApprovals store manages lifecycle: waiting -> approved / changes / declined -> sending -> sent.
 * 3. WhatsAppService integration:
 *    - Approval mode blocks unapproved sends.
 *    - Propose files into store and notifies owner.
 *    - Send dispatches ONLY the approved copy (edits honored, arbitrary agent payload ignored).
 *    - Repeated send is idempotent.
 * 4. WhatsAppDrafts store persists and lists drafts.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const {
  whatsAppProposalSendProblem,
  describeWhatsAppEdits,
  whatsAppDecisionMessage
} = loadTs('src/shared/whatsappProposals.ts');
const { WhatsAppApprovals } = loadTs('src/main/whatsappApprovals.ts');
const { WhatsAppDrafts } = loadTs('src/main/whatsappDrafts.ts');
const { WhatsAppService } = loadTs('src/main/whatsapp.ts');

test('whatsAppProposalSendProblem: validates proposal ownership, state, and replay', () => {
  const p = {
    id: 'wp_1',
    agentId: 'pam',
    accountId: 'wa-support',
    to: '+15551234',
    text: 'Original text',
    createdAt: 100,
    state: 'waiting'
  };

  // Wrong agent or account
  assert.match(whatsAppProposalSendProblem(undefined, 'pam', 'wa-support'), /No proposal/);
  assert.match(whatsAppProposalSendProblem(p, 'dwight', 'wa-support'), /No proposal/);
  assert.match(whatsAppProposalSendProblem(p, 'pam', 'wa-other'), /No proposal/);

  // Waiting
  assert.match(whatsAppProposalSendProblem(p, 'pam', 'wa-support'), /not decided/);

  // Changes requested
  assert.match(whatsAppProposalSendProblem({ ...p, state: 'changes' }, 'pam', 'wa-support'), /changes/);

  // Declined
  assert.match(whatsAppProposalSendProblem({ ...p, state: 'declined' }, 'pam', 'wa-support'), /chose not to send/);

  // Cancelled
  assert.match(whatsAppProposalSendProblem({ ...p, state: 'cancelled' }, 'pam', 'wa-support'), /withdrawn/);

  // Sending
  assert.match(whatsAppProposalSendProblem({ ...p, state: 'sending' }, 'pam', 'wa-support'), /currently being sent/);

  // Approved without approved copy
  assert.match(whatsAppProposalSendProblem({ ...p, state: 'approved' }, 'pam', 'wa-support'), /cannot be sent/);

  // Approved with approved copy -> Valid!
  assert.equal(whatsAppProposalSendProblem({ ...p, state: 'approved', approved: { to: '+15551234', text: 'Approved' } }, 'pam', 'wa-support'), null);

  // Sent -> Idempotent replay valid!
  assert.equal(whatsAppProposalSendProblem({ ...p, state: 'sent' }, 'pam', 'wa-support'), null);
});

test('WhatsAppApprovals store: lifecycle, file persistence, decide, and cancel', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-wa-appr-'));
  const storePath = path.join(tmpDir, 'whatsapp-proposals.json');
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const messages = [];
  const toasts = [];
  const notes = [];

  const approvals = new WhatsAppApprovals({
    path: storePath,
    send: (m) => messages.push(m),
    toast: (msg) => toasts.push(msg),
    remember: (agentId, note) => notes.push({ agentId, note }),
    agentName: () => 'Pam'
  });

  // 1. File proposal
  const prop = approvals.file({
    agentId: 'pam',
    accountId: 'wa-support',
    to: '+15551111',
    text: 'Hi there, how can we help?'
  });
  assert.ok(prop.id.startsWith('wp_'));
  assert.equal(prop.state, 'waiting');
  assert.equal(approvals.waiting().length, 1);
  assert.equal(toasts.length, 1);
  assert.match(toasts[0], /Pam has a WhatsApp message for you to approve in ASK ME/);

  // 2. Decide: approve with edit
  const decRes = approvals.decide(
    prop.id,
    'approve',
    { to: '+15551111', text: 'Hi! Acme Support here. How can we help today?' },
    ''
  );
  assert.equal(decRes.ok, true);
  assert.equal(approvals.waiting().length, 0);

  const approved = approvals.get(prop.id);
  assert.equal(approved.state, 'approved');
  assert.equal(approved.approved.text, 'Hi! Acme Support here. How can we help today?');
  assert.equal(messages.length, 1);
  assert.match(messages[0].body, /The owner approved your WhatsApp message/);

  // 3. Mark sending and sent
  approvals.markSending(prop.id);
  assert.equal(approvals.get(prop.id).state, 'sending');

  approvals.markSent(prop.id, 'wamid.sent-99');
  assert.equal(approvals.get(prop.id).state, 'sent');
  assert.equal(approvals.get(prop.id).messageId, 'wamid.sent-99');

  // 4. Cancel
  const prop2 = approvals.file({
    agentId: 'pam',
    accountId: 'wa-support',
    to: '+15552222',
    text: 'Second proposal'
  });
  assert.equal(approvals.waiting().length, 1);
  const cancelledCount = approvals.cancel({ id: prop2.id }, 'Customer reached out via phone instead.');
  assert.equal(cancelledCount, 1);
  assert.equal(approvals.get(prop2.id).state, 'cancelled');
  assert.equal(approvals.waiting().length, 0);
});

test('WhatsAppService integration: enforces Send on approval and approved copy dispatch', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-wa-svc-'));
  const storePath = path.join(tmpDir, 'whatsapp-proposals.json');
  const draftsPath = path.join(tmpDir, 'whatsapp-drafts.json');
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const approvals = new WhatsAppApprovals({ path: storePath });
  const drafts = new WhatsAppDrafts({ path: draftsPath });

  const cfg = {
    whatsappAccounts: [
      { id: 'wa-support', phoneNumberId: '109988', displayPhoneNumber: '+15551111', label: 'Support', status: 'connected', createdAt: 1, updatedAt: 1 }
    ],
    agentCapabilities: {
      pam: {
        whatsapp: { enabled: true, accounts: ['wa-support'], send: false, sending: 'approval' }
      },
      toby: {
        whatsapp: { enabled: true, accounts: ['wa-support'], send: false, sending: 'draft' }
      }
    }
  };

  const sentDispatches = [];
  const mockFetchSend = async (url, opts) => {
    const body = JSON.parse(opts.body);
    sentDispatches.push(body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        messages: [{ id: `wamid.${Date.now()}` }]
      })
    };
  };

  const service = new WhatsAppService({
    getSecret: () => 'meta-secret-token',
    getConfig: () => cfg,
    fetchFn: mockFetchSend,
    approvals,
    drafts
  });

  // 1. Pam cannot send directly without proposalId
  const directSend = await service.handleWhatsAppRequest('pam', 'send_whatsapp_message', {
    accountId: 'wa-support',
    to: '+15559999',
    text: 'Sneaky unapproved send'
  });
  assert.equal(directSend.status, 403);
  assert.equal(sentDispatches.length, 0);

  // 2. Pam proposes message
  const propRes = await service.handleWhatsAppRequest('pam', 'propose_whatsapp_message', {
    accountId: 'wa-support',
    to: '+1 (555) 9999',
    text: 'Agent draft message'
  });
  assert.equal(propRes.status, 200);
  assert.ok(propRes.body.proposalId);
  const proposalId = propRes.body.proposalId;

  // 3. Pam tries to send with proposalId BEFORE owner approves -> 409
  const prematureSend = await service.handleWhatsAppRequest('pam', 'send_whatsapp_message', {
    accountId: 'wa-support',
    proposalId,
    to: '+1 (555) 9999',
    text: 'Agent draft message'
  });
  assert.equal(prematureSend.status, 409);
  assert.match(prematureSend.body.error, /not decided/);
  assert.equal(sentDispatches.length, 0);

  // 4. Owner approves with edited text on Ask Me
  approvals.decide(
    proposalId,
    'approve',
    { to: '+1 (555) 9999', text: 'Owner-Approved Final Copy' },
    ''
  );

  // 5. Pam dispatches: attempts to send with DIFFERENT text in tool arguments
  const sendRes = await service.handleWhatsAppRequest('pam', 'send_whatsapp_message', {
    accountId: 'wa-support',
    proposalId,
    to: '+1 (555) 9999',
    text: 'Ignored agent text'
  });
  assert.equal(sendRes.status, 200);
  assert.equal(sendRes.body.ok, true);

  // CRITICAL CHECK: Verify what was actually sent to Meta Cloud API!
  assert.equal(sentDispatches.length, 1);
  assert.equal(sentDispatches[0].text.body, 'Owner-Approved Final Copy', 'Must dispatch approved text, NOT tool argument text!');
  assert.equal(approvals.get(proposalId).state, 'sent');

  // 6. Idempotent replay: sending again with same proposal returns repeated: true
  const repeatRes = await service.handleWhatsAppRequest('pam', 'send_whatsapp_message', {
    accountId: 'wa-support',
    proposalId
  });
  assert.equal(repeatRes.status, 200);
  assert.equal(repeatRes.body.repeated, true);
  assert.equal(sentDispatches.length, 1, 'Does not re-dispatch to network');

  // 7. Toby in Draft only mode saves draft to store
  const draftRes = await service.handleWhatsAppRequest('toby', 'draft_whatsapp_message', {
    accountId: 'wa-support',
    to: '+15553333',
    text: 'A draft for Toby'
  });
  assert.equal(draftRes.status, 200);
  assert.ok(draftRes.body.draftId);
  const allDrafts = drafts.list({ accountId: 'wa-support' });
  assert.equal(allDrafts.length, 1);
  assert.equal(allDrafts[0].text, 'A draft for Toby');
});
