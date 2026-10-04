import { useStore } from '@/store/store';

/**
 * A First task the owner typed into a Work style, at hire or in Edit, goes to
 * Michael as a first task card (first-task-card.md SR5); the instructions
 * leave it out. When the card cannot be made, the words go back into the
 * instructions under "First task:", as the one-time cleanup keeps them, so
 * nothing the owner typed is lost (Codex adversarial review, 2026-10-04).
 */
export async function sendTypedFirstTask(
  sourceCard: string | undefined,
  agentId: string,
  name: string,
  edited: { ask: string; role?: string; existing: boolean }
): Promise<void> {
  const res = await window.cth.hiveFirstTask(sourceCard, agentId, name, edited).catch(() => null);
  if (res?.ok) return;
  const s = useStore.getState();
  const agent = [...s.agents, ...s.archivedAgents, ...s.restorableAgents].find((a) => a.id === agentId);
  if (!agent) return;
  s.updateAgent(agentId, { goal: `${(agent.goal ?? '').trim()}\n\nFirst task: ${edited.ask}`.trim() });
}
