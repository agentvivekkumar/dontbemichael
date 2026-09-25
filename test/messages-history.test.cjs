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

test('the tab reads the history, is read only, and dims routine traffic', () => {
  const panel = read('src/renderer/src/components/ThreadsPanel.tsx');
  assert.match(panel, /window\.cth\.hiveHistory\(agentId\)/);
  assert.doesNotMatch(panel, /hiveSend|<textarea/, 'no reply box: talk through Michael or in 1:1');
  const { isRoutine } = { isRoutine: (m) => new Set(['scheduler', 'heartbeat', 'system', 'breaker']).has(m.from) || /closing[\s_-]*time/i.test(m.subject ?? '') };
  assert.match(panel, /return SYSTEM_SENDERS\.has\(m\.from\) \|\| \/closing\[\\s_-\]\*time\/i\.test\(m\.subject \?\? ''\);/);
  assert.equal(isRoutine({ from: 'pam', subject: 'CLOSING-TIME-ACK' }), true);
  for (const loc of ['en', 'zh-CN', 'ar']) {
    const d = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).threads;
    for (const k of ['emptyHistory', 'you', 'routine', 'sentTo', 'receivedFrom']) assert.ok(d[k], `${loc} ${k}`);
    assert.equal(d.replyPlaceholder, undefined, `${loc}: reply box strings are gone`);
  }
});
