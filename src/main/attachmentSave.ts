/**
 * Writes an email attachment into a team member's folder
 * (docs/designs/agent-save-attachment.md). The file comes from outside the
 * business, so nothing here trusts its name: it lands in one known subfolder,
 * never replaces anything, is never executable, and carries the mark the
 * operating system puts on a download. The app never launches it by itself.
 */

import { execFile } from 'node:child_process';
import { closeSync, constants, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, writeFileSync, writeSync } from 'node:fs';
import { basename, join } from 'node:path';
import { isSameOrInside } from './pathInside';
import { attachmentKind } from '../shared/attachmentKind';
import { cleanFolderName } from '../shared/folderName';

/** The biggest attachment a member saves, about what email carries at all. */
export const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;

/** The subfolder saved attachments go to, inside the member's own folder. */
export const ATTACHMENTS_FOLDER = 'Email attachments';

const COPIES_MAX = 50;

export class AttachmentSaveError extends Error {}

/** What the operating system marks a download with. Best effort: a file with
 *  no mark is still not executable and is still never opened by the app. */
export function markFromOutside(path: string): void {
  if (process.platform === 'darwin') {
    const value = `0081;${Math.floor(Date.now() / 1000).toString(16)};Don't Be Michael;`;
    execFile('xattr', ['-w', 'com.apple.quarantine', value, path], (e) => { if (e) console.warn('[mail] attachment mark:', e.message); });
  } else if (process.platform === 'win32') {
    try { writeFileSync(`${path}:Zone.Identifier`, '[ZoneTransfer]\r\nZoneId=3\r\n'); } catch (e) { console.warn('[mail] attachment mark:', e); }
  }
}

/** The file's name without its ending, safe on every system. */
export function attachmentStem(name: string): string {
  const base = basename(name.replace(/\\/g, '/')).replace(/\.[^.]*$/, '');
  return cleanFolderName(base, 'attachment');
}

/** The subfolder, made if need be. Refused when anything on the way is a link
 *  that leads out of the member's folder. */
function attachmentsDir(folder: string): string {
  let real: string;
  try { real = realpathSync(folder); } catch { throw new AttachmentSaveError('Your folder could not be found.'); }
  const dir = join(real, ATTACHMENTS_FOLDER);
  try {
    mkdirSync(dir, { recursive: true });
    const st = lstatSync(dir);
    if (st.isDirectory() && !st.isSymbolicLink() && isSameOrInside(real, realpathSync(dir))) return dir;
  } catch (e) {
    throw new AttachmentSaveError(`The ${ATTACHMENTS_FOLDER} folder could not be made: ${(e as NodeJS.ErrnoException).code ?? 'unknown error'}.`);
  }
  throw new AttachmentSaveError(`${ATTACHMENTS_FOLDER} in your folder is not a plain folder, so nothing was saved.`);
}

/** Saves the bytes under a name of their own and returns its path. The same
 *  file saved again returns the first copy, so a retry leaves no duplicates. */
export function saveAttachmentFile(
  input: { folder: string; name: string; ending: string; bytes: Buffer },
  mark: (path: string) => void = markFromOutside
): string {
  const dir = attachmentsDir(input.folder);
  const stem = attachmentStem(input.name);
  for (let n = 1; n <= COPIES_MAX; n++) {
    const path = join(dir, `${stem}${n === 1 ? '' : ` (${n})`}.${input.ending}`);
    let fd: number;
    try {
      // Exclusive and no following a link: nothing already there is touched.
      fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw new AttachmentSaveError(`The file could not be saved: ${(e as NodeJS.ErrnoException).code ?? 'unknown error'}.`);
      try {
        if (lstatSync(path).isFile() && readFileSync(path).equals(input.bytes)) return path;
      } catch { /* try the next name */ }
      continue;
    }
    try { writeSync(fd, input.bytes); } finally { closeSync(fd); }
    mark(path);
    return path;
  }
  throw new AttachmentSaveError('Too many files with this name in your Email attachments folder.');
}

/**
 * A file one member asked another for: the file the sender saved travels with
 * the sender's message and lands in the asker's own folder. Neither member
 * opens the other's folder (owner, 2026-10-31): the app does the copying, and
 * only of a file the app saved, checked again as it leaves. Returns where it
 * landed.
 */
export function handOverAttachment(
  input: { file: string; fromFolder: string; toFolder: string },
  mark: (path: string) => void = markFromOutside
): string {
  let real: string;
  let own: string;
  try {
    real = realpathSync(input.file);
    own = realpathSync(join(input.fromFolder, ATTACHMENTS_FOLDER));
  } catch { throw new AttachmentSaveError('That file could not be found. Save it with save_attachment first.'); }
  if (real === own || !isSameOrInside(own, real) || !lstatSync(real).isFile()) {
    throw new AttachmentSaveError(`Only a file from your own ${ATTACHMENTS_FOLDER} folder can go with a message.`);
  }
  if (lstatSync(real).size > ATTACHMENT_MAX_BYTES) throw new AttachmentSaveError('That file is too big to send on.');
  const bytes = readFileSync(real);
  const kind = attachmentKind(bytes, basename(real));
  if (!kind) throw new AttachmentSaveError('That is not a kind of file the office takes in, so it was not sent on.');
  return saveAttachmentFile({ folder: input.toFolder, name: basename(real), ending: kind.ending, bytes }, mark);
}
