import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { delimiter, isAbsolute } from 'node:path';
import { resolveCommand, userShellPath } from './shellEnv';

/** A gh that stalls (a network hang, a credential prompt) is stopped here, so
 *  the panel's loading state always ends. */
let ghTimeoutMs = 30_000;

/** Test seam: a shorter gh timeout. */
export function __setGhTimeoutForTest(ms = 30_000): void { ghTimeoutMs = ms; }

/** `gh` is usually a Homebrew install, and an app opened from the Dock gets
 *  launchd's bare PATH, which doesn't have it: from there every call failed
 *  with `spawn gh ENOENT` while the same gh worked in Terminal. It is run by
 *  its absolute path (resolveCommand: `which` in the login shell, then the
 *  usual install folders, cached), never by name from inside the repo, so a
 *  relative PATH entry (`.`, `bin`, an empty one) can't pick up a `gh` the repo
 *  carries. Its own PATH, for the git and credential helpers it runs, is the
 *  user's shell PATH with only its absolute entries, for the same reason.
 *  Windows keeps its inherited env (spreading process.env there gives `Path`,
 *  and adding `PATH` would make a second key). */
function ghLaunch(): { file: string; env: NodeJS.ProcessEnv } {
  const found = resolveCommand('gh');
  const file = isAbsolute(found) ? found : 'gh';
  if (process.platform === 'win32') return { file, env: { ...process.env, GH_PROMPT_DISABLED: '1' } };
  const PATH = userShellPath().split(delimiter).filter((d) => isAbsolute(d)).join(delimiter);
  return { file, env: { ...process.env, PATH, GH_PROMPT_DISABLED: '1' } };
}

/** Run gh in `cwd` and return its stdout, or an error in plain words. */
function runGh(cwd: string, args: string[]): Promise<{ ok: true; stdout: string } | { ok: false; error: string }> {
  // Node reports a cwd that doesn't exist as `spawn gh ENOENT`, the same code
  // as a missing gh, so a moved or deleted project folder is checked first.
  try {
    if (!statSync(cwd).isDirectory()) return Promise.resolve({ ok: false, error: `The project folder is not a folder: ${cwd}` });
  } catch {
    return Promise.resolve({ ok: false, error: `The project folder is gone: ${cwd}` });
  }
  return new Promise((resolve) => {
    const { file, env } = ghLaunch();
    const proc = spawn(file, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    // Decoded once at the end: a chunk can end inside a multi-byte character.
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let settled = false;
    const finish = (r: { ok: true; stdout: string } | { ok: false; error: string }): void => {
      if (settled) return;
      settled = true; clearTimeout(timer); resolve(r);
    };
    // Answer at once on a timeout: a helper gh started (git, a credential
    // helper) can hold the pipes open after gh itself is killed, and 'close'
    // would wait for it.
    const timer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch { /* already gone */ }
      proc.stdout.destroy(); proc.stderr.destroy();
      finish({ ok: false, error: `gh did not answer in ${Math.round(ghTimeoutMs / 1000)} s` });
    }, ghTimeoutMs);
    proc.stdout.on('data', (d: Buffer) => { out.push(d); });
    proc.stderr.on('data', (d: Buffer) => { err.push(d); });
    proc.on('error', (e: NodeJS.ErrnoException) => {
      finish({ ok: false, error: e.code === 'ENOENT' ? 'GitHub CLI (gh) not found. Install it from https://cli.github.com' : e.message });
    });
    proc.on('close', (code) => {
      if (code === 0) finish({ ok: true, stdout: Buffer.concat(out).toString('utf8') });
      else finish({ ok: false, error: Buffer.concat(err).toString('utf8').trim() || `gh exited ${code}` });
    });
  });
}

/** A GitHub issue, normalized for the renderer (labels/assignees flattened to names). */
export interface GHIssue {
  number: number;
  title: string;
  body: string;
  url: string;
  labels: string[];
  assignees: string[];
}

/** Shape `gh issue list --json` emits for each issue (the fields we ask for). */
interface RawGHIssue {
  number?: number;
  title?: string;
  body?: string;
  url?: string;
  state?: string;
  labels?: Array<{ name?: string }>;
  assignees?: Array<{ login?: string }>;
}

/**
 * List up to 30 issues in the repo at `cwd` via the `gh` CLI.
 *
 * Returns `{ ok: false, error }` on any failure — spawn error (e.g. `gh` not
 * installed), non-zero exit (e.g. unauthenticated / not a repo), or a JSON
 * parse failure — so callers never have to try/catch.
 */
export async function listIssues(cwd: string): Promise<{ ok: boolean; issues?: GHIssue[]; error?: string }> {
  const res = await runGh(cwd, ['issue', 'list', '--json', 'number,title,body,assignees,labels,url,state', '--limit', '30']);
  if (!res.ok) return res;
  try {
    const raw = JSON.parse(res.stdout) as RawGHIssue[];
    const issues: GHIssue[] = (Array.isArray(raw) ? raw : []).map((i) => ({
      number: i.number ?? 0,
      title: i.title ?? '',
      body: i.body ?? '',
      url: i.url ?? '',
      labels: (i.labels ?? []).map((l) => l.name ?? '').filter(Boolean),
      assignees: (i.assignees ?? []).map((a) => a.login ?? '').filter(Boolean)
    }));
    return { ok: true, issues };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** A CI (GitHub Actions) workflow run, normalized for the renderer. */
export interface CIRun {
  name: string;
  status: string;
  conclusion: string | null;
  url: string;
}

/** Shape `gh run list --json` emits for each run (the fields we ask for). */
interface RawCIRun {
  name?: string;
  status?: string;
  conclusion?: string | null;
  url?: string;
  databaseId?: number;
}

/**
 * List up to 5 recent CI (GitHub Actions) workflow runs in the repo at `cwd`
 * via the `gh` CLI.
 *
 * Returns `{ ok: false, error }` on any failure — spawn error (e.g. `gh` not
 * installed), non-zero exit (e.g. unauthenticated / not a repo / no Actions),
 * or a JSON parse failure — so callers never have to try/catch.
 */
export async function listCIRuns(cwd: string): Promise<{ ok: boolean; runs?: CIRun[]; error?: string }> {
  const res = await runGh(cwd, ['run', 'list', '--limit', '5', '--json', 'name,status,conclusion,url,databaseId']);
  if (!res.ok) return res;
  try {
    const raw = JSON.parse(res.stdout) as RawCIRun[];
    const runs: CIRun[] = (Array.isArray(raw) ? raw : []).map((r) => ({
      name: r.name ?? '',
      status: r.status ?? '',
      conclusion: r.conclusion ?? null,
      url: r.url ?? ''
    }));
    return { ok: true, runs };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
