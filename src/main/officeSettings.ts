/**
 * Each business's own settings (docs/designs/separate-businesses.md, step one).
 *
 * Today every office on a Mac reads one config.json, so a business's name,
 * team, mailboxes, schedules and connectors are the same for every office.
 * Step one files a business's settings under its office's lasting id, in
 * `config.json` `offices[<id>]`, and keeps only how the app itself behaves at
 * the top level. Every field has exactly one home, decided field by field in
 * the plan (T3), and the build fails if a field is added without one.
 *
 *   config.json
 *   ├─ install keys (INSTALL_KEYS)      installConfig()
 *   └─ offices
 *      └─ <office id>                   currentOfficeId(): office.json id, else
 *         ├─ home                         the entry whose home is the open folder
 *         └─ settings (BUSINESS_KEYS)   officeSettings() / updateOfficeSettings()
 *
 * Every reader goes through readConfig()/writeConfig() in config.ts, which
 * route business fields to the open office once `officesMigrated` is set; the
 * launch move (migrateToOfficeSettings) sets it. The key lists and pure
 * helpers live in officeKeys.ts.
 */
import { BUSINESS_DATA_FILES, configDefaults, keepConfigCopy, moveIntoOffice, officeDataPath, readConfig, readStoredConfig, replaceConfig, writeConfig, type HarnessConfig } from './config';
import { copySecretsToOffices } from './integrations';
import { describesBusiness, legacyBusinessFolder, type OfficeRecord } from '../shared/officeRecord';
import {
  BUSINESS_KEYS, businessKeySet, businessUsingFolder, installKeySet, officeIdIn, officesWith, pick, sameFolder, samePath, settingsIn,
  type InstallConfig, type OfficeEntry, type OfficeSettings
} from './officeKeys';
import { randomUUID } from 'node:crypto';
import { ensureOfficeId, isUsableTeamFolder, officeSwitchGuard, readOfficeId, readOfficeRecord, setOfficeId, syncOfficeRecord } from './officeFile';
import { homeFolderStatus } from './homeFolder';
import { expandTilde } from './fs';

/** A business's settings before anything was saved for it: the app defaults,
 *  so a new business has no mailboxes, runs the built in schedules and starts
 *  setup (onboardingComplete false). */
export function businessDefaults(): OfficeSettings {
  return pick(configDefaults(), businessKeySet) as OfficeSettings;
}

export {
  BUSINESS_KEYS, INSTALL_KEYS, splitPatch, officeIdIn, officesWith,
  type BusinessKey, type InstallKey, type OfficeSettings, type InstallConfig, type OfficeEntry
} from './officeKeys';

/** The open office's id, or null when no office is open or it has no id yet. */
export function currentOfficeId(): string | null {
  const cfg = readStoredConfig();
  return officeIdIn(cfg, readOfficeId(cfg.harnessHome));
}

/** The open business's settings (the defaults when it has none saved). */
export function officeSettings(): OfficeSettings {
  const cfg = readStoredConfig();
  return settingsIn(cfg, officeIdIn(cfg, readOfficeId(cfg.harnessHome)), businessDefaults());
}

/**
 * Save business settings for the open office. Only business keys are saved;
 * anything else in the patch is left out. False, with nothing saved, when no
 * office is open or it has no id: settings with nowhere to go must not land in
 * another business's entry or at the top level.
 */
export function updateOfficeSettings(patch: Partial<OfficeSettings>): boolean {
  const cfg = readStoredConfig();
  const home = cfg.harnessHome;
  const id = officeIdIn(cfg, readOfficeId(home));
  if (!home || !id) return false;
  writeConfig({ offices: officesWith(cfg, id, home, patch) });
  return true;
}

/**
 * At launch, after the move: make sure the open office has its id and its
 * entry, and that the entry knows where the office is now.
 *
 * - Its id's entry names another folder that no longer holds this office: the
 *   office was moved (in Finder, or found again from the missing office
 *   screen). The entry follows it.
 * - That other folder still holds the same id: this folder is a copy. It gets
 *   its own id and a copy of the settings, so the two never write each other's.
 * - No id yet: the entry last opened from this folder gives it one, else a new
 *   one; an office with no entry starts from the defaults (setup).
 *
 * Returns the open office's id, or null when there is none to give.
 */
