/**
 * The office's own record of who it is: `<harnessHome>/office.json`.
 *
 * WHY THIS EXISTS. Setup used to derive everything from what the owner typed:
 * the team's folders are `~/Documents/<Business name>/<Folder>`. After a
 * reinstall (or a new data folder, as on 2026-09-24) setup runs again, and a
 * business name typed slightly differently pointed the team at new, empty
 * folders while the real office sat untouched in the home folder. The office
 * folder is the one thing that survives a reinstall, so the office describes
 * itself there, and setup recognises it by folder, never by name.
 *
 * The record is written by config:update only when a save changes the office's
 * own fields (touchesOffice), never when a save only switches offices, and is
 * backfilled at launch (backfillOfficeRecord) only when the config's team
 * matches the office's registry. An office without one is described from its
 * hive registry instead (`officeRecordFromRegistry`).
 *
 * Pure data and pure functions; the file I/O lives in src/main/officeFile.ts.
 */
import type { TeamPlan } from './teamPlan';

export interface OfficeRecord {
  version: 1;
  businessName?: string;
  businessCity?: string;
  businessType?: string;
  /** The shared Office folder (Michael's). Absent when only the registry was
   *  available and no Office folder could be told apart from the team's. */
  officeFolder?: string;
  /** Each team member and the folder it works in. Michael is not listed. */
  team: Array<{ agentId: string; folder: string }>;
}

/** The fields of the app config a record is built from. */
export interface OfficeConfigFields {
  onboardingComplete?: boolean;
  harnessHome?: string | null;
  businessName?: string;
  businessCity?: string;
  businessType?: string;
  officeFolder?: string;
  businessTeam?: Array<{ agentId: string; folder: string }>;
}

/** The fields of a hive registry entry a record reads. Its `archived` flag is
 *  deliberately not among them: see officeRecordFromRegistry. */
export interface RegistryAgentFields {
  id?: string;
  cwd?: string;
}

/** The god agent's registry id. It works in the hive, not in a business folder. */
const GOD_ID = 'god';

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;

function cleanTeam(v: unknown): Array<{ agentId: string; folder: string }> {
  if (!Array.isArray(v)) return [];
  const out: Array<{ agentId: string; folder: string }> = [];
  const seen = new Set<string>();
  for (const m of v) {
    const agentId = str((m as { agentId?: unknown })?.agentId);
    const folder = str((m as { folder?: unknown })?.folder);
    if (!agentId || !folder || seen.has(agentId)) continue;
    seen.add(agentId);
    out.push({ agentId, folder });
  }
  return out;
}

/** A record read from disk, or null when it is not one. Never throws. */
export function parseOfficeRecord(v: unknown): OfficeRecord | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (o.version !== 1) return null;
  return {
    version: 1,
    businessName: str(o.businessName),
    businessCity: str(o.businessCity),
    businessType: str(o.businessType),
    officeFolder: str(o.officeFolder),
    team: cleanTeam(o.team)
  };
}

/** The record the config describes, or null before setup has finished. */
export function officeRecordFromConfig(cfg: OfficeConfigFields): OfficeRecord | null {
  if (!cfg.onboardingComplete || !str(cfg.harnessHome)) return null;
  return {
    version: 1,
    businessName: str(cfg.businessName),
    businessCity: str(cfg.businessCity),
    businessType: str(cfg.businessType),
    officeFolder: str(cfg.officeFolder),
    team: cleanTeam(cfg.businessTeam)
  };
}

/** Last path segment, for either separator. */
function baseName(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).pop() ?? p;
}

/** The deepest folder every path sits in, or undefined when they share only the root. */
function commonParent(paths: string[]): string | undefined {
  if (paths.length === 0) return undefined;
  const sep = paths[0].includes('\\') && !paths[0].includes('/') ? '\\' : '/';
  const split = paths.map((p) => p.split(/[\\/]/));
  const parent = split.map((parts) => parts.slice(0, -1));
  const first = parent[0];
  let n = first.length;
  for (const parts of parent.slice(1)) {
    let i = 0;
    while (i < n && i < parts.length && parts[i] === first[i]) i++;
    n = i;
  }
  const joined = first.slice(0, n).join(sep);
  return joined && joined !== sep && n > 1 ? joined : undefined;
}

