'use strict';

/**
 * The router's loop guard (HOP_CAP = 12) was never reachable because
 * routeOnce never incremented hops — every delivered message arrived in the
 * target's inbox with hops: 0. After #605, routeOnce increments hops by 1
 * on each routing pass, so the 13th message in a back-and-forth chain is
 * dropped and Michael is told.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { HiveManager } = loadTs('src/main/hive.ts');

async function makeFloor(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-hive-hop-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));

  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'god-1', name: 'Michael', provider: 'claude', cwd: home, isGod: true });
  await hive.ensureAgent({ id: 'pam', name: 'Pam', provider: 'claude', cwd: home });
  await hive.ensureAgent({ id: 'jim', name: 'Jim', provider: 'claude', cwd: home });

  return { hive, home };
}

function outboxDir(home, agentId) {
  return path.join(home, 'hive', 'agents', agentId, 'outbox');
}

function writeOutbox(home, agentId, filename, msg) {
  const dir = outboxDir(home, agentId);
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(msg), 'utf8');
}

test('a fresh message from an agent carries hops: 1 after routing', async (t) => {
  // Value: protects=hops increment on first route; fails_when=hops stays at 0; why_new=#605; seam=none; no_claim=none beyond protects
  const { hive, home } = await makeFloor(t);
  writeOutbox(home, 'pam', 'msg1.json', {
    to: 'jim', act: 'query', subject: 'A question', body: 'What is the status?', requires_reply: true
  });
  assert.equal(hive.routeOnce(), 1, 'one message routed');
  const inbox = hive.inbox('jim');
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].hops, 1, 'first hop should be 1, not 0');
});

test('a message with an existing hops value gets it incremented', async (t) => {
  // Value: protects=hops accumulate across relays; fails_when=the existing count is overwritten with 1; why_new=#605; seam=none; no_claim=none beyond protects
  const { hive, home } = await makeFloor(t);
  // Simulate a message that already passed through 5 hops upstream.
  writeOutbox(home, 'pam', 'msg2.json', {
    to: 'jim', act: 'inform', subject: 'Update', body: 'On my way', hops: 5
  });
  assert.equal(hive.routeOnce(), 1);
  const inbox = hive.inbox('jim');
  assert.equal(inbox[0].hops, 6, 'existing hops incremented to 6');
});

test('a chain of 13+ routed messages is dropped at HOP_CAP and Michael is notified', async (t) => {
  // Value: protects=the loop guard is now reachable; fails_when=messages beyond the cap are delivered; why_new=#605; seam=none; no_claim=none beyond protects
  const { hive, home } = await makeFloor(t);

  // Write a message that already has 12 hops (HOP_CAP). routeOnce will
  // increment to 13, which exceeds HOP_CAP (12), so routeMessage drops it.
  writeOutbox(home, 'pam', 'over-cap.json', {
    to: 'jim', act: 'query', subject: 'Still going?', body: 'Reply!', hops: 12
  });

  hive.routeOnce();

  // Jim's inbox must be empty — the message was dropped.
  assert.equal(hive.inbox('jim').length, 0, 'over-cap message must not be delivered');

  // The hive log must contain a drop entry with reason: 'hop-cap'.
  const drops = hive.logTail(50).filter((e) => e.kind === 'drop' && e.reason === 'hop-cap');
  assert.equal(drops.length, 1, 'exactly one hop-cap drop logged');

  // Michael must have received a notification.
  const godInbox = hive.inbox('god-1');
  assert.ok(godInbox.length >= 1, 'Michael should have received a loop-drop notice');
});
