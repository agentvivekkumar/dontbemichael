'use strict';

/**
 * Multi-mailbox transport edges (ship coverage audit, 2026-09-26): the broker's
 * POST /mail/<tool> route refusals, and the md-mail MCP server's protocol
 * corners. The happy relay is in md-mail-mcp.test.cjs.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const loadTs = require('./load-ts.cjs');

const { IntegrationBroker } = loadTs('src/main/integrationBroker.ts');
const SCRIPT = path.resolve(__dirname, '..', 'resources', 'md-mail-mcp.cjs');

function request(base, token, method, route, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(route, base);
    const payload = body === undefined ? '' : body;
    const req = http.request(url, { method, headers: { 'content-type': 'application/json', 'x-md-broker-token': token, 'content-length': Buffer.byteLength(payload) } }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { data += d; });
      res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }));
    });
    req.on('error', reject);
    req.end(payload);
  });
}

test('broker mail route: refuses what it cannot serve, maps a thrown handler to 500, and speaks for the agent', { timeout: 15_000 }, async (t) => {
  const calls = [];
  const broker = new IntegrationBroker({
    getRecord: () => undefined,
    getSecret: () => undefined,
    mail: async (agentId, op, body) => {
      calls.push({ agentId, op, body });
      if (op === 'boom') throw new Error('kaput');
      return { status: 200, body: { ok: true } };
    }
  });
  await broker.start();
  t.after(() => broker.stop());
  const token = broker.grant('pty-1', [], 'dwight');
  const legacy = broker.grant('pty-2', []);

  assert.equal((await request(broker.url(), token, 'GET', '/mail/search')).status, 405);
  // A body over the 1 MB cap never reaches the mail handler.
  const before = calls.length;
  const big = await request(broker.url(), token, 'POST', '/mail/search', 'x'.repeat(1_000_001)).catch((e) => ({ status: 'closed', error: e }));
  assert.ok(big.status === 413 || big.status === 'closed', `refused, got ${big.status}`);
  assert.equal(calls.length, before);
  const badJson = await request(broker.url(), token, 'POST', '/mail/search', '{nope');
  assert.equal(badJson.status, 400);
  assert.match(badJson.body.error, /JSON/);
  assert.equal((await request(broker.url(), token, 'POST', '/mail/search', '[1,2]')).status, 400, 'an array is not a body');
  assert.equal((await request(broker.url(), token, 'POST', '/mail/search', 'null')).status, 400);
  const boom = await request(broker.url(), token, 'POST', '/mail/boom', '{}');
  assert.equal(boom.status, 500);
  assert.match(boom.body.error, /kaput/);
  assert.equal((await request(broker.url(), token, 'POST', '/mail/Search', '{}')).status, 404, 'tool names are lower case only');
  assert.equal((await request(broker.url(), 'forged', 'POST', '/mail/search', '{}')).status, 401);

  const ok = await request(broker.url(), token, 'POST', '/mail/search', '');
  assert.equal(ok.status, 200, 'an empty body is an empty object');
  assert.deepEqual(calls.at(-1), { agentId: 'dwight', op: 'search', body: {} });
  await request(broker.url(), legacy, 'POST', '/mail/list_mailboxes', '{}');
  assert.equal(calls.at(-1).agentId, 'pty-2', 'a token minted without an agent speaks for its worker');
  assert.equal(calls.filter((c) => c.op === 'search').length, 1, 'refused calls never reached mail');

  const noMail = new IntegrationBroker({ getRecord: () => undefined, getSecret: () => undefined });
  await noMail.start();
  t.after(() => noMail.stop());
  const tk = noMail.grant('pty-3', [], 'pam');
  assert.equal((await request(noMail.url(), tk, 'POST', '/mail/search', '{}')).status, 404, 'no mail handler, no mail route');
});

test('md-mail answers ping, stays quiet on notifications, rejects unknown methods, and words a bare broker error', { timeout: 15_000 }, async (t) => {
  const broker = new IntegrationBroker({ getRecord: () => undefined, getSecret: () => undefined, mail: async () => ({ status: 502, body: {} }) });
  await broker.start();
  t.after(() => broker.stop());
  const token = broker.grant('pty-dwight', [], 'dwight');
  const child = spawn(process.execPath, [SCRIPT], { env: { ...process.env, MD_BROKER_URL: broker.url(), MD_BROKER_TOKEN: token }, stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => child.kill());

  const lines = [];
  let buf = '';
  const waiters = [];
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const msg = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
      lines.push(msg);
      for (const w of waiters.splice(0)) w();
    }
  });
  const next = (id) => new Promise((resolve) => {
    const look = () => { const hit = lines.find((m) => m.id === id); if (hit) resolve(hit); else waiters.push(look); };
    look();
  });
  const send = (obj) => child.stdin.write(JSON.stringify(obj) + '\n');

  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  send({ jsonrpc: '2.0', id: 1, method: 'ping' });
  assert.deepEqual((await next(1)).result, {});
  send({ jsonrpc: '2.0', id: 2, method: 'resources/list' });
  assert.equal((await next(2)).error.code, -32601);
  send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'search', arguments: { mailbox: 'sales' } } });
  const r = await next(3);
  assert.equal(r.result.isError, true);
  assert.equal(r.result.content[0].text, 'Mail error 502');
  child.stdin.write('   \n');
  child.stdin.write('42\n');
  const invalid = await next(null);
  assert.equal(invalid.error.code, -32600, 'a JSON value that is not a request');
  assert.equal(lines.filter((m) => m.id === undefined).length, 0, 'the notification got no reply');
});
