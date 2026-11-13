/**
 * Pulse's lists of what the privacy check did, filled in for the checks made
 * before the lists kept words (owner, 2026-10-16: "it says 1 was changed but i
 * cant see which message", then "still not saying changed message").
 *
 * Every check before then left both texts on disk, just not side by side:
 *
 *   question to Research ─ what Research got: agents/research/inbox(/.done)
 *                        ─ what was written: the sender's outbox/.sent copy,
 *                          or the owner's answer on its Ask me card (tasks.json);
 *                          the app's own upkeep notes are never questions
 *                          (shared/upkeep.ts), so none is filled in
 *   Research's answer    ─ what it wrote: research-outbox/sent (or its outbox/.sent)
 *                        ─ what the team read: the copy in the recipient's
 *                          inbox, named research-<hash of file name and text>
 *
 * Rows found this way are marked `found`: the kinds of detail taken out and
 * any flag to Michael were never recorded. A question or answer whose other
 * half can't be found is left out; the list counts it as without details.
 * backfillChecked only reads; ensureCheckedBackfill writes the rows and its
 * mark. Every file is read the safe way (messageFile.ts): an agent's own
 * folder may hold a link or a pipe, and this runs with the owner's rights.
 *
 * A scan that met a file it meant to read and could not (locked, being moved,
 * a slow volume, or caught half written) is not done: the mark keeps the
 * scan's window, how many it missed and when it may run again, and an open
 * after that scans the same window again, less any part the daily archive has
 * moved out of the live list since. Its rows replace the earlier scan's rows
 * for the same messages. Links, pipes and files too big to be a message are
 * left out on purpose and never count as missed. Neither does a file changed
 * at or after the window's end (a message moving or being written right now),
 * since it could never give a found row, nor an inbox file the hive moved to
 * .done mid-scan, which is read there instead.
 */
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { CHECKED_FILE, CHECKED_KEEP_MS, keepText, parseChecked, type CheckedRow } from '../shared/checkedRecord';
import { RESEARCH_REPLY_LABEL, researchText } from '../shared/research';
import { readMessageFileOrWhy, realFolderIn, researchDeliveredId } from './messageFile';

export interface BackfillInput {
  hiveRoot: string;
  /** <home>/private/research-outbox/sent, where Research's sent answers are kept. */
  researchSentDir: string | null;
  researchId: string;
  /** Research's names over time (today's first): who a teammate addressed. */
  researchNames: string[];
  /** Rows from `from` up to (not including) `until`: before the lists kept words. */
  from: number;
  until: number;
  nameOf: (id: string) => string | null;
  /** Told of each file or folder the scan meant to read and could not. */
  onMissed?: (path: string) => void;
}

type Missed = ((path: string) => void) | undefined;

/** A file's last change, NaN when it can't be told (gone, or lstat fails). */
const mtimeOf = (file: string): number => {
  try { return lstatSync(file).mtimeMs; } catch { return NaN; }
};

/** A file to read, and where the hive moves it once read: an inbox file that is
 *  gone by the read is looked for in .done before it counts as missed. */
type Listed = { file: string; done?: string };

/** A file's text and the path it was read from, telling `missed` of one that
 *  should have read and did not: locked, or one a folder listing named that
 *  was gone by the read (moved on mid-scan). A link, a pipe, a folder or a file
 *  too big is left out on purpose, and a file never listed may just not exist. */
const readCounted = (at: Listed, missed: Missed, listed = true): { raw: string | null; file: string } => {
  let file = at.file;
  let r = readMessageFileOrWhy(file);
  if (!('text' in r) && r.skip === 'missing' && at.done) {
    const moved = readMessageFileOrWhy(at.done);
    if ('text' in moved || moved.skip !== 'missing') { file = at.done; r = moved; }
  }
  if ('text' in r) return { raw: r.text, file };
  if (r.skip === 'failed' || (r.skip === 'missing' && listed)) missed?.(file);
  return { raw: null, file };
};
/** A folder's names; a folder that is there and cannot be listed is missed,
 *  one that isn't there has nothing to read. */
const listCounted = (dir: string, missed: Missed): string[] => {
  try { return readdirSync(dir); } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code !== 'ENOENT') missed?.(dir);
    return [];
  }
};

/** An object from a file's text. Text that is not JSON at all is a file caught
 *  half written, so `file` is missed; JSON that is not an object is not. */
