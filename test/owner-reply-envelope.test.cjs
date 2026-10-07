'use strict';

/**
 * Michael's reply to the owner (in_reply_to) is filed by the card lifecycle
 * router rule. Before that rule, a god to "human" message was already kept out
 * of his own inbox by the never-deliver-to-self filter, and it still reached
 * the activity log and the floor (an envelope to the owner).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron, filename: electron, loaded: true,
  exports: { Notification: class { show() {} static isSupported() { return false; } } }
};
const { HiveManager } = loadTs('src/main/hive.ts');

test('a reply from Michael to the owner still reaches the log and the floor', async (t) => {
  // Value: protects=the owner sees Michael answer (floor envelope to "you", a message in the office log); fails_when=the owner-request rule files every Michael reply with in_reply_to before emitMessage and the message log; why_new=regression of the card-lifecycle router rule, which skips both for any reply, not only a done to an owner request; seam=none
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-owner-reply-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const emitted = [];
  const hive = new HiveManager(() => home, (channel, payload) => { emitted.push([channel, payload]); return true; });
  await hive.ensureAgent({ id: 'god', name: 'Michael', provider: 'claude', cwd: home, isGod: true });
  const ask = hive.send({ to: 'god', act: 'request', subject: 'What is on today?', body: 'x' }, 'human');
  const reply = hive.send({ to: 'human', act: 'inform', subject: 'Today', body: 'Two invoices and a quote.', in_reply_to: ask.id }, 'god');
  const inbox = path.join(home, 'hive', 'agents', 'god', 'inbox');
  assert.ok(!fs.readdirSync(inbox).some((f) => f.includes(reply.id)), 'never delivered back to Michael');
  const env = emitted.find(([c, p]) => c === 'hive:message' && p.id === reply.id);
  assert.ok(env, 'the floor hears of it');
  assert.equal(env[1].needsHuman, false, 'a reply lands in the dock, never as a coral needs you envelope (michael-replies.md, 17A)');
  assert.ok(hive.logTail(50).some((e) => e.kind === 'message' && e.id === reply.id), 'the office log has it');
});
