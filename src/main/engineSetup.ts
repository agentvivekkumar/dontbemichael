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
    // Never build a folder from an unset variable: '\\npm' would be the drive root.
    ? [`${e.home}\\.local\\bin`, ...(e.localAppData ? [`${e.localAppData}\\Programs\\claude`] : []), ...(e.appData ? [`${e.appData}\\npm`] : []), `${e.home}\\.claude\\local`]
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

export type ApiKeyVerdict = 'ok' | 'rejected' | 'refused' | 'workspace' | 'busy' | 'unreachable';

/** Anthropic's answer to the key, by HTTP status: 2xx accepted, 401 or 403
 *  not accepted, an HTTP 408, 429 or 5xx busy (says nothing about the key),
 *  any other 4xx refused for a reason Anthropic gives. A redirect or anything
 *  else is unreachable. */
export function apiKeyVerdict(statusCode: number): ApiKeyVerdict {
  if (statusCode >= 200 && statusCode < 300) return 'ok';
  if (statusCode === 401 || statusCode === 403) return 'rejected';
  if (statusCode === 408 || statusCode === 429 || statusCode >= 500) return 'busy';
  return statusCode >= 400 ? 'refused' : 'unreachable';
}

/** The part of `fetch` the key check uses: Electron's `net.fetch` in the app
 *  (it follows the system proxy), the global `fetch` otherwise. */
export type KeyCheckFetch = (url: string, init: { method: string; headers: Record<string, string>; signal: AbortSignal }) => Promise<KeyCheckReply>;
type KeyCheckReply = { status: number; body?: ReadableStream<Uint8Array> | null; json?: () => Promise<unknown> };

/** Anthropic's error replies are a few hundred bytes. A bigger body is a proxy's
 *  page: it is never read past this, so it cannot flood the main process. */
const ERROR_BODY_MAX = 16 * 1024;

