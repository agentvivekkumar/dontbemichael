/**
 * The breaker beat's cost bookkeeping, one live session at a time.
 *
 * The cost ledger (`costLifetime.ts`, `pulseBackfill.ts`) and Pulse
 * (`telemetryStore.ts` into `telemetryProcessor.ts`) both fold running totals
 * per (agent, session). They used to be fed the agent's aggregate, which sums
 * every session the agent has had in this process under the newest session's
 * id. After /clear (safeClearer types it into the live PTY) Claude Code goes on
 * under a new session id, so the first beat after the clear wrote a row for the
 * new session that also carried the old one's spend, and every dollar from
 * before the clear was counted twice in lifetime cost and in Pulse. Here each
 * session is recorded under its own id with its own totals.
 *
 * The ledger used to get one row per beat. One row per session per beat would
 * rewrite every idle session an agent ever had every 30 s, so a session gets a
 * ledger row only when its totals moved since its last one, the same rule Pulse
 * applies to its own points (telemetryStore `cost`). A skipped row carries
 * nothing: both folds count growth, and an unchanged total has none.
 *
 * No electron imports, so tests drive it directly.
 */
import type { AgentUsageSample } from './telemetry';

export interface SessionCostSinks {
  /** Append one row to the durable cost ledger. */
  ledger(sample: AgentUsageSample): void;
  /** Hand Pulse one running total (it drops repeats itself). */
  pulse(agentId: string, session: string, usd: number, tokens: number, model: string): void;
}

export class SessionCostRecorder {
  /** `agent \t session` → the totals of the last ledger row written for it. */
  private readonly lastRow = new Map<string, string>();

  /** Record each live session of one agent under its own id. */
  record(samples: AgentUsageSample[], sinks: SessionCostSinks): void {
    for (const s of samples) {
      if (!s.sessionId) continue;
      const tokens = s.input + s.output + s.cacheRead + s.cacheCreation;
      const key = `${s.agentId}\t${s.sessionId}`;
      const sig = `${s.usd}|${tokens}`;
      if (this.lastRow.get(key) !== sig) {
        this.lastRow.set(key, sig);
        sinks.ledger(s);
      }
      sinks.pulse(s.agentId, s.sessionId, s.usd, tokens, s.model);
    }
  }
}
