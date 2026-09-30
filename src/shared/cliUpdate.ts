/**
 * "Claude Code updated underneath the team."
 *
 * Claude Code updates itself on disk, but a running agent keeps the version it
 * started with until its process restarts. Claude Code says so in its own
 * footer ("Update installed · Restart to update"), which a business owner never
 * sees because nobody reads the terminal tab. The app notices instead: it
 * remembers the version each Claude agent started on, re-reads the installed
 * version, and offers "close the office and reopen" once any live agent is
 * behind.
 *
 * Pure, so the renderer and tests share it with main.
 */
import { isNewer } from './updateState';

export interface CliUpdateStatus {
  /** The newest Claude Code version installed on disk. */
  installed: string;
  /** Live Claude agents still running an older version. */
  behind: number;
  /** Live Claude agents the app is tracking (for the quit dialog's count). */
  live: number;
}

export interface RunningAgentCli {
  /** Version the agent's process started on. */
  started: string;
  /** Version its binary reports now; null when the probe failed. */
  installed: string | null;
}

/**
 * Null when there is nothing to offer: no live Claude agents, or every one is
 * already on the installed version. A failed probe counts as "not behind", so a
 * busy machine never raises a false alarm.
 */
export function cliUpdateStatus(agents: readonly RunningAgentCli[]): CliUpdateStatus | null {
  let installed: string | null = null;
  let behind = 0;
  for (const a of agents) {
    if (!a.installed || !isNewer(a.installed, a.started)) continue;
    behind++;
    if (!installed || isNewer(a.installed, installed)) installed = a.installed;
  }
  return installed ? { installed, behind, live: agents.length } : null;
}

/** Whether the toast shows: an upgrade is waiting and the owner has not said
 *  "later" to this installed version. A newer version shows it again. */
export function cliUpdateToastVisible(status: CliUpdateStatus | null, laterFor: string | null): boolean {
  return !!status && laterFor !== status.installed;
}
