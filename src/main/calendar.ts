/** Read only CalDAV service. Credentials are materialized only in main and
 * passed directly to the HTTPS transport. No server or exception text is logged.
 */
import { createHash } from 'node:crypto';
import type { CalendarAccount } from '../shared/calendars';
import { calendarAccess } from '../shared/calendars';
import { calendarAccountId, calendarRecord } from '../shared/calendarAccounts';
import type { CalendarAvailability, CalendarDiscovery, CalendarEvent, CalendarResult, DiscoveredCalendar } from '../shared/calendarRead';
import type { CalendarAccounts, CalendarAccountConfig } from './calendarAccounts';
import { CaldavError, calendarFailure, httpStatus } from './caldavErrors';
import { CaldavTransport, DAV_TIMEOUT_MS, davOriginAllowed, davUrl } from './caldavTransport';
import { CAL, DAV, DAV_DECL, children, davResources, leaf, one, property, propfindBody, type DavResource } from './caldavXml';
import { MAX_CALENDAR_EVENTS, calendarAvailability, davTime, parseCalendarEvents, validateRange } from './calendarEvents';

/** Context comes from trusted main code, never from an IPC request body. Future
 * agent callers must use their authenticated agent ID. Owner IPC has no agent.
 */
export type CalendarReadContext = { kind: 'owner' } | { kind: 'agent'; agentId: string };
export interface CalendarServiceDeps {
  accounts: CalendarAccounts;
  getConfig(): CalendarAccountConfig;
  getSecret(ref: string): string | undefined;
  transport?: CaldavTransport;
}
const sameAccount = (a: CalendarAccount, b: CalendarAccount) => JSON.stringify(a) === JSON.stringify(b);
function readContext(input: unknown): CalendarReadContext {
  if (!calendarRecord(input) || !Object.prototype.hasOwnProperty.call(input, 'kind')) throw new CaldavError('denied');
  if (input.kind === 'owner' && Object.keys(input).length === 1) return { kind: 'owner' };
  if (input.kind === 'agent' && Object.keys(input).length === 2 && Object.prototype.hasOwnProperty.call(input, 'agentId')
    && typeof input.agentId === 'string' && input.agentId.trim()) return { kind: 'agent', agentId: input.agentId };
  throw new CaldavError('denied');
}

/** A broken server must not reflect authentication material into metadata,
 * event results or configuration. Reject reflected values, including after
 * XML/iCalendar unescaping, rather than rewriting calendar content.
 */
function credentialSafe(value: unknown, username: string, password: string): void {
  const auth = Buffer.from(`${username}:${password}`, 'utf8').toString('base64');
  const visit = (v: unknown): void => {
    if (typeof v === 'string' && (v.includes(password) || v.includes(auth))) throw new CaldavError('malformed');
    if (v && typeof v === 'object') for (const item of Object.values(v)) visit(item);
  };
  visit(value);
}

export class CalendarService {
  private transport: CaldavTransport;
  constructor(private deps: CalendarServiceDeps) { this.transport = deps.transport ?? new CaldavTransport(); }

  private account(id: unknown): CalendarAccount {
    if (!calendarAccountId(id)) throw new CaldavError('invalid');
    const listed = this.deps.accounts.list();
    if (!listed.ok) throw new CaldavError('invalid');
    const account = listed.accounts.find((a) => a.id === id);
    if (!account) throw new CaldavError('not-found');
    return account;
  }
  private guard(snapshot: CalendarAccount, calendarId?: string, context?: CalendarReadContext): void {
    const current = this.account(snapshot.id);
    if (!sameAccount(current, snapshot)) throw new CaldavError('changed');
    if (calendarId !== undefined) {
      if (!context || (context.kind !== 'owner' && context.kind !== 'agent')) throw new CaldavError('denied');
      if (current.status !== 'connected' || !current.calendars.some((c) => c.id === calendarId && c.enabled)) throw new CaldavError('denied');
      if (context.kind === 'agent' && !calendarAccess(this.deps.getConfig(), context.agentId, calendarId, 'read').ok) throw new CaldavError('denied');
    }
  }
  private password(account: CalendarAccount): string {
    let password: string | undefined;
    try { password = this.deps.getSecret(account.secretRef); } catch { /* sanitized below */ }
    if (!password) throw new CaldavError('credentials');
    return password;
  }
  private async request(account: CalendarAccount, password: string, url: string, depth: '0' | '1', body: string, signal: AbortSignal, guard: () => void, method: 'PROPFIND' | 'REPORT' = 'PROPFIND') {
    const response = await this.transport.request({ url, origin: account.serverUrl, provider: account.provider,
      method, depth, body, username: account.username, password, signal, guard });
    httpStatus(response.status);
    const contentType = response.headers['content-type'];
    if (contentType && !/^(?:application|text)\/xml(?:\s*;|$)/i.test(contentType)) throw new CaldavError('malformed');
    return { url: response.url, resources: davResources(response.body) };
  }
  private target(account: CalendarAccount, href: string, base: string): string {
    const url = davUrl(href, base);
    if (!davOriginAllowed(davUrl(account.serverUrl), url, account.provider)) throw new CaldavError('security');
    return url.href;
  }
  private resourceAt(resources: DavResource[], url: string, account: CalendarAccount, base: string): DavResource {
    const matches = resources.filter((r) => this.target(account, r.href, base) === url);
    if (matches.length !== 1) throw new CaldavError('malformed');
    return matches[0];
  }

