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
  assert.match(main, /const waitForOpen = m\.id === OPS_STANDUP_MISSION\.id && !standupFiredThisLaunch;/);
  assert.match(main, /const remaining = waitForOpen \? m\.intervalMs : Math\.max\(0,/);
});
