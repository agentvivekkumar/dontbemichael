/**
 * What fills Needs you once the owner has answered everything (owner,
 * 2026-11-10): the answers become one quiet line, and under it Michael offers
 * ONE thing worth doing, drawn from this office, never a generic tip.
 *
 *   1. A way to save, from Pulse: the suggestion that saves the most a week
 *      and that one click can apply (a schedule interval or a model).
 *   2. A connector the owner switched on that no member may use yet.
 *   Nothing worth offering: what the team did today (todayRecap), from
 *   Pulse's own counts, so the space is rarely empty (owner, 2026-11-11).
 *   Nothing done today either: no card.
 *
 * Not now hides a tip for TIP_SNOOZE_MS. It is not counted in Needs you and
 * goes with the column (it closes, another tab opens, the office restarts).
 *
 * No electron or react imports: the renderer calls it, tests load it.
 */
import type { Advice } from './teamAdvice';
import type { Outcome, WorkKind } from './teamPerformance';

export const TIP_SNOOZE_MS = 7 * 86_400_000;
/** A saving smaller than this a week is not worth the owner's attention here. */
export const MIN_SAVE_USD = 1;

export type AllClearTip =
  | { kind: 'save'; id: string; advice: Advice; usdPerWeek: number }
  | { kind: 'connector'; id: string; key: string; label: string };

export interface TipInput {
  /** Pulse's suggestions as shown today (dismissals already applied). */
  advice: readonly Advice[];
  /** Connectors the owner has switched on (mail and QuickBooks left out). */
  connectorsOn: ReadonlyArray<{ key: string; label: string }>;
  /** Connector keys at least one current team member may use. */
  grantedKeys: ReadonlySet<string>;
  /** Tip id to the time its Not now ends. */
  snoozed: Readonly<Record<string, number>>;
  now: number;
}

const saveId = (a: Advice): string => `save:${a.id}`;
const connectorId = (key: string): string => `connector:${key}`;

/** The one tip to show, or null. */
export function pickAllClearTip(input: TipInput): AllClearTip | null {
  const open = (id: string): boolean => !(input.snoozed[id] > input.now);
  const saves = input.advice
    .filter((a) => (a.kind === 'run-less' || a.kind === 'cheaper-model')
      && (a.change.kind === 'interval' || a.change.kind === 'when' || a.change.kind === 'model')
      && a.savesPerWeek !== null && a.savesPerWeek >= MIN_SAVE_USD
      && open(saveId(a)))
    .sort((a, b) => (b.savesPerWeek ?? 0) - (a.savesPerWeek ?? 0));
  if (saves[0]) return { kind: 'save', id: saveId(saves[0]), advice: saves[0], usdPerWeek: saves[0].savesPerWeek ?? 0 };
  const idle = [...input.connectorsOn]
    .filter((c) => !input.grantedKeys.has(c.key) && open(connectorId(c.key)))
    .sort((a, b) => a.label.localeCompare(b.label));
  if (idle[0]) return { kind: 'connector', id: connectorId(idle[0].key), key: idle[0].key, label: idle[0].label };
  return null;
}

/** Not now: the tip stays away for a week; expired entries are dropped. */
export function snoozeTip(snoozed: Readonly<Record<string, number>>, id: string, now: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, until] of Object.entries(snoozed)) if (typeof until === 'number' && until > now) out[k] = until;
  out[id] = now + TIP_SNOOZE_MS;
  return out;
}

/** The owner's answer as the summary list shows it: the choice alone, without
 *  the "Picked: " the answer record starts with. */
export function answerShort(a: string): string {
  return a.replace(/^\s*Picked:\s*/i, '').trim();
}

/** Pulse's order for the kinds of work. */
const RECAP_ORDER: readonly WorkKind[] = ['email', 'sent', 'task', 'check'];

/** Today's work for the recap: each kind the team did any of, in Pulse's
 *  order; empty when nothing was done yet. */
export function todayRecap(outcomes: readonly Outcome[] | null | undefined): Outcome[] {
  const by = new Map((outcomes ?? []).map((o) => [o.kind, o]));
  return RECAP_ORDER.map((k) => by.get(k)).filter((o): o is Outcome => !!o && o.total > 0);
}