  private async discover(account: CalendarAccount, password: string, signal: AbortSignal): Promise<CalendarDiscovery> {
    const guard = () => this.guard(account);
    let start;
    try { start = await this.request(account, password, account.serverUrl, '0', propfindBody('<D:current-user-principal/>'), signal, guard); }
    catch (e) {
      // Standard well known discovery is useful for hosted services and
      // Nextcloud when the owner entered the HTTPS origin rather than a DAV path.
      if (!(e instanceof CaldavError) || e.code !== 'not-found' || new URL(account.serverUrl).pathname !== '/') throw e;
      start = await this.request(account, password, new URL('/.well-known/caldav', account.serverUrl).href, '0', propfindBody('<D:current-user-principal/>'), signal, guard);
    }
    const current = this.resourceAt(start.resources, start.url, account, start.url);
    const principalProperty = property(current, DAV, 'current-user-principal', true)!;
    const principalHref = leaf(one(principalProperty, DAV, 'href', true)!).trim();
    const principal = this.target(account, principalHref, start.url);
    const p = await this.request(account, password, principal, '0', propfindBody('<C:calendar-home-set/>'), signal, guard);
    const homeProperty = property(this.resourceAt(p.resources, p.url, account, p.url), CAL, 'calendar-home-set', true)!;
    const homes = children(homeProperty, DAV, 'href');
    // Multiple homes cannot be persisted under the Phase 2A single origin
    // account contract without weakening credential confinement.
    if (homes.length !== 1) throw new CaldavError('unsupported');
    const home = this.target(account, leaf(homes[0]).trim(), p.url);
    const listing = await this.request(account, password, home, '1', propfindBody('<D:resourcetype/><D:displayname/><C:supported-calendar-component-set/><D:supported-report-set/><D:current-user-privilege-set/>'), signal, guard);
    const homeUrl = davUrl(listing.url);
    const calendars: DiscoveredCalendar[] = [];
    const known = new Set<string>();
    for (const resource of listing.resources) {
      const url = this.target(account, resource.href, listing.url);
      if (known.has(url)) throw new CaldavError('malformed');
      known.add(url);
      const type = property(resource, DAV, 'resourcetype', true)!;
      if (!one(type, CAL, 'calendar')) continue;
      if (davUrl(url).origin !== homeUrl.origin) throw new CaldavError('security');
      const name = property(resource, DAV, 'displayname');
      if (name && (leaf(name).length > 120 || /[\u0000-\u001f\u007f]/.test(leaf(name)))) throw new CaldavError('malformed');
      const componentSet = property(resource, CAL, 'supported-calendar-component-set');
      const components = componentSet ? children(componentSet, CAL, 'comp').map((c) => c.attrs.name) : undefined;
      if (components?.some((c) => !c || c.length > 60)) throw new CaldavError('malformed');
      const reports = property(resource, DAV, 'supported-report-set', true)!;
      const supportsQuery = children(reports, DAV, 'supported-report').some((supported) => {
        const report = one(supported, DAV, 'report', true)!;
        return !!one(report, CAL, 'calendar-query');
      });
      const privileges = property(resource, DAV, 'current-user-privilege-set');
      const readable = privileges ? children(privileges, DAV, 'privilege').some((privilege) => !!one(privilege, DAV, 'read') || !!one(privilege, DAV, 'all')) : undefined;
      calendars.push({ url, ...(name ? { name: leaf(name) } : {}), ...(components ? { components } : {}), supportsQuery, ...(readable === undefined ? {} : { readable }) });
      if (calendars.length > 200) throw new CaldavError('too-large');
    }
    // An entirely empty or non-collection response is not discovery evidence.
    const homeResource = this.resourceAt(listing.resources, listing.url, account, listing.url);
    if (!one(property(homeResource, DAV, 'resourcetype', true)!, DAV, 'collection')) throw new CaldavError('malformed');
    return { homeUrl: homeUrl.href, calendars };
  }

