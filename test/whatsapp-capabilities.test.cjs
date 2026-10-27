'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const {
  whatsAppAccess,
  whatsAppHolder,
  agentWhatsAppAccounts,
  hasWhatsAppTools,
  whatsAppToolsJustAttached,
  whatsAppIdFor,
  secretRefForWhatsApp,
  whatsAppSendingMode
} = loadTs('src/shared/whatsapp.ts');

test('whatsAppHolder finds which agent holds a number, excluding the asker', () => {
  const caps = {
    kelly: { whatsapp: { enabled: true, accounts: ['support-wa'], send: true, sending: 'send' } },
    dwight: { whatsapp: { enabled: false, accounts: ['sales-wa'], send: false, sending: 'draft' } },
    pam: {}
  };

  assert.equal(whatsAppHolder(caps, 'support-wa'), 'kelly');
  assert.equal(whatsAppHolder(caps, 'support-wa', 'kelly'), undefined, 'not a clash with herself');
  assert.equal(whatsAppHolder(caps, 'sales-wa'), undefined, 'disabled capability does not hold account');
  assert.equal(whatsAppHolder(caps, 'unassigned'), undefined);
});

test('whatsAppAccess enforces capability gate, account ownership, and sending modes', () => {
  const cfg = {
    whatsappAccounts: [
      { id: 'support-wa', phoneNumberId: '1001', displayPhoneNumber: '+15551234', label: 'Support', status: 'connected', createdAt: 1, updatedAt: 1 }
    ],
    agentCapabilities: {
      kelly: {
        whatsapp: { enabled: true, accounts: ['support-wa'], send: true, sending: 'send' }
      },
      pam: {
        whatsapp: { enabled: true, accounts: ['support-wa'], send: false, sending: 'approval' }
      },
      toby: {
        whatsapp: { enabled: true, accounts: ['support-wa'], send: false, sending: 'draft' }
      },
      dwight: {
        whatsapp: { enabled: false, accounts: ['support-wa'], send: false, sending: 'draft' }
      }
    }
  };

  // Kelly: Can send
  assert.deepEqual(whatsAppAccess(cfg, 'kelly', 'support-wa', 'send'), { ok: true });
  assert.equal(whatsAppAccess(cfg, 'kelly', 'support-wa', 'propose').ok, false, 'send mode cannot propose');
  assert.deepEqual(whatsAppAccess(cfg, 'kelly', 'support-wa', 'read'), { ok: true });
  assert.deepEqual(whatsAppAccess(cfg, 'kelly', 'support-wa', 'list'), { ok: true });

  // Pam: Send on approval
  assert.equal(whatsAppAccess(cfg, 'pam', 'support-wa', 'send').ok, false, 'approval mode requires proposalId to send');
  assert.deepEqual(whatsAppAccess(cfg, 'pam', 'support-wa', 'send', 'prop-123'), { ok: true });
  assert.deepEqual(whatsAppAccess(cfg, 'pam', 'support-wa', 'propose'), { ok: true });

  // Toby: Draft only
  assert.equal(whatsAppAccess(cfg, 'toby', 'support-wa', 'send').ok, false);
  assert.equal(whatsAppAccess(cfg, 'toby', 'support-wa', 'propose').ok, false);
  assert.deepEqual(whatsAppAccess(cfg, 'toby', 'support-wa', 'draft'), { ok: true });

  // Dwight: capability disabled
  assert.equal(whatsAppAccess(cfg, 'dwight', 'support-wa', 'list').ok, false);

  // Missing or unassigned account
  assert.equal(whatsAppAccess(cfg, 'kelly', 'missing-wa', 'read').ok, false);
});

test('helpers: slug creation and secret refs', () => {
  assert.equal(secretRefForWhatsApp('support-wa'), 'whatsapp:support-wa');
  const id1 = whatsAppIdFor('+1 (555) 019-2834');
  assert.match(id1, /^wa-1-555-019-2834/);
  const id2 = whatsAppIdFor('Support Line');
  assert.match(id2, /^wa-support-line/);
});

test('restart detection: whatsAppToolsJustAttached', () => {
  assert.equal(hasWhatsAppTools({ whatsapp: { enabled: true } }), true);
  assert.equal(hasWhatsAppTools({ whatsapp: { enabled: false } }), false);
  assert.equal(hasWhatsAppTools(undefined), false);

  assert.equal(
    whatsAppToolsJustAttached(undefined, { whatsapp: { enabled: true, accounts: ['wa-1'], send: false } }),
    true
  );
  assert.equal(
    whatsAppToolsJustAttached({ whatsapp: { enabled: true, accounts: ['wa-1'], send: false } }, { whatsapp: { enabled: true, accounts: ['wa-1'], send: false } }),
    false
  );
});

test('proposals are withdrawn when the line is removed, moved or set to Draft only, as mail does', () => {
  const { removeWhatsAppAccount, setAgentWhatsAppCapabilities } = loadTs('src/main/whatsapp.ts');
  const make = (caps) => {
    let cfg = {
      whatsappAccounts: [{ id: 'wa-support', phoneNumberId: '1', displayPhoneNumber: '+1', label: 'Support', status: 'connected', createdAt: 1, updatedAt: 1 }],
      agentCapabilities: caps
    };
    const cancelled = [];
    const dropped = [];
    const admin = {
      getConfig: () => cfg,
      saveConfig: (patch) => { cfg = { ...cfg, ...patch }; },
      setSecret: () => ({ ok: true }),
      deleteSecret: () => true,
      cancelFor: (agentId, accountId, reason) => cancelled.push([agentId, accountId, reason]),
      dropDrafts: (accountId) => dropped.push(accountId)
    };
    return { admin, cancelled, dropped };
  };
  const approval = { enabled: true, accounts: ['wa-support'], send: false, sending: 'approval' };

  const removed = make({ kelly: { whatsapp: approval } });
  removeWhatsAppAccount(removed.admin, 'wa-support');
  assert.deepEqual(removed.cancelled.map((c) => c.slice(0, 2)), [['kelly', 'wa-support']]);
  assert.deepEqual(removed.dropped, ['wa-support']);

  const moved = make({ kelly: { whatsapp: approval } });
  setAgentWhatsAppCapabilities(moved.admin, 'pam', { whatsapp: approval, move: true });
  assert.deepEqual(moved.cancelled.map((c) => c.slice(0, 2)), [['kelly', 'wa-support']]);

  const drafted = make({ kelly: { whatsapp: approval } });
  setAgentWhatsAppCapabilities(drafted.admin, 'kelly', { whatsapp: { ...approval, sending: 'draft' } });
  assert.equal(drafted.cancelled.length, 1);
  assert.match(drafted.cancelled[0][2], /Draft only/);

  const same = make({ kelly: { whatsapp: approval } });
  setAgentWhatsAppCapabilities(same.admin, 'kelly', { whatsapp: approval });
  assert.deepEqual(same.cancelled, [], 'no change, nothing withdrawn');
});
