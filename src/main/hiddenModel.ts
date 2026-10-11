import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentProvider } from '../shared/agentProvider';
import { runHiddenClaude, type HiddenClaudeOptions } from './hiddenClaude';
import { resolveCommand, userShellPath } from './shellEnv';

/**
 * Engine-agnostic background task execution harness.
 *
 * Runs non-interactive / headless model passes for system checks (standing approvals,
 * memory tidy-up, distinct job overlap checks, work style suggestions).
 *
 * Routes to the active engine instead of hardcoding Claude CLI flags.
 * Gracefully degrades with { ok: false, error: 'engine_unavailable' } when
 * an engine has no headless runner or is missing credentials.
 */

export type ModelTier = 'quick' | 'careful';

export interface HiddenModelOptions {
  /** The engine to run: defaults to 'claude'. */
  engine?: AgentProvider;
  /** Model tier: 'quick' (fast/cheap e.g. Haiku, Flash, mini) vs 'careful' (Sonnet, Pro). */
  tier?: ModelTier;
  /** Explicit model override. If omitted, resolved from engine + tier. */
  model?: string;
  /** Working directory for the session. */
  cwd: string;
  /** Base executable override. */
  command?: string;
  /** Tools the session is forbidden to use. */
  disallowedTools?: string[];
  /** No tools and no file/web access: for pure prompt/text reasoning. */
  noTools?: boolean;
  /** Setting sources to load (Claude-only). */
  settingSources?: string;
  /** Directories added via --add-dir. */
  addDirs?: string[];
  /** Hard cap timeout in ms. Default 180000. */
  timeoutMs?: number;
  /** False to disable extended thinking where supported. */
  thinking?: boolean;
  /** Extra environment variables. */
  env?: Record<string, string>;
  /** Abort signal. */
  signal?: AbortSignal;
  /** Live screen stream callback (where supported). */
  onScreenText?: (text: string) => void;
}

export interface HiddenModelResult {
  ok: boolean;
  text?: string;
  error?: string;
  engine: AgentProvider;
}

/**
 * Resolves default model identifier for the given engine and tier.
 */
export function resolveModelForEngine(
  engine: AgentProvider = 'claude',
  tier: ModelTier = 'quick',
  override?: string
): string {
  if (override) return override;

  switch (engine) {
    case 'codex':
      return tier === 'quick' ? 'gpt-5-codex-mini' : 'gpt-5-codex';
    case 'gemini':
      return tier === 'quick' ? 'gemini-2.5-flash' : 'gemini-2.5-pro';
    case 'claude':
    default:
      return tier === 'quick' ? 'claude-haiku-4-5' : 'claude-sonnet-4-5';
  }
}

/**
 * Builds arguments for headless `codex exec`.
 */
export function buildCodexExecArgs(
  prompt: string,
  model: string,
  tempDir: string,
  outputFile: string,
  noTools?: boolean
): string[] {
  const args = [
    'exec',
    '--ephemeral',
    '--ignore-user-config',
    '--skip-git-repo-check',
    '-s',
    'read-only',
    '-C',
    tempDir,
    '--model',
    model,
  ];

  if (noTools) {
    args.push(
      '--disable',
      'shell_tool',
      '--disable',
      'unified_exec',
      '--disable',
      'apps',
      '--disable',
      'browser_use',
      '--disable',
      'computer_use',
      '-c',
      'web_search=disabled'
    );
  }

  args.push('-o', outputFile, prompt);
  return args;
}

/**
 * Builds arguments for non-interactive `gemini` CLI.
 */
export function buildGeminiHeadlessArgs(prompt: string, model: string, noTools?: boolean): string[] {
  const args: string[] = ['--model', model];
  if (noTools) {
    args.push('--approval-mode=yolo');
  }
  args.push('-p', prompt);
  return args;
}

/**
 * Executes a non-interactive Codex call in an isolated temporary directory.
 */
