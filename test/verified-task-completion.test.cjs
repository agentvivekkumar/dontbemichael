'use strict';

/**
 * Verified Task Completion test suite.
 *
 * Verifies the three-way handshake between:
 *   1. The AI employee that performs the task.
 *   2. The actual system where the action is performed (e.g. mail system sent records).
 *   3. Michael and the task ledger recording the final verified outcome.
 *
 * Rules protected:
 *   - An AI employee's claim of completion is not independent proof of success.
 *   - A successful verification marks the task verified with evidence reference.
 *   - A failed verification prevents the task from reaching Done, preserves failure reason,
 *     and keeps the card in a blocked state without false completion.
 *   - An unsupported task type records not_supported without falsely claiming verification.
 *   - Owner-closed tasks are honored as human consent.
 *   - No unsafe automatic duplicate actions are triggered on failure or uncertain outcomes.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { HiveManager } = loadTs('src/main/hive.ts');
const {
  isMailAction,
  verifyTaskCompletion,
  evaluateTaskCompletion
} = loadTs('src/shared/taskVerification.ts');
const { parseTasks } = loadTs('src/renderer/src/components/hiveTasks.ts');
const { guardCards } = loadTs('src/shared/cardGuards.ts');

function floor(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-verified-completion-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return new HiveManager(() => home);
}

function card(id, extra = {}) {
  return {
    id,
    title: id,
    status: 'doing',
    assignee: 'kelly',
    dependsOn: [],
    priority: 3,
    createdAt: '2026-10-14T08:00:00.000Z',
    ...extra
  };
}

test('isMailAction distinguishes mail-related tasks from unrelated tasks', () => {
  assert.equal(isMailAction({ title: 'Send email to customer about contract' }), true);
  assert.equal(isMailAction({ title: 'Invoice follow up', result: 'Sent email to acme@example.com' }), true);
  assert.equal(isMailAction({ title: 'Report delivery', result: 'Message-ID: <msg-123@office>' }), true);
  assert.equal(isMailAction({ title: 'Weekly summary', result: 'Emailed the report' }), true);
  assert.equal(isMailAction({ title: 'Follow up', result: 'Approved proposal-42 sent' }), true);

  // Unrelated tasks
  assert.equal(isMailAction({ title: 'Research competitor pricing' }), false);
  assert.equal(isMailAction({ title: 'Review quarterly balance sheet', result: 'Updated spreadsheet rows' }), false);
  assert.equal(isMailAction({ title: 'Clean up temp files', result: 'Deleted 15 files' }), false);
});

test('successful verification allows task to reach verified completion with evidence', () => {
  const task = card('task-email-1', {
    title: 'Send welcome email to new client',
    assignee: 'kelly',
    result: 'Sent welcome email to client@example.com with Message-ID: <welcome-999@acme.com>'
  });

  const context = {
    sends: [
      {
        agentId: 'kelly',
        mailbox: 'sales@acme.com',
        messageId: 'welcome-999@acme.com',
        to: 'client@example.com',
        subject: 'Welcome to Acme',
        sentAt: Date.parse('2026-10-14T08:05:00.000Z')
      }
    ]
  };

  const decision = evaluateTaskCompletion(task, context);
  assert.equal(decision.allowed, true, 'verified task is allowed to complete');
  assert.equal(decision.status, 'done', 'reaches done');
  assert.equal(decision.verification.status, 'verified', 'status is verified');
  assert.equal(decision.verification.method, 'mail-send', 'method is mail-send');
  assert.equal(decision.verification.evidence, 'welcome-999@acme.com', 'evidence preserves actual Message-ID');
  assert.ok(decision.verification.verifiedAt, 'verification timestamp recorded');
});

test('failed verification prevents task from completing as Done and preserves failure reason', () => {
  // Kelly claims an email was sent, but the mail system has no record of it
  const task = card('task-email-fake', {
    title: 'Send confirmation email',
    assignee: 'kelly',
    result: 'Sent confirmation email to supplier@example.com with Message-ID: <nonexistent-id@acme.com>'
  });

  const context = {
    sends: [] // No matching send records in mail system
  };

  const decision = evaluateTaskCompletion(task, context);
  assert.equal(decision.allowed, false, 'unverified claim cannot be completed as Done');
  assert.equal(decision.status, 'blocked', 'task status is held as blocked');
  assert.equal(decision.verification.status, 'failed', 'verification status is failed');
  assert.ok(decision.verification.reason, 'failure reason is preserved');
  assert.equal(decision.verification.method, 'mail-send');
});

test('unsupported verification mechanism does not falsely claim verified success', () => {
  const task = card('task-research-1', {
    title: 'Research competitor pricing across five vendors',
    assignee: 'dwight',
    result: 'Compiled comparison matrix in docs/pricing.md'
  });

  const decision = evaluateTaskCompletion(task, { sends: [] });
  assert.equal(decision.allowed, true, 'unsupported task can complete work');
  assert.equal(decision.status, 'done');
  assert.equal(decision.verification.status, 'not_supported', 'must not falsely claim verified');
  assert.equal(decision.verification.method, 'none');
});

test('owner-closed task is preserved as owner decision without false automated verification', () => {
  const task = card('task-owner-close', {
    title: 'Contact prospective partner',
    closedBy: 'owner',
    closedReason: 'Owner decided to pause partnership'
  });

  const decision = evaluateTaskCompletion(task, { sends: [] });
  assert.equal(decision.allowed, true);
  assert.equal(decision.status, 'done');
  assert.equal(decision.verification.status, 'not_supported');
  assert.equal(decision.verification.method, 'owner-close');
});

test('HiveManager.patchTask enforces verification when moving task to Done', (t) => {
  const hive = floor(t);
  const emailTask = card('task-100', {
    title: 'Send invoice receipt',
    status: 'doing',
    assignee: 'kelly'
  });
  hive.writeTasks([emailTask]);

  // Attempt 1: AI claims email was sent, but mail system has no record
  hive.setVerificationContextFetcher(() => ({
    sends: []
  }));

  const patchFailed = hive.patchTask('task-100', {
    status: 'done',
    result: 'Sent invoice receipt to customer@example.com with Message-ID: <missing-123@mail>'
  });
  assert.equal(patchFailed, true);

  const ledgerAfterFail = hive.tasks().tasks;
  const cardAfterFail = ledgerAfterFail.find((c) => c.id === 'task-100');
  assert.notEqual(cardAfterFail.status, 'done', 'failed verification must not allow status: done');
  assert.equal(cardAfterFail.status, 'blocked', 'failed verification holds task in blocked');
  assert.equal(cardAfterFail.verification.status, 'failed', 'records verification failure');
  assert.ok(cardAfterFail.verification.reason, 'records failure reason');

  // Attempt 2: Actual mail system confirms the send record
  hive.setVerificationContextFetcher(() => ({
    sends: [
      {
        agentId: 'kelly',
        messageId: 'receipt-confirmed-456@mail',
        to: 'customer@example.com',
        subject: 'Receipt',
        sentAt: Date.now()
      }
    ]
  }));

  const patchSuccess = hive.patchTask('task-100', {
    status: 'done',
    result: 'Sent invoice receipt to customer@example.com with Message-ID: <receipt-confirmed-456@mail>'
  });
  assert.equal(patchSuccess, true);

  const ledgerAfterSuccess = hive.tasks().tasks;
  const cardAfterSuccess = ledgerAfterSuccess.find((c) => c.id === 'task-100');
  assert.equal(cardAfterSuccess.status, 'done', 'verified send is allowed to reach done');
  assert.equal(cardAfterSuccess.verification.status, 'verified', 'marked as verified');
  assert.equal(cardAfterSuccess.verification.evidence, 'receipt-confirmed-456@mail', 'evidence matches messageId');
});

test('guardCards prevents on-disk cards with failed verification from remaining in Done', () => {
  const failedCard = card('task-bad-done', {
    status: 'done',
    result: 'Claimed done without verification',
    verification: {
      status: 'failed',
      method: 'mail-send',
      reason: 'No record found'
    }
  });

  const before = { hive: 'test', done: {}, placed: {}, reminders: {} };
  const result = guardCards([failedCard], before);

  assert.equal(result.changed, true, 'board guard detects invalid Done card');
  assert.equal(result.fixes['task-bad-done'].status, 'blocked', 'moved out of done to blocked');
});

test('renderer parseTasks preserves verification fields across polls', () => {
  const raw = {
    tasks: [
      card('verified-1', {
        status: 'done',
        result: 'Email sent',
        verification: {
          status: 'verified',
          method: 'mail-send',
          evidence: 'msg-abc@domain',
          reason: 'Confirmed sent email in mail system records',
          verifiedAt: '2026-10-14T08:05:00.000Z'
        }
      }),
      card('unsupported-1', {
        status: 'done',
        result: 'Research finished',
        verification: {
          status: 'not_supported',
          method: 'none',
          reason: 'No verification mechanism available for this task type',
          verifiedAt: '2026-10-14T08:05:00.000Z'
        }
      })
    ]
  };

  const parsed = parseTasks(raw);
  assert.equal(parsed[0].verification.status, 'verified');
  assert.equal(parsed[0].verification.evidence, 'msg-abc@domain');
  assert.equal(parsed[1].verification.status, 'not_supported');
});
