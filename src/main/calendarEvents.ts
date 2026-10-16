/** iCalendar parsing only. Never evaluates RRULEs or invents occurrences.
 * ical.js handles content lines, parameters, escaping and folding. Strict
 * semantic checks below reject its permissive date normalization and unknown
 * timezones before availability is calculated.
 */
import ICAL from 'ical.js';
import type { CalendarAvailability, CalendarDateTime, CalendarEvent, CalendarRange } from '../shared/calendarRead';
import { CaldavError } from './caldavErrors';
import { parseCalendarRange } from '../../resources/calendar-tool-contract.cjs';

export const MAX_CALENDAR_EVENTS = 10_000;
export interface ReadRange extends CalendarRange { startMs: number; endMs: number }
export function validateRange(input: unknown): ReadRange {
  const parsed = parseCalendarRange(input);
  if (!parsed) throw new CaldavError('invalid');
  return parsed;
}
export const davTime = (iso: string): string => iso.replace(/[-:]/g, '');

type Component = InstanceType<typeof ICAL.Component>;
type Property = InstanceType<typeof ICAL.Property>;
function single(c: Component, name: string, required = false): Property | undefined {
  const props = c.getAllProperties(name);
  if (props.length > 1 || (required && !props.length)) throw new CaldavError('malformed');
  const prop = props[0];
  if (prop && prop.getValues().length !== 1) throw new CaldavError('malformed');
  return prop;
}
function text(c: Component, name: string, required = false): string | undefined {
  const p = single(c, name, required);
  if (!p) return undefined;
  const v = p.getFirstValue();
  if (typeof v !== 'string' || (required && !v)) throw new CaldavError('malformed');
  return v;
}

/** Resolve a wall clock using ICU's IANA zones. Explicitly reject DST gaps and
 * repeated wall times: neither should silently become an arbitrary booking.
 */
function wallToUtc(fields: number[], zone: string): number {
  const wall = Date.UTC(fields[0], fields[1] - 1, fields[2], fields[3], fields[4], fields[5]);
  if (zone === 'UTC') return wall;
  let format: Intl.DateTimeFormat;
  try { format = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }); }
  catch { throw new CaldavError('unsupported'); }
  const parts = (ms: number) => {
    const p = Object.fromEntries(format.formatToParts(ms).filter((x) => x.type !== 'literal').map((x) => [x.type, Number(x.value)]));
    return [p.year, p.month, p.day, p.hour, p.minute, p.second];
  };
  const offsets = new Set<number>();
  for (const delta of [-48, -24, -12, 0, 12, 24, 48]) {
    const probe = wall + delta * 3600_000;
    const p = parts(probe);
    offsets.add(Date.UTC(p[0], p[1] - 1, p[2], p[3], p[4], p[5]) - probe);
  }
  const matches = [...offsets].map((offset) => wall - offset).filter((ms) => parts(ms).every((v, i) => v === fields[i]));
  if (matches.length !== 1) throw new CaldavError('unsupported');
  return matches[0];
}

interface ParsedTime { value: CalendarDateTime; ms: number; fields: number[]; zone?: string }
function time(p: Property, contextZone?: string): ParsedTime {
  if (p.type !== 'date' && p.type !== 'date-time') throw new CaldavError('malformed');
  // Inspect the raw jCal value before ICAL.Time normalizes impossible dates.
  const raw = p.jCal[3];
  if (typeof raw !== 'string') throw new CaldavError('malformed');
  const allDay = p.type === 'date';
  const match = (allDay ? /^(\d{4})-(\d{2})-(\d{2})$/ : /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(Z)?$/).exec(raw);
  if (!match) throw new CaldavError('malformed');
  const fields = [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4] ?? 0), Number(match[5] ?? 0), Number(match[6] ?? 0)];
  const stamp = new Date(Date.UTC(fields[0], fields[1] - 1, fields[2], fields[3], fields[4], fields[5]));
  if (fields[0] < 1900 || fields[0] >= 2200 || [stamp.getUTCFullYear(), stamp.getUTCMonth() + 1, stamp.getUTCDate(), stamp.getUTCHours(), stamp.getUTCMinutes(), stamp.getUTCSeconds()].some((v, i) => v !== fields[i])) throw new CaldavError('malformed');
  const tzid = p.getParameter('tzid');
  if (tzid !== undefined && (typeof tzid !== 'string' || allDay || match[7])) throw new CaldavError('malformed');
  const zone = match[7] ? 'UTC' : (typeof tzid === 'string' ? tzid : contextZone);
  if (!zone) throw new CaldavError('unsupported');
  return { value: { value: raw, allDay, ...(typeof tzid === 'string' ? { tzid } : {}) },
    ms: wallToUtc(fields, zone), fields, zone };
}

