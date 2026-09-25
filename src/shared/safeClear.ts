/**
 * Clearing a team member's conversation without losing work (owner,
 * 2026-09-25). A business product can't trade the owner's work for tokens, so
 * a clear happens only when it's worth it, only when it's safe, after the agent
 * has written a handoff, and it can always be undone.
 *
 *  - Worth it: the conversation is large and has sat idle long enough that its
 *    prompt cache has gone cold, so its next message would reread it all at
 *    full price anyway.
 *  - Safe: nothing is open for it (cards, inbox, replies it's waiting on, Ask me
 *    questions it raised), and it isn't paused, on hold or busy.
 *  - Handoff: the agent writes what's unfinished to memory/handoff.md first; the
 *    new conversation starts with it.
 *  - Undo: Claude Code keeps the old conversation, and the app can restart the
 *    agent into it.
 * Michael is never cleared: he holds the picture of the whole floor.
 *
 * Pure: the facts come from main (safeClearer.ts), which does the typing.
 */

/** Below this, a conversation is cheap enough to keep as it is. */
export const CLEAR_MIN_TOKENS = 50_000;
/** Idle this long, the prompt cache has gone cold (1 hour on a subscription is
 *  the longer case; 30 minutes is the starting point to measure). */
export const CLEAR_IDLE_MS = 30 * 60_000;
/** After asking for a handoff, give up if none arrives in this long. */
export const HANDOFF_TIMEOUT_MS = 10 * 60_000;
/** After the handoff is written, wait this long for the agent to go quiet. */
export const HANDOFF_SETTLE_MS = 20_000;

export interface ClearFacts {
  isGod: boolean;
  isAssistant: boolean;
  /** Claude Code is the engine this can type `/clear` into. */
  isClaude: boolean;
  held: boolean;
  paused: boolean;
  contextTokens: number;
  /** Since the agent last printed anything or last hit a hook. */
  idleMs: number;
  /** Task cards assigned to it that aren't done. */
  openCards: number;
  /** Messages waiting in its inbox. */
  inbox: number;
  /** Messages it sent that asked for a reply and haven't had one. */
  awaitingReplies: number;
  /** Ask me questions it raised that the owner hasn't answered. */
  openQuestions: number;
}

/** Why an agent can't be cleared right now, or null when it can. */
export function clearBlocker(f: ClearFacts, idleNeededMs = CLEAR_IDLE_MS): string | null {
  if (f.isGod) return 'michael';
  if (f.isAssistant) return 'assistant';
  if (!f.isClaude) return 'engine';
  if (f.held || f.paused) return 'held';
  if (f.contextTokens < CLEAR_MIN_TOKENS) return 'small';
  if (f.idleMs < idleNeededMs) return 'active';
  if (f.openCards > 0) return 'open-card';
  if (f.inbox > 0) return 'inbox';
  if (f.awaitingReplies > 0) return 'awaiting-reply';
  if (f.openQuestions > 0) return 'open-question';
  return null;
}

/** What the agent is asked before its conversation is cleared. */
export function handoffRequest(handoffPath: string, memoryInboxPath: string): string {
  return [
    'Fresh start coming: you have been idle with nothing open, so the app will clear your conversation to keep things fast.',
    `First, if anything is unfinished or someone may follow up with you about recent work, write it to ${handoffPath}: what it is, where it stands, and where the files are. If nothing is, write "Nothing open." there.`,
    `Add any lasting lessons to ${memoryInboxPath} as usual. Then stop, and don't start anything else.`
  ].join(' ');
}

/** How the new conversation is given the handoff, once. */
export function handoffContext(text: string): string {
  return `HANDOFF FROM YOUR PREVIOUS CONVERSATION. You wrote this just before your conversation was cleared; pick up anything it says is open.\n${text.trim()}`;
}
