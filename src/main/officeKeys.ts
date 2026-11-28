/**
 * Which config fields belong to a business and which to the install, and the
 * pure helpers that file a business's settings by office id
 * (docs/designs/separate-businesses.md). No runtime import of config.ts, so
 * config.ts can route its reads and writes through these without a cycle.
 * The business folder checks (diskFolder) read the disk, to follow links.
 */
import { realpathSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import type { HarnessConfig } from './config';
import { expandTilde } from './fs';
import { isSameOrInside } from './pathInside';
import { isOfficeId, legacyBusinessFolder } from '../shared/officeRecord';

/** What belongs to a business: who it is, its team, mail and connectors, its
 *  Claude account, schedules, Research, knowledge, owner messages, integrations
 *  and budget (plan, T3). */
export const BUSINESS_KEYS = [
  // who the business is
  'businessType', 'businessName', 'businessCity', 'companyProfile', 'businessFolder', 'officeFolder', 'registeredRepos',
  // setup and team
  'onboardingComplete', 'businessTeam', 'businessTeamStarted', 'businessTeamRetry', 'instructionsRewritten',
  'firstTasksRemoved', 'workStyleUpdatesDecided', 'agentCapabilities', 'agentTokenCaps', 'autoDeliveryPausedAgents',
  // mail and connectors
  'mailboxes', 'quickbooksClaude', 'connectorsOn', 'connectorsSeen', 'connectorsMigrated', 'claudeConnectors', 'mcpDefaults',
  // its Claude account
  'claudeAuth', 'claudeLogin', 'planPriceMonthly',
  // schedules
  'missions', 'scheduleRequests', 'missionsOwnersMigrated', 'opsStandupSeeded', 'foundationsCheckSeeded',
  'standupFocusSeeded', 'heartbeatSeeded',
  // Research and data
  'research', 'dataClasses', 'researchPublic',
  // knowledge and memory
  'knowledgeGraph', 'knowledgeOnSeeded', 'knowledgeOnNoticeSeen', 'embeddingModel',
  // owner messages
  'ownerAnswerKeys', 'ownerDockKeys',
  // integrations and budget
  'integrations', 'costCapTokens', 'costCapUsd',
  // the one time notice after the move (D11)
  'setupNoticePending'
] as const satisfies readonly (keyof HarnessConfig)[];

/** How the app itself behaves, the same for every business. The engine and
 *  model choices stay here until a login per office lands (plan, T4). */
export const INSTALL_KEYS = [
  'harnessHome', 'recentHives', 'offices', 'officesMigrated', 'audience', 'autoMode', 'maxTurns', 'circuitBreaker', 'notifications',
  'strongKeepalive', 'autoUpdate', 'terminalTheme', 'tvShowOffices',
  'godProvider', 'godModel', 'defaultModel', 'defaultCommand', 'providerDefaultModels'
] as const satisfies readonly (keyof HarnessConfig)[];

export type BusinessKey = (typeof BUSINESS_KEYS)[number];
export type InstallKey = (typeof INSTALL_KEYS)[number];

// Every config field has exactly one home. A new field in HarnessConfig that
// is in neither list, or in both, stops the build here.
type Unplaced = Exclude<keyof HarnessConfig, BusinessKey | InstallKey>;
type PlacedTwice = Extract<BusinessKey, InstallKey>;
const everyFieldPlacedOnce: [Unplaced, PlacedTwice] extends [never, never] ? true : never = true;
void everyFieldPlacedOnce;

export type OfficeSettings = Pick<HarnessConfig, BusinessKey>;
export type InstallConfig = Pick<HarnessConfig, InstallKey>;

/** One business in config.json: the folder its office was last opened from,
 *  and its own settings (only the ones that differ from the defaults need be
 *  there). */
export interface OfficeEntry {
  home: string;
  settings: Partial<OfficeSettings>;
  /** When this office last stopped (a switch away, or the app quitting), in ms:
   *  the business menu's "Closed since". */
  closedAt?: number;
  /** Add a business left before the end (D19): the step it stopped at, so
   *  choosing it reopens the wizard there. Gone once its setup is finished. */
  draft?: { step: string };
}

export const businessKeySet: ReadonlySet<string> = new Set(BUSINESS_KEYS);
export const installKeySet: ReadonlySet<string> = new Set(INSTALL_KEYS);

export function pick<K extends string>(from: object, keys: ReadonlySet<string>): Partial<Record<K, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(from)) if (keys.has(k) && v !== undefined) out[k] = v;
  return out as Partial<Record<K, unknown>>;
}

/** A patch split by home: business keys and install keys. Keys of neither
 *  (nothing a HarnessConfig holds) are dropped. */
