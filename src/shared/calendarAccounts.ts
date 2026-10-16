/** Calendar account metadata validation. No credentials or network access. */
import type { CalendarAccount } from './calendars';

export type CalendarAccountSettings = Omit<CalendarAccount, 'secretRef' | 'status' | 'statusReason'>;
export type CalendarSaveInput = { account: CalendarAccountSettings; password?: string };
export type CalendarFailure = { ok: false; error: string };
export type CalendarSaveResult = { ok: true; record: CalendarAccount; cleanupPending: boolean } | CalendarFailure;
export type CalendarListResult = { ok: true; accounts: CalendarAccount[] } | CalendarFailure;
export type CalendarRemoveResult = { ok: true; affected: string[]; cleanupPending: boolean } | CalendarFailure;

export const CALENDAR_UNVERIFIED = 'Authentication has not been verified yet.';
export const CALENDAR_SETTINGS_INVALID = 'The calendar account settings are not valid. Check the account details and try again.';
export const calendarRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)
  && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const text = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= max && v === v.trim() && !/[\u0000-\u001f\u007f]/.test(v);
export const calendarAccountId = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(v) && v !== 'constructor' && v !== 'prototype';

/** HTTPS only, with no credentials, query secrets, fragments or traversal.
 * Self hosted HTTPS servers are supported. Future network code must validate
 * redirects independently before it forwards credentials to another origin.
 */
function calendarUrl(v: unknown): URL | undefined {
  if (!text(v, 2048) || !/^https:\/\//i.test(v) || /[\s\\]/.test(v)) return undefined;
  try {
    const u = new URL(v);
    const decoded = decodeURIComponent(v);
    if (!u.hostname || u.username || u.password || u.search || u.hash || v.includes('?') || v.includes('#')
      || /[\u0000-\u001f\u007f\\]/.test(decoded) || decoded.split('/').some((part) => part === '.' || part === '..')) return undefined;
    return u;
  } catch { return undefined; }
}

export function validateCalendarAccountSettings(input: unknown): { ok: true; value: CalendarAccountSettings } | CalendarFailure {
  const invalid = (): CalendarFailure => ({ ok: false, error: CALENDAR_SETTINGS_INVALID });
  const keys = ['id', 'label', 'provider', 'serverUrl', 'username', 'calendars'];
  if (!calendarRecord(input) || Object.keys(input).some((key) => !keys.includes(key))
    || keys.some((key) => !Object.prototype.hasOwnProperty.call(input, key))) return invalid();
  const { id, label, provider, serverUrl, username, calendars } = input;
  if (!calendarAccountId(id) || !text(label, 120) || !text(username, 320) || /\s/.test(username)
    || (provider !== 'icloud' && provider !== 'fastmail' && provider !== 'zoho' && provider !== 'caldav')) return invalid();
  const server = calendarUrl(serverUrl);
  if (!server || typeof serverUrl !== 'string' || !Array.isArray(calendars) || calendars.length > 200) return invalid();
  const ids = new Set<string>();
  const urls = new Set<string>();
  const value: CalendarAccountSettings['calendars'] = [];
  for (const c of calendars) {
    const calendarKeys = ['id', 'url', 'name', 'enabled'];
    if (!calendarRecord(c) || Object.keys(c).some((key) => !calendarKeys.includes(key))
      || calendarKeys.some((key) => !Object.prototype.hasOwnProperty.call(c, key))) return invalid();
    const url = calendarUrl(c.url);
    if (!calendarAccountId(c.id) || ids.has(c.id) || !url || typeof c.url !== 'string' || urls.has(url.href)
      || url.origin !== server.origin || !text(c.name, 120) || typeof c.enabled !== 'boolean') return invalid();
    ids.add(c.id);
    urls.add(url.href);
    value.push({ id: c.id, url: c.url, name: c.name, enabled: c.enabled });
  }
  return { ok: true, value: { id, label, provider, serverUrl, username, calendars: value } };
}

/** Only this namespace can be deleted by calendar account management. Each
 * credential version gets a fresh handle, so a failed save cannot overwrite
 * the password used by the previous account configuration.
 */
export const isCalendarSecretRef = (v: unknown): v is string =>
  typeof v === 'string' && /^calendar:[a-z0-9][a-z0-9-]{0,39}:[a-f0-9]{32}$/.test(v);

export function validateStoredCalendarAccount(input: unknown): CalendarAccount | undefined {
  if (!calendarRecord(input)) return undefined;
  const { secretRef, status, statusReason, ...settings } = input;
  const checked = validateCalendarAccountSettings(settings);
  if (!checked.ok || !isCalendarSecretRef(secretRef) || !secretRef.startsWith(`calendar:${checked.value.id}:`)
    || (status !== 'connected' && status !== 'needs-attention')
    || (statusReason !== undefined && !text(statusReason, 240))) return undefined;
  return { ...checked.value, secretRef, status, ...(statusReason === undefined ? {} : { statusReason }) };
}

/** Generic settings IPC must not bypass account validation, secret handling or
 * authentication status. Main process account operations use writeConfig.
 */
export function calendarSettingsPatchAllowed(patch: unknown): boolean {
  return calendarRecord(patch) && !Object.prototype.hasOwnProperty.call(patch, 'calendarAccounts')
    && !Object.prototype.hasOwnProperty.call(patch, 'calendarSecretCleanup');
}
