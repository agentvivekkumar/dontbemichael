'use strict';

/**
 * Starting the team picked during onboarding (Decisions 44, 47): the step that
 * turns the finish screen's saved `businessTeam` into agents on the floor. It
 * lives inside the useHive hook, which does not load under node, so this pins
 * the rules in its source. The whole flow (finish → relaunch → Michael up →
 * each member spawned in its folder) needs an end-to-end run to prove.
 *
 * The rules, each of which fails quietly if lost:
 *  - it runs once: `businessTeamStarted` stops a second run, and a member the
 *    registry already has is skipped, so a crash midway never doubles a card;
 *  - one member failing to start does not stop the rest;
 *  - the cards appear without taking the focus off Michael;
 *  - Michael works in the Office folder on a business install, and in the
 *    harness folder on an older one, exactly as before.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const hive = fs.readFileSync(path.resolve(__dirname, '../src/renderer/src/hooks/useHive.ts'), 'utf8');

test('the onboarding team starts once, each member in its folder, and Michael keeps the focus', () => {
  const at = hive.indexOf('async function startBusinessTeam(config: HarnessConfig)');
  assert.ok(at > 0, 'startBusinessTeam exists');
  const fn = hive.slice(at, hive.indexOf('\nexport function useHive', at));

  assert.match(fn, /if \(team\.length === 0 \|\| config\.businessTeamStarted\) return;/, 'runs once');
  // A member the floor already holds is not started twice; one the registry
  // knows but the floor lost comes back (office-record.test.cjs).
  assert.match(fn, /const decision = teamMemberStart\(id, member\.folder, floorIds,[^\n]*\);\s*if \(!decision\.start\) continue;/, 'a member already on the floor is not started twice');
  assert.match(fn, /if \(!res\.ok\) \{[\s\S]{0,120}continue;\s*\}/, 'a failed start skips that member only');
  assert.match(fn, /cwd: workFolder,[\s\S]{0,200}hive: \{ id, name, provider, cwd: workFolder, role \}/, 'spawned inside its own folder');
  assert.match(fn, /goal: teamMemberGoal\(def, \{ name: config\.businessName, city: config\.businessCity \}\)/);
  assert.match(fn, /\}, \{ select: false \}\);/, 'the card appears without taking the focus');
  assert.match(fn, /\.find\(\(p\) => p\.businessType === config\.businessType\) \?\? byTeam \?\? core;/, '"Something else" starts from the core pack');
  assert.match(fn, /\(coverage\(p\) > coverage\(best\) \? p : best\), core\);/, 'core wins ties, so a team picked from core stays on core');
  assert.match(fn, /await window\.cth\.updateConfig\(\{ businessTeamStarted: true \}\)/);

  // Michael: asked for in the Office folder when there is one (main moves him up
  // to the business folder that holds it), the harness folder otherwise; the
  // floor records wherever main actually started him.
  assert.match(hive, /const requestedCwd = config\.officeFolder \|\| config\.harnessHome!;/);
  assert.match(hive, /hive: \{ id: GOD_ID, name: godName, provider: godProvider, cwd: requestedCwd, isGod: true/);
  assert.match(hive, /const godCwd = res\.cwd \|\| requestedCwd;/);
  // The team starts only after Michael is up.
  // (The other 'ready' is the already-running path, which starts nothing.)
  const start = hive.indexOf('void startBusinessTeam(config);');
  const ready = hive.lastIndexOf("useStore.getState().setGodStatus('ready');", start);
  assert.ok(ready > 0 && start > ready && start - ready < 400, 'started right after Michael is ready');
});
