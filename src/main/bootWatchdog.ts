/**
 * A window whose code never starts is loaded again (owner, 2026-11-10: after
 * the Mac woke from hibernation the office sat on "Opening the office…" for
 * good; again 2026-11-12, see below).
 *
 * Whenever something happens to the page (a navigation starts or commits, a
 * load fails, the renderer goes away, the Mac wakes), the watchdog looks again
 * a little later and asks the page that is loaded NOW whether its code runs
 * (probe). A page that does not answer yes is loaded again, at most
 * MAX_RELOADS times in a row, so a page that can never start is not reloaded
 * in a loop. A yes resets the count, and so does a wake.
 *
 *   start / commit ──(BOOT_WAIT_MS)──┐
 *   fail / gone ─────(RETRY_MS)──────┼──▶ probe ──yes──▶ running
 *   wake ────────────(WAKE_WAIT_MS)──┘      │ no, or no answer in PROBE_MS
 *                                           ▼
 *                              reload (up to MAX_RELOADS, then stop and log)
 *
 * Why a probe and not a "started" message: on 2026-11-12 a page began loading
 * as the Mac went to sleep. At wake the old timer fired and reloaded it, and in
 * the same moment the old page finished loading and said it had started. That
 * message was taken for the new page's, the watchdog stood down, and the new
 * page (sent off before the Mac's network was back) never ran its code. A
 * probe asks the document on screen, so a message from a page already
 * replaced cannot count. Timers also pause while the Mac sleeps, so nothing is
 * reloaded before the network is back.
 *
 * The timers, the probe and the reload are passed in, so the tests drive it
 * with a fake clock. No electron imports.
 */

/** Long enough for a cold dev start (Vite bundling on first load), far longer
 *  than a packaged start. */
export const BOOT_WAIT_MS = 30_000;
/** A failed load is tried again after this, not at once. */
export const RETRY_MS = 2_000;
/** After a wake, give the network a moment before looking. */
export const WAKE_WAIT_MS = 5_000;
/** A page that does not answer the probe in this long is taken as stuck. */
export const PROBE_MS = 10_000;
export const MAX_RELOADS = 3;
/** Chromium's ERR_ABORTED: a navigation replaced by another, not a failure. */
export const ERR_ABORTED = -3;

export interface BootWatchdogDeps {
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (t: unknown) => void;
  /** Whether the page loaded now has run its code. May reject or never settle
   *  (a hung renderer); both count as no. */
  probe: () => Promise<boolean>;
  /** Load the app's page again from scratch (not reload(): after a failure the
   *  current address may be an error page). */
  reload: () => void;
  log: (line: string) => void;
}

export interface BootWatchdog {
  /** A main frame navigation began (the first load, a reload, Vite's reload). */
  navigationStarted(): void;
  /** A main frame navigation committed: a new document is on screen. */
  navigationCommitted(): void;
  /** The main frame failed to load, with Chromium's error code. */
  loadFailed(code: number): void;
  /** The renderer process went away (crashed, killed by the OS). */
  rendererGone(reason: string): void;
  /** The Mac is going to sleep: hold every timer. */
  suspended(): void;
  /** The Mac woke (or the screen unlocked): a fresh count, and a look soon. */
  resumed(): void;
  /** The window closed. */
  dispose(): void;
}

export function createBootWatchdog(deps: BootWatchdogDeps): BootWatchdog {
  let timer: unknown = null;
  let reloads = 0;
  let disposed = false;
  let asleep = false;
  /** Bumped by every event, so an answer to an older probe is ignored. */
  let generation = 0;

  const stop = (): void => { if (timer !== null) { deps.clearTimer(timer); timer = null; } };
  const arm = (fn: () => void, ms: number): void => { stop(); timer = deps.setTimer(() => { timer = null; fn(); }, ms); };

  const again = (why: string): void => {
    if (disposed || asleep) return;
    if (reloads >= MAX_RELOADS) {
      deps.log(`[boot] the window's code did not start (${why}); gave up after ${MAX_RELOADS} reloads`);
      return;
    }
    reloads++;
    deps.log(`[boot] the window's code did not start (${why}); loading it again (${reloads} of ${MAX_RELOADS})`);
    deps.reload();
    // The reload's navigation re-arms this; if it never starts, look anyway.
    arm(() => look('silent'), BOOT_WAIT_MS);
  };

  /** Ask the page on screen; reload unless it says its code runs. */
  const look = (why: string): void => {
    if (disposed || asleep) return;
    const mine = ++generation;
    let settled = false;
    const settle = (ok: boolean, reason: string): void => {
      if (settled) return;
      settled = true;
      if (mine !== generation) return;
      stop();
      if (ok) { reloads = 0; return; }
      again(reason);
    };
    arm(() => settle(false, `${why}, no answer`), PROBE_MS);
    let answer: Promise<boolean>;
    try { answer = deps.probe(); } catch { answer = Promise.resolve(false); }
    answer.then((ok) => settle(ok === true, why), () => settle(false, why));
  };

  const watch = (why: string, ms: number): void => {
    if (disposed) return;
    generation++;
    if (asleep) { stop(); return; }
    arm(() => look(why), ms);
  };

  return {
    navigationStarted() { watch('silent', BOOT_WAIT_MS); },
    navigationCommitted() { watch('silent', BOOT_WAIT_MS); },
    loadFailed(code) {
      if (code === ERR_ABORTED) return;
      watch(`load failed ${code}`, RETRY_MS);
    },
    rendererGone(reason) { watch(`renderer ${reason}`, RETRY_MS); },
    suspended() {
      if (disposed) return;
      asleep = true;
      generation++;
      stop();
    },
    resumed() {
      if (disposed) return;
      asleep = false;
      reloads = 0;
      watch('after wake', WAKE_WAIT_MS);
    },
    dispose() {
      disposed = true;
      generation++;
      stop();
    }
  };
}
