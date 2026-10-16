'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { davResources } = loadTs('src/main/caldavXml.ts');
const { xml, multi, propstat, resource, response, discovery, event, ics, report, range, setup } = require('./caldav-fixtures.cjs');
const OWNER = { kind: 'owner' }, PAM = { kind: 'agent', agentId: 'pam' };
const data = () => ics(event(['DTSTART:20261016T100000Z', 'DTEND:20261016T110000Z']));
const good = (result) => { assert.equal(result.ok, true, result.error); return result.value; };

for (const provider of ['icloud', 'fastmail', 'zoho', 'caldav']) {
  test(`${provider}: authenticated principal, home and collection discovery verifies the account`, async () => {
    const f = setup();
    f.cfg.calendarAccounts[0].provider = provider;
    f.cfg.calendarAccounts[0].status = 'needs-attention';
    f.queue(...discovery());
    const result = good(await f.service.testConnection('office'));
    assert.equal(f.sent.length, 3);
    assert.deepEqual(f.sent.map((r) => r.method), ['PROPFIND', 'PROPFIND', 'PROPFIND']);
    assert.deepEqual(f.sent.map((r) => r.headers.depth), ['0', '0', '1']);
    assert.equal(result.homeUrl, 'https://calendar.example.test/home/');
    assert.equal(result.calendars[0].name, 'Bookings & visits');
    assert.equal(result.calendars[0].supportsQuery, true);
    assert.deepEqual(result.calendars[0].components, ['VEVENT']);
    assert.equal(result.calendars[0].readable, true);
    assert.equal(f.cfg.calendarAccounts[0].status, 'connected');
    assert.equal(f.cfg.calendarAccounts[0].calendars[0].id, 'bookings');
    assert.equal(f.cfg.calendarAccounts[0].calendars[0].enabled, true);
    assert.equal(JSON.stringify(result).includes('secret-password'), false);
    assert.equal(JSON.stringify(f.cfg).includes('secret-password'), false);
  });
}

test('new discoveries are disabled, disappeared collections revoke grants and IDs are stable', async () => {
  const f = setup();
  const responses = discovery();
  responses[2].body = responses[2].body.replaceAll('bookings/', 'new-calendar/');
  f.queue(...responses);
  good(await f.service.testConnection('office'));
  const discovered = f.cfg.calendarAccounts[0].calendars[0];
  assert.match(discovered.id, /^cal-[a-f0-9]{32}$/);
  assert.equal(discovered.enabled, false);
  assert.deepEqual(f.cfg.agentCapabilities.pam.calendars, []);
  const again = discovery();
  again[0].body = again[0].body.replace('>/dav<', '>/home/<');
  again[2].body = again[2].body.replaceAll('bookings/', 'new-calendar/');
  f.queue(...again);
  good(await f.service.testConnection('office'));
  assert.equal(f.cfg.calendarAccounts[0].calendars[0].id, discovered.id);
});

test('well known discovery redirects for an origin-only Nextcloud style server', async () => {
  const f = setup();
  f.cfg.calendarAccounts[0].serverUrl = 'https://calendar.example.test/';
  f.queue(response('', 404), response('', 301, { location: '/dav' }), ...discovery());
  good(await f.service.testConnection('office'));
  assert.equal(f.sent[1].url.pathname, '/.well-known/caldav');
  assert.equal(f.sent[2].url.pathname, '/dav');
});

test('iCloud principal/home links can use only Apple public CalDAV shards', async () => {
  const f = setup();
  const account = f.cfg.calendarAccounts[0];
  account.provider = 'icloud'; account.serverUrl = 'https://caldav.icloud.com/dav'; account.calendars = [];
  const replies = discovery('https://p42-caldav.icloud.com');
  replies[0].body = replies[0].body.replace('/principal/owner', 'https://p42-caldav.icloud.com/principal/owner');
  f.queue(...replies);
  good(await f.service.testConnection('office'));
  assert.equal(f.sent[1].url.hostname, 'p42-caldav.icloud.com');
  assert.equal(account.secretRef, f.cfg.calendarAccounts[0].secretRef);
  assert.equal(f.cfg.calendarAccounts[0].serverUrl, 'https://p42-caldav.icloud.com/home/');
  assert.equal(f.cfg.calendarAccounts[0].calendars[0].enabled, false);
});

