/** Business calendar permissions shared by future broker and hook checks.
 * No UI or network code. Claude account connectors keep their existing rules.
 */
export type CalendarAccess = 'book' | 'approval' | 'read';

export interface CalendarGrant {
  calendar: string;
  access: CalendarAccess;
}

/** Metadata only. Credentials remain in the integration secret store. */
export interface CalendarAccount {
  id: string;
  label: string;
  provider: 'icloud' | 'fastmail' | 'zoho' | 'caldav';
  serverUrl: string;
  username: string;
  secretRef: string;
  calendars: Array<{ id: string; url: string; name: string; enabled: boolean }>;
  status: 'connected' | 'needs-attention';
  statusReason?: string;
}

export interface CalendarAccessConfig {
  calendarAccounts?: CalendarAccount[];
  agentCapabilities?: { [agentId: string]: { calendars?: CalendarGrant[] } };
}

export type CalendarOp = 'list' | 'read' | 'propose' | 'write';
export type CalendarAccessResult = { ok: true } | { ok: false; reason: string };

/** Tool names come from callers. No Object.prototype entry is a known tool. */
export const CALENDAR_TOOL_OPS: Record<string, CalendarOp> = Object.assign(Object.create(null) as Record<string, CalendarOp>, {
  list_calendars: 'list', search_events: 'read', free_busy: 'read',
  propose_event: 'propose', create_event: 'write', update_event: 'write', cancel_event: 'write'
});

const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)
  && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const own = (v: Record<string, unknown>, key: string): unknown =>
  Object.prototype.hasOwnProperty.call(v, key) ? v[key] : undefined;
const validId = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && v === v.trim() && v !== '*';

/** Deny absent, malformed or ambiguous configuration, including inherited
 * agent IDs. List exposes only enabled calendars with valid grants. A named
 * list checks that calendar too; an unnamed list needs at least one usable grant.
 *
 * A proposal ID is untrusted input, never proof of approval. Approval writes
 * stay denied here until a trusted workflow verifies and executes the stored
 * approved change. This foundation does not implement that workflow.
 */
export function calendarAccess(cfg: unknown, agentId: unknown, calendarId: unknown, op: unknown, _proposalId?: unknown): CalendarAccessResult {
  const deny = (reason: string): CalendarAccessResult => ({ ok: false, reason });
  if (op !== 'list' && op !== 'read' && op !== 'propose' && op !== 'write') {
    return deny('Unknown calendar operation.');
  }
  if (!record(cfg) || !validId(agentId)) return deny('Business calendar permissions are not available.');
  const caps = own(cfg, 'agentCapabilities');
  const agent = record(caps) ? own(caps, agentId) : undefined;
  const grants = record(agent) ? own(agent, 'calendars') : undefined;
  if (!Array.isArray(grants) || !grants.length) return deny('The owner has not given you business calendar access. Ask for access on your Access tab.');
  const access = new Map<string, CalendarAccess>();
  // Array iteration includes sparse slots, so malformed entries cannot be skipped.
  for (const grant of grants) {
    if (!record(grant)) return deny('Business calendar permissions are not valid.');
    const id = own(grant, 'calendar');
    const level = own(grant, 'access');
    if (!validId(id) || (level !== 'read' && level !== 'approval' && level !== 'book') || access.has(id)) {
      return deny('Business calendar permissions are not valid.');
    }
    access.set(id, level);
  }
  const accounts = own(cfg, 'calendarAccounts');
  if (!Array.isArray(accounts)) return deny('Business calendars are not configured.');
  const enabled = new Set<string>();
  const known = new Set<string>();
  const accountIds = new Set<string>();
  for (const account of accounts) {
    if (!record(account)) return deny('Business calendar configuration is not valid.');
    const accountId = own(account, 'id');
    const calendars = own(account, 'calendars');
    const status = own(account, 'status');
    if (!validId(accountId) || accountIds.has(accountId) || !Array.isArray(calendars)
      || (status !== 'connected' && status !== 'needs-attention')) return deny('Business calendar configuration is not valid.');
    accountIds.add(accountId);
    for (const calendar of calendars) {
      if (!record(calendar)) return deny('Business calendar configuration is not valid.');
      const id = own(calendar, 'id');
      const on = own(calendar, 'enabled');
      if (!validId(id) || typeof on !== 'boolean' || known.has(id)) return deny('Business calendar configuration is not valid.');
      known.add(id);
      if (on && status === 'connected') enabled.add(id);
    }
  }
  if (op === 'list' && calendarId === undefined) {
    return [...access.keys()].some((id) => enabled.has(id)) ? { ok: true } : deny('You have no enabled business calendars. Ask the owner to check Settings.');
  }
  if (!validId(calendarId) || !access.has(calendarId) || !enabled.has(calendarId)) {
    return deny('This business calendar is unavailable or not granted to you. Ask the owner to check Settings and your Access tab.');
  }
  const level = access.get(calendarId);
  if (op === 'list' || op === 'read') return { ok: true };
  if (op === 'propose' && level === 'approval') return { ok: true };
  if (op === 'write' && level === 'book') return { ok: true };
  if (op === 'propose' && level === 'book') return deny('You can book without approval. Make the change yourself instead of proposing it.');
  if (op === 'write' && level === 'approval') return deny('Booking requires a trusted approval workflow to verify the exact approved change.');
  return deny('You are Read only on your Access tab. Ask the owner before making calendar changes.');
}