export function splitPatch(patch: Partial<HarnessConfig>): { business: Partial<OfficeSettings>; install: Partial<InstallConfig> } {
  return {
    business: pick(patch, businessKeySet) as Partial<OfficeSettings>,
    install: pick(patch, installKeySet) as Partial<InstallConfig>
  };
}

export function samePath(a: string, b: string): boolean {
  const norm = (p: string) => {
    const t = resolve(p).replace(/[\\/]+$/, '');
    return process.platform === 'darwin' || process.platform === 'win32' ? t.toLowerCase() : t;
  };
  return norm(a) === norm(b);
}

/**
 * A folder as the disk sees it, for comparing two of them: `~` expanded, links
 * and aliases (like /private on macOS) followed, and in lower case where
 * folder names ignore case. A folder not made yet (setup asks before making
 * it) is followed as far as it exists, so it still matches its real parent.
 */
function diskFolder(p: string): string {
  let there = resolve(expandTilde(p));
  const below: string[] = [];
  let real: string | undefined;
  while (real === undefined) {
    try { real = realpathSync.native(there); } catch {
      const up = dirname(there);
      if (up === there) real = there;
      else { below.unshift(basename(there)); there = up; }
    }
  }
  const out = join(real, ...below);
  return process.platform === 'darwin' || process.platform === 'win32' ? out.toLowerCase() : out;
}

/** Two spellings of one folder on disk (see diskFolder). */
export function sameFolder(a: string, b: string): boolean {
  return diskFolder(a) === diskFolder(b);
}

/**
 * The business, other than `selfId`, whose business folder is `folder`, holds
 * it or sits inside it, or null. Two businesses never share one: an agent can
 * reach every folder inside its own, so their documents would mix
 * (docs/designs/separate-businesses.md, two businesses on one folder). A
 * business saved before businessFolder existed counts by its old
 * officeFolder's parent, as launch reads it. `selfHome`, when given, is the
 * open office's folder whose id has no entry (office.json missing or new):
 * the entry last opened there is the open business itself.
 */
export function businessUsingFolder(
  cfg: Pick<HarnessConfig, 'offices'>, folder: string, selfId: string | null, selfHome?: string
): { id: string; name: string | null } | null {
  const mine = diskFolder(folder);
  for (const [id, entry] of Object.entries(cfg.offices ?? {})) {
    if (id === selfId) continue;
    if (selfHome && typeof entry?.home === 'string' && sameFolder(entry.home, selfHome)) continue;
    const s = entry?.settings ?? {};
    const theirs = s.businessFolder ?? legacyBusinessFolder(s.officeFolder);
    if (typeof theirs !== 'string' || !theirs) continue;
    const other = diskFolder(theirs);
    if (!isSameOrInside(other, mine) && !isSameOrInside(mine, other)) continue;
    const name = typeof s.businessName === 'string' && s.businessName.trim() ? s.businessName.trim() : null;
    return { id, name };
  }
  return null;
}

/**
 * Which office is open, given its folder's own id (office.json) if it has
 * one. Without it (the file was deleted, or never saved), the entry last
 * opened from this folder: so a lost office.json never loses the settings.
 */
export function officeIdIn(cfg: Pick<HarnessConfig, 'harnessHome' | 'offices'>, recordId: string | null): string | null {
  if (isOfficeId(recordId)) return recordId;
  const home = cfg.harnessHome;
  if (!home) return null;
  for (const [id, entry] of Object.entries(cfg.offices ?? {})) {
    if (isOfficeId(id) && typeof entry?.home === 'string' && samePath(entry.home, home)) return id;
  }
  return null;
}

/** One business's settings in this config: its saved ones over `defaults`. */
export function settingsIn(cfg: Pick<HarnessConfig, 'offices'>, id: string | null, defaults: Partial<OfficeSettings>): OfficeSettings {
  const saved = id && isOfficeId(id) ? cfg.offices?.[id]?.settings : undefined;
  return { ...defaults, ...pick(saved ?? {}, businessKeySet) } as OfficeSettings;
}

/** The offices map with this business's patch saved and its folder noted. */
export function officesWith(
  cfg: Pick<HarnessConfig, 'offices'>,
  id: string,
  home: string,
  patch: Partial<OfficeSettings>
): Record<string, OfficeEntry> {
  const offices = { ...(cfg.offices ?? {}) };
  const settings: Record<string, unknown> = { ...(offices[id]?.settings ?? {}) };
  // A field saved as undefined is cleared, as a save at the top level clears it.
  for (const [k, v] of Object.entries(patch)) {
    if (!businessKeySet.has(k)) continue;
    if (v === undefined) delete settings[k];
    else settings[k] = v;
  }
  offices[id] = { ...offices[id], home, settings: settings as Partial<OfficeSettings> };
  return offices;
}