for (const [status, code] of [[401, 'authentication'], [403, 'forbidden'], [404, 'not-found'], [429, 'rate-limit'], [503, 'server'], [405, 'unsupported']]) {
  test(`connection HTTP ${status} returns a sanitized ${code} error and cannot verify the account`, async () => {
    const f = setup();
    f.queue(response('secret-password-never-echo, server diagnostic', status));
    const result = await f.service.testConnection('office');
    assert.equal(result.ok, false);
    assert.equal(result.code, code);
    assert.equal(JSON.stringify(result).includes('secret-password'), false);
    assert.equal(f.cfg.calendarAccounts[0].status, 'needs-attention');
    assert.equal(f.cfg.calendarAccounts[0].statusReason, result.error);
  });
}

test('unavailable credentials cause no network calls and require account attention', async () => {
  const f = setup(); f.secrets.clear();
  const result = await f.service.testConnection('office');
  assert.equal(result.code, 'credentials');
  assert.equal(f.sent.length, 0);
  assert.equal(f.cfg.calendarAccounts[0].status, 'needs-attention');
});

test('REPORT requests bounded time filtering and server expansion, parses events and computes availability', async () => {
  const f = setup();
  f.queue(report(data()), report(data()));
  const events = good(await f.service.events('bookings', range, PAM));
  assert.equal(events.length, 1);
  assert.equal(events[0].etag, '"version1"');
  assert.equal(f.sent[0].method, 'REPORT');
  assert.match(f.sent[0].body, /<C:expand start="20261014T000000Z" end="20261019T000000Z"\/>/);
  assert.match(f.sent[0].body, /<C:time-range start="20261014T000000Z" end="20261019T000000Z"\/>/);
  const availability = good(await f.service.availability('bookings', range, PAM));
  assert.deepEqual(availability.busy, [{ start: '2026-10-16T10:00:00.000Z', end: '2026-10-16T11:00:00.000Z' }]);
  assert.equal(availability.free.length, 2);
});

test('an empty successful REPORT is an empty calendar; incomplete or unexpanded data is an error', async () => {
  const f = setup();
  f.queue(response(multi()), report(ics(event(['DTSTART:20261016T100000Z', 'DTEND:20261016T110000Z', 'RRULE:FREQ=DAILY']))), report(data(), 403), report(data(), 404), report(data(), 507));
  assert.equal(good(await f.service.availability('bookings', range, PAM)).free.length, 1);
  assert.equal((await f.service.events('bookings', range, PAM)).code, 'unsupported');
  assert.equal((await f.service.events('bookings', range, PAM)).code, 'forbidden');
  f.cfg.calendarAccounts[0].status = 'connected';
  assert.equal((await f.service.events('bookings', range, PAM)).code, 'unsupported');
  assert.equal((await f.service.events('bookings', range, PAM)).code, 'server');
});

test('per resource propstat status cannot be mistaken for successful calendar data', async () => {
  const f = setup();
  const bad = response(multi(resource('/home/bookings/event.ics', '<x:calendar-data xmlns:x="urn:wrong">ignored</x:calendar-data>', propstat('<c:calendar-data/>', 401))));
  f.queue(bad);
  const result = await f.service.events('bookings', range, PAM);
  assert.equal(result.code, 'authentication');
  assert.equal(f.cfg.calendarAccounts[0].status, 'needs-attention');
});

test('wrong XML namespaces are ignored; failed displayname properties do not become labels', async () => {
  const f = setup();
  const replies = discovery();
  replies[2].body = replies[2].body.replace('<d:displayname>Bookings &amp; visits</d:displayname>', '')
    .replace('</d:response></d:multistatus>', `${propstat('<d:displayname>must not be used</d:displayname>', 404)}</d:response></d:multistatus>`);
  f.queue(...replies);
  assert.equal(good(await f.service.testConnection('office')).calendars[0].name, undefined);
  assert.equal(f.cfg.calendarAccounts[0].calendars[0].name, 'Bookings');
});

test('permissions reject unknown agents, disabled calendars, missing accounts and malformed ranges before credentials leave main', async () => {
  const f = setup();
  for (const context of [undefined, {}, { kind: 'agent' }, { kind: 'agent', agentId: 'oscar' }, { kind: 'agent', agentId: 'constructor' }, { kind: 'agent', agentId: '__proto__' }, { kind: 'other' }]) {
    assert.equal((await f.service.events('bookings', range, context)).ok, false);
  }
  assert.equal((await f.service.events('unknown', range, PAM)).ok, false);
  assert.equal((await f.service.events('bookings', { ...range, start: '<inject/>' }, OWNER)).code, 'invalid');
  f.cfg.calendarAccounts[0].calendars[0].enabled = false;
  assert.equal((await f.service.events('bookings', range, OWNER)).code, 'denied');
  assert.equal(f.sent.length, 0);
});

