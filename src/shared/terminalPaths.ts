/**
 * Which tokens in terminal output are paths a ⌘-click can show in the file
 * browser (Finder on a Mac). Every link reveals: the app opens the OS file
 * browser at the file, never the file itself.
 *
 * WHY REVEAL RATHER THAN OPEN. The token comes from AGENT OUTPUT, which is
 * hostile input. Handing an arbitrary path to the OS "open with default app"
 * call would let a line of terminal text become an execution: a printed
 * `installer.dmg`, `payload.app`, or `.desktop` file is one ⌘-click from
 * running. Revealing only ever opens a file browser, so the worst an agent can
 * do by printing a path is show you a folder you could already reach yourself.
 * That is why no link ever opens a file.
 *
 * MATCHING IS THE HARD PART. Anchoring on a known extension
 * (what the markdown version did) cannot see `report.pdf` — and `report.pdf` is
 * exactly the case that needs reveal. Opening the match up to ANY extension
 * instead drags in every version string and decimal on the line: `v0.4.5`,
 * `1.5`, `electron 43.0`. The rule that separates them is below.
 */

import { isImagePath } from './imageTypes';
import { extensionOf } from './askFiles';

/**
 * Extensions that make a bare file name (no separator) a link. Deliberately a
 * list: anything else needs a path separator, so prose such as `spring.thaw`
 * stays dead text.
 */
const KNOWN_EXTS = new Set([
  // markdown
  'md', 'markdown',
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

/** A match in its quotes with a space inside: a real path with spaces in a
 *  folder name ("/Users/Jane/My Reports/summary.md") or quoted prose that starts
 *  with a folder ("/tmp is full, see notes.md"). No pattern can tell them apart;
 *  only the disk can. */
export function quotedNeedsCheck(raw: string): boolean {
  const q = raw[0];
  return (q === '"' || q === "'" || q === '`') && raw.length > 2 && raw[raw.length - 1] === q && /\s/.test(raw);
}

/** A linkable token: its text and its offset in the line. `unchecked` marks a
 *  quoted match with a space whose disk answer is not known yet; `onlyName` is
 *  then the one bare file name inside it, if there is exactly one. */
export interface LinkableToken {
  raw: string;
  index: number;
  unchecked?: true;
  onlyName?: { raw: string; index: number };
}

/** The bare file names inside a quoted match (no separator), at their offsets
 *  in the line. A piece with a separator never counts: in
 *  `"/Users/Jane/Q3 Reports/summary.md"` printed before the file exists, the
 *  piece `Reports/summary.md` joined to the agent's folder could open a
 *  different, older file. */
function bareNamesInside(raw: string, index: number): Array<{ raw: string; index: number }> {
  const out: Array<{ raw: string; index: number }> = [];
  const inner = new RegExp(UNQUOTED_PATH, 'g');
  const body = raw.slice(1, -1);
  let n: RegExpExecArray | null;
  while ((n = inner.exec(body)) !== null) {
    if (!/[\\/]/.test(n[0])) out.push({ raw: n[0], index: index + 1 + n.index });
  }
  return out;
}

/**
 * The tokens on a line worth trying as links, each with its offset in `text`. A
 * quoted match with a space inside links whole when `onDisk` says that path is
 * on disk, links the bare file names inside it when `onDisk` says it is not
 * (so "/tmp is full, see notes.md" links notes.md, as quoted prose with no
 * folder at its start already does), and comes back `unchecked` while the
 * answer is not known.
 *
 * Synchronous on purpose: the terminal asks on hover and must answer for the
 * line as it is now. `onDisk` gets the raw match, quotes and all, and answers
 * from what is already known: true, false, or undefined (not checked yet). The
 * terminal starts a check in the background for a path it has not seen. xterm
 * keeps a row's links while the pointer stays on it, so an unchecked match
 * still gets a link over the whole of it, shown with no underline; its click
 * looks at the disk then, and reveals the whole path if it is there, or else
 * `onlyName`, the one bare file name inside it. Nothing wrong is shown before
 * the answer is known, and the first click works either way. A callback that
 * throws counts as false.
 */
export function linkableTokens(
  text: string, onDisk: (raw: string) => boolean | undefined
): LinkableToken[] {
  const out: LinkableToken[] = [];
  const re = pathTokenMatcher();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[0];
    let whole: boolean | undefined = !quotedNeedsCheck(raw);
    if (!whole) { try { whole = onDisk(raw); } catch { whole = false; } }
    if (whole === undefined) {
      const names = bareNamesInside(raw, m.index);
      out.push(names.length === 1 ? { raw, index: m.index, unchecked: true, onlyName: names[0] } : { raw, index: m.index, unchecked: true });
      continue;
    }
    if (whole) { out.push({ raw, index: m.index }); continue; }
    out.push(...bareNamesInside(raw, m.index));
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
 * `/tmp/dump.bin` become links while a bare `electron.43` on a prose
 * line stays dead text. It is a heuristic and it is meant to be: the cost of a
 * false positive is one underline that stats to nothing and does nothing.
 */
export function isPathToken(token: string): boolean {
  const ext = typeOf(token);
  if (!ext) return false;
  if (KNOWN_EXTS.has(ext) || isImagePath(token)) return true;
  return /[/\\]/.test(token);
}
