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
import { request as httpsRequest } from 'node:https';
import { providerPreset } from '../shared/agentProvider';
import { existsSync } from 'node:fs';
import { engineSetupNeeded, ENGINE_INSTALL_PTY, ENGINE_SIGNIN_PTY, isEngineSetupPty, type EngineSetupStatus } from '../shared/engineSetup';
export { engineSetupNeeded, ENGINE_INSTALL_PTY, ENGINE_SIGNIN_PTY, isEngineSetupPty, type EngineSetupStatus };

/** Where Claude is, without launching a shell. The PTY's lookup runs a login
 *  shell (`which`, about a second on the main thread) on every miss and never
 *  remembers one, and the status is read while Claude is missing. This checks
 *  the user's PATH (already captured once) and the places Claude's installers
 *  put it, which is everything `which` would find. */
export function findClaudeFast(e: {
  platform: string;
  pathEnv: string;
  home: string;
  appData?: string;
  localAppData?: string;
  exists?: (p: string) => boolean;
}): string | null {
  const exists = e.exists ?? existsSync;
  const win = e.platform === 'win32';
  const sep = win ? '\\' : '/';
  const names = win ? ['claude.exe', 'claude.cmd'] : ['claude'];
  const dirs = e.pathEnv.split(win ? ';' : ':').filter(Boolean);
  const known = win
    ? [`${e.home}\\.local\\bin`, `${e.localAppData ?? ''}\\Programs\\claude`, `${e.appData ?? ''}\\npm`, `${e.home}\\.claude\\local`]
    : [`${e.home}/.local/bin`, `${e.home}/.claude/local`, '/opt/homebrew/bin', '/usr/local/bin', `${e.home}/.volta/bin`];
  for (const dir of [...dirs, ...known]) {
    for (const n of names) {
      const p = dir.endsWith(sep) ? dir + n : dir + sep + n;
      if (exists(p)) return p;
    }
  }
  return null;
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
export function claudeMissingScript(platform: string = process.platform, godName = 'Michael'): string {
  // The name lands inside a quoted echo: letters, digits, spaces and . _ only.
  const name = godName.replace(/[^A-Za-z0-9 ._]/g, '').trim().slice(0, 40) || 'Michael';
  const lines = [
    'Claude Code is not set up on this computer, so this team member cannot start.',
    `Open Ask me and choose Get ${name} ready. Everyone starts once it is done.`
  ];
  if (platform === 'win32') return ['echo.', ...lines.map((l) => `echo   ${l}`), 'echo.'].join(' & ');
  return [`echo ''`, ...lines.map((l) => `echo '  ${l}'`), `echo ''`].join(String.fromCharCode(10));
}

/** Where Claude stands, from what main can see (the engineSetup:status IPC).
 *  The facts come in as functions so this decision runs without Electron. */
export async function readEngineSetupStatus(i: {
  /** Michael's engine is Claude (setup's pick, or the saved one). */
  isClaude: boolean;
  /** A team member on Claude could not start for want of it (Michael may be
   *  on another engine): the step and the card apply to the team. */
  teamNeedsClaude?: boolean;
  /** Where `claude` resolves, or null when it is not installed. */
  claudePath: string | null;
  claudeAuth?: 'account' | 'apiKey';
  /** The Anthropic key is in the secret store. */
  hasKey: () => boolean;
  /** `claude auth status --json`, parsed; null when unreadable. */
  authStatus: (path: string) => Promise<{ signedIn: boolean; email?: string } | null>;
}): Promise<EngineSetupStatus> {
  if (!i.isClaude && !i.teamNeedsClaude) return { applies: false, installed: true, signedIn: null, needed: false };
  const team = !i.isClaude ? { forTeam: true } : {};
  if (!i.claudePath) return { applies: true, ...team, installed: false, signedIn: false, needed: true };
  // An API key the owner chose signs every Claude agent in; no account needed.
  if (i.claudeAuth === 'apiKey') {
    const has = i.hasKey();
    return { applies: true, ...team, installed: true, signedIn: has, method: 'apiKey', needed: engineSetupNeeded(true, has) };
  }
  // A Claude too old to have `auth status` reads as unknown: never blocking.
  const auth = await i.authStatus(i.claudePath);
  const signedIn = auth ? auth.signedIn : null;
  return { applies: true, ...team, installed: true, signedIn, method: 'account', ...(auth?.email ? { email: auth.email } : {}), needed: engineSetupNeeded(true, signedIn) };
}

/** Start the install only when Claude is missing and no install is running:
 *  the step can ask again (Back, then Next) while one is still going. */
export function shouldStartInstall(s: { installRunning: boolean; installed: boolean }): boolean {
  return !s.installRunning && !s.installed;
}

/** A pasted key worth sending to Anthropic: not a stub, not a paragraph. */
export function apiKeyShapeOk(key: string): boolean {
  return key.length >= 20 && key.length <= 400 && !/\s/.test(key);
}

export type ApiKeyVerdict = 'ok' | 'rejected' | 'unreachable';

/** Anthropic's answer to the key: 2xx accepted, 401 or 403 not accepted,
 *  anything else (rate limit, outage) says nothing about the key. */
export function apiKeyVerdict(statusCode: number): ApiKeyVerdict {
  if (statusCode >= 200 && statusCode < 300) return 'ok';
  return statusCode === 401 || statusCode === 403 ? 'rejected' : 'unreachable';
}

/** Ask Anthropic whether the key works (`GET /v1/models`, 10 s). `request` is
 *  node's https.request; a network error or timeout is 'unreachable'. */
export function checkAnthropicKey(key: string, request: typeof httpsRequest = httpsRequest): Promise<ApiKeyVerdict> {
  return new Promise((done) => {
    try {
      const req = request({
        host: 'api.anthropic.com', path: '/v1/models?limit=1', method: 'GET', timeout: 10_000,
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
      }, (res) => {
        res.resume();
        done(apiKeyVerdict(res.statusCode ?? 0));
      });
      req.on('timeout', () => { req.destroy(); done('unreachable'); });
      req.on('error', () => done('unreachable'));
      req.end();
    } catch { done('unreachable'); }
  });
}