export function adoptOpenOffice(): string | null {
  const cfg = readStoredConfig();
  if (!cfg.officesMigrated) return null;
  const home = cfg.harnessHome;
  if (!home || !homeFolderStatus(home).hasOffice) return null;
  const offices: Record<string, OfficeEntry> = { ...(cfg.offices ?? {}) };
  let changed = false;
  let id = readOfficeId(home);
  if (id && offices[id] && !samePath(offices[id].home, home)) {
    const elsewhere = offices[id].home;
    if (readOfficeId(elsewhere) === id) {
      const copyId = setOfficeId(home, randomUUID());
      if (!copyId) return null;
      offices[copyId] = { home, settings: structuredClone(offices[id].settings) };
      id = copyId;
    } else {
      offices[id] = { ...offices[id], home };
    }
    changed = true;
  }
  if (!id) id = ensureOfficeId(home, officeIdIn({ harnessHome: home, offices }, null) ?? undefined);
  if (!id) return null;
  if (!offices[id]) { offices[id] = { home, settings: {} }; changed = true; }
  if (changed) writeConfig({ offices });
  return id;
}

/**
 * The office in `oldHome` is being moved to `newHome` (Settings, Change office
 * folder, Move): its entry goes with it, so it reopens with its settings. The
 * offices map to save with the switch, or null when there is nothing to move.
 */
export function officesAfterMove(oldHome: string, newHome: string): Record<string, OfficeEntry> | null {
  const cfg = readStoredConfig();
  if (!cfg.officesMigrated) return null;
  const id = officeIdIn({ harnessHome: oldHome, offices: cfg.offices }, readOfficeId(oldHome));
  if (!id || !cfg.offices?.[id]) return null;
  return { ...cfg.offices, [id]: { ...cfg.offices[id], home: newHome } };
}

/**
 * The name of the business whose office is in `home`, for the closing bar of a
 * switch: its own settings once they are per office, else its office.json.
 * Null for a folder with no office yet (a new business) or a business with no
 * name.
 */
export function businessNameAt(home: string | null | undefined): string | null {
  if (!home || !homeFolderStatus(home).hasOffice) return null;
  const cfg = readStoredConfig();
  const id = officeIdIn({ harnessHome: home, offices: cfg.offices }, readOfficeId(home));
  const fromSettings = id ? cfg.offices?.[id]?.settings?.businessName : undefined;
  const name = (typeof fromSettings === 'string' && fromSettings.trim()) || readOfficeRecord(home)?.businessName;
  return name ? name : null;
}

/**
 * The open business's own Claude folder when it chose its own Claude login
 * (claudeLogin 'own'), else null: Claude's usual folder. Once settings are per
 * office only; the folder is `userData/offices/<id>/claude`, kept by office id
 * so a moved office keeps its login (Claude names the login after the folder's
 * path; T4).
 */
export function officeClaudeDir(): string | null {
  const cfg = readStoredConfig();
  if (!cfg.officesMigrated) return null;
  const id = officeIdIn(cfg, readOfficeId(cfg.harnessHome));
  if (!id || cfg.offices?.[id]?.settings?.claudeLogin !== 'own') return null;
  return officeDataPath('claude');
}

/** One row of the business menu (docs/designs/separate-businesses.md, DT1). */
export interface BusinessRow {
  id: string;
  home: string;
  /** Its name, or null for one with none yet ("New business"). */
  name: string | null;
  /** open: the business on screen. closed: another, ready to open (closedAt
   *  when known). missing: its folder is gone (D17, never starts closing time).
   *  setup: its setup is not finished (D18). */
  state: 'open' | 'closed' | 'missing' | 'setup';
  closedAt?: number;
}

/**
 * Every business on this install, for the business menu and Settings: the
 * open one first, then the rest by name. Only once settings are per office
 * (`perOffice`); before that the app has one business, and no menu.
 */
