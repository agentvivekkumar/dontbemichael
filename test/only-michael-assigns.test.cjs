'use strict';

/**
 * Only Michael assigns work (owner, 2026-09-27: "never break this promise").
 * src/shared/handoffRule.ts decides; hive.ts routeMessage applies it.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const R = loadTs('src/shared/handoffRule.ts');
const agents = {
  god: { name: 'Michael', isGod: true },
  pam: { name: 'Pam' },
  erin: { name: 'Erin' },
  prep: { name: 'Prep', isAssistant: true }
};
const peer = (act, from = 'pam', to = 'erin') => R.isPeerAssignment({ from, to, act }, agents, 'god', to);

test('a teammate asking a teammate to do something goes to Michael', () => {
  assert.equal(peer('request'), true);
  assert.equal(peer('propose'), true);
  assert.equal(R.isPeerAssignment({ from: 'pam', to: 'broadcast', act: 'request' }, agents, 'god', 'broadcast'), true);
});

test('questions, answers and results between teammates go straight through', () => {
  for (const act of ['query', 'inform', 'done', 'agree', 'refuse']) assert.equal(peer(act), false, act);
});

test('Michael, the app and messages to Michael are untouched', () => {
  assert.equal(peer('request', 'god', 'erin'), false);
  assert.equal(peer('request', 'scheduler', 'erin'), false);
  assert.equal(peer('request', 'system', 'erin'), false);
  assert.equal(R.isPeerAssignment({ from: 'pam', to: 'michael', act: 'request' }, agents, 'god', 'god'), false);
  assert.equal(peer('request', 'pam', 'pam'), false);
});

test('the rerouted message tells Michael who asked whom', () => {
  const m = R.rerouteToMichael({ from: 'pam', to: 'erin', subject: 'Sort support mail', body: 'Please.' }, agents, 'god');
  assert.equal(m.to, 'god');
  assert.equal(m.from, 'pam');
  assert.match(m.subject, /^\[handoff: Pam asked Erin\] Sort support mail$/);
  assert.match(m.body, /Only you assign work/);
});

test('a dropped runaway message is reported to Michael, with no dashes', () => {
  const n = R.hopDropNotice({ from: 'pam', to: 'erin', subject: 'Loop', hops: 13 }, agents);
  assert.match(n.body, /Pam to Erin passed between agents 13 times/);
  assert.doesNotMatch(n.subject + n.body, /[–—]| - /);
});

test('the router applies the rule and tells Michael about hop drops; instructions say so', () => {
  const hive = fs.readFileSync(path.resolve(__dirname, '..', 'src/main/hive.ts'), 'utf8');
  assert.match(hive, /if \(isPeerAssignment\(msg, reg\.agents, godId, resolveTo\(msg\.to\)\)\) \{[\s\S]{0,900}msg = rerouteToMichael\(msg, reg\.agents, godId\);/);
  assert.match(hive, /hopDropNotice\(msg, r\.agents\)/);
  assert.match(hive, /`Only \$\{michael\} assigns work\./);
  assert.match(hive, /You are the only one who assigns work/);
  assert.match(hive, /Only Michael assigns work: a \\`request\\` from one team member to another is delivered to Michael/);
});

test('the asker hears that its request went to Michael (pre-landing review, 2026-09-27)', () => {
  const hive = fs.readFileSync(path.resolve(__dirname, '..', 'src/main/hive.ts'), 'utf8');
  assert.match(hive, /went to \$\{resolveGodName\(reg\.agents\[godId\]\?\.name\)\}, who assigns work\. To ask a teammate for a fact, use "act": "query"\./);
  const michael = hive.slice(hive.indexOf("'## Schedule requests',"), hive.indexOf("'## Staying cheap',"));
  assert.ok(michael.indexOf("'## Schedule requests',") < michael.indexOf("'## Scheduled runs',"), 'its own section, before scheduled runs');
  assert.match(michael, /it is the one scheduler message you answer/);
});
