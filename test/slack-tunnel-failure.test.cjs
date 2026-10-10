'use strict';

/**
 * The Slack server binds its port, then opens a tunnel. When the tunnel failed
 * the port stayed bound, but the caller drops the instance on any ok:false, so
 * nothing could close it and the next try could not bind the port. A tunnel
 * failure now closes the server again.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const loadTs = require('./load-ts.cjs');

const { SlackWebhookServer } = loadTs('src/main/slack.ts');

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer().listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

test('a tunnel failure frees the port, so the next start can bind it again', async () => {
  const port = await freePort();
  const make = () => {
    const server = new SlackWebhookServer({ port, signingSecret: 'secret', onMessage() {} });
    server.openTunnel = async () => { throw new Error('offline'); };
    return server;
  };
  const first = await make().start();
  assert.equal(first.ok, false);
  assert.match(first.error, /^tunnel unavailable: offline/);
  const second = await make().start();
  assert.match(second.error, /^tunnel unavailable/, 'the port was free for the second server');
});
