'use strict';

/**
 * The hourly standup fires every time the office opens (owner, 2026-09-25):
 * once per launch, as soon as Michael is up, then hourly from there. It used
 * to fire only when overdue, and on a brand-new office the first fire happened
 * before setup, with no office to send to, so it was lost.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const main = fs.readFileSync(path.resolve(__dirname, '../src/main/index.ts'), 'utf8');

test('Michael coming up sends the standup, once per launch', () => {
  assert.match(main, /if \(res\.ok && opts\.hive\?\.isGod\) standupOnOfficeOpen\(\);/);
  const at = main.indexOf('function standupOnOfficeOpen(): void {');
  assert.ok(at > 0);
  const fn = main.slice(at, main.indexOf('\n}\n', at));
  assert.match(fn, /if \(standupFiredThisLaunch \|\| !hive\.enabled\(\)\) return;/, 'once, and only with an office');
  assert.match(fn, /if \(!m \|\| !m\.enabled \|\| normalizeWeekly\(m\.weekly\) \|\| !\(m\.intervalMs > 0\)\) return;/, 'only an enabled hourly standup');
  assert.match(fn, /hive\.send\(\{ to: m\.to, act: 'inform', subject: m\.label, body: scheduledRunBody\(m\.label, m\.body\) \}, 'scheduler'\);/);
  assert.match(fn, /syncMissions\(\);/, 'the next one comes an interval after this one');
});

test('the interval timer never sends a second standup at launch', () => {
  // The decision moved into shared/missions.ts (armPlan); missions.test.cjs
  // checks the waits themselves with fake clocks.
  assert.match(main, /armPlan\(m, Date\.now\(\), \{ standupId: OPS_STANDUP_MISSION\.id, standupFiredThisLaunch \}\)/);
  const shared = fs.readFileSync(path.resolve(__dirname, '../src/shared/missions.ts'), 'utf8');
  assert.match(shared, /const waitForOpen = m\.id === ctx\.standupId && !ctx\.standupFiredThisLaunch;/);
  assert.match(shared, /const firstDelayMs = waitForOpen \? m\.intervalMs : Math\.max\(0,/);
});
