'use strict';

// A refused tool call sends no detail line (TODOS: "A refused tool call still
// shows its detail"). The row names the step the owner is waiting on, and a
// step the hook turned away never ran.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron,
  filename: electron,
  loaded: true,
  exports: { Notification: class { show() {} static isSupported() { return false; } } }
};

const { HiveManager } = loadTs('src/main/hive.ts');
const { HookServer } = loadTs('src/main/hooks.ts');

async function server(t, control) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-hooks-detail-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'pam', name: 'Pam', provider: 'claude', cwd: path.join(home, 'work') });
  const sent = [];
  const wc = { send: (channel, payload) => sent.push({ channel, payload }) };
  const hooks = new HookServer(hive, () => wc, () => ({ notifications: false }), control);
  const bash = () => hooks.handle({
    agent_id: 'pam',
    session_id: 's1',
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_use_id: 'toolu_1',
    tool_input: { command: 'npm test', description: 'Run the tests' }
  });
  const events = () => sent.filter((s) => s.channel === 'hive:hookEvent').map((s) => s.payload);
  return { bash, events };
}

test('a tool call that goes ahead sends its detail line', async (t) => {
  // Value: protects=the closing-time row still names the running step; fails_when=detail is dropped for every call; why_new=guards the refused-call change; seam=none
  const { bash, events } = await server(t, { toolDecision: () => ({ deny: false }), shouldHalt: () => false });
  bash();
  assert.equal(events().at(-1).detail, 'Run the tests');
});

test('a tool call the hook refuses sends no detail line', async (t) => {
  // Value: protects=the row never names a step that did not run; fails_when=a refused PreToolUse still carries detail; why_new=TODOS refused tool call; seam=none
  const { bash, events } = await server(t, { toolDecision: () => ({ deny: true, reason: 'Paused.' }), shouldHalt: () => false });
  const answer = bash();
  assert.equal(answer.hookSpecificOutput.permissionDecision, 'deny');
  const e = events().at(-1);
  assert.equal(e.event, 'PreToolUse');
  assert.equal(e.detail, undefined);
});

test('a tool call stopped by a halt sends no detail line', async (t) => {
  // Value: protects=a halted agent's row does not name the step it was stopped before; fails_when=the halt path emits detail; why_new=TODOS refused tool call; seam=none
  const { bash, events } = await server(t, { toolDecision: () => ({ deny: false }), shouldHalt: () => true });
  bash();
  assert.equal(events().at(-1).detail, undefined);
});
