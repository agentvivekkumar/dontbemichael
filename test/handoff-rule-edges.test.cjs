'use strict';

/**
 * Edges of the only-Michael-assigns rule (src/shared/handoffRule.ts) that
 * only-michael-assigns.test.cjs leaves out: unknown targets, broadcast wording,
 * names missing from the roster, and a long subject on a dropped message,
 * and the dropped message's own text in Michael's notice.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const R = loadTs('src/shared/handoffRule.ts');
const agents = {
  god: { name: 'Michael', isGod: true },
  pam: { name: 'Pam' },
  erin: { name: '  ' },
  prep: { name: 'Prep', isAssistant: true }
};

test('a request to someone not on the roster is left for the router to bounce', () => {
  assert.equal(R.isPeerAssignment({ from: 'pam', to: 'scheduler', act: 'request' }, agents, 'god', 'scheduler'), false);
  assert.equal(R.isPeerAssignment({ from: 'pam', to: 'ghost', act: 'propose' }, agents, 'god', 'ghost'), false);
});

test('Michael under another id, or a sender missing from the roster, is never rerouted', () => {
  assert.equal(R.isPeerAssignment({ from: 'boss', to: 'pam', act: 'request' }, { ...agents, boss: { name: 'Boss', isGod: true } }, 'god', 'pam'), false);
  assert.equal(R.isPeerAssignment({ from: 'god', to: 'broadcast', act: 'request' }, agents, 'god', 'broadcast'), false);
  assert.equal(R.isPeerAssignment({ from: 'nobody', to: 'broadcast', act: 'request' }, agents, 'god', 'broadcast'), false);
});

test('a request that resolves to Michael (by name) goes through as sent', () => {
  assert.equal(R.isPeerAssignment({ from: 'pam', to: 'Michael', act: 'request' }, agents, 'god', 'god'), false);
});

test('a broadcast request reads as asking the whole team; a blank name falls back to the id', () => {
  const b = R.rerouteToMichael({ from: 'pam', to: 'broadcast', subject: 'Help', body: 'x' }, agents, 'god');
  assert.equal(b.subject, '[handoff: Pam asked the whole team] Help');
  assert.match(b.body, /^Pam asked the whole team to do this\. Only you assign work: hand it to the right teammate, or answer Pam yourself\.\n\nx$/);
  const e = R.rerouteToMichael({ from: 'erin', to: 'pam', subject: 'S', body: 'b', extra: 1 }, agents, 'god');
  assert.equal(e.subject, '[handoff: erin asked Pam] S');
  assert.equal(e.extra, 1, 'other fields are kept');
  assert.equal(e.from, 'erin');
  assert.doesNotMatch(b.subject + b.body + e.subject + e.body, /[–—]| - /, 'no dashes');
});

test('a dropped message with a long subject keeps the notice subject short', () => {
  const n = R.hopDropNotice({ from: 'ghost', to: 'pam', subject: 'S'.repeat(400), hops: 13 }, agents);
  assert.equal(n.subject.length, 200);
  assert.match(n.body, /^A message from ghost to Pam passed between agents 13 times/);
});

test("a dropped message's text is quoted in Michael's notice, on one line", () => {
  const n = R.hopDropNotice({ from: 'pam', to: 'god', subject: 'Refund', hops: 13, body: 'Can you check\nthe  Northwind refund\tagain?' }, agents);
  assert.match(n.body, /Subject: "Refund"\. It said: "Can you check the Northwind refund again\?" Decide who owns this and tell them once\.$/);
});

test('a long dropped message is cut at a word, never quoted whole', () => {
  const words = Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ');
  const n = R.hopDropNotice({ from: 'pam', to: 'god', subject: 'Long', hops: 13, body: words }, agents);
  const quoted = n.body.match(/It said: "(.*)" Decide/)[1];
  assert.ok(quoted.length <= R.HOP_DROP_EXCERPT_MAX + 1, `excerpt is ${quoted.length} characters`);
  assert.ok(quoted.endsWith('…'));
  assert.match(quoted, /^word0 word1 word2 /);
  assert.match(quoted, /word\d+…$/, 'ends on a whole word');
});

test('a dropped message with no text keeps the notice as it was', () => {
  for (const body of [undefined, '', '   \n ']) {
    const n = R.hopDropNotice({ from: 'pam', to: 'god', subject: 'Loop', hops: 13, body }, agents);
    assert.equal(n.body, 'A message from Pam to Michael passed between agents 13 times, so the app stopped it. Subject: "Loop". Decide who owns this and tell them once.');
  }
});