  async testConnection(id: unknown): Promise<CalendarResult<CalendarDiscovery>> {
    let account: CalendarAccount | undefined;
    try {
      account = this.account(id);
      const password = this.password(account);
      const result = await this.discover(account, password, AbortSignal.timeout(DAV_TIMEOUT_MS));
      credentialSafe(result, account.username, password);
      this.guard(account);
      const usable = result.calendars.filter((c) => (!c.components || c.components.includes('VEVENT')) && c.readable !== false);
      if (usable.some((c) => !c.supportsQuery)) throw new CaldavError('unsupported');
      const calendars = usable.map((c) => {
        const before = account!.calendars.find((known) => davUrl(known.url).href === c.url);
        return { id: before?.id ?? `cal-${createHash('sha256').update(`${account!.id}\n${c.url}`).digest('hex').slice(0, 32)}`,
          url: c.url, name: c.name?.trim() || before?.name || c.url.slice(0, 120), enabled: before?.enabled ?? false };
      });
      if (!this.deps.accounts.applyConnectionResult(account, { serverUrl: result.homeUrl, calendars }).ok) throw new CaldavError('storage');
      return { ok: true, value: result };
    } catch (e) {
      if (account) {
        // Preserve the current password/config if they changed while this test
        // was running. Failed or unverified discovery never marks connected.
        const reason = calendarFailure<never>(e);
        if (!reason.ok) this.deps.accounts.applyConnectionResult(account, undefined, reason.error);
      }
      return calendarFailure(e);
    }
  }

  async events(calendarId: unknown, input: unknown, context: CalendarReadContext): Promise<CalendarResult<CalendarEvent[]>> {
    let account: CalendarAccount | undefined;
    try {
      const range = validateRange(input);
      const caller = readContext(context);
      if (!calendarAccountId(calendarId)) throw new CaldavError('denied');
      const listed = this.deps.accounts.list();
      if (!listed.ok) throw new CaldavError('invalid');
      account = listed.accounts.find((a) => a.calendars.some((c) => c.id === calendarId));
      if (!account) throw new CaldavError('not-found');
      const snapshot = account;
      const guard = () => this.guard(snapshot, calendarId, caller);
      guard();
      const password = this.password(account);
      const calendar = account.calendars.find((c) => c.id === calendarId)!;
      // A server can filter DATE/floating values using its own default zone.
      // Cover the maximum difference between two RFC UTC offsets, then filter
      // concrete instances locally. Otherwise an all-day conflict could be
      // omitted before we interpret its explicit context zone.
      const padding = 48 * 3600_000;
      const stamp = (ms: number) => davTime(new Date(ms).toISOString().replace('.000Z', 'Z'));
      const start = stamp(range.startMs - padding), end = stamp(range.endMs + padding);
      const body = `<?xml version="1.0" encoding="utf-8"?><C:calendar-query ${DAV_DECL}><D:prop><D:getetag/><C:calendar-data><C:expand start="${start}" end="${end}"/></C:calendar-data></D:prop><C:filter><C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT"><C:time-range start="${start}" end="${end}"/></C:comp-filter></C:comp-filter></C:filter></C:calendar-query>`;
      const result = await this.request(account, password, calendar.url, '1', body, AbortSignal.timeout(DAV_TIMEOUT_MS), guard, 'REPORT');
      const events: CalendarEvent[] = [];
      const resources = new Set<string>();
      const eventIds = new Set<string>();
      const uidResources = new Map<string, string>();
      for (const resource of result.resources) {
        const url = this.target(account, resource.href, result.url);
        // REPORT data must be a resource inside the requested collection.
        const collection = davUrl(calendar.url);
        const target = davUrl(url);
        const prefix = collection.pathname.replace(/\/?$/, '/');
        if (target.origin !== collection.origin || !target.pathname.startsWith(prefix) || resources.has(url)) throw new CaldavError('malformed');
        resources.add(url);
        const data = leaf(property(resource, CAL, 'calendar-data', true)!);
        const etagNode = property(resource, DAV, 'getetag');
        const etag = etagNode ? leaf(etagNode) : undefined;
        if (etag && (etag.length > 512 || /[\u0000-\u001f\u007f]/.test(etag))) throw new CaldavError('malformed');
        const parsed = parseCalendarEvents(data, range, etag);
        for (const event of parsed) {
          if (uidResources.has(event.uid) && uidResources.get(event.uid) !== url) throw new CaldavError('malformed');
          uidResources.set(event.uid, url);
          const key = JSON.stringify([event.uid, event.recurrenceId ?? null]);
          if (eventIds.has(key)) throw new CaldavError('malformed');
          eventIds.add(key); events.push(event);
        }
        if (events.length > MAX_CALENDAR_EVENTS) throw new CaldavError('too-large');
      }
      guard();
      credentialSafe(events, account.username, password);
      return { ok: true, value: events };
    } catch (e) {
      if (account && e instanceof CaldavError && ['authentication', 'forbidden', 'credentials'].includes(e.code)) {
        const failed = calendarFailure(e);
        if (!failed.ok) this.deps.accounts.applyConnectionResult(account, undefined, failed.error);
      }
      return calendarFailure(e);
    }
  }

  async availability(calendarId: unknown, input: unknown, context: CalendarReadContext): Promise<CalendarResult<CalendarAvailability>> {
    const result = await this.events(calendarId, input, context);
    if (!result.ok) return result;
    try { return { ok: true, value: calendarAvailability(result.value, validateRange(input)) }; }
    catch (e) { return calendarFailure(e); }
  }
}
