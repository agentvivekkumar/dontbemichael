'use strict';

/**
 * A card has one open ask: its newest (owner, 2026-09-25). Before this, ASK ME
 * showed only the newest unanswered ask, but an older unanswered one on the
 * same card stayed "open" forever: hidden from the owner, impossible to answer
 * or dismiss, and counted by openQuestionsRaisedBy, so safe clear refused to
 * reset that agent ("open-question").
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { openAskIndex, isReplacedAsk } = loadTs('src/shared/askMeRouting.ts');
const { HiveManager } = loadTs('src/main/hive.ts');

const older = { q: 'Send the invoice to Acme on the 1st?', askedAt: '2026-09-24T10:00Z', raisedBy: 'oscar' };
const newer = { q: 'Hold all Acme invoices until the dispute is settled?', askedAt: '2026-09-25T10:00Z', raisedBy: 'god' };

test('the newest ask is the open one; an older unanswered ask is replaced', () => {
  assert.equal(openAskIndex([older, newer]), 1);
  assert.equal(isReplacedAsk([older, newer], 0), true);
  assert.equal(isReplacedAsk([older, newer], 1), false);
});

test('an answered or dismissed newest ask leaves nothing open, and never revives an older one', () => {
  assert.equal(openAskIndex([older, { ...newer, a: 'yes' }]), -1);
  assert.equal(openAskIndex([older, { ...newer, dismissedAt: '2026-09-25T11:00Z' }]), -1);
  assert.equal(isReplacedAsk([older, { ...newer, a: 'yes' }], 0), true);
  assert.equal(isReplacedAsk([{ ...older, a: 'no' }, newer], 0), false, 'an answered ask is history, not replaced');
});

test('a replaced ask no longer holds its agent open for safe clear', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-ask-replaced-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'god', name: 'Michael', provider: 'claude', cwd: home, isGod: true });
  await hive.ensureAgent({ id: 'oscar', name: 'Oscar', provider: 'claude', cwd: home });
  fs.writeFileSync(path.join(home, 'hive', 'tasks.json'), JSON.stringify({ tasks: [
    { id: 'T1', title: 'Acme invoices', status: 'blocked', assignee: 'oscar', humanQA: [older, newer] }
  ] }));
  assert.equal(hive.openQuestionsRaisedBy('oscar'), 0, "Oscar's older ask was replaced");
  assert.equal(hive.openQuestionsRaisedBy('god'), 1);
});

test('ASK ME and the card history use the same rule, and Michael is told to check open asks first', () => {
  const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
  const kanban = read('src/renderer/src/components/TasksKanban.tsx');
  assert.match(kanban, /const i = openAskIndex\(t\.humanQA\);/);
  assert.match(kanban, /isReplacedAsk\(task\.humanQA, i\) \?/);
  const hive = read('src/main/hive.ts');
  assert.match(hive, /BEFORE YOU ADD AN ASK, read the asks already open on the board/);
  assert.match(hive, /before asking he checks the open asks/);
  for (const loc of ['en', 'zh-CN', 'ar']) assert.ok(JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).kanban.askReplaced);
});
