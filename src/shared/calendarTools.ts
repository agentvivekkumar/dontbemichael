/** Read only tool policy, shared by the hook, broker and spawn planning. */
import { validateCalendarToolRequest, type CalendarToolRequest } from '../../resources/calendar-tool-contract.cjs';
import { calendarAccess, type CalendarAccessConfig } from './calendars';
import { RESEARCH_ID } from './research';
export { validateCalendarToolRequest };

export function calendarToolAccess(cfg: CalendarAccessConfig, agentId: string | undefined, tool: unknown, args: unknown, present?: (id: string) => boolean):
  { ok: true; request: CalendarToolRequest } | { ok: false; reason: string } {
  const parsed = validateCalendarToolRequest(tool, args);
  if (!parsed.ok) return parsed;
  if (!agentId || agentId === RESEARCH_ID || (present && !present(agentId))) return { ok: false, reason: 'Calendar tools are only for current team members with explicit calendar access.' };
  const request = parsed.value;
  if (request.tool === 'list_calendars') {
    const access = calendarAccess(cfg, agentId, undefined, 'list');
    return access.ok ? { ok: true, request } : access;
  }
  for (const calendar of request.calendars) {
    const access = calendarAccess(cfg, agentId, calendar, 'read');
    if (!access.ok) return { ok: false, reason: 'You do not have access to every requested calendar. Use list_calendars to see yours.' };
  }
  return { ok: true, request };
}

/** Attach tools while a granted, enabled calendar awaits reconnection too.
 * Repair then takes effect without another restart; every call still uses the
 * full permission rule and refuses until the account is connected.
 */
export function hasCalendarTools(cfg: CalendarAccessConfig, agentId: string): boolean {
  if (agentId === RESEARCH_ID) return false;
  if (calendarAccess(cfg, agentId, undefined, 'list').ok) return true;
  try {
    const accounts = cfg.calendarAccounts?.map((a) => a.status === 'needs-attention' ? { ...a, status: 'connected' as const } : a);
    return calendarAccess({ ...cfg, calendarAccounts: accounts }, agentId, undefined, 'list').ok;
  } catch { return false; }
}
