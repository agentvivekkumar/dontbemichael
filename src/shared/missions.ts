/**
 * Schedules (missions): the rules every surface shares. Main's scheduler, the
 * IPC operations, the router's schedule requests and the renderer all read
 * this one module, so "who owns a schedule", "when does it run next" and "what
 * does a run send" can't drift apart between them (eng review, 2026-09-25).
 *
 * Everything here is pure: no Electron, no config reads, no clocks except the
 * `now` a caller passes in. That is what lets test/missions.test.cjs pin the
 * scheduler's behavior with fake times.
 *
 * Ownership: a schedule belongs to the agent in `to`. Michael's schedules say
 * `'god'` (the router resolves that alias), and a legacy `'broadcast'` row is
 * Michael's too until migrateMissions rewrites it.
 */
import { normalizeWeekly, nextWeeklyFireMs, weeklyDelayMs } from './weeklySchedule';
import { scheduledRunBody, relayRunBody } from './scheduleMessage';

export interface ScheduledMission {
  id: string;
  label: string;
  intervalMs: number;
  /** Day-of-week + time. When present and valid it REPLACES `intervalMs`; the
   *  interval stays on the record so switching back restores it. */
  weekly?: { days: number[]; minute: number };
  /** The agent that owns and runs this schedule: an agent id, or `'god'` for
   *  Michael. (`'broadcast'` only on rows migrateMissions has not seen yet.) */
  to: string;
  /** A legacy prompt on older schedules (sent after the standard message), or
   *  the heartbeat's own description. New schedules leave it empty. */
  body: string;
  enabled: boolean;
  autoCompact?: boolean;
  lastFiredAt?: number;
  kind?: 'dispatch' | 'heartbeat' | 'compact';
  quietThresholdMs?: number;
  /** Who added it: `'owner'`, or the id of the agent whose request the owner
   *  approved in ASK ME. Absent on rows from before this existed (= owner). */
  createdBy?: string;
  /** A former "everyone" schedule: Michael gets it and hands the job out. */
  relay?: boolean;
}

export const OWNER = 'owner';
export const GOD_ALIAS = 'god';

/** The agent id that owns `m`. Michael's aliases collapse to `godId`. */
export function ownerOf(m: Pick<ScheduledMission, 'to'>, godId: string): string {
  return m.to === GOD_ALIAS || m.to === 'broadcast' ? godId : m.to;
}

/** The schedules `agentId` owns, in stored order. */
export function missionsFor(missions: ScheduledMission[], agentId: string, godId: string): ScheduledMission[] {
  return missions.filter((m) => ownerOf(m, godId) === agentId);
}

/** May `actor` (an agent id) ask for a change to `m`? Only its own. */
export function canEdit(actor: string, m: Pick<ScheduledMission, 'to'>, godId: string): boolean {
  return ownerOf(m, godId) === actor;
}

/** When this schedule runs next, or null when it can't say (off, unusable, or
 *  an interval schedule that has never fired). Matches what the scheduler arms. */
export function nextRunAt(m: ScheduledMission, now: number): number | null {
  if (!m.enabled) return null;
  const weekly = m.kind === 'heartbeat' ? null : normalizeWeekly(m.weekly);
  if (weekly) return nextWeeklyFireMs(weekly, now);
  if (!(m.intervalMs > 0)) return null;
  return m.lastFiredAt ? m.lastFiredAt + m.intervalMs : null;
}

/**
 * One-time upgrade of stored schedules to per-agent ownership:
 * - an "everyone" row becomes Michael's, marked `relay` so the run tells him to
 *   hand the job out (design 3A);
 * - a row with no `createdBy` is the owner's.
 * Idempotent: a second pass changes nothing.
 */
export function migrateMissions(missions: ScheduledMission[]): { missions: ScheduledMission[]; changed: boolean } {
  let changed = false;
  const out = missions.map((m) => {
    let next = m;
    if (next.to === 'broadcast') { next = { ...next, to: GOD_ALIAS, relay: true }; changed = true; }
    if (!next.createdBy) { next = { ...next, createdBy: OWNER }; changed = true; }
    // Saved before the 24 day ceiling: the timer can't wait longer, so the stored
    // value, the Schedules tab and the timer all say 24 days (review, 2026-09-25).
    if (next.intervalMs > MAX_INTERVAL_MS) { next = { ...next, intervalMs: MAX_INTERVAL_MS }; changed = true; }
    return next;
  });
  return { missions: out, changed };
}

