/**
 * Can Claude Code's shell sandbox start on this computer?
 *
 * The office keeps a team member to its own folders, and everyone but Research
 * off the internet, with Claude Code's OS sandbox (hookSettings in hive.ts).
 * On a member that holds private folders or has no internet, the settings also
 * lock the shell to the sandbox (`allowUnsandboxedCommands: false`). Where the
 * sandbox cannot start, that lock makes Claude Code refuse every shell command
 * ("Shell command execution is blocked by policy"): the Windows failure fixed
 * on 2026-10-09 by leaving the lock off there.
 *
 * Linux can be in the same state: Claude Code's Linux sandbox needs
 * `bubblewrap` and `socat`, neither installed on a stock desktop, and on Ubuntu
 * 24.04 and later AppArmor stops bubblewrap from creating the user namespaces
 * it needs (Claude Code docs, "Configure the sandboxed Bash tool"). Unlike
 * Windows, the owner can fix that, so a Linux office keeps the lock and fails
 * closed: shell commands are refused until the sandbox starts (owner,
 * 2026-10-18). This module asks the machine, and says in plain words what is
 * missing and how to fix it.
 *
 * Mac: Seatbelt ships with macOS, so the sandbox holds. Windows: Claude Code
 * has no sandbox, so it never holds. Linux: probed once and cached.
 *
 * The decision is pure (`classifyOsSandbox`) so every state is testable on any
 * machine; `osSandboxStatus` gathers the real facts.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { userShellPath } from './shellEnv';

export type OsSandboxState =
  /** The sandbox starts here: the shell lock and the network rule hold the shell. */
  | 'ready'
  /** Native Windows: Claude Code runs shell commands unsandboxed. */
  | 'no-sandbox-on-windows'
  /** Linux without bubblewrap or socat on the PATH the team members get. */
  | 'missing-tools'
  /** Linux where AppArmor stops bubblewrap creating user namespaces (Ubuntu 24.04+). */
  | 'blocked-by-apparmor'
  /** Linux where bubblewrap is there but does not start, for another reason. */
  | 'cannot-start';

export interface OsSandboxStatus {
  state: OsSandboxState;
  /** True only when Claude Code's sandbox will actually start for a team member. */
  holds: boolean;
  /** Linux tools that are missing, by name. */
  missing: string[];
  /** Commands the owner can run to fix it, in order. Empty when there is nothing to fix. */
  fix: string[];
  /** The first line bubblewrap printed when it failed, for the log. */
  detail?: string;
}

/** What the decision needs to know about the machine. Injected so every state
 *  can be tested on any platform. */
export interface SandboxFacts {
  platform: NodeJS.Platform;
  /** Is this executable on the PATH team members get? */
  has(command: 'bwrap' | 'socat'): boolean;
  /** kernel.apparmor_restrict_unprivileged_userns: true when set to 1, false
   *  when 0, null when the key does not exist (not Ubuntu, or an older kernel). */
  apparmorRestrictsUserns(): boolean | null;
  /** Start a throwaway bubblewrap sandbox shaped like Claude Code's (own pid
   *  and network namespaces, a fresh /proc) and report whether it ran. */
  bwrapStarts(): { ok: boolean; error?: string };
}

const APPARMOR_PROFILE_FIX = [
  "sudo tee /etc/apparmor.d/bwrap > /dev/null <<'EOF'",
  'abi <abi/4.0>,',
  'include <tunables/global>',
  'profile bwrap /usr/bin/bwrap flags=(unconfined) {',
  '  userns,',
  '  include if exists <local/bwrap>',
  '}',
  'EOF',
  'sudo systemctl reload apparmor'
];

