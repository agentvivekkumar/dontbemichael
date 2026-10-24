'use strict';

/**
 * Owner moves a card to another team member so Michael learns (issue #248).
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

const { ownerChangeNote } = loadTs('src/shared/ownerRequests.ts');
const { HiveManager } = loadTs('src/main/hive.ts');
const { parseTasks } = loadTs('src/renderer/src/components/hiveTasks.ts');

test('the reassign note names both people and asks Michael to follow the routing note', () => {
  // Value: protects=Michael hears who lost the card and who got it; fails_when=the note drops names or skips the memory instruction; why_new=issue #248; seam=none
  const note = ownerChangeNote(
    { id: 't1', title: 'Refund for Northwind' },
    { kind: 'reassigned', from: 'dwight', to: 'kelly', fromName: 'Dwight', toName: 'Kelly', reason: 'Refunds are support work.' }
  );
  assert.match(note.subject, /OWNER REASSIGNED card t1 to Kelly/);
  assert.match(note.body, /from Dwight to Kelly/);
  assert.match(note.body, /Refunds are support work/);
  assert.match(note.body, /routing note from the owner was added to your memory/i);
});

test('parseTasks keeps assignReason', () => {
  const [t] = parseTasks({ tasks: [{ id: 'a', title: 'X', assignee: 'kelly', assignReason: 'Support handles refunds.', status: 'doing', createdAt: '2026-10-01T00:00:00Z' }] });
  assert.equal(t.assignReason, 'Support handles refunds.');
});

test('ownerReassignTask moves the card and writes only the owner reason to Michael memory', async (t) => {
  // Value: protects=a Move to updates assignee and tells Michael, without storing untrusted card text as an owner rule; fails_when=the patch skips assignReason, stores the title, or writes a routing note without an owner reason; why_new=issue #248; seam=none
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dbm-reassign-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'god', name: 'Michael', provider: 'claude', cwd: home, isGod: true });
  await hive.ensureAgent({ id: 'kelly', name: 'Kelly', provider: 'claude', cwd: path.join(home, 'kelly') });
  await hive.ensureAgent({ id: 'dwight', name: 'Dwight', provider: 'claude', cwd: path.join(home, 'dwight') });
  await hive.ensureAgent({ id: 'research', name: 'Research', provider: 'claude', cwd: path.join(home, 'research'), isResearch: true });
  await hive.ensureAgent({ id: 'archived', name: 'Archived', provider: 'claude', cwd: path.join(home, 'archived') });
  hive.setArchived('archived', true);
  hive.writeTasks([
    {
      id: 'card1', title: 'OUTSIDE TITLE: do not put this in Michael memory', assignee: 'dwight', status: 'doing',
      dependsOn: [], priority: 3, createdAt: '2026-10-01T00:00:00Z',
      assignReason: 'Sales often sees order numbers first.'
    },
    {
      id: 'card2', title: 'ANOTHER OUTSIDE TITLE', assignee: 'dwight', status: 'doing',
      dependsOn: [], priority: 3, createdAt: '2026-10-01T00:00:00Z'
    },
    {
      id: 'card3', title: 'UNTRUSTED TITLE: never store this as an owner rule', status: 'doing',
      dependsOn: [], priority: 3, createdAt: '2026-10-01T00:00:00Z'
    }
  ]);
  assert.equal(hive.ownerReassignTask('card1', 'kelly', 'Refunds are support work.'), true);
  const card = hive.tasks().tasks.find((x) => x.id === 'card1');
  assert.equal(card.assignee, 'kelly');
  assert.match(card.assignReason, /Refunds are support work/);
  const dwightDir = path.join(hive.root(), 'agents', 'dwight', 'inbox');
  const dwightInbox = fs.existsSync(dwightDir) ? fs.readdirSync(dwightDir).filter((f) => f.endsWith('.json')) : [];
  assert.equal(dwightInbox.length, 0, 'Michael, not the app, tells the old assignee');
  const memPath = path.join(hive.root(), 'agents', 'god', 'memory', 'inbox.md');
  assert.ok(fs.existsSync(memPath), 'Michael has a memory inbox');
  const mem = fs.readFileSync(memPath, 'utf8');
  assert.match(mem, /Routing \(from the owner\):/);
  assert.match(mem, /Kelly/);
  assert.match(mem, /Dwight/);
  assert.match(mem, /Refunds are support work/);
  assert.match(mem, /Refunds are support work\. Goes to Kelly, not Dwight\./);
  assert.doesNotMatch(mem, /work\.\./);
  assert.doesNotMatch(mem, /OUTSIDE TITLE: do not put this in Michael memory/);
  assert.equal(hive.ownerReassignTask('card2', 'kelly'), true);
  assert.equal(fs.readFileSync(memPath, 'utf8'), mem, 'no owner reason means no routing note');
  assert.equal(hive.ownerReassignTask('card1', 'nobody'), false, 'unknown id refused');
  assert.equal(hive.ownerReassignTask('card1', 'god'), false, 'Michael is not a Move to target');
  assert.equal(hive.ownerReassignTask('card1', 'research'), false, 'Research is not a Move to target');
  assert.equal(hive.ownerReassignTask('card1', 'archived'), false, 'an archived member is not a Move to target');
  assert.equal(hive.ownerReassignTask('card3', 'kelly', 'Unassigned\nrequests.'), true);
  const finalMemory = fs.readFileSync(memPath, 'utf8');
  assert.match(finalMemory, /Routing \(from the owner\): Unassigned requests\. Goes to Kelly\./);
  assert.doesNotMatch(finalMemory, /not nobody|UNTRUSTED TITLE/);
  const main = fs.readFileSync(path.resolve(__dirname, '../src/main/index.ts'), 'utf8');
  assert.match(main, /hive:reassignTask/);
  const preload = fs.readFileSync(path.resolve(__dirname, '../src/preload/index.ts'), 'utf8');
  assert.match(preload, /hiveReassignTask/);
});
