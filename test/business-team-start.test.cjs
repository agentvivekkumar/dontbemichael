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
  assert.match(fn, /if \(reg\?\.agents\?\.\[id\]\) continue;/, 'a member already in the registry is not started twice');
  assert.match(fn, /if \(!res\.ok\) \{[\s\S]{0,120}continue;\s*\}/, 'a failed start skips that member only');
  assert.match(fn, /cwd: member\.folder,[\s\S]{0,200}hive: \{ id, name, provider, cwd: member\.folder, role \}/, 'spawned inside its own folder');
  assert.match(fn, /goal: teamMemberGoal\(def, \{ name: config\.businessName, city: config\.businessCity \}\)/);
  assert.match(fn, /\}, \{ select: false \}\);/, 'the card appears without taking the focus');
  assert.match(fn, /\.find\(\(p\) => p\.businessType === config\.businessType\) \?\? core;/, '"Something else" starts from the core pack');
  assert.match(fn, /await window\.cth\.updateConfig\(\{ businessTeamStarted: true \}\)/);

  // Michael: the Office folder when there is one, the harness folder otherwise.
  assert.match(hive, /const godCwd = config\.officeFolder \|\| config\.harnessHome!;/);
  assert.match(hive, /hive: \{ id: GOD_ID, name: godName, provider: godProvider, cwd: godCwd, isGod: true/);
  // The team starts only after Michael is up.
  // (The other 'ready' is the already-running path, which starts nothing.)
  const start = hive.indexOf('void startBusinessTeam(config);');
  const ready = hive.lastIndexOf("useStore.getState().setGodStatus('ready');", start);
  assert.ok(ready > 0 && start > ready && start - ready < 400, 'started right after Michael is ready');
});