async function runHiddenCodex(
  prompt: string,
  opts: HiddenModelOptions,
  model: string
): Promise<HiddenModelResult> {
  const exe = resolveCommand(opts.command || 'codex');
  if (!exe) {
    return { ok: false, error: 'codex executable not found', engine: 'codex' };
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'codex-hidden-'));
  const outputFile = join(tempDir, 'answer.txt');
  const args = buildCodexExecArgs(prompt, model, tempDir, outputFile, opts.noTools);

  return new Promise((resolve) => {
    let resolved = false;
    const finish = (result: HiddenModelResult) => {
      if (resolved) return;
      resolved = true;
      try {
        if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // cleanup best effort
      }
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({ ok: false, error: 'timed out', engine: 'codex' });
      try {
        proc.kill('SIGKILL');
      } catch {
        // process may have already exited
      }
    }, opts.timeoutMs ?? 180_000);

    const proc = spawn(exe, args, {
      cwd: tempDir,
      env: {
        ...process.env,
        PATH: userShellPath(),
        CODEX_NON_INTERACTIVE: '1',
        ...(opts.env ?? {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (opts.signal) {
      opts.signal.addEventListener('abort', () => {
        clearTimeout(timer);
        try {
          proc.kill('SIGKILL');
        } catch {
          // ignore
        }
        finish({ ok: false, error: 'cancelled', engine: 'codex' });
      });
    }

    let stderr = '';
    proc.stderr?.on('data', (d) => {
      stderr += d.toString();
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      finish({ ok: false, error: err.message, engine: 'codex' });
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        finish({
          ok: false,
          error: stderr.trim() || `codex exited with code ${code}`,
          engine: 'codex',
        });
        return;
      }

      if (existsSync(outputFile)) {
        try {
          const text = readFileSync(outputFile, 'utf8').trim();
          finish({ ok: true, text, engine: 'codex' });
          return;
        } catch (e) {
          finish({ ok: false, error: `failed to read output file: ${e}`, engine: 'codex' });
          return;
        }
      }

      finish({ ok: false, error: 'no output file generated', engine: 'codex' });
    });
  });
}

/**
 * Executes a non-interactive Gemini CLI call.
 */
async function runHiddenGemini(
  prompt: string,
  opts: HiddenModelOptions,
  model: string
): Promise<HiddenModelResult> {
  const exe = resolveCommand(opts.command || 'gemini');
  if (!exe) {
    return { ok: false, error: 'gemini executable not found', engine: 'gemini' };
  }

  const args = buildGeminiHeadlessArgs(prompt, model, opts.noTools);

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let resolved = false;

    const finish = (result: HiddenModelResult) => {
      if (resolved) return;
      resolved = true;
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({ ok: false, error: 'timed out', engine: 'gemini' });
      try {
        proc.kill('SIGKILL');
      } catch {
        // ignore
      }
    }, opts.timeoutMs ?? 180_000);

    const proc = spawn(exe, args, {
      cwd: opts.cwd,
      env: {
        ...process.env,
        PATH: userShellPath(),
        ...(opts.env ?? {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (opts.signal) {
      opts.signal.addEventListener('abort', () => {
        clearTimeout(timer);
        try {
          proc.kill('SIGKILL');
        } catch {
          // ignore
        }
        finish({ ok: false, error: 'cancelled', engine: 'gemini' });
      });
    }

    proc.stdout?.on('data', (d) => {
      stdout += d.toString();
    });
    proc.stderr?.on('data', (d) => {
      stderr += d.toString();
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      finish({ ok: false, error: err.message, engine: 'gemini' });
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        finish({
          ok: false,
          error: stderr.trim() || `gemini exited with code ${code}`,
          engine: 'gemini',
        });
        return;
      }
      finish({ ok: true, text: stdout.trim(), engine: 'gemini' });
    });
  });
}

/**
 * Main dispatcher: runs a hidden model prompt against the appropriate engine.
 */
export async function runHiddenModel(
  prompt: string,
  opts: HiddenModelOptions
): Promise<HiddenModelResult> {
  const engine = opts.engine ?? 'claude';
  const tier = opts.tier ?? 'quick';
  const model = resolveModelForEngine(engine, tier, opts.model);

  switch (engine) {
    case 'claude': {
      const claudeOpts: HiddenClaudeOptions = {
        model,
        cwd: opts.cwd,
        command: opts.command,
        disallowedTools: opts.disallowedTools,
        noTools: opts.noTools,
        settingSources: opts.settingSources,
        addDirs: opts.addDirs,
        timeoutMs: opts.timeoutMs,
        thinking: opts.thinking ?? (tier === 'quick' ? false : undefined),
        env: opts.env,
        signal: opts.signal,
        onScreenText: opts.onScreenText,
      };
      const res = await runHiddenClaude(prompt, claudeOpts);
      return { ...res, engine: 'claude' };
    }

    case 'codex':
      return runHiddenCodex(prompt, opts, model);

    case 'gemini':
      return runHiddenGemini(prompt, opts, model);

    default:
      return {
        ok: false,
        error: `engine_unavailable: ${engine}`,
        engine,
      };
  }
}