export function listBusinesses(): { perOffice: boolean; businesses: BusinessRow[] } {
  const cfg = readStoredConfig();
  if (!cfg.officesMigrated) return { perOffice: false, businesses: [] };
  const openId = officeIdIn(cfg, readOfficeId(cfg.harnessHome));
  const rows: BusinessRow[] = [];
  for (const [id, entry] of Object.entries(cfg.offices ?? {})) {
    if (!entry || typeof entry.home !== 'string') continue;
    const s = entry.settings ?? {};
    const name = typeof s.businessName === 'string' && s.businessName.trim() ? s.businessName.trim() : null;
    const state: BusinessRow['state'] = id === openId ? 'open'
      : s.onboardingComplete !== true ? 'setup'
        : !homeFolderStatus(entry.home).hasOffice ? 'missing'
          : 'closed';
    rows.push({ id, home: entry.home, name, state, ...(typeof entry.closedAt === 'number' ? { closedAt: entry.closedAt } : {}) });
  }
  rows.sort((a, b) => (a.state === 'open' ? -1 : b.state === 'open' ? 1 : (a.name ?? '').localeCompare(b.name ?? '')));
  return { perOffice: true, businesses: rows };
}

/**
 * Find it (DT2, D17): the owner points a business whose folder went missing at
 * where it is now. Only the same office (its office.json id) is accepted, so
 * another business's folder can never take its settings.
 */
export function relocateBusiness(id: string, home: string): { ok: true } | { ok: false; error: 'notFound' | 'notThatOffice' } {
  const cfg = readStoredConfig();
  const entry = cfg.officesMigrated ? cfg.offices?.[id] : undefined;
  if (!entry) return { ok: false, error: 'notFound' };
  if (!homeFolderStatus(home).hasOffice || readOfficeId(home) !== id) return { ok: false, error: 'notThatOffice' };
  writeConfig({ offices: { ...cfg.offices, [id]: { ...entry, home } } });
  return { ok: true };
}

/**
 * Remove a business whose setup was never finished (DT2, D18): its entry goes,
 * and with it the settings typed so far. Never the open business, and never
 * one that finished setup: a factory reset erases those, and one whose folder
 * is gone is removed by removeMissingBusiness.
 */
export function removeUnfinishedBusiness(id: string): boolean {
  const cfg = readStoredConfig();
  const entry = cfg.officesMigrated ? cfg.offices?.[id] : undefined;
  if (!entry || entry.settings?.onboardingComplete === true) return false;
  if (officeIdIn(cfg, readOfficeId(cfg.harnessHome)) === id) return false;
  const offices = { ...cfg.offices };
  delete offices[id];
  writeConfig({ offices });
  return true;
}

/** What Add a business answers: the new business's id, or why it was refused. */
export type AddBusinessResult =
  | { ok: true; id: string }
  | { ok: false; error: 'notPerOffice' | 'isOpen' | 'exists' }
  | { ok: false; error: 'folderTaken'; name: string | null };

/**
 * Remove a business whose folder is gone (owner 2026-11-27): one that finished
 * setup can otherwise never be removed, and it would keep its place in the menu
 * and its mailbox addresses for good. Only when its folder holds no office now,
 * never the open business, and never an unfinished setup (that has its own
 * Remove). The owner confirms first; main erases its passwords and history.
 */
export function removeMissingBusiness(id: string): boolean {
  const cfg = readStoredConfig();
  const entry = cfg.officesMigrated ? cfg.offices?.[id] : undefined;
  if (!entry || entry.settings?.onboardingComplete !== true) return false;
  if (officeIdIn(cfg, readOfficeId(cfg.harnessHome)) === id) return false;
  if (typeof entry.home === 'string' && homeFolderStatus(entry.home).hasOffice) return false;
  const offices = { ...cfg.offices };
  delete offices[id];
  writeConfig({ offices });
  return true;
}