const parseJson = (raw: string | null, file: string, missed: Missed): Record<string, unknown> | null => {
  if (raw === null) return null;
  let v: unknown;
  try { v = JSON.parse(raw); } catch { missed?.(file); return null; }
  return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
};
const readJson = (at: Listed, missed?: Missed, listed = true): { m: Record<string, unknown> | null; file: string } => {
  const { raw, file } = readCounted(at, missed, listed);
  return { m: parseJson(raw, file, missed), file };
};
const str = (v: unknown): string => (typeof v === 'string' ? v : v === undefined || v === null ? '' : JSON.stringify(v));
/** The .json files in `parts` under `base`, only while each step is a real folder. */
const jsonFiles = (missed: Missed, base: string, ...parts: string[]): string[] => {
  const dir = realFolderIn(base, ...parts);
  if (!dir) return [];
  return listCounted(dir, missed).filter((f) => f.endsWith('.json')).map((f) => join(dir, f));
};
const timeOf = (m: Record<string, unknown>, file: string): number => {
  const t = Date.parse(str(m.created_at));
  if (Number.isFinite(t)) return t;
  try { return lstatSync(file).mtimeMs; } catch { return NaN; }
};

/** A text pair as a row keeps it. */
function texts(wrote: { subject: unknown; body: unknown }, got: { subject: unknown; body: unknown }) {
  const w = { s: keepText(str(wrote.subject)), b: keepText(str(wrote.body)) };
  const g = { s: keepText(str(got.subject)), b: keepText(str(got.body)) };
  const changed = w.s.text !== g.s.text || w.b.text !== g.b.text;
  return {
    outcome: changed ? 'clean' as const : 'pass' as const,
    wrote: { subject: w.s.text, body: w.b.text },
    ...(changed ? { sent: { subject: g.s.text, body: g.b.text } } : {}),
    ...(w.s.cut || w.b.cut || (changed && (g.s.cut || g.b.cut)) ? { cut: true as const } : {})
  };
}

/** The owner's answers to Research's Ask me questions, with when they were given. */
function ownerAnswers(hiveRoot: string, researchId: string, missed: Missed): Array<{ at: number; title: string; q: string; a: string }> {
  const { m: t } = readJson({ file: join(hiveRoot, 'tasks.json') }, missed, false);
  const out: Array<{ at: number; title: string; q: string; a: string }> = [];
  for (const c of Array.isArray(t?.tasks) ? t!.tasks as Array<Record<string, unknown>> : []) {
    for (const e of Array.isArray(c?.humanQA) ? c.humanQA as Array<Record<string, unknown>> : []) {
      const at = Date.parse(str(e?.answeredAt));
      if (e?.raisedBy === researchId && typeof e.a === 'string' && Number.isFinite(at)) out.push({ at, title: str(c.title), q: str(e.q), a: e.a });
    }
  }
  return out;
}

