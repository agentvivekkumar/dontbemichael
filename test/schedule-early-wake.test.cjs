'use strict';

// A weekly or "times" schedule waits with setTimeout, which counts on the
// monotonic clock, while its slots are wall clock times. Over a wait of up to a
// week an NTP correction moves Date.now(), so the timer can wake a little
// before its slot by the wall clock. The re-arm then asked for "the first slot
// after now", got the same slot back, and sent the run a second time.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

process.env.TZ = 'UTC';

const M = loadTs('src/shared/missions.ts');
const T = loadTs('src/shared/scheduleTimes.ts');

const MIN = 60_000;
const WEEK = 7 * 86_400_000;
const at = (y, m, d, h = 0, min = 0) => new Date(Date.UTC(y, m - 1, d, h, min)).getTime();
// Monday 9 November 2026, 09:00.
const slot = at(2026, 11, 9, 9, 0);
const weekly = { type: 'weekly', weekly: { days: [1], minute: 540 }, firstDelayMs: 0 };
const times = { type: 'times', times: T.normalizeTimes([{ kind: 'at', days: [1], minute: 540 }]), firstDelayMs: 0 };

for (const early of [1, 1000, 30_000]) {
  test(`a weekly timer that wakes ${early} ms early runs its slot once`, () => {
    const now = slot - early;
    // fire() stamped lastFiredAt with the early wall clock.
    const next = M.nextSlotAfter(weekly, now, now, slot);
    assert.equal(next.at, slot + WEEK, 'the same slot came back and would run again');
    assert.equal(next.delayMs, slot + WEEK - now);
  });
}

test('a "times" line that wakes early runs its slot once too', () => {
  const now = slot - 1000;
  assert.equal(M.nextSlotAfter(times, now, now, slot).at, slot + WEEK);
});

test('an every-minute line woken early still runs every minute', () => {
  const every = { type: 'times', times: T.normalizeTimes([{ kind: 'every', everyMs: MIN }]), firstDelayMs: 0 };
  const now = slot - 2;
  const next = M.nextSlotAfter(every, now, now, slot);
  assert.equal(next.at, slot + MIN);
  assert.equal(next.delayMs, MIN + 2);
});

test('a timer that wakes late waits only what is left to the next slot', () => {
  const now = slot + 250;
  const next = M.nextSlotAfter(weekly, now, now, slot);
  assert.equal(next.at, slot + WEEK);
  assert.equal(next.delayMs, WEEK - 250);
});

test('a plain re-arm is unchanged: a slot missed an hour ago is caught up now', () => {
  const now = slot + 60 * MIN;
  assert.deepEqual(M.nextSlotAfter(weekly, now, slot - WEEK), { at: now, delayMs: 0 });
  assert.equal(M.nextSlotAfter(weekly, now, slot - WEEK).delayMs, M.armPlan({
    id: 'w', label: 'w', intervalMs: 0, to: 'pam', body: '', enabled: true,
    weekly: weekly.weekly, lastFiredAt: slot - WEEK
  }, now, { standupId: 'x', standupFiredThisLaunch: true }).firstDelayMs);
});

test('a catch-up run that could not save its stamp does not run again at once', () => {
  const now = slot + 60 * MIN;
  // fire() ran the missed slot; the stored lastFiredAt is still last week's.
  const next = M.nextSlotAfter(weekly, now, slot - WEEK, now);
  assert.equal(next.at, slot + WEEK);
});

test('a clock set back by weeks re-arms from now, not from the served slot', () => {
  // Past 2^31-1 ms Node fires a timer after 1 ms, so a wait of the whole jump
  // would run the job in a loop.
  const LIMIT = 2 ** 31 - 1;
  const served = slot;
  const now = slot - 20 * 86_400_000;
  const next = M.nextSlotAfter(weekly, now, now, served);
  assert.ok(next.delayMs <= WEEK && next.delayMs < LIMIT, `waits ${next.delayMs} ms`);
  const every = { type: 'times', times: T.normalizeTimes([{ kind: 'every', everyMs: MIN }]), firstDelayMs: 0 };
  const back = slot - 40 * 86_400_000;
  assert.ok(M.nextSlotAfter(every, back, back, served).delayMs <= MIN, 'an every-minute line went quiet');
});

test('the served slot is trusted up to exactly EARLY_WAKE_MAX_MS ahead', () => {
  assert.equal(M.EARLY_WAKE_MAX_MS, 5 * MIN);
  const atEdge = slot - M.EARLY_WAKE_MAX_MS;
  assert.equal(M.nextSlotAfter(weekly, atEdge, atEdge, slot).at, slot + WEEK, 'the edge itself is an early wake');
  const beyond = atEdge - 1;
  // Too far ahead to be an early wake: a plain re-arm, which finds that slot.
  assert.equal(M.nextSlotAfter(weekly, beyond, beyond, slot).at, slot);
});

test('the stamp names the slot an early wake ran, and nothing else', () => {
  assert.equal(M.servedStamp(slot - 1000, slot), slot);
  assert.equal(M.servedStamp(slot + 250, slot), slot + 250, 'a late wake stamps the real time');
  assert.equal(M.servedStamp(slot - M.EARLY_WAKE_MAX_MS - 1, slot), slot - M.EARLY_WAKE_MAX_MS - 1, 'a clock set back stamps the real time');
  assert.equal(M.servedStamp(slot - 1000), slot - 1000, 'Run now and interval jobs stamp the real time');
});

test('after an early wake, any later re-arm sees the slot as run (save, Run now, wake from sleep)', () => {
  const stamp = M.servedStamp(slot - 1000, slot);
  // Still in the early-wake window: a plain re-arm doesn't come back to the slot.
  assert.equal(M.nextSlotAfter(weekly, slot - 500, stamp).at, slot + WEEK);
  assert.equal(M.nextSlotAfter(times, slot - 500, stamp).at, slot + WEEK);
  // The next morning's wake from sleep, inside the 6 h catch-up window.
  assert.equal(M.nextSlotAfter(weekly, slot + 10 * MIN, stamp).at, slot + WEEK);
  assert.equal(M.nextSlotAfter(times, slot + 10 * MIN, stamp).at, slot + WEEK);
  // The old stamp (just before the slot) ran it again on both.
  assert.equal(M.nextSlotAfter(weekly, slot + 10 * MIN, slot - 1000).at, slot + 10 * MIN);
});

test('the scheduler stamps and re-arms from the slot it just ran', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'index.ts'), 'utf8');
  const start = src.indexOf('const rearm = (served?: number)');
  assert.ok(start > 0, 'rearm takes the served slot');
  const end = src.indexOf('missionTimers.set(m.id, entry);', start);
  assert.ok(end > start, 'the rearm block ends where it should');
  const body = src.slice(start, end);
  assert.match(body, /nextSlotAfter\(plan, now, persisted, served\)/);
  assert.match(body, /setTimeout\(\(\) => \{ fire\(next\.at\); rearm\(next\.at\); \}, next\.delayMs\)/);
  assert.match(body, /catch \(e\) \{[\s\S]*setTimeout\(\(\) => rearm\(served\), 60_000\)/);
  assert.match(body, /rearm\(\);/);
  assert.match(src, /lastFiredAt: servedStamp\(Date\.now\(\), served\)/);
  assert.match(src, /const fire = \(served\?: number\): void => \{[\s\S]{0,400}sendMission\(m, served\)/);
});
