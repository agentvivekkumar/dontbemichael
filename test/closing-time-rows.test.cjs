'use strict';

/**
 * What each closing-time row says (src/renderer/src/components/closingTimeRows.ts),
 * tested without rendering React (review R4, owner 2026-09-29).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { describeRow, actionMessage, headerLine } = loadTs('src/renderer/src/components/closingTimeRows.ts');
const { CLOSING_TIME_REMIND_MS } = loadTs('src/shared/closingTime.ts');

const AT_PROMPT = 'waiting at a prompt';
const t = (key, opts) => (key === 'closingTime.minutes' ? `${opts.count} min` : key.replace('closingTime.', ''));
const caption = (action) => (action === 'idle' ? 'nothing to do' : action);
const NOW = 10 * 60_000;
const row = (a) => describeRow(a, NOW, t, AT_PROMPT, caption);

test('each row says what the agent is doing and for how long', () => {
  // Value: protects=the owner can tell a long process from a stuck agent; fails_when=state, detail or minutes rules change; why_new=the logic was only source-checked; seam=none
  const cases = [
    [undefined, { state: 'stillWorking' }],
    [{ status: 'working', action: 'using Bash', actionDetail: 'Run the full test suite', actionAt: NOW - 7 * 60_000 }, { state: 'stillWorking', line: 'Run the full test suite · 7 min'}],
    [{ status: 'working', action: 'using Read', actionAt: NOW - 59_000 }, { state: 'stillWorking', line: 'using Read'}],
    [{ status: 'working', action: 'using Read', actionAt: NOW - 60_000 }, { state: 'stillWorking', line: 'using Read · 1 min'}],
    [{ status: 'working', action: 'thinking' }, { state: 'stillWorking', line: 'thinking'}],
    [{ status: 'waiting', action: AT_PROMPT, actionAt: NOW - 3 * 60_000 }, { state: 'atPrompt', line: '3 min'}],
    [{ status: 'idle', action: 'idle', actionDetail: 'stale', actionAt: NOW - 5 * 60_000 }, { state: 'nothingToDo', line: '5 min'}],
    [{ status: 'working', action: 'using Bash', recentAssistantText: 'Running tests' }, { state: 'stillWorking', line: 'using Bash' }]
  ];
  for (const [agent, want] of cases) assert.deepEqual(row(agent), want, JSON.stringify(agent));
});

test('a refused or failed action shows a message; one that went through shows none', () => {
  // Value: protects=a refused Remind or Close without them is never taken as success; fails_when=actionMessage ignores ok:false; why_new=the dialog only handled a throw; seam=none
  assert.equal(actionMessage({ ok: true }, 'fallback'), undefined);
  assert.equal(actionMessage({ ok: false, error: 'Nobody to close without.' }, 'fallback'), 'Nobody to close without.');
  assert.equal(actionMessage({ ok: false }, 'fallback'), 'fallback');
  assert.equal(actionMessage(undefined, 'fallback'), 'fallback', 'a throw is a failure too');
});

test('the Remind limit is one shared value for main and the dialog', () => {
  // Value: protects="reminded" shows exactly as long as main refuses a second reminder; fails_when=one side hard-codes its own number; why_new=they were linked only by a comment; seam=none
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  assert.equal(CLOSING_TIME_REMIND_MS, 30_000);
  assert.match(read('src/main/closingTime.ts'), /now - at < CLOSING_TIME_REMIND_MS\) return/);
  assert.match(read('src/renderer/src/components/ClosingTimeBar.tsx'), /< CLOSING_TIME_REMIND_MS/);
});

test('the counter strip moves on to the orchestrator, and says when his terminal ended', () => {
  // Value: protects=the header agrees with the rows below it; fails_when=headerLine ignores waiting or godLive; why_new=replaces source regexes (review run 2); seam=none
  // The real English strings, interpolated the way i18next does.
  const en = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/renderer/src/i18n/locales/en.json'), 'utf8'));
  const tt = (key, opts = {}) => key.split('.').reduce((o, k) => o[k], en).replace(/\{\{(\w+)\}\}/g, (_, k) => String(opts[k]));
  const h = (c) => headerLine(c, tt);
  assert.equal(h({ acked: 1, total: 3, waiting: ['a', 'b'] }), '1 / 3 workers confirmed');
  assert.equal(h({ acked: 2, total: 3, waiting: [] }), '2 / 3 workers confirmed. Waiting for the orchestrator', 'one closed without');
  assert.equal(h({ acked: 3, total: 3 }), '3 / 3 workers confirmed. Waiting for the orchestrator');
  assert.equal(h({ acked: 1, total: 3, waiting: ['a'], godLive: false }), "1 / 3 workers confirmed. The orchestrator's terminal ended");
  assert.equal(h({ acked: 0, total: 0 }), 'No workers on the floor. Waiting for the orchestrator');
  assert.equal(h({ acked: 0, total: 0, godLive: false }), "No workers on the floor. The orchestrator's terminal ended");
});

test('the action line is clipped and wraps anywhere: marks stay in their row, long paths keep their end (owner, 2026-10-10)', () => {
  // Value: protects=stacked combining marks never draw over other rows, and a long file path is never cut off; fails_when=overflow hidden or overflowWrap anywhere is dropped from detailStyle; why_new=PR 86 clipped paths without wrapping; seam=none
  const bar = fs.readFileSync(path.resolve(__dirname, '../src/renderer/src/components/ClosingTimeBar.tsx'), 'utf8');
  assert.match(bar, /const detailStyle: CSSProperties = \{[^}]*overflow: 'hidden'[^}]*overflowWrap: 'anywhere'[^}]*\};/);
  assert.match(bar, /\{d\.line && <div style=\{detailStyle\}>\{d\.line\}<\/div>\}/, 'each worker row');
});
