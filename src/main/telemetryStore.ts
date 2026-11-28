/**
 * Pulse telemetry: the isolated store of data points (docs/designs/team-performance.md,
 * D16). Only the main process writes it, in harness.db in the app's own data
 * folder, outside every agent folder. Agents' activity reaches it through their
 * authenticated hook events (#61); the app adds its own events (cards, mail
 * decisions, presence, schedule runs).
 *
 *   sources ─► record() ─► buffer ─► flush() (one transaction a second) ─► telemetry_events
 *                                       │ fails
 *                                       └► failure counted for that day (D15)
 *
 * No prompt text, tool input or mail content is ever stored: only the kind,
 * time, a value and small attributes.
 */
import type Database from 'better-sqlite3';
import { dayKey } from '../shared/teamPerformance';

export type TelemetryKind =
  | 'prompt' | 'tool' | 'stop'
  | 'cost'
  | 'run-dispatch'
  | 'card-status' | 'card-reopen'
  | 'mail-decision' | 'email' | 'sent' | 'message'
  | 'presence'
  | 'advice-applied'
  // Team at work and Kept safe (proposal 3): working time a backfill read from
  // a past session, a trust layer decision, a step a setting stopped.
  | 'busy' | 'trust' | 'refused'
  // A message held because the check could not run (the hive's own line, so
  // the held count and the held list come from one event, owner 2026-10-16).
  | 'trust-held'
  // One per message the check let through or stopped (owner, 2026-10-16).
  | 'trust-checked'
  // A note new to a member's memory index, by id and source, never its text
  // (Learning, owner 2026-10-18: an edit or a repeat is not a new note).
  | 'note-added'
  // Company foundations (office-foundations.md, eng finding 4): a question
  // answered, changed or cleared, or work that hit it while empty, by id.
  | 'foundation'
  // How long the office ran (owner, 2026-10-25): open, awake and not
  // stopped, in ms, with the part you were away in attrs.away.
  | 'running'
  // The account's weekly usage meter from a status line, in percent, with
  // when its window resets in attrs.r (owner, 2026-10-29: the plan's rate).
  | 'meter';

export interface TelemetryEvent {
  agentId: string | null;
  kind: TelemetryKind;
  ts: number;
  value?: number;
  attrs?: Record<string, unknown>;
}

export interface TelemetryRow extends TelemetryEvent { id: number; office: string }

/** A card as the tasks diff needs it. */
export interface CardLite {
  id: string;
  status: string;
  assignee?: string;
  createdAt?: string;
  closedBy?: string;
  humanQA?: Array<{ kind?: string }>;
}

/** Idle this long and the owner counts as away (D11). */
export const AWAY_AFTER_SEC = 30 * 60;
export const MAX_BUFFER = 5000;
/** At most this many cards of the last seen board are saved; open ones first. */
export const MAX_SAVED_CARDS = 2000;
/** Running time is saved as one point this often, or sooner at a day's end,
 *  a sleep, a quit or an office change. A crash loses at most this much. */
export const RUN_SAVE_MS = 5 * 60_000;
/** One gap between ticks counts at most this much: it bounds a sleep whose
 *  suspend event never came. A late timer (a busy machine) still counts. */
export const RUN_GAP_CAP_MS = 15 * 60_000;

/** The kv key of an office's last seen board. */
const cardsKey = (office: string): string => `pulse:cards:${office}`;

/** The board as saved: id to status, cut to the cap with open cards kept
 *  first (a done card rarely changes again). */
function savedJson(cards: Map<string, string>): string {
  let list = [...cards];
  if (list.length > MAX_SAVED_CARDS) list = [...list.filter(([, s]) => s !== 'done'), ...list.filter(([, s]) => s === 'done')].slice(0, MAX_SAVED_CARDS);
  return JSON.stringify(Object.fromEntries(list));
}

interface RunBuffer { office: string; day: string; ms: number; away: number; since: number; until: number }