/**
 * Describe an office that has no office.json from its hive registry: every
 * team member and the folder it works in. `archived` there only means the
 * member's terminal was closed (every agent is archived when the app quits),
 * so it does not leave the team. The business name is a best
 * guess (the folder the team's folders share), used only to pre-fill; the
 * folders themselves come from the registry, which is what matters.
 */
export function officeRecordFromRegistry(
  agents: Record<string, RegistryAgentFields> | undefined
): OfficeRecord | null {
  const team: Array<{ agentId: string; folder: string }> = [];
  for (const [key, a] of Object.entries(agents ?? {})) {
    const agentId = str(a?.id) ?? key;
    const folder = str(a?.cwd);
    if (agentId === GOD_ID || !folder) continue;
    team.push({ agentId, folder });
  }
  if (team.length === 0) return null;
  const parent = commonParent(team.map((m) => m.folder));
  return {
    version: 1,
    businessName: parent ? baseName(parent) : undefined,
    officeFolder: undefined,
    team
  };
}

/** Joins a folder name onto a parent, keeping the parent's separator. */
function joinPath(parent: string, name: string): string {
  const sep = parent.includes('\\') && !parent.includes('/') ? '\\' : '/';
  return parent.endsWith(sep) ? parent + name : parent + sep + name;
}

/**
 * The setup plan that continues this office exactly as recorded: the same team
 * in the same folders, whatever the owner would type as the business name. An
 * office with no recorded Office folder gets one beside the team's folders.
 */
export function teamPlanFromRecord(rec: OfficeRecord | null | undefined): TeamPlan {
  if (!rec || rec.team.length === 0) return { ok: false };
  const parent = commonParent(rec.team.map((m) => m.folder));
  const office = rec.officeFolder ?? (parent ? joinPath(parent, 'Office') : undefined);
  if (!office) return { ok: false };
  const folders = [office];
  for (const m of rec.team) if (!folders.includes(m.folder)) folders.push(m.folder);
  return { ok: true, office, team: rec.team.map((m) => ({ ...m })), folders };
}

/** True when two records describe the same office, so an unchanged one is not rewritten. */
export function sameOfficeRecord(a: OfficeRecord | null, b: OfficeRecord | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Config fields that describe the office. Only a save that changes one of
 *  these may rewrite office.json: the fields are global, not per office, so a
 *  save that only switches offices (harnessHome) must never write the previous
 *  office's description into the new one (2026-09-24 review). */
export const OFFICE_FIELDS = [
  'onboardingComplete', 'businessName', 'businessCity', 'businessType', 'officeFolder', 'businessTeam'
] as const;

export function touchesOffice(patch: unknown): boolean {
  if (!patch || typeof patch !== 'object') return false;
  return OFFICE_FIELDS.some((k) => k in (patch as Record<string, unknown>));
}

/**
 * Whether the config's team is this office's team: every member is in the
 * office's registry, working in the same folder. The launch backfill writes a
 * record only then, so an install with several offices never labels one office
 * with another's team. `caseInsensitive` for macOS and Windows, whose folder
 * names ignore case.
 */
export function configMatchesRegistry(
  cfg: OfficeConfigFields,
  agents: Record<string, RegistryAgentFields> | undefined,
  caseInsensitive: boolean
): boolean {
  const team = cleanTeam(cfg.businessTeam);
  if (team.length === 0 || !agents) return false;
  const norm = (p: string) => {
    const t = p.replace(/[\\/]+$/, '');
    return caseInsensitive ? t.toLowerCase() : t;
  };
  return team.every((m) => {
    const cwd = str(agents[m.agentId]?.cwd);
    return !!cwd && norm(cwd) === norm(m.folder);
  });
}
