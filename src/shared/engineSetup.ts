/** Where Michael's engine stands for the Get Michael ready step and its Ask me
 *  card (docs/designs/get-michael-ready.md). Shared by main and the renderer. */
import type { AgentProvider, EngineCredentialMethod } from './agentProvider';
import { credentialMethodForProvider } from './agentProvider';
export type { EngineCredentialMethod };

/** The setup terminals main runs. Not agents: no hive record, no relaunch. */
export const ENGINE_INSTALL_PTY = 'engine-setup-install';
export const ENGINE_SIGNIN_PTY = 'engine-setup-signin';

export function isEngineSetupPty(id: string): boolean {
  return id === ENGINE_INSTALL_PTY || id === ENGINE_SIGNIN_PTY;
}

export interface EngineSetupStatus {
  /** False for an engine this step does not set up (anything but Claude, until
   *  its provider joins BUILD_ENGINES with a credential contract). */
  applies: boolean;
  /** Which engine this status describes. Absent on the legacy Claude path. */
  provider?: AgentProvider;
  /** The credential kind the sign-in row validated. Absent on the legacy
   *  Claude path (see `method`). */
  credentialKind?: EngineCredentialMethod['kind'];
  /** Michael runs on another engine, but a team member on Claude could not
   *  start for want of it: the card speaks about the team, not Michael. */
  forTeam?: boolean;
  installed: boolean;
  /** null: installed, but the sign in state could not be read. Never blocks. */
  signedIn: boolean | null;
  email?: string;
  /** How Claude signs in: the owner's Claude account or an Anthropic API key. */
  method?: 'account' | 'apiKey';
  /** Michael cannot start until this is done. */
  needed: boolean;
  /** Once ready: the terminals that could not start for want of Claude and
   *  should start now. Only those restart; agents already working keep going. */
  restart?: string[];
}

/** Whether Michael can start: installed, and not known to be signed out. */
export function engineSetupNeeded(installed: boolean, signedIn: boolean | null): boolean {
  return !installed || signedIn === false;
}

export type EngineSetupPhase = 'checking' | 'installing' | 'installFailed' | 'signin' | 'browser' | 'unknown' | 'ready';

/** What the rows show, from what main reports and what the step started. */
export function engineSetupPhase(
  status: EngineSetupStatus | undefined,
  s: { installing: boolean; installFailed: boolean; browser: boolean }
): EngineSetupPhase {
  if (!status) return 'checking';
  if (!status.installed) return s.installFailed ? 'installFailed' : 'installing';
  if (status.signedIn === false) return s.browser ? 'browser' : 'signin';
  // Installed, but sign in could not be read (an old Claude without `auth
  // status`): never blocks, never a green check either.
  if (status.signedIn === null) return s.browser ? 'browser' : 'unknown';
  return 'ready';
}

/** Michael can start from here: signed in, or sign in could not be read. */
export function engineSetupPhaseOpensOffice(phase: EngineSetupPhase): boolean {
  return phase === 'ready' || phase === 'unknown';
}

/** Whether Get Michael ready shows its install/sign-in rows for this engine
 *  (issue #237). True for every engine with a credential contract that needs
 *  validation, plus Claude (legacy). False only for engines with nothing to
 *  validate (`custom`, local models with kind 'none' and no binary): the team
 *  starts once the binary is there. */
export function engineSetupStepApplies(provider: AgentProvider | undefined): boolean {
  if (!provider || provider === 'custom') return false;
  if (provider === 'claude') return true;
  return true;
}

/** Whether the sign-in row validates anything for this engine. Install-only
 *  engines (kind 'none') skip the key/login check but still show the install. */
export function engineSetupValidatesSignIn(provider: AgentProvider | undefined): boolean {
  if (!provider || provider === 'claude') return true;
  const method = credentialMethodForProvider(provider);
  if (!method) return false;
  return method.kind !== 'none';
}
