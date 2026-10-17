import { agentMailboxes, type MailAccessConfig } from './mailboxes';
import { usableConnectors, type ConnectorConfig } from './claudeConnectors';
import type { ScheduledMission } from './missions';

/**
 * "Pam cannot check email" beside a schedule (docs/designs/multi-mailbox.md,
 * Section 4 and the TODOS item). The owner's rule is that a mail check
 * schedule still nudges an agent with email off, and the check is refused, so
 * without a note the job looks fine while every run costs a turn and reads
 * nothing.
 */

/** Words that make a job a mail check: email, mail, inbox, mailbox. */
const MAIL_WORDS = /\b(e-?mails?|mail|inbox(es)?|mailbox(es)?)\b/i;

/** Whether a schedule reads as a mail check, from its name, focus area or older
 *  prompt. A heartbeat or compact job is the app's own upkeep, and a relay job
 *  goes to Michael to hand out, so none of those counts. */
export function isMailCheckJob(m: Pick<ScheduledMission, 'label' | 'focus' | 'body' | 'kind' | 'relay'>): boolean {
  if ((m.kind ?? 'dispatch') !== 'dispatch' || m.relay) return false;
  return [m.label, m.focus ?? '', m.body].some((text) => MAIL_WORDS.test(text));
}

/** Whether an agent can read any email: a mailbox from its Access tab (the
 *  rule the mail tools apply), or the Claude account's Gmail connector, on and
 *  given to it. */
export function canCheckEmail(cfg: MailAccessConfig & ConnectorConfig, agentId: string): boolean {
  if (agentMailboxes(cfg, agentId).length > 0) return true;
  return usableConnectors(cfg, agentId, false).some((c) => /^gmail$/i.test(c.key.trim()));
}

/** Whether to say "{{name}} cannot check email" beside this schedule. Only for
 *  a job that is on: a paused one runs nothing. */
export function cannotCheckEmailNote(
  cfg: (MailAccessConfig & ConnectorConfig) | null | undefined,
  agentId: string,
  m: Pick<ScheduledMission, 'label' | 'focus' | 'body' | 'kind' | 'relay' | 'enabled'>
): boolean {
  if (!cfg || !m.enabled) return false;
  return isMailCheckJob(m) && !canCheckEmail(cfg, agentId);
}
