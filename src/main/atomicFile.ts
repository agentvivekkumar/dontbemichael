/**
 * Write a file so a crash or power loss never leaves it half written.
 *
 * The data goes to a temporary file beside the target, is flushed to disk, and
 * only then is renamed over the target (rename is atomic on the same volume).
 * A reader sees the old file or the new one, never a torn mix. If anything
 * fails, the temporary file is removed and the old file is left untouched.
 *
 * First user: the secret store (integrations.ts), which holds every saved
 * password and key (mailboxes, engines, integrations) in one file, so a torn
 * write would lose all of them at once.
 *
 * Electron-free, and `ops` is injectable, so tests can fail any step.
 */
import { randomBytes } from 'node:crypto';
import { dirname } from 'node:path';
import { closeSync, fsyncSync, openSync, renameSync, rmSync, writeFileSync } from 'node:fs';

export interface AtomicFileOps {
  openSync: typeof openSync;
  /** Writes `data` and returns the bytes written. */
  writeSync: (fd: number, data: string) => number;
  fsyncSync: typeof fsyncSync;
  closeSync: typeof closeSync;
  renameSync: typeof renameSync;
  rmSync: typeof rmSync;
}

const defaultOps: AtomicFileOps = {
  openSync,
  // writeFileSync keeps writing until every byte is down; a single
  // fs.writeSync may stop short on a nearly full disk.
  writeSync: (fd, data) => { writeFileSync(fd, data, 'utf8'); return Buffer.byteLength(data, 'utf8'); },
  fsyncSync,
  closeSync,
  renameSync,
  rmSync
};

export function writeFileAtomic(path: string, data: string, mode = 0o600, ops: AtomicFileOps = defaultOps): void {
  const tmp = `${path}.${randomBytes(6).toString('hex')}.tmp`;
  // Only a temp file this call created is removed on failure.
  let created = false;
  try {
    // 'wx': a new file only, never one already there (or a link) at that name.
    const fd = ops.openSync(tmp, 'wx', mode);
    created = true;
    try {
      // A short write must never be renamed into place: that is the torn file
      // this exists to prevent.
      const want = Buffer.byteLength(data, 'utf8');
      const wrote = ops.writeSync(fd, data);
      if (wrote !== want) throw new Error(`short write: ${wrote} of ${want} bytes`);
      ops.fsyncSync(fd);
    } finally {
      ops.closeSync(fd);
    }
    ops.renameSync(tmp, path);
  } catch (e) {
    if (created) { try { ops.rmSync(tmp, { force: true }); } catch { /* nothing left to clean */ } }
    throw e;
  }
  // Flush the folder too, so the rename itself survives a power cut. Best
  // effort: the new file is already in place, and Windows can't open a folder.
  try {
    const dir = ops.openSync(dirname(path), 'r');
    try { ops.fsyncSync(dir); } finally { ops.closeSync(dir); }
  } catch { /* the write already succeeded */ }
}
