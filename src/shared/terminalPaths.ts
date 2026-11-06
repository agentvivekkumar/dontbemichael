/**
 * What a ⌘-clicked path token in terminal output should DO.
 *
 * v0.3.4 shipped this for markdown only: `*.md` in agent output became a link
 * that opened the rendered preview. Everything else in the same line stayed
 * dead text, so a printed `src/main/updater.ts` was something you had to
 * retype into the file tree by hand.
 *
 * Three outcomes, and the split is about what we can HONESTLY do with the file:
 *
 *   preview → markdown. There is a renderer for it, and reading is the point.
 *   edit    → source and config we can put in Monaco without lying about it.
 *   reveal  → everything else: images, archives, binaries, PDFs, unknown
 *             extensions, directories. We open the OS file browser at the
 *             file's parent instead of pretending to understand the bytes.
 *
 * WHY REVEAL RATHER THAN OPEN. The token comes from AGENT OUTPUT, which is
 * hostile input. Handing an arbitrary path to the OS "open with default app"
 * call would let a line of terminal text become an execution: a printed
 * `installer.dmg`, `payload.app`, or `.desktop` file is one ⌘-click from
 * running. Revealing only ever opens a file browser, so the worst an agent can
 * do by printing a path is show you a folder you could already reach yourself.
 * That is why this module never returns an "open" verdict for an unknown type.
 *
 * MATCHING IS THE HARD PART, not classifying. Anchoring on a known extension
 * (what the markdown version did) cannot see `report.pdf` — and `report.pdf` is
 * exactly the case that needs reveal. Opening the match up to ANY extension
 * instead drags in every version string and decimal on the line: `v0.4.5`,
 * `1.5`, `electron 43.0`. The rule that separates them is below.
 */

import { isImagePath } from './imageTypes';
import { extensionOf } from './askFiles';

/** Extensions that open in the markdown preview. */
const PREVIEW_EXTS = new Set(['md', 'markdown']);

/**
 * Extensions we are willing to put in the editor. Deliberately a list rather
 * than "anything that isn't binary": a wrong guess here opens a font or a
 * sqlite file as mojibake, and the reveal fallback is a strictly better answer
 * for anything we are not sure about.
 */
const EDIT_EXTS = new Set([
  // source
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'kts', 'swift', 'c', 'h', 'cc', 'cpp',
  'hpp', 'cs', 'php', 'lua', 'pl', 'r', 'scala', 'clj', 'ex', 'exs', 'erl',
  'dart', 'zig', 'hs', 'ml', 'vue', 'svelte', 'astro',
  // shell
  'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd',
  // markup and style
  'html', 'htm', 'css', 'scss', 'sass', 'less', 'xml', 'xsl',
  // data and config
  'json', 'jsonc', 'json5', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf',
  'env', 'properties', 'lock', 'gradle', 'tf', 'tfvars', 'graphql', 'gql',
  'proto', 'sql', 'csv', 'tsv',
  // plain text
  'txt', 'text', 'log', 'diff', 'patch', 'gitignore', 'dockerignore',
  'editorconfig', 'npmrc', 'nvmrc'
]);

export type PathAction = 'preview' | 'edit' | 'reveal';

/**
 * Candidate path tokens in one line of terminal output.
 *
 * The extension must START WITH A LETTER and run up to 15 more alphanumerics, so
 * `application.properties` comes through whole. Starting with a letter is what keeps `v0.4.5`, `1.5`, and `0.92` out: their
 * "extension" is digits. `node_modules/.bin` has no extension and is caught by
 * the separator rule in `isPathToken` instead.
 *
 * The leading `X:\` group exists because `:` cannot be in the body class (it
 * would swallow the `:line` suffix). Without the group the match on
 * `C:\Users\x\a.ts` starts at the backslash, and a drive-less `\Users\x\a.ts`
 * then looks RELATIVE and gets joined onto the agent's cwd.
 */
// Only explicit path prefixes qualify for a whole quoted match; otherwise prose
// such as "Update README.md" must fall through to the filename inside it.
// A folder name may hold spaces ("Business Reports/summary.md"), but a space is
// never right before or after a separator in a real path. Prose that happens to
// start with a slash ("/ see notes.md") has one, so it falls through too.
const quotedPathRe = (q: string): string =>
  String.raw`${q}(?:[A-Za-z]:[\\/]|~[\\/]|\.{1,2}[\\/]|[\\/])(?!\s)(?:[^${q}\r\n\\/]|(?<!\s)[\\/](?!\s))*\.[A-Za-z][A-Za-z0-9]{0,15}(?::\d+)?${q}`;
const UNQUOTED_PATH = String.raw`(?:[A-Za-z]:[\\/])?[A-Za-z0-9_@.~/\\+-]*[A-Za-z0-9_@~/\\+-]\.[A-Za-z][A-Za-z0-9]{0,15}(?::\d+)?`;
const PATH_TOKEN_RE = new RegExp(
  [quotedPathRe('"'), quotedPathRe("'"), quotedPathRe('`'), UNQUOTED_PATH].join('|'),
  'g'
);

/** A fresh matcher. The regex is stateful (`g`), so callers must never share one. */
export function pathTokenMatcher(): RegExp {
  return new RegExp(PATH_TOKEN_RE.source, 'g');
}

/**
 * A path that names another machine: a UNC share (`//host/share`, `\\host\share`),
 * a Windows device or long path (`\\?\`, `\\.\`), or macOS's automounted network
 * folders (`/net/host`, `/Network/`). Even a stat of one reaches out: Windows opens
 * an SMB connection that can send the user's NTLM hash, and macOS autofs contacts
 * the host. Terminal text is agent output, which can carry text from untrusted
 * mail or web pages, so such a path is never stat'ed, on hover or on click.
 */
