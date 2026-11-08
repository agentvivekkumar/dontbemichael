'use strict';

// postSlackReply (src/main/slack.ts) is awaited by the done-reply poller, which
// skips every later tick while one post is in flight. A post that never settles
// stops all done replies for the session. chat.postMessage has no idempotency
// key, so a failed post also says how far it got, and the poller retries one
// that may have posted only a few times. https.request is pointed at a local
// plain http server, so the sockets are real but nothing leaves the machine.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const loadTs = require('./load-ts.cjs');

const { postSlackReply, slackDoneVerdict, SLACK_UNSURE_TRIES } = loadTs('src/main/slack.ts');

const opts = { botToken: 'xoxb-test', channel: 'C1', thread_ts: '1.2', text: 'done', timeoutMs: 200 };

/** Send postSlackReply's https.request to 127.0.0.1:`port`. */
function pointAt(t, port) {
  const real = https.request;
  https.request = (o, cb) => http.request({ ...o, hostname: '127.0.0.1', port }, cb);
  t.after(() => { https.request = real; });
}

/** Serve `handler` locally and point postSlackReply at it. */
async function local(t, handler) {
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  pointAt(t, server.address().port);
  t.after(() => { server.closeAllConnections(); server.close(); });
}

/** Resolves with the post's result, or 'pending' if it has not settled in time. */
function settle(p, ms = 2000) {
  return Promise.race([p, new Promise((r) => setTimeout(() => r('pending'), ms).unref())]);
}

test('a connection cut after Slack answered counts as answered', async (t) => {
  await local(t, (req, res) => {
    req.resume();
    res.writeHead(200, { 'content-type': 'application/json', 'content-length': '100' });
    res.write('{"ok":tr');
    setTimeout(() => res.socket.destroy(), 20);
  });
  const out = await settle(postSlackReply(opts));
  assert.notEqual(out, 'pending', 'the poller would wait forever');
  assert.equal(out.ok, false);
  assert.equal(out.answered, true);
  assert.equal(out.unsure, undefined);
  assert.match(out.error, /cut after Slack answered \(HTTP 200\)/);
});

test('headers and part of the body, then nothing, ends at the deadline as answered', async (t) => {
  await local(t, (req, res) => {
    req.resume();
    res.writeHead(200, { 'content-type': 'application/json', 'content-length': '100' });
    res.write('{"ok":tr');
  });
  const out = await settle(postSlackReply(opts));
  assert.notEqual(out, 'pending', 'an idle timer alone would not catch every stall');
  assert.equal(out.answered, true);
  assert.match(out.error, /HTTP 200/);
});

test('a post Slack never answers times out as unsure', async (t) => {
  await local(t, (req) => { req.resume(); });
  const out = await settle(postSlackReply(opts));
  assert.notEqual(out, 'pending', 'the poller would wait forever');
  assert.equal(out.ok, false);
  assert.equal(out.unsure, true);
  assert.equal(out.answered, undefined);
  assert.match(out.error, /did not answer in time/);
});

test('a post that never reached Slack is neither answered nor unsure', async (t) => {
  const probe = net.createServer();
  await new Promise((r) => probe.listen(0, '127.0.0.1', r));
  const { port } = probe.address();
  await new Promise((r) => probe.close(r)); // nothing listens there now
  pointAt(t, port);
  const out = await settle(postSlackReply(opts));
  assert.equal(out.ok, false);
  assert.equal(out.answered, undefined);
  assert.equal(out.unsure, undefined);
  assert.match(out.error, /ECONNREFUSED/);
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

test('the third unanswered post of a task gives up; answered and unreached posts do not count', async (t) => {
  await local(t, (req) => { req.resume(); });
  assert.equal(SLACK_UNSURE_TRIES, 3);
  const verdicts = [];
  let tries = 0;
  for (let i = 0; i < 3; i++) {
    const res = await postSlackReply(opts);
    const v = slackDoneVerdict(res, tries);
    verdicts.push(v);
    if (v === 'retry' && res.unsure) tries++;
  }
  assert.deepEqual(verdicts, ['retry', 'retry', 'give-up']);

  assert.equal(slackDoneVerdict({ ok: true }, 0), 'posted');
  assert.equal(slackDoneVerdict({ ok: false, error: 'cut', answered: true }, 0), 'posted');
  assert.equal(slackDoneVerdict({ ok: false, error: 'ratelimited' }, 99), 'retry');
  assert.equal(slackDoneVerdict({ ok: false, error: 'getaddrinfo ENOTFOUND slack.com' }, 99), 'retry');
});

test('the done poller counts unsure posts per task and marks a given-up task', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'index.ts'), 'utf8');
  const start = src.indexOf('async function pollSlackDoneTasks');
  const body = src.slice(start, src.indexOf('\nfunction startSlackDoneObserver', start));
  assert.match(body, /slackDoneVerdict\(res, slackDoneUnsure\.get\(t\.id\) \?\? 0\)/);
  assert.match(body, /if \(res\.unsure\) slackDoneUnsure\.set\(t\.id, \(slackDoneUnsure\.get\(t\.id\) \?\? 0\) \+ 1\)/);
  const marked = body.slice(body.indexOf("if (verdict === 'retry')"));
  assert.match(marked, /slackDoneUnsure\.delete\(t\.id\);\s*notified\.add\(t\.id\);\s*persistSlackDoneNotified\(notified\);/);
});
