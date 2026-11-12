'use strict';

/**
 * A window whose code never starts is loaded again (src/main/bootWatchdog.ts;
 * owner, 2026-11-10: after a wake from hibernation the office sat on
 * "Opening the office…" for good). The rules run on a fake clock; the wiring
 * is pinned in the source.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const W = loadTs('src/main/bootWatchdog.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

/** A fake clock: timers fire only when the test advances time. The probe
 *  answers with `page.running` unless told to hang. */
function harness() {
  let now = 0;
  let next = 1;
  const timers = new Map();
  const log = [];
  let reloads = 0;
  const page = { running: false, hang: false, probes: 0 };
  const dog = W.createBootWatchdog({
    setTimer: (fn, ms) => { const id = next++; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimer: (id) => { timers.delete(id); },
    probe: () => { page.probes++; return page.hang ? new Promise(() => {}) : Promise.resolve(page.running); },
    reload: () => { reloads++; },
    log: (line) => log.push(line)
  });
  /** Move the clock, letting each probe answer before the next timer. */
  const advance = async (ms) => {
    const end = now + ms;
    for (;;) {
      await new Promise((r) => setImmediate(r));
      const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      const [id, t] = due;
      now = Math.max(now, t.at);
      timers.delete(id);
      t.fn();
    }
    now = end;
    await new Promise((r) => setImmediate(r));
  };
  return { dog, advance, log, page, reloads: () => reloads, pending: () => timers.size };
}

test('a page that starts in time is left alone', async () => {
  // Value: protects=a normal start never reloads; fails_when=a running page is reloaded or the timer is left running; why_new=new watchdog; seam=fake clock; no_claim=Electron events (pinned below)
  const h = harness();
  h.dog.navigationStarted();
  h.page.running = true;
  await h.advance(W.BOOT_WAIT_MS * 3);
  assert.equal(h.reloads(), 0);
  assert.equal(h.pending(), 0);
});

test('a page that stays silent is loaded again, then gives up after the cap', async () => {
  // Value: protects=a stuck splash recovers, and a page that can never start is not reloaded forever; fails_when=no reload after the wait, or more than MAX_RELOADS in a row; why_new=the hibernate splash (owner, 2026-11-10); seam=fake clock; no_claim=none beyond protects
  const h = harness();
  h.dog.navigationStarted();
  await h.advance(W.BOOT_WAIT_MS - 1);
  assert.equal(h.reloads(), 0, 'not before the wait');
  await h.advance(1);
  assert.equal(h.reloads(), 1);
  // Each reload is a new navigation that never starts either.
  for (let i = 0; i < 10; i++) { h.dog.navigationStarted(); await h.advance(W.BOOT_WAIT_MS); }
  assert.equal(h.reloads(), W.MAX_RELOADS);
  assert.match(h.log.at(-1), /gave up after 3 reloads/);
});

test('a reload whose navigation never starts is still looked at', async () => {
  // Value: protects=recovery does not hang on a reload that produced no navigation event; fails_when=nothing re-arms after a reload; why_new=probe redesign (2026-11-12); seam=fake clock; no_claim=none beyond protects
  const h = harness();
  h.dog.navigationStarted();
  await h.advance(W.BOOT_WAIT_MS);
  assert.equal(h.reloads(), 1);
  await h.advance(W.BOOT_WAIT_MS);
  assert.equal(h.reloads(), 2);
});

test('a running page resets the count, so a later stall is caught again', async () => {
  // Value: protects=the cap counts reloads in a row, not for the life of the window; fails_when=one bad night uses up recovery for good; why_new=new watchdog; seam=fake clock; no_claim=none beyond protects
  const h = harness();
  for (let i = 0; i < W.MAX_RELOADS; i++) { h.dog.navigationStarted(); await h.advance(W.BOOT_WAIT_MS); }
  assert.equal(h.reloads(), W.MAX_RELOADS);
  h.page.running = true;
  h.dog.navigationStarted();
  await h.advance(W.BOOT_WAIT_MS);
  h.page.running = false;
  h.dog.navigationStarted();
  await h.advance(W.BOOT_WAIT_MS);
  assert.equal(h.reloads(), W.MAX_RELOADS + 1);
});

test('a hung page that never answers the probe is loaded again', async () => {
  // Value: protects=a wedged renderer is not mistaken for a running one; fails_when=a probe that never settles leaves the splash for good; why_new=probe redesign (2026-11-12); seam=fake clock; no_claim=none beyond protects
  const h = harness();
  h.page.hang = true;
  h.dog.navigationStarted();
  await h.advance(W.BOOT_WAIT_MS + W.PROBE_MS - 1);
  assert.equal(h.reloads(), 0, 'waits for the answer');
  await h.advance(1);
  assert.equal(h.reloads(), 1);
  assert.match(h.log.at(-1), /silent, no answer/);
});

test('the 2026-11-12 wake: an old page starting late cannot stand in for the new one', async () => {
  // Value: protects=the owner's morning splash; fails_when=the watchdog stands down because a page already replaced ran its code, or reloads while the Mac sleeps; why_new=owner, 2026-11-12 (stuck again after a battery-dead night); seam=fake clock; no_claim=real Chromium sleep timing
  const h = harness();
  // A reload begins as the Mac goes to sleep.
  h.dog.navigationStarted();
  await h.advance(10_000);
  h.dog.suspended();
  await h.advance(W.BOOT_WAIT_MS * 10);
  assert.equal(h.reloads(), 0, 'nothing reloads while asleep');
  assert.equal(h.page.probes, 0);
  // Wake: the old page finished and ran (in the old design it said "started"),
  // but a new navigation commits a document that never runs.
  h.dog.resumed();
  h.dog.navigationStarted();
  h.dog.navigationCommitted();
  h.page.running = false;
  await h.advance(W.BOOT_WAIT_MS);
  assert.equal(h.reloads(), 1, 'the page on screen is asked, and it is not running');
  h.page.running = true;
  h.dog.navigationStarted();
  await h.advance(W.BOOT_WAIT_MS * 2);
  assert.equal(h.reloads(), 1);
});

test('a wake looks again soon with a fresh count, even after giving up', async () => {
  // Value: protects=a page stuck before sleep, or out of reloads, recovers when the Mac wakes; fails_when=the count stays used up or the wake waits the full boot time; why_new=owner, 2026-11-12; seam=fake clock; no_claim=none beyond protects
  const h = harness();
  for (let i = 0; i < W.MAX_RELOADS + 1; i++) { h.dog.navigationStarted(); await h.advance(W.BOOT_WAIT_MS); }
  assert.equal(h.reloads(), W.MAX_RELOADS);
  h.dog.suspended();
  h.dog.resumed();
  await h.advance(W.WAKE_WAIT_MS);
  assert.equal(h.reloads(), W.MAX_RELOADS + 1);
  // A wake with the page running changes nothing.
  h.page.running = true;
  h.dog.resumed();
  await h.advance(W.WAKE_WAIT_MS * 2);
  assert.equal(h.reloads(), W.MAX_RELOADS + 1);
});

test('an answer to an older probe is ignored once something new happens', async () => {
  // Value: protects=a slow yes from a page being replaced cannot cancel the watch on the next one; fails_when=a stale probe answer clears the new timer; why_new=probe redesign (2026-11-12); seam=fake clock; no_claim=none beyond protects
  let answer;
  let reloads = 0;
  const timers = [];
  const dog = W.createBootWatchdog({
    setTimer: (fn, ms) => { const t = { fn, ms, live: true }; timers.push(t); return t; },
    clearTimer: (t) => { t.live = false; },
    probe: () => new Promise((r) => { answer = r; }),
    reload: () => { reloads++; },
    log: () => {}
  });
  dog.navigationStarted();
  const wait = timers.at(-1);
  wait.live = false;
  wait.fn();                     // the wait ends: the probe goes out
  dog.navigationStarted();       // a new navigation before it answers
  answer(true);                  // the old page says yes
  await new Promise((r) => setImmediate(r));
  const live = timers.filter((t) => t.live);
  assert.equal(live.length, 1, 'the new navigation is still watched');
  assert.equal(live[0].ms, W.BOOT_WAIT_MS);
  assert.equal(reloads, 0);
});

test('a failed load or a lost renderer tries again shortly; an aborted navigation does not', async () => {
  // Value: protects=a load error or a crashed renderer is retried, and a navigation replaced by another is not mistaken for a failure; fails_when=failures wait the full boot time, ERR_ABORTED triggers a reload, or a retry loops; why_new=new watchdog; seam=fake clock; no_claim=Chromium error codes beyond -3
  const h = harness();
  h.page.running = true;
  h.dog.navigationStarted();
  h.dog.loadFailed(W.ERR_ABORTED);
  await h.advance(W.RETRY_MS);
  assert.equal(h.page.probes, 0, 'aborted is not a failure');
  h.page.running = false;
  h.dog.loadFailed(-102);
  await h.advance(W.RETRY_MS);
  assert.equal(h.reloads(), 1);
  h.dog.rendererGone('crashed');
  await h.advance(W.RETRY_MS);
  assert.equal(h.reloads(), 2);
  assert.match(h.log.join('\n'), /load failed -102[\s\S]*renderer crashed/);
});

test('a closed window never reloads', async () => {
  // Value: protects=no reload on a destroyed window; fails_when=a pending timer fires after close; why_new=new watchdog; seam=fake clock; no_claim=none beyond protects
  const h = harness();
  h.dog.navigationStarted();
  h.dog.dispose();
  await h.advance(W.BOOT_WAIT_MS);
  h.dog.loadFailed(-102);
  h.dog.resumed();
  await h.advance(W.BOOT_WAIT_MS);
  assert.equal(h.reloads(), 0);
});

test('main watches every app window and asks the page on screen', () => {
  // Value: protects=the watchdog is wired to the window's and the Mac's events and probes the current document; fails_when=an event, the probe or the page flag drifts; why_new=probe redesign (2026-11-12); seam=source pins; no_claim=a real hibernate wake
  const main = read('src/main/index.ts');
  const win = main.slice(main.indexOf('function createWindow('), main.indexOf('/** The quit item\'s label'));
  assert.match(win, /wc\.on\('did-start-navigation', \(details\) => \{ if \(details\.isMainFrame && !details\.isSameDocument\) boot\.navigationStarted\(\); \}\)/);
  assert.match(win, /wc\.on\('did-navigate', \(\) => boot\.navigationCommitted\(\)\)/);
  assert.match(win, /wc\.on\('did-fail-load', \(_e, code, _desc, _url, isMainFrame\) => \{ if \(isMainFrame\) boot\.loadFailed\(code\); \}\)/);
  assert.match(win, /wc\.on\('render-process-gone', \(_e, details\) => \{ if \(!allowQuit && details\.reason !== 'clean-exit'\) boot\.rendererGone\(details\.reason\); \}\)/);
  assert.match(win, /probe: async \(\) => !win\.isDestroyed\(\) && \(await wc\.mainFrame\.executeJavaScript\('window\.__cthStarted === true'\)\) === true/, 'the frame call, which does not wait for loading');
  assert.match(win, /reload: \(\) => \{ if \(!win\.isDestroyed\(\)\) loadApp\(\); \}/, 'loads the app afresh, not reload() of an error page');
  assert.match(win, /boot\.dispose\(\);/);
  assert.match(main, /powerMonitor\.on\('suspend', \(\) => \{[^\n]*for \(const dog of bootWatchdogs\.values\(\)\) dog\.suspended\(\);/);
  const resume = main.slice(main.indexOf('function onSystemResume('));
  assert.match(resume.slice(0, 400), /for \(const dog of bootWatchdogs\.values\(\)\) dog\.resumed\(\);/);
  assert.doesNotMatch(main, /app:rendererStarted/, 'no start message: it could come from a page already replaced');
  assert.doesNotMatch(read('src/preload/index.ts'), /rendererStarted/);
  const entry = read('src/renderer/src/main.tsx');
  const flag = entry.indexOf('.__cthStarted = true;');
  assert.ok(flag > 0 && flag < entry.indexOf('createRoot(root)'), 'the flag is set before the app renders');
});
