/**
 * Writes into folders a team member's shell can write too: the hive root and
 * everything under it (each member's folder, the shared board, the logs).
 *
 * A member can put a link, or a second name for another file, wherever the
 * app is about to write. A plain write follows it, so the app, with the
 * owner's rights and no sandbox, would change a file outside the hive. Here:
 *  - every folder from the hive root down to the file must be a plain folder,
 *    not a link;
 *  - a whole file is written beside the target and renamed over it, which
 *    replaces a link or a second name at that place instead of writing
 *    through it (writeFileAtomic);
 *  - an append opens the file without following a link, and only appends to
 *    a plain file with one name.
 * A member who swaps a folder in the instant between the check and the write
 * can still win that race, but nothing it leaves in place is followed by the
 * app's next write.
 */
import { closeSync, constants, fstatSync, ftruncateSync, openSync, readFileSync, realpathSync, writeSync } from 'node:fs';
import { openNoFollow } from './noFollow';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { writeFileAtomic, type AtomicFileOps } from './atomicFile';

export class HiveFileError extends Error {}

/** `path` sits inside `root` (or is it). */
export function isInside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === '' || (!!rel && !rel.startsWith('..') && !isAbsolute(rel));
}

/** On a Mac or Windows the disk ignores letter case, so a name the app made
 *  and the name on disk can differ only in case. */
const sameName = (a: string, b: string): boolean =>
  process.platform === 'darwin' || process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;

/** Every folder from `root` down to `dir` is a plain folder: none is a link
 *  that leads somewhere else. `root` itself may sit behind a link (an office
 *  in a linked folder); what is checked is everything below it. False when
 *  `dir` is outside `root` or is missing. */
export function plainFolderBelow(root: string, dir: string): boolean {
  if (!isInside(root, dir)) return false;
  // The root itself: no folder below it to check (log.jsonl, fleet.json).
  if (relative(root, dir) === '') return true;
  try {
    return sameName(realpathSync.native(dir), join(realpathSync.native(root), relative(root, dir)));
  } catch {
    return false;
  }
}

function checkFolder(root: string, path: string): void {
  if (!plainFolderBelow(root, dirname(path))) {
    throw new HiveFileError(`not written: a folder on the way to ${relative(root, path)} is a link or is missing`);
  }
}

/** Write a whole file inside the hive: a new file renamed over the target. */
export function writeHiveFile(root: string, path: string, text: string, mode = 0o644, ops?: AtomicFileOps): void {
  checkFolder(root, path);
  writeFileAtomic(path, text, mode, ops);
}

/** A file's text inside the hive: '' when there is none, null when it is a
 *  link, a second name for another file, not a plain file, or can't be read.
 *  Opened without following a link and without waiting on a pipe, so a
 *  member can't make the app read (and copy where others can see it) a file
 *  of the owner's, or stall it. */
export function readHiveText(path: string): string | null {
  let fd: number;
  try {
    fd = openNoFollow(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'ENOENT' ? '' : null;
  }
  try {
    const st = fstatSync(fd);
    if (!st.isFile() || st.nlink !== 1) return null;
    return readFileSync(fd, 'utf8');
  } catch {
    return null;
  } finally {
    closeSync(fd);
  }
}

/** Empty a file inside the hive in place, for when it can't be removed or
 *  replaced (a read only folder, a file Windows holds open). Refused, and the
 *  file left as it is, when it is a link, a second name or not a plain file. */
export function emptyHiveFile(root: string, path: string): void {
  checkFolder(root, path);
  // Opened without O_TRUNC: nothing is cut until the file is known to be plain.
  // Never waits on a pipe a member left in its place.
  const fd = openNoFollow(path, constants.O_WRONLY | (constants.O_NONBLOCK ?? 0));
  try {
    const st = fstatSync(fd);
    if (!st.isFile() || st.nlink !== 1) throw new HiveFileError(`not emptied: ${relative(root, path)} is not a plain file`);
    ftruncateSync(fd, 0);
  } finally {
    closeSync(fd);
  }
}

/** Add `text` to the end of a file inside the hive, made if missing. Refused
 *  when the file is a link, a second name for another file, or not a file. */
export function appendHiveFile(root: string, path: string, text: string): void {
  checkFolder(root, path);
  // Never waits on a pipe a member left in its place.
  const fd = openNoFollow(path, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | (constants.O_NONBLOCK ?? 0), 0o644);
  try {
    const st = fstatSync(fd);
    if (!st.isFile() || st.nlink !== 1) throw new HiveFileError(`not written: ${relative(root, path)} is not a plain file`);
    const buf = Buffer.from(text, 'utf8');
    for (let at = 0; at < buf.length;) at += writeSync(fd, buf, at, buf.length - at);
  } finally {
    closeSync(fd);
  }
}
