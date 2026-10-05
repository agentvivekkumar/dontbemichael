import { answerMessages, cardOfConversation, cardText, isAnswered, isWithdrawn, MICHAEL_ID, openAskIndexes, raiserOf, type AnswerMessage } from './askMeRouting';

/**
 * Michael's open requests from the owner (docs/designs/card-lifecycle.md): an
 * owner's Ask me answer reaches him as a request about its card, and it stays
 * his open work until he replies to it (in_reply_to), the same request and
 * reply loop he runs with the team. Read from the messages that already exist;
 * nothing else is stored.
 */

/** The fields this reads from a hive message. */
export interface MessageLike {
  id: string;
  from: string;
  act: string;
  conversation?: string;
  in_reply_to?: string | null;
  subject?: string;
  created_at: string;
  to?: string;
}

/** Most cards listed in one context block; the rest are counted. */
const LIST_MAX = 20;

export interface OwnerRequest {
  id: string;
  taskId: string;
  subject: string;
  createdAt: string;
}

/**
 * `toMichael`: messages delivered to Michael (his inbox and inbox/.done).
 * `fromMichael`: messages he sent (his outbox/.sent and outbox).
 * Every owner request on a card stays open until Michael replies to it or to
 * a newer one on the same card: a card can hold answers to several questions,
 * and a second answer must not hide the first. A reply settles the card's
 * requests up to it. Oldest first.
 */
