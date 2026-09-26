'use strict';
/**
 * Edge cases the per-agent schedules branch left untested (ship coverage audit,
 * 2026-09-25): the less common `when` shapes, update requests that change only
 * one part, the fallbacks in the scheduler's arm plan, the Messages tab's
 * corner cases, the history read's limits and redaction, and the ASK ME
 * schedule request cards.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

process.env.TZ = 'UTC';

const M = loadTs('src/shared/missions.ts');
const { messageView, localDay, gist } = loadTs('src/shared/messageView.ts');
const { HiveManager } = loadTs('src/main/hive.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

const HOUR = 3_600_000;
const ctx = { standupId: 'ops-standup', standupFiredThisLaunch: true };
const mk = (over = {}) => ({ id: 'm1', label: 'Triage the inbox', intervalMs: HOUR, to: 'pam', body: '', enabled: true, ...over });
const build = (p, list = [mk()]) => M.buildScheduleRequest('pam', p, list, 'god', 0, 'r');

/* ───────────────────────────── parseWhen ───────────────────────────── */

test('parseWhen: weekends, daily and every day', () => {
  assert.deepEqual(M.parseWhen({ days: ['weekends'], at: '10:00' }).weekly, { days: [0, 6], minute: 600 });
  assert.deepEqual(M.parseWhen({ days: ['daily'], at: '08:15' }).weekly.days, [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(M.parseWhen({ days: ['Every Day'], at: '08:15' }).weekly.days, [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(M.parseWhen({ days: ['weekdays', 'sat'], at: '08:00' }).weekly.days, [1, 2, 3, 4, 5, 6], 'lists merge');
});

test('parseWhen: unit spellings and case', () => {
  assert.deepEqual(M.parseWhen({ every: '2H' }), { intervalMs: 2 * HOUR });
  assert.deepEqual(M.parseWhen({ every: '15 minutes' }), { intervalMs: 15 * 60_000 });
  assert.deepEqual(M.parseWhen({ every: ' 1 day ' }), { intervalMs: 86_400_000 });
  assert.deepEqual(M.parseWhen({ every: '3 hrs' }), { intervalMs: 3 * HOUR });
});

test('parseWhen refuses a non-text day, an empty day list, a bad time and a half-filled when', () => {
  assert.equal(M.parseWhen({ days: [1], at: '09:00' }), null, 'numbers are not day names');
  assert.equal(M.parseWhen({ days: [], at: '09:00' }), null, 'no days');
  assert.equal(M.parseWhen({ days: ['mon'], at: '9am' }), null);
  assert.equal(M.parseWhen({ days: ['mon'], at: '24:00' }), null, 'past the end of the day');
  assert.equal(M.parseWhen({ days: ['mon'] }), null, 'days without a time');
  assert.equal(M.parseWhen({ every: 2 }), null, 'every must be text');
  assert.equal(M.parseWhen('2h'), null, 'a bare string is not a when');
});

/* ───────────────────────── schedule requests ───────────────────────── */

test('an add trims its label and accepts exactly the maximum length', () => {
  const r = build({ op: 'add', label: '  Check invoices  ', when: { every: '1h' } });
  assert.equal(r.request.draft.label, 'Check invoices');
  assert.equal('weekly' in r.request.draft, false, 'an interval add carries no weekly');
  assert.equal(build({ op: 'add', label: 'x'.repeat(80), when: { every: '1h' } }).ok, true);
});

test('a non text id is refused like an unknown one', () => {
  const r = build({ op: 'pause', id: 1 });
  assert.equal(r.ok, false);
  assert.match(r.reason, /No schedule has that "id"/);
});

test('an update with only a new label keeps the weekly slot', () => {
  const list = [mk({ weekly: { days: [1], minute: 540 } })];
  const r = build({ op: 'update', id: 'm1', label: 'Renamed' }, list);
  assert.deepEqual(r.request.draft, { label: 'Renamed', intervalMs: HOUR, weekly: { days: [1], minute: 540 } });
  const applied = M.applyScheduleRequest(r.request, list, 'x').missions[0];
  assert.equal(applied.label, 'Renamed');
  assert.deepEqual(applied.weekly, { days: [1], minute: 540 });
});

test('an update to an interval switches a weekly schedule back to the interval', () => {
  const list = [mk({ weekly: { days: [1], minute: 540 } })];
  const r = build({ op: 'update', id: 'm1', when: { every: '2h' } }, list);
  assert.deepEqual(r.request.draft, { label: 'Triage the inbox', intervalMs: 2 * HOUR });
  const applied = M.applyScheduleRequest(r.request, list, 'x').missions[0];
  assert.equal('weekly' in applied, false);
  assert.equal(applied.intervalMs, 2 * HOUR);
});

test('an update with an unusable when is refused, even with a good label', () => {
  const r = build({ op: 'update', id: 'm1', label: 'Fine', when: { every: 'often' } });
  assert.equal(r.ok, false);
  assert.match(r.reason, /not usable/);
});

test('an add never goes stale; an update missing its draft is refused as invalid', () => {
  const add = build({ op: 'add', label: 'New', when: { every: '1h' } }).request;
  assert.equal(M.requestIsStale(add, []), false);
  const list = [mk()];
  const upd = build({ op: 'update', id: 'm1', label: 'X' }, list).request;
  const { draft, ...noDraft } = upd;
  assert.ok(draft);
  assert.deepEqual(M.applyScheduleRequest(noDraft, list, 'x'), { ok: false, error: 'invalid' });
});

test('Michael may ask about his schedules, including a legacy everyone row', () => {
  const list = [mk({ id: 'b', to: 'broadcast' })];
  const r = M.buildScheduleRequest('god', { op: 'pause', id: 'b' }, list, 'god', 0, 'r');
  assert.equal(r.ok, true);
  assert.equal(M.pauseMissionsOf(list, 'god', 'god').paused, 1, 'closing Michael pauses his everyone row too');
});

/* ───────────────────────────── scheduler ───────────────────────────── */

test('armPlan: an unusable weekly value falls back to the interval', () => {
  const plan = M.armPlan(mk({ weekly: { days: [], minute: 540 } }), 10 * HOUR, ctx);
  assert.equal(plan.type, 'interval');
  assert.equal(plan.everyMs, HOUR);
  assert.deepEqual(M.armPlan(mk({ intervalMs: 0, weekly: { days: [9], minute: 540 } }), 0, ctx), { type: 'skip' });
});

test('armPlan: a heartbeat with no interval never arms', () => {
  assert.deepEqual(M.armPlan(mk({ kind: 'heartbeat', intervalMs: 0, weekly: { days: [1], minute: 540 } }), 0, ctx), { type: 'skip' });
});

test('nextRunAt: a heartbeat ignores a weekly value and reads its interval', () => {
  const now = 10 * HOUR;
  assert.equal(M.nextRunAt(mk({ kind: 'heartbeat', weekly: { days: [1], minute: 540 }, lastFiredAt: now }), now), now + HOUR);
  assert.equal(M.nextRunAt(mk({ intervalMs: 0, lastFiredAt: now }), now), null);
});

test('firePayload: a relay with no older words sends only the relay message', () => {
  const p = M.firePayload(mk({ to: 'god', relay: true }));
  assert.doesNotMatch(p.body, /Older instructions/);
  assert.match(p.body, /^Scheduled run for the whole team: Triage the inbox\./);
});

test('upsert keeps a weekly value it was given, and leaves lastFiredAt unset when neither had one', () => {
  const next = M.upsertMission([mk()], mk({ weekly: { days: [2], minute: 60 } }));
  assert.deepEqual(next[0].weekly, { days: [2], minute: 60 });
  assert.equal(next[0].lastFiredAt, undefined);
});

test('migrateMissions on an empty list changes nothing', () => {
  assert.deepEqual(M.migrateMissions([]), { missions: [], changed: false });
});

/* ─────────────────────────── Messages tab ─────────────────────────── */

test('messageView: a lone message has no latest, a missing conversation groups by id, system notes count as other', () => {
  const v = messageView([
    { id: 'a', from: 'dwight', to: 'pam', act: 'request', subject: 'One', body: '', created_at: '2026-09-25T10:00:00Z' },
    { id: 'b', from: 'dwight', to: 'pam', act: 'request', subject: 'Two', body: '', created_at: '2026-09-25T11:00:00Z' },
    { id: 's', from: 'system', to: 'pam', act: 'inform', subject: 'Note', body: '', created_at: '2026-09-25T12:00:00Z' }
  ]);
  assert.equal(v.days.length, 1);
  assert.deepEqual(v.days[0].threads.map((t) => t.conversation), ['b', 'a']);
  assert.equal('latest' in v.days[0].threads[0], false);
  assert.deepEqual([v.notices.scheduled, v.notices.closing, v.notices.other], [0, 0, 1]);
  assert.deepEqual(messageView([]), { days: [], notices: { scheduled: 0, closing: 0, other: 0, messages: [] } });
});

test('localDay of a bad time is empty; gist shortens a long line with an ellipsis', () => {
  assert.equal(localDay('not a time'), '');
  const g = gist({ subject: 'x'.repeat(200), body: '' }, 20);
  assert.equal(g.length, 20);
  assert.ok(g.endsWith('…'));
  assert.equal(gist({ subject: '  ', body: '' }), '');
});

test('messageHistory: no agent id reads nothing, the limit caps it, and secrets are redacted', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-history-edge-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'god', name: 'Michael', provider: 'claude', cwd: home, isGod: true });
  await hive.ensureAgent({ id: 'pam', name: 'Pam', provider: 'claude', cwd: home });
  hive.send({ to: 'pam', act: 'inform', subject: 'Key', body: 'use sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789' }, 'god');
  hive.send({ to: 'pam', act: 'inform', subject: 'Second', body: 'x' }, 'god');
  assert.deepEqual(hive.messageHistory(''), []);
  assert.equal(hive.messageHistory('pam').length, 2);
  assert.equal(hive.messageHistory('pam', 1).length, 1);
  assert.equal(hive.messageHistory('pam', 0).length, 1, 'the limit never drops below one');
  const key = hive.messageHistory('pam').find((m) => m.subject === 'Key');
  assert.doesNotMatch(key.body, /sk-ant-api03/);
  assert.equal(key.dir, 'in');
  assert.equal(hive.messageHistory('god').every((m) => m.dir === 'out'), true, 'what Michael sent reads as sent');
});

/* ───────────────────── ASK ME schedule request cards ───────────────────── */

test('ASK ME shows schedule requests; a stale one cannot be approved, and a failed decision says so', () => {
  const askMe = read('src/renderer/src/components/AskMeTab.tsx');
  assert.match(askMe, /<ScheduleRequestCards requests=\{scheduleRequests\} refresh=\{refreshScheduleRequests\} \/>/);
  const src = read('src/renderer/src/components/ScheduleRequestCards.tsx');
  assert.match(src, /const stale = requestIsStale\(req, missions\);/);
  assert.match(src, /disabled=\{stale \|\| busy === req\.id\} onClick=\{\(\) => void decide\(req, true\)\}/, 'Approve is off while stale or busy');
  assert.match(src, /disabled=\{busy === req\.id\} onClick=\{\(\) => void decide\(req, false\)\}/, 'Decline still works on a stale request');
  assert.match(src, /if \(!res\.ok\) setFailed\(req\.id\);/);
  assert.match(src, /\} catch \{\s*setFailed\(req\.id\);/);
  assert.match(src, /finally \{\s*setBusy\(null\);\s*refresh\(\);/, 'the list refreshes whatever happened');
  assert.match(src, /return window\.cth\.onScheduleRequestsUpdated\(refresh\);/, 'new requests arrive without a reload');
  for (const op of ['Add', 'Update', 'Pause', 'Resume', 'Delete']) assert.ok(src.includes(`t('askMe.schedule${op}'`), op);
});

test('parseWhen refuses a clock time with minutes past 59 instead of rolling it over', () => {
  assert.equal(M.parseWhen({ days: ['mon'], at: '09:75' }), null, '09:75 is not 10:15');
  assert.equal(M.parseWhen({ days: ['mon'], at: '23:59' }).weekly.minute, 23 * 60 + 59);
});

// Pre-landing review, 2026-09-25: Node clamps a timer over 2^31-1 ms to 1 ms,
// so an interval past about 24.8 days would fire nonstop.
test('an interval longer than 24 days is refused, and the scheduler never arms an overflowing timer', () => {
  assert.equal(M.parseWhen({ every: '30d' }), null);
  assert.equal(M.parseWhen({ every: '999999h' }), null);
  assert.equal(M.parseWhen({ every: '24d' }).intervalMs, M.MAX_INTERVAL_MS);
  const ctx = { standupId: 'standup', standupFiredThisLaunch: true };
  const plan = M.armPlan({ id: 'x', label: 'x', to: 'pam', body: '', enabled: true, intervalMs: 40 * 86_400_000 }, Date.now(), ctx);
  assert.equal(plan.type, 'interval');
  assert.ok(plan.everyMs <= 2_147_483_647 && plan.firstDelayMs <= 2_147_483_647, JSON.stringify(plan));
});

test('the owner interval picker stops at the same ceiling', () => {
  const ui = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../src/renderer/src/components/triggers/ui.tsx'), 'utf8');
  assert.match(ui, /maxMs = MAX_INTERVAL_MS \}/);
});

test('request replies point an agent at list, and the close warning counts with the shared ownership rule', () => {
  const bad = M.buildScheduleRequest('pam', { op: 'delete', id: 'nope' }, [], 'god', 0, 'r1');
  assert.match(bad.reason, /"op": "list"/);
  assert.match(M.buildScheduleRequest('pam', { op: 'x' }, [], 'god', 0, 'r1').reason, /delete or list/);
  const list = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../src/renderer/src/components/triggers/ScheduleList.tsx'), 'utf8');
  assert.match(list, /const count = missionsFor\(st\.missions, agentId, godId\)\.filter\(\(m\) => m\.enabled\)\.length;/);
});

test('parseWhen clock edges', () => {
  assert.equal(M.parseWhen({ days: ['mon'], at: '23:60' }), null);
  assert.equal(M.parseWhen({ days: ['mon'], at: '00:00' }).weekly.minute, 0);
  assert.equal(M.parseWhen({ days: ['mon'], at: '0:05' }).weekly.minute, 5);
});

test('a schedule saved longer than 24 days is brought down to 24 on load', () => {
  const r = M.migrateMissions([{ id: 'x', label: 'x', to: 'pam', body: '', enabled: true, createdBy: 'owner', intervalMs: 30 * 86_400_000 }]);
  assert.equal(r.changed, true);
  assert.equal(r.missions[0].intervalMs, M.MAX_INTERVAL_MS);
});
