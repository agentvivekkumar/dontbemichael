/** Authenticated broker routes. Client supplied agent IDs are never accepted. */
import type { CalendarService } from './calendar';
import type { CalendarAccountConfig } from './calendarAccounts';
import { calendarAccess } from '../shared/calendars';
import { calendarToolAccess, validateCalendarToolRequest } from '../shared/calendarTools';
import { calendarAvailability, validateRange } from './calendarEvents';

export async function handleCalendarRequest(service: CalendarService, deps: { getConfig(): CalendarAccountConfig; present(id: string): boolean }, agentId: string, tool: unknown, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const deny = () => ({ status: 403, body: { error: 'The requested calendar access is not available. Use list_calendars to see your current access.', code: 'denied' } });
  const check = () => calendarToolAccess(deps.getConfig(), agentId, tool, body, deps.present);
  try {
    const access = check();
    if (!access.ok) {
      const shape = validateCalendarToolRequest(tool, body);
      return shape.ok ? deny() : { status: 400, body: { error: shape.reason, code: 'invalid' } };
    }
    const { request } = access;
    let result: Record<string, unknown>;
    if (request.tool === 'list_calendars') {
      const cfg = deps.getConfig();
      const calendars = (cfg.calendarAccounts ?? []).flatMap((a) => a.calendars.filter((c) => calendarAccess(cfg, agentId, c.id, 'read').ok).map((c) => ({ calendar: c.id, name: c.name,
        access: cfg.agentCapabilities?.[agentId]?.calendars?.find((g) => g.calendar === c.id)?.access, read_only: true })));
      // No account IDs, server URLs, usernames or secret handles go to agents.
      result = { calendars };
    } else {
      const events = await Promise.all(request.calendars.map((id) => service.events(id, request.range!, { kind: 'agent', agentId })));
      if (!check().ok) return deny();
      const error = events.find((r) => !r.ok);
      if (error && !error.ok) return { status: error.code === 'denied' || error.code === 'changed' ? 403 : 503, body: { code: error.code, error: error.error } };
      const rows = events.flatMap((r) => r.ok ? r.value : []);
      if (request.tool === 'search_events') {
        const text = request.text!.toLocaleLowerCase();
        const matches = rows.filter((e) => !text || [e.uid, e.summary, e.location, e.description].some((v) => v?.toLocaleLowerCase().includes(text)));
        result = { calendar: request.calendars[0], events: matches.slice(0, request.limit), total: matches.length, limited: matches.length > request.limit! };
      } else {
        const availability = calendarAvailability(rows, validateRange(request.range));
        result = { calendars: request.calendars, ...availability };
      }
    }
    if (!check().ok) return deny();
    if (Buffer.byteLength(JSON.stringify(result)) > 4 * 1024 * 1024) return { status: 413, body: { error: 'The calendar result is too large. Use a smaller time range.', code: 'too-large' } };
    return { status: 200, body: result };
  } catch { return { status: 503, body: { error: 'A reliable calendar result could not be read. Try again or ask the owner to check Settings.', code: 'unavailable' } }; }
}