export function isNetworkPath(p: string): boolean {
  const s = String(p ?? '').trim();
  return /^[\\/]{2}/.test(s) || /^\/(net|network)(\/|$)/i.test(s);
}

/** A match in its quotes with a space inside: a real path with spaces in a
 *  folder name ("/Users/Jane/My Reports/summary.md") or quoted prose that starts
 *  with a folder ("/tmp is full, see notes.md"). No pattern can tell them apart;
 *  only the disk can. */
export function quotedNeedsCheck(raw: string): boolean {
  const q = raw[0];
  return (q === '"' || q === "'" || q === '`') && raw.length > 2 && raw[raw.length - 1] === q && /\s/.test(raw);
}

/**
 * The tokens on a line worth trying as links, each with its offset in `text`. A
 * quoted match with a space inside is kept whole only when `onDisk` says that
 * path is known to be on disk; otherwise the bare file names inside it are tried
 * instead, so "/tmp is full, see notes.md" links notes.md, as quoted prose with
 * no folder at its start already does.
 *
 * Synchronous on purpose: the terminal asks on hover and must answer for the
 * line as it is now. `onDisk` gets the raw match, quotes and all, and answers
 * from what is already known (the terminal starts a check in the background for
 * a path it has not seen, so the next hover links it whole).
 *
 * Only a bare file name falls back, never a token with a separator: in
 * `"/Users/Jane/Q3 Reports/summary.md"` printed before the file exists, the piece
 * `Reports/summary.md` joined to the agent's folder could open a different, older
 * file.
 */
export function linkableTokens(
  text: string, onDisk: (raw: string) => boolean
): Array<{ raw: string; index: number }> {
  const out: Array<{ raw: string; index: number }> = [];
  const re = pathTokenMatcher();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[0];
    let whole = !quotedNeedsCheck(raw);
    if (!whole) { try { whole = onDisk(raw); } catch { whole = false; } }
    if (whole) { out.push({ raw, index: m.index }); continue; }
    const inner = new RegExp(UNQUOTED_PATH, 'g');
    const body = raw.slice(1, -1);
    let n: RegExpExecArray | null;
    while ((n = inner.exec(body)) !== null) {
      if (!/[\\/]/.test(n[0])) out.push({ raw: n[0], index: m.index + 1 + n.index });
    }
  }
  return out;
}

/**
 * The cell columns (1 based, first and last) a match covers on a terminal
 * line, from its string offsets. A wide character (Chinese, Japanese) takes
 * two cells but one character, so string offsets alone land on the wrong
 * cells (ship review of #280). `cells` is the line as the terminal holds it:
 * each cell's characters and width, width 0 for the second half of a wide one.
 * A quoted match covers only what is inside its quotes.
 */
export function linkCellRange(
  cells: ReadonlyArray<{ chars: string; width: number }>, start: number, end: number, raw: string
): { startX: number; endX: number } | null {
  let s = start;
  let e = end;
  const q = raw[0];
  if ((q === '"' || q === "'" || q === '`') && raw.length > 2 && raw[raw.length - 1] === q) { s += 1; e -= 1; }
  const colOf: number[] = [];
  const widthOf: number[] = [];
  cells.forEach((c, x) => {
    if (c.width === 0) return;
    const chars = c.chars || ' ';
    for (let i = 0; i < chars.length; i++) { colOf.push(x + 1); widthOf.push(c.width); }
  });
  if (s >= e || e > colOf.length) return null;
  return { startX: colOf[s], endX: colOf[e - 1] + widthOf[e - 1] - 1 };
}

/** Strip shell/prose wrapping and any trailing `:line` from a raw match. */
export function stripPathToken(raw: string): string {
  return raw
    .replace(/^["'`([<]+/, '')
    .replace(/["'`)\]>,.;:]+$/, '')
    .replace(/:(\d+)$/, '');
}

/**
 * The extension that decides what a path is. A dotfile such as `.gitignore`,
 * `.env` or `.npmrc` is named by its type, so the name after its dot counts;
 * `extensionOf` (shared with Ask me) gives a dotfile none.
 */
function typeOf(token: string): string {
  const ext = extensionOf(token);
  if (ext) return ext;
  const name = token.split(/[\\/]/).pop() ?? '';
  return /^\.[A-Za-z][A-Za-z0-9]*$/.test(name) ? name.slice(1).toLowerCase() : '';
}

/**
 * Is this token worth underlining at all?
 *
 * A token qualifies when it carries an extension we KNOW, or when it contains a
 * path separator. The separator clause is what lets `docs/report.pdf` and
 * `/tmp/dump.bin` reach the reveal branch while a bare `electron.43` on a prose
 * line stays dead text. It is a heuristic and it is meant to be: the cost of a
 * false positive is one underline that stats to nothing and does nothing.
 */
export function isPathToken(token: string): boolean {
  const ext = typeOf(token);
  if (!ext) return false;
  if (PREVIEW_EXTS.has(ext) || EDIT_EXTS.has(ext) || isImagePath(token)) return true;
  return /[/\\]/.test(token);
}

/**
 * What ⌘-click should do with `token`.
 *
 * Images resolve to `reveal` on purpose. The app HAS an image viewer (the IDE
 * routes there), but a terminal click is a navigation gesture: you clicked a
 * path because you want to get to the file, and Finder is where you can then
 * drag, rename, or open it with the tool you actually wanted. Change this to
 * 'preview' if that reading turns out to be wrong; the classifier is the only
 * place that decides.
 */
export function classifyPathToken(token: string): PathAction {
  const ext = typeOf(token);
  if (PREVIEW_EXTS.has(ext)) return 'preview';
  if (isImagePath(token)) return 'reveal';
  if (EDIT_EXTS.has(ext)) return 'edit';
  return 'reveal';
}