export class TelemetryStore {
  private buf: Array<TelemetryEvent & { office: string }> = [];
  /** office \t day -> failed writes not yet saved (D15). */
  private failed = new Map<string, number>();
  private lastCost = new Map<string, string>();
  private lastMeter: string | null = null;
  private lastCards = new Map<string, Map<string, string>>();
  /** office -> the board last seen, saved by the next flush with its points. */
  private unsavedCards = new Map<string, Map<string, string>>();
  private away: boolean | null = null;
  /** The last running tick; null before the clock starts and after a sleep. */
  private lastTick: number | null = null;
  private run: RunBuffer | null = null;
  private loggedFailure = false;
  /** Told of each point queued, for the stall warning (pulseHealth.ts). */
  onRecord?: (office: string) => void;

  constructor(
    private readonly db: () => Database.Database | null,
    private readonly office: () => string | null,
    private readonly now: () => number = () => Date.now()
  ) {}

  /** Queue one data point for the current office. */
  record(ev: TelemetryEvent): void {
    const office = this.office();
    if (office) this.push(ev, office);
  }

  private push(ev: TelemetryEvent, office: string, mayFlush = true): void {
    this.buf.push({ ...ev, office });
    this.onRecord?.(office);
    if (mayFlush && this.buf.length >= MAX_BUFFER) this.flush();
  }

  /** Write the queued points in one transaction. A failure is counted for the
   *  day of each point it lost, and those days are left out of advice (D15). */
  flush(): void {
    if (!this.buf.length && !this.failed.size && !this.unsavedCards.size) return;
    const batch = this.buf;
    this.buf = [];
    const db = this.db();
    if (!db) { this.writeFailed(batch); return; }
    try {
      const ins = db.prepare('INSERT INTO telemetry_events (office, agent_id, kind, ts, value, attrs) VALUES (?, ?, ?, ?, ?, ?)');
      const fail = db.prepare(`INSERT INTO telemetry_failures (office, day, count) VALUES (?, ?, ?)
        ON CONFLICT(office, day) DO UPDATE SET count = count + excluded.count`);
      db.transaction(() => {
        // The board in the same transaction as its points: after a quit or a
        // crash the next launch diffs against exactly what was counted.
        if (this.unsavedCards.size) {
          const mark = db.prepare(`INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`);
          for (const [office, cards] of this.unsavedCards) mark.run(cardsKey(office), savedJson(cards), this.now());
        }
        for (const e of batch) ins.run(e.office, e.agentId, e.kind, Math.round(e.ts), e.value ?? null, e.attrs ? JSON.stringify(e.attrs) : null);
        for (const [key, n] of this.failed) { const [office, day] = key.split('\t'); fail.run(office, day, n); }
      })();
      this.failed.clear();
      this.unsavedCards.clear();
      this.loggedFailure = false;
    } catch (e) {
      this.writeFailed(batch);
      if (!this.loggedFailure) { this.loggedFailure = true; console.error('[pulse] telemetry write failed:', e); }
    }
  }

  /** After a failed write the points of the pending boards are lost, so the
   *  next read diffs against the board still saved and records them again.
   *  Those card points are not failures; the rest of the batch is (D15). */
  private writeFailed(batch: Array<TelemetryEvent & { office: string }>): void {
    const pending = this.unsavedCards;
    this.countFailures(batch.filter((e) => !(e.kind === 'card-status' && pending.has(e.office))));
    for (const office of pending.keys()) this.lastCards.delete(office);
    pending.clear();
  }

  private countFailures(batch: Array<TelemetryEvent & { office: string }>): void {
    for (const e of batch) {
      const key = `${e.office}\t${dayKey(e.ts)}`;
      this.failed.set(key, (this.failed.get(key) ?? 0) + 1);
    }
  }

  /** Days in an office with records that could not be saved, saved or pending. */
  failureDays(office: string): string[] {
    return Object.keys(this.failedWrites(office)).sort();
  }