export function backfillChecked(i: BackfillInput): CheckedRow[] {
  const missed = i.onMissed;
  /** A message file that did not read counts as missed only when it was last
   *  changed before the window ends (or that can't be told): a file changed at
   *  or after `until` is a message moving or being written now, which could
   *  never give a found row. */
  const fileMissed: Missed = missed && ((p) => { if (!(mtimeOf(p) >= i.until)) missed(p); });
  const rows: CheckedRow[] = [];
  const agentsDir = join(i.hiveRoot, 'agents');
  const inRange = (at: number): boolean => Number.isFinite(at) && at >= i.from && at < i.until;
  const names = new Set([i.researchId, ...i.researchNames].map((n) => n.trim().toLowerCase()).filter(Boolean));
  const row = (at: number, way: 'in' | 'out', from: string, to: string, t: ReturnType<typeof texts>): CheckedRow =>
    ({ at, way, from, fromName: i.nameOf(from), to, toName: i.nameOf(to), ...t, found: true });

  /** An agent's inbox and its .done, each message once. Both are listed
   *  before any read, so a message the hive moves from the inbox to .done
   *  meanwhile is read from .done, and one listed in both is read once. */
  const inboxFiles = (id: string): Listed[] => {
    const done = realFolderIn(agentsDir, id, 'inbox', '.done');
    const inbox = jsonFiles(missed, agentsDir, id, 'inbox').map((file) => ({ file, ...(done ? { done: join(done, basename(file)) } : {}) }));
    const names = new Set(inbox.map((x) => basename(x.file)));
    return [...inbox, ...jsonFiles(missed, agentsDir, id, 'inbox', '.done').filter((f) => !names.has(basename(f))).map((file) => ({ file }))];
  };

  // ── Questions: what Research got, matched to what was written ──
  const answers = ownerAnswers(i.hiveRoot, i.researchId, missed);
  const used = new Set<string>();
  const sentBy = new Map<string, Array<{ file: string; at: number; m: Record<string, unknown> }>>();
  // When each sender's sent copies that did not read were last changed (NaN
  // when that can't be told, or the whole .sent folder did not list). A
  // question whose pairing window could hold one of them gets no row from this
  // scan: pairing it with the copies that did read could give it another
  // question's words. The next scan pairs it once that copy reads; after the
  // last try it stays without details. The sender's other questions pair now.
  const unread = new Map<string, number[]>();
  const sentOf = (id: string) => {
    if (!sentBy.has(id)) {
      const shake = (at: number): void => { const u = unread.get(id); if (u) u.push(at); else unread.set(id, [at]); };
      const listMissed = (p: string): void => { shake(NaN); missed?.(p); };
      const copyMissed = (p: string): void => { shake(mtimeOf(p)); fileMissed?.(p); };
      sentBy.set(id, jsonFiles(listMissed, agentsDir, id, 'outbox', '.sent').flatMap((file) => {
        const { m } = readJson({ file }, copyMissed);
        if (!m || !names.has(str(m.to).trim().toLowerCase())) return [];
        const at = mtimeOf(file);
        return Number.isFinite(at) ? [{ file, at, m }] : [];
      }));
    }
    return sentBy.get(id)!;
  };
  /** A sent copy at `s` may pair with a question Research got at `at`. */
  const pairs = (s: number, at: number): boolean => s <= at + 5_000 && at - s < 35 * 60_000;
  for (const entry of inboxFiles(i.researchId)) {
    const { m, file } = readJson(entry, fileMissed);
    if (!m) continue;
    const from = str(m.from);
    const at = timeOf(m, file);
    if (!from || from === i.researchId || !inRange(at)) continue;
    const got = { subject: m.subject, body: m.body };
    if (from === 'human' && str(m.subject).startsWith('The owner answered: ')) {
      // The answer saved on the card moments before Research got its copy.
      const a = answers.filter((x) => x.at <= at + 5_000 && at - x.at < 10 * 60_000).sort((x, y) => y.at - x.at)[0];
      if (a) rows.push(row(at, 'in', from, i.researchId, texts({ subject: `The owner answered: ${a.title.slice(0, 120)}`, body: `Q: ${a.q}\nA: ${a.a}` }, got)));
      continue;
    }
    if (from === 'human' || from === 'system') continue;
    // A teammate's question: its sent copy, the latest one before Research got it.
    const copies = sentOf(from);
    if ((unread.get(from) ?? []).some((u) => !Number.isFinite(u) || pairs(u, at))) continue;
    const sent = copies.filter((s) => !used.has(s.file) && pairs(s.at, at)).sort((x, y) => y.at - x.at)[0];
    if (!sent) continue;
    used.add(sent.file);
    rows.push(row(at, 'in', from, i.researchId, texts({ subject: sent.m.subject, body: sent.m.body }, got)));
  }

  // ── Answers: what Research wrote, matched to the copy the team read ──
  const delivered = new Map<string, { m: Record<string, unknown>; file: string }>();
  for (const id of listCounted(agentsDir, missed)) {
    if (id === i.researchId) continue;
    for (const entry of inboxFiles(id)) {
      const { m, file } = readJson(entry, fileMissed);
      if (m && str(m.id).startsWith('research-') && str(m.from) === i.researchId) delivered.set(str(m.id), { m, file });
    }
  }
  const labels = i.researchNames.map((n) => `${researchText(RESEARCH_REPLY_LABEL, n)}\n\n`);
  const sentAnswers = [...(i.researchSentDir ? jsonFiles(missed, i.researchSentDir) : []), ...jsonFiles(missed, agentsDir, i.researchId, 'outbox', '.sent')];
  for (const file of sentAnswers) {
    const { raw } = readCounted({ file }, fileMissed);
    const m = parseJson(raw, file, fileMissed);
    if (!m || raw === null) continue;
    const id = researchDeliveredId(`${basename(file)}\n${raw}`);
    const d = delivered.get(id);
    if (!d) continue;
    const at = timeOf(d.m, d.file);
    if (!inRange(at)) continue;
    const body = str(d.m.body);
    const label = labels.find((l) => body.startsWith(l));
    rows.push(row(at, 'out', i.researchId, str(d.m.to), texts({ subject: m.subject, body: m.body }, { subject: d.m.subject, body: label ? body.slice(label.length) : body })));
  }
  return rows.sort((a, b) => a.at - b.at);
}

export const CHECKED_BACKFILL_MARK = 'checked-backfill.json';

/** Scans in all, the first included, before a scan that still misses files
 *  is taken as done: a file no scan can read must not rescan forever. */
export const CHECKED_BACKFILL_TRIES = 3;

/** How long after a scan that missed files the next may run. Pulse reads the
 *  list again on every filter change; a file locked for a minute (a sync
 *  client, a slow volume) must not use up every try at once. */
export const CHECKED_BACKFILL_RETRY_MS = 10 * 60_000;

