/**
 * Is the app's home folder (config.harnessHome) still there, with the office
 * inside it?
 *
 * Checked at launch BEFORE the hive is bootstrapped. Bootstrapping creates the
 * hive skeleton with mkdir -p, so if the owner moved or deleted the folder the
 * app used to rebuild an EMPTY office at the old path, silently: the team came
 * back with no memory, tasks or history. Now a missing office skips that, and
 * the renderer shows the "we can't find your office" screen instead of the
 * floor. Every normal launch goes straight in, with no picker (owner,
 * 2026-09-24).
 *
 * Plain node:fs, no electron import, so it tests as a node module.
 */
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface HomeFolderStatus {
  path: string | null;
  /** The folder itself exists (and is a folder). */
  exists: boolean;
  /** It holds an office the app made: hive/registry.json, written on first bootstrap. */
  hasOffice: boolean;
}

export function homeFolderStatus(path: string | null | undefined): HomeFolderStatus {
  if (!path) return { path: null, exists: false, hasOffice: false };
  let exists = false;
  try { exists = statSync(path).isDirectory(); } catch { exists = false; }
  const hasOffice = exists && existsSync(join(path, 'hive', 'registry.json'));
  return { path, exists, hasOffice };
}

/**
 * Whether launch may bootstrap the office in place. Before onboarding there is
 * nothing to lose (and no home yet), so it is fine; after onboarding the office
 * must actually be there.
 */
export function homeReadyAtLaunch(cfg: { onboardingComplete?: boolean; harnessHome?: string | null }): boolean {
  if (!cfg.onboardingComplete) return true;
  return homeFolderStatus(cfg.harnessHome).hasOffice;
}
