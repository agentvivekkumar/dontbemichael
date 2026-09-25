/**
 * An agent's memory as an index of one-line entries (owner, 2026-09-25).
 *
 * `agents/<id>/memory.md` is the index. Only the app writes it: an agent adds
 * candidate notes to `memory/inbox.md`, and a background tidy-up (memoryTidy.ts,
 * on Haiku) turns them into itemised changes (add, update, delete, procedure)
 * applied here, never a rewrite of the whole file. Research behind the design
 * is in docs/designs/agent-instructions (ACE's "context collapse" is why a full
 * rewrite is never allowed; Mem0's add/update/delete/nothing is the shape).
 *
 *  - The index stays small (INDEX_BUDGET_TOKENS) and is given to the agent once
 *    per session, so it caches.
 *  - A replaced or deleted entry goes to `memory/archive.md`, never silently lost.
 *  - Steps for a recurring task live in `memory/procedures/<name>.md`, with a
 *    one-line pointer in the index.
 *  - Nothing is forgotten for being unused (owner, 2026-09-25).
 *
 * Pure: no fs. memoryTidy.ts does the reading and writing.
 */

export const MEMORY_KINDS = ['preference', 'fact', 'reference', 'procedure'] as const;
export type MemoryKind = typeof MEMORY_KINDS[number];

/** Who a note came from. Only the owner's words make a preference binding. */
export const MEMORY_SOURCES = ['owner', 'michael', 'task', 'tool'] as const;
export type MemorySource = typeof MEMORY_SOURCES[number];

export interface MemoryEntry {
  id: string;
  kind: MemoryKind;
  text: string;
  source: MemorySource;
  /** YYYY-MM-DD the entry was written or last updated. */
  date: string;
  /** YYYY-MM-DD after which a fact that changes (a price, a rate) needs checking again. */
  expires?: string;
}

export type MemoryOp =
  | { op: 'add'; kind: MemoryKind; text: string; source: MemorySource; expires?: string }
  | { op: 'update'; id: string; text?: string; kind?: MemoryKind; expires?: string; repeat?: boolean }
  | { op: 'delete'; id: string; reason: string }
  | { op: 'procedure'; name: string; steps: string; source: MemorySource };

/** The always-loaded index stays under this (about 8,000 characters). */
export const INDEX_BUDGET_TOKENS = 2000;
/** A tidy-up is asked to shrink the index once it passes this share of the budget. */
export const INDEX_PRUNE_AT = 0.9;
/** One entry is one line. */
export const MAX_ENTRY_CHARS = 200;
/** A procedure file stays under this. */
export const MAX_PROCEDURE_CHARS = 16_000;

/** Marks a file as an index in this format; older free-form files lack it. */
export const INDEX_MARKER = '<!-- memory index v1 -->';

/** Rough tokens for a text: about four characters each. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ENTRY = /^- \[(m\d+)\] (\w+) \| (.+?) \| (\w+) \| (\d{4}-\d{2}-\d{2})(?: \| expires (\d{4}-\d{2}-\d{2}))?$/;

/** The entries in an index, and whether the file is one (an older free-form
 *  memory.md is not, and is migrated by its first tidy-up). */
export function parseIndex(text: string): { isIndex: boolean; entries: MemoryEntry[] } {
  const isIndex = text.includes(INDEX_MARKER);
  const entries: MemoryEntry[] = [];
  for (const line of text.split('\n')) {
    const m = ENTRY.exec(line.trim());
    if (!m) continue;
    const [, id, kind, body, source, date, expires] = m;
    if (!(MEMORY_KINDS as readonly string[]).includes(kind)) continue;
    if (!(MEMORY_SOURCES as readonly string[]).includes(source)) continue;
    entries.push({ id, kind: kind as MemoryKind, text: body, source: source as MemorySource, date, ...(expires ? { expires } : {}) });
  }
  return { isIndex, entries };
}

/** One entry as its index line. */
export function entryLine(e: MemoryEntry): string {
  return `- [${e.id}] ${e.kind} | ${e.text} | ${e.source} | ${e.date}${e.expires ? ` | expires ${e.expires}` : ''}`;
}

/** The whole index file. */
export function renderIndex(name: string, id: string, entries: MemoryEntry[]): string {
  return [
    `# Memory, ${name} (${id})`,
    '',
    INDEX_MARKER,
    'The app keeps this file. Add notes to memory/inbox.md; they are sorted in here in the background.',
    '',
    ...entries.map(entryLine),
    ''
  ].join('\n');
}

/** Just the entries, as an agent is given them at session start. */
export function entriesBlock(entries: MemoryEntry[]): string {
  return entries.map(entryLine).join('\n');
}

/** Candidate notes in an inbox: each bullet or paragraph is one note. */
export function parseInbox(text: string): string[] {
  const notes: string[] = [];
  let cur: string[] = [];
  const flush = () => { const n = cur.join(' ').replace(/\s+/g, ' ').trim(); if (n) notes.push(n); cur = []; };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || /^#/.test(line)) { flush(); continue; }
    if (/^([-*]|\d+[.)])\s+/.test(line)) { flush(); cur.push(line.replace(/^([-*]|\d+[.)])\s+/, '')); continue; }
    cur.push(line);
  }
  flush();
  return notes;
}