  /** Records in an office that could not be saved, by day, saved or pending. */
  failedWrites(office: string): Record<string, number> {
    const days: Record<string, number> = {};
    for (const [key, n] of this.failed) if (key.startsWith(`${office}\t`)) days[key.slice(office.length + 1)] = n;
    const db = this.db();
    if (db) {
      try {
        for (const r of db.prepare('SELECT day, count FROM telemetry_failures WHERE office = ?').all(office) as Array<{ day: string; count: number }>) {
          days[r.day] = (days[r.day] ?? 0) + r.count;
        }
      } catch { /* the pending ones still count */ }
    }
    return days;
  }

  /** A cost sample (running total). Stored only when it changed since the
   *  agent's last one for that session (eng review E4): repeats carry nothing. */
  cost(agentId: string, session: string, usd: number, tokens: number, model: string | null, ts = this.now()): void {
    if (!Number.isFinite(usd)) return;
    const key = `${agentId}\t${session}`;
    const sig = `${usd}|${tokens}`;
    if (this.lastCost.get(key) === sig) return;
    this.lastCost.set(key, sig);
    this.record({ agentId, kind: 'cost', ts, value: usd, attrs: { s: session, tokens, ...(model ? { model } : {}) } });
  }

  /** A weekly meter reading, stored only when it changed: every member's
   *  status line carries the same account wide meter. */
  meter(pct: number, resetsAt: number, ts = this.now()): void {
    if (!(pct >= 0) || !(resetsAt > 0)) return;
    const sig = `${pct}|${Math.round(resetsAt / 3_600_000)}`;
    if (this.lastMeter === sig) return;
    this.lastMeter = sig;
    this.record({ agentId: null, kind: 'meter', ts, value: pct, attrs: { r: resetsAt } });
  }

  /** The 8 s tick's tasks: one card-status point per change (doneAt is the
   *  time a card reaches done). The first read of an office diffs against the
   *  board saved before the last quit, so a card done in its last seconds
   *  still counts; with none saved it only remembers. */
  tasks(cards: CardLite[], ts = this.now()): void {
    const office = this.office();
    if (!office) return;
    const seen = this.lastCards.get(office);
    // A card the saved board does not have is only remembered: it may have
    // been left out at the cap.
    const saved = seen ? undefined : this.savedCards(office);
    const prev = seen ?? saved;
    let changed = false;
    // A card id listed twice is one card: its last entry wins and is compared
    // once. Comparing each entry recorded a change on every tick.
    const byId = new Map<string, CardLite>();
    for (const c of cards) {
      if (!c || typeof c.id !== 'string' || typeof c.status !== 'string') continue;
      byId.delete(c.id);
      byId.set(c.id, c);
    }
    const next = new Map<string, string>();
    for (const c of byId.values()) {
      next.set(c.id, c.status);
      const was = prev?.get(c.id);
      if (was !== c.status) changed = true;
      if (!prev || was === c.status || (saved && was === undefined)) continue;
      const excluded = c.closedBy === 'owner' || (Array.isArray(c.humanQA) && c.humanQA.some((e) => e?.kind === 'report'));
      // No flush inside the loop: it would save these points with the old board.
      this.push({
        agentId: c.assignee ?? null, kind: 'card-status', ts,
        attrs: { id: c.id, from: was ?? null, to: c.status, createdAt: c.createdAt ? Date.parse(c.createdAt) || null : null, ...(excluded ? { excluded: true } : {}) }
      }, office, false);
    }
    // An empty board is never kept: hive hands Pulse [] when tasks.json cannot
    // be read, and keeping it, even as a first read, would count every card
    // again on the next read. An office is remembered only from cards.
    if (!next.size) return;
    this.lastCards.set(office, next);
    if (changed || next.size !== (prev?.size ?? 0)) this.unsavedCards.set(office, next);
    if (this.buf.length >= MAX_BUFFER) this.flush();
  }

