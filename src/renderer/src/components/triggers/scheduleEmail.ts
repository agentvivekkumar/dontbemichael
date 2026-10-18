import { agentAccessSummary } from '@shared/agentAccess';
import type { ScheduledMission } from '@shared/missions';

/**
 * The "Pam cannot check email" note beside a schedule (docs/designs/
 * multi-mailbox.md, CEO Section 4). A mail check on an agent without email
 * still nudges it and the check is refused, so the row says why nothing
 * happens. Kept pure, apart from the list, so a test can check it without
 * rendering anything.
 */

/** The mailbox and connector settings the check reads. */
type AccessConfig = Parameters<typeof agentAccessSummary>[0];

/** Words that make a job a mail check: email, mail, mailbox, inbox, an
 *  address ("check sales@ every 10 minutes"), and the same in Chinese and
 *  Arabic. */
const MAIL_WORDS = /\b(?:e-?mail|g?mail|mailbox|inbox)(?:s|es|ed|ing)?\b|[\w.+-]@|邮件|邮箱|电邮|بريد/i;

/** True when a job reads as a mail check, from its name, focus area or prompt. */
export function isMailCheck(m: Pick<ScheduledMission, 'label' | 'focus' | 'body' | 'kind'>): boolean {
  if (m.kind === 'compact') return false;
  return MAIL_WORDS.test([m.label, m.focus ?? '', m.body].join('\n'));
}

/** True when the agent has no mailbox to read (Can check email off, or its
 *  mailbox was removed) and no Gmail connector it may use: the same access
 *  its profile lists (agentAccessSummary). */
export function cannotCheckEmail(cfg: AccessConfig, agentId: string): boolean {
  return !agentAccessSummary(cfg, agentId, false).some((i) => i.kind === 'mailbox' || (i.kind === 'connector' && /^gmail$/i.test(i.key.trim())));
}

/** The note for a schedule's row, or null. Nothing while the config loads. */
export function noEmailNote(
  m: Pick<ScheduledMission, 'label' | 'focus' | 'body' | 'kind'>,
  cfg: AccessConfig | null,
  agentId: string,
  name: string,
  t: (key: string, opts: { name: string }) => string
): string | null {
  if (!cfg || !isMailCheck(m) || !cannotCheckEmail(cfg, agentId)) return null;
  return t('schedulesSection.cannotCheckEmail', { name });
}