/* ─────────────────────────────── the scheduler ─────────────────────────────── */

export type ArmPlan =
  | { type: 'skip' }
  | { type: 'heartbeat' }
  /** Self-rescheduling weekly slots; `firstDelayMs` is the first wait (0 = a
   *  missed slot to catch up now). Later waits are recomputed at each re-arm. */
  | { type: 'weekly'; weekly: { days: number[]; minute: number }; firstDelayMs: number }
  /** Wait `firstDelayMs`, fire, then fire every `everyMs`. */
  | { type: 'interval'; firstDelayMs: number; everyMs: number };

export interface ArmContext {
  /** Id of the built-in standup, which waits for the office to open. */
  standupId: string;
  /** Has the standup already been sent on this launch (standupOnOfficeOpen)? */
  standupFiredThisLaunch: boolean;
}

/** How the scheduler should arm `m` at `now`. The same decisions syncMissions
 *  made inline before this module existed; see test/missions.test.cjs. */
export function armPlan(m: ScheduledMission, now: number, ctx: ArmContext): ArmPlan {
  if (!m.enabled) return { type: 'skip' };
  // A weekly mission needs no interval, so the interval guard comes after it.
  const weekly = m.kind === 'heartbeat' ? null : normalizeWeekly(m.weekly);
  if (!weekly && !(m.intervalMs > 0)) return { type: 'skip' };
  if (m.kind === 'heartbeat') return { type: 'heartbeat' };
  if (weekly) {
    const firstDelayMs = weeklyDelayMs(weekly, now, m.lastFiredAt ?? 0);
    return firstDelayMs === null ? { type: 'skip' } : { type: 'weekly', weekly, firstDelayMs };
  }
  // Honor lastFiredAt so an edit elsewhere doesn't restart this interval from
  // zero. The standup waits a full interval until the office opens, because its
  // launch fire is sent by standupOnOfficeOpen.
  const waitForOpen = m.id === ctx.standupId && !ctx.standupFiredThisLaunch;
  const everyMs = Math.min(m.intervalMs, MAX_TIMER_MS);
  const firstDelayMs = waitForOpen ? everyMs : Math.min(MAX_TIMER_MS, Math.max(0, m.intervalMs - (now - (m.lastFiredAt ?? 0))));
  return { type: 'interval', firstDelayMs, everyMs };
}

/** What one run sends, or null for a compaction-only mission (no dispatch). */
export function firePayload(m: ScheduledMission): { to: string; subject: string; body: string } | null {
  if (m.kind === 'compact') return null;
  return {
    to: m.to,
    subject: m.label,
    body: m.relay ? relayRunBody(m.label, m.body) : scheduledRunBody(m.label, m.body)
  };
}

/* ──────────────────────────── one-schedule edits ──────────────────────────── */
// Each operation names the one schedule it changes and is applied by main to the
// list it reads at that moment, so a screen opened earlier can never delete a
// schedule it didn't know about (eng review R2).

/** Insert or replace `incoming` by id. `lastFiredAt` is the scheduler's, so the
 *  newer of the two stamps wins; `createdBy` is never rewritten by an edit. */
export function upsertMission(list: ScheduledMission[], incoming: ScheduledMission): ScheduledMission[] {
  const prev = list.find((m) => m.id === incoming.id);
  if (!prev) return [...list, { ...incoming, createdBy: incoming.createdBy ?? OWNER }];
  const lastFiredAt = Math.max(incoming.lastFiredAt ?? 0, prev.lastFiredAt ?? 0) || undefined;
  const merged: ScheduledMission = { ...incoming, lastFiredAt, createdBy: prev.createdBy ?? incoming.createdBy ?? OWNER };
  // An explicit `weekly: undefined` is the switch back to interval mode.
  if (!('weekly' in incoming) || incoming.weekly === undefined) delete merged.weekly;
  return list.map((m) => (m.id === incoming.id ? merged : m));
}

export function deleteMission(list: ScheduledMission[], id: string): ScheduledMission[] {
  return list.filter((m) => m.id !== id);
}

/** Turn one schedule on or off. Null when there is no such schedule. */
export function setMissionEnabled(list: ScheduledMission[], id: string, on: boolean): ScheduledMission[] | null {
  if (!list.some((m) => m.id === id)) return null;
  return list.map((m) => (m.id === id ? { ...m, enabled: on } : m));
}

