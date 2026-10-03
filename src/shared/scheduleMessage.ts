/**
 * What a schedule tells an agent (owner, 2026-09-25; focus areas 2026-10-02,
 * docs/designs/schedule-focus-areas.md). A schedule says when and which job:
 * its label names the job. How the work is done lives in the agent's Work
 * style (plus the procedures its memory saves). The job's focus area, what to
 * concentrate on in this run, comes only in its run message (FA2), so a request
 * from Michael or a teammate's question is answered from the Work style alone.
 *
 * `legacy` is text an older schedule carried as its prompt, sent along until
 * the owner clears it (saving it as the job's focus area does, when nothing
 * would be lost), so nothing is silently lost (FA4).
 */
export function scheduledRunBody(label: string, legacy?: string, focus?: string): string {
  const lines = [`Scheduled run: ${label.trim()}.`];
  const f = (focus ?? '').trim();
  if (f) lines.push(`Focus for this run, within your Work style: ${f}`, 'It applies to this run only.');
  lines.push('Do it the way your Work style and your saved procedures say. If there is nothing to do, stop without messaging anyone.');
  // The owner's older instructions keep going out until the owner clears
  // them, even once the job has a focus (a focus a team member asked for
  // must not silence what the owner wrote).
  const old = (legacy ?? '').trim();
  if (old) lines.push('', 'Older instructions the owner gave this schedule:', old);
  return lines.join('\n');
}

/**
 * A former "everyone" schedule (design 3A): it now belongs to Michael, who
 * hands the job to each team member it applies to instead of the scheduler
 * broadcasting it.
 */
export function relayRunBody(label: string, legacy?: string, focus?: string): string {
  const lines = [
    `Scheduled run for the whole team: ${label.trim()}.`,
    'Hand this job to each team member it applies to, with a short request each. If it applies to nobody right now, stop without messaging anyone.'
  ];
  const f = (focus ?? '').trim();
  if (f) lines.push(`Focus for this run, to pass on: ${f}`);
  const old = (legacy ?? '').trim();
  if (old) lines.push('', 'Older instructions the owner gave this schedule:', old);
  return lines.join('\n');
}
