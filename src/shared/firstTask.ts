/**
 * A hire's first task is a card, not a line in the Work style
 * (docs/designs/first-task-card.md). At hire the app adds the card and sends
 * Michael an owner request about it; he hands it out and keeps the card until
 * it is Done. Pure: main builds the card here, tests load it directly.
 */
import type { AgentDefinitionV2 } from './agentDefinition';
import { fillBusiness, teamMemberName } from './teamPlan';
import { swapName } from './hireTemplates';
import { firstTaskSection } from './workStyleText';
import { LEGACY_FIRST_TASKS } from './legacyFirstTasks';

/** One card per hire: a second call, a restart or a rerun of team start finds
 *  it and adds nothing. A rehire is a new agent id, so a new first task. */
export const firstTaskCardId = (agentId: string): string => `first-${agentId}`;

export interface FirstTaskCard {
  id: string;
  title: string;
  description: string;
  status: 'todo';
  dependsOn: string[];
  priority: number;
  createdAt: string;
}

/**
 * The card for a hire from `def`, and the body of the request Michael gets
 * about it. Null when the card has no first task. The ask gets the business
 * filled in and the hire's own name, when they were hired from the card under
 * another one.
 */
export function firstTaskCard(
  def: Pick<AgentDefinitionV2, 'id' | 'character' | 'role' | 'firstTask'>,
  hire: { agentId: string; name?: string },
  business: { name?: string; city?: string },
  now: Date
): { card: FirstTaskCard; body: string } | null {
  if (!def.firstTask) return null;
  const cardName = teamMemberName(def);
  const name = hire.name?.trim() || cardName;
  const fill = (t: string) => swapName(fillBusiness(t, business), cardName, name);
  return firstTaskCardFromText({ agentId: hire.agentId, name, role: def.role }, fill(def.firstTask.title), fill(def.firstTask.ask), now);
}

/**
 * A first task card from its words: the pack's, or a First task the owner had
 * edited in a hire's Work style before first tasks became cards (ship review
 * 2026-10-03, SR2: it becomes a card instead of staying in the Work style).
 */
export function firstTaskCardFromText(
  hire: { agentId: string; name: string; role: string },
  title: string,
  ask: string,
  now: Date,
  /** A hire already on the team (their edited First task), not one joining now. */
  opts: { existing?: boolean } = {}
): { card: FirstTaskCard; body: string } {
  const name = hire.name;
  const card: FirstTaskCard = {
    id: firstTaskCardId(hire.agentId),
    title,
    description: ask,
    status: 'todo',
    dependsOn: [],
    priority: 1,
    createdAt: now.toISOString()
  };
  const body = [
    opts.existing
      ? `${name} (${hire.role}) had a first task in their Work style that the owner set. It is now on the card "${title}":`
      : `${name} (${hire.role}) just joined the team. Their first task is on the card "${title}":`,
    '',
    ask,
    '',
    `Hand it to ${name} (id ${hire.agentId}), then reply done to this request. The card stays yours until the work is done.`
  ].join('\n');
  return { card, body };
}

/** The longest edited First task that becomes a card (the hive:firstTask cap). */
export const FIRST_TASK_EDITED_MAX = 2000;

const same = (a: string, b: string) => a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();

/**
 * The one-time cleanup of agents hired before this (D1): the Work style
 * without its First task, when that section is word for word one of the
 * packs' old first tasks. A renamed manager counts as the packs' "Michael"
 * (the rename rewrote every Work style). Null when there is nothing to take
 * out or the owner edited it; an edited one becomes a card instead (see
 * removeLegacyFirstTasks and first-task-card.md, ship review).
 */
export function withoutLegacyFirstTask(goal: string | undefined, manager?: string): string | null {
  const section = goal ? firstTaskSection(goal) : null;
  if (!section) return null;
  const body = manager?.trim() && manager.trim() !== 'Michael' ? swapName(section.body, manager, 'Michael') : section.body;
  if (!LEGACY_FIRST_TASKS.some((t) => same(t, body))) return null;
  return section.without;
}
