/**
 * Reading a file an agent could have written, with the owner's rights: never
 * through a link, never waiting on a pipe, never a file too big to be a
 * message (red team, third ship). Shared by the hive's router and Pulse's
 * backfill of its lists, which runs until a scan reads every file or its tries
 * run out (ship review 2026-10-17).
 */
import { closeSync, constants, fstatSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { openNoFollow } from './noFollow';

/** The most a message file may hold for the app to read it. */
export const MAX_MESSAGE_FILE_BYTES = 4 * 1024 * 1024;

/** Why a message file gave no text: not there, a link, not a plain file (a
 *  pipe or a folder), too big to be a message, or there and unreadable. */
export type MessageSkip = 'missing' | 'link' | 'not-file' | 'too-big' | 'failed';

/** A message file read without following a link or waiting on a pipe: an
 *  agent's own folder may hold either. Null for anything but a plain file. */
export function readMessageFile(path: string): string | null {
  const r = readMessageFileOrWhy(path);
  return 'text' in r ? r.text : null;
}

/** readMessageFile, saying why when it gives nothing, so a caller that tells
 *  a skip on purpose from a miss by chance uses the same rules as the read. */
export function readMessageFileOrWhy(path: string): { text: string } | { skip: MessageSkip } {
  let fd = -1;
  try {
    fd = openNoFollow(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
    const st = fstatSync(fd);
    if (!st.isFile()) return { skip: 'not-file' };
    if (st.size > MAX_MESSAGE_FILE_BYTES) return { skip: 'too-big' };
    return { text: readFileSync(fd, 'utf8') };
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === 'ELOOP') return { skip: 'link' };
    if (code === 'EISDIR') return { skip: 'not-file' };
    // A link whose target is gone, or one followed where O_NOFOLLOW is missing.
    try { if (lstatSync(path).isSymbolicLink()) return { skip: 'link' }; } catch { /* gone too */ }
    return { skip: code === 'ENOENT' ? 'missing' : 'failed' };
  } finally {
    if (fd >= 0) try { closeSync(fd); } catch { /* closed */ }
  }
}

/** `parts` inside `base` when every step is a real folder, not a link an
 *  agent made to somewhere else; null otherwise. Reads only, changes nothing. */
export function realFolderIn(base: string, ...parts: string[]): string | null {
  let cur = base;
  try {
    for (const p of ['', ...parts]) {
      if (p) cur = join(cur, p);
      if (!lstatSync(cur).isDirectory()) return null;
    }
    return realpathSync(cur) === join(realpathSync(base), ...parts) ? cur : null;
  } catch { return null; }
}

/** The id the app gives a Research answer it delivers: the same for the same
 *  file (its name and text), so an answer delivered again after a crash
 *  replaces itself. The backfill finds delivered answers by it. */
export function researchDeliveredId(fileKey: string): string {
  return `research-${createHash('sha256').update(fileKey).digest('hex').slice(0, 24)}`;
}