/** Pause every schedule `agentId` owns (the owner closed that agent, design 6A
 *  as amended by eng review R1). Returns how many were switched off. */
export function pauseMissionsOf(list: ScheduledMission[], agentId: string, godId: string): { missions: ScheduledMission[]; paused: number } {
  let paused = 0;
  const missions = list.map((m) => {
    if (!m.enabled || ownerOf(m, godId) !== agentId) return m;
    paused++;
    return { ...m, enabled: false };
  });
  return { missions, paused };
}

/* ───────────────────────── agent schedule requests ───────────────────────── */
// An agent never changes a schedule itself (owner, 2026-09-25). It sends a
// request from its outbox; the owner approves or declines it in ASK ME, and only
// an approval applies the change.

export type ScheduleOp = 'add' | 'update' | 'pause' | 'resume' | 'delete';

/** The schedule an add or update proposes. */
export interface ScheduleDraft {
  label: string;
  intervalMs: number;
  weekly?: { days: number[]; minute: number };
}

export interface ScheduleRequest {
  id: string;
  /** The asking agent (from its outbox folder, never from the message). */
  agentId: string;
  op: ScheduleOp;
  /** The schedule an update, pause, resume or delete targets. */
  missionId?: string;
  /** The proposed schedule for add and update. */
  draft?: ScheduleDraft;
  /** The target as it was when the agent asked; a mismatch at approval time
   *  means the owner or someone else changed it since. */
  snapshot?: string;
  createdAt: number;
}

const DAY_NAMES: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const LABEL_MAX = 80;

/** Node timers can't wait longer than 2^31-1 ms (about 24.8 days): a longer
 *  delay is clamped to 1 ms, so the job would fire nonstop (review, 2026-09-25).
 *  Intervals stay at or under 24 days, and armPlan never arms a longer wait. */
export const MAX_INTERVAL_MS = 24 * 86_400_000;
const MAX_TIMER_MS = 2_147_483_647;

/** Read an agent's `when`: `{ every: "30m" | "2h" | "1d" }` or
 *  `{ days: ["mon", "fri"] | ["weekdays"], at: "09:00" }`. Null if unusable. */

export function parseWhen(when: unknown): { intervalMs: number; weekly?: { days: number[]; minute: number } } | null {
  if (!when || typeof when !== 'object') return null;
  const w = when as { every?: unknown; days?: unknown; at?: unknown };
  if (typeof w.every === 'string') {
    const hit = /^\s*(\d+)\s*(m|min|mins|minutes?|h|hr|hrs|hours?|d|days?)\s*$/i.exec(w.every);
    if (!hit) return null;
    const n = Number(hit[1]);
    const unit = hit[2].toLowerCase()[0];
    const ms = n * (unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000);
    return ms >= 60_000 && ms <= MAX_INTERVAL_MS ? { intervalMs: ms } : null;
  }
  if (Array.isArray(w.days) && typeof w.at === 'string') {
    const t = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(w.at);
    // "09:75" is not a time: refuse it instead of rolling it over to 10:15.
    if (!t || Number(t[1]) > 23 || Number(t[2]) > 59) return null;
    const minute = Number(t[1]) * 60 + Number(t[2]);
    const days = new Set<number>();
    for (const raw of w.days) {
      if (typeof raw !== 'string') return null;
      const d = raw.trim().toLowerCase();
      if (d === 'weekdays') [1, 2, 3, 4, 5].forEach((x) => days.add(x));
      else if (d === 'weekends') [0, 6].forEach((x) => days.add(x));
      else if (d === 'daily' || d === 'every day') [0, 1, 2, 3, 4, 5, 6].forEach((x) => days.add(x));
      else if (d.slice(0, 3) in DAY_NAMES) days.add(DAY_NAMES[d.slice(0, 3)]);
      else return null;
    }
    const weekly = normalizeWeekly({ days: [...days], minute });
    return weekly ? { intervalMs: 86_400_000, weekly } : null;
  }
  return null;
}

/** What an approval must find unchanged. */
export function missionFingerprint(m: ScheduledMission): string {
  const w = normalizeWeekly(m.weekly);
  return JSON.stringify([m.label, m.intervalMs, w ? `${w.days.join(',')}@${w.minute}` : '', m.enabled]);
}

/**
 * Turn an agent's `schedule` payload into a pending request, or say why not.
 * `actor` is the owning outbox folder. `reason` goes back to the agent.
 */