export function openOwnerRequests(toMichael: MessageLike[], fromMichael: MessageLike[]): OwnerRequest[] {
  // Only his reply to the owner closes it; a hand-off to a teammate in the
  // same thread is routing, not the closure.
  const replied = new Set(fromMichael.filter((m) => (m.to ?? '').toLowerCase() === 'human').map((m) => m.in_reply_to).filter((id): id is string => !!id));
  const byCard = new Map<string, MessageLike[]>();
  const seen = new Set<string>();
  for (const m of toMichael) {
    if (m.from !== 'human' || m.act !== 'request' || seen.has(m.id)) continue;
    const taskId = cardOfConversation(m.conversation);
    if (!taskId) continue;
    seen.add(m.id);
    byCard.set(taskId, [...(byCard.get(taskId) ?? []), m]);
  }
  const out: OwnerRequest[] = [];
  for (const [taskId, list] of byCard) {
    const settled = list.reduce((at, m) => (replied.has(m.id) && m.created_at > at ? m.created_at : at), '');
    for (const m of list) {
      if (!replied.has(m.id) && m.created_at > settled) out.push({ id: m.id, taskId, subject: m.subject ?? '', createdAt: m.created_at });
    }
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** How Michael's open owner requests read in his context each turn. Null when
 *  there are none, so nothing is added. */
export function ownerRequestsContext(open: OwnerRequest[], now: number): string | null {
  if (!open.length) return null;
  const age = (iso: string): string => {
    const h = Math.max(0, Math.floor((now - Date.parse(iso)) / 3_600_000));
    return h < 1 ? 'under an hour' : h < 48 ? `${h} h` : `${Math.floor(h / 24)} days`;
  };
  return [
    'OPEN REQUESTS FROM THE OWNER. Each is an answer the owner gave on a card. Route the follow-up (hand the card to the same team member or another, or ask the owner again), then close the request with a "done" reply, in_reply_to its id. They stay here until you do.',
    ...open.slice(0, LIST_MAX).map((r) => `- card ${cardText(r.taskId, 60)}: ${cardText(r.subject)} (open ${age(r.createdAt)}, id ${r.id})`),
    ...(open.length > LIST_MAX ? [`- and ${open.length - LIST_MAX} more`] : [])
  ].join('\n');
}

/** The fields this reads from a task card. */
export interface CardLike {
  id: string;
  title?: string;
  status?: string;
  assignee?: string;
  humanQA?: Array<{ q?: string; a?: string; answeredAt?: string; dismissedAt?: string; raisedBy?: string }>;
}

/**
 * Answers the owner gave on a card that is not done, with no owner request to
 * Michael sent on that card since: the launch catch-up's candidates
 * (card-lifecycle.md section 5). Every answered, timed entry counts, not only
 * the newest on a Blocked card, because a card can hold several questions and
 * an answered card often leaves Blocked. catchUpRequests keeps only the
 * answers the app recorded itself.
 */
export function answersWithoutRequest(
  tasks: CardLike[],
  toMichael: MessageLike[]
): Array<{ task: CardLike; q: string; a: string; raisedBy?: string; answeredAt?: string }> {
  const lastRequestAt = new Map<string, string>();
  for (const m of toMichael) {
    if (m.from !== 'human' || m.act !== 'request') continue;
    const taskId = cardOfConversation(m.conversation);
    if (taskId && (!lastRequestAt.has(taskId) || m.created_at > lastRequestAt.get(taskId)!)) lastRequestAt.set(taskId, m.created_at);
  }
  const out: Array<{ task: CardLike; q: string; a: string; raisedBy?: string; answeredAt?: string }> = [];
  for (const t of tasks) {
    if (!t || t.status === 'done' || !Array.isArray(t.humanQA)) continue;
    const sent = lastRequestAt.get(t.id);
    for (const e of t.humanQA) {
      if (!e || typeof e.q !== 'string' || !isAnswered(e) || isWithdrawn(e) || typeof e.answeredAt !== 'string') continue;
      if (sent && sent >= e.answeredAt) continue;
      out.push({ task: t, q: e.q, a: e.a as string, raisedBy: e.raisedBy, answeredAt: e.answeredAt });
    }
  }
  return out;
}

/** How the app records an answer the owner gave on Ask me (security review,
 *  2026-10-03): the card, the answer's time and a digest of its question and
 *  answer. Agents write tasks.json too, so only an answer the app saved itself,
 *  word for word, may be relayed as the owner's. */
export const answerKey = (taskId: string, answeredAt: string, digest: string): string => `${taskId}|${answeredAt}|${digest}`;

/** Digest of an answer's question and answer text (main passes a sha256). */
export type AnswerDigest = (q: string, a: string) => string;

/**
 * The launch catch-up's requests to Michael (card-lifecycle.md section 5):
 * one per stuck answered card whose answer the app recorded. An answer the
 * app has no record of (an agent wrote it into the card) is never relayed.
 */
export function catchUpRequests(
  candidates: Array<{ task: CardLike; q: string; a: string; raisedBy?: string; answeredAt?: string }>,
  recorded: ReadonlySet<string>,
  agents: Record<string, { name?: string }>,
  digest: AnswerDigest
): AnswerMessage[] {
  const known = new Set(Object.keys(agents));
  const out: AnswerMessage[] = [];
  for (const { task, q, a, raisedBy, answeredAt } of candidates) {
    if (!answeredAt || !recorded.has(answerKey(task.id, answeredAt, digest(q, a)))) continue;
    const raiser = raiserOf({ raisedBy }, { assignee: typeof task.assignee === 'string' ? task.assignee : undefined }, known);
    const m = answerMessages({ raiser, raiserName: agents[raiser]?.name ?? raiser, taskId: task.id, title: task.title ?? task.id, q, a }).find((x) => x.to === MICHAEL_ID);
    if (m) out.push(m);
  }
  return out;
}

/** How long an owner request may sit with Michael, in office time, before the
 *  Tasks view says he hasn't moved it (card-lifecycle.md section 3, D4): one
 *  working day. With no office hours known, a working day is 24 hours of an
 *  office day; with hours, it is the length of the work day. */
export const MICHAEL_STALL_MS = 24 * 3_600_000;

/** An office's work hours, 'HH:MM' local (the pack's officeHours.work). */
export interface WorkHours { start: string; end: string }

const minutesOf = (hhmm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null;
};

/** The work day as minutes from midnight, or null when unusable. */
function workWindow(work: WorkHours | undefined): [number, number] | null {
  if (!work) return null;
  const s = minutesOf(work.start);
  const e = minutesOf(work.end);
  return s !== null && e !== null && e > s ? [s, e] : null;
}

const WEEK: readonly string[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * Time between two moments that falls in the office's open hours, in local
 * time. `days` is the office pack's officeHours.days ('mon'...'sun'); an empty
 * list counts every day. `work` limits each day to the work hours; without it
 * the whole day counts. A weekend or a night the office is closed does not
 * count against Michael.
 */
export function workingMsBetween(fromMs: number, toMs: number, days: readonly string[], work?: WorkHours): number {
  if (!(toMs > fromMs)) return 0;
  const open = new Set(days.length ? days : WEEK);
  const window = workWindow(work);
  let total = 0;
  const cursor = new Date(fromMs);
  cursor.setHours(0, 0, 0, 0);
  while (cursor.getTime() < toMs) {
    const day = new Date(cursor);
    cursor.setDate(cursor.getDate() + 1); // handles daylight saving days
    if (!open.has(WEEK[day.getDay()])) continue;
    let start = day.getTime();
    let end = cursor.getTime();
    if (window) {
      start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, window[0]).getTime();
      end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, window[1]).getTime();
    }
    total += Math.max(0, Math.min(end, toMs) - Math.max(start, fromMs));
  }
  return total;
}

/** What a card with an open owner request shows on the Tasks view. */
export function michaelCardState(createdAt: string, now: number, days: readonly string[], work?: WorkHours): 'with' | 'stalled' {
  const at = Date.parse(createdAt);
  if (!Number.isFinite(at)) return 'with';
  const window = workWindow(work);
  const workingDay = window ? (window[1] - window[0]) * 60_000 : MICHAEL_STALL_MS;
  return workingMsBetween(at, now, days, work) > workingDay ? 'stalled' : 'with';
}

/** An owner's change to a card, as Michael hears about it (card-lifecycle.md
 *  section 4): a note, since nothing needs his reply, in the card's
 *  conversation. */
export type OwnerCardChange =
  | { kind: 'closed'; reason?: string }
  | { kind: 'moved'; from: string; to: string };

const STATUS_WORDS: Record<string, string> = { todo: 'To do', doing: 'Doing', blocked: 'Blocked', done: 'Done' };

export function ownerChangeNote(task: { id: string; title?: string }, change: OwnerCardChange): { subject: string; body: string } {
  const card = `card ${cardText(task.id, 60)}${task.title ? ` "${cardText(task.title)}"` : ''}`;
  if (change.kind === 'closed') {
    return {
      subject: `OWNER CLOSED card ${cardText(task.id, 60)}`,
      body: [
        `The owner closed ${card} as Done.${change.reason ? ` Reason: ${change.reason}` : ''}`,
        'This is the owner\'s decision, not finished work. Treat the card as closed: stop work on it and tell whoever has it. Do not reopen it unless the owner asks.'
      ].join('\n')
    };
  }
  return {
    subject: `OWNER MOVED card ${cardText(task.id, 60)} to ${STATUS_WORDS[change.to] ?? change.to}`,
    body: `The owner moved ${card} from ${STATUS_WORDS[change.from] ?? change.from} to ${STATUS_WORDS[change.to] ?? change.to}. Take it from there: check who has it and route the work to match.`
  };
}

/** A card Michael has to tidy: in Blocked with nothing asked (no `issue`), or
 *  holding an open question the wrong way (`issue`). */
export interface StuckCard { id: string; title: string; assignee?: string; issue?: 'ask-off-blocked' | 'several-asks' }

const stuckOf = (t: CardLike, issue?: StuckCard['issue']): StuckCard => ({
  id: t.id,
  title: (t.title ?? t.id).trim(),
  ...(t.assignee ? { assignee: t.assignee } : {}),
  ...(issue ? { issue } : {})
});

/**
 * Blocked cards with nothing asked (card-lifecycle.md section 7): in Blocked,
 * but with no open question for the owner on Ask me and no open owner request
 * to Michael. Blocked means waiting on the owner's answer, so such a card is
 * waiting on nobody. Found 2026-10-03: Michael closed six owner requests and
 * left all six cards Blocked, their next questions never asked.
 */
export function blockedWithNothingAsked(tasks: CardLike[], open: Pick<OwnerRequest, 'taskId'>[]): StuckCard[] {
  const withMichael = new Set(open.map((r) => r.taskId));
  return tasks
    .filter((t) => !!t && t.status === 'blocked' && openAskIndexes(t.humanQA as never).length === 0 && !withMichael.has(t.id))
    .map((t) => stuckOf(t));
}

/**
 * Open questions held the wrong way (owner, 2026-10-04). A question stays on
 * Ask me until the owner answers it or Michael withdraws it, so a card that
 * left Blocked, or that gained a second question, still shows the old one.
 * Michael is told each turn until he moves the card back to Blocked, folds the
 * questions into one, or withdraws what no longer matters.
 */
export function asksToTidy(tasks: CardLike[]): StuckCard[] {
  const out: StuckCard[] = [];
  for (const t of tasks) {
    if (!t) continue;
    const open = openAskIndexes(t.humanQA as never).length;
    if (!open) continue;
    if (t.status !== 'blocked') out.push(stuckOf(t, 'ask-off-blocked'));
    else if (open > 1) out.push(stuckOf(t, 'several-asks'));
  }
  return out;
}

const STUCK_HEADS: Record<NonNullable<StuckCard['issue']> | 'nothing-asked', string> = {
  'nothing-asked': 'BLOCKED CARDS WITH NOTHING ASKED. These cards are in Blocked, but none has a question for the owner on Ask me or an open request from the owner, so nothing is moving them. Blocked means waiting on the owner\'s answer. For each one: if it needs the owner, add the question to its humanQA so it shows on Ask me; if it waits on someone outside the office or on a team member, move it to "waiting" and name who in "waitingOn"; if the work is finished, or the owner decided to stop it, move it to "done".',
  'ask-off-blocked': 'OPEN QUESTIONS ON CARDS OUT OF BLOCKED. Each of these cards left Blocked with a question still open, and the owner still sees it on Ask me until they answer it or you withdraw it. For each one: if you moved the card out of Blocked and the work still needs the answer, move it back to "blocked". If the owner moved it, the card is done, or the question no longer matters, withdraw the question by setting "dismissedAt" (the time) and a short "dismissedReason" on that humanQA entry. Never move a card the owner moved.',
  'several-asks': 'CARDS WITH MORE THAN ONE OPEN QUESTION. The owner sees every one of them on Ask me. Keep one open question per card: fold what still matters into the newest, and withdraw the others by setting "dismissedAt" (the time) and a short "dismissedReason" on each.'
};

/** How those cards read in Michael's context each turn. Null when none. */
export function stuckCardsContext(stuck: StuckCard[]): string | null {
  if (!stuck.length) return null;
  const parts: string[] = [];
  for (const kind of ['nothing-asked', 'ask-off-blocked', 'several-asks'] as const) {
    const cards = stuck.filter((c) => (c.issue ?? 'nothing-asked') === kind);
    if (!cards.length) continue;
    parts.push([
      STUCK_HEADS[kind],
      ...cards.slice(0, LIST_MAX).map((c) => `- card ${cardText(c.id, 60)}: ${cardText(c.title)}${c.assignee ? ` (with ${cardText(c.assignee, 40)})` : ''}`),
      ...(cards.length > LIST_MAX ? [`- and ${cards.length - LIST_MAX} more`] : [])
    ].join('\n'));
  }
  return parts.join('\n\n');
}
