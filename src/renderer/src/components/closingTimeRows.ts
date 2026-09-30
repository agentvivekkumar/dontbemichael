/**
 * What each closing-time row says (QuitWarningModal's ClosingTimeRows), kept
 * out of the component so it can be tested without rendering React.
 */
import type { Agent } from '@/store/store';

export interface RowText {
  /** "still working" / "waiting at a prompt" / "nothing to do". */
  state: string;
  /** What it is doing and for how long, e.g. "Run the test suite · 7 min". */
  line?: string;
}

/**
 * A waiting agent's row. `atPrompt` is the store's ACTION_AT_PROMPT marker and
 * `caption` its actionText, passed in so this stays free of the store module.
 */
export function describeRow(
  a: Pick<Agent, 'status' | 'action' | 'actionDetail' | 'actionAt'> | undefined,
  now: number,
  t: (key: string, opts?: Record<string, unknown>) => string,
  atPrompt: string,
  caption: (action: string, t: (key: string) => string) => string
): RowText {
  if (!a) return { state: t('closingTime.stillWorking') };
  const state = a.action === atPrompt ? t('closingTime.atPrompt')
    : a.status === 'idle' ? t('closingTime.nothingToDo')
    : t('closingTime.stillWorking');
  // Idle and at-a-prompt already say it all in `state`; no second line.
  const what = a.status === 'idle' || a.action === atPrompt ? undefined : a.actionDetail ?? caption(a.action, t);
  const mins = a.actionAt ? Math.floor((now - a.actionAt) / 60_000) : 0;
  const line = [what, mins >= 1 ? t('closingTime.minutes', { count: mins }) : ''].filter(Boolean).join(' · ') || undefined;
  return { state, line };
}

/** The message a row shows after Remind or Close without them: none when it
 *  went through, else main's reason, else the generic "didn't send". */
export function actionMessage(res: { ok: boolean; error?: string } | undefined, fallback: string): string | undefined {
  if (res?.ok) return undefined;
  return res?.error || fallback;
}

/**
 * The counter strip above the rows. Its words are the dialog's original
 * English (owner, 2026-09-29: the existing dialog words stay); it moves on to
 * the orchestrator once nobody is left to wait for, and says so when
 * Michael's own terminal has ended.
 */
export function headerLine(c: { acked: number; total: number; waiting?: string[]; godLive?: boolean }): string {
  const tail = c.godLive === false ? "THE ORCHESTRATOR'S TERMINAL ENDED" : 'WAITING FOR THE ORCHESTRATOR';
  if (c.total <= 0) return `NO WORKERS ON THE FLOOR. ${tail}`;
  const nobodyLeft = c.acked >= c.total || (c.waiting !== undefined && c.waiting.length === 0);
  return `${c.acked} / ${c.total} WORKERS CONFIRMED${c.godLive === false || nobodyLeft ? `. ${tail}` : ''}`;
}
