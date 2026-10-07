'use strict';

/**
 * The shared Needs you feed (src/renderer/src/shell/useNeedsYou.ts,
 * docs/designs/needs-you-empty-state.md D3 and eng R4) and the small rules the
 * collapsed right column runs on (pill, Esc, for you chip). Each feed case runs
 * in its own process, so the module's state starts fresh.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const loadTs = require('./load-ts.cjs');

const ask = (id, assignee, askedAt, extra = {}) => ({
  id, title: id, assignee, status: 'blocked', createdAt: '2026-10-01T00:00:00Z', dependsOn: [], priority: 3,
  humanQA: [{ q: `${id}?`, askedAt }], ...extra
});

function runFeed(body) {
  const script = `
    const reads = [];
    let intervals = 0, cleared = 0, offRequests = 0;
    globalThis.setInterval = () => { intervals++; return 1; };
    globalThis.clearInterval = () => { cleared++; };
    globalThis.document = { hidden: false };
    globalThis.window = { cth: {
      hiveTasks: () => new Promise((resolve, reject) => reads.push({ resolve, reject })),
      listScheduleRequests: () => Promise.resolve(globalThis.requests ?? []),
      onScheduleRequestsUpdated: () => () => { offRequests++; }
    } };
    const feed = require(${JSON.stringify(path.join(__dirname, 'load-ts.cjs'))})('src/renderer/src/shell/useNeedsYou.ts');
    const tick = () => new Promise((r) => setImmediate(r));
    const out = {};
    (async () => { ${body}; process.stdout.write(JSON.stringify(out)); })().catch((e) => { console.error(e); process.exit(1); });`;
  return JSON.parse(execFileSync(process.execPath, ['-e', script], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' }));
}

test('the feed is unknown until the first read, then counts open asks plus passed on schedule requests', () => {
  // Value: protects=the pill never claims "Nothing needs you" before data, and the count matches the board; fails_when=status starts ready, or count drops the schedule requests or counts answered asks; why_new=the shared feed is new (eng R4); seam=none
  const r = runFeed(`
    globalThis.requests = [{ id: 'r1', escalated: true }, { id: 'r2', escalated: false }];
    out.before = feed.getNeedsYouFeed().status;
    feed.refreshNeedsYou();
    reads[0].resolve({ tasks: [${JSON.stringify(ask('a', 'pam', '2026-10-02T09:00:00Z'))}, ${JSON.stringify(ask('b', 'oscar', '2026-10-02T09:00:00Z', { status: 'doing' }))}] });
    await tick(); await tick();
    const f = feed.getNeedsYouFeed();
    out.after = [f.status, f.count, f.tasks.length, f.requests.length];
  `);
  assert.equal(r.before, 'unknown');
  assert.deepEqual(r.after, ['ready', 3, 2, 1], 'both open asks (a card\'s status never hides one, owner 2026-10-04) and one passed on request; the request Michael kept does not count');
});

test('a failed read keeps the last value, and an older read never lands over a newer one', () => {
  // Value: protects=a stale or failed read never flips the pill or resurrects an answered ask; fails_when=a rejected read clears the tasks, or a slow earlier read overwrites a later one or a local change; why_new=the shared feed is new (eng R4); seam=none
  const r = runFeed(`
    feed.refreshNeedsYou();
    reads[0].resolve({ tasks: [${JSON.stringify(ask('a', 'pam', '2026-10-02T09:00:00Z'))}] });
    await tick(); await tick();
    feed.refreshNeedsYou();
    reads[1].reject(new Error('gone'));
    await tick(); await tick();
    out.afterFail = feed.getNeedsYouFeed().count;
    feed.refreshNeedsYou();
    feed.updateNeedsYouTasks(() => []);
    out.afterLocal = feed.getNeedsYouFeed().count;
    reads[2].resolve({ tasks: [${JSON.stringify(ask('a', 'pam', '2026-10-02T09:00:00Z'))}] });
    await tick(); await tick();
    out.afterStale = feed.getNeedsYouFeed().count;
  `);
  assert.equal(r.afterFail, 1, 'a failed read keeps the last value');
  assert.equal(r.afterLocal, 0, 'a local change shows at once');
  assert.equal(r.afterStale, 0, 'the read that started before the local change is dropped');
});

test('one poll for every reader: the first listener starts it, the last stops it', () => {
  // Value: protects=seven timers stay one, and nothing polls with no reader; fails_when=each subscriber starts its own interval, or the last unsubscribe leaves the timer or the schedule listener running; why_new=the shared feed replaces seven polls (eng R4); seam=none
  const r = runFeed(`
    const offA = feed.subscribeNeedsYou(() => {});
    const offB = feed.subscribeNeedsYou(() => {});
    out.started = [intervals, reads.length];
    offA();
    out.afterOne = [cleared, offRequests];
    offB();
    out.afterAll = [cleared, offRequests];
  `);
  assert.deepEqual(r.started, [1, 1], 'one interval and one read for two readers');
  assert.deepEqual(r.afterOne, [0, 0], 'still polling while one reader remains');
  assert.deepEqual(r.afterAll, [1, 1], 'stopped with the last reader');
});

test('Get Michael ready counts once while Michael cannot start, reads Claude once a minute then every 10 once ready, at once when main says it changed, and fires the ready edge once', () => {
  // Value: protects=the pill counts the Ask me engine card exactly while it shows, and the 5 s poll never starts a `claude auth status` process every tick; fails_when=a ready or non Claude engine still adds 1, the poll reads the engine every 5 s, a setup terminal ending is not read at once, an older read lands over a newer one, or the last reader leaves the engine listener on; why_new=the existing check only pins the count line's text, nothing runs the read cadence or the stale guard; seam=none
  const r = runFeed(`
    let now = 1000000; Date.now = () => now;
    let poll; globalThis.setInterval = (fn) => { poll = fn; return 1; };
    const engine = []; let changed; let offEngine = 0;
    window.cth.engineSetupStatus = () => new Promise((resolve) => engine.push(resolve));
    window.cth.onEngineSetupChanged = (cb) => { changed = cb; return () => { offEngine++; }; };
    const count = () => feed.getNeedsYouFeed().count;
    const events = []; window.dispatchEvent = (e) => { events.push(e.type); return true; };
    const off = feed.subscribeNeedsYou(() => {});
    out.first = engine.length;
    engine[0]({ applies: true, installed: false, signedIn: false, needed: true });
    await tick(); await tick();
    out.needed = count();
    now += 5000; poll();
    out.afterPoll = engine.length;
    changed({ id: 'engine-setup-install', exitCode: 0 });
    out.afterEvent = engine.length;
    engine[1]({ applies: true, installed: true, signedIn: true, needed: false });
    await tick(); await tick();
    out.ready = count();
    out.readyEvents = events.slice();
    now += 60000; poll();
    out.afterMinute = engine.length;
    now += 540000; poll();
    out.afterTen = engine.length;
    const before = engine.length;
    feed.refreshNeedsYou();
    out.refreshReads = engine.length - before;
    const newest = engine.length - 1;
    engine[newest]({ applies: true, installed: true, signedIn: true, needed: false });
    await tick(); await tick();
    engine[2]({ applies: true, installed: true, signedIn: false, needed: true });
    await tick(); await tick();
    out.stale = count();
    changed({ id: 'api-key', exitCode: null });
    engine[engine.length - 1]({ applies: false, installed: true, signedIn: null, needed: false });
    await tick(); await tick();
    out.otherEngine = [count(), feed.getNeedsYouFeed().engineSetup.applies];
    out.allEvents = events.slice();
    off();
    out.offEngine = offEngine;
  `);
  assert.equal(r.first, 1, 'the first reader reads the engine once');
  assert.equal(r.needed, 1, 'Claude missing: one thing needs the owner');
  assert.equal(r.afterPoll, 1, 'the 5 s poll does not read the engine again within the minute');
  assert.equal(r.afterEvent, 2, 'a setup terminal ending reads it at once');
  assert.equal(r.ready, 0, 'ready: the card and its count are gone');
  assert.deepEqual(r.readyEvents, ['cth:engine-ready'], 'turning ready after Michael could not start tells the team to restart, once');
  assert.equal(r.afterMinute, 2, 'once ready, the poll does not start claude auth status every minute');
  assert.equal(r.afterTen, 3, 'once ready, it looks again every 10 minutes');
  assert.equal(r.refreshReads, 1, 'one refresh starts one claude auth status, not two');
  assert.equal(r.stale, 0, 'an older read that says signed out never lands over a newer ready one');
  assert.deepEqual(r.otherEngine, [0, false], 'an engine this step does not set up never counts');
  assert.deepEqual(r.allEvents, ['cth:engine-ready'], 'a stale signed out read or another engine never fires the ready edge again');
  assert.equal(r.offEngine, 1, 'the last reader stops listening for engine changes');
});

const feedTs = loadTs('src/renderer/src/shell/useNeedsYou.ts');

test('the pill: blank while unknown, a quiet label at zero, coral above zero (D2, D3)', () => {
  // Value: protects=the pill never says "Nothing needs you" before it knows, and is only a button when something waits; fails_when=unknown maps to quiet or zero maps to hot; why_new=new rule; seam=none
  assert.equal(feedTs.pillState('unknown', 0), 'blank');
  assert.equal(feedTs.pillState('unknown', 3), 'blank');
  assert.equal(feedTs.pillState('ready', 0), 'quiet');
  assert.equal(feedTs.pillState('ready', 2), 'hot');
});

test('a for you chip opens the newest open ask among the pod\'s people (D11)', () => {
  // Value: protects=the chip lands on the right question; fails_when=it picks an older ask, another pod's ask, or an answered one; why_new=new rule; seam=none
  const tasks = [
    ask('old', 'pam', '2026-10-02T08:00:00Z'),
    ask('new', 'erin', '2026-10-02T10:00:00Z'),
    ask('elsewhere', 'oscar', '2026-10-02T11:00:00Z'),
    ask('answered', 'pam', '2026-10-02T12:00:00Z', { humanQA: [{ q: 'x?', a: 'done', askedAt: '2026-10-02T12:00:00Z' }] })
  ];
  assert.equal(feedTs.newestAskFor(['pam', 'erin'], tasks), 'new');
  assert.equal(feedTs.newestAskFor(['toby'], tasks), undefined);
});

const col = loadTs('src/renderer/src/shell/rightColumn.ts');

test('while anything waits the column is locked open; only nothing at all lets the office take the window (owner, 2026-10-02)', () => {
  // Value: protects=an Ask me card is never hidden behind a collapsed column; fails_when=the lock ignores the count, locks before the count is known, or a panel close collapses the column while asks wait; why_new=owner rule replacing D1, D6 and D7; seam=none
  assert.equal(col.columnLocked('ready', 1), true);
  assert.equal(col.columnLocked('ready', 0), false);
  assert.equal(col.columnLocked('unknown', 0), false, 'not known yet: nothing to lock open');
  assert.equal(col.closeTarget(true), 'board', 'closing a panel while asks wait goes back to the board');
  assert.equal(col.closeTarget(false), 'closed');
});

test('Esc closes the column only from inside it, never over another Esc, never while asks wait, and leaves a filled reply first (eng R2)', () => {
  // Value: protects=one Esc closes one thing, a half written answer stays on screen, and waiting asks stay visible; fails_when=Esc closes the column from outside, after a menu took it, while asks wait, or wipes a reply with text; why_new=new rule; seam=none
  const { columnEscAction } = col;
  const base = { key: 'Escape', defaultPrevented: false, inColumn: true, fieldHasText: false, locked: false };
  assert.equal(columnEscAction(base), 'close');
  assert.equal(columnEscAction({ ...base, locked: true }), 'none', 'asks wait: the column stays');
  assert.equal(columnEscAction({ ...base, locked: true, fieldHasText: true }), 'blur', 'a filled reply is still left first');
  assert.equal(columnEscAction({ ...base, fieldHasText: true }), 'blur');
  assert.equal(columnEscAction({ ...base, inColumn: false }), 'none');
  assert.equal(columnEscAction({ ...base, defaultPrevented: true }), 'none');
  assert.equal(columnEscAction({ ...base, key: 'Enter' }), 'none');
});

// 2026-10-02: the board moved onto the shared parsed feed, and parseTasks
// dropped raisedBy, so an answer went to the assignee instead of the agent that
// asked, and saving the answer erased raisedBy (and Slack fields) from disk.
test('parsing a card keeps every field its questions carry', () => {
  // Value: protects=answers route to whoever asked and the question trail stays intact on disk; fails_when=parseTasks rebuilds humanQA entries from a fixed field list again; why_new=nothing parsed a raisedBy entry; seam=none
  const { parseTasks } = loadTs('src/renderer/src/components/hiveTasks.ts');
  const [t] = parseTasks({ tasks: [{ id: 'x', title: 'x', status: 'blocked', humanQA: [{ q: 'Which?', askedAt: '2026-10-02T09:00:00Z', raisedBy: 'nick', options: ['a', 'b'], thread_ts: '1.2' }] }] });
  assert.equal(t.humanQA[0].raisedBy, 'nick');
  assert.deepEqual(t.humanQA[0].options, ['a', 'b']);
  assert.equal(t.humanQA[0].thread_ts, '1.2');
});
