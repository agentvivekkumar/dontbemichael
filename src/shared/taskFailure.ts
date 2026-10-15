/**
 * A failed task card: why it failed, when, and how many times it has been
 * tried again. Michael writes these fields; a team member's process stopping
 * mid task writes the same shape. The owner sees them on the card.
 *
 * Retry is a request back to Michael, not a second run of the work. It is
 * offered only when the card says trying again is safe, the work is still
 * open (To do or Doing), and nothing on it is waiting for the owner. A second
 * retry of a card that already left the failed state is refused, so a double
 * click cannot count twice.
 */
import { openAskIndexes, type AskEntry } from './askMeRouting';

/** Shown when a team member's process stops while a Doing card is theirs. */
export const STOPPED_BEFORE_FINISH = 'Stopped before the work finished.';

/**
 * What Michael is told to write when work fails. One sentence in both of his
 * prompts, so a business office and an older install record the same fields.
 */
export const FAILURE_BOARD_RULE = 'When work on a card fails, set "failureReason" to a short plain reason with no dashes, "failedAt" to the time, and "retryCount" to how many times it was already tried again (0 the first time). Set "retryable" to true only when trying the same work again is safe, and to false when a send, a charge, or another finished step would happen twice, or when the stop is permanent. The owner sees this on the card. When they ask to try a safe one again, you get a note and the card returns to To do: route it, and do not repeat a step that already happened.';

const RETRY_STATUSES = new Set(['todo', 'doing']);
const REASON_MAX = 500;

/** The fields this reads from a card. Anything else is left alone. */
export interface FailureCard {
  status?: string;
  failureReason?: unknown;
  failedAt?: unknown;
  retryCount?: unknown;
  retryable?: unknown;
  humanQA?: readonly (AskEntry | null | undefined)[] | undefined;
}

/** What the card shows. Absent when the card has not failed, or it is Done. */
export interface TaskFailure {
  reason?: string;
  failedAt?: string;
  retryCount: number;
}

export interface RetryPatch {
  status: 'todo';
  failureReason: null;
  failedAt: null;
  retryable: null;
  retryCount: number;
}

function cleanReason(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text ? text.slice(0, REASON_MAX) : undefined;
}

function cleanTime(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? value : undefined;
}

function cleanCount(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 999 ? value : 0;
}

/** The failure the owner should see, or null when this card is not a failed one. */
export function taskFailure(task: FailureCard): TaskFailure | null {
  if (task.status === 'done' || task.status === 'triage') return null;
  const reason = cleanReason(task.failureReason);
  const failedAt = cleanTime(task.failedAt);
  if (!reason && !failedAt) return null;
  return { reason, failedAt, retryCount: cleanCount(task.retryCount) };
}

/** A Doing card whose person stopped, or null when there is nothing to record. */
export function failureFromStop(task: FailureCard, now: string): {
  failureReason: string; failedAt: string; retryCount: number; retryable: boolean
} | null {
  if (task.status !== 'doing' || taskFailure(task)) return null;
  return {
    failureReason: STOPPED_BEFORE_FINISH,
    failedAt: cleanTime(now) ?? new Date().toISOString(),
    retryCount: cleanCount(task.retryCount),
    retryable: openAskIndexes(task.humanQA).length === 0
  };
}

/**
 * True only when trying again is safe: the card says so, it is still To do or
 * Doing, and no question is open for the owner. Done, Blocked, Waiting and a
 * permanent stop are not retried from here.
 */
export function canRetryTask(task: FailureCard): boolean {
  if (!taskFailure(task) || task.retryable !== true) return false;
  if (!RETRY_STATUSES.has(task.status ?? '')) return false;
  return openAskIndexes(task.humanQA).length === 0;
}

/** The ledger patch for one retry, or null when the card must not be retried. */
export function retryTaskPatch(task: FailureCard): RetryPatch | null {
  const failure = taskFailure(task);
  if (!failure || !canRetryTask(task)) return null;
  return {
    status: 'todo',
    failureReason: null,
    failedAt: null,
    retryable: null,
    retryCount: Math.min(999, failure.retryCount + 1)
  };
}

/** The card as the board shows it after a retry that was allowed. */
export function taskAfterRetry<T extends FailureCard>(task: T): (T & {
  status: 'todo'; failureReason: undefined; failedAt: undefined; retryable: undefined; retryCount: number
}) | null {
  const patch = retryTaskPatch(task);
  if (!patch) return null;
  return {
    ...task,
    status: 'todo',
    failureReason: undefined,
    failedAt: undefined,
    retryable: undefined,
    retryCount: patch.retryCount
  };
}

const failedAtFormats = new Map<string, Intl.DateTimeFormat>();

/** A failure time in the viewer's local time, like the card's next step time. */
export function failedAtLabel(failedAt: string | undefined, lang?: string): string | undefined {
  if (!cleanTime(failedAt)) return undefined;
  const key = lang ?? '';
  let format = failedAtFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(lang || undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    failedAtFormats.set(key, format);
  }
  return format.format(new Date(failedAt!));
}
