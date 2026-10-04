import { bindingLinesFor, releaseBindings, restoredRoles, returningBindings } from '@shared/hireTemplates';
import { useStore } from '@/store/store';

/**
 * When a bound hire leaves the team, the work bound to them goes back to the
 * teammates it was taken from (owner, 2026-10-03): their "Not for ...; that
 * goes to <Name>." lines come off, on the roster and in the hive registry
 * Michael routes by. Leaving is the owner closing them, or forgetting them
 * from the archived list; a crash or a quit only archives, and keeps the lines.
 * A closed hire can come back, so the lines are kept on them and put back when
 * they do (ship review SR3, 2026-10-03).
 */
export async function releaseBindingsOf(agentId: string): Promise<void> {
  const s = useStore.getState();
  const everyone = [...s.agents, ...s.archivedAgents, ...s.restorableAgents];
  const leaving = everyone.find((a) => a.id === agentId);
  if (!leaving) return;
  // Lines are matched by name: when someone else on the floor now has that
  // name (a new hire took it), the lines are theirs, so nothing is released.
  if (s.agents.some((a) => a.id !== agentId && a.name.trim() === leaving.name.trim())) return;
  const others = everyone.filter((a) => a.id !== agentId && !a.isGod);
  const removed = others.flatMap((a) => bindingLinesFor(leaving.name, a.description).map((line) => ({ id: a.id, line })));
  const patches = releaseBindings(leaving.name, others).map((p) => ({ ...p, goal: others.find((a) => a.id === p.id)?.goal ?? '' }));
  if (!patches.length) return;
  s.updateAgent(agentId, { releasedBindings: removed });
  s.rewriteInstructions(patches);
  await Promise.all(patches.map((p) => window.cth.hivePatchAgentRole(p.id, p.description).catch(() => undefined)));
}

/** A returning hire's lines go back on the teammates still on the team. */
async function restoreBindings(agentId: string, lines: Array<{ id: string; line: string }>): Promise<void> {
  const s = useStore.getState();
  const everyone = [...s.agents, ...s.archivedAgents, ...s.restorableAgents];
  const patches = restoredRoles(lines, everyone.filter((a) => a.id !== agentId)).map((p) => ({ ...p, goal: everyone.find((a) => a.id === p.id)?.goal ?? '' }));
  if (patches.length) s.rewriteInstructions(patches);
  const sent = await Promise.all(patches.map((p) => window.cth.hivePatchAgentRole(p.id, p.description).then((r) => r?.ok !== false, () => false)));
  // The kept lines are the only record of what to put back: they go once the
  // registry has them too. Putting a line back twice adds nothing (restoredRoles).
  if (sent.every(Boolean)) useStore.getState().updateAgent(agentId, { releasedBindings: undefined });
}

/** Watch for a hire coming back onto the floor (returningBindings). */
export function watchReturningBindings(): () => void {
  return useStore.subscribe((state, prev) => {
    // Most store changes are status updates on the same roster: skip them.
    if (state.agents === prev.agents || (state.agents.length <= prev.agents.length && state.agents.every((a, i) => prev.agents[i]?.id === a.id))) return;
    for (const r of returningBindings({ agents: prev.agents, archived: prev.archivedAgents, restorable: prev.restorableAgents }, state.agents)) {
      void restoreBindings(r.id, r.lines);
    }
  });
}
