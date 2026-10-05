/**
 * Files an Ask me question names (docs/designs/ask-me-open-file.md; owner,
 * 2026-10-04: a question that asks the owner to review a saved file should open
 * it, not leave them hunting for the path).
 *
 * Michael writes paths as code spans, and also amounts, emails and domains, so
 * only a span ending in a known file extension counts (eng review R1): a "dot
 * and a short ending" rule matched 37 non-files of 54 spans in a real ledger
 * (`$1,234.50`, `billing@example.com`, `example-client.com`).
 *
 * Shared by the renderer (rows and their kind word) and main, which decides on
 * its own whether a file opens (OPEN_EXTENSIONS) and never trusts the renderer.
 */

/** Extensions that make a code span a file row. */
const DETECT_EXTENSIONS = new Set([
  'md', 'markdown', 'txt', 'csv', 'tsv', 'xlsx', 'xls', 'docx', 'pptx', 'pdf',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'json', 'zip'
]);

/** Documents that open in the owner's default app (design D1). No format here
 *  can carry Office macros, so `xls` only shows in Finder (eng review R2); any
 *  other file is shown in Finder too. */
export const OPEN_EXTENSIONS: ReadonlySet<string> = new Set([
  'md', 'markdown', 'txt', 'csv', 'tsv', 'xlsx', 'docx', 'pptx', 'pdf',
  'png', 'jpg', 'jpeg', 'gif', 'webp'
]);

/** A filesystem path's extension, lower case, or '' without one. Only the
 *  last segment counts (split on / and \), a leading dot is a name and not an
 *  extension (`.env`), and `?` or `#` stay part of the name: they are legal in
 *  file names. Shared by Ask me, terminal path tokens and main's file checks;
 *  a URL uses `urlExtensionOf` (imageTypes.ts). */
export function extensionOf(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? '';
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** Whether a code span reads as a file path. */
export function isFileSpan(span: string): boolean {
  const s = span.trim();
  if (!s || s.startsWith('$') || s.includes('@') || /[\r\n`]/.test(s)) return false;
  return DETECT_EXTENSIONS.has(extensionOf(s));
}

/** The files a question names, in the order it names them, each once. Code
 *  fences are skipped: they hold commands and samples, not files to open. */
export function askFilePaths(question: string): string[] {
  const text = question.replace(/```[\s\S]*?```/g, ' ');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(/`([^`\n]+)`/g)) {
    const span = m[1].trim();
    if (!isFileSpan(span) || seen.has(span)) continue;
    seen.add(span);
    out.push(span);
  }
  return out;
}

export type AskFileKind = 'markdown' | 'text' | 'csv' | 'excel' | 'word' | 'powerpoint' | 'pdf' | 'image' | 'file';

/** The kind word a row shows next to the name (design D6). */
export function kindOf(path: string): AskFileKind {
  const ext = extensionOf(path);
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (ext === 'txt') return 'text';
  if (ext === 'csv' || ext === 'tsv') return 'csv';
  if (ext === 'xlsx' || ext === 'xls') return 'excel';
  if (ext === 'docx') return 'word';
  if (ext === 'pptx') return 'powerpoint';
  if (ext === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'image';
  return 'file';
}

/** The row's name: the file name without its folder or extension. */
export function fileTitle(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? path;
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/** What main found for one named path. */
export type AskFileVerdict = 'open' | 'reveal' | 'missing';
