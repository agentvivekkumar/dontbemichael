'use strict';

/**
 * Tests for Provider-Agnostic Task Recovery and Handoff (src/shared/taskRecovery.ts).
 *
 * Verifies:
 * 1. Failure classification (crashes vs rate limits vs auth errors vs timeouts).
 * 2. Recovery safety evaluation and idempotency protection (blocking unverified side-effects).
 * 3. Recovery checkpoint creation and runaway retry limit protection.
 * 4. Provider-agnostic handoff prompt generation across engines (Claude -> Codex / Gemini).
 * 5. Ledger survivability when persisted on task cards in tasks.json.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const {
  classifyTaskFailure,
  validateRecoverySafety,
  createRecoveryCheckpoint,
  buildProviderHandoffPrompt,
  MAX_RECOVERY_ATTEMPTS
} = loadTs('src/shared/taskRecovery.ts');

const { mergeTaskLedger } = loadTs('src/shared/taskLedger.ts');

// ── Failure Classification ──────────────────────────────────────────────────

test('classifies rate limit / 429 errors as retryable rate_limit', () => {
  const res1 = classifyTaskFailure({ stderr: 'Error 429: Rate limit reached. Try again later.' });
  assert.equal(res1.kind, 'rate_limit');
  assert.equal(res1.retryable, true);

  const res2 = classifyTaskFailure({ hookError: 'Claude quota exceeded for current tier' });
  assert.equal(res2.kind, 'rate_limit');
  assert.equal(res2.retryable, true);
});

test('classifies authentication errors as non-retryable auth_failure', () => {
  const res = classifyTaskFailure({ stderr: '401 Unauthorized: Invalid API key provided' });
  assert.equal(res.kind, 'auth_failure');
  assert.equal(res.retryable, false);
});

test('classifies timeouts as retryable timeout', () => {
  const res = classifyTaskFailure({ stderr: 'connect ETIMEDOUT 104.18.2.1:443' });
  assert.equal(res.kind, 'timeout');
  assert.equal(res.retryable, true);
});

test('classifies command not found / exit 127 as unsupported_tool', () => {
  const res = classifyTaskFailure({ exitCode: 127, stderr: 'codex-cli: command not found' });
  assert.equal(res.kind, 'unsupported_tool');
  assert.equal(res.retryable, false);
});

test('classifies abnormal process termination as retryable process_crash', () => {
  const res = classifyTaskFailure({ exitCode: 1, stderr: 'SIGSEGV or memory dump' });
  assert.equal(res.kind, 'process_crash');
  assert.equal(res.retryable, true);
});

// ── Safety Validation & Idempotency Rules ────────────────────────────────────

test('allows auto-resume for tasks with pure computational milestones or verified side-effects', () => {
  const safeCheckpoint = {
    taskId: 'task-101',
    taskTitle: 'Analyze customer leads',
    originalProvider: 'claude',
    checkpointAt: '2026-10-14T20:00:00.000Z',
    completedSteps: ['Parsed leads.csv', 'Scored lead priorities'],
    remainingWork: 'Draft summary report in leads-report.md',
    outputFiles: ['leads-parsed.json'],
    sideEffects: [],
    failureKind: 'process_crash',
    recoveryAttempts: 1,
    safeToAutoResume: true
  };

  const validation = validateRecoverySafety(safeCheckpoint);
  assert.equal(validation.safe, true);
});

test('BLOCKS auto-resume when unverified external side-effects exist (non-idempotent action)', () => {
  const dangerousCheckpoint = {
    taskId: 'task-102',
    taskTitle: 'Send email campaign',
    originalProvider: 'claude',
    checkpointAt: '2026-10-14T20:00:00.000Z',
    completedSteps: ['Prepared email template'],
    remainingWork: 'Dispatch batch 2',
    outputFiles: [],
    sideEffects: [
      { type: 'email_send', target: 'client@example.com', verified: false }
    ],
    failureKind: 'rate_limit',
    recoveryAttempts: 1,
    safeToAutoResume: false
  };

  const validation = validateRecoverySafety(dangerousCheckpoint);
  assert.equal(validation.safe, false);
  assert.match(validation.reason, /Unverified external side-effects/);
  assert.match(validation.reason, /Human verification required/);
});

test('BLOCKS auto-resume when maximum recovery attempts are exceeded (runaway protection)', () => {
  const runawayCheckpoint = {
    taskId: 'task-103',
    taskTitle: 'Infinite crash loop task',
    originalProvider: 'claude',
    checkpointAt: '2026-10-14T20:00:00.000Z',
    completedSteps: [],
    remainingWork: 'Keep failing',
    outputFiles: [],
    sideEffects: [],
    failureKind: 'process_crash',
    recoveryAttempts: MAX_RECOVERY_ATTEMPTS,
    safeToAutoResume: false
  };

  const validation = validateRecoverySafety(runawayCheckpoint);
  assert.equal(validation.safe, false);
  assert.match(validation.reason, /Exceeded maximum automated recovery attempts/);
});

test('BLOCKS auto-resume when failure is auth_failure', () => {
  const authCheckpoint = {
    taskId: 'task-104',
    taskTitle: 'Sync credentials',
    originalProvider: 'codex',
    checkpointAt: '2026-10-14T20:00:00.000Z',
    completedSteps: [],
    remainingWork: 'Login',
    outputFiles: [],
    sideEffects: [],
    failureKind: 'auth_failure',
    recoveryAttempts: 1,
    safeToAutoResume: false
  };

  const validation = validateRecoverySafety(authCheckpoint);
  assert.equal(validation.safe, false);
  assert.match(validation.reason, /requires configuration changes/);
});

// ── Checkpoint Creation ─────────────────────────────────────────────────────

test('createRecoveryCheckpoint accurately computes failure kind and safety status', () => {
  const cp = createRecoveryCheckpoint({
    taskId: 'task-200',
    taskTitle: 'Generate monthly invoices',
    originalProvider: 'claude',
    completedSteps: ['Calculated billable hours'],
    remainingWork: 'Generate invoice-october.pdf',
    outputFiles: ['hours.json'],
    failureInput: { exitCode: 1, stderr: 'Process terminated unexpectedly' },
    recoveryAttempts: 0
  });

  assert.equal(cp.taskId, 'task-200');
  assert.equal(cp.failureKind, 'process_crash');
  assert.equal(cp.recoveryAttempts, 1);
  assert.equal(cp.safeToAutoResume, true);
  assert.deepEqual(cp.completedSteps, ['Calculated billable hours']);
  assert.deepEqual(cp.outputFiles, ['hours.json']);
});

// ── Provider Handoff Prompt Synthesis ────────────────────────────────────────

test('buildProviderHandoffPrompt outputs provider-agnostic markdown instructions', () => {
  const checkpoint = {
    taskId: 'task-300',
    taskTitle: 'Prepare financial report',
    originalProvider: 'claude',
    checkpointAt: '2026-10-14T20:30:00.000Z',
    completedSteps: ['Extracted Q3 metrics from database', 'Validated profit/loss totals'],
    remainingWork: 'Render chart to reports/q3-summary.png and write concluding paragraph.',
    outputFiles: ['reports/data.json'],
    sideEffects: [
      { type: 'file_write', target: 'reports/data.json', verified: true }
    ],
    failureKind: 'rate_limit',
    recoveryAttempts: 1,
    safeToAutoResume: true
  };

  const prompt = buildProviderHandoffPrompt(checkpoint, 'codex');

  assert.match(prompt, /# TASK RESUMPTION & RECOVERY BRIEF/);
  assert.match(prompt, /Previous worker engine: claude\. Target engine: codex\./);
  assert.match(prompt, /- \[x\] Extracted Q3 metrics from database/);
  assert.match(prompt, /- \[x\] Validated profit\/loss totals/);
  assert.match(prompt, /`reports\/data\.json`/);
  assert.match(prompt, /Render chart to reports\/q3-summary\.png/);
  assert.match(prompt, /Do NOT repeat any verified external side-effects listed above\./);
});

// ── Task Ledger Survivability ───────────────────────────────────────────────

test('recovery checkpoint survives UI task ledger round-trips without loss', () => {
  const checkpoint = {
    taskId: 'task-400',
    taskTitle: 'Refactor auth controller',
    originalProvider: 'claude',
    checkpointAt: '2026-10-14T20:00:00.000Z',
    completedSteps: ['Created backup'],
    remainingWork: 'Migrate to JWT',
    outputFiles: ['backup.ts'],
    sideEffects: [],
    failureKind: 'rate_limit',
    recoveryAttempts: 1,
    safeToAutoResume: true
  };

  const diskCard = {
    id: 'task-400',
    title: 'Refactor auth controller',
    status: 'in_progress',
    recovery: checkpoint
  };

  // UI sends partial update when user moves or re-titles task
  const uiUpdate = [{
    id: 'task-400',
    title: 'Refactor auth controller (updated)',
    status: 'in_progress'
  }];

  const [merged] = mergeTaskLedger([diskCard], uiUpdate);

  assert.equal(merged.title, 'Refactor auth controller (updated)');
  assert.ok(merged.recovery, 'recovery checkpoint must survive partial UI write');
  assert.equal(merged.recovery.taskId, 'task-400');
  assert.equal(merged.recovery.failureKind, 'rate_limit');
  assert.equal(merged.recovery.safeToAutoResume, true);
});
