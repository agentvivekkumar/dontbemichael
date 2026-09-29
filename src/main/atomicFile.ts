/**
 * Write a file so a crash or power loss never leaves it half written.
 *
 * The data goes to a temporary file beside the target, is flushed to disk, and
 * only then is renamed over the target (rename is atomic on the same volume).
 * A reader sees the old file or the new one, never a torn mix. If anything
 * fails, the temporary file is removed and the old file is left untouched.
 *
 * First user: the secret store (integrations.ts), which holds every saved
 * password and key in one file. Once OAuth refresh tokens rotate (QuickBooks,
 * hourly), that file is rewritten often, and a torn write would lose all of
 * them at once (CEO review QBO-7, 2026-09-29).
 *
 * Electron-free, and `ops` is injectable, so tests can fail any step.
 */
import { randomBytes } from 'node:crypto';
import { closeSync, fsyncSync, openSync, renameSync, rmSync, writeSync } from 'node:fs';

export interface AtomicFileOps {
  openSync: typeof openSync;
  writeSync: (fd: number, data: string) => number;
  fsyncSync: typeof fsyncSync;
  closeSync: typeof closeSync;
  renameSync: typeof renameSync;
  rmSync: typeof rmSync;
}

const defaultOps: AtomicFileOps = {
  openSync,
  writeSync: (fd, data) => writeSync(fd, data, null, 'utf8'),
  fsyncSync,
  closeSync,
  renameSync,
  rmSync
};

export function writeFileAtomic(path: string, data: string, mode = 0o600, ops: AtomicFileOps = defaultOps): void {
  const tmp = `${path}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    const fd = ops.openSync(tmp, 'w', mode);
    try {
      ops.writeSync(fd, data);
      ops.fsyncSync(fd);
    } finally {
      ops.closeSync(fd);
    }
    ops.renameSync(tmp, path);
  } catch (e) {
    try { ops.rmSync(tmp, { force: true }); } catch { /* nothing left to clean */ }
    throw e;
  }
}
