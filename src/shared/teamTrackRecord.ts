/**
 * Track record for each team member (issue 319, first step: read only).
 *
 * The owner cannot answer two plain questions today: what did one team
 * member cost this week, and can I stop checking that member's drafts?
 * Cost shows only as developer token meters, and approval history is
 * spread across cards. This module folds what the app already records
 * into one weekly line per team member:
 *
 *   - Cost per member, from cost-ledger.jsonl rows. A row's `usd` is a
 *     cumulative counter for one (agent, session), so the week's cost
 *     is the folded total at the end of the week minus the folded total
 *     at its start, using the same reset rule as src/main/costLifetime.ts
 *     (a decrease closes a segment at its peak, which is how an app
 *     restart shows up in the ledger).
 *   - Mail decisions, from the proposals in mail-proposals.json: drafts
 *     sent as written, drafts sent after the owner's edits (told apart
 *     with describeEdits, the same comparison the approval flow uses),
 *     drafts the owner stopped, and drafts sent back for changes.
 *   - Cards closed and cards the owner reopened, from card events. The
 *     task ledger carries no per member close or reopen timestamps of
 *     its own, so callers pass the events they recorded; supplying them
 *     from the board is a later step, not part of this one.
 *   - One plan meter for the whole office: the last plan reading the
 *     caller has, passed through unchanged, because the plan limit is
 *     per account, not per member (issue 129).
 *
 * Rules from the issue: show counts, not percentages, until a member
 * has at least PERCENTAGES_MIN_DECISIONS mail decisions in the window
 * (showCountsOnly carries that). No estimated time saved, no forecasts,
 * and nothing here writes anything: no file access, no settings, and
 * no code path that changes which model a member runs on.
 *
 * Pure: no fs, no electron. Main or the weekly digest (issue 81) can
 * call it with what they already hold.
 */
import { describeEdits, type MailProposal } from './mailProposals';

/** The label that travels with every cost figure from here: the ledger
 *  is priced at API rates, whatever the owner's plan actually charges. */
export const COST_BASIS_LABEL = "at API prices; your plan cost doesn't change";

/** Below this many mail decisions in a window, a member's line shows
 *  counts only. A percentage from a handful of decisions reads as a
 *  verdict the numbers cannot carry yet. */
export const PERCENTAGES_MIN_DECISIONS = 10;

/** One card event a caller recorded: a card for this member was closed,
 *  or a closed card was reopened by the owner, at this time (ms). */
export interface CardEvent {
  agentId: string;
  kind: 'closed' | 'reopened';
  at: number;
}

/** The last reading of the account's plan usage, as the break and cost
 *  surfaces already take it (used_percentage and resets_at). */
export interface PlanReading {
  usedPercentage: number;
  /** When the plan limit resets (ms), or null when the engine did not say. */
  resetsAt: number | null;
}

/** Everything one weekly fold reads. All of it is optional: a source a
 *  caller does not have yet simply contributes zeros. */
export interface TeamTrackRecordInput {
  /** The roster. Every member named here gets a line, even a quiet one
   *  with no activity, so a quiet week shows zeros instead of vanishing. */
  agentIds?: string[];
  /** The raw text of cost-ledger.jsonl, as it sits on disk. */
  costLedgerText?: string;
  /** The proposals from mail-proposals.json, undecided ones included. */
  proposals?: MailProposal[];
  /** Card closes and owner reopens recorded for the window. */
  cardEvents?: CardEvent[];
  /** The office's last plan reading, or null when there is none. */
  plan?: PlanReading | null;
}

/** One team member's week, in counts and one cost figure. */
export interface TeamMemberWeek {
  agentId: string;
  /** Cost in USD at API prices (see COST_BASIS_LABEL), for this window only. */
  costUsd: number;
  cardsClosed: number;
  /** Cards the owner reopened after they were closed. */
  cardsReopened: number;
  /** Approved drafts that went out with the owner's text unchanged. */
  draftsSentAsWritten: number;
  /** Approved drafts that went out after the owner edited them. */
  draftsSentAfterEdits: number;
  /** Drafts the owner declined, so they never went out. */
  draftsStopped: number;
  /** Drafts the owner sent back to the member for changes. */
  changesRequested: number;
  /** Mail decisions the owner made in the window (approvals, stops and
   *  requests for changes). The app cancelling a draft is not a decision. */
  decisions: number;
  /** True while decisions are under PERCENTAGES_MIN_DECISIONS: readers
   *  show the counts above and no percentages. */
  showCountsOnly: boolean;
  /** True when nothing at all happened for this member in the window. */
  quiet: boolean;
}

/** The whole office for one window. */
export interface TeamTrackRecord {
  startMs: number;
  endMs: number;
  /** One line per member, in agent id order: the roster plus any member
   *  the records name. */
  members: TeamMemberWeek[];
  /** The office's plan meter (the input reading, unchanged), or null. */
  plan: PlanReading | null;
  /** True when every member's line is quiet. */
  quiet: boolean;
}

const EPS = 1e-9;

/** Fold ledger rows into per agent totals, the costLifetime rule: within
 *  one (agent, session) the counter only climbs, a decrease closes the
 *  segment at its peak (an app restart), and the agent's total is the
 *  closed peaks plus the open segment's peak. Only rows stamped before
 *  `beforeMs` count, which is what makes a window total minus a window
 *  start baseline equal to the cost inside the window, restarts and all. */
