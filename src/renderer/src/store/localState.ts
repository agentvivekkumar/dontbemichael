/**
 * The renderer's own saved state: every localStorage key starting with `cth.`
 * (roster cards, selection, queues, floor view). A relaunch into a different or
 * empty office clears it; a switch that can still fail takes a snapshot first
 * and puts it back, because the app then keeps running on the current office.
 */
const PREFIX = 'cth.';

export function snapshotLocalState(): Record<string, string> {
  const snap: Record<string, string> = {};
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(PREFIX)) snap[k] = window.localStorage.getItem(k) ?? '';
    }
  } catch { /* storage unavailable: nothing to keep */ }
  return snap;
}

export function restoreLocalState(snap: Record<string, string>): void {
  try { for (const [k, v] of Object.entries(snap)) window.localStorage.setItem(k, v); } catch { /* noop */ }
}

/** Clear every renderer-side persisted key so a relaunch starts truly empty. */
export function clearLocalState(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    for (const k of keys) window.localStorage.removeItem(k);
  } catch { /* noop */ }
}
