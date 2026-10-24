'use strict';

/**
 * One set of checks run against every engine an office member can run on
 * (issue #443), with a stand-in CLI per engine (test/fake-engines.cjs) instead
 * of the real one, so nothing is paid for and nothing needs an account.
 *
 * Each engine is spawned through HiveManager.ensureAgent exactly as the app
 * does, its stand-in finds the hooks the app installed where the real CLI
 * looks for them, and every hook runs end to end into a real HookServer on
 * the hive socket. A member on any engine must:
 *  - take its standing goal when a session starts;
 *  - report a tool call and the end of its turn as itself;
 *  - have a tool call refused, in its own engine's answer, when it is paused;
 *  - never be heard without its own per start secret (issue #61).
 *
 * The app's office folder and business folder both have a space in their
 * names, as real ones often do. The engines are those with a hook bridge the
 * issue names: Claude Code, Codex and Gemini CLI. Mac and Linux only for now
 * (see fake-engines.cjs).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const { posixOnly } = require('./platform.cjs');
const { fakeEngine, FAKE_ENGINES } = require('./fake-engines.cjs');

const electron = require.resolve('electron');
require.cache[electron] ??= {
  id: electron, filename: electron, loaded: true,
  exports: { Notification: class { show() {} static isSupported() { return false; } } }
};

const { HiveManager } = loadTs('src/main/hive.ts');
const { HookServer } = loadTs('src/main/hooks.ts');
const { ControlRegistry } = loadTs('src/main/control.ts');

// Codex links the owner's login from ~/.codex into the member's own home: the
// test must never reach the real one, so home points into a temp tree.
const FAKE_HOME = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'md-conf-home-')));
process.env.HOME = FAKE_HOME;
process.env.USERPROFILE = FAKE_HOME;
process.on('exit', () => fs.rmSync(FAKE_HOME, { recursive: true, force: true }));

const AGENT = 'pam-1';
const GOAL = 'Keep the books tidy and answer supplier mail first.';

/** One office, one member on `engine`, a hook server listening, and the fake CLI. */
async function office(t, engine) {
  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'md-conf-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const home = path.join(base, 'Harness Home');
  const business = path.join(base, 'Pho Bakery');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(business, { recursive: true });

  const hive = new HiveManager(() => home);
  const injection = await hive.ensureAgent(
    { id: AGENT, name: 'Pam', provider: engine, cwd: business, isGod: false },
    { businessFolder: business }
  );
  const events = [];
  const window = { send: (channel, payload) => { if (channel === 'hive:hookEvent') events.push(payload); }, isDestroyed: () => false };
  const control = new ControlRegistry();
  const server = new HookServer(hive, () => window, () => ({ harnessHome: home }), control, undefined, (id) => (id === AGENT ? GOAL : null));
  server.start();
  t.after(() => server.stop());
  return { cli: fakeEngine(engine, injection, { cwd: business }), events, control, injection };
}

const heard = (events, event) => events.filter((e) => e.event === event);

test('the stand-ins cover the engines with a hook bridge the issue names', () => {
  assert.deepEqual(FAKE_ENGINES, ['claude', 'codex', 'gemini']);
});

for (const engine of FAKE_ENGINES) {
  test(`${engine}: the app installs a hook for every step of a turn, where the CLI reads it`, posixOnly('the stand-in CLIs run hooks with sh'), async (t) => {
    const { cli } = await office(t, engine);
    for (const step of ['start', 'prompt', 'preTool', 'postTool', 'stop']) {
      const groups = cli.hooks[cli.eventFor(step)] ?? [];
      assert.ok(groups.some((g) => (g.hooks ?? []).some((h) => h.type === 'command' && h.command)), `${engine}: no hook for ${cli.eventFor(step)}`);
    }
  });

  test(`${engine}: a new session takes the member's standing goal`, posixOnly('the stand-in CLIs run hooks with sh'), async (t) => {
    const { cli, events } = await office(t, engine);
    const answers = await cli.step('start');
    assert.ok(answers.some((a) => typeof a.context === 'string' && a.context.includes(GOAL)),
      `${engine}: the goal did not come back to the CLI at session start`);
    assert.deepEqual(heard(events, 'SessionStart').map((e) => e.agentId), [AGENT]);
  });

  test(`${engine}: a tool call and the end of the turn are reported as the member`, posixOnly('the stand-in CLIs run hooks with sh'), async (t) => {
    const { cli, events } = await office(t, engine);
    await cli.step('start');
    await cli.step('prompt', { prompt: 'Check the supplier invoices.' });
    const pre = await cli.step('preTool', { input: { command: 'ls' } });
    assert.ok(pre.length && pre.every((a) => !a.denied), `${engine}: an ordinary tool call was refused`);
    await cli.step('postTool', { input: { command: 'ls' } });
    await cli.step('stop');
    for (const event of ['PreToolUse', 'PostToolUse', 'Stop']) {
      assert.deepEqual(heard(events, event).map((e) => e.agentId), [AGENT], `${engine}: ${event}`);
    }
    assert.equal(heard(events, 'PreToolUse')[0].tool, cli.shellTool);
  });

  test(`${engine}: a paused member's tool call is refused in the engine's own answer`, posixOnly('the stand-in CLIs run hooks with sh'), async (t) => {
    const { cli, control } = await office(t, engine);
    control.pause(AGENT, true);
    const answers = await cli.step('preTool', { input: { command: 'rm -rf invoices' } });
    assert.ok(answers.some((a) => a.denied && /Paused/.test(a.reason ?? '')), `${engine}: the refusal did not reach the CLI as a refusal`);
    control.pause(AGENT, false);
    assert.ok((await cli.step('preTool', { input: { command: 'ls' } })).every((a) => !a.denied), `${engine}: resuming did not lift it`);
  });

  test(`${engine}: a hook without the member's own secret is heard by nobody`, posixOnly('the stand-in CLIs run hooks with sh'), async (t) => {
    const { cli, events } = await office(t, engine);
    await cli.step('stop', { env: { HIVE_HOOK_SEAL: undefined } });
    await cli.step('stop', { env: { HIVE_HOOK_SEAL: 'from-an-earlier-start' } });
    assert.deepEqual(heard(events, 'Stop'), [], `${engine}: a frame with no secret or an old one reached the app`);
    await cli.step('stop');
    assert.deepEqual(heard(events, 'Stop').map((e) => e.agentId), [AGENT], 'with its own secret it is heard');
  });
}
