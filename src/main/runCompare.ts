/**
 * Compare runs we already have (src/shared/runCompare.ts has the why and the
 * pure parts): the owner's "Went wrong" on a job's last run, the pick of a run
 * that went well, both transcripts sliced, one hidden call, the screen, and
 * the suggestion kept in harness.db's kv table for Pulse.
 *
 * Trust: a member's sessions are found through the app's private session
 * record, never hive/log.jsonl, which members' shells can write. The call has
 * no tools, isolated settings and no transcript left behind (D4). A suggestion
 * that reads like text planted in an outside message goes to Michael, never
 * to the owner's card.
 */
import { constants } from 'node:fs';
import { lstat, realpath, type FileHandle } from 'node:fs/promises';
import { basename } from 'node:path';
import { createInterface } from 'node:readline';
import type Database from 'better-sqlite3';
import { looksLikeInjection } from '../shared/research';
import {
  SUGGESTIONS_KEPT, capSlice, changesBetween, cleanNote, comparePrompt, parseCompare, pickGoodRun, runEntry,
  type JobChangeMark, type JobRun, type RunSuggestion
} from '../shared/runCompare';
import { extractJson } from './memoryTidy';
import { INSTRUCTIONS_MODEL } from './workStyleConvert';
import { inClaudeProjects } from './transcript';
import { openNoFollowAsync } from './noFollow';

export interface WentWrongRequest {
  runId: number;
  agentId: string;
  note?: unknown;
  /** The member's Work style today and its dated changes, from the roster. */
  workStyle: string;
  previousWorkStyle?: string;
  changes?: JobChangeMark[];
}

export interface RunCompareDeps {
  db: () => Database.Database | null;
  office: () => string | null;
  getKv: <T>(key: string) => T | undefined;
  setKv: (key: string, value: unknown) => void;
  /** A member's session files, as the private session record has them. */
  transcriptsOf: (agentId: string) => string[];
  projectsRoot: () => string;
  /** The one comparison call (isolated, no tools; index.ts sets it up). */
  runModel: (prompt: string) => Promise<{ ok: boolean; text?: string; error?: string }>;
  memberName: (agentId: string) => string;
  mission: (missionId: string) => { label: string; focus?: string } | null;
  /** A held suggestion: Michael is told, as a note from the app. */
  tellMichael: (subject: string, body: string) => void;
  log?: (event: Record<string, unknown>) => void;
  now?: () => number;
}

/** The model the comparison asks for on Claude: the Work style rewrite's. */
export const RUN_COMPARE_MODEL = INSTRUCTIONS_MODEL;
/** Two runs of 40 KB each are read and compared in one answer. */
export const RUN_COMPARE_TIMEOUT_MS = 120_000;

type Row = { id: number; agent_id: string; mission_id: string; start: number | null; dispatched: number; end: number; outcome: string | null };
const runOf = (r: Row): JobRun => ({
  id: r.id, agentId: r.agent_id, missionId: r.mission_id, start: r.start ?? r.dispatched, end: r.end,
  outcome: r.outcome === 'did-work' || r.outcome === 'nothing' ? r.outcome : 'unknown'
});
const RUN_COLS = 'id, agent_id, mission_id, start, dispatched, end, outcome';
/** True when the line names a time and every one it names is before `from`. */
function beforeWindow(line: string, from: number): boolean {
  let seen = false;
  for (const m of line.matchAll(/"timestamp":"([^"]+)"/g)) {
    const t = Date.parse(m[1]);
    if (!Number.isFinite(t) || t >= from) return false;
    seen = true;
  }
  return seen;
}

/** A run's window, a little wide: the first line can land just before telemetry's start. */
const LEAD_MS = 5_000;
/** Good runs tried before giving up (a run whose transcript turns out empty is skipped). */
const PICK_TRIES = 5;
/** Lines can land a little out of order around a run's end; reading stops this long after it. */
const TAIL_MS = 60_000;

/** A session file as checked: its place, when it was last written, and which
 *  file it was (device and file id), so the file read is the file checked. */
interface SessionFile { path: string; mtime: number; dev: bigint; ino: bigint }

/**
 * Open a checked session file once and read from that handle: opened again by
 * name, the file could have been swapped for a link in between. The open never
 * goes through a link (openNoFollowAsync, on every platform), and the open file
 * must be the very one checked, still a plain file with one name; else nothing
 * is read.
 */
async function openChecked(f: SessionFile): Promise<FileHandle | null> {
  let handle: FileHandle | undefined;
  try {
    handle = await openNoFollowAsync(f.path, constants.O_RDONLY);
    const st = await handle.stat({ bigint: true });
    if (st.isFile() && st.nlink === 1n && st.dev === f.dev && st.ino === f.ino) return handle;
  } catch { /* gone, or a link */ }
  await handle?.close().catch(() => undefined);
  return null;
}

export class RunCompare {
  private readonly busy = new Set<number>();
  private readonly now: () => number;

  constructor(private readonly d: RunCompareDeps) {
    this.now = d.now ?? (() => Date.now());
  }

  private key(office: string): string { return `run-compare:${office}`; }

