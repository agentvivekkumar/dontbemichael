import { starterMissionsFor } from '@shared/starterJobs';
import { GOD_ALIAS } from '@shared/missions';
import { useStore } from '@/store/store';

/**
 * Give a team member hired from a pack card that card's starter jobs
 * (src/shared/starterJobs.ts): its schedules, each with its focus area. Run
 * after a hire and at team start; a job it already has by name is skipped, so
 * running it twice adds nothing. `sourceCard` is "<businessType>/<card id>".
 */
export async function seedStarterJobs(sourceCard: string | undefined, agentId: string): Promise<void> {
  if (!sourceCard) return;
  const [type, defId] = sourceCard.split('/');
  if (!type || !defId) return;
  try {
    const { packs, core } = await window.cth.packsList();
    const pack = [...packs.map((p) => p.pack), core].find((p) => p?.businessType === type);
    if (!pack?.starterMissions?.length) return;
    const existing = await window.cth.listMissions();
    const godId = useStore.getState().agents.find((a) => a.isGod)?.id ?? GOD_ALIAS;
    const stamp = Date.now().toString(36);
    const add = starterMissionsFor(pack.starterMissions, pack.officeHours, defId, agentId, existing, godId, (i) => `m_${stamp}_${agentId}_${i}`);
    for (const m of add) await window.cth.upsertMission(m).catch(() => undefined);
  } catch { /* the hire stands; the owner can add the job on the Access tab */ }
}
