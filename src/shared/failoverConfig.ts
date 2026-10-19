/**
 * Failover engine configuration: when the primary engine (Claude) hits a rate
 * limit or billing error, new work can be routed to a backup engine instead of
 * waiting. The backup engine must be in BUILD_ENGINES and installed.
 *
 * This is a shared configuration; the main process enforces it when dispatching
 * work during an office break.
 */
import type { AgentProvider } from './agentProvider';

export interface OfficeEnginePair {
  /** The primary engine running the office. */
  primaryEngine: AgentProvider;
  /** Primary model override. */
  primaryModel?: string;
  /** The standby secondary backup engine. */
  secondaryEngine?: AgentProvider;
  /** Secondary model override. */
  secondaryModel?: string;
  /** Automatically fail over when the primary engine is unavailable or stopped. */
  autoFailover: boolean;
}

export interface FailoverConfig {
  /** Whether automatic failover is enabled. */
  enabled: boolean;
  /** The engine to route new work to during an office break. */
  backupEngine: AgentProvider;
  /** Which stop reasons trigger failover (limit, credit, or signin). */
  triggerReasons: ('limit' | 'credit' | 'signin')[];
}

export const DEFAULT_FAILOVER: FailoverConfig = {
  enabled: false,
  backupEngine: 'gemini',
  triggerReasons: ['limit', 'credit', 'signin']
};

/** Whether this agent can be failed over to the backup engine. */
export function canFailover(
  provider: string | undefined,
  reason: string | undefined,
  config: FailoverConfig
): boolean {
  if (!config.enabled || !config.backupEngine) return false;
  // If already running on the backup engine, do not fail over again to itself
  if (provider === config.backupEngine) return false;
  return config.triggerReasons.includes(reason as 'limit' | 'credit' | 'signin');
}
