import type { CalendarErrorCode, CalendarResult } from '../shared/calendarRead';

const messages: Record<CalendarErrorCode, string> = {
  invalid: 'Check the calendar and a time range of at most 90 days, then try again.',
  denied: 'The owner has not given you access to this enabled calendar.',
  credentials: 'The saved calendar password is unavailable. Unlock the keychain or save the app password again.',
  authentication: 'The calendar login was refused. Check the username and app password in Settings.',
  forbidden: 'The calendar server refused access. Ask its administrator to check your calendar permissions.',
  'not-found': 'The calendar address was not found. Check the server address in Settings.',
  'rate-limit': 'The calendar server is limiting requests. Wait a while and try again.',
  server: 'The calendar server could not complete this request. Try again later.',
  network: 'The calendar server could not be reached securely. Check your connection and server address.',
  timeout: 'The calendar request took too long. Try a smaller time range or try again later.',
  security: 'The calendar address was blocked for security. Use a public HTTPS calendar server.',
  'too-large': 'The calendar response is too large. Try a smaller time range.',
  malformed: 'The calendar server returned incomplete or invalid data. No reliable schedule could be read.',
  unsupported: 'The calendar server returned a recurrence or time format that cannot be read reliably. No availability was assumed.',
  changed: 'The calendar settings or your access changed during this request. Try again.',
  storage: 'The calendar connection result could not be saved safely. Try again.'
};
export class CaldavError extends Error {
  constructor(readonly code: CalendarErrorCode) { super(messages[code]); }
}
export function calendarFailure<T>(error: unknown): CalendarResult<T> {
  const code = error instanceof CaldavError ? error.code : 'network';
  return { ok: false, code, error: messages[code] };
}
export function httpStatus(status: number): void {
  if (status === 401) throw new CaldavError('authentication');
  if (status === 403) throw new CaldavError('forbidden');
  if (status === 404 || status === 410) throw new CaldavError('not-found');
  if (status === 429) throw new CaldavError('rate-limit');
  if (status === 501) throw new CaldavError('unsupported');
  if (status >= 500) throw new CaldavError('server');
  if (status !== 207) throw new CaldavError(status === 400 || status === 405 || status === 415 || status === 501 ? 'unsupported' : 'malformed');
}