export function buildScheduleRequest(
  actor: string, payload: unknown, missions: ScheduledMission[], godId: string, now: number, id: string
): { ok: true; request: ScheduleRequest } | { ok: false; reason: string } {
  if (!payload || typeof payload !== 'object') return { ok: false, reason: 'The "schedule" field must be an object.' };
  const p = payload as { op?: unknown; id?: unknown; label?: unknown; when?: unknown };
  const op = p.op;
  if (op !== 'add' && op !== 'update' && op !== 'pause' && op !== 'resume' && op !== 'delete') {
    return { ok: false, reason: 'Unknown op. Use add, update, pause, resume, delete or list.' };
  }
  const label = typeof p.label === 'string' ? p.label.trim() : '';
  if (label.length > LABEL_MAX) return { ok: false, reason: `Keep the label under ${LABEL_MAX} characters.` };

  if (op === 'add') {
    if (!label) return { ok: false, reason: 'An add needs a "label" naming the job.' };
    const when = parseWhen(p.when);
    if (!when) return { ok: false, reason: 'An add needs a usable "when": {"every": "2h"} (1 minute to 24 days) or {"days": ["mon"], "at": "09:00"}.' };
    return { ok: true, request: { id, agentId: actor, op, draft: { label, ...when }, createdAt: now } };
  }

  const missionId = typeof p.id === 'string' ? p.id : '';
  const target = missions.find((m) => m.id === missionId);
  if (!target) return { ok: false, reason: 'No schedule has that "id". Send {"op": "list"} to see your schedules and their ids.' };
  if (!canEdit(actor, target, godId)) return { ok: false, reason: 'That schedule belongs to another team member. You can only ask about your own.' };

  const base: ScheduleRequest = { id, agentId: actor, op, missionId, snapshot: missionFingerprint(target), createdAt: now };
  if (op !== 'update') return { ok: true, request: base };
  const when = p.when === undefined ? null : parseWhen(p.when);
  if (p.when !== undefined && !when) return { ok: false, reason: 'That "when" is not usable.' };
  if (!label && !when) return { ok: false, reason: 'An update needs a new "label", a new "when", or both.' };
  const draft: ScheduleDraft = {
    label: label || target.label,
    intervalMs: when ? when.intervalMs : target.intervalMs,
    ...(when ? (when.weekly ? { weekly: when.weekly } : {}) : (target.weekly ? { weekly: target.weekly } : {}))
  };
  return { ok: true, request: { ...base, draft } };
}

/** Has the target changed (or gone) since the agent asked? Adds never go stale. */
export function requestIsStale(req: ScheduleRequest, missions: ScheduledMission[]): boolean {
  if (req.op === 'add') return false;
  const target = missions.find((m) => m.id === req.missionId);
  return !target || missionFingerprint(target) !== req.snapshot;
}

/** Apply an approved request to the current list. Refuses a stale one. */
export function applyScheduleRequest(
  req: ScheduleRequest, missions: ScheduledMission[], newId: string
): { ok: true; missions: ScheduledMission[]; missionId: string } | { ok: false; error: string } {
  if (requestIsStale(req, missions)) return { ok: false, error: 'stale' };
  if (req.op === 'add' && req.draft) {
    const m: ScheduledMission = {
      id: newId, label: req.draft.label, intervalMs: req.draft.intervalMs,
      ...(req.draft.weekly ? { weekly: req.draft.weekly } : {}),
      to: req.agentId, body: '', enabled: true, createdBy: req.agentId
    };
    return { ok: true, missions: [...missions, m], missionId: newId };
  }
  const id = req.missionId ?? '';
  if (req.op === 'delete') return { ok: true, missions: deleteMission(missions, id), missionId: id };
  if (req.op === 'pause' || req.op === 'resume') {
    const next = setMissionEnabled(missions, id, req.op === 'resume');
    return next ? { ok: true, missions: next, missionId: id } : { ok: false, error: 'stale' };
  }
  if (req.op === 'update' && req.draft) {
    const target = missions.find((m) => m.id === id);
    if (!target) return { ok: false, error: 'stale' };
    const updated: ScheduledMission = { ...target, label: req.draft.label, intervalMs: req.draft.intervalMs };
    if (req.draft.weekly) updated.weekly = req.draft.weekly; else delete updated.weekly;
    return { ok: true, missions: missions.map((m) => (m.id === id ? updated : m)), missionId: id };
  }
  return { ok: false, error: 'invalid' };
}