test('read, approval and book grants all permit only the read paths', async () => {
  for (const level of ['read', 'approval', 'book']) {
    const f = setup();
    f.cfg.agentCapabilities.pam.calendars[0].access = level;
    f.queue(report(data()));
    good(await f.service.events('bookings', range, PAM));
    assert.equal(f.sent[0].method, 'REPORT');
  }
});

test('missing or expired credentials on reads mark the account needing attention', async () => {
  for (const status of [undefined, 401, 403]) {
    const f = setup();
    if (status === undefined) f.secrets.clear(); else f.queue(response('secret diagnostic', status));
    const result = await f.service.events('bookings', range, PAM);
    assert.equal(result.ok, false);
    assert.equal(f.cfg.calendarAccounts[0].status, 'needs-attention');
    assert.equal(result.error.includes('secret diagnostic'), false);
  }
});

test('credential changes during discovery cannot be verified by stale success or failure', async () => {
  for (const status of [207, 401]) {
    let f;
    const replies = discovery();
    f = setup({ send: async (_r, n) => {
      if (n === 1) f.cfg.calendarAccounts[0] = { ...f.cfg.calendarAccounts[0], secretRef: `calendar:office:${'b'.repeat(32)}`, status: 'needs-attention', statusReason: 'New password awaiting verification.' };
      return status === 401 ? response('refused', 401) : replies[n - 1];
    } });
    const result = await f.service.testConnection('office');
    assert.equal(result.ok, false);
    assert.equal(f.cfg.calendarAccounts[0].statusReason, 'New password awaiting verification.');
    assert.equal(f.cfg.calendarAccounts[0].secretRef.endsWith('b'.repeat(32)), true);
  }
});

test('access revoked while DNS is pending prevents the outbound REPORT', async () => {
  let f;
  f = setup({ resolve: async () => { f.cfg.agentCapabilities.pam.calendars = []; return [{ address: '8.8.8.8', family: 4 }]; } });
  assert.equal((await f.service.events('bookings', range, PAM)).code, 'denied');
  assert.equal(f.sent.length, 0);
});

test('access revoked while reading prevents returning any event data', async () => {
  let f;
  f = setup({ send: async () => { f.cfg.agentCapabilities.pam.calendars = []; return report(data()); } });
  const result = await f.service.events('bookings', range, PAM);
  assert.equal(result.code, 'denied');
  assert.equal(result.value, undefined);
});

for (const change of ['resourcetype', 'principal', 'home', 'report', 'namespace']) {
  test(`incomplete ${change} discovery never marks connected`, async () => {
    const f = setup();
    const replies = discovery();
    if (change === 'resourcetype') replies[2].body = replies[2].body.replace('<d:collection/>', '');
    if (change === 'principal') replies[0].body = replies[0].body.replace(/<d:href>\/principal\/owner<\/d:href>/, '<d:unauthenticated/>');
    if (change === 'home') replies[1].body = replies[1].body.replace('/home/', 'https://evil.example.test/home/');
    if (change === 'report') replies[2].body = replies[2].body.replace('<c:calendar-query/>', '<c:unknown-report/>');
    if (change === 'namespace') replies[0].body = replies[0].body.replace('xmlns:d="DAV:"', 'xmlns:d="urn:not-dav"');
    f.queue(...replies);
    const result = await f.service.testConnection('office');
    assert.equal(result.ok, false);
    assert.equal(f.cfg.calendarAccounts[0].status, 'needs-attention');
  });
}

for (const body of ['<broken>', '<!DOCTYPE foo [<!ENTITY x SYSTEM "file:///etc/passwd">]><d:multistatus xmlns:d="DAV:">&x;</d:multistatus>', '<d:multistatus xmlns:d="DAV:">&unknown;</d:multistatus>', '<?evil data?><d:multistatus xmlns:d="DAV:"/>', '<d:multistatus xmlns:d="DAV:"><!-- unfinished', '<d:multistatus xmlns:d="DAV:"><d:response><d:href>/x</d:href><d:propstat><d:prop/><d:status>invalid</d:status></d:propstat></d:response></d:multistatus>']) {
  test('malformed/unsafe XML never becomes a valid empty schedule', () => assert.throws(() => davResources(body)));
}

