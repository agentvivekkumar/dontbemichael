'use strict';

/**
 * Pulse keeps a card finished just before a quit (TODOS.md): the board last
 * seen is saved in harness.db with its points, so the first read after a
 * launch diffs against it instead of taking the new board as its baseline.
 * better-sqlite3 is built for Electron, so this file reruns itself under
 * Electron's own Node (ELECTRON_RUN_AS_NODE) and skips where no Electron
 * binary is installed.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

if (!process.env.PULSE_UNDER_ELECTRON) {
  let bin = null;
  try { bin = require('electron'); } catch { bin = null; }
  const ok = typeof bin === 'string' && fs.existsSync(bin);
  test('a card finished just before a quit (run under Electron\'s Node)', { skip: ok ? false : 'no Electron binary' }, () => {
    const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', PULSE_UNDER_ELECTRON: '1' };
    delete env.NODE_TEST_CONTEXT;
    const r = spawnSync(bin, ['--test', __filename], { env, encoding: 'utf8', timeout: 300_000 });
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /# fail 0/, 'the nested run reported its own results');
  });
  return;
}

const loadTs = require('./load-ts.cjs');
const electron = require.resolve('electron');
require.cache[electron] = { id: electron, filename: electron, loaded: true, exports: { app: { getPath: () => os.tmpdir() } } };
const { PersistStore } = loadTs('src/main/db.ts');
const { TelemetryStore, MAX_SAVED_CARDS, MAX_BUFFER } = loadTs('src/main/telemetryStore.ts');

const OFFICE = 'office-id-1';
const t0 = new Date(2026, 9, 15, 9).getTime();

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-pulse-quit-'));
  const persist = new PersistStore(path.join(dir, 'harness.db'));
  persist.open();
  // Closed before the folder goes: Windows can't delete an open database.
  t.after(() => { persist.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  // A new store over the same database is the app after a quit or a crash.
  const launch = (opts = {}) => new TelemetryStore(opts.db ?? (() => persist.database()), opts.office ?? (() => OFFICE), opts.now ?? (() => t0));
  const done = (office = OFFICE) => persist.database().prepare("SELECT attrs FROM telemetry_events WHERE kind = 'card-status' AND office = ?").all(office)
    .map((r) => JSON.parse(r.attrs)).filter((a) => a.to === 'done').map((a) => a.id).sort();
  const row = (office = OFFICE) => persist.database().prepare('SELECT value, updated_at FROM kv WHERE key = ?').get(`pulse:cards:${office}`);
  return { persist, launch, done, row };
}

const card = (id, status) => ({ id, status, assignee: 'pam' });

test('a card done in the seconds before a quit counts once on the next launch; one done and counted before does not count again', (t) => {
  // Value: protects=Tasks done across a quit; fails_when=the first read after a launch takes the board as its baseline, so a card done after the last poll is never counted, or the saved board lags its points and a card counted before the quit counts again; why_new=Codex adversarial review 2026-10-16; seam=a new TelemetryStore over the same harness.db stands in for the relaunch; no_claim=the 8 s poll itself
  const { launch, done } = setup(t);
  const s1 = launch();
  s1.tasks([card('old', 'doing'), card('late', 'doing'), card('open', 'todo')], t0);
  s1.tasks([card('old', 'done'), card('late', 'doing'), card('open', 'todo')], t0 + 8_000);
  s1.flush();
  assert.deepEqual(done(), ['old'], 'counted while the app ran');
  // `late` reaches done after the last poll, then the app quits.

  const s2 = launch();
  s2.tasks([card('old', 'done'), card('late', 'done'), card('open', 'todo')], t0 + 60_000);
  s2.tasks([card('old', 'done'), card('late', 'done'), card('open', 'todo')], t0 + 68_000);
  s2.flush();
  assert.deepEqual(done(), ['late', 'old'], 'the late card counts once, the old one is not counted again');

  const s3 = launch();
  s3.tasks([card('old', 'done'), card('late', 'done'), card('open', 'todo')], t0 + 120_000);
  s3.flush();
  assert.deepEqual(done(), ['late', 'old'], 'a further launch counts nothing new');
});

test('a point lost in a crash before its flush is counted on the next launch, not twice', (t) => {
  // Value: protects=the saved board and its points staying in step; fails_when=the board is saved apart from the points, so a crash between the two loses the card or counts it twice; why_new=the board is saved in the flush transaction; seam=a store never flushed stands in for the crash; no_claim=none beyond protects
  const { launch, done } = setup(t);
  const s1 = launch();
  s1.tasks([card('a', 'doing')], t0);
  s1.flush();
  s1.tasks([card('a', 'done')], t0 + 8_000);
  // Crash: s1 never flushes its point or its board.

  const s2 = launch();
  s2.tasks([card('a', 'done')], t0 + 60_000);
  s2.flush();
  assert.deepEqual(done(), ['a']);
});

test('with no saved board, or one that cannot be read, the first read only remembers', (t) => {
  // Value: protects=the first launch and a damaged row; fails_when=a missing or corrupt saved board throws or counts every card already done; why_new=the saved board is new; seam=none; no_claim=none beyond protects
  const { persist, launch, done } = setup(t);
  const s1 = launch();
  s1.tasks([card('a', 'done'), card('b', 'doing')], t0);
  s1.flush();
  assert.deepEqual(done(), [], 'no saved board: only remembers');

  for (const bad of ['{not json', '[]', '"done"', 'null']) {
    persist.database().prepare('UPDATE kv SET value = ? WHERE key = ?').run(bad, `pulse:cards:${OFFICE}`);
    const s = launch();
    s.tasks([card('a', 'done'), card('b', 'done')], t0 + 60_000);
    s.flush();
    assert.deepEqual(done(), [], `a saved board of ${bad} only remembers`);
  }
});

test('the saved board is capped, open cards first, and a card it left out is only remembered', (t) => {
  // Value: protects=a bounded row and no double count past the cap; fails_when=a large board is saved whole, or a card cut from the saved board counts as new and finished again; why_new=the saved board is new; seam=none; no_claim=none beyond protects
  const { persist, launch, done } = setup(t);
  const board = [];
  for (let i = 0; i < MAX_SAVED_CARDS + 10; i++) board.push(card(`d${i}`, 'done'));
  board.push(card('open', 'doing'));
  const s1 = launch();
  s1.tasks(board, t0);
  s1.flush();
  const saved = JSON.parse(persist.database().prepare('SELECT value FROM kv WHERE key = ?').get(`pulse:cards:${OFFICE}`).value);
  assert.equal(Object.keys(saved).length, MAX_SAVED_CARDS);
  assert.equal(saved.open, 'doing', 'the open card is kept');

  const s2 = launch();
  s2.tasks(board.map((c) => (c.id === 'open' ? card('open', 'done') : c)), t0 + 60_000);
  s2.flush();
  assert.deepEqual(done(), ['open'], 'the cut done cards are not counted again');
});

test('an empty read of the board between two real ones counts nothing new, in the app or after a launch', (t) => {
  // Value: protects=Tasks done when tasks.json cannot be read for one poll (hive.ts hands Pulse []); fails_when=the empty board is kept or saved, so the next real board counts every card as new and finished; why_new=owner review of #737; seam=tasks([]) stands in for the unreadable file; no_claim=a board the owner really emptied
  const { launch, done, row } = setup(t);
  const board = [card('a', 'done'), card('b', 'doing')];
  const s1 = launch();
  s1.tasks(board, t0);
  s1.flush();
  s1.tasks([], t0 + 8_000);
  s1.flush();
  assert.deepEqual(JSON.parse(row().value), { a: 'done', b: 'doing' }, 'the empty board is not saved');
  s1.tasks(board, t0 + 16_000);
  s1.flush();
  assert.deepEqual(done(), [], 'nothing counted in the app');

  const s2 = launch();
  s2.tasks([], t0 + 60_000);
  s2.tasks(board, t0 + 68_000);
  s2.flush();
  assert.deepEqual(done(), [], 'nothing counted after a launch');
});

test('a failed flush saves no board, and the card it lost counts exactly once', (t) => {
  // Value: protects=the board and its points saved together; fails_when=the board is written outside the points' transaction, or a board whose points were lost is saved later, so the card never counts; why_new=owner review of #737; seam=a database whose points insert throws; no_claim=a database that is closed
  t.mock.method(console, 'error', () => {});
  const { persist, launch, done, row } = setup(t);
  let broken = false;
  const db = () => {
    const real = persist.database();
    if (!broken) return real;
    return {
      transaction: (fn) => real.transaction(fn),
      prepare: (sql) => (sql.startsWith('INSERT INTO telemetry_events') ? { run: () => { throw new Error('disk full'); } } : real.prepare(sql))
    };
  };
  const s1 = launch({ db });
  s1.tasks([card('a', 'doing')], t0);
  s1.flush();
  s1.tasks([card('a', 'done')], t0 + 8_000);
  broken = true;
  s1.flush();
  assert.deepEqual(JSON.parse(row().value), { a: 'doing' }, 'no board written by the failed flush');
  assert.deepEqual(done(), []);

  broken = false;
  s1.tasks([card('a', 'done')], t0 + 16_000);
  s1.flush();
  assert.deepEqual(done(), ['a'], 'the next read counts the lost change');
  assert.deepEqual(JSON.parse(row().value), { a: 'done' });

  const s2 = launch();
  s2.tasks([card('a', 'done')], t0 + 60_000);
  s2.flush();
  assert.deepEqual(done(), ['a'], 'once, not again after a launch');
});

test('the board is saved only when it changed, and a removed card leaves it', (t) => {
  // Value: protects=no rewrite of the row on every flush, and a saved board that matches the board; fails_when=an unchanged board is written each flush, or a card removed with no status change stays in the saved board; why_new=owner review of #737; seam=the store clock dates the row; no_claim=none beyond protects
  const { launch, row } = setup(t);
  let now = t0;
  const s = launch({ now: () => now });
  const board = [card('a', 'doing'), card('b', 'todo')];
  s.tasks(board, now);
  s.flush();
  assert.equal(row().updated_at, t0);
  for (let i = 1; i <= 2; i++) {
    now = t0 + i * 8_000;
    s.tasks(board, now);
    s.flush();
  }
  assert.equal(row().updated_at, t0, 'an unchanged board is not written again');

  now = t0 + 60_000;
  s.tasks([card('a', 'doing')], now);
  s.flush();
  assert.deepEqual(JSON.parse(row().value), { a: 'doing' }, 'the removed card is gone');
  assert.equal(row().updated_at, now);
});

test('two offices keep their own boards, and a card finished in one does not count in the other', (t) => {
  // Value: protects=boards keyed by office; fails_when=one key holds every office's board, so a switch overwrites the other office's board and its late card is lost or counted in the wrong office; why_new=owner review of #737; seam=the office getter switches offices; no_claim=moving an office to its id (pulse-office-id.test.cjs)
  const { launch, done, row } = setup(t);
  let office = 'office-a';
  const s1 = launch({ office: () => office });
  s1.tasks([card('x', 'doing'), card('a1', 'doing')], t0);
  office = 'office-b';
  s1.tasks([card('x', 'doing'), card('b1', 'todo')], t0 + 8_000);
  s1.flush();
  assert.deepEqual(JSON.parse(row('office-a').value), { x: 'doing', a1: 'doing' });
  assert.deepEqual(JSON.parse(row('office-b').value), { x: 'doing', b1: 'todo' });
  // `x` reaches done in office a after the last poll, then the app quits.

  const s2 = launch({ office: () => office });
  s2.tasks([card('x', 'doing'), card('b1', 'todo')], t0 + 60_000);
  office = 'office-a';
  s2.tasks([card('x', 'done'), card('a1', 'doing')], t0 + 68_000);
  s2.flush();
  assert.deepEqual(done('office-a'), ['x'], 'counted in its own office');
  assert.deepEqual(done('office-b'), [], 'not in the other');
});

test('a tick that fills the buffer saves its points with its own board', (t) => {
  // Value: protects=the board and its points in step when a tick fills the buffer; fails_when=the flush inside the tick saves the points with the board before it, so the next launch counts those cards again; why_new=owner review of #737; seam=a store never flushed again stands in for the crash; no_claim=none beyond protects
  const { launch, done } = setup(t);
  const ids = Array.from({ length: MAX_BUFFER }, (_, i) => `c${i}`);
  const s1 = launch();
  s1.tasks(ids.map((id) => card(id, 'doing')), t0);
  s1.flush();
  s1.tasks(ids.map((id) => card(id, 'done')), t0 + 8_000);
  assert.equal(done().length, MAX_BUFFER, 'the full buffer was written');
  // Crash: nothing flushes again.

  const s2 = launch();
  s2.tasks(ids.map((id) => card(id, 'done')), t0 + 60_000);
  s2.flush();
  assert.equal(done().length, MAX_BUFFER, 'nothing counted twice');
});

test('an empty first read with no saved board is not taken as the baseline', (t) => {
  // Value: protects=Tasks done on the first launch after this change or in a new office; fails_when=an empty first read is remembered, so the next real board counts every card from nothing; why_new=owner re-review of #737; seam=tasks([]) stands in for the unreadable file; no_claim=none beyond protects
  const { launch, done, row } = setup(t);
  const s = launch();
  s.tasks([], t0);
  s.flush();
  assert.equal(row(), undefined, 'the empty read is not saved');
  s.tasks([card('a', 'done'), card('b', 'doing')], t0 + 8_000);
  s.flush();
  assert.deepEqual(done(), [], 'the real board is only remembered');
  assert.deepEqual(JSON.parse(row().value), { a: 'done', b: 'doing' });
});

test('a write that keeps failing counts a changed card once, and not as a failure', (t) => {
  // Value: protects=the failure count and the days left out of advice; fails_when=the card points of a forgotten board count as failures, so each failed tick adds the same change again; why_new=owner re-review of #737; seam=a database whose points insert throws; no_claim=none beyond protects
  t.mock.method(console, 'error', () => {});
  const { persist, launch, done } = setup(t);
  let broken = false;
  const db = () => {
    const real = persist.database();
    if (!broken) return real;
    return {
      transaction: (fn) => real.transaction(fn),
      prepare: (sql) => (sql.startsWith('INSERT INTO telemetry_events') ? { run: () => { throw new Error('disk full'); } } : real.prepare(sql))
    };
  };
  const s = launch({ db });
  s.tasks([card('a', 'doing')], t0);
  s.flush();
  broken = true;
  s.record({ agentId: 'pam', kind: 'prompt', ts: t0 + 1_000 });
  for (let i = 1; i <= 3; i++) {
    s.tasks([card('a', 'done')], t0 + i * 8_000);
    s.flush();
  }
  broken = false;
  s.tasks([card('a', 'done')], t0 + 32_000);
  s.flush();
  assert.deepEqual(done(), ['a'], 'the card counts once');
  assert.deepEqual(Object.values(s.failedWrites(OFFICE)), [1], 'only the lost prompt is a failure');
});

test('a flush with no database saves no board, and the card it lost counts exactly once', (t) => {
  // Value: protects=the board and its points in step when the database is away for a flush; fails_when=the pending board is kept and saved by the next flush without its point, so the card never counts; why_new=owner re-review of #737; seam=db() returns null for one flush; no_claim=none beyond protects
  const { persist, launch, done } = setup(t);
  let away = false;
  const s = launch({ db: () => (away ? null : persist.database()) });
  s.tasks([card('a', 'doing')], t0);
  s.flush();
  s.tasks([card('a', 'done')], t0 + 8_000);
  away = true;
  s.flush();
  away = false;
  s.flush();
  s.tasks([card('a', 'done')], t0 + 16_000);
  s.flush();
  assert.deepEqual(done(), ['a']);
  assert.deepEqual(s.failedWrites(OFFICE), {});
});
