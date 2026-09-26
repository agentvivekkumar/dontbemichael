/**
 * Where an owner's Ask me answer goes (owner, 2026-09-25). Ask me is how the
 * office reaches the owner when it can't decide or do something itself.
 * Michael surfaces the question, but the answer belongs to the agent that
 * raised it: it goes straight to that agent and into its memory notes, and
 * Michael is told so he can unblock the card. When Michael raised it himself
 * (a job no one fits, a technical failure), both are Michael.
 */

export const MICHAEL_ID = 'god';

/**
 * The agent that raised a question: its recorded `raisedBy`, else the card's
 * assignee, else Michael. Only an agent this office knows counts, so a stale
 * or mistyped id falls through instead of sending the answer nowhere.
 */
export function raiserOf(
  entry: { raisedBy?: string },
  task: { assignee?: string },
  knownIds: ReadonlySet<string>
): string {
  for (const id of [entry.raisedBy, task.assignee]) {
    if (id && (id === MICHAEL_ID || knownIds.has(id))) return id;
  }
  return MICHAEL_ID;
}

/** The messages an answer sends: to the raiser (unless that's Michael) and to Michael. */
export function answerMessages(p: {
  raiser: string;
  raiserName: string;
  taskId: string;
  title: string;
  q: string;
  a: string;
}): Array<{ to: string; subject: string; body: string }> {
  const qa = [`Q: ${p.q}`, `A: ${p.a}`];
  if (p.raiser === MICHAEL_ID) {
    return [{
      to: MICHAEL_ID,
      subject: `HUMAN ANSWER on task "${p.title}"`,
      body: [
        `The owner answered the question you raised on task ${p.taskId} ("${p.title}"):`,
        ...qa,
        'It is also on the card, and has been added to your memory notes. Act on it, unblock the card, and continue the work.'
      ].join('\n')
    }];
  }
  return [
    {
      to: p.raiser,
      subject: `OWNER ANSWER to your question on "${p.title}"`,
      body: [
        `The owner answered the question you raised on task ${p.taskId} ("${p.title}"):`,
        ...qa,
        'It has been added to your memory notes. Carry on with the work.'
      ].join('\n')
    },
    {
      to: MICHAEL_ID,
      subject: `HUMAN ANSWER on task "${p.title}"`,
      body: [
        `The owner answered the question ${p.raiserName} raised on task ${p.taskId} ("${p.title}"):`,
        ...qa,
        `It went straight to ${p.raiserName}, and into their memory notes. Unblock the card, and route any follow-up.`
      ].join('\n')
    }
  ];
}

/**
 * A card has at most one open ask: its NEWEST ask, while unanswered and not
 * dismissed (owner, 2026-09-25). A newer ask on the same card replaces an older
 * unanswered one, which then counts as withdrawn: ASK ME never shows it, it can't
 * be answered, and it never holds an agent open. Before this, ASK ME showed only
 * the newest but the older one stayed "open" forever, hidden from the owner.
 */
export interface AskEntry { q?: unknown; a?: unknown; dismissedAt?: unknown }

/** Index of the card's open ask, or -1. */
export function openAskIndex(qa: readonly (AskEntry | null | undefined)[] | undefined): number {
  if (!Array.isArray(qa)) return -1;
  for (let i = qa.length - 1; i >= 0; i--) {
    const e = qa[i];
    if (!e || typeof e.q !== 'string') continue;
    return !e.a && !e.dismissedAt ? i : -1;
  }
  return -1;
}

/** An older ask a newer one on the same card replaced before it was answered. */
export function isReplacedAsk(qa: readonly (AskEntry | null | undefined)[] | undefined, i: number): boolean {
  const e = qa?.[i];
  if (!e || typeof e.q !== 'string' || e.a || e.dismissedAt) return false;
  return openAskIndex(qa) !== i;
}
