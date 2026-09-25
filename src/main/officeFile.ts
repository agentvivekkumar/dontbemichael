/**
 * `<harnessHome>/office.json`, the office's own record (src/shared/officeRecord.ts).
 *
 * Plain node:fs, no electron import, so it tests as a node module.
 */
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import {
  configMatchesRegistry,
  officeRecordFromConfig,
  officeRecordFromRegistry,
  parseOfficeRecord,
  sameOfficeRecord,
  type OfficeConfigFields,
  type OfficeRecord,
  type RegistryAgentFields
} from '../shared/officeRecord';
import { homeFolderStatus } from './homeFolder';
import { OFFICE_FOLDER } from './agentFolders';

export function officeRecordPath(home: string): string {
  return join(home, 'office.json');
}

/** The record in this office folder, or null when there is none (or it is unreadable). */
export function readOfficeRecord(home: string): OfficeRecord | null {
  try {
    const p = officeRecordPath(home);
    if (!existsSync(p)) return null;
    return parseOfficeRecord(JSON.parse(readFileSync(p, 'utf8')));
  } catch {
    return null;
  }
}

/** Write the record: temp file then rename, so a crash never leaves half a file. */
export function writeOfficeRecord(home: string, rec: OfficeRecord): void {
  const p = officeRecordPath(home);
  const tmp = `${p}.tmp`;
  try {
    mkdirSync(home, { recursive: true });
    writeFileSync(tmp, JSON.stringify(rec, null, 2), 'utf8');
    renameSync(tmp, p);
  } catch (e) {
    try { rmSync(tmp, { force: true }); } catch { /* noop */ }
    throw e;
  }
}

/**
 * Keep office.json in step with the config: written when setup has finished and
 * the office's description changed, left alone otherwise. Returns whether it
 * wrote. Never throws: a record that cannot be saved must not break a config save.
 */
export function syncOfficeRecord(cfg: OfficeConfigFields): boolean {
  const rec = officeRecordFromConfig(cfg);
  const home = cfg.harnessHome;
  if (!rec || !home) return false;
  // A save that switches offices only (harnessHome) never gets here: callers
  // sync on saves that touch the office's own fields (touchesOffice).
  // Only an office that exists gets a record. Setup makes the home folder
  // before it saves, and a missing office must not be recreated as a stray file.
  if (!existsSync(home)) return false;
  try {
    if (sameOfficeRecord(readOfficeRecord(home), rec)) return false;
    writeOfficeRecord(home, rec);
    return true;
  } catch (e) {
    console.error('[office] could not save office.json:', e);
    return false;
  }
}

/**
 * At launch: give an office set up before office.json existed its record, but
 * only when the config's team really is this office's team (its registry has
 * each member in the same folder). Several offices share one config, so
 * without that check a switch between them could label one with another's team.
 */
export function backfillOfficeRecord(cfg: OfficeConfigFields): boolean {
  const home = cfg.harnessHome;
  if (!home || !existsSync(home) || readOfficeRecord(home)) return false;
  const caseInsensitive = process.platform === 'darwin' || process.platform === 'win32';
  if (!configMatchesRegistry(cfg, readRegistryAgents(home), caseInsensitive)) return false;
  return syncOfficeRecord(cfg);
}

function readRegistryAgents(home: string): Record<string, RegistryAgentFields> | undefined {
  try {
    const p = join(home, 'hive', 'registry.json');
    if (!existsSync(p)) return undefined;
    const reg = JSON.parse(readFileSync(p, 'utf8')) as { agents?: unknown };
    return reg.agents && typeof reg.agents === 'object'
      ? (reg.agents as Record<string, RegistryAgentFields>)
      : undefined;
  } catch {
    return undefined;
  }
}

export interface FoundOffice {
  path: string;
  hasOffice: boolean;
  /** How the office describes itself, or null when there is no team to continue. */
  record: OfficeRecord | null;
  /** Where the record came from: its own file, or its hive registry. */
  source: 'file' | 'registry' | null;
}

