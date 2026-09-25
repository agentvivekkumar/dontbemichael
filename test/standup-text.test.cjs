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

const { OPS_STANDUP_MISSION, OPS_STANDUP_BODY_BEFORE_2026_09_25 } = loadTs('src/main/config.ts');

test('the standup says nothing about compaction, and has no dashes', () => {
  assert.doesNotMatch(OPS_STANDUP_MISSION.body, /compact/i);
  assert.doesNotMatch(OPS_STANDUP_MISSION.body, /[–—]/);
});

test('the old text is recognised exactly as offices stored it', () => {
  const stored = 'Hourly ops standup. Review every agent: who is doing what, and confirm each is still running (not stalled or idle-stale). Check the task board — are in-flight tasks on track, and is anything blocked or unowned? Flag stale agents and at-risk tasks, and keep the board accurate. (As part of this standup each working agent is asked to summarise its current task and the next step, then compact and resume from the same point — so terminal contexts stay bounded without losing work. The compaction is queued and runs when an agent is idle, so it never interrupts work mid-step.)';
  assert.equal(OPS_STANDUP_BODY_BEFORE_2026_09_25, stored);
});

test('boot moves only an untouched old standup to the new text', () => {
  const main = fs.readFileSync(path.resolve(__dirname, '../src/main/index.ts'), 'utf8');
  assert.match(main, /m\.id === OPS_STANDUP_MISSION\.id && m\.body === OPS_STANDUP_BODY_BEFORE_2026_09_25 \? \{ \.\.\.m, body: OPS_STANDUP_MISSION\.body \} : m/);
});
