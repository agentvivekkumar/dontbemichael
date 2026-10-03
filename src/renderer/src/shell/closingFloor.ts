/**
 * Closing time on the floor (docs/designs/closing-floor.md): a person who has
 * gone home (confirmed, or the owner closed without them) is gone. Their desk
 * goes dark, they leave the pod's chip and card, and nothing opens them in any
 * view until closing is cancelled (1A, 2A, 5A). Michael is never in the list:
 * he closes the office last (3A). Plain TypeScript, so tests load it directly.
 */

/** Who in a pod is still at work. */
export function stillIn<T extends { id: string }>(members: T[], gone: ReadonlySet<string>): T[] {
  return gone.size ? members.filter((m) => !gone.has(m.id)) : members;
}

/** Whether a person can be opened right now. */
export function canOpen(id: string, gone: readonly string[]): boolean {
  return !gone.includes(id);
}

/** The right column once the open person has gone home (4A): Needs you while
 *  anything waits on the owner, else closed. Null when nothing changes. */
export function columnAfterGoneHome(
  rightColumn: 'closed' | 'board' | 'person',
  selectedId: string | null,
  gone: readonly string[],
  locked: boolean
): 'closed' | 'board' | null {
  if (rightColumn !== 'person' || !selectedId || !gone.includes(selectedId)) return null;
  return locked ? 'board' : 'closed';
}
