'use strict';

/**
 * md-mcp-core.cjs: the stdio loop every MCP helper shares (eng review EXT-1).
 *
 * A bug here breaks mail and books together, so the contract is pinned against
 * a throwaway helper and a plain HTTP stand-in for the broker: the route and
 * token ride every call, the body is the tool arguments, a broker refusal is a
 * tool error (not a crash), unknown tools and bad lines get JSON-RPC errors,
 * notifications get no reply, and closing stdin ends the process cleanly.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const CORE = path.resolve(__dirname, '..', 'resources', 'md-mcp-core.cjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-mcp-core-'));
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

// A helper exactly like md-mail, but with its own route and one tool.
const HELPER = path.join(dir, 'md-probe.cjs');
fs.writeFileSync(HELPER, `
const { serve } = require(${JSON.stringify(CORE)});
serve({
  name: 'md-probe',
  route: 'probe',
  instructions: 'Probe tools.',
  tools: [{ name: 'echo', description: 'Echo', inputSchema: { type: 'object', properties: {} } },
          { name: 'refuse', description: 'Refuse', inputSchema: { type: 'object', properties: {} } }],
  notConnected: 'Probe is not connected for you right now.',
  errorLabel: 'Probe'
});
`);

function rpc(child) {
  let buf = '';
  const waiting = new Map();
  const unsolicited = [];
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      const w = waiting.get(msg.id);
      if (w) { waiting.delete(msg.id); w(msg); } else unsolicited.push(msg);
    }
  });
  let next = 1;
  return {
    unsolicited,
    send(method, params) {
      const id = next++;
      return new Promise((resolve) => { waiting.set(id, resolve); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
    },
    raw(line, id = null) {
      return new Promise((resolve) => { waiting.set(id, resolve); child.stdin.write(line + '\n'); });
    }
  };
}

function fakeBroker(t) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, token: req.headers['x-md-broker-token'], body: JSON.parse(body || '{}') });
      if (req.url === '/probe/refuse') { res.writeHead(403, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: 'Not for you.' })); }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, got: JSON.parse(body || '{}') }));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    t.after(() => server.close());
    resolve({ url: `http://127.0.0.1:${server.address().port}`, seen });
  }));
}

function start(env) {
  return spawn(process.execPath, [HELPER], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
}

test('the helper names itself, lists its tools, and routes calls with the token and arguments', { timeout: 15_000 }, async (t) => {
  const broker = await fakeBroker(t);
  const child = start({ MD_BROKER_URL: broker.url, MD_BROKER_TOKEN: 'tok-1' });
  t.after(() => child.kill());
  const c = rpc(child);

  const init = await c.send('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  assert.equal(init.result.serverInfo.name, 'md-probe');
  assert.equal(init.result.instructions, 'Probe tools.');
  assert.equal(init.result.protocolVersion, '2025-06-18');

  const list = await c.send('tools/list', {});
  assert.deepEqual(list.result.tools.map((x) => x.name), ['echo', 'refuse']);

  const ok = await c.send('tools/call', { name: 'echo', arguments: { a: 1 } });
  assert.equal(ok.result.isError, false);
  assert.deepEqual(JSON.parse(ok.result.content[0].text), { ok: true, got: { a: 1 } });
  assert.deepEqual(broker.seen[0], { method: 'POST', url: '/probe/echo', token: 'tok-1', body: { a: 1 } });

  const refused = await c.send('tools/call', { name: 'refuse', arguments: {} });
  assert.equal(refused.result.isError, true);
  assert.equal(refused.result.content[0].text, 'Not for you.');

  const pong = await c.send('ping', {});
  assert.deepEqual(pong.result, {});
});

test('protocol errors are answered, notifications are not, and a bad line never kills it', { timeout: 15_000 }, async (t) => {
  const broker = await fakeBroker(t);
  const child = start({ MD_BROKER_URL: broker.url, MD_BROKER_TOKEN: 'tok-1' });
  t.after(() => child.kill());
  const c = rpc(child);

  assert.equal((await c.send('tools/call', { name: 'nope', arguments: {} })).error.code, -32602);
  assert.equal((await c.send('resources/list', {})).error.code, -32601);
  assert.equal((await c.raw('{not json')).error.code, -32700);
  assert.equal((await c.raw('42')).error.code, -32600);
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const still = await c.send('tools/list', {});
  assert.ok(still.result.tools.length, 'still answering');
  assert.deepEqual(c.unsolicited, [], 'a notification gets no reply');
  assert.equal(broker.seen.length, 0, 'nothing reached the broker');
});

test('with no broker it says so in the helper’s own words, and a bad URL too', { timeout: 15_000 }, async (t) => {
  const none = start({ MD_BROKER_URL: '', MD_BROKER_TOKEN: '' });
  t.after(() => none.kill());
  const a = await rpc(none).send('tools/call', { name: 'echo', arguments: {} });
  assert.equal(a.result.isError, true);
  assert.equal(a.result.content[0].text, 'Probe is not connected for you right now. Tell Michael.');

  const bad = start({ MD_BROKER_URL: 'not a url', MD_BROKER_TOKEN: 'tok' });
  t.after(() => bad.kill());
  const b = await rpc(bad).send('tools/call', { name: 'echo', arguments: {} });
  assert.equal(b.result.content[0].text, 'Probe is not connected for you right now.');
});

test('closing stdin ends the helper with exit code 0', { timeout: 15_000 }, async () => {
  const child = start({ MD_BROKER_URL: '', MD_BROKER_TOKEN: '' });
  const code = await new Promise((resolve) => { child.on('exit', resolve); child.stdin.end(); });
  assert.equal(code, 0);
});
