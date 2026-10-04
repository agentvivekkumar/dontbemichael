import { starterMissionsFor } from '@shared/starterJobs';
import { GOD_ALIAS } from '@shared/missions';
import { useStore } from '@/store/store';

/**
 * Give a team member hired from a pack card that card's starter jobs
 * (src/shared/starterJobs.ts): its schedules, each with its focus area. Run
 * after a hire and at team start; a job it already has by name is skipped, so
 * running it twice adds nothing. `sourceCard` is "<businessType>/<card id>".
 * `paused` adds them switched off, as a closed hire's schedules are. False
 * when a job could not be read or saved, so a caller can try again later.
 */
export async function seedStarterJobs(sourceCard: string | undefined, agentId: string, opts: { paused?: boolean } = {}): Promise<boolean> {
  if (!sourceCard) return true;
  const [type, defId] = sourceCard.split('/');
  if (!type || !defId) return true;
  try {
    const { packs, core } = await window.cth.packsList();
    const pack = [...packs.map((p) => p.pack), core].find((p) => p?.businessType === type);
    if (!pack?.starterMissions?.length) return true;
    const existing = await window.cth.listMissions();
    const godId = useStore.getState().agents.find((a) => a.isGod)?.id ?? GOD_ALIAS;
    const stamp = Date.now().toString(36);
    const add = starterMissionsFor(pack.starterMissions, pack.officeHours, defId, agentId, existing, godId, (i) => `m_${stamp}_${agentId}_${i}`);
    let ok = true;
    for (const m of add) {
      const saved = await window.cth.upsertMission(opts.paused ? { ...m, enabled: false } : m).then((r) => (r as { ok?: boolean } | undefined)?.ok !== false, () => false);
      ok = ok && saved;
    }
    return ok;
  } catch {
    // The hire stands; the owner can add the job on the Access tab.
    return false;
  }
}