/** The notes an older free-form memory.md holds, for its one-time migration. */
export function legacyNotes(text: string): string[] {
  const body = text
    .split('\n')
    .filter((l) => !/^# Memory\b/.test(l) && !/^_Append durable facts/.test(l))
    .join('\n');
  return parseInbox(body);
}

/** "Weekly money summary" → "weekly-money-summary". */
export function procedureSlug(name: string): string {
  const s = name.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-');
  return s.slice(0, 60).replace(/-$/, '') || 'procedure';
}

const oneLine = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/\s+/g, ' ').replace(/\|/g, '/').trim();
  return s ? s.slice(0, MAX_ENTRY_CHARS) : undefined;
};
const dateOr = (v: unknown): string | undefined => (typeof v === 'string' && DATE.test(v) ? v : undefined);

/** The model's ops, checked: unknown ops, ids and kinds are dropped. */
export function validateOps(raw: unknown, entries: MemoryEntry[]): MemoryOp[] {
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { ops?: unknown }).ops) ? (raw as { ops: unknown[] }).ops : [];
  const ids = new Set(entries.map((e) => e.id));
  const kind = (v: unknown): MemoryKind | undefined => ((MEMORY_KINDS as readonly string[]).includes(v as string) ? v as MemoryKind : undefined);
  const source = (v: unknown): MemorySource => ((MEMORY_SOURCES as readonly string[]).includes(v as string) ? v as MemorySource : 'task');
  const out: MemoryOp[] = [];
  for (const o of list) {
    if (!o || typeof o !== 'object') continue;
    const r = o as Record<string, unknown>;
    if (r.op === 'add') {
      const k = kind(r.kind); const text = oneLine(r.text);
      if (k && k !== 'procedure' && text) out.push({ op: 'add', kind: k, text, source: source(r.source), ...(dateOr(r.expires) ? { expires: dateOr(r.expires) } : {}) });
    } else if (r.op === 'update' && typeof r.id === 'string' && ids.has(r.id)) {
      out.push({
        op: 'update', id: r.id,
        ...(oneLine(r.text) ? { text: oneLine(r.text) } : {}),
        ...(kind(r.kind) && r.kind !== 'procedure' ? { kind: kind(r.kind) } : {}),
        ...(dateOr(r.expires) ? { expires: dateOr(r.expires) } : {}),
        ...(r.repeat === true ? { repeat: true } : {})
      });
    } else if (r.op === 'delete' && typeof r.id === 'string' && ids.has(r.id)) {
      out.push({ op: 'delete', id: r.id, reason: oneLine(r.reason) ?? 'replaced' });
    } else if (r.op === 'procedure') {
      const name = oneLine(r.name);
      const steps = typeof r.steps === 'string' ? r.steps.trim().slice(0, MAX_PROCEDURE_CHARS) : '';
      if (name && steps) out.push({ op: 'procedure', name, steps, source: source(r.source) });
    }
  }
  return out;
}

export interface TidyOutcome {
  entries: MemoryEntry[];
  /** Entries replaced or deleted, as they were, with why. */
  archived: Array<{ entry: MemoryEntry; reason: string }>;
  /** Procedure files to write: `memory/procedures/<slug>.md`. */
  procedures: Array<{ slug: string; name: string; content: string }>;
  stats: { added: number; updated: number; deleted: number; procedures: number; repeats: number };
}

/** Apply checked ops to the entries. Deterministic; the model never writes the file. */
export function applyOps(entries: MemoryEntry[], ops: MemoryOp[], today: string): TidyOutcome {
  let next = entries.map((e) => ({ ...e }));
  const archived: TidyOutcome['archived'] = [];
  const procedures: TidyOutcome['procedures'] = [];
  const stats = { added: 0, updated: 0, deleted: 0, procedures: 0, repeats: 0 };
  let n = next.reduce((max, e) => Math.max(max, Number(e.id.slice(1)) || 0), 0);
  const newId = () => `m${++n}`;

  for (const op of ops) {
    if (op.op === 'add') {
      next.push({ id: newId(), kind: op.kind, text: op.text, source: op.source, date: today, ...(op.expires ? { expires: op.expires } : {}) });
      stats.added++;
    } else if (op.op === 'update') {
      const i = next.findIndex((e) => e.id === op.id);
      if (i < 0) continue;
      const before = next[i];
      const after: MemoryEntry = {
        ...before,
        ...(op.text ? { text: op.text } : {}),
        ...(op.kind ? { kind: op.kind } : {}),
        ...(op.expires ? { expires: op.expires } : {}),
        date: today
      };
      if (op.text && op.text !== before.text) archived.push({ entry: before, reason: 'updated' });
      next[i] = after;
      stats.updated++;
      if (op.repeat) stats.repeats++;
    } else if (op.op === 'delete') {
      const i = next.findIndex((e) => e.id === op.id);
      if (i < 0) continue;
      archived.push({ entry: next[i], reason: op.reason });
      next = next.filter((_, j) => j !== i);
      stats.deleted++;
    } else if (op.op === 'procedure') {
      const slug = procedureSlug(op.name);
      const path = `memory/procedures/${slug}.md`;
      procedures.push({ slug, name: op.name, content: `# ${op.name}\n\n${op.steps}\n\nUpdated ${today}.\n` });
      const pointer = `${op.name}: steps in ${path}`.slice(0, MAX_ENTRY_CHARS);
      const i = next.findIndex((e) => e.kind === 'procedure' && e.text.includes(path));
      if (i >= 0) next[i] = { ...next[i], text: pointer, date: today };
      else next.push({ id: newId(), kind: 'procedure', text: pointer, source: op.source, date: today });
      stats.procedures++;
    }
  }
  return { entries: next, archived, procedures, stats };
}

/** Archive lines for replaced or deleted entries. */
export function archiveLines(archived: TidyOutcome['archived'], today: string): string {
  return archived.map(({ entry, reason }) => `${entryLine(entry)} | archived ${today}: ${reason.replace(/\|/g, '/')}`).join('\n');
}
