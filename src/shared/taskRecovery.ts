/**
 * Task Recovery and Provider-Agnostic Handoff (shared, dependency-free).
 *
 * Implements the portable recovery contract allowing tasks interrupted by
 * provider-specific failures (crashes, rate limits, timeouts) to safely resume
 * on another provider (Codex, Gemini, Antigravity, or Claude) without losing
 * progress, repeating completed milestones, or replaying non-idempotent side effects.
 *
 * Grounded in Issue #54 / #36 / #48 architecture ("per task work record for engine hand off").
 */
import type { AgentProvider } from './agentProvider';

export type TaskFailureKind =
  | 'process_crash'
  | 'rate_limit'
  | 'timeout'
  | 'auth_failure'
  | 'unsupported_tool'
  | 'unknown';

export interface SideEffectRecord {
  /** The kind of side-effect: external mutation that cannot be casually repeated. */
  type: 'email_send' | 'api_write' | 'file_write' | 'payment';
  /** Target of the side-effect (e.g. email recipient, endpoint URL). */
  target?: string;
  /** Cryptographic hash or signature of the payload, for deduplication. */
  payloadHash?: string;
  /** Whether the external side-effect was verifiably acknowledged by upstream. */
  verified: boolean;
}

export interface TaskRecoveryCheckpoint {
  taskId: string;
  taskTitle: string;
  /** The provider that originally ran or failed the task. */
  originalProvider: AgentProvider;
  /** ISO timestamp when the checkpoint was captured. */
  checkpointAt: string;
  /** Verified milestones completed before failure; the resuming agent must NOT repeat these. */
  completedSteps: string[];
  /** Clear, actionable statement of what remains to be finished. */
  remainingWork: string;
  /** Verified files generated on disk so far. */
  outputFiles: string[];
  /** Tracked external mutations and their verification status. */
  sideEffects: SideEffectRecord[];
  /** Classified reason for the interruption. */
  failureKind: TaskFailureKind;
  /** Optional diagnostic message or stderr snippet. */
  failureDetail?: string;
  /** Number of recovery attempts on this task so far (runaway protection). */
  recoveryAttempts: number;
  /** Evaluated safety: false if unverified side-effects or non-retryable errors exist. */
  safeToAutoResume: boolean;
}

/** Maximum recovery attempts before escalating to the owner on Ask Me. */
export const MAX_RECOVERY_ATTEMPTS = 3;

/**
 * Classify a process exit or hook error into a structured failure kind.
 */
export function classifyTaskFailure(input: {
  exitCode?: number | null;
  stderr?: string;
  hookError?: string;
}): { kind: TaskFailureKind; retryable: boolean; reason: string } {
  const err = (input.hookError || '').toLowerCase();
  const stderr = (input.stderr || '').toLowerCase();
  const combined = `${err} ${stderr}`;
  const code = input.exitCode;

  if (combined.includes('rate_limit') || combined.includes('rate limit') || combined.includes('429') || combined.includes('quota')) {
    return {
      kind: 'rate_limit',
      retryable: true,
      reason: 'Provider rate limit or quota exceeded.'
    };
  }

  if (combined.includes('auth') || combined.includes('unauthorized') || combined.includes('invalid api key') || combined.includes('401')) {
    return {
      kind: 'auth_failure',
      retryable: false,
      reason: 'Authentication failed. Provider credentials require human update.'
    };
  }

  if (combined.includes('timeout') || combined.includes('etimedout') || combined.includes('timed out')) {
    return {
      kind: 'timeout',
      retryable: true,
      reason: 'Provider connection timed out.'
    };
  }

  if (combined.includes('unsupported') || combined.includes('command not found') || code === 127) {
    return {
      kind: 'unsupported_tool',
      retryable: false,
      reason: 'Tool or provider executable not supported/installed.'
    };
  }

  if (code !== 0 && code !== undefined && code !== null) {
    return {
      kind: 'process_crash',
      retryable: true,
      reason: `Process exited abnormally with code ${code}.`
    };
  }

  return {
    kind: 'unknown',
    retryable: true,
    reason: 'Interrupted by unexpected state.'
  };
}

/**
 * Evaluates whether a recovery checkpoint is safe to resume automatically
 * without human confirmation.
 *
 * Golden Rule: Never replay an unverified side effect (e.g. sending an email or API charge).
 */
