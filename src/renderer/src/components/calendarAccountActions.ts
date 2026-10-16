import type { CalendarAccount } from '@shared/calendars';
import { validateCalendarAccountSettings, type CalendarAccountSettings, type CalendarListResult, type CalendarSaveInput, type CalendarSaveResult } from '@shared/calendarAccounts';
import type { CalendarDiscovery, CalendarResult } from '@shared/calendarRead';

export const CALENDAR_SERVERS = {
  icloud: 'https://caldav.icloud.com/', fastmail: 'https://caldav.fastmail.com/',
  zoho: 'https://calendar.zoho.com/', caldav: ''
};
export type CalendarDraft = Omit<CalendarAccountSettings, 'calendars'>;
export interface CalendarAccountApi {
  calendarAccountsList(): Promise<CalendarListResult>;
  calendarAccountsAdd(input: CalendarSaveInput): Promise<CalendarSaveResult>;
  calendarAccountsUpdate(id: string, input: CalendarSaveInput): Promise<CalendarSaveResult>;
  calendarAccountsTest(id: string): Promise<CalendarResult<CalendarDiscovery>>;
}
/** Read fresh discovery metadata before a save. Never hydrate a stored password.
 * A failed connection leaves the saved account available for a safe retry.
 */
export async function saveCalendarDraft(api: CalendarAccountApi, draft: CalendarDraft, password: string | undefined, editing: boolean): Promise<{ ok: true } | { ok: false; code: string }> {
  try {
    const listed = await api.calendarAccountsList();
    if (!listed.ok) return { ok: false, code: 'settings' };
    const current: CalendarAccount | undefined = listed.accounts.find((a) => a.id === draft.id);
    if (editing && !current) return { ok: false, code: 'changed' };
    const sameLogin = current && current.provider === draft.provider && current.serverUrl === draft.serverUrl && current.username === draft.username;
    const account = { ...draft, calendars: sameLogin ? current.calendars : [] };
    if (!validateCalendarAccountSettings(account).ok || ((!current || !sameLogin) && !password)) return { ok: false, code: 'settings' };
    const input = { account, ...(password === undefined ? {} : { password }) };
    const saved = current ? await api.calendarAccountsUpdate(draft.id, input) : await api.calendarAccountsAdd(input);
    if (!saved.ok) return { ok: false, code: 'save' };
    const tested = await api.calendarAccountsTest(draft.id);
    return tested.ok ? { ok: true } : { ok: false, code: tested.code };
  } catch { return { ok: false, code: 'save' }; }
}