export function parseCalendarEvents(ics: string, range: ReadRange, etag?: string): CalendarEvent[] {
  try {
    if (!/^BEGIN:VCALENDAR\r?\n/i.test(ics) || !/\r?\nEND:VCALENDAR\s*$/i.test(ics)) throw new CaldavError('malformed');
    // Bound the parser before hydration and reject extra calendars/trailing data.
    const unfolded = ics.replace(/\r?\n[ \t]/g, '');
    if (unfolded.split(/\r?\n/).some((line) => line.length > 256 * 1024)) throw new CaldavError('too-large');
    if ((unfolded.match(/^BEGIN:VCALENDAR$/gmi) ?? []).length !== 1 || unfolded.split(/\r?\n/).length > 100_000) throw new CaldavError('malformed');
    const stack: string[] = [];
    for (const line of unfolded.split(/\r?\n/)) {
      if (/^BEGIN:/i.test(line)) {
        stack.push(line.slice(6).toUpperCase());
        if (stack.length > 8) throw new CaldavError('too-large');
      } else if (/^END:/i.test(line) && stack.pop() !== line.slice(4).toUpperCase()) throw new CaldavError('malformed');
    }
    if (stack.length) throw new CaldavError('malformed');
    const root = new ICAL.Component(ICAL.parse(ics));
    if (root.name !== 'vcalendar' || text(root, 'version', true) !== '2.0' || root.hasProperty('method')) throw new CaldavError('malformed');
    // Expanded responses must not include timezone recurrence definitions.
    if (root.getAllSubcomponents().some((c) => c.name !== 'vevent')) throw new CaldavError('unsupported');
    const components = root.getAllSubcomponents('vevent');
    if (!components.length || components.length > MAX_CALENDAR_EVENTS) throw new CaldavError('malformed');
    const identities = new Set<string>();
    const events: CalendarEvent[] = [];
    let resourceUid: string | undefined;
    for (const event of components) {
      if (['rrule', 'rdate', 'exrule', 'exdate'].some((p) => event.hasProperty(p))) throw new CaldavError('unsupported');
      const uid = text(event, 'uid', true)!;
      if (resourceUid !== undefined && resourceUid !== uid) throw new CaldavError('malformed');
      resourceUid = uid;
      const recurrenceProp = single(event, 'recurrence-id');
      if (recurrenceProp?.getParameter('range') !== undefined) throw new CaldavError('unsupported');
      const recurrence = recurrenceProp ? time(recurrenceProp, range.timeZone) : undefined;
      const recurrenceId = recurrence?.value;
      const start = time(single(event, 'dtstart', true)!, range.timeZone);
      const identity = JSON.stringify([uid, recurrence?.ms ?? start.ms]);
      if (identities.has(identity)) throw new CaldavError('malformed');
      identities.add(identity);
      const endProp = single(event, 'dtend');
      const durationProp = single(event, 'duration');
      if (endProp && durationProp) throw new CaldavError('malformed');
      const end = endProp ? time(endProp, range.timeZone) : undefined;
      if (end && (end.value.allDay !== start.value.allDay || end.ms <= start.ms)) throw new CaldavError('malformed');
      let endMs = end?.ms;
      let duration: string | undefined;
      if (durationProp) {
        const raw = durationProp.jCal[3];
        if (typeof raw !== 'string' || !/^P(?:\d+W|(?:\d+D)?(?:T(?=\d)(?:\d+H)?(?:\d+M)?(?:\d+S)?)?)$/.test(raw) || raw === 'P') throw new CaldavError('malformed');
        const d = ICAL.Duration.fromString(raw);
        duration = raw;
        if (d.isNegative || d.toSeconds() <= 0 || d.toSeconds() > 366 * 86400 || (start.value.allDay && (d.hours || d.minutes || d.seconds))) throw new CaldavError('malformed');
        // RFC durations add nominal days before exact hours, preserving DST.
        const date = new Date(Date.UTC(start.fields[0], start.fields[1] - 1, start.fields[2] + d.weeks * 7 + d.days, start.fields[3], start.fields[4], start.fields[5]));
        endMs = wallToUtc([date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()], start.zone!)
          + (d.hours * 3600 + d.minutes * 60 + d.seconds) * 1000;
      }
      const status = text(event, 'status');
      const transparency = text(event, 'transp');
      if (status && !['TENTATIVE', 'CONFIRMED', 'CANCELLED'].includes(status.toUpperCase())) throw new CaldavError('unsupported');
      if (transparency && !['OPAQUE', 'TRANSPARENT'].includes(transparency.toUpperCase())) throw new CaldavError('unsupported');
      // Keep missing fields absent. Availability deals explicitly with unknown
      // event ends; a missing SUMMARY is not turned into an invented title.
      const result: CalendarEvent = { uid, start: start.value, startUtc: new Date(start.ms).toISOString(),
        ...(end ? { end: end.value } : {}), ...(endMs === undefined ? {} : { endUtc: new Date(endMs).toISOString() }),
        ...(duration === undefined ? {} : { duration }), ...(recurrenceId ? { recurrenceId } : {}), ...(etag === undefined ? {} : { etag }) };
      for (const [prop, key] of [['summary', 'summary'], ['location', 'location'], ['description', 'description'], ['status', 'status'], ['transp', 'transparency']] as const) {
        const v = text(event, prop);
        if (v !== undefined) result[key] = v;
      }
      if (start.ms < range.endMs && (endMs === undefined || endMs > range.startMs)) events.push(result);
    }
    return events;
  } catch (e) { throw e instanceof CaldavError ? e : new CaldavError('malformed'); }
}

export function calendarAvailability(events: CalendarEvent[], range: ReadRange): CalendarAvailability {
  const spans: Array<[number, number]> = [];
  for (const e of events) {
    if (e.status?.toUpperCase() === 'CANCELLED' || e.transparency?.toUpperCase() === 'TRANSPARENT') continue;
    if (e.endUtc === undefined) throw new CaldavError('unsupported');
    const start = Math.max(range.startMs, Date.parse(e.startUtc)), end = Math.min(range.endMs, Date.parse(e.endUtc));
    if (start < end) spans.push([start, end]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [start, end] of spans) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  const free: Array<[number, number]> = [];
  let cursor = range.startMs;
  for (const [start, end] of merged) { if (cursor < start) free.push([cursor, start]); cursor = end; }
  if (cursor < range.endMs) free.push([cursor, range.endMs]);
  const iso = ([start, end]: [number, number]) => ({ start: new Date(start).toISOString(), end: new Date(end).toISOString() });
  return { busy: merged.map(iso), free: free.map(iso) };
}