  private load(office: string): RunSuggestion[] {
    const v = this.d.getKv<{ v: 1; items: RunSuggestion[] }>(this.key(office));
    // A comparison saved as working that this run of the app isn't doing was
    // cut short (a quit, a crash): it reads as failed, so Try again shows.
    return v && Array.isArray(v.items)
      ? v.items.map((s) => (s.state === 'working' && !this.busy.has(s.runId) ? { ...s, state: 'failed' as const } : s))
      : [];
  }

  private save(office: string, s: RunSuggestion): void {
    const items = [s, ...this.load(office).filter((x) => x.runId !== s.runId)].slice(0, SUGGESTIONS_KEPT);
    this.d.setKv(this.key(office), { v: 1, items });
  }

  /** Each of a member's jobs with its last finished run and what came of a "Went wrong" on it. */
  lastRuns(agentId: string): Array<{ run: JobRun; suggestion: RunSuggestion | null }> {
    const office = this.d.office();
    const db = this.d.db();
    if (!office || !db || !/^[\w-]+$/.test(agentId)) return [];
    const rows = db.prepare(`SELECT ${RUN_COLS} FROM telemetry_runs WHERE office = ? AND agent_id = ? AND end IS NOT NULL ORDER BY id DESC LIMIT 200`)
      .all(office, agentId) as Row[];
    const seen = new Set<string>();
    const kept = this.load(office);
    const out: Array<{ run: JobRun; suggestion: RunSuggestion | null }> = [];
    for (const r of rows) {
      if (!r.mission_id || seen.has(r.mission_id)) continue;
      seen.add(r.mission_id);
      out.push({ run: runOf(r), suggestion: kept.find((s) => s.runId === r.id) ?? null });
    }
    return out;
  }

  /** Suggestions to show in Pulse: ready and not put off. */
  suggestions(): RunSuggestion[] {
    const office = this.d.office();
    return office ? this.load(office).filter((s) => s.state === 'ready' && !s.dismissed) : [];
  }

  /** Not now. */
  dismiss(runId: number): boolean {
    const office = this.d.office();
    if (!office) return false;
    const s = this.load(office).find((x) => x.runId === runId);
    if (!s) return false;
    this.save(office, { ...s, dismissed: true });
    return true;
  }

  /**
   * The owner's "Went wrong". One suggestion per run: a second click returns
   * what the first one made (or is making). Never throws.
   */
  async wentWrong(req: WentWrongRequest): Promise<RunSuggestion | null> {
    const office = this.d.office();
    const db = this.d.db();
    if (!office || !db || !Number.isInteger(req.runId) || !/^[\w-]+$/.test(req.agentId)) return null;
    const existing = this.load(office).find((s) => s.runId === req.runId);
    if (existing && existing.agentId !== req.agentId) return null;
    if (existing && existing.state !== 'failed') return existing;
    if (this.busy.has(req.runId)) return existing ?? null;
    const row = db.prepare(`SELECT ${RUN_COLS} FROM telemetry_runs WHERE office = ? AND id = ? AND end IS NOT NULL`).get(office, req.runId) as Row | undefined;
    if (!row || row.agent_id !== req.agentId) return null;
    const bad = runOf(row);
    const base: RunSuggestion = { runId: bad.id, agentId: bad.agentId, missionId: bad.missionId, at: this.now(), note: cleanNote(req.note), state: 'working' };
    this.busy.add(bad.id);
    this.save(office, base);
    try {
      const done = await this.compare(office, db, bad, base, req);
      this.save(office, done);
      return done;
    } catch (e) {
      this.d.log?.({ kind: 'run-compare-failed', runId: bad.id, reason: String(e).slice(0, 200) });
      const failed: RunSuggestion = { ...base, state: 'failed' };
      this.save(office, failed);
      return failed;
    } finally {
      this.busy.delete(bad.id);
    }
  }

