'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { parseCalendarEvents, calendarAvailability, validateRange } = loadTs('src/main/calendarEvents.ts');
const { event, ics, range } = require('./caldav-fixtures.cjs');
const r = validateRange(range);
const parse = (...events) => parseCalendarEvents(ics(...events), r, '"etag"');
const times = ['DTSTART:20261016T100000Z', 'DTEND:20261016T110000Z'];

test('parses escaped and folded text, quoted TZID parameters and required metadata', () => {
  const result = parse(event([...times, 'SUMMARY:Visit\\, quote\\; survey', 'LOCATION:First floor', 'DESCRIPTION:First\\nsecond\\\\path', ' more text', 'STATUS:CONFIRMED', 'TRANSP:OPAQUE']));
  assert.equal(result.length, 1);
  assert.equal(result[0].uid, 'visit');
  assert.equal(result[0].summary, 'Visit, quote; survey');
  assert.equal(result[0].description, 'First\nsecond\\pathmore text');
  assert.equal(result[0].location, 'First floor');
  assert.equal(result[0].etag, '"etag"');
  assert.equal(result[0].startUtc, '2026-10-16T10:00:00.000Z');
  assert.equal(result[0].endUtc, '2026-10-16T11:00:00.000Z');
});

test('server expanded recurring instances are retained without evaluating any rule', () => {
  const result = parse(event([...times]), event(['RECURRENCE-ID:20261016T120000Z', 'DTSTART:20261016T123000Z', 'DTEND:20261016T130000Z']));
  assert.equal(result.length, 2);
  assert.equal(result[1].recurrenceId.value, '2026-10-16T12:00:00Z');
  assert.equal(result[1].startUtc, '2026-10-16T12:30:00.000Z');
});

for (const rule of ['RRULE:FREQ=DAILY', 'RDATE:20261016T140000Z', 'EXDATE:20261016T140000Z', 'EXRULE:FREQ=DAILY', 'RECURRENCE-ID;RANGE=THISANDFUTURE:20261016T100000Z']) {
  test(`incomplete expansion rejects ${rule}`, () => assert.throws(() => parse(event([...times, rule])), (e) => e.code === 'unsupported'));
}

test('named time zones use ICU and keep the original TZID', () => {
  const result = parse(event(['DTSTART;TZID="America/Los_Angeles":20261016T100000', 'DTEND;TZID=America/Los_Angeles:20261016T110000']));
  assert.equal(result[0].start.tzid, 'America/Los_Angeles');
  assert.equal(result[0].startUtc, '2026-10-16T17:00:00.000Z');
  assert.equal(result[0].endUtc, '2026-10-16T18:00:00.000Z');
});

test('floating times and all day dates require an explicit timezone', () => {
  for (const lines of [['DTSTART:20261016T100000', 'DTEND:20261016T110000'], ['DTSTART;VALUE=DATE:20261016', 'DTEND;VALUE=DATE:20261017']]) {
    assert.throws(() => parse(event(lines)), (e) => e.code === 'unsupported');
    const result = parseCalendarEvents(ics(event(lines)), validateRange({ ...range, timeZone: 'America/Los_Angeles' }));
    assert.equal(result.length, 1);
    assert.equal(result[0].startUtc.endsWith('17:00:00.000Z') || result[0].startUtc.endsWith('07:00:00.000Z'), true);
  }
});

test('all day intervals and nominal DURATION respect a DST transition', () => {
  const dst = validateRange({ start: '2026-03-08T00:00:00Z', end: '2026-03-10T00:00:00Z', timeZone: 'America/Los_Angeles' });
  const events = parseCalendarEvents(ics(event(['DTSTART;VALUE=DATE:20260308', 'DURATION:P1D'])), dst);
  assert.equal(events[0].startUtc, '2026-03-08T08:00:00.000Z');
  assert.equal(events[0].endUtc, '2026-03-09T07:00:00.000Z');
  assert.equal(events[0].duration, 'P1D');
  assert.deepEqual(calendarAvailability(events, dst).busy, [{ start: events[0].startUtc, end: events[0].endUtc }]);
});

for (const stamp of ['20260308T023000', '20261101T013000']) {
  test(`ambiguous or nonexistent DST wall clock ${stamp} is unsupported`, () => {
    const bounds = validateRange({ start: stamp.startsWith('202603') ? '2026-03-08T00:00:00Z' : '2026-11-01T00:00:00Z', end: stamp.startsWith('202603') ? '2026-03-10T00:00:00Z' : '2026-11-03T00:00:00Z' });
    assert.throws(() => parseCalendarEvents(ics(event([`DTSTART;TZID=America/Los_Angeles:${stamp}`, 'DURATION:PT1H'])), bounds), (e) => e.code === 'unsupported');
  });
}

