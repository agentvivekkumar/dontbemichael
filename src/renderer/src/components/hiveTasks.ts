import { openAskIndex } from '@shared/askMeRouting';

/* The hive task ledger as the renderer reads it: the card types, the open
 * question rule and the one parser every reader goes through. Plain TypeScript
 * with no UI, so the shared Needs you feed (shell/useNeedsYou.ts) and its tests
 * can load it. TasksKanban.tsx re-exports all of it. */

/** A card on the task kanban. Mirrors HiveTask in the main/preload process —
 *  re-declared locally so the renderer doesn't reach into the preload package
 *  (same convention as store/config.ts). */
export interface HumanQA {
  q: string;
  a?: string;
  askedAt?: string;
  answeredAt?: string;
  /** Set when the human dismisses the ask from the ASK ME board WITHOUT
   *  answering — the question stays on the card (history is preserved) but
   *  openQuestion() stops returning it, so the card leaves ASK ME. */
  dismissedAt?: string;
  /** The agent whose work needs the answer, and which learns from it; "god"
   *  when Michael raised it himself. */
  raisedBy?: string;
}

export interface HiveTask {
  id: string;
  title: string;
  description?: string;
  /** The running notes agents keep on a card (Michael is told the owner reads them). */
  notes?: string;
  assignee?: string;
  status: 'todo' | 'doing' | 'waiting' | 'blocked' | 'done';
  /** Who a Waiting card waits on, in a few words (Michael writes it). */
  waitingOn?: string;
  dependsOn: string[];
  priority: number;
  createdAt: string;
  /** First-class human feedback: the god appends {q} when a card needs the
   *  human; the ASK ME view fills in {a}. Full history stays on the card. */
  humanQA?: HumanQA[];
  /** Done by the owner's decision rather than finished work (card-lifecycle.md
   *  D2): shown as "Closed by owner". */
  closedBy?: 'owner';
  closedReason?: string;
}

/** The card's currently open question for the human, if any. An entry the human
 *  dismissed (dismissedAt) counts as resolved, same as an answered one. */
export function openQuestion(t: HiveTask): HumanQA | undefined {
  // Only the newest ask can be open; an older unanswered one was replaced by it
  // (askMeRouting.ts openAskIndex, owner 2026-09-25).
  const i = openAskIndex(t.humanQA);
  return i >= 0 ? t.humanQA![i] : undefined;
}

/** Waiting on the human = blocked with an unanswered question on the card. */
export function waitsOnHuman(t: HiveTask): boolean {
  return t.status === 'blocked' && !!openQuestion(t);
}

export type TaskStatus = HiveTask['status'];

/** Deterministic fallback id derived from a task's content (djb2 → base36).
 *  Used for tasks lacking a valid string id so re-parsing tasks.json on every
 *  5s poll yields the SAME id — no React key churn / card remount. Unlike
 *  shortId() (random, for brand-new tasks), this never changes across polls. */
function stableId(seed: string): string {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = (((h << 5) + h) ^ seed.charCodeAt(i)) | 0;
  return `t-${(h >>> 0).toString(36)}`;
}

/** Normalize whatever hive:tasks returns into a typed task array. The god
 *  writes this file by hand — every field except the shape itself is optional
 *  in practice, so EVERY consumer must go through this (exported for the
 *  detail overlay; a raw card without dependsOn once crashed it). */
export function parseTasks(raw: unknown): HiveTask[] {
  const list = (raw && typeof raw === 'object' && Array.isArray((raw as { tasks?: unknown }).tasks))
    ? (raw as { tasks: unknown[] }).tasks
    : [];
  return list
    .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
    .map((t, i) => ({
      id: typeof t.id === 'string' && t.id
        ? t.id
        : stableId(`${typeof t.title === 'string' ? t.title : ''}|${typeof t.createdAt === 'string' ? t.createdAt : ''}|${i}`),
      title: typeof t.title === 'string' ? t.title : '(untitled)',
      // The app writes "description" (a Slack or webhook request); agents keep
      // their running "notes" (owner, 2026-10-01: the detail showed neither on
      // most cards). The detail shows both.
      description: typeof t.description === 'string' ? t.description : undefined,
      notes: typeof t.notes === 'string' ? t.notes : undefined,
      assignee: typeof t.assignee === 'string' ? t.assignee : undefined,
      status: (['todo', 'doing', 'waiting', 'blocked', 'done'] as const).includes(t.status as TaskStatus)
        ? (t.status as TaskStatus) : 'todo',
      waitingOn: typeof t.waitingOn === 'string' && t.waitingOn.trim() ? t.waitingOn.trim() : undefined,
      dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn.filter((d): d is string => typeof d === 'string') : [],
      priority: typeof t.priority === 'number' ? t.priority : 3,
      createdAt: typeof t.createdAt === 'string' ? t.createdAt : new Date().toISOString(),
      humanQA: Array.isArray(t.humanQA)
        ? (t.humanQA as unknown[])
          .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object' && typeof (e as { q?: unknown }).q === 'string')
          // Every field an entry carries survives the parse (raisedBy routes the
          // answer; Slack options and thread ids ride along). An answer writes
          // these entries back, so a field dropped here was erased from disk
          // (found 2026-10-02).
          .map((e) => ({
            ...e,
            q: e.q as string,
            a: typeof e.a === 'string' ? e.a : undefined,
            askedAt: typeof e.askedAt === 'string' ? e.askedAt : undefined,
            answeredAt: typeof e.answeredAt === 'string' ? e.answeredAt : undefined,
            // Preserve a dismissal across the 5s re-parse, else the card would
            // resurface on the next poll (openQuestion would see it as open).
            dismissedAt: typeof e.dismissedAt === 'string' ? e.dismissedAt : undefined,
            raisedBy: typeof e.raisedBy === 'string' ? e.raisedBy : undefined
          }))
        : undefined,
      closedBy: t.closedBy === 'owner' ? 'owner' as const : undefined,
      closedReason: typeof t.closedReason === 'string' ? t.closedReason : undefined
    }));
}