export function classifyOsSandbox(facts: SandboxFacts): OsSandboxStatus {
  if (facts.platform === 'darwin') return { state: 'ready', holds: true, missing: [], fix: [] };
  if (facts.platform === 'win32') return { state: 'no-sandbox-on-windows', holds: false, missing: [], fix: [] };
  // Any other POSIX platform is treated as Linux: Claude Code's sandbox there is bubblewrap.
  const missing = (['bwrap', 'socat'] as const).filter((c) => !facts.has(c)).map((c) => (c === 'bwrap' ? 'bubblewrap' : 'socat'));
  if (missing.length) {
    return {
      state: 'missing-tools',
      holds: false,
      missing,
      fix: [`sudo apt-get install ${missing.join(' ')}   # Ubuntu and Debian`, `sudo dnf install ${missing.join(' ')}   # Fedora`]
    };
  }
  const run = facts.bwrapStarts();
  if (run.ok) return { state: 'ready', holds: true, missing: [], fix: [] };
  const detail = run.error?.split('\n').map((l) => l.trim()).find(Boolean);
  if (facts.apparmorRestrictsUserns() === true) {
    return { state: 'blocked-by-apparmor', holds: false, missing: [], fix: APPARMOR_PROFILE_FIX, ...(detail ? { detail } : {}) };
  }
  return { state: 'cannot-start', holds: false, missing: [], fix: [], ...(detail ? { detail } : {}) };
}

/** One sentence for the owner (and the log) on what this means for the office. */
export function osSandboxReason(status: OsSandboxStatus): string {
  switch (status.state) {
    case 'ready':
      return 'Team members\' shell commands run inside the sandbox on this computer.';
    case 'no-sandbox-on-windows':
      return 'Windows has no shell sandbox, so team members\' shell commands are not limited to their folders. Their file tools still are.';
    case 'missing-tools':
      return `This computer is missing ${status.missing.join(' and ')}, which the shell sandbox needs, so team members can't run shell commands on this computer. Install ${status.missing.length > 1 ? 'them' : 'it'}, then close and reopen the app.`;
    case 'blocked-by-apparmor':
      return 'This computer\'s AppArmor settings stop the shell sandbox from starting, so team members can\'t run shell commands on this computer. Allow bubblewrap in AppArmor, then close and reopen the app.';
    case 'cannot-start':
      return 'The shell sandbox does not start on this computer, so team members can\'t run shell commands on this computer until it does and the app is reopened.';
  }
}

function onPath(command: string): boolean {
  const dirs = userShellPath().split(delimiter).filter(Boolean);
  return dirs.some((d) => existsSync(join(d, command)));
}

function realFacts(): SandboxFacts {
  return {
    platform: process.platform,
    has: (c) => onPath(c),
    apparmorRestrictsUserns: () => {
      try {
        const v = readFileSync('/proc/sys/kernel/apparmor_restrict_unprivileged_userns', 'utf8').trim();
        return v === '1' ? true : v === '0' ? false : null;
      } catch {
        return null;
      }
    },
    bwrapStarts: () => {
      try {
        const r = spawnSync(
          'bwrap',
          ['--ro-bind', '/', '/', '--dev', '/dev', '--proc', '/proc', '--unshare-pid', '--unshare-net', '--die-with-parent', 'true'],
          { encoding: 'utf8', timeout: 5_000, env: { ...process.env, PATH: userShellPath() } }
        );
        if (r.error) return { ok: false, error: r.error.message };
        return r.status === 0 ? { ok: true } : { ok: false, error: r.stderr || `exit ${r.status}` };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }
  };
}

let probe: (() => OsSandboxStatus) | null = null;
const cache = new Map<NodeJS.Platform, OsSandboxStatus>();

/** The status for this computer, probed once per platform and cached. A Mac
 *  or Windows answer needs no probe; Linux runs bubblewrap once. */
export function osSandboxStatus(): OsSandboxStatus {
  if (probe) return probe();
  const platform = process.platform;
  const hit = cache.get(platform);
  if (hit) return hit;
  const status = classifyOsSandbox(realFacts());
  cache.set(platform, status);
  if (!status.holds && platform !== 'win32') {
    console.warn(`[sandbox] ${osSandboxReason(status)}${status.detail ? ` (${status.detail})` : ''}${status.fix.length ? `\n${status.fix.join('\n')}` : ''}`);
  }
  return status;
}

/** Tests only: answer with this status instead of probing; null restores the probe. */
export function setOsSandboxProbe(fn: (() => OsSandboxStatus) | null): void {
  probe = fn;
  cache.clear();
}