/**
 * Add a business (DT3, D19): the setup wizard ran over the open business, and
 * its answers are filed under the new business's own entry, never the open
 * one's. The install settings it chose (engine, model, auto mode) are saved as
 * install settings. Then the renderer switches to it, through closing time.
 *
 * Refused for the open office's own folder, for a folder whose office is
 * already a business that finished setup (open that one from the menu), and
 * for a business folder another business already uses, holds or sits inside
 * (with its name). A draft id from Back to office is finished in place.
 */
export function addBusiness(p: {
  id?: string; home: string; settings: Partial<OfficeSettings>; install?: Partial<InstallConfig>;
}): AddBusinessResult {
  const cfg = readStoredConfig();
  if (!cfg.officesMigrated) return { ok: false, error: 'notPerOffice' };
  if (cfg.harnessHome && samePath(cfg.harnessHome, p.home)) return { ok: false, error: 'isOpen' };
  const offices: Record<string, OfficeEntry> = { ...(cfg.offices ?? {}) };
  const draft = p.id && offices[p.id] && offices[p.id].settings?.onboardingComplete !== true ? p.id : null;
  // A setup picked up again is checked too: its folder may hold another
  // business's office by now.
  const there = homeFolderStatus(p.home).hasOffice ? officeIdIn({ harnessHome: p.home, offices }, readOfficeId(p.home)) : null;
  if (there && there !== draft && offices[there]?.settings?.onboardingComplete === true) return { ok: false, error: 'exists' };
  let id = draft;
  // The folder is checked before an id is made, so a refusal leaves no
  // office.json behind.
  const folder = p.settings?.businessFolder;
  const taken = typeof folder === 'string' && folder ? businessUsingFolder({ offices }, folder, id ?? there) : null;
  if (taken) return { ok: false, error: 'folderTaken', name: taken.name };
  if (!id) id = there ?? (homeFolderStatus(p.home).hasOffice ? ensureOfficeId(p.home) : null) ?? randomUUID();
  // A new business starts under the open business's budget unless setup chose
  // its own: it never runs with no budget. Caps per member stay with the
  // members they were set for.
  const { agentTokenCaps: _members, ...budget } = spendCaps(readConfig());
  const settings = { ...budget, ...(pick(p.settings ?? {}, businessKeySet) as Partial<OfficeSettings>), onboardingComplete: true };
  const { draft: _left, ...rest } = offices[id] ?? { home: p.home, settings: {} };
  offices[id] = { ...rest, home: p.home, settings };
  // Only how the app behaves; never which office is open (the switch does that).
  const install = pick(p.install ?? {}, installKeySet) as Record<string, unknown>;
  for (const k of ['harnessHome', 'recentHives', 'offices', 'officesMigrated']) delete install[k];
  writeConfig({ ...(install as Partial<HarnessConfig>), offices });
  // A folder that already holds an office keeps its office.json, which still
  // describes the business it had: describe this one, or every launch would
  // log a name mismatch (businessNameMismatch). A folder with no office yet
  // gets its record when the office is made. Only this business's own office:
  // an office.json with another id describes another business, never renamed
  // from here.
  if (homeFolderStatus(p.home).hasOffice && readOfficeId(p.home) === id) syncOfficeRecord({ ...settings, harnessHome: p.home });
  return { ok: true, id };
}

/**
 * The open business's business folder is changing to `folder` (its setup, or
 * any save through Settings): the other business that already uses it, or
 * null. Keeping its own folder is never refused. The open business is the one
 * the save goes to: `home` when the save sets harnessHome (setup's does), else
 * the stored one, found the way writeConfig files it (officeIdForSave). For
 * Add a business (`add`), the open business's folder counts too, and only the
 * draft's own (`add.id`) is its own.
 */
export function businessFolderTakenBy(folder: string, add?: { id: string | null }, home?: string): { id: string; name: string | null } | null {
  const cfg = readStoredConfig();
  if (add) return businessUsingFolder(cfg, folder, add.id);
  const where = typeof home === 'string' && home ? expandTilde(home) : cfg.harnessHome ?? undefined;
  const openId = where ? officeIdIn({ harnessHome: where, offices: cfg.offices }, readOfficeId(where)) : null;
  // An id with no entry (office.json missing or remade): the entry last
  // opened from this folder is still the open business, not another one.
  const found = openId ? cfg.offices?.[openId] : undefined;
  const byHome = found || !where ? undefined : Object.values(cfg.offices ?? {}).find((e) => typeof e?.home === 'string' && sameFolder(e.home, where));
  const own = (found ?? byHome)?.settings?.businessFolder;
  if (typeof own === 'string' && own && sameFolder(own, folder)) return null;
  return businessUsingFolder(cfg, folder, openId, byHome ? where : undefined);
}

