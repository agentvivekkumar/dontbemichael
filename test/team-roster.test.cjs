'use strict';

/**
 * The roster Michael gets in a business office (owner, 2026-09-25): one line
 * per team member with the Role description he routes by, a tag only when it
 * changes routing, sent in full at session start and on a team change, as one
 * status line when only tags change, and not at all otherwise.
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

test('one line per team member, Michael left out, tags only for busy and on hold', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-roster-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'god', name: 'Michael', provider: 'claude', cwd: home, isGod: true });
  fs.writeFileSync(path.join(hive.root(), 'fleet.json'), JSON.stringify({ agents: [
    { id: 'god', name: 'Michael', role: 'orchestrator', isGod: true },
    { id: 'oscar', name: 'Oscar', role: 'Finance: Oscar keeps the books. Not for deals; that goes to Sales Director.' },
    { id: 'kelly', name: 'Kelly', role: 'Customer Support: Kelly answers customers.', onHold: true }
  ] }));
  hive.writeTasks([{ id: 't1', title: 'June close', assignee: 'oscar', status: 'doing', dependsOn: [], priority: 1, createdAt: 'x' }]);
  const r = hive.teamRoster();
  assert.equal(r.full, [
    'Team roster (address messages by the id in brackets):',
    '- Oscar (oscar), Finance: Oscar keeps the books. Not for deals; that goes to Sales Director. (busy: June close)',
    '- Kelly (kelly), Customer Support: Kelly answers customers. (on hold)'
  ].join('\n'));
  assert.equal(r.status, 'Status now: Oscar busy (June close), Kelly on hold. Everyone else free.');
  const before = r.layoutKey;
  hive.writeTasks([]);
  const r2 = hive.teamRoster();
  assert.equal(r2.layoutKey, before, 'a status change is not a team change');
  assert.notEqual(r2.statusKey, r.statusKey);
  assert.doesNotMatch(r.full + r.status, /[–—]|ctx|breaker|\$/);
});

test('the hook sends the full roster on a new session or team change, a status line on a tag change, else nothing', () => {
  const hooks = fs.readFileSync(path.resolve(__dirname, '../src/main/hooks.ts'), 'utf8');
  assert.match(hooks, /if \(event === 'SessionStart' \|\| !last \|\| last\.sessionId !== sessionId \|\| last\.layoutKey !== r\.layoutKey\) \{\s*roster = r\.full;\s*\} else if \(last\.statusKey !== r\.statusKey\) \{\s*roster = r\.status;/);
  assert.match(hooks, /\} else if \(wantsRoster\) \{\s*roster = this\.hive\.rosterContext/, 'older installs keep the live roster');
});
