'use strict';

/**
 * Agents get no instructions about compaction (owner, 2026-09-25): keeping
 * contexts small is the app's job. The standup no longer mentions it, and an
 * office still carrying the old text word for word is moved to the new one.
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
  exports: { app: { getPath: () => os.tmpdir() } }
};

const { OPS_STANDUP_MISSION, OPS_STANDUP_BUILT_IN_BODIES } = loadTs('src/main/config.ts');

test('the standup carries no prompt: what Michael does at a standup is in his own instructions', () => {
  assert.equal(OPS_STANDUP_MISSION.body, '');
  assert.equal(OPS_STANDUP_MISSION.label, 'Hourly ops standup');
  const hive = fs.readFileSync(path.resolve(__dirname, '../src/main/hive.ts'), 'utf8');
  assert.match(hive, /At the hourly ops standup, review every agent via fleet\.json/);
});

test('both texts the app shipped are recognised exactly as offices stored them', () => {
  assert.equal(OPS_STANDUP_BUILT_IN_BODIES.length, 2);
  assert.match(OPS_STANDUP_BUILT_IN_BODIES[0], /then compact and resume from the same point \u2014 so terminal/);
  assert.match(OPS_STANDUP_BUILT_IN_BODIES[1], /Check the task board: are in-flight tasks on track/);
});

test('boot clears only a standup text the app shipped; the owner\'s own text stays', () => {
  const main = fs.readFileSync(path.resolve(__dirname, '../src/main/index.ts'), 'utf8');
  assert.match(main, /m\.id === OPS_STANDUP_MISSION\.id && OPS_STANDUP_BUILT_IN_BODIES\.includes\(m\.body\) \? \{ \.\.\.m, body: OPS_STANDUP_MISSION\.body \} : m/);
});
