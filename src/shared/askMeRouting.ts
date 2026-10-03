/**
 * Where an owner's Ask me answer goes (owner, 2026-09-25). Ask me is how the
 * office reaches the owner when it can't decide or do something itself.
 * Michael surfaces the question, but the answer belongs to the agent that
 * raised it: it goes to that agent and into its memory notes, and Michael
 * gets it as a request to route the follow-up. When Michael raised it himself
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

/** The conversation an owner's answer opens with Michael for a card, so his
 *  reply (in_reply_to) and the card can always be matched up. */
export function cardConversation(taskId: string): string {
  return `card:${taskId}`;
}

/** The card a conversation is about, if it is one opened by cardConversation. */
export function cardOfConversation(conversation: string | undefined): string | undefined {
  return conversation?.startsWith('card:') ? conversation.slice(5) || undefined : undefined;
}

/** One message an answer sends. */
export interface AnswerMessage {
  to: string;
  act: 'request' | 'inform';
  subject: string;
  body: string;
  conversation?: string;
  requires_reply?: boolean;
}

/**
 * The messages an answer sends (docs/designs/card-lifecycle.md): Michael gets a
 * REQUEST about the card, so the answer is his open work until he closes it
 * with done; it used to be an inform, a note he could read and set aside, and
 * answered cards stalled in Blocked (owner, 2026-10-02). The team member who
 * raised the question gets the answer as a note: Michael routes the follow-up,
 * to them or someone else.
 */
/** Card text an agent wrote, as one short line: it goes into messages that
 *  come from the owner and into Michael's context, so it can never pass for a
 *  new line of instructions. */
export function cardText(s: string | undefined, max = 120): string {
  const one = (s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

export function answerMessages(p: {
  raiser: string;
  raiserName: string;
  taskId: string;
  title: string;
  q: string;
  a: string;
}): AnswerMessage[] {
  const title = cardText(p.title);
  // The card id comes from the ledger agents write, so it is cleaned like the title.
  const id = cardText(p.taskId, 60);
  const qa = [`Q: ${p.q}`, `A: ${p.a}`];
  const forMichael: AnswerMessage = {
    to: MICHAEL_ID,
    act: 'request',
    requires_reply: true,
    conversation: cardConversation(p.taskId),
    subject: `OWNER ANSWER on card ${id}: ${title}`.slice(0, 200),
    body: [
      p.raiser === MICHAEL_ID
        ? `The owner answered the question you raised on card ${id} ("${title}"):`
        : `The owner answered the question ${p.raiserName} raised on card ${id} ("${title}"):`,
      ...qa,
      p.raiser === MICHAEL_ID
        ? 'It is on the card and in your memory notes.'
        : `${p.raiserName} has it as a note and in their memory notes.`,
      'Route the follow-up: hand the card to the same team member or another, or ask the owner again. Then close this request with a "done" reply (in_reply_to this message). It stays open until you do.'
    ].join('\n')
  };
  if (p.raiser === MICHAEL_ID) return [forMichael];
  return [
    {
      to: p.raiser,
      act: 'inform',
      subject: `OWNER ANSWER to your question on "${title}"`,
      body: [
        `The owner answered the question you raised on card ${id} ("${title}"):`,
        ...qa,
        'It has been added to your memory notes. Michael will route the follow-up.'
      ].join('\n')
    },
    forMichael
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

/** The renderer's humanQA merged onto the card's list on disk: entry by entry
 *  while the question is the same, the disk entry where it is not, and every
 *  entry added on disk since the renderer read the card. */
export function mergeHumanQA(onDisk: unknown[], incoming: unknown[]): unknown[] {
  const qOf = (e: unknown): unknown => (e && typeof e === 'object' ? (e as { q?: unknown }).q : undefined);
  const merged = incoming.map((e, i) => (i < onDisk.length && qOf(onDisk[i]) !== qOf(e) ? onDisk[i] : e));
  return [...merged, ...onDisk.slice(incoming.length)];
}