/**
 * config:update's check: a save that moves the open business onto a business
 * folder another business uses is refused as a whole, with that business's
 * name, so setup can say so and go back to the team step. Null when the save
 * may go ahead.
 */
export function folderTakenRefusal(patch: unknown): { ok: false; error: 'folderTaken'; name: string | null } | null {
  const p = patch && typeof patch === 'object' ? (patch as { businessFolder?: unknown; harnessHome?: unknown }) : {};
  const folder = p.businessFolder;
  if (typeof folder !== 'string' || !folder) return null;
  const taken = businessFolderTakenBy(folder, undefined, typeof p.harnessHome === 'string' ? p.harnessHome : undefined);
  return taken ? { ok: false, error: 'folderTaken', name: taken.name } : null;
}

/**
 * Launch fills businessFolder in for an office set up before it existed
 * (migrateBusinessFolder): the folder holding its Office folder, else (a home
 * or system folder, or another business's folder is in or around it) the
 * Office folder itself. Null when that is another business's too: then
 * nothing is written, and the office keeps its officeFolder and its walls.
 */
export function businessFolderFromOffice(officeFolder: string): string | null {
  const office = expandTilde(officeFolder);
  const parent = legacyBusinessFolder(office);
  if (parent && isUsableTeamFolder(parent) && !businessFolderTakenBy(parent)) return parent;
  return businessFolderTakenBy(office) ? null : office;
}

/**
 * Back to office from Add a business (D19): what was typed so far is kept as a
 * business whose setup is not finished, with the step it stopped at. Its folder
 * may not exist yet. Never the open office's folder.
 */
export function saveBusinessDraft(p: { id?: string; home: string; step: string; settings: Partial<OfficeSettings> }): string | null {
  const cfg = readStoredConfig();
  if (!cfg.officesMigrated || !p.home) return null;
  if (cfg.harnessHome && samePath(cfg.harnessHome, p.home)) return null;
  const offices: Record<string, OfficeEntry> = { ...(cfg.offices ?? {}) };
  const reuse = p.id && offices[p.id] && offices[p.id].settings?.onboardingComplete !== true ? p.id : null;
  const id = reuse ?? randomUUID();
  const settings = { ...(pick(p.settings ?? {}, businessKeySet) as Partial<OfficeSettings>), onboardingComplete: false };
  offices[id] = { ...(offices[id] ?? {}), home: p.home, settings, draft: { step: p.step } };
  writeConfig({ offices });
  return id;
}

/**
 * The open folder's business finished setup in Add a business and has never
 * been opened: its office is made on this launch (homeReadyAtLaunch). Never
 * closed, its team never started, not a draft. An office that ran once has
 * a closedAt or a started team, so a lost one still shows "we can't find your
 * office" and is never rebuilt empty. Pure over the stored config.
 */
export function neverOpenedBusiness(cfg: Pick<HarnessConfig, 'harnessHome' | 'offices' | 'officesMigrated'>): boolean {
  if (!cfg.officesMigrated || !cfg.harnessHome) return false;
  const id = officeIdIn({ harnessHome: cfg.harnessHome, offices: cfg.offices }, null);
  const entry = id ? cfg.offices?.[id] : undefined;
  if (!entry || entry.draft || entry.closedAt !== undefined) return false;
  return entry.settings?.onboardingComplete === true && entry.settings?.businessTeamStarted !== true;
}

/** A business left before the end of its setup: where it stopped, to reopen there. */
export function businessDraft(id: string): { id: string; home: string; step: string; settings: Partial<OfficeSettings> } | null {
  const cfg = readStoredConfig();
  const entry = cfg.officesMigrated ? cfg.offices?.[id] : undefined;
  if (!entry || entry.settings?.onboardingComplete === true) return null;
  return { id, home: entry.home, step: entry.draft?.step ?? 'business', settings: entry.settings ?? {} };
}

