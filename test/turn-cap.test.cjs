'use strict';

/**
 * Max turns per run (Settings → Agents) did nothing: the app passed
 * `--max-turns`, which Claude Code honours in print mode only, to agents that
 * run as interactive terminals. Checked with Claude Code 2.1.304: an
 * interactive `--max-turns 1` agent ran three tool calls and finished.
 *
 * The cap is now counted at the hook boundary (turnCap.ts). This pins the
 * count, the wiring in HookServer, and that the dead flag is gone.
 */

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
  exports: {
    Notification: class {
      show() {}
      static isSupported() { return false; }
    }
  }
};

const { TurnCap } = loadTs('src/main/turnCap.ts');
const { HiveManager } = loadTs('src/main/hive.ts');
const { HookServer } = loadTs('src/main/hooks.ts');

test('no cap when Max turns is unset, zero or not a number', () => {
  const cap = new TurnCap();
  for (const max of [undefined, 0, -3, NaN, '5']) {
    for (let i = 0; i < 50; i++) assert.equal(cap.toolCall('oscar', max).stop, false, String(max));
  }
});

test('the call after the cap stops the run, and a new run starts the count again', () => {
  const cap = new TurnCap();
  assert.equal(cap.toolCall('oscar', 2).stop, false);
  assert.equal(cap.toolCall('oscar', 2).stop, false);
  const d = cap.toolCall('oscar', 2);
  assert.equal(d.stop, true);
  assert.match(d.reason, /limit of 2 turns per run/);
  assert.equal(cap.toolCall('oscar', 2).stop, true, 'stays stopped until the next prompt');
  cap.newRun('oscar');
  assert.equal(cap.toolCall('oscar', 2).stop, false);
});

test('each agent has its own count', () => {
  const cap = new TurnCap();
  assert.equal(cap.toolCall('oscar', 1).stop, false);
  assert.equal(cap.toolCall('oscar', 1).stop, true);
  assert.equal(cap.toolCall('pam', 1).stop, false);
});

test('the reason the owner reads has no dashes, and says "1 turn" for one', () => {
  const cap = new TurnCap();
  cap.toolCall('oscar', 1);
  const reason = cap.toolCall('oscar', 1).reason;
  assert.doesNotMatch(reason, /[-‐-―−]/);
  assert.match(reason, /limit of 1 turn per run/);
});

async function floor(t, config) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-turn-cap-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'oscar', name: 'Oscar', provider: 'claude', cwd: home });
  const server = new HookServer(hive, () => null, () => config, undefined, undefined);
  const send = (hook_event_name, over = {}) => server.handle({ agent_id: 'oscar', session_id: 's1', hook_event_name, cwd: home, ...over });
  const tool = (over) => send('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'echo hi' }, ...over });
  return { send, tool };
}

const stopped = (r) => !!r && r.continue === false;
const denied = (r) => !!r && r.hookSpecificOutput && r.hookSpecificOutput.permissionDecision === 'deny';

test('through the hook, the call past the cap is refused AND the run stops', async (t) => {
  const f = await floor(t, { maxTurns: 2 });
  await f.send('UserPromptSubmit');
  assert.ok(!stopped(await f.tool()));
  assert.ok(!stopped(await f.tool()));
  const r = await f.tool();
  // continue:false alone still runs this one call (checked live); the deny blocks it.
  assert.ok(stopped(r), 'the run stops');
  assert.ok(denied(r), 'and the call that went past the cap does not run');
  assert.equal(r.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.match(r.stopReason, /limit of 2 turns per run/);
});

test('a new prompt or a fresh session gives the agent a new run', async (t) => {
  const f = await floor(t, { maxTurns: 1 });
  await f.tool();
  assert.ok(stopped(await f.tool()));
  await f.send('UserPromptSubmit');
  assert.ok(!stopped(await f.tool()), 'a prompt resets the count');
  assert.ok(stopped(await f.tool()));
  await f.send('SessionStart', { source: 'startup' });
  assert.ok(!stopped(await f.tool()), 'a fresh session resets it too');
});

test('a subagent\'s tool calls are its own run, and its prompt does not reset the agent', async (t) => {
  const f = await floor(t, { maxTurns: 1 });
  for (let i = 0; i < 5; i++) assert.ok(!stopped(await f.tool({ subagent_id: 'sub1' })));
  assert.ok(!stopped(await f.tool()), 'the subagent did not use the agent\'s turns');
  assert.ok(stopped(await f.tool()));
  await f.send('UserPromptSubmit', { subagent_id: 'sub1' });
  assert.ok(stopped(await f.tool()), 'still stopped');
});

test('with no cap set, the hook never stops a run', async (t) => {
  const f = await floor(t, {});
  for (let i = 0; i < 30; i++) assert.ok(!stopped(await f.tool()));
});

test('an unreadable config skips only the cap: the folder walls still refuse', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-turn-cap-throw-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'pam', name: 'Pam', provider: 'claude', cwd: home });
  const server = new HookServer(hive, () => null, () => { throw new Error('config unreadable'); });
  const r = server.handle({ agent_id: 'pam', hook_event_name: 'PreToolUse', cwd: home, tool_name: 'Read', tool_input: { file_path: path.join(home, 'a.md') } });
  assert.ok(denied(r), 'the folder check still fails closed');
  assert.notEqual(r.continue, false, 'and it is not reported as the turn cap');
});

test('spawn no longer passes --max-turns, which interactive Claude Code ignores', () => {
  const main = fs.readFileSync(path.resolve(__dirname, '../src/main/index.ts'), 'utf8');
  assert.doesNotMatch(main, /args\.push\('--max-turns'/);
  assert.doesNotMatch(main, /cfg\.maxTurns/);
});
