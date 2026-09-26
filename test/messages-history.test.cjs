'use strict';
/**
 * An agent's Messages tab is its handoff history (owner, 2026-09-25): what it
 * received and what it sent, handled or not. Before, it read only the unhandled
 * inbox, so it was empty nearly all the time (0 across 9 agents that had
 * exchanged 190 messages) and never showed what the agent sent.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { HiveManager } = loadTs('src/main/hive.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

async function office(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-history-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  for (const [id, name, isGod] of [['god', 'Michael', true], ['pam', 'Pam', false], ['dwight', 'Dwight', false]]) {
    await hive.ensureAgent({ id, name, provider: 'claude', cwd: home, isGod });
  }
  return { home, hive };
}

test('history holds received and sent mail, handled or not, newest first', async (t) => {
  const { home, hive } = await office(t);
  hive.send({ to: 'pam', act: 'request', subject: 'Triage the inbox', body: 'go' }, 'god');
  hive.send({ to: 'dwight', act: 'inform', subject: 'Dennis has not replied', body: 'details' }, 'pam');
  hive.send({ to: 'god', act: 'inform', subject: 'Not about Pam', body: 'x' }, 'dwight');
  // Pam handles her mail: it moves to inbox/.done and must still show.
  const inbox = path.join(home, 'hive', 'agents', 'pam', 'inbox');
  for (const f of fs.readdirSync(inbox).filter((f) => f.endsWith('.json'))) fs.renameSync(path.join(inbox, f), path.join(inbox, '.done', f));
  assert.equal(hive.inbox('pam').length, 0, 'the old tab would show nothing');

  const h = hive.messageHistory('pam');
  assert.deepEqual(h.map((m) => [m.dir, m.subject]).sort(), [['in', 'Triage the inbox'], ['out', 'Dennis has not replied']]);
  assert.ok(h[0].created_at >= h[1].created_at, 'newest first');
});

test('the tab reads the history and is read only', () => {
  const panel = read('src/renderer/src/components/ThreadsPanel.tsx');
  assert.match(panel, /window\.cth\.hiveHistory\(agentId\)/);
  assert.doesNotMatch(panel, /hiveSend|<textarea/, 'no reply box: talk through Michael or in 1:1');
  for (const loc of ['en', 'zh-CN', 'ar']) {
    const d = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).threads;
    for (const k of ['emptyHistory', 'you']) assert.ok(d[k], `${loc} ${k}`);
    assert.equal(d.replyPlaceholder, undefined, `${loc}: reply box strings are gone`);
  }
});

test('history parses each file once and still sees new and moved mail', async (t) => {
  const fs2 = require('node:fs'); const os2 = require('node:os'); const path2 = require('node:path');
  const { HiveManager } = require('./load-ts.cjs')('src/main/hive.ts');
  const home = fs2.mkdtempSync(path2.join(os2.tmpdir(), 'md-hist-cache-'));
  t.after(() => fs2.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'pam', name: 'Pam', provider: 'claude', cwd: home });
  const inbox = path2.join(home, 'hive', 'agents', 'pam', 'inbox');
  fs2.mkdirSync(path2.join(inbox, '.done'), { recursive: true });
  const write = (dir, id) => fs2.writeFileSync(path2.join(dir, `${id}.json`), JSON.stringify({ id, from: 'dwight', to: 'pam', act: 'request', subject: id, body: '', created_at: new Date().toISOString() }));
  write(inbox, 'a');
  const aPath = path2.join(inbox, 'a.json');
  const pinned = new Date(2026, 8, 25, 12, 0, 0); // a whole second, so it round-trips exactly
  fs2.utimesSync(aPath, pinned, pinned);
  assert.deepEqual(hive.messageHistory('pam').map((m) => m.id), ['a']);
  // Rewrite a.json with the same size and mtime: a cached read still shows the old subject.
  fs2.writeFileSync(aPath, JSON.stringify({ id: 'a', from: 'dwight', to: 'pam', act: 'request', subject: 'z', body: '', created_at: JSON.parse(fs2.readFileSync(aPath, 'utf8')).created_at }));
  fs2.utimesSync(aPath, pinned, pinned);
  assert.equal(hive.messageHistory('pam')[0].subject, 'a', 'an unchanged file (same mtime) is not parsed again');
  write(inbox, 'b');
  fs2.renameSync(path2.join(inbox, 'a.json'), path2.join(inbox, '.done', 'a.json'));
  const ids = hive.messageHistory('pam').map((m) => m.id).sort();
  assert.deepEqual(ids, ['a', 'b'], 'new mail and mail moved to .done both show');
});

test('voice schedule edits go through the single writer and report a failed save', () => {
  const main = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../src/main/index.ts'), 'utf8');
  assert.match(main, /saveMissions: \(missions\) => \{[\s\S]{0,200}const res = applyMissions\(\(\) => missions\);\s*if \(!res\.ok\) throw new Error\(res\.error\);/);
});