/** The open office stopped (a switch away, or the app quitting): note when,
 *  for "Closed since" in the business menu. Once settings are per office. */
export function noteOfficeClosed(now: number = Date.now()): void {
  const cfg = readStoredConfig();
  if (!cfg.officesMigrated) return;
  const id = officeIdIn(cfg, readOfficeId(cfg.harnessHome));
  if (!id || !cfg.offices?.[id]) return;
  writeConfig({ offices: { ...cfg.offices, [id]: { ...cfg.offices[id], closedAt: now } } });
}

/** How the app behaves, without any business's settings. */
export function installConfig(): InstallConfig {
  return pick(readStoredConfig(), installKeySet) as InstallConfig;
}

// ─── The move to per office settings (E2, decision D11) ─────────────────────
//
//   launch, before any service starts
//     │ officesMigrated set ─────────────────────────────► 'already'
//     │ no office open yet, or its folder is missing ────► 'waiting' (nothing changed;
//     │                                                      runs once it is there)
//     ├─ each known office (open one + recent ones) gets its id in office.json
//     ├─ 1. config.json copied as config.before-offices.json (kept, never overwritten)
//     ├─ 2. offices[<id>] written for every office not already there:
//     │       this business (team or business folder matches) ── all its settings
//     │       another business with an office.json ──────────── its identity and team,
//     │                                                          setupNoticePending
//     │       nothing to tell ──────────────────────────────── nothing: setup runs
//     ├─ 3. read back; anything missing ───────────────────► 'failed' (top level kept)
//     ├─ 3b. saved secrets copied for each office of this business; the journals,
//     │      approvals, dock keys, pasted images and knowledge moved to the open one
//     └─ 4. one write: business fields removed from the top level, officesMigrated 1
//
// A crash anywhere before 4 leaves the top level as it was, and the next
// launch runs again: entries already written are kept as they are.

/** The name of the copy kept of config.json from before the move, so a build
 *  from before it can be pointed back at it. */
export const CONFIG_BEFORE_OFFICES = 'config.before-offices.json';

export type MigrationOutcome = 'business' | 'identity' | 'setup';

export interface KnownOffice {
  home: string;
  id: string;
  /** This office is the business the top level settings describe. */
  isThisBusiness: boolean;
  /** Its office.json, when it describes a business. */
  record: OfficeRecord | null;
}

/** The owner's spend caps. Before the move every office ran under them, so
 *  every office keeps them after it: a business never starts with no budget. */
const SPEND_KEYS = ['costCapTokens', 'costCapUsd', 'agentTokenCaps'] as const;
export function spendCaps(cfg: Partial<HarnessConfig>): Partial<OfficeSettings> {
  const out: Record<string, unknown> = {};
  for (const k of SPEND_KEYS) if (cfg[k] !== undefined) out[k] = cfg[k];
  return out as Partial<OfficeSettings>;
}

/** The settings each office starts with after the move (pure). */
export function settingsForMigration(cfg: Partial<HarnessConfig>, office: KnownOffice): { outcome: MigrationOutcome; settings: Partial<OfficeSettings> } {
  if (office.isThisBusiness) {
    return { outcome: 'business', settings: pick(cfg, businessKeySet) as Partial<OfficeSettings> };
  }
  const rec = office.record;
  if (describesBusiness(rec)) {
    const settings: Partial<OfficeSettings> = {
      ...spendCaps(cfg),
      onboardingComplete: true,
      businessTeam: rec.team,
      businessTeamStarted: true,
      setupNoticePending: true
    };
    if (rec.businessName) settings.businessName = rec.businessName;
    if (rec.businessCity) settings.businessCity = rec.businessCity;
    if (rec.businessType) settings.businessType = rec.businessType;
    if (rec.businessFolder) settings.businessFolder = rec.businessFolder;
    if (rec.companyProfile) settings.companyProfile = rec.companyProfile;
    return { outcome: 'identity', settings };
  }
  return { outcome: 'setup', settings: spendCaps(cfg) };
}

