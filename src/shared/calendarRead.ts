/** Read only calendar results. No authentication material crosses this API. */
export type CalendarErrorCode = 'invalid' | 'denied' | 'credentials' | 'authentication' | 'forbidden' | 'not-found'
  | 'rate-limit' | 'server' | 'network' | 'timeout' | 'security' | 'too-large' | 'malformed' | 'unsupported' | 'changed' | 'storage';
export type CalendarResult<T> = { ok: true; value: T } | { ok: false; code: CalendarErrorCode; error: string };
export interface CalendarRange { start: string; end: string; timeZone?: string }
export interface CalendarDateTime { value: string; allDay: boolean; tzid?: string }
export interface CalendarEvent {
  uid: string;
  summary?: string;
  start: CalendarDateTime;
  end?: CalendarDateTime;
  duration?: string;
  location?: string;
  description?: string;
  status?: string;
  transparency?: string;
  recurrenceId?: CalendarDateTime;
  etag?: string;
  /** UTC instants computed only when the time interpretation is unambiguous. */
  startUtc: string;
  endUtc?: string;
}
export interface CalendarAvailability { busy: Array<{ start: string; end: string }>; free: Array<{ start: string; end: string }> }
export interface DiscoveredCalendar {
  url: string;
  name?: string;
  components?: string[];
  supportsQuery: boolean;
  readable?: boolean;
}
export interface CalendarDiscovery { homeUrl: string; calendars: DiscoveredCalendar[] }
