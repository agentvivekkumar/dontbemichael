/**
 * Where a pasted screenshot lands before it is attached to a message.
 *
 * `clipboard:saveImage` used to write into the OS temp folder, and only that
 * path went into the message text (TODOS.md, Attachments: "Keep pasted
 * screenshots somewhere durable"). The OS can reclaim its temp folder at any
 * time, and a message pasted into a busy teammate's queue can wait a long
 * time before delivery, so by then the file could already be gone and the
 * message would reference a path that no longer exists.
 *
 * This saves into an app-owned folder under userData instead, which nothing
 * but this app reclaims, and sweeps paste files older than a week on the
 * first save each run — long enough that no message still genuinely queued
 * gets swept out from under it, but enough to stop abandoned pastes (a
 * screenshot pasted into a draft that was edited to remove it, or never
 * sent) from piling up forever.
 *
 * What this does not yet do: delete a paste the moment its own message is
 * delivered or removed. That needs hooking the message queue's send and
 * remove paths, which is its own change; the startup sweep is the safety net
 * until then.
 */
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Paste files older than this, found on the first save each run, are removed. */
export const PASTE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

let swept = false;

/** `<userDataRoot>/pastes`, the folder pasted screenshots are saved into. */
export function pastesDir(userDataRoot: string): string {
  return join(userDataRoot, 'pastes');
}

/** Removes paste files older than `maxAgeMs`. Best effort: a missing folder,
 *  or a file another process is still writing, is left alone. */
export function sweepStalePastes(dir: string, maxAgeMs = PASTE_MAX_AGE_MS, now = Date.now()): void {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return; }
  for (const entry of entries) {
    const p = join(dir, entry);
    try {
      const st = statSync(p);
      if (st.isFile() && now - st.mtimeMs > maxAgeMs) rmSync(p, { force: true });
    } catch { /* gone already, or not ours to remove */ }
  }
}

/** Saves a pasted image's PNG bytes into the pastes folder and returns the
 *  file a message should reference. Sweeps stale pastes once per run, the
 *  first time this is called (same lazy-once pattern as the secret store's
 *  temp-file sweep in integrations.ts). */
export function savePastedImage(
  userDataRoot: string,
  png: Uint8Array,
  now = Date.now()
): { path: string; name: string } {
  const dir = pastesDir(userDataRoot);
  mkdirSync(dir, { recursive: true });
  if (!swept) {
    swept = true;
    sweepStalePastes(dir, PASTE_MAX_AGE_MS, now);
  }
  const name = `paste-${now}.png`;
  const dest = join(dir, name);
  writeFileSync(dest, png);
  return { path: dest, name };
}