function foldedTotalsBefore(text: string, beforeMs: number): Map<string, number> {
  const seg = new Map<string, { committed: number; peak: number }>();
  for (const line of text.split('\n')) {
    if (!line) continue;
    let row: { agent_id?: unknown; session_id?: unknown; ts?: unknown; usd?: unknown };
    try { row = JSON.parse(line) as typeof row; } catch { continue; }
    if (!row || typeof row.agent_id !== 'string') continue;
    if (typeof row.ts !== 'number' || !Number.isFinite(row.ts) || row.ts >= beforeMs) continue;
    const usd = typeof row.usd === 'number' && Number.isFinite(row.usd) ? row.usd : 0;
    const key = `${row.agent_id}\t${typeof row.session_id === 'string' ? row.session_id : ''}`;
    let s = seg.get(key);
    if (!s) { s = { committed: 0, peak: 0 }; seg.set(key, s); }
    if (usd < s.peak - EPS) { s.committed += s.peak; s.peak = usd; }
    else if (usd > s.peak) s.peak = usd;
  }
  const totals = new Map<string, number>();
  for (const [key, s] of seg) {
    const agentId = key.slice(0, key.indexOf('\t'));
    totals.set(agentId, (totals.get(agentId) ?? 0) + s.committed + s.peak);
  }
  return totals;
}

const inWindow = (at: number | undefined, startMs: number, endMs: number): boolean =>
  typeof at === 'number' && Number.isFinite(at) && at >= startMs && at < endMs;

/**
 * One weekly line per team member for the window [startMs, endMs).
 * Members come from the roster plus anyone the records name, so a member
 * who left the roster still shows the week they actually had.
 */
export function teamTrackRecord(input: TeamTrackRecordInput, startMs: number, endMs: number): TeamTrackRecord {
  const blank = (agentId: string): TeamMemberWeek => ({
    agentId, costUsd: 0, cardsClosed: 0, cardsReopened: 0,
    draftsSentAsWritten: 0, draftsSentAfterEdits: 0, draftsStopped: 0,
    changesRequested: 0, decisions: 0, showCountsOnly: true, quiet: true
  });
  const byId = new Map<string, TeamMemberWeek>();
  const line = (agentId: string): TeamMemberWeek => {
    let m = byId.get(agentId);
    if (!m) { m = blank(agentId); byId.set(agentId, m); }
    return m;
  };
  for (const id of input.agentIds ?? []) if (typeof id === 'string' && id) line(id);

  // Cost: the folded total at the end of the window minus the one at its
  // start, per member. A restart inside the window closes a segment in
  // both folds, so none of its spend is lost or counted twice.
  if (input.costLedgerText) {
    const baseline = foldedTotalsBefore(input.costLedgerText, startMs);
    const folded = foldedTotalsBefore(input.costLedgerText, endMs);
    for (const [agentId, total] of folded) {
      const spent = total - (baseline.get(agentId) ?? 0);
      if (spent > EPS) line(agentId).costUsd = Math.round(spent * 1e6) / 1e6;
    }
  }

  // Mail: a send counts in the week it went out (sentAt), a decision in
  // the week the owner made it (decidedAt). Edited is describeEdits on
  // the draft against the version the owner approved, exactly as the
  // approval flow tells it apart.
  for (const p of input.proposals ?? []) {
    if (!p || typeof p.agentId !== 'string' || !p.agentId) continue;
    if (inWindow(p.decidedAt, startMs, endMs) && p.state !== 'waiting' && p.state !== 'cancelled') {
      const m = line(p.agentId);
      m.decisions += 1;
      if (p.state === 'declined') m.draftsStopped += 1;
      if (p.state === 'changes') m.changesRequested += 1;
    }
    if (p.state === 'sent' && inWindow(p.sentAt, startMs, endMs)) {
      const m = line(p.agentId);
      const edited = !!p.approved && describeEdits({ subject: p.subject, body: p.body }, p.approved) !== '';
      if (edited) m.draftsSentAfterEdits += 1;
      else m.draftsSentAsWritten += 1;
    }
  }

  for (const e of input.cardEvents ?? []) {
    if (!e || typeof e.agentId !== 'string' || !e.agentId || !inWindow(e.at, startMs, endMs)) continue;
    const m = line(e.agentId);
    if (e.kind === 'closed') m.cardsClosed += 1;
    else if (e.kind === 'reopened') m.cardsReopened += 1;
  }

  const members = [...byId.values()].sort((a, b) => (a.agentId < b.agentId ? -1 : a.agentId > b.agentId ? 1 : 0));
  for (const m of members) {
    m.showCountsOnly = m.decisions < PERCENTAGES_MIN_DECISIONS;
    m.quiet = m.costUsd === 0 && m.cardsClosed === 0 && m.cardsReopened === 0
      && m.draftsSentAsWritten === 0 && m.draftsSentAfterEdits === 0
      && m.draftsStopped === 0 && m.changesRequested === 0 && m.decisions === 0;
  }
  return {
    startMs,
    endMs,
    members,
    plan: input.plan ?? null,
    quiet: members.every((m) => m.quiet)
  };
}
