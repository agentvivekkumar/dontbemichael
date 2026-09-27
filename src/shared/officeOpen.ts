/**
 * Office open: the other half of Closing Time (owner, 2026-09-26).
 *
 * Closing Time tells every agent "do not start new work". On the next launch
 * each agent resumes that same conversation, so without a word that the office
 * is open again, an agent keeps holding its scheduled jobs (seen live: Pam held
 * every "Check Emails" run after a relaunch). The app reads the office log at
 * launch; if the office was closed and never opened since, every agent gets one
 * "Office open" message as it starts.
 *
 * No electron / node imports: main calls it, tests load it directly.
 */

export const OFFICE_OPEN_SUBJECT = 'Office open';

/** The harness's own brief to Michael starts closing time (closingTime.ts). */
const CLOSING_BRIEF = 'Closing time: close the office now';
/** Cancelling closing time reopens the office too (closingTime.ts). */
const CLOSING_CANCELLED = 'Closing time cancelled';

export function officeOpenBody(): string {
  return [
    'The office is open again. Closing time is over, so carry on as normal: pick up your work and your scheduled jobs.',
    'If you held anything because of closing time, do it now. Do not reply to this message.'
  ].join(' ');
}

interface LogMessage { kind?: string; subject?: string; from?: string; to?: string }

function isClose(e: LogMessage): boolean {
  const s = (e.subject ?? '').trim();
  if (s === CLOSING_BRIEF) return true;
  if (/^closing[-_\s]*time[-_\s]*complete$/i.test(s)) return true;
  // Michael's broadcast to the team; its wording is his, so match loosely.
  return e.to === 'broadcast' && /^closing time\b/i.test(s) && !/cancel/i.test(s);
}

function isOpen(e: LogMessage): boolean {
  const s = (e.subject ?? '').trim();
  return s === OFFICE_OPEN_SUBJECT || s === CLOSING_CANCELLED;
}

/** True when the latest closing in the log came after the latest opening:
 *  the agents were told to stop and nobody has told them to start again. */
export function officeClosedInLog(entries: unknown[]): boolean {
  let lastClose = -1;
  let lastOpen = -1;
  entries.forEach((raw, i) => {
    const e = raw as LogMessage;
    if (!e || e.kind !== 'message') return;
    if (isOpen(e)) lastOpen = i;
    else if (isClose(e)) lastClose = i;
  });
  return lastClose > lastOpen;
}