test('oversized/deep XML and duplicate properties fail closed', () => {
  assert.throws(() => davResources(multi('<d:x>'.repeat(35) + '</d:x>'.repeat(35))), (e) => e.code === 'too-large');
  assert.throws(() => davResources(multi(resource('/x', '<d:displayname>A</d:displayname><d:displayname>B</d:displayname>'))), (e) => e.code === 'malformed');
});

test('external, duplicate or collection REPORT hrefs and invalid ICS fail closed', async () => {
  for (const reply of [report(data()).body.replace('/home/bookings/visit.ics', 'https://evil.example.test/x.ics'), report(data()).body.replace('/home/bookings/visit.ics', '/other.ics'), multi(resource('/home/bookings/visit.ics', `<c:calendar-data>${xml(data())}</c:calendar-data>`), resource('/home/bookings/visit.ics', `<c:calendar-data>${xml(data())}</c:calendar-data>`)), report('not-icalendar').body]) {
    const f = setup(); f.queue(response(reply));
    assert.equal((await f.service.events('bookings', range, PAM)).ok, false);
  }
});

test('raw network exceptions and persistence errors are sanitized', async () => {
  const f = setup(); f.queue(new Error('secret-password-never-echo'));
  const result = await f.service.testConnection('office');
  assert.equal(result.code, 'network');
  assert.equal(JSON.stringify(result).includes('secret-password'), false);
  const broken = setup({ failSave: true }); broken.queue(...discovery());
  assert.equal((await broken.service.testConnection('office')).code, 'storage');
});

test('legacy configs without calendars return safe errors', async () => {
  const f = setup(); f.cfg = { agentCapabilities: {} };
  assert.equal((await f.service.testConnection('office')).code, 'not-found');
  assert.equal((await f.service.events('bookings', range, PAM)).code, 'not-found');
  assert.equal(f.sent.length, 0);
});

test('REPORT returns expanded recurrence instances without filling missing titles', async () => {
  const f = setup();
  f.queue(report(ics(event(['DTSTART:20261016T100000Z', 'DURATION:PT1H']), event(['RECURRENCE-ID:20261016T120000Z', 'DTSTART:20261016T130000Z', 'DURATION:PT1H']))));
  const result = good(await f.service.events('bookings', range, PAM));
  assert.equal(result.length, 2);
  assert.equal(result[1].recurrenceId.value, '2026-10-16T12:00:00Z');
  assert.equal(Object.hasOwn(result[0], 'summary'), false);
});

test('REPORT availability handles all day, cancelled and transparent instances using the explicit timezone', async () => {
  const f = setup();
  const wholeDay = ics(event(['DTSTART;VALUE=DATE:20261016', 'DTEND;VALUE=DATE:20261017']),
    event(['RECURRENCE-ID;VALUE=DATE:20261017', 'DTSTART;VALUE=DATE:20261017', 'DTEND;VALUE=DATE:20261018', 'STATUS:CANCELLED']));
  f.queue(report(wholeDay));
  const result = good(await f.service.availability('bookings', { ...range, timeZone: 'America/Los_Angeles' }, PAM));
  assert.deepEqual(result.busy, [{ start: '2026-10-16T07:00:00.000Z', end: '2026-10-17T00:00:00.000Z' }]);
  f.queue(report(ics(event(['DTSTART:20261016T000000Z', 'DTEND:20261017T000000Z', 'TRANSP:TRANSPARENT']))));
  assert.deepEqual(good(await f.service.availability('bookings', range, PAM)).busy, []);
});

test('unknown zones and missing ends return explicit errors instead of misleading availability', async () => {
  const f = setup();
  f.queue(report(ics(event(['DTSTART;TZID=Unknown/Zone:20261016T100000', 'DURATION:PT1H']))), report(ics(event(['DTSTART:20261016T100000Z']))));
  assert.equal((await f.service.availability('bookings', range, PAM)).code, 'unsupported');
  assert.equal((await f.service.availability('bookings', range, PAM)).code, 'unsupported');
});

test('agent context is copied and cannot turn into owner access during a pending read', async () => {
  let f;
  const context = { ...PAM };
  f = setup({ send: async () => { context.kind = 'owner'; f.cfg.agentCapabilities.pam.calendars = []; return report(data()); } });
  assert.equal((await f.service.events('bookings', range, context)).code, 'denied');
  assert.equal((await f.service.events('bookings', range, { kind: 'owner', agentId: 'pam' })).code, 'denied');
});

