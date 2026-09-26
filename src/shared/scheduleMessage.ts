/**
 * What a schedule tells an agent (owner, 2026-09-25). A schedule says when and
 * which job: its label names the job. How the job is done lives in one place,
 * the agent's Work style (plus the procedures its memory saves), so the two
 * can't drift apart or contradict each other the way a free-text prompt on
 * every schedule did. Every run sends the same short message.
 *
 * `legacy` is text an older schedule carried as its prompt, sent along until
 * the owner moves it into the agent's Work style, so nothing is silently lost.
 */
export function scheduledRunBody(label: string, legacy?: string): string {
  const lines = [
    `Scheduled run: ${label.trim()}.`,
    'Do it the way your Work style and your saved procedures say. If there is nothing to do, stop without messaging anyone.'
  ];
  const old = (legacy ?? '').trim();
  if (old) lines.push('', 'Older instructions the owner gave this schedule, until they move into your Work style:', old);
  return lines.join('\n');
}

/**
 * A former "everyone" schedule (design 3A): it now belongs to Michael, who
 * hands the job to each team member it applies to instead of the scheduler
 * broadcasting it.
 */
export function relayRunBody(label: string, legacy?: string): string {
  const lines = [
    `Scheduled run for the whole team: ${label.trim()}.`,
    'Hand this job to each team member it applies to, with a short request each. If it applies to nobody right now, stop without messaging anyone.'
  ];
  const old = (legacy ?? '').trim();
  if (old) lines.push('', 'Older instructions the owner gave this schedule:', old);
  return lines.join('\n');
}
