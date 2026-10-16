'use strict';
// Shared verb/argument contract for the stdio server, broker and hook. No IO.
const record = (v) => !!v && typeof v === 'object' && !Array.isArray(v)
  && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const id = (v) => typeof v === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(v) && v !== 'constructor' && v !== 'prototype';
const range = (input) => {
  if (!record(input) || Object.keys(input).some((k) => !['start', 'end', 'timeZone'].includes(k))) return null;
  const { start, end, timeZone } = input;
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
  if (typeof start !== 'string' || typeof end !== 'string' || !iso.test(start) || !iso.test(end)) return null;
  const startMs = Date.parse(start), endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || new Date(startMs).toISOString().replace('.000Z', 'Z') !== start
    || new Date(endMs).toISOString().replace('.000Z', 'Z') !== end || endMs <= startMs || endMs - startMs > 90 * 86400_000
    || startMs < Date.UTC(1900, 0) || endMs >= Date.UTC(2200, 0)) return null;
  if (timeZone !== undefined) {
    if (typeof timeZone !== 'string' || !timeZone || timeZone.length > 100) return null;
    try { new Intl.DateTimeFormat('en', { timeZone }); } catch { return null; }
  }
  return { start, end, ...(timeZone === undefined ? {} : { timeZone }), startMs, endMs };
};
const properties = {
  start: { type: 'string', description: 'Inclusive UTC start, for example 2026-10-16T00:00:00Z.' },
  end: { type: 'string', description: 'Exclusive UTC end, at most 90 days after start.' },
  time_zone: { type: 'string', description: 'Explicit IANA timezone for floating and all day events, for example America/Los_Angeles. Unknown or ambiguous time interpretation is refused.' }
};
const TOOLS = [
  { name: 'list_calendars', description: 'List only the enabled, connected calendars the owner granted you. These tools only read, regardless of your configured approval or booking level. They cannot propose or change events.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'search_events', description: 'Read server expanded events within a bounded interval on one granted calendar. Optional plain text search. A limited result is explicitly marked; never use a limited event list to infer free time. Use free_busy instead.', inputSchema: { type: 'object', properties: { calendar: { type: 'string' }, ...properties, text: { type: 'string', maxLength: 200 }, limit: { type: 'integer', minimum: 1, maximum: 500 } }, required: ['calendar', 'start', 'end'], additionalProperties: false } },
  { name: 'free_busy', description: 'Compute availability across all the requested calendars. Every calendar must be granted and enabled. Any authorization failure or uncertain schedule fails the whole request; no partial availability is returned.', inputSchema: { type: 'object', properties: { calendars: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 10, uniqueItems: true }, ...properties }, required: ['calendars', 'start', 'end'], additionalProperties: false } }
].map((t) => ({ ...t, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }));
function validateCalendarToolRequest(tool, args) {
  const invalid = () => ({ ok: false, reason: 'Invalid calendar tool arguments. Use explicit calendar IDs and a UTC time range of at most 90 days.' });
  if (!TOOLS.some((t) => t.name === tool)) return { ok: false, reason: 'Unknown calendar tool. Only list_calendars, search_events and free_busy are available.' };
  if (!record(args)) return invalid();
  const allowed = tool === 'list_calendars' ? [] : tool === 'search_events' ? ['calendar', 'start', 'end', 'time_zone', 'text', 'limit'] : ['calendars', 'start', 'end', 'time_zone'];
  if (Object.keys(args).some((k) => !allowed.includes(k))) return invalid();
  if (tool === 'list_calendars') return { ok: true, value: { tool, calendars: [] } };
  const parsed = range({ start: args.start, end: args.end, ...(args.time_zone === undefined ? {} : { timeZone: args.time_zone }) });
  if (!parsed) return invalid();
  const calendars = tool === 'search_events' ? [args.calendar] : args.calendars;
  if (!Array.isArray(calendars) || calendars.length < 1 || calendars.length > 10 || [...calendars].some((c) => !id(c)) || new Set(calendars).size !== calendars.length) return invalid();
  if (tool === 'search_events' && ((args.text !== undefined && (typeof args.text !== 'string' || args.text.length > 200 || /[\u0000-\u001f\u007f]/.test(args.text)))
    || (args.limit !== undefined && (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 500)))) return invalid();
  const { startMs, endMs, ...bounded } = parsed;
  return { ok: true, value: { tool, calendars: [...calendars], range: bounded,
    ...(tool === 'search_events' ? { text: args.text ?? '', limit: args.limit ?? 100 } : {}) } };
}
module.exports = { TOOLS, validateCalendarToolRequest, parseCalendarRange: range };
