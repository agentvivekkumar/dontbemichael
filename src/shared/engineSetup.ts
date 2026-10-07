/** Where Michael's engine stands for the Get Michael ready step and its Ask me
 *  card (docs/designs/get-michael-ready.md). Shared by main and the renderer. */
export interface EngineSetupStatus {
  /** False for an engine this step does not set up (anything but Claude). */
  applies: boolean;
  installed: boolean;
  /** null: installed, but the sign in state could not be read. Never blocks. */
  signedIn: boolean | null;
  email?: string;
  /** Michael cannot start until this is done. */
  needed: boolean;
}

/** Whether Michael can start: installed, and not known to be signed out. */
export function engineSetupNeeded(installed: boolean, signedIn: boolean | null): boolean {
  return !installed || signedIn === false;
}

export type EngineSetupPhase = 'checking' | 'installing' | 'installFailed' | 'signin' | 'browser' | 'ready';

/** What the rows show, from what main reports and what the step started. */
export function engineSetupPhase(
  status: EngineSetupStatus | undefined,
  s: { installing: boolean; installFailed: boolean; browser: boolean }
): EngineSetupPhase {
  if (!status) return 'checking';
  if (!status.installed) return s.installFailed ? 'installFailed' : 'installing';
  if (status.signedIn === false) return s.browser ? 'browser' : 'signin';
  return 'ready';
}