/** checked-backfill.json. Done unless `done` is false. A scan that missed files
 *  keeps its window (`from`, `until`) for the next scan, so a retry never takes
 *  in a message kept live since, and the time the next scan may run (`next`). */
export interface BackfillMark {
  at: number;
  rows: number;
  missed?: number;
  done?: false;
  tries?: number;
  from?: number;
  until?: number;
  next?: number;
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** The mark, or null before the first scan. A mark from before scans were
 *  retried, or one that does not read, is done. */
function readMark(file: string): BackfillMark | null {
  if (!existsSync(file)) return null;
  try {
    const m = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    if (m && typeof m === 'object' && m.done === false) {
      const tries = num(m.tries);
      return { at: num(m.at) ?? 0, rows: num(m.rows) ?? 0, done: false, tries: tries && tries > 0 ? tries : 1, from: num(m.from), until: num(m.until), next: num(m.next) };
    }
  } catch { /* a mark that does not read still means a scan ran */ }
  return { at: 0, rows: 0 };
}

/** Which message a found row stands for. Not what it says: a scan that missed a
 *  file can pair a question with the wrong sent copy, and the next scan's row
 *  for the same message replaces it. */
const foundKey = (r: CheckedRow): string => JSON.stringify([r.at, r.way, r.from, r.to]);

/** Write through a file beside it, so a crash never leaves half a file. A
 *  temp file whose rename fails (Windows EPERM while another process holds the
 *  file) is removed, so check texts never outlive a reset in a name it does not
 *  know. */
function writeWhole(file: string, text: string): void {
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, text, 'utf8');
    renameSync(tmp, file);
  } catch (e) {
    try { rmSync(tmp, { force: true }); } catch { /* nothing left to remove */ }
    throw e;
  }
}

/** Rows for the 62 days before the lists kept words, put in front of the rows
 *  kept since, then a mark. A scan that missed files runs again on an open at
 *  least CHECKED_BACKFILL_RETRY_MS later, over the same window (less what has
 *  since aged past CHECKED_KEEP_MS), up to
 *  CHECKED_BACKFILL_TRIES scans; after a done mark it never runs again. Sync,
 *  on the main process like the hive's own appends, so nothing interleaves. */
export function ensureCheckedBackfill(privateDir: string, input: Omit<BackfillInput, 'from' | 'until' | 'researchSentDir' | 'onMissed'>, now = Date.now()): void {
  const markFile = join(privateDir, CHECKED_BACKFILL_MARK);
  const was = readMark(markFile);
  if (was && was.done !== false) return;
  if (was?.next !== undefined && now < was.next) return;
  const live = join(privateDir, CHECKED_FILE);
  let existing: string[] = [];
  try { existing = readFileSync(live, 'utf8').split('\n').filter((l) => l.trim()); } catch { /* none yet */ }
  const parsed = existing.map(parseChecked);
  // The first scan's window, kept for every retry. Rows an earlier scan found
  // are not where keeping began. A retry can come days later, after the daily
  // archive (hive.ts recordChecked) moved rows older than CHECKED_KEEP_MS out of
  // the live list, so it starts no earlier than that, or it would bring them
  // back.
  const from = Math.max(was?.from ?? -Infinity, now - CHECKED_KEEP_MS);
  const until = was?.until ?? parsed.reduce((m, r) => (r && !r.found ? Math.min(m, r.at) : m), now);
  let missed = 0;
  const rows = backfillChecked({ ...input, researchSentDir: join(privateDir, 'research-outbox', 'sent'), from, until, onMissed: () => { missed++; } });
  const newer = new Set(rows.map(foundKey));
  const kept = existing.flatMap((line, n) => (parsed[n]?.found && !newer.has(foundKey(parsed[n]!)) ? [{ at: parsed[n]!.at, line }] : []));
  mkdirSync(privateDir, { recursive: true });
  if (rows.length) {
    // Found rows first, in time order, then every other line as it was.
    const found = [...kept, ...rows.map((r) => ({ at: r.at, line: JSON.stringify(r) }))]
      .sort((a, b) => a.at - b.at).map((x) => x.line);
    writeWhole(live, `${[...found, ...existing.filter((_, n) => !parsed[n]?.found)].join('\n')}\n`);
  }
  const tries = (was?.tries ?? 0) + 1;
  const done = missed === 0 || tries >= CHECKED_BACKFILL_TRIES;
  const mark: BackfillMark = { at: now, rows: kept.length + rows.length, ...(missed ? { missed } : {}), ...(done ? {} : { done: false, tries, from, until, next: now + CHECKED_BACKFILL_RETRY_MS }) };
  writeWhole(markFile, JSON.stringify(mark));
}