/** The open office and the recent ones that still hold an office, once each. */
export function knownOfficeHomes(cfg: Pick<HarnessConfig, 'harnessHome' | 'recentHives'>): string[] {
  const out: string[] = [];
  for (const h of [cfg.harnessHome, ...(cfg.recentHives ?? [])]) {
    if (typeof h !== 'string' || !h.trim()) continue;
    if (out.some((o) => samePath(o, h))) continue;
    if (homeFolderStatus(h).hasOffice) out.push(h);
  }
  return out;
}

export type MigrationResult = 'already' | 'waiting' | 'done' | 'failed';

/**
 * Move the business settings at the top of config.json into `offices`, once.
 * See the diagram above for the order. The open office is this business when
 * setup is unfinished (its settings are the ones being typed); otherwise each
 * office is this business when the T2 guard would open it with these settings.
 */
export function migrateToOfficeSettings(log: (line: string) => void = (l) => console.log(l)): MigrationResult {
  const cfg = readStoredConfig();
  if (cfg.officesMigrated) return 'already';
  // The settings at the top belong to the open office. With none open yet
  // (setup not that far), or its folder missing, they would have nowhere to
  // go: wait, changing nothing, until it is there.
  const open = cfg.harnessHome;
  if (!open || !homeFolderStatus(open).hasOffice) return 'waiting';

  const known: KnownOffice[] = [];
  for (const home of knownOfficeHomes(cfg)) {
    const id = ensureOfficeId(home);
    const isOpen = samePath(home, open);
    if (!id) {
      // The open office's settings need its id; another office can wait.
      if (isOpen) { log(`[offices] migration: no id for the open office, kept as it was`); return 'failed'; }
      continue;
    }
    // The settings at the top are the ones the open office runs on, so it is
    // always this business; another office is when the T2 guard would open it.
    const isThisBusiness = isOpen || (!!cfg.onboardingComplete && officeSwitchGuard(cfg, home) === 'ok');
    const rec = readOfficeRecord(home);
    known.push({ home, id, isThisBusiness, record: describesBusiness(rec) ? rec : null });
  }

  if (!keepConfigCopy(CONFIG_BEFORE_OFFICES)) { log('[offices] migration: could not keep the copy, kept as it was'); return 'failed'; }

  const offices: Record<string, OfficeEntry> = { ...(cfg.offices ?? {}) };
  for (const office of known) {
    if (offices[office.id]) continue; // written by a run that stopped before the end
    const { outcome, settings } = settingsForMigration(cfg, office);
    offices[office.id] = { home: office.home, settings };
    log(`[offices] migration: office ${office.id} gets ${outcome}`);
  }
  writeConfig({ offices });

  const saved = readStoredConfig();
  if (known.some((o) => !saved.offices?.[o.id])) { log('[offices] migration: settings did not read back, kept as it was'); return 'failed'; }

  // Saved passwords and keys: a copy for each office of this business. Files:
  // the journals, approvals, dock keys, pasted images and knowledge go to the
  // open office (a store the owner placed elsewhere stays where it is).
  const businessIds = known.filter((o) => settingsForMigration(cfg, o).outcome === 'business').map((o) => o.id);
  if (!copySecretsToOffices(businessIds)) { log('[offices] migration: could not copy the saved secrets, kept as it was'); return 'failed'; }
  const openId = known.find((o) => samePath(o.home, open))?.id;
  const files = BUSINESS_DATA_FILES.filter((f) => f !== 'knowledge' || !cfg.knowledgeGraph?.rootPath?.trim());
  if (openId && !moveIntoOffice(openId, files)) { log('[offices] migration: could not move the business files, kept as it was'); return 'failed'; }

  const next: Record<string, unknown> = { ...saved };
  for (const k of BUSINESS_KEYS) delete next[k];
  next.officesMigrated = 1;
  replaceConfig(next as unknown as HarnessConfig);
  log(`[offices] migration: done, ${known.length} office(s)`);
  return 'done';
}
