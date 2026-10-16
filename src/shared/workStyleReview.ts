/**
 * The instructions the app wrote from a work style, held for the owner to read
 * before they are saved (TODOS.md, "Show the rewritten instructions before
 * saving a work style"). Hire and Edit Agent used to save the rewrite straight
 * away, so the owner never saw what the team member would follow, nor that
 * the plain rewrite had answered when Claude could not.
 *
 * A review stands only for the exact work style, name and title it was
 * written from: change any of them and the instructions are written again,
 * so what is saved is always what was shown.
 */
export interface WorkStyleReview {
  key: string;
  text: string;
  /** 'rules' when the hidden call could not answer and the plain rewrite did. */
  source: 'ai' | 'rules';
}

/** What a review was written from: the work style and the names it carries. */
export function reviewKey(workStyle: string, ctx: { name: string; title?: string }): string {
  return JSON.stringify([workStyle.trim(), ctx.name.trim(), (ctx.title ?? '').trim()]);
}

/** The review, when it still stands for this key; null when it must be written again. */
export function standingReview(review: WorkStyleReview | null, key: string): WorkStyleReview | null {
  return review && review.key === key && review.text.trim() ? review : null;
}

/** A convert answer held for review, or null when there is nothing to show. */
export function reviewOf(key: string, res: { text?: string; source?: string } | null | undefined): WorkStyleReview | null {
  const text = res?.text?.trim() ?? '';
  if (!text) return null;
  return { key, text, source: res?.source === 'ai' ? 'ai' : 'rules' };
}
