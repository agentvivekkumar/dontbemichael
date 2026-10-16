'use strict';

/**
 * QuickBooks "Changes need my OK" (issue 320): a third level under Capabilities.
 * A change is refused with a request id and put up on Ask me; on the owner's yes
 * the same call, with the same input, runs once. A grant is for one tool and a
 * hash of its input, and it lapses.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron, filename: electron, loaded: true,
  exports: { Notification: class { show() {} static isSupported() { return false; } } }
};

const { quickbooksCapability, quickbooksAccess, quickbooksAccessToSave, quickbooksLevel, quickbooksCapabilityOf, quickbooksCanonicalInput, QUICKBOOKS_GRANT_TTL_MS, QUICKBOOKS_WAIT_TTL_MS } = loadTs('src/shared/quickbooks.ts');
const { QuickBooksApprovals, WAITING_PER_AGENT_MAX } = loadTs('src/main/quickbooksApprovals.ts');
const { CircuitBreaker } = loadTs('src/main/breaker.ts');
const { HiveManager } = loadTs('src/main/hive.ts');
const { HookServer } = loadTs('src/main/hooks.ts');

const Q = 'mcp__claude_ai_Intuit_QuickBooks__';
const WRITE = `${Q}qbo_sales_create_invoice`;
const OK_CAP = { enabled: true, changes: false, approval: true };

function store(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-qba-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const clock = { now: 1_000_000 };
  let changes = 0;
  const approvals = new QuickBooksApprovals({ path: path.join(dir, 'qba.json'), changed: () => { changes += 1; }, now: () => clock.now });
  return { approvals, clock, dir, changes: () => changes };
}

test('the level is saved and read back, and the owner\'s older choices keep their meaning', () => {
  assert.equal(quickbooksLevel(quickbooksCapabilityOf('read')), 'read');
  assert.equal(quickbooksLevel(quickbooksCapabilityOf('approval')), 'approval');
  assert.equal(quickbooksLevel(quickbooksCapabilityOf('changes')), 'changes');
  assert.deepEqual(quickbooksCapability({ enabled: true, changes: true }, false), { enabled: true, changes: true }, 'an older record');
  assert.deepEqual(quickbooksCapability(OK_CAP, false), OK_CAP);
  assert.deepEqual(quickbooksCapability({ enabled: true, changes: true, approval: true }, false), OK_CAP, 'the stricter level wins');
  assert.deepEqual(quickbooksCapability({ enabled: false, changes: false, approval: true }, false), { enabled: false, changes: false }, 'it never outlives off');
  const save = quickbooksAccessToSave('pam', OK_CAP, () => true);
  assert.deepEqual(save, OK_CAP);
  assert.deepEqual(quickbooksAccessToSave('pam', { enabled: true, changes: true, approval: true }, () => true), OK_CAP);
});

test('under Changes need my OK, reads pass and a change is marked as waiting on the owner', () => {
  assert.deepEqual(quickbooksAccess(true, OK_CAP, `${Q}qbo_sales_get_invoices`), { ok: true });
  const w = quickbooksAccess(true, OK_CAP, WRITE);
  assert.equal(w.ok, false);
  assert.equal(w.approval, true);
  assert.equal(quickbooksAccess(true, OK_CAP, `${Q}qbo_unknown_tool`).approval, true, 'an unknown tool is a change');
  assert.equal(quickbooksAccess(true, { enabled: true, changes: false }, WRITE).approval, undefined, 'Read only is refused outright');
  assert.deepEqual(quickbooksAccess(true, { enabled: true, changes: true }, WRITE), { ok: true });
  assert.equal(quickbooksAccess(false, OK_CAP, WRITE).approval, undefined, 'the Settings switch still wins');
});

test('a grant works once', (t) => {
  const { approvals } = store(t);
  const input = { customer: 'Acme', amount: 40 };
  const first = approvals.gate('pam', WRITE, input);
  assert.equal(first.kind, 'waiting');
  assert.equal(approvals.gate('pam', WRITE, input).id, first.id, 'asking again does not file a second request');
  assert.equal(approvals.waiting().length, 1);
  assert.deepEqual(approvals.decide(first.id, 'approve'), { ok: true });
  assert.equal(approvals.waiting().length, 0);
  assert.equal(approvals.gate('pam', WRITE, input).kind, 'granted');
  assert.equal(approvals.gate('pam', WRITE, input).kind, 'waiting', 'the same call a second time needs a new OK');
  assert.deepEqual(approvals.decide(first.id, 'approve'), { ok: false, error: 'not waiting' }, 'an answer is final');
});

test('a call whose input differs from what was approved is refused', (t) => {
  const { approvals } = store(t);
  const a = approvals.gate('pam', WRITE, { customer: 'Acme', amount: 40 });
  approvals.decide(a.id, 'approve');
  assert.equal(approvals.gate('pam', WRITE, { customer: 'Acme', amount: 4000 }).kind, 'waiting', 'another amount');
  assert.equal(approvals.gate('pam', `${Q}qbo_sales_delete_invoice`, { customer: 'Acme', amount: 40 }).kind, 'waiting', 'another tool');
  assert.equal(approvals.gate('kelly', WRITE, { customer: 'Acme', amount: 40 }).kind, 'waiting', 'another agent');
  assert.equal(approvals.gate('pam', WRITE, { amount: 40, customer: 'Acme' }).kind, 'granted', 'key order does not matter');
  assert.equal(quickbooksCanonicalInput({ b: { y: 1, x: 2 }, a: [1, { d: 1, c: 2 }] }), quickbooksCanonicalInput({ a: [1, { c: 2, d: 1 }], b: { x: 2, y: 1 } }));
});

test('a grant expires, and so does a request nobody answered', (t) => {
  const { approvals, clock } = store(t);
  const a = approvals.gate('pam', WRITE, { n: 1 });
  approvals.decide(a.id, 'approve');
  clock.now += QUICKBOOKS_GRANT_TTL_MS + 1;
  assert.equal(approvals.gate('pam', WRITE, { n: 1 }).kind, 'waiting', 'the lapsed grant does not run');
  clock.now += QUICKBOOKS_WAIT_TTL_MS + 1;
  assert.equal(approvals.waiting().length, 0, 'a request left waiting a day is dropped');
});

test('a decline is told to the agent, and a flood of requests is held at a cap', (t) => {
  const { approvals } = store(t);
  const a = approvals.gate('pam', WRITE, { n: 1 });
  approvals.decide(a.id, 'decline');
  assert.deepEqual(approvals.gate('pam', WRITE, { n: 1 }), { kind: 'declined', id: a.id });
  for (let i = 0; i < WAITING_PER_AGENT_MAX; i++) approvals.gate('kelly', WRITE, { n: i });
  assert.equal(approvals.gate('kelly', WRITE, { n: 'one more' }).kind, 'full');
  assert.equal(approvals.revoke('kelly'), WAITING_PER_AGENT_MAX);
  assert.equal(approvals.waiting().filter((r) => r.agentId === 'kelly').length, 0);
});

test('the requests are kept in the app\'s file and read back after a restart', (t) => {
  const { approvals, dir, clock } = store(t);
  const a = approvals.gate('pam', WRITE, { customer: 'Acme' });
  const again = new QuickBooksApprovals({ path: path.join(dir, 'qba.json'), changed: () => {}, now: () => clock.now });
  assert.equal(again.waiting()[0].id, a.id);
  assert.equal(again.waiting()[0].title, 'Create invoice');
  assert.deepEqual(again.waiting()[0].lines, ['customer: Acme']);
});

test('a refusal waiting for the owner does not count toward the error storm', () => {
  const breaker = new CircuitBreaker(() => ({ enabled: true, hardStop: false, repeatedToolLimit: 8, errorStormLimit: 5, tokenVelocityPerMin: 60000 }));
  for (let i = 0; i < 4; i++) breaker.recordError('pam');
  breaker.recordApprovalWait('pam');
  breaker.recordError('pam');
  assert.equal(breaker.get('pam').errorCount, 1);
});

async function floor(t, cfg) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-qbh-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'pam', name: 'pam', provider: 'claude', cwd: home });
  const approvals = new QuickBooksApprovals({ path: path.join(home, 'qba.json'), changed: () => {} });
  const breaker = new CircuitBreaker(() => ({ enabled: true, hardStop: false, repeatedToolLimit: 8, errorStormLimit: 5, tokenVelocityPerMin: 60000 }));
  const server = new HookServer(
    hive, () => ({ send: () => {} }), () => ({ harnessHome: home, ...cfg }),
    undefined, breaker, undefined, undefined, undefined, undefined,
    () => false, undefined, undefined, approvals
  );
  const raw = (tool_name, tool_input) => server.handle({ agent_id: 'pam', session_id: 's1', hook_event_name: 'PreToolUse', tool_name, tool_input, cwd: home });
  return { raw, approvals, breaker };
}

const denied = (r) => r && r.hookSpecificOutput && r.hookSpecificOutput.permissionDecision === 'deny';
const reason = (r) => r.hookSpecificOutput.permissionDecisionReason;
const cfgOk = { quickbooksClaude: true, agentCapabilities: { pam: { quickbooks: OK_CAP } } };

test('the hook refuses a change with a request id, and lets the approved call through once', async (t) => {
  const f = await floor(t, cfgOk);
  const input = { customer: 'Acme', amount: 40 };
  assert.ok(!denied(await f.raw(`${Q}qbo_sales_get_invoices`, {})), 'reads need nothing');
  const first = await f.raw(WRITE, input);
  assert.ok(denied(first));
  const id = f.approvals.waiting()[0].id;
  assert.match(reason(first), new RegExp(id));
  assert.match(reason(first), /same call again/);
  assert.ok(denied(await f.raw(WRITE, input)), 'still waiting');
  assert.equal(f.approvals.waiting().length, 1);
  f.approvals.decide(id, 'approve');
  assert.ok(denied(await f.raw(WRITE, { customer: 'Acme', amount: 41 })), 'a different input is refused');
  assert.ok(!denied(await f.raw(WRITE, input)), 'the approved call runs');
  assert.ok(denied(await f.raw(WRITE, input)), 'and only once');
});

test('the hook tells the agent about a decline, and Read only never files a request', async (t) => {
  const f = await floor(t, cfgOk);
  await f.raw(WRITE, { n: 1 });
  f.approvals.decide(f.approvals.waiting()[0].id, 'decline');
  assert.match(reason(await f.raw(WRITE, { n: 1 })), /declined/);
  const ro = await floor(t, { quickbooksClaude: true, agentCapabilities: { pam: { quickbooks: { enabled: true, changes: false } } } });
  assert.match(reason(await ro.raw(WRITE, { n: 1 })), /Read only/);
  assert.equal(ro.approvals.waiting().length, 0);
});

test('the hook\'s wait for the owner clears the agent\'s error count', async (t) => {
  const f = await floor(t, cfgOk);
  for (let i = 0; i < 3; i++) f.breaker.recordError('pam');
  await f.raw(WRITE, { n: 1 });
  assert.equal(f.breaker.get('pam').errorCount, 0);
});

test('Capabilities offers the third level, and Ask me shows the request', () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const cap = read('src/renderer/src/components/CapabilitiesTab.tsx');
  assert.match(cap, /booksNeedsOk/);
  assert.match(read('src/renderer/src/components/AskMeTab.tsx'), /QuickBooksApprovalCards/);
  const en = JSON.parse(read('src/renderer/src/i18n/locales/en.json'));
  for (const k of ['booksNeedsOk', 'booksNeedsOkDesc']) assert.ok(en.capabilities[k], k);
  for (const k of ['booksTitle', 'booksDecline', 'booksNote', 'booksFailed']) assert.ok(en.askMe[k], k);
});