/** Folders an office record may never send an agent into, whatever it says:
 *  the disk root, the home folder itself, and the places that hold keys and
 *  app settings. A record is a file in a folder that could have been copied or
 *  synced from elsewhere, so its folders are checked before setup offers them. */
function isUsableTeamFolder(folder: string, home = homedir()): boolean {
  if (!isAbsolute(folder)) return false;
  // Follow links: a folder that is a link into ~/.ssh is ~/.ssh.
  const real = (p: string) => { try { return realpathSync(resolve(p)); } catch { return resolve(p); } };
  const f = real(folder);
  const h = real(home);
  if (f === resolve(sep) || f === h) return false;
  for (const kept of ['.ssh', '.claude', '.config', '.gnupg', 'Library']) {
    const k = join(h, kept);
    if (f === k || f.startsWith(k + sep)) return false;
  }
  return true;
}

/** The deepest folder that contains every path's parent, or undefined. */
function commonDir(paths: string[]): string | undefined {
  if (paths.length === 0) return undefined;
  let dir = dirname(paths[0]);
  while (!paths.every((p) => p === dir || p.startsWith(dir + sep))) {
    const up = dirname(dir);
    if (up === dir) return undefined;
    dir = up;
  }
  return dir;
}

function isFolder(p: string): boolean {
  try { return statSync(p).isDirectory(); } catch { return false; }
}

/** Only usable folders, and for an office that never recorded its Office folder,
 *  the one that is already there beside the team's folders (Documents/<Business>/Office). */
function checkedRecord(rec: OfficeRecord): OfficeRecord {
  const team = rec.team.filter((m) => isUsableTeamFolder(m.folder));
  let officeFolder = rec.officeFolder && isUsableTeamFolder(rec.officeFolder) ? rec.officeFolder : undefined;
  if (!officeFolder) {
    officeFolder = team.map((m) => join(dirname(m.folder), OFFICE_FOLDER)).find(isFolder);
  }
  // With no Office folder to go on, the team's folders must share a business
  // folder of their own. Sharing only the home folder (hires in unrelated
  // places) is not an office to continue: it would put Michael's Office in ~
  // and name the business after the user account.
  if (!officeFolder) {
    const parents = new Set(team.map((m) => dirname(resolve(m.folder))));
    const one = parents.size === 1 ? [...parents][0] : undefined;
    const shared = one ?? commonDir(team.map((m) => resolve(m.folder)));
    if (!shared || !isUsableTeamFolder(shared)) return { ...rec, officeFolder: undefined, team: [] };
  }
  return { ...rec, officeFolder, team };
}

/** What is in this folder: an office, and if so which one and which team. */
export function findOffice(home: string): FoundOffice {
  const found = findOfficeUnchecked(home);
  return found.record ? { ...found, record: checkedRecord(found.record) } : found;
}

function findOfficeUnchecked(home: string): FoundOffice {
  const st = homeFolderStatus(home);
  if (!st.hasOffice) return { path: home, hasOffice: false, record: null, source: null };
  const fromFile = readOfficeRecord(home);
  if (fromFile && fromFile.team.length > 0) return { path: home, hasOffice: true, record: fromFile, source: 'file' };
  const fromRegistry = officeRecordFromRegistry(readRegistryAgents(home));
  if (fromRegistry) {
    // A file with the business details but no team (setup finished with nobody
    // picked, then agents were hired later) still names the business best.
    const rec = fromFile ? { ...fromRegistry, ...stripEmpty(fromFile), team: fromRegistry.team } : fromRegistry;
    return { path: home, hasOffice: true, record: rec, source: 'registry' };
  }
  return { path: home, hasOffice: true, record: fromFile, source: fromFile ? 'file' : null };
}

function stripEmpty(rec: OfficeRecord): Partial<OfficeRecord> {
  const out: Partial<OfficeRecord> = {};
  if (rec.businessName) out.businessName = rec.businessName;
  if (rec.businessCity) out.businessCity = rec.businessCity;
  if (rec.businessType) out.businessType = rec.businessType;
  if (rec.officeFolder) out.officeFolder = rec.officeFolder;
  return out;
}
