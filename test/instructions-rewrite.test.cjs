'use strict';

/**
 * The one-time rewrite of existing team members (owner, 2026-09-25: "rewrite
 * all"): each pack member on the floor gets today's Role description and Work
 * style, after roster.json is backed up. Michael, the assistant and agents that
 * match no pack are left alone.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { rewrittenInstructions, teamMemberRole, teamMemberGoal } = loadTs('src/shared/teamPlan.ts');
const { RosterStore, rosterPath, rosterBackupDir } = loadTs('src/main/roster.ts');

const def = (id, over = {}) => ({
  schemaVersion: 1, id, role: 'Front desk', summary: 'Answers the phone.',
  routing: 'calls, bookings and walk ins', workStyle: 'You run the front desk at {Business} in {City}.',
  does: [], wontDo: [], connections: [], tools: [], ...over
});
const business = { name: 'Sunny Dental', city: 'Austin' };

test('a pack member gets the pack text; Michael, the assistant and others are untouched', () => {
  const defs = new Map([['pam', def('pam')], ['michael', def('michael')]]);
  const out = rewrittenInstructions([
    { id: 'pam', description: 'old role', goal: 'old goal' },
    { id: 'michael', description: 'x', goal: 'y', isGod: true },
    { id: 'helper', description: 'x', goal: 'y', isAssistant: true },
    { id: 'custom-1', description: 'mine', goal: 'mine' }
  ], defs, business);
  assert.deepEqual(out, [{
    id: 'pam',
    description: 'Front desk: calls, bookings and walk ins',
    goal: 'You run the front desk at Sunny Dental in Austin.'
  }]);
  assert.equal(out[0].description, teamMemberRole(defs.get('pam')));
  assert.equal(out[0].goal, teamMemberGoal(defs.get('pam'), business));
});

test('an agent already on today\'s text is not rewritten', () => {
  const defs = new Map([['pam', def('pam')]]);
  const current = { id: 'pam', description: teamMemberRole(defs.get('pam')), goal: teamMemberGoal(defs.get('pam'), business) };
  assert.deepEqual(rewrittenInstructions([current], defs, business), []);
});

test('backupNow copies roster.json into roster-backups before the change', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-rewrite-'));
  const store = new RosterStore(() => home);
  assert.equal(store.backupNow('instructions-rewrite'), true, 'nothing to copy is fine');
  assert.equal(fs.existsSync(rosterBackupDir(home)), false);
  fs.writeFileSync(rosterPath(home), JSON.stringify({ version: 1, agents: [{ id: 'pam' }], archived: [], restorable: [], queues: {} }));
  assert.equal(store.backupNow('instructions-rewrite'), true);
  const files = fs.readdirSync(rosterBackupDir(home));
  assert.equal(files.length, 1);
  assert.match(files[0], /-instructions-rewrite\.json$/);
});

test('the rewrite runs once, backs up first, and stops if the backup fails', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../src/renderer/src/hooks/useHive.ts'), 'utf8');
  const at = src.indexOf('async function rewriteTeamInstructions(');
  assert.ok(at > 0);
  const fn = src.slice(at, src.indexOf('\n}\n', at));
  assert.match(fn, /if \(config\.instructionsRewritten\) return;/);
  const backup = fn.indexOf("rosterBackup('instructions-rewrite')");
  const apply = fn.indexOf('rewriteInstructions(patches)');
  assert.ok(backup > 0 && apply > backup, 'backup before the change');
  assert.match(fn, /if \(!backup\.ok\) return;/);
  assert.match(fn, /hivePatchAgentRole\(p\.id, p\.description\)/);
  assert.match(fn, /updateConfig\(\{ instructionsRewritten: true \}\)/);
  assert.match(src, /void rewriteTeamInstructions\(config\)\.catch\(\(\) => undefined\)\.then\(\(\) => startBusinessTeam\(config\)\);/);
});
