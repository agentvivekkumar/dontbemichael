'use strict';
/**
 * The owner talks to team members through Michael, except in 1:1
 * (docs/designs/owner-talks-via-michael.md).
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

const { HiveManager } = loadTs('src/main/hive.ts');
const { HookServer, ASK_TOOL_REFUSAL, isTerminalPrompt } = loadTs('src/main/hooks.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

async function office(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-owner-via-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'god', name: 'Michael', provider: 'claude', cwd: home, isGod: true });
  await hive.ensureAgent({ id: 'pam', name: 'Pam', provider: 'claude', cwd: home });
  const server = new HookServer(hive, () => null, () => ({ notifications: false }), undefined, undefined);
  return { hive, server };
}

test("a team member's in-terminal question is refused and pointed at Michael", async (t) => {
  const { server } = await office(t);
  const res = await server.handle({ agent_id: 'pam', session_id: 's', hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tool_input: {} });
  assert.equal(res.hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(res.hookSpecificOutput.permissionDecisionReason, ASK_TOOL_REFUSAL);
  assert.match(ASK_TOOL_REFUSAL, /Michael through your outbox/);
});

test('Michael may still ask the owner in his own session', async (t) => {
  const { server } = await office(t);
  const res = await server.handle({ agent_id: 'god', session_id: 's', hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', tool_input: {} });
  assert.notEqual(res?.hookSpecificOutput?.permissionDecision, 'deny');
});

test('a team member stuck on a terminal prompt is relayed to Michael once, never for idle', async (t) => {
  const { hive, server } = await office(t);
  const prompt = { agent_id: 'pam', session_id: 's', hook_event_name: 'Notification', notification_type: 'permission_prompt', message: 'Claude needs your permission to use Bash' };
  await server.handle(prompt);
  await server.handle(prompt);
  await server.handle({ agent_id: 'pam', session_id: 's', hook_event_name: 'Notification', notification_type: 'idle_prompt', message: 'Claude is waiting for your input' });
  const inbox = hive.inbox('god');
  assert.equal(inbox.length, 1, 'one relay, no duplicate, nothing for idle');
  assert.match(inbox[0].subject, /Pam is waiting on something in their terminal/);
  assert.match(inbox[0].body, /needs your permission to use Bash/);
  assert.match(inbox[0].body, /ASK ME/);
});

test("Michael's own prompts are not relayed to himself", async (t) => {
  const { hive, server } = await office(t);
  await server.handle({ agent_id: 'god', session_id: 's', hook_event_name: 'Notification', notification_type: 'permission_prompt', message: 'needs your permission' });
  assert.equal(hive.inbox('god').length, 0);
});

test('isTerminalPrompt: permission and question dialogs, not idle', () => {
  assert.equal(isTerminalPrompt({ notification_type: 'permission_prompt' }), true);
  assert.equal(isTerminalPrompt({ notification_type: 'elicitation_dialog' }), true);
  assert.equal(isTerminalPrompt({ notification_type: 'idle_prompt' }), false);
  assert.equal(isTerminalPrompt({ message: 'Claude needs your permission to use Write' }), true);
  assert.equal(isTerminalPrompt({ message: 'Claude is waiting for your input' }), false);
});

test("outside 1:1 the owner only watches: keys, paste, drop and IME are dropped, the app's writes are not", () => {
  const pool = read('src/renderer/src/components/terminalPool.ts');
  assert.match(pool, /if \(entry\.inputLocked\) \{[\s\S]{0,300}return false;\s*\}/, 'every key is dropped while locked (copy still works)');
  assert.match(pool, /for \(const type of \['paste', 'drop', 'compositionend', 'beforeinput'\] as const\)/);
  assert.match(pool, /if \(!entry\.inputLocked\) pasteClipboard\(\);/);
  assert.match(pool, /export function setTerminalInputLocked\(ptyId: string, locked: boolean\)/);
  // App-originated writes go straight to writePty, never through the locked paths.
  assert.doesNotMatch(pool.slice(pool.indexOf('export function clearTerminalDraft'), pool.indexOf('function leaseWebglRenderer')), /inputLocked/);
});

test('team member panels lock input and swap the message box for the bar outside 1:1', () => {
  for (const f of ['src/renderer/src/components/AgentDetailPanel.tsx', 'src/renderer/src/components/FullscreenTerminal.tsx']) {
    const src = read(f);
    assert.match(src, /inputLocked=\{!agent\.onHold\}/, f);
    assert.match(src, /\{agent\.onHold \? <MessageQueueComposer agent=\{agent\} \/> : <OwnerViaMichaelBar agent=\{agent\} \/>\}/, f);
  }
  const strip = read('src/renderer/src/components/AgentControlStrip.tsx');
  assert.match(strip, /\{inOneOnOne && <div style=\{\{ display: 'flex', gap: 6 \}\}>/, 'steer only in 1:1');
  assert.match(strip, /agentControl\.blockTools/, 'the brakes stay');
  const bar = read('src/renderer/src/components/OwnerViaMichaelBar.tsx');
  assert.match(bar, /s\.setDraft\(godId,/);
  assert.match(bar, /s\.requestCommandCenterTab\('terminal'\);/);
  assert.match(bar, /hiveSetAgentHold\?\.\(agent\.id, true\)/);
});

test('new strings exist in every language, Michael by godName', () => {
  for (const loc of ['en', 'zh-CN', 'ar']) {
    const d = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).ownerVia;
    for (const k of ['watching', 'aboutPrefix', 'explain', 'stuck', 'message', 'talk', 'holdFailed']) assert.ok(d?.[k], `${loc} ${k}`);
    assert.match(d.message, /\{\{godName\}\}/);
  }
});