  /** The board saved for an office, or undefined when there is none or it
   *  cannot be read (the first read then only remembers). */
  private savedCards(office: string): Map<string, string> | undefined {
    try {
      const row = this.db()?.prepare('SELECT value FROM kv WHERE key = ?').get(cardsKey(office)) as { value: string } | undefined;
      const v: unknown = row ? JSON.parse(row.value) : null;
      if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
      const out = new Map<string, string>();
      for (const [id, status] of Object.entries(v)) if (typeof status === 'string') out.set(id, status);
      return out;
    } catch { return undefined; }
  }

  /** The owner's presence from the system idle time (D11): away after 30
   *  minutes without input, or while the computer sleeps. */
  presence(idleSec: number, asleep: boolean, ts = this.now()): void {
    const away = asleep || idleSec >= AWAY_AFTER_SEC;
    if (away === this.away) return;
    this.away = away;
    this.record({ agentId: null, kind: 'presence', ts: away && !asleep ? ts - idleSec * 1000 : ts, value: away ? 1 : 0 });
  }

  /** Start the running clock: the app is open and the computer awake, from
   *  launch and again after a resume. A clock already running keeps going
   *  (an unlock re-arms the beats too, with no sleep in between). */
  runningStart(ts = this.now()): void {
    if (this.lastTick === null) this.lastTick = ts;
  }

  /** Each minute: the time since the last tick ran, unless the computer slept
   *  in between (the first tick after a pause only starts the clock again and
   *  counts nothing) or the office is stopped (plan limit, no credit, sign in
   *  failed: owner D1). Away is the presence state. */
  running(stopped: boolean, ts = this.now()): void {
    const last = this.lastTick;
    this.lastTick = ts;
    const office = this.office();
    if (last === null || !office || ts <= last) return;
    if (!stopped) this.add(office, Math.max(last, ts - RUN_GAP_CAP_MS), ts, this.away === true);
    if (this.run && ts - this.run.since >= RUN_SAVE_MS) this.runningSave();
  }

  /** Before a sleep or a quit: count up to now, save, and stop the clock. */
  runningPause(stopped: boolean, ts = this.now()): void {
    this.running(stopped, ts);
    this.runningSave();
    this.lastTick = null;
  }

  /** Save the buffered running time as one point for its office and day. */
  runningSave(): void {
    const r = this.run;
    this.run = null;
    if (r && r.ms > 0) this.push({ agentId: null, kind: 'running', ts: r.until, value: r.ms, attrs: { away: r.away } }, r.office);
  }

  /** Add a span to the buffer, split at local midnight so a point never spans two days. */
  private add(office: string, from: number, to: number, away: boolean): void {
    while (from < to) {
      const day = dayKey(from);
      const next = new Date(from);
      next.setHours(24, 0, 0, 0);
      const end = Math.min(to, next.getTime());
      if (this.run && (this.run.office !== office || this.run.day !== day)) this.runningSave();
      const r = this.run ?? (this.run = { office, day, ms: 0, away: 0, since: from, until: from });
      r.ms += end - from;
      if (away) r.away += end - from;
      r.until = end === next.getTime() ? end - 1 : end;
      from = end;
    }
  }

  /** Points after a cursor, oldest first, for the processor. */
  eventsAfter(office: string, afterId: number, limit = 5000): TelemetryRow[] {
    const db = this.db();
    if (!db) return [];
    const rows = db.prepare('SELECT id, office, agent_id, kind, ts, value, attrs FROM telemetry_events WHERE office = ? AND id > ? ORDER BY id LIMIT ?')
      .all(office, afterId, limit) as Array<{ id: number; office: string; agent_id: string | null; kind: TelemetryKind; ts: number; value: number | null; attrs: string | null }>;
    return rows.map((r) => {
      let attrs: Record<string, unknown> | undefined;
      try { attrs = r.attrs ? JSON.parse(r.attrs) : undefined; } catch { attrs = undefined; }
      return { id: r.id, office: r.office, agentId: r.agent_id, kind: r.kind, ts: r.ts, ...(r.value !== null ? { value: r.value } : {}), ...(attrs ? { attrs } : {}) };
    });
  }
}
