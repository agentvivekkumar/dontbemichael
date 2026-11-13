/**
 * Opening a file an agent could have placed, never through a link, on every
 * platform (PR 695 review, 2026-11-12).
 *
 * POSIX has O_NOFOLLOW: the kernel refuses a link as the last part of the
 * path. Windows has no such flag, and `O_NOFOLLOW ?? 0` there quietly meant
 * "follow it", so a .json link in an agent's folder made the app read (or
 * write) a file of the owner's outside the office. Where the flag is missing
 * the path is looked at without following (lstat) before the open, and the
 * open file must still be the very file the path names after it (same device
 * and file id), so a link swapped in between is refused too.
 *
 * A refusal throws an error with code ELOOP, as O_NOFOLLOW does, so callers
 * read it the same way on every platform.
 */
import { closeSync, constants, fstatSync, lstatSync, openSync, type BigIntStats } from 'node:fs';
import { lstat, open, type FileHandle } from 'node:fs/promises';

/** The platform's O_NOFOLLOW, or null where there is none (Windows). */
export const NOFOLLOW: number | null = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : null;

const refused = (path: string): NodeJS.ErrnoException =>
  Object.assign(new Error(`ELOOP: refused a link, open '${path}'`), { code: 'ELOOP', errno: -62, syscall: 'open', path });

const taken = (path: string): NodeJS.ErrnoException =>
  Object.assign(new Error(`EEXIST: file already exists, open '${path}'`), { code: 'EEXIST', errno: -17, syscall: 'open', path });

const sameFile = (a: BigIntStats, b: BigIntStats): boolean => a.ino === b.ino && a.dev === b.dev;

/** What the path names before the open, without following it: null when
 *  nothing is there and the open may make it. An exclusive create on a name
 *  a link holds says the name is taken, as the kernel does with O_NOFOLLOW,
 *  so a caller that moves on to the next name still does (ship coverage
 *  audit, 2026-11-13: a saved attachment failed with ELOOP on Windows). */
function before(path: string, flags: number, st: () => BigIntStats): BigIntStats | null {
  try {
    const s = st();
    if (s.isSymbolicLink()) throw (flags & constants.O_CREAT) && (flags & constants.O_EXCL) ? taken(path) : refused(path);
    return s;
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT' && (flags & constants.O_CREAT)) return null;
    throw e;
  }
}

/** The open file is the one the path names now, and the one it named before. */
function check(path: string, was: BigIntStats | null, opened: BigIntStats, now: BigIntStats): void {
  if (now.isSymbolicLink() || !sameFile(now, opened) || (was && !sameFile(was, opened))) throw refused(path);
}

/** openSync that never goes through a link. `nofollow` is for tests. */
export function openNoFollow(path: string, flags: number, mode?: number, nofollow: number | null = NOFOLLOW): number {
  if (nofollow !== null) return openSync(path, flags | nofollow, mode);
  const was = before(path, flags, () => lstatSync(path, { bigint: true }));
  const fd = openSync(path, flags, mode);
  try {
    check(path, was, fstatSync(fd, { bigint: true }), lstatSync(path, { bigint: true }));
    return fd;
  } catch (e) {
    try { closeSync(fd); } catch { /* closed */ }
    throw e;
  }
}

/** fs/promises open that never goes through a link. `nofollow` is for tests. */
export async function openNoFollowAsync(path: string, flags: number, mode?: number, nofollow: number | null = NOFOLLOW): Promise<FileHandle> {
  if (nofollow !== null) return open(path, flags | nofollow, mode);
  let was: BigIntStats | null;
  try {
    const s = await lstat(path, { bigint: true });
    was = before(path, flags, () => s);
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT' && (flags & constants.O_CREAT)) was = null;
    else throw e;
  }
  const fh = await open(path, flags, mode);
  try {
    check(path, was, await fh.stat({ bigint: true }), await lstat(path, { bigint: true }));
    return fh;
  } catch (e) {
    await fh.close().catch(() => { /* closed */ });
    throw e;
  }
}
