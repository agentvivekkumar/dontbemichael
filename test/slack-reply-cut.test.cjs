'use strict';

// postSlackReply (src/main/slack.ts) is awaited by the done-reply poller, which
// skips every later tick while one post is in flight. A post that never settles
// stops all done replies for the session. https.request is pointed at a local
// plain http server, so the sockets are real but nothing leaves the machine.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const https = require('node:https');
const loadTs = require('./load-ts.cjs');

const { postSlackReply } = loadTs('src/main/slack.ts');

const opts = { botToken: 'xoxb-test', channel: 'C1', thread_ts: '1.2', text: 'done' };

/** Serve `handler` locally and send postSlackReply's https.request there. */
async function local(t, handler, timeoutMs) {
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  const real = https.request;
  https.request = (o, cb) => {
    const req = http.request({ ...o, hostname: '127.0.0.1', port }, cb);
    if (timeoutMs) { const set = req.setTimeout.bind(req); req.setTimeout = (_ms, fn) => set(timeoutMs, fn); }
    return req;
  };
  t.after(() => { https.request = real; server.closeAllConnections(); server.close(); });
}

/** Resolves with the post's result, or 'pending' if it has not settled in time. */
function settle(p, ms = 2000) {
  return Promise.race([p, new Promise((r) => setTimeout(() => r('pending'), ms).unref())]);
}

test('a connection cut halfway through the answer settles as a retryable failure', async (t) => {
  await local(t, (req, res) => {
    req.resume();
    res.writeHead(200, { 'content-type': 'application/json', 'content-length': '100' });
    res.write('{"ok":tr');
    setTimeout(() => res.socket.destroy(), 20);
  });
  const out = await settle(postSlackReply(opts));
  assert.notEqual(out, 'pending', 'the poller would wait forever');
  assert.equal(out.ok, false);
  assert.match(out.error, /closed before Slack answered/);
});

test('a post Slack never answers times out', async (t) => {
  await local(t, (req) => { req.resume(); }, 50);
  const out = await settle(postSlackReply(opts));
  assert.notEqual(out, 'pending', 'the poller would wait forever');
  assert.equal(out.ok, false);
  assert.match(out.error, /did not answer in time/);
});

test('a whole answer still reads as before', async (t) => {
  await local(t, (req, res) => {
    req.resume();
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  });
  assert.deepEqual(await settle(postSlackReply(opts)), { ok: true, error: undefined });
});

test('a Slack error answer keeps its error name', async (t) => {
  await local(t, (req, res) => {
    req.resume();
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":false,"error":"missing_scope"}');
  });
  assert.deepEqual(await settle(postSlackReply(opts)), { ok: false, error: 'missing_scope' });
});