/** The error body as JSON, read up to ERROR_BODY_MAX (undefined past it). */
async function errorBody(res: KeyCheckReply): Promise<unknown> {
  const stream = res.body;
  if (!stream || typeof stream.getReader !== 'function') return res.json?.();
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > ERROR_BODY_MAX) return undefined;
      chunks.push(value);
    }
  } finally {
    reader.cancel().catch(() => { /* already closed */ });
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** Anthropic's reason for a key made for the whole organization, not inside a
 *  workspace (a 400, seen on Windows 2026-10-09). */
const UNSCOPED_KEY_REASON = /not scoped to a workspace/i;

/** Anthropic's own reason from an error body (`{"error":{"message":...}}`),
 *  one line, or undefined when the body has none. */
async function anthropicReason(res: KeyCheckReply): Promise<string | undefined> {
  try {
    const body = await errorBody(res) as { error?: { message?: unknown } } | undefined;
    const msg = body?.error?.message;
    return typeof msg === 'string' && msg.trim() ? msg.replace(/\s+/g, ' ').trim().slice(0, 300) : undefined;
  } catch {
    return undefined;
  }
}

/** Ask Anthropic whether the key works (`GET /v1/models`). A network error,
 *  no answer within timeoutMs (10 s), or a refused or busy status (a 4xx other
 *  than 401 or 403, a 408, 429 or 5xx) with no Anthropic message is
 *  'unreachable'; a refusal carries Anthropic's reason so the owner sees what
 *  to change. */
export async function checkAnthropicKey(key: string, fetchFn: KeyCheckFetch = globalThis.fetch as unknown as KeyCheckFetch, timeoutMs = 10_000): Promise<{ verdict: ApiKeyVerdict; reason?: string }> {
  try {
    const res = await fetchFn('https://api.anthropic.com/v1/models?limit=1', {
      method: 'GET',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(timeoutMs)
    });
    const verdict = apiKeyVerdict(res.status);
    if (verdict !== 'refused' && verdict !== 'busy') return { verdict };
    const reason = await anthropicReason(res);
    // Anthropic always answers an error with a message. A 4xx or 5xx without
    // one came from something in between (a proxy's 407, 502 or block page),
    // so it is the network, not the key or Anthropic.
    if (!reason) return { verdict: 'unreachable' };
    if (verdict === 'busy') return { verdict };
    // The refusal seen in the field gets a short message in the owner's
    // language; if Anthropic rewords it, the case falls back to refused with
    // Anthropic's own words, which is safe.
    if (UNSCOPED_KEY_REASON.test(reason)) return { verdict: 'workspace' };
    return { verdict, reason };
  } catch {
    return { verdict: 'unreachable' };
  }
}

/** How main runs `claude auth status --json`. An npm install on Windows is a
 *  .cmd shim, which Node refuses to start without cmd.exe (EINVAL), so it goes
 *  through cmd.exe, quoted for `/s`. */
export function claudeAuthStatusCommand(platform: string, path: string, comSpec?: string): { file: string; args: string[]; verbatim: boolean } {
  if (platform === 'win32' && /\.(cmd|bat)$/i.test(path)) {
    return { file: comSpec || 'cmd.exe', args: ['/d', '/s', '/c', `""${path}" auth status --json"`], verbatim: true };
  }
  return { file: path, args: ['auth', 'status', '--json'], verbatim: false };
}

/** Coalesce "look again" notices: the first goes out at once, and the latest
 *  one inside the window is sent once at its end (the id only says what
 *  changed; every notice means "read again"). A team restore without Claude
 *  would otherwise send one per member. */
export function makeNoticeCoalescer(send: (id: string) => void, windowMs = 2000,
  clock: { now: () => number; setTimeout: (fn: () => void, ms: number) => unknown } = { now: Date.now, setTimeout: (fn, ms) => setTimeout(fn, ms) }): (id: string) => void {
  let last = -Infinity;
  let pending: string | null = null;
  let timer = false;
  return (id) => {
    const now = clock.now();
    if (now - last >= windowMs && !timer) { last = now; send(id); return; }
    pending = id;
    if (timer) return;
    timer = true;
    clock.setTimeout(() => {
      timer = false;
      last = clock.now();
      if (pending !== null) { const p = pending; pending = null; send(p); }
    }, Math.max(0, windowMs - (now - last)));
  };
}

export type ClaudeAuth = { signedIn: boolean; email?: string };

/** Reads `claude auth status` for main: one read at a time (the step, the
 *  card and the poll share it), a read asked for after a sign in ended never
 *  joins one that started before it, and a slow or failed read keeps the last
 *  known state instead of turning a signed out owner into "could not check". */
export function makeClaudeAuthReader(exec: (path: string, done: (err: unknown, stdout: string) => void) => void, now: () => number = Date.now): {
  read: (path: string) => Promise<ClaudeAuth | null>;
  /** A sign in or install just ended: the next read must start after it. */
  invalidate: () => void;
  last: () => ClaudeAuth | null;
} {
  let last: ClaudeAuth | null = null;
  let inFlight: { startedAt: number; promise: Promise<ClaudeAuth | null> } | null = null;
  let staleBefore = -Infinity;
  const start = (path: string): Promise<ClaudeAuth | null> => {
    const startedAt = now();
    const promise = new Promise<ClaudeAuth | null>((done) => {
      try {
        exec(path, (err, stdout) => {
          const parsed = parseClaudeAuthStatus(String(stdout ?? ''));
          if (parsed) { last = parsed; done(parsed); return; }
          // Failed with nothing to read (timeout, killed): keep what we knew.
          // Printed something that is not the JSON: a Claude without the command.
          done(err && !String(stdout ?? '').trim() ? last : null);
        });
      } catch { done(last); }
    }).finally(() => { if (inFlight?.promise === promise) inFlight = null; });
    inFlight = { startedAt, promise };
    return promise;
  };
  return {
    read(path) {
      if (inFlight && inFlight.startedAt > staleBefore) return inFlight.promise;
      if (inFlight) return inFlight.promise.then(() => start(path));
      return start(path);
    },
    invalidate() { staleBefore = now(); },
    last: () => last
  };
}
