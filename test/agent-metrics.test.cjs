'use strict';

/** The measures report (tools/agent-metrics.cjs): read only, from log.jsonl and
 *  the cost ledger. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildReport, usageByDay } = require('../tools/agent-metrics.cjs');

const now = Date.parse('2026-09-25T12:00:00Z');
const t = (h) => now - h * 3600_000;

test('clearing, compaction and memory are counted from the log', () => {
  const r = buildReport({ now, days: 7, ledger: [], log: [
    { ts: t(1), kind: 'compact', agentId: 'pam', trigger: 'auto' },
    { ts: t(2), kind: 'clear-handoff-asked', agentId: 'pam' },
    { ts: t(2), kind: 'clear', agentId: 'pam', tokensBefore: 80000 },
    { ts: t(3), kind: 'clear-cancelled', agentId: 'jim', reason: 'inbox' },
    { ts: t(4), kind: 'memory-tidy', agentId: 'pam', notes: 3, added: 2, updated: 1, deleted: 0, repeats: 1, procedures: 1, overBudget: false },
    { ts: t(5), kind: 'memory-tidy-abort', agentId: 'jim', reason: 'model-failed', detail: 'no JSON in the response: Failed to authenticate' },
    { ts: t(6), kind: 'memory-read', agentId: 'pam', file: 'agents/pam/memory/procedures/invoices.md' },
    { ts: t(24 * 30), kind: 'clear', agentId: 'old', tokensBefore: 1 }
  ] });
  assert.equal(r.compaction.total, 1);
  assert.deepEqual(r.compaction.byTrigger, { auto: 1 });
  assert.equal(r.clearing.cleared, 1, 'older than the window is left out');
  assert.deepEqual(r.clearing.cancelledBy, { inbox: 1 });
  assert.equal(r.clearing.tokensBeforeClear.median, 80000);
  assert.equal(r.memory.repeatedOwnerCorrections, 1);
  assert.equal(r.memory.proceduresRead, 1);
  assert.match(r.memory.lastAbortDetail, /Failed to authenticate/);
});

test('running totals become per day spend, and a restart counts from zero', () => {
  const row = (h, input, usd, session = 's1') => ({ agent_id: 'pam', session_id: session, ts: t(h), input, output: 0, cache_read: 0, cache_creation: 0, usd });
  const u = usageByDay([row(5, 100, 1), row(4, 300, 2), row(3, 50, 0.5), row(2, 10, 0.1, 's2')], t(48));
  const b = Object.values(u.pam)[0];
  assert.equal(b.input, 100 + 200 + 50 + 10);
  assert.equal(b.usd, 1 + 1 + 0.5 + 0.1);
});

test('the tool never writes to the office', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../tools/agent-metrics.cjs'), 'utf8');
  assert.doesNotMatch(src, /writeFileSync|appendFileSync|rmSync|renameSync|unlinkSync/);
});

test('compaction is logged when it starts', () => {
  const hooks = fs.readFileSync(path.resolve(__dirname, '../src/main/hooks.ts'), 'utf8');
  assert.match(hooks, /this\.hive\.appendLog\(\{ kind: 'compact', agentId, trigger:/);
});