test('unknown and embedded custom time zones fail explicitly', () => {
  assert.throws(() => parse(event(['DTSTART;TZID=MadeUp/Zone:20261016T100000', 'DURATION:PT1H'])), (e) => e.code === 'unsupported');
  assert.throws(() => parseCalendarEvents(ics(['BEGIN:VTIMEZONE', 'TZID:Custom', 'END:VTIMEZONE'], event(times)), r), (e) => e.code === 'unsupported');
});

test('availability merges separate resources and leaves cancelled/transparent time free', () => {
  const list = [
    ...parse(event(['DTSTART:20261015T230000Z', 'DTEND:20261016T010000Z'], 'overnight')),
    ...parse(event(times, 'a')),
    ...parse(event(['DTSTART:20261016T103000Z', 'DURATION:PT2H'], 'b')),
    ...parse(event(['DTSTART:20261016T000000Z', 'DTEND:20261017T000000Z', 'STATUS:CANCELLED'], 'cancelled')),
    ...parse(event(['DTSTART:20261016T000000Z', 'DTEND:20261017T000000Z', 'TRANSP:TRANSPARENT'], 'transparent'))
  ];
  const result = calendarAvailability(list, r);
  assert.deepEqual(result.busy, [{ start: '2026-10-16T00:00:00.000Z', end: '2026-10-16T01:00:00.000Z' }, { start: '2026-10-16T10:00:00.000Z', end: '2026-10-16T12:30:00.000Z' }]);
  assert.equal(result.free.length, 2);
  assert.equal(result.free[1].end, '2026-10-17T00:00:00.000Z');
});

test('missing fields stay missing and missing ends never produce false free time', () => {
  const result = parse(event(['DTSTART:20261016T100000Z']));
  assert.equal(Object.hasOwn(result[0], 'summary'), false);
  assert.equal(Object.hasOwn(result[0], 'end'), false);
  assert.equal(Object.hasOwn(result[0], 'endUtc'), false);
  assert.throws(() => calendarAvailability(result, r), (e) => e.code === 'unsupported');
});

for (const lines of [[], ['DTSTART:20260230T100000Z'], ['DTSTART:20261016T250000Z'], [...times, 'DTSTART:20261016T120000Z'], ['DTSTART:20261016T100000Z', 'DTEND:20261016T090000Z'], [...times, 'DURATION:PT1H'], ['DTSTART:20261016T100000Z', 'DURATION:-PT1H'], ['DTSTART;VALUE=DATE:20261016', 'DTEND:20261017T000000Z'], [...times, 'TRANSP:UNKNOWN'], [...times, 'STATUS:UNKNOWN']]) {
  test(`malformed event rejects ${JSON.stringify(lines)}`, () => assert.throws(() => parseCalendarEvents(ics(event(lines)), validateRange({ ...range, timeZone: 'UTC' }))));
}

test('malformed calendar structure, duplicates and mixed UIDs are rejected', () => {
  for (const data of ['', ics(), ics(event(times)).replace('UID:visit\r\n', ''), ics(event(times), event(times)),
    ics(event(times), event(times, 'other')), ics(event(times)) + ics(event(times)),
    ics(event(times)).replace('END:VEVENT', 'END:VCALENDAR')]) {
    assert.throws(() => parseCalendarEvents(data, r));
  }
});

test('invalid, unbounded and malformed time ranges are refused', () => {
  for (const value of [null, [], {}, { ...range, start: '2026-02-30T00:00:00Z' }, { ...range, end: range.start }, { ...range, end: '2027-10-16T00:00:00Z' }, { ...range, timeZone: 'Not/AZone' }, { ...range, secret: 'unexpected' }, { ...range, start: '2026-10-16T00:00:00+00:00' }]) assert.throws(() => validateRange(value), (e) => e.code === 'invalid');
});

test('case insensitive status and transparency values are respected without changing source values', () => {
  for (const line of ['STATUS:cancelled', 'TRANSP:transparent']) {
    const events = parse(event([...times, line]));
    assert.deepEqual(calendarAvailability(events, r).busy, []);
    assert.equal(events[0].status === 'cancelled' || events[0].transparency === 'transparent', true);
  }
});
