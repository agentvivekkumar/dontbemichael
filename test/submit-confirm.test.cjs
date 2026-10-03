'use strict';

/**
 * 2026-10-03: Oscar sat on closing time. Three nudges reached his session as
 * one prompt: a slow terminal (just resumed on a 174k conversation) read each
 * nudge and its Enter as one burst, so the first Enter became a line break and
 * the second vanished. Typing now waits for Claude Code's UserPromptSubmit and
 * presses Enter again when it does not come.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { confirmSubmit, PromptSubmits } = loadTs('src/shared/submitConfirm.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
const instant = () => Promise.resolve();

test('an Enter the terminal swallowed is pressed again until the agent accepts the prompt', async () => {
  // Value: protects=a typed nudge or message is always submitted; fails_when=a missing UserPromptSubmit is not retried, or retries run after acceptance; why_new=regression of the 2026-10-03 Oscar hang; seam=fake clock
  let accepted = false; let enters = 0;
  const ok = await confirmSubmit({ accepted: () => accepted, pressEnter: () => { enters++; if (enters === 1) accepted = true; }, confirmMs: 300, sleep: instant });
  assert.equal(ok, true);
  assert.equal(enters, 1, 'one extra Enter, then it took');
  enters = 0;
  assert.equal(await confirmSubmit({ accepted: () => true, pressEnter: () => { enters++; }, confirmMs: 300, sleep: instant }), true);
  assert.equal(enters, 0, 'accepted at once: no extra Enter');
  enters = 0;
  assert.equal(await confirmSubmit({ accepted: () => false, pressEnter: () => { enters++; }, confirmMs: 300, retries: 2, sleep: instant }), false);
  assert.equal(enters, 2, 'gives up after the retries');
});

test('acceptance counts only from the moment the text was typed', () => {
  // Value: protects=an older prompt never confirms a new one; fails_when=since() ignores the typed-at time; why_new=new; seam=none
  const p = new PromptSubmits();
  p.note('oscar', 1000);
  assert.equal(p.since('oscar', 1500), false);
  p.note('oscar', 2000);
  assert.equal(p.since('oscar', 1500), true);
  assert.equal(p.since('pam', 0), false);
});

test('both typing paths wait for the agent to accept, Claude agents only', () => {
  // Value: protects=the renderer queue and the main wake watchdog both confirm; fails_when=either path goes back to fire and forget; why_new=new; seam=source pins
  const hive = read('src/renderer/src/hooks/useHive.ts');
  assert.match(hive, /if \(e\.event === 'UserPromptSubmit'\) promptSubmits\.note\(e\.agentId\);/);
  assert.match(hive, /const agentId = isClaudeProvider\(provider\) && !text\.trimStart\(\)\.startsWith\('\/'\) \? useStore\.getState\(\)\.agents\.find\(\(a\) => a\.ptyId === ptyId\)\?\.id : undefined;/, 'slash commands fire no prompt hook, so they are not confirmed');
  assert.match(hive, /stillSafe: \(\) => isTerminalAutomationSafe\(ptyId\) && !hasTerminalDraft\(ptyId\)/, 'an extra Enter never lands on the owner typing or an open menu');
  const main = read('src/main/index.ts');
  assert.match(main, /if \(agentId && event === 'UserPromptSubmit'\) promptSubmits\.note\(agentId\);/);
  assert.match(main, /confirmSubmit\(\{\s*accepted: \(\) => promptSubmits\.since\(agentId, typedAt\),/);
});