  private async compare(office: string, db: Database.Database, bad: JobRun, base: RunSuggestion, req: WentWrongRequest): Promise<RunSuggestion> {
    const files = await this.sessionFiles(bad.agentId);
    const badText = await this.slice(files, bad);
    if (!badText) return { ...base, state: 'none', reason: 'no-transcript' };

    const runs = (db.prepare(`SELECT ${RUN_COLS} FROM telemetry_runs WHERE office = ? AND agent_id = ? AND mission_id = ? AND end IS NOT NULL ORDER BY id DESC LIMIT 100`)
      .all(office, bad.agentId, bad.missionId) as Row[]).map(runOf);
    const marked = new Set(this.load(office).map((s) => s.runId));
    const skip = new Set<number>();
    let good: JobRun | null = null;
    let goodText = '';
    for (let i = 0; i < PICK_TRIES; i++) {
      const pick = pickGoodRun(bad, runs.filter((r) => !skip.has(r.id)), marked, (r) => files.some((f) => f.mtime >= r.start), req.changes);
      if (!pick) break;
      goodText = await this.slice(files, pick);
      if (goodText) { good = pick; break; }
      skip.add(pick.id);
    }
    if (!good) return { ...base, state: 'none', reason: 'no-good-run' };

    const job = this.d.mission(bad.missionId);
    const between = changesBetween(good, bad, req.changes);
    const prompt = comparePrompt({
      name: this.d.memberName(bad.agentId),
      job: job?.label ?? 'a recurring job',
      focus: job?.focus,
      note: base.note,
      workStyle: req.workStyle,
      changedBetween: between,
      previousWorkStyle: between.length ? req.previousWorkStyle : undefined,
      good: { when: new Date(good.start).toISOString(), text: goodText },
      bad: { when: new Date(bad.start).toISOString(), text: badText }
    });
    const result = await this.d.runModel(prompt);
    const parsed = result.ok && result.text ? parseCompare(extractJson(result.text)) : null;
    if (!parsed) {
      this.d.log?.({ kind: 'run-compare-failed', runId: bad.id, reason: result.ok ? 'unreadable' : (result.error ?? 'failed') });
      return { ...base, state: 'failed', goodRunId: good.id };
    }
    if (!parsed.change) return { ...base, state: 'none', reason: 'no-difference', goodRunId: good.id, why: parsed.why };
    // A change that reads like an order planted in a customer's email never
    // reaches the owner's Apply; Michael hears of it (owner, 2026-10-12).
    if (looksLikeInjection(`${parsed.change}\n${parsed.why}`)) {
      this.d.log?.({ kind: 'run-compare-held', runId: bad.id });
      // Named, never quoted: the text is what screening flagged, and Michael is
      // the member most able to act on it (the Research flag does the same).
      try {
        this.d.tellMichael(
          'A suggested job change was held',
          `Comparing two runs of ${this.d.memberName(bad.agentId)}'s job "${(job?.label ?? bad.missionId).slice(0, 80)}" (run ${bad.id}) gave a change that reads like instructions from an outside message, so the owner was not shown it and it is not quoted here.`
        );
      } catch { /* the hold stands */ }
      return { ...base, state: 'held', goodRunId: good.id };
    }
    return { ...base, state: 'ready', goodRunId: good.id, change: parsed.change, why: parsed.why };
  }

  /**
   * The member's session files, with when each was last written: only the
   * files the private record names, never a search by session id (a member's
   * shell could write a file named for its own session elsewhere). A session
   * with no recorded file is left out. The real file is checked, not only the
   * spelling: a member's shell that can write there could swap its own file
   * for a link to another member's transcript. A symlink is never followed, a
   * file with a second name (a hard link) is skipped, since Claude never links
   * its own, and the folders above the file must really lead into the
   * projects folder.
   */
  private async sessionFiles(agentId: string): Promise<SessionFile[]> {
    let root: string;
    try { root = await realpath(this.d.projectsRoot()); } catch { return []; }
    const out: SessionFile[] = [];
    for (const f of new Set(this.d.transcriptsOf(agentId))) {
      if (!/^[A-Za-z0-9_-]+\.jsonl$/.test(basename(f))) continue;
      try {
        const st = await lstat(f, { bigint: true });
        if (!st.isFile() || st.nlink !== 1n) continue;
        const path = await realpath(f);
        if (inClaudeProjects(path, root)) out.push({ path, mtime: Number(st.mtimeMs), dev: st.dev, ino: st.ino });
      } catch { /* gone */ }
    }
    return out;
  }

  /** Everything the member did in the run's window, across its session files, capped. */
  private async slice(files: SessionFile[], run: JobRun): Promise<string> {
    const from = run.start - LEAD_MS;
    const lines: Array<{ t: number; text: string }> = [];
    for (const f of files) {
      if (f.mtime < from) continue;
      const handle = await openChecked(f);
      if (!handle) continue;
      const input = handle.createReadStream({ encoding: 'utf8' });
      const rl = createInterface({ input, crlfDelay: Infinity });
      try {
        for await (const line of rl) {
          if (!line || line[0] !== '{') continue;
          // Lines before the window are most of a long session: skip them
          // without parsing. Every time on the line is before it, the line's
          // own included (a quoted record can carry a timestamp of its own).
          if (beforeWindow(line, from)) continue;
          let e: { timestamp?: string };
          try { e = JSON.parse(line); } catch { continue; }
          const t = Date.parse(e.timestamp ?? '');
          if (!Number.isFinite(t) || t < from) continue;
          // A session file is written in order: past the run's end, the rest is later work.
          if (t > run.end + TAIL_MS) break;
          const text = runEntry(e, from, run.end);
          if (text) lines.push({ t, text });
        }
      } catch { /* an unreadable file adds nothing */ } finally {
        // Closing the reader leaves the file open when reading stopped early
        // (past the run's end); Windows then holds the file (CI, 2026-10-24).
        // destroy() only starts the close, so wait for it: the file is shut
        // before the comparison goes on, not a moment later.
        const closed = input.closed ? Promise.resolve() : new Promise<void>((done) => input.once('close', () => done()));
        rl.close();
        input.destroy();
        await closed;
      }
    }
    lines.sort((a, b) => a.t - b.t);
    return capSlice(lines.map((l) => l.text));
  }
}
