'use strict';

/**
 * Issue #55: skip the hourly standup when the floor has nothing for Michael.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const M = loadTs('src/shared/missions.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

const HOUR = 3_600_000;
const idle = () => ({
  ownerRequestIds: [],
  stuckCardIds: [],
  tasks: [],
  liveAgentIds: ['god', 'pam'],
  fleetAgents: [{ id: 'pam', breaker: 'healthy', lastActiveSecAgo: 10, inboxBacklog: 0 }]
});

test('idle floor within 4h of last dispatch skips', () => {
  // Value: protects=quiet hours do not wake Opus; fails_when=idle still fires; why_new=#55; seam=none
  const d = M.standupShouldRun({ inputs: idle(), now: 10 * HOUR, lastDispatchedAt: 9 * HOUR });
  assert.equal(d.action, 'skip');
});

test('open owner request, stuck card, unowned doing, stalled fleet each fire', () => {
  // Value: protects=each standup focus item alone wakes Michael; fails_when=any signal is ignored; why_new=#55; seam=none
  assert.equal(M.standupShouldRun({
    inputs: { ...idle(), ownerRequestIds: ['r1'] }, now: 10 * HOUR, lastDispatchedAt: 9 * HOUR
  }).action, 'fire');
  assert.equal(M.standupShouldRun({
    inputs: { ...idle(), stuckCardIds: ['c1'] }, now: 10 * HOUR, lastDispatchedAt: 9 * HOUR
  }).reason, 'work');
  assert.equal(M.standupShouldRun({
    inputs: { ...idle(), tasks: [{ id: 't1', status: 'doing' }] }, now: 10 * HOUR, lastDispatchedAt: 9 * HOUR
  }).action, 'fire');
  assert.equal(M.standupShouldRun({
    inputs: {
      ...idle(),
      fleetAgents: [{ id: 'pam', breaker: 'healthy', lastActiveSecAgo: M.STANDUP_STALL_SEC, inboxBacklog: 0 }]
    },
    now: 10 * HOUR, lastDispatchedAt: 9 * HOUR
  }).action, 'fire');
  assert.equal(M.standupShouldRun({
    inputs: {
      ...idle(),
      fleetAgents: [{ id: 'pam', breaker: 'steering', lastActiveSecAgo: 1, inboxBacklog: 0 }]
    },
    now: 10 * HOUR, lastDispatchedAt: 9 * HOUR
  }).action, 'fire');
});

test('safety floor fires after 4h even when idle', () => {
  // Value: protects=a quiet office still gets a periodic check; fails_when=idle skips forever; why_new=#55; seam=none
  const d = M.standupShouldRun({
    inputs: idle(), now: 10 * HOUR, lastDispatchedAt: 10 * HOUR - M.STANDUP_SAFETY_MS
  });
  assert.deepEqual(d, { action: 'fire', reason: 'safety-floor', fingerprint: d.fingerprint });
});

test('office open always fires', () => {
  // Value: protects=launch standup never skips; fails_when=force is ignored; why_new=#55; seam=none
  const d = M.standupShouldRun({ inputs: idle(), now: 1, lastDispatchedAt: 1, force: 'office-open' });
  assert.equal(d.action, 'fire');
  assert.equal(d.reason, 'office-open');
});

test('fingerprint is stable for the same inputs and changes when work appears', () => {
  // Value: protects=skip decisions are reproducible; fails_when=order of ids flips the print; why_new=#55; seam=none
  const a = M.standupInputFingerprint({ ...idle(), ownerRequestIds: ['b', 'a'] });
  const b = M.standupInputFingerprint({ ...idle(), ownerRequestIds: ['a', 'b'] });
  assert.equal(a, b);
  const c = M.standupInputFingerprint({ ...idle(), stuckCardIds: ['x'] });
  assert.notEqual(a, c);
});

test('fire() skips the standup on a quiet floor and stamps lastSkippedAt; office open always sends', () => {
  // Value: protects=hourly path skips, open path does not; fails_when=wiring leaves fire; why_new=#55; seam=source pin
  const main = read('src/main/index.ts');
  assert.match(main, /standupShouldRun\(\{/);
  assert.match(main, /gatherStandupFloorInputs\(/);
  assert.match(main, /lastSkippedAt: stamp/);
  assert.match(main, /delete next\.lastSkippedAt/);
  assert.match(main, /force: 'office-open'/);
  assert.match(main, /Always send on office open/);
  const list = read('src/renderer/src/components/triggers/ScheduleList.tsx');
  assert.match(list, /schedulesSection\.skipped/);
  const en = JSON.parse(read('src/renderer/src/i18n/locales/en.json'));
  assert.equal(en.schedulesSection.skipped, 'Skipped: nothing to do, {{time}}');
  assert.doesNotMatch(en.schedulesSection.skipped, /[–—]| - /);
});