export function validateRecoverySafety(checkpoint: TaskRecoveryCheckpoint): {
  safe: boolean;
  reason?: string;
} {
  if (checkpoint.recoveryAttempts >= MAX_RECOVERY_ATTEMPTS) {
    return {
      safe: false,
      reason: `Exceeded maximum automated recovery attempts (${MAX_RECOVERY_ATTEMPTS}). Requires owner intervention.`
    };
  }

  if (checkpoint.failureKind === 'auth_failure' || checkpoint.failureKind === 'unsupported_tool') {
    return {
      safe: false,
      reason: `Cannot auto-resume: ${checkpoint.failureKind} requires configuration changes.`
    };
  }

  // Idempotency check: if any side-effect is unverified, auto-recovery MUST be blocked.
  const unverified = checkpoint.sideEffects.filter((se) => !se.verified);
  if (unverified.length > 0) {
    const types = unverified.map((u) => u.type).join(', ');
    return {
      safe: false,
      reason: `Unverified external side-effects present (${types}). Human verification required to prevent duplicate execution.`
    };
  }

  return { safe: true };
}

/**
 * Creates a clean recovery checkpoint from in-flight task execution.
 */
export function createRecoveryCheckpoint(params: {
  taskId: string;
  taskTitle: string;
  originalProvider: AgentProvider;
  completedSteps?: string[];
  remainingWork?: string;
  outputFiles?: string[];
  sideEffects?: SideEffectRecord[];
  failureInput: { exitCode?: number | null; stderr?: string; hookError?: string };
  recoveryAttempts?: number;
}): TaskRecoveryCheckpoint {
  const classification = classifyTaskFailure(params.failureInput);
  const attempts = params.recoveryAttempts ?? 0;
  const sideEffects = params.sideEffects ?? [];

  const rawCheckpoint: TaskRecoveryCheckpoint = {
    taskId: params.taskId,
    taskTitle: params.taskTitle,
    originalProvider: params.originalProvider,
    checkpointAt: new Date().toISOString(),
    completedSteps: params.completedSteps ?? [],
    remainingWork: params.remainingWork ?? 'Complete remaining objectives.',
    outputFiles: params.outputFiles ?? [],
    sideEffects,
    failureKind: classification.kind,
    failureDetail: classification.reason,
    recoveryAttempts: attempts + 1,
    safeToAutoResume: false
  };

  const safety = validateRecoverySafety(rawCheckpoint);
  rawCheckpoint.safeToAutoResume = safety.safe;
  if (!safety.safe && !rawCheckpoint.failureDetail) {
    rawCheckpoint.failureDetail = safety.reason;
  }

  return rawCheckpoint;
}

/**
 * Synthesizes a portable, provider-agnostic handoff prompt for the target engine
 * (e.g. Codex, Gemini, Antigravity, or Claude) without relying on Claude-specific JSONL transcripts.
 */
export function buildProviderHandoffPrompt(
  checkpoint: TaskRecoveryCheckpoint,
  targetProvider: AgentProvider
): string {
  const lines: string[] = [
    `# TASK RESUMPTION & RECOVERY BRIEF`,
    `You are picking up Task [${checkpoint.taskId}]: "${checkpoint.taskTitle}".`,
    `Previous worker engine: ${checkpoint.originalProvider}. Target engine: ${targetProvider}.`,
    `Checkpoint timestamp: ${checkpoint.checkpointAt}.`,
    ''
  ];

  if (checkpoint.completedSteps.length > 0) {
    lines.push('## Verified Completed Milestones (DO NOT RE-RUN):');
    for (const step of checkpoint.completedSteps) {
      lines.push(`- [x] ${step}`);
    }
    lines.push('');
  }

  if (checkpoint.outputFiles.length > 0) {
    lines.push('## Verified Output Files on Disk:');
    for (const file of checkpoint.outputFiles) {
      lines.push(`- \`${file}\``);
    }
    lines.push('');
  }

  lines.push('## Remaining Work to Complete:');
  lines.push(checkpoint.remainingWork);
  lines.push('');

  if (checkpoint.sideEffects.length > 0) {
    lines.push('## Verified External Side-Effects:');
    for (const se of checkpoint.sideEffects) {
      lines.push(`- ${se.type} ${se.target ? `(target: ${se.target})` : ''} - Status: ${se.verified ? 'Verified' : 'Unverified'}`);
    }
    lines.push('Do NOT repeat any verified external side-effects listed above.');
    lines.push('');
  }

  lines.push('## Instructions:');
  lines.push('Pick up the work immediately starting from the remaining work section. Use the existing output files and report completion when done.');

  return lines.join('\n');
}
