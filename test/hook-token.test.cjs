'use strict';
// Issue #61: a hook frame is taken as the agent its token was given to, never
// as the agent_id it names. One agent cannot post a Stop, a session id or cost
// rows as another.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const loadTs = require('./load-ts.cjs');

const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron, filename: electron, loaded: true,
  exports: { Notification: class { show() {} static isSupported() { return false; } } }
};
const { HiveManager } = loadTs('src/main/hive.ts');
const { HookServer } = loadTs('src/main/hooks.ts');

const unixOnly = { skip: process.platform === 'win32' ? 'unix socket paths' : false };

async function office(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md hook token-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  const pam = (await hive.ensureAgent({ id: 'pam', name: 'Pam', provider: 'claude', cwd: home })).env;
  const oscar = (await hive.ensureAgent({ id: 'oscar', name: 'Oscar', provider: 'claude', cwd: home })).env;
  const logs = [];
  const appendLog = hive.appendLog.bind(hive);
  hive.appendLog = (e) => { logs.push(e); appendLog(e); };
  const server = new HookServer(hive, () => null, () => ({ harnessHome: home }));
  const routed = [];
  server.handle = (p) => { routed.push(p.agent_id); return {}; };
  server.start();
  t.after(() => server.stop());
  if (!server.server.listening) await new Promise((r) => server.server.once('listening', r));
  const send = (payload) => new Promise((resolve, reject) => {
    let out = '';
    const c = net.createConnection(hive.sockPath(), () => c.write(JSON.stringify(payload) + '\n'));
    c.setEncoding('utf8');
    c.on('data', (d) => { out += d; });
    c.on('end', () => resolve(JSON.parse(out || '{}')));
    c.on('error', reject);
  });
  return { home, hive, pam, oscar, logs, routed, send };
}

test('each start gets its own token, and a respawn replaces the old one', unixOnly, async (t) => {
  const { hive, pam, oscar } = await office(t);
  assert.match(pam.HIVE_HOOK_TOKEN, /^[0-9a-f]{48}$/);
  assert.notEqual(pam.HIVE_HOOK_TOKEN, oscar.HIVE_HOOK_TOKEN);
  assert.equal(hive.hookAgent(pam.HIVE_HOOK_TOKEN), 'pam');
  assert.equal(hive.hookAgent(undefined), undefined);
  assert.equal(hive.hookAgent({}), undefined);
});

test('a frame is taken as its token\'s agent; a forged, missing or stale token is dropped', unixOnly, async (t) => {
  const { hive, home, pam, oscar, logs, routed, send } = await office(t);
  await send({ hook_event_name: 'Stop', agent_id: 'pam', hook_token: pam.HIVE_HOOK_TOKEN });
  await send({ hook_event_name: 'Stop', hook_token: oscar.HIVE_HOOK_TOKEN });
  assert.deepEqual(routed, ['pam', 'oscar'], 'a frame with no agent_id takes its token\'s agent');

  await send({ hook_event_name: 'SessionStart', agent_id: 'oscar', hook_token: pam.HIVE_HOOK_TOKEN });
  await send({ hook_event_name: 'Stop', agent_id: 'michael' });
  await send({ hook_event_name: 'Stop', agent_id: 'pam', hook_token: 'f'.repeat(48) });
  const stale = pam.HIVE_HOOK_TOKEN;
  await hive.ensureAgent({ id: 'pam', name: 'Pam', provider: 'claude', cwd: home });
  await send({ hook_event_name: 'Stop', agent_id: 'pam', hook_token: stale });
  assert.deepEqual(routed, ['pam', 'oscar'], 'nothing else reached the handler');
  const rejected = logs.filter((e) => e.kind === 'hook-frame-rejected');
  assert.deepEqual(rejected.map((e) => e.reason), ['agent-mismatch', 'token', 'token', 'token']);
  assert.ok(!JSON.stringify(rejected).includes(pam.HIVE_HOOK_TOKEN), 'no token is logged');

  const mcp = await send({ hook_event_name: 'PreToolUse', agent_id: 'pam', tool_name: 'mcp__claude_ai_HubSpot__x', tool_input: {} });
  assert.equal(mcp.hookSpecificOutput.permissionDecision, 'deny', 'an MCP call with no token fails closed');
  assert.deepEqual(await send({ hook_event_name: 'PreToolUse', agent_id: 'pam', tool_name: 'Bash', tool_input: {} }), {});
});

test('the Claude hook shim sends its token, and a frame naming another agent goes as a subagent', unixOnly, async (t) => {
  const { hive, pam, routed } = await office(t);
  const run = (env, payload) => new Promise((resolve) => {
    const p = spawn(process.execPath, [hive.shimPath()], { env: { PATH: process.env.PATH, HIVE_SOCK: hive.sockPath(), ...env } });
    p.on('close', resolve);
    p.stdin.end(JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Read', ...payload }));
  });
  await run({ AGENT_ID: 'pam', HIVE_HOOK_TOKEN: pam.HIVE_HOOK_TOKEN }, { agent_id: 'oscar' });
  await run({ AGENT_ID: 'oscar' }, {});
  assert.deepEqual(routed, ['pam'], 'only the frame with Pam\'s token got through, as Pam');
});

test('every bridge stamps its token on the frame, and the proxy sidecar is given one', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/main/hive.ts'), 'utf8');
  // Claude/Codex, agy, pi, opencode, the proxy sidecar, Gemini and Grok.
  assert.equal(src.match(/payload\.hook_token = process\.env\.HIVE_HOOK_TOKEN \|\| null;/g).length, 7);
  assert.match(src, /HIVE_HOOK_TOKEN: cfg\.token,/);
  assert.match(src, /startProxyBridgeWithRetry\(meta\.id, \{ sock, token: env\.HIVE_HOOK_TOKEN,/);
});