test('a reused UID in two REPORT resources is rejected even when recurrence IDs differ', async () => {
  const f = setup();
  f.queue(response(multi(resource('/home/bookings/a.ics', `<c:calendar-data>${xml(data())}</c:calendar-data>`), resource('/home/bookings/b.ics', `<c:calendar-data>${xml(ics(event(['RECURRENCE-ID:20261016T120000Z', 'DTSTART:20261016T120000Z', 'DURATION:PT1H'])))}</c:calendar-data>`))));
  assert.equal((await f.service.events('bookings', range, PAM)).code, 'malformed');
});

test('unauthorized calendar links and DNS targets cannot be fetched during discovery', async () => {
  for (const href of ['https://127.0.0.1/principal', 'http://calendar.example.test/principal', 'https://other.example.test/principal', 'https://user:secret@calendar.example.test/principal']) {
    const f = setup();
    f.queue(response(multi(resource('/dav', `<d:current-user-principal><d:href>${xml(href)}</d:href></d:current-user-principal>`))));
    assert.equal((await f.service.testConnection('office')).code, 'security');
    assert.equal(f.sent.length, 1);
  }
});

test('timezone padding prevents the server from filtering out an all day conflict at a UTC date boundary', async () => {
  const allDay = ics(event(['DTSTART;VALUE=DATE:20261016', 'DTEND;VALUE=DATE:20261017']));
  const f = setup({ send: async (request) => {
    const start = /<C:time-range start="([^"]+)"/.exec(request.body)[1];
    // This server filters DATE values in UTC. A narrow Oct 17 query would omit
    // the event, although it is still Oct 16 in the caller's Los Angeles zone.
    return start < '20261017T000000Z' ? report(allDay) : response(multi());
  } });
  const result = good(await f.service.availability('bookings', { start: '2026-10-17T04:00:00Z', end: '2026-10-17T05:00:00Z', timeZone: 'America/Los_Angeles' }, PAM));
  assert.deepEqual(result.busy, [{ start: '2026-10-17T04:00:00.000Z', end: '2026-10-17T05:00:00.000Z' }]);
  assert.deepEqual(result.free, []);
});

test('owner IPC registrations validate inputs and cannot accept a claimed caller context', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const ts = require('typescript');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'index.ts'), 'utf8');
  const lines = main.split('\n').filter((line) => /^ipcMain.handle\('(calendarAccounts:test|calendar:events|calendar:availability)'/.test(line));
  assert.equal(lines.length, 3);
  const f = setup();
  const handlers = new Map();
  new Function('ipcMain', 'calendarService', ts.transpileModule(lines.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText)({ handle: (name, fn) => handlers.set(name, fn) }, f.service);
  assert.equal((await handlers.get('calendar:events')({}, 'bookings', { ...range, agentId: 'pam' })).code, 'invalid');
  assert.equal((await handlers.get('calendarAccounts:test')({}, { id: 'office', password: 'not-accepted' })).code, 'invalid');
  f.queue(report(data()));
  assert.equal(good(await handlers.get('calendar:events')({}, 'bookings', range)).length, 1);
});

test('servers cannot reflect passwords or Basic credentials into event results or account metadata', async () => {
  for (const reflected of ['secret-password-never-echo', Buffer.from('owner@example.test:secret-password-never-echo').toString('base64')]) {
    const f = setup();
    const replies = discovery();
    // XML entities hide the reflection from a raw body substring check.
    replies[2].body = replies[2].body.replace('Bookings &amp; visits', [...reflected].map((c) => `&#${c.charCodeAt(0)};`).join(''));
    f.queue(...replies);
    const tested = await f.service.testConnection('office');
    assert.equal(tested.code, 'malformed');
    assert.equal(f.cfg.calendarAccounts[0].calendars[0].name, 'Bookings');
    assert.equal(JSON.stringify(tested).includes(reflected), false);
    f.cfg.calendarAccounts[0].status = 'connected';
    f.queue(report(ics(event(['DTSTART:20261016T100000Z', 'DURATION:PT1H', `DESCRIPTION:${reflected}`]))));
    const read = await f.service.events('bookings', range, PAM);
    assert.equal(read.code, 'malformed');
    assert.equal(JSON.stringify(read).includes(reflected), false);
  }
});
