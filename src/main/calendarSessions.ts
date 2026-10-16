import { hasCalendarTools } from '../shared/calendarTools';
import type { CalendarAccessConfig } from '../shared/calendars';

/** Claude loads MCP servers only at start. A repaired or re-enabled grant
 * must also reach a session that started without calendar tools. Revocations
 * take effect immediately in the policy and never wait for a restart.
 */
export class CalendarSessions {
  private sessions = new Map<string, { agentId: string; attached: boolean; told?: boolean }>();
  record(session: string, agentId: string, attached: boolean): void { this.sessions.set(session, { agentId, attached }); }
  remove(session: string): void { this.sessions.delete(session); }
  pending(cfg: CalendarAccessConfig, present: (id: string) => boolean): string[] {
    return [...new Set([...this.sessions.values()].filter((r) => !r.attached && present(r.agentId) && hasCalendarTools(cfg, r.agentId)).map((r) => r.agentId))];
  }
  changed(cfg: CalendarAccessConfig, present: (id: string) => boolean, notify: (id: string) => void): void {
    const pending = new Set(this.pending(cfg, present));
    for (const r of this.sessions.values()) {
      if (!pending.has(r.agentId)) { r.told = false; continue; }
      if (!r.told) { r.told = true; notify(r.agentId); }
    }
  }
}
