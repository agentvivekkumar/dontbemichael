/**
 * Get Michael ready (docs/designs/get-michael-ready.md, owner 2026-10-07).
 *
 * A brand new Mac has no Claude Code. The app used to install it inside
 * Michael's own terminal, which the owner never sees, through Node's installer,
 * which asks for the Mac password: the prompt waited unseen, the install
 * failed, and nothing said so. Setup now ends on a Ready step (and Ask me keeps
 * a card) that installs Claude with its standalone installer, which needs no
 * Node and no password, and signs the owner in where they can see it.
 *
 * Electron free, so the decisions and the scripts are testable without an app.
 */
import { providerPreset } from '../shared/agentProvider';
export { engineSetupNeeded, type EngineSetupStatus } from '../shared/engineSetup';

/** The setup terminals. Not agents: no hive record, no relaunch. */
export const ENGINE_INSTALL_PTY = 'engine-setup-install';
export const ENGINE_SIGNIN_PTY = 'engine-setup-signin';

export function isEngineSetupPty(id: string): boolean {
  return id === ENGINE_INSTALL_PTY || id === ENGINE_SIGNIN_PTY;
}

/** `claude auth status --json`: `{ loggedIn, email, ... }`. null when it is not that. */
export function parseClaudeAuthStatus(stdout: string): { signedIn: boolean; email?: string } | null {
  try {
    const j = JSON.parse(stdout.trim()) as { loggedIn?: unknown; email?: unknown };
    if (typeof j.loggedIn !== 'boolean') return null;
    return { signedIn: j.loggedIn, ...(j.loggedIn && typeof j.email === 'string' && j.email ? { email: j.email } : {}) };
  } catch {
    return null;
  }
}

/** The install, run where the owner can watch it (behind Show details). Uses
 *  Claude's standalone installer: no Node, no npm, no administrator password.
 *  The download goes to a file first, so a failed download fails the script
 *  instead of feeding an empty script to bash. Success is judged afterwards by
 *  finding the installed command, not by this exit code alone. */
export function claudeInstallScript(platform: string = process.platform): string {
  const native = providerPreset('claude').nativeInstallCommand;
  if (platform === 'win32') {
    // One cmd.exe line, no double quotes (pty.ts wraps it in /d /s /c "...").
    return [
      'echo.',
      'echo   Installing Claude Code with its own installer...',
      'echo.',
      native?.win32 ?? 'powershell -c irm https://claude.ai/install.ps1 ^| iex'
    ].join(' & ');
  }
  return [
    `echo ''`,
    `echo '  Installing Claude Code with its own installer...'`,
    `echo ''`,
    `__s=$(mktemp) || exit 1`,
    `curl -fsSL https://claude.ai/install.sh -o "$__s" || { echo '  [x] Could not download the installer.'; rm -f "$__s"; exit 1; }`,
    `bash "$__s"`,
    `__rc=$?`,
    `rm -f "$__s"`,
    `exit $__rc`
  ].join(String.fromCharCode(10));
}

/** What Michael's (or a team member's) terminal says when Claude is missing at
 *  start. It installs nothing: setup and the Ask me card do that, visibly. */
export function claudeMissingScript(platform: string = process.platform): string {
  const lines = [
    'Claude Code is not set up on this computer, so this team member cannot start.',
    'Open Ask me and choose Get Michael ready. Everyone starts once it is done.'
  ];
  if (platform === 'win32') return ['echo.', ...lines.map((l) => `echo   ${l}`), 'echo.'].join(' & ');
  return [`echo ''`, ...lines.map((l) => `echo '  ${l}'`), `echo ''`].join(String.fromCharCode(10));
}
