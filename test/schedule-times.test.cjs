'use strict';

/**
 * One job, several "when" lines (owner, 2026-09-27: "every 2 hours on weekdays
 * and 2 pm on weekends"). src/shared/scheduleTimes.ts plus how missions.ts,
 * main's timer and the editor use it. Times are local: the dates below are
 * built with the local Date constructor, like the scheduler does.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const T = loadTs('src/shared/scheduleTimes.ts');
const M = loadTs('src/shared/missions.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

const at = (d, h, m = 0) => new Date(2026, 8, d, h, m).getTime(); // Sep 2026: 26 Sat, 27 Sun, 28 Mon
const H = 3_600_000;
const owners = [
  { kind: 'every', everyMs: 2 * H, days: [1, 2, 3, 4, 5], from: 8 * 60, to: 18 * 60 },
  { kind: 'at', days: [0, 6], minute: 14 * 60 }
];

test('lines are made canonical; a bad line spoils the set', () => {
  assert.deepEqual(T.normalizeTimes(owners), owners);
  assert.deepEqual(T.normalizeLine({ kind: 'every', everyMs: H, days: [0, 1, 2, 3, 4, 5, 6], from: 0, to: 1439 }), { kind: 'every', everyMs: H }, 'all days, all day is plain');
  assert.equal(T.normalizeTimes([...owners, { kind: 'every', everyMs: 2 * 86_400_000 }]), null, 'every is at most a day in a line');
  assert.equal(T.normalizeTimes([{ kind: 'every', everyMs: H, from: 600, to: 500 }]), null, 'window ends before it starts');
  assert.equal(T.normalizeTimes([{ kind: 'at', days: [], minute: 60 }]), null);
  assert.equal(T.normalizeTimes([]), null);
});

test('every 2h on weekdays 08:00 to 18:00 plus weekends at 14:00', () => {
  // Sunday morning: next is Sunday 14:00, then Monday 08:00, 10:00 ...
  assert.equal(T.nextTimesFireMs(owners, at(27, 9)), at(27, 14));
  assert.equal(T.nextTimesFireMs(owners, at(27, 14)), at(28, 8));
  assert.equal(T.nextTimesFireMs(owners, at(28, 8)), at(28, 10));
  assert.equal(T.nextTimesFireMs(owners, at(28, 17, 59)), at(28, 18));
  assert.equal(T.nextTimesFireMs(owners, at(28, 18)), at(29, 8), 'nothing after 18:00');
  assert.equal(T.previousTimesFireMs(owners, at(28, 11)), at(28, 10));
});

test('a missed slot runs once when the app opens, never as a backlog', () => {
  // Closed at 21:00 Friday, opened 07:15 Monday: nothing to catch up, wait for 08:00.
  assert.equal(T.timesDelayMs(owners, at(28, 7, 15), at(25, 18)), at(28, 8) - at(28, 7, 15));
  // Opened 09:30 Monday, the 08:00 slot never ran: one run now.
  assert.equal(T.timesDelayMs(owners, at(28, 9, 30), at(27, 14)), 0);
  // ...and after it ran, the next wait is to 10:00.
  assert.equal(T.timesDelayMs(owners, at(28, 9, 31), at(28, 9, 30)), at(28, 10) - at(28, 9, 31));
});

test('the lines read as words', () => {
  assert.equal(T.formatTimes(owners), 'every 2h weekdays 08:00 to 18:00, weekends at 14:00');
  assert.equal(T.formatLine({ kind: 'every', everyMs: 30 * 60_000, days: [1, 3] }), 'every 30m Mon, Wed');
});

test('agents ask for several times in one request, and the old forms still work', () => {
  const both = M.parseWhen([{ every: '2h', days: ['weekdays'], between: ['08:00', '18:00'] }, { days: ['weekends'], at: '14:00' }]);
  assert.deepEqual(both.times, owners);
  assert.deepEqual(M.parseWhen({ every: '3d' }), { intervalMs: 3 * 86_400_000 }, 'plain every keeps its long range');
  assert.deepEqual(M.parseWhen({ days: ['fri'], at: '09:00' }), { intervalMs: 86_400_000, weekly: { days: [5], minute: 540 } });
  assert.deepEqual(M.parseWhen([{ every: '1h' }]), { intervalMs: H }, 'one plain line is stored the old way');
  assert.equal(M.parseWhen([{ every: '2h', between: ['18:00', '08:00'] }]), null);
  assert.equal(M.parseWhen([{ every: '2h' }, { days: ['xyz'], at: '09:00' }]), null);
});

test('an approved request with times adds or updates one schedule with them', () => {
  const missions = [{ id: 'm1', label: 'Check Emails', intervalMs: 2 * H, to: 'nick', body: '', enabled: true, createdBy: 'owner' }];
  const add = M.buildScheduleRequest('nick', { op: 'add', label: 'Check Emails', when: [{ every: '2h', days: ['weekdays'], between: ['08:00', '18:00'] }, { days: ['weekends'], at: '14:00' }] }, missions, 'god', 1, 'r1');
  assert.equal(add.ok, true);
  const added = M.applyScheduleRequest(add.request, missions, 'm2');
  assert.deepEqual(added.missions[1].times, owners);
  const upd = M.buildScheduleRequest('nick', { op: 'update', id: 'm1', when: [{ days: ['weekdays'], at: '08:00' }, { days: ['weekdays'], at: '14:00' }] }, missions, 'god', 1, 'r2');
  const updated = M.applyScheduleRequest(upd.request, missions, 'x').missions[0];
  assert.equal(updated.times.length, 2);
  // Back to one plain line clears the extra lines.
  const back = M.buildScheduleRequest('nick', { op: 'update', id: 'm1', when: { every: '4h' } }, [updated], 'god', 1, 'r3');
  const plain = M.applyScheduleRequest(back.request, [updated], 'x').missions[0];
  assert.equal(plain.times, undefined);
  assert.equal(plain.intervalMs, 4 * H);
});

test('the timer plan, next run and fingerprint know about times', () => {
  const m = { id: 'm', label: 'Check Emails', intervalMs: 2 * H, times: owners, to: 'nick', body: '', enabled: true };
  const plan = M.armPlan(m, at(27, 9), { standupId: 's', standupFiredThisLaunch: true });
  assert.equal(plan.type, 'times');
  assert.equal(plan.firstDelayMs, at(27, 14) - at(27, 9));
  assert.equal(M.nextRunAt(m, at(27, 9)), at(27, 14));
  const old = { id: 'o', label: 'Check Emails', intervalMs: 2 * H, to: 'nick', body: '', enabled: true };
  assert.equal(M.missionFingerprint(old), JSON.stringify(['Check Emails', 2 * H, '', true]), 'rows without times keep their fingerprint');
  assert.notEqual(M.missionFingerprint(m), M.missionFingerprint(old));
  // An upsert without times drops them.
  const list = M.upsertMission([m], { ...m, times: undefined });
  assert.equal('times' in list[0], false);
});

test('main arms times like weekly, refuses bad lines, and agents are told how to ask', () => {
  const main = read('src/main/index.ts');
  assert.match(main, /if \(plan\.type === 'weekly' \|\| plan\.type === 'times'\) \{/);
  assert.match(main, /plan\.type === 'times' \? timesDelayMs\(plan\.times, now, floor\) : weeklyDelayMs\(plan\.weekly, now, floor\)/);
  assert.match(main, /if \(!times\) return \{ ok: false, error: 'invalid schedule times' \};/);
  assert.match(read('src/main/hive.ts'), /One job can have several: \\`"when": \[/);
  const list = read('src/renderer/src/components/triggers/ScheduleList.tsx');
  assert.match(list, /<WhenLines lines=\{lines\} onChange=\{setLines\} \/>/);
  assert.match(list, /if \(times\) return formatTimes\(times\);/);
  for (const loc of ['en', 'zh-CN', 'ar']) {
    const u = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).triggersUi;
    for (const k of ['addTime', 'removeTime', 'onlyBetween', 'and', 'windowHint', 'timeN']) assert.ok(u[k], `${loc}: ${k}`);
  }
});
