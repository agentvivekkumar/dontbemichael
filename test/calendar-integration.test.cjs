'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const loadTs = require('./load-ts.cjs');
const { setup, account, range, report, event, ics, response, multi, resource, xml } = require('./caldav-fixtures.cjs');
const { CalendarAccounts } = loadTs('src/main/calendarAccounts.ts');
const { IntegrationBroker } = loadTs('src/main/integrationBroker.ts');
const { handleCalendarRequest } = loadTs('src/main/calendarRoutes.ts');
const { calendarToolAccess, hasCalendarTools } = loadTs('src/shared/calendarTools.ts');
const { TOOLS, validateCalendarToolRequest } = require('../resources/calendar-tool-contract.cjs');
const SEARCH = { calendar: 'bookings', ...range };
const FREE = { calendars: ['bookings'], ...range };
const data = (...extra) => ics(event(['DTSTART:20261016T100000Z', 'DTEND:20261016T110000Z', 'SUMMARY:Customer visit', ...extra]));
function routes(f, present = (id) => id === 'pam') {
  return (agent, tool, args) => handleCalendarRequest(f.service, { getConfig: () => f.cfg, present }, agent, tool, args);
}
function brokerFor(f, extra = {}) {
  return new IntegrationBroker({ getRecord: () => undefined, getSecret: () => { throw new Error('secret accessor is not for calendar routing'); }, calendar: routes(f), ...extra });
}
function request(broker, token, tool, args = {}, opts = {}) {
  const req = new EventEmitter();
  Object.assign(req, { url: opts.url ?? `/calendar/${tool}`, method: opts.method ?? 'POST', headers: token ? { 'x-md-broker-token': token } : {}, socket: { remoteAddress: opts.remote ?? '127.0.0.1' }, complete: opts.complete ?? true, setEncoding() {}, destroy() { this.emit('aborted'); } });
  let status;
  const done = new Promise((resolve) => {
    const res = { headersSent: false, writeHead(code) { status = code; this.headersSent = true; }, end(body) { resolve({ status, body: body ? JSON.parse(String(body)) : null }); } };
    broker.handle(req, res);
    queueMicrotask(() => { opts.beforeBody?.(); req.emit('data', Buffer.from(opts.raw ?? JSON.stringify(args))); req.emit('end'); });
  });
  return done;
}

for (const level of ['read', 'approval', 'book']) {
  test(`${level} grants expose only read operations and credential-free metadata`, async () => {
    const f = setup(); f.cfg.agentCapabilities.pam.calendars[0].access = level;
    const run = routes(f);
    const list = await run('pam', 'list_calendars', {});
    assert.equal(list.status, 200);
    assert.deepEqual(list.body, { calendars: [{ calendar: 'bookings', name: 'Bookings', access: level, read_only: true }] });
    assert.doesNotMatch(JSON.stringify(list), /secret|username|serverUrl|https:|owner@/);
    f.queue(report(data()), report(data()));
    assert.equal((await run('pam', 'search_events', SEARCH)).body.events.length, 1);
    assert.equal((await run('pam', 'free_busy', FREE)).body.busy.length, 1);
    for (const op of ['create_event', 'update_event', 'cancel_event', 'propose_event', 'constructor', 'toString', '__proto__']) {
      assert.equal((await run('pam', op, SEARCH)).status, 400);
      assert.equal(calendarToolAccess(f.cfg, 'pam', op, SEARCH).ok, false);
    }
    assert.deepEqual(f.sent.map((r) => r.method), ['REPORT', 'REPORT']);
    assert.equal(JSON.stringify(list).includes('secret-password'), false);
  });
}
for (const [name, change, who] of [
  ['no grant', (f) => { f.cfg.agentCapabilities.pam.calendars = []; }],
  ['disabled calendar', (f) => { f.cfg.calendarAccounts[0].calendars[0].enabled = false; }],
  ['deleted calendar', (f) => { f.cfg.calendarAccounts[0].calendars = []; }],
  ['unverified account', (f) => { f.cfg.calendarAccounts[0].status = 'needs-attention'; }],
  ['older config', (f) => { f.cfg = {}; }],
  ['malformed config', (f) => { f.cfg.calendarAccounts = [null]; }],
  ['duplicate grant', (f) => { f.cfg.agentCapabilities.pam.calendars.push({ calendar: 'bookings', access: 'book' }); }],
  ['owner without explicit access', () => {}, 'god'],
  ['unknown agent', () => {}, 'unknown'],
  ['research even if granted', (f) => { f.cfg.agentCapabilities.research = f.cfg.agentCapabilities.pam; }, 'research']
]) test(`${name}: list, events and free busy fail closed before network access`, async () => {
  const f = setup(); change(f);
  for (const [tool, args] of [['list_calendars', {}], ['search_events', SEARCH], ['free_busy', FREE]]) {
    assert.equal(calendarToolAccess(f.cfg, who ?? 'pam', tool, args).ok, false);
    assert.equal((await routes(f)(who ?? 'pam', tool, args)).status, 403);
  }
  assert.equal(f.sent.length, 0);
});

test('only current roster members can use calendar routes, even with old explicit grants', async () => {
  const f = setup();
  assert.equal((await routes(f, () => false)('pam', 'list_calendars', {})).status, 403);
  assert.equal(f.sent.length, 0);
});

test('all multi-calendar authorization is checked before any request, never a partial schedule', async () => {
  const f = setup();
  f.cfg.calendarAccounts[0].calendars.push({ ...f.cfg.calendarAccounts[0].calendars[0], id: 'private', url: 'https://calendar.example.test/home/private/', name: 'Private' });
  const result = await routes(f)('pam', 'free_busy', { ...FREE, calendars: ['bookings', 'private'] });
  assert.equal(result.status, 403); assert.equal(f.sent.length, 0);
  assert.equal(JSON.stringify(result).includes('Private'), false);
  assert.deepEqual((await routes(f)('pam', 'list_calendars', {})).body.calendars.map((c) => c.calendar), ['bookings']);
});

test('authorized multi-calendar free busy merges overlapping intervals and rejects uncertain partial results', async () => {
  const f = setup();
  f.cfg.calendarAccounts[0].calendars.push({ ...f.cfg.calendarAccounts[0].calendars[0], id: 'second', url: 'https://calendar.example.test/home/second/' });
  f.cfg.agentCapabilities.pam.calendars.push({ calendar: 'second', access: 'read' });
  const second = () => report(ics(event(['DTSTART:20261016T103000Z', 'DTEND:20261016T120000Z']))).body.replaceAll('/home/bookings/', '/home/second/');
  f.queue(report(data()), response(second()));
  const result = await routes(f)('pam', 'free_busy', { ...FREE, calendars: ['bookings', 'second'] });
  assert.equal(result.status, 200, JSON.stringify(result));
  assert.deepEqual(result.body.busy, [{ start: '2026-10-16T10:00:00.000Z', end: '2026-10-16T12:00:00.000Z' }]);
  f.queue(report(data()), response('invalid xml'));
  const failed = await routes(f)('pam', 'free_busy', { ...FREE, calendars: ['bookings', 'second'] });
  assert.equal(failed.status, 503); assert.equal(failed.body.free, undefined); assert.equal(failed.body.busy, undefined);
});

test('event search explicitly marks limited results and text matching without inventing fields', async () => {
  const f = setup();
  const events = response(multi(...['one', 'two', 'three'].map((uid) => resource(`/home/bookings/${uid}.ics`, `<c:calendar-data>${xml(ics(event(['DTSTART:20261016T100000Z', 'DTEND:20261016T110000Z', 'SUMMARY:Customer visit'], uid)))}</c:calendar-data>`))));
  f.queue(events, events);
  const res = await routes(f)('pam', 'search_events', { ...SEARCH, text: 'CUSTOMER', limit: 1 });
  assert.equal(res.status, 200); assert.equal(res.body.total, 3); assert.equal(res.body.limited, true); assert.equal(res.body.events.length, 1);
  assert.equal(res.body.events[0].location, undefined);
  assert.equal((await routes(f)('pam', 'search_events', { ...SEARCH, text: 'not found' })).body.total, 0);
});

for (const mutation of [
  (f) => { f.cfg.agentCapabilities.pam.calendars = []; },
  (f) => { f.cfg.calendarAccounts[0].calendars[0].enabled = false; },
  (f) => { f.cfg.calendarAccounts = []; }
]) test('in-flight revoke, disable or deletion discards the entire result', async () => {
  let release, entered;
  const started = new Promise((resolve) => { entered = resolve; });
  const pending = new Promise((resolve) => { release = resolve; });
  const f = setup({ send: async () => { entered(); await pending; return report(data()); } });
  const promise = routes(f)('pam', 'search_events', SEARCH);
  await started; mutation(f); release();
  const result = await promise;
  assert.equal(result.status, 403); assert.equal(result.body.events, undefined); assert.doesNotMatch(JSON.stringify(result), /Customer/);
});

test('missing credentials and malformed calendar results are sanitized, with no empty availability', async () => {
  const f = setup(); f.secrets.clear();
  let out = await routes(f)('pam', 'free_busy', FREE);
  assert.equal(out.status, 403); assert.equal(out.body.code, 'denied'); assert.equal(out.body.free, undefined);
  const g = setup(); g.queue(report(ics(event(['DTSTART:20261016T100000Z']))));
  out = await routes(g)('pam', 'free_busy', FREE);
  assert.notEqual(out.status, 200); assert.equal(out.body.free, undefined);
});

for (const [tool, args] of [
  ['list_calendars', { agentId: 'god' }], ['list_calendars', []], ['search_events', { ...SEARCH, calendar: '../bookings' }],
  ['search_events', { ...SEARCH, calendar: '*' }], ['search_events', { ...SEARCH, calendar: 'constructor' }],
  ['search_events', { ...SEARCH, agentId: 'god' }], ['search_events', { ...SEARCH, limit: 0 }], ['search_events', { ...SEARCH, limit: 501 }],
  ['search_events', { ...SEARCH, start: '2026-02-30T00:00:00Z' }], ['search_events', { ...SEARCH, end: '2027-10-16T00:00:00Z' }],
  ['search_events', { ...SEARCH, end: range.start }], ['search_events', { ...SEARCH, time_zone: 'Unknown/Zone' }],
  ['search_events', { ...SEARCH, text: '\nsecret' }], ['free_busy', { ...FREE, calendars: [] }],
  ['free_busy', { ...FREE, calendars: ['bookings', 'bookings'] }], ['free_busy', { ...FREE, calendars: ['bookings', null] }],
  ['free_busy', { ...FREE, calendars: new Array(1) }], ['free_busy', { ...FREE, calendars: Array.from({ length: 11 }, (_, n) => `cal-${n}`) }],
  ['free_busy', JSON.parse('{"__proto__":{},"calendars":["bookings"],"start":"2026-10-16T00:00:00Z","end":"2026-10-17T00:00:00Z"}')]
]) test(`argument validation rejects ${tool} ${JSON.stringify(args)}`, async () => {
  const f = setup();
  assert.equal(validateCalendarToolRequest(tool, args).ok, false);
  assert.equal((await routes(f)('pam', tool, args)).status, 400);
  assert.equal(f.sent.length, 0);
});

test('broker requires loopback, live capability and authenticated team identity', async () => {
  const f = setup(), b = brokerFor(f);
  const token = b.grant('session', [], 'pam');
  assert.equal((await request(b, token, 'list_calendars')).status, 200);
  assert.equal((await request(b, null, 'list_calendars')).status, 401);
  assert.equal((await request(b, 'wrong', 'list_calendars')).status, 401);
  assert.equal((await request(b, token, 'list_calendars', {}, { remote: '8.8.8.8' })).status, 403);
  assert.equal((await request(b, b.grant('worker', ['all']), 'list_calendars')).status, 403);
  assert.equal((await request(b, token, 'list_calendars', { agentId: 'god' })).status, 400);
  for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) assert.equal((await request(b, token, 'list_calendars', {}, { method })).status, 405);
  assert.equal((await request(b, token, 'create_event')).status, 400);
  assert.equal((await request(b, token, 'list_calendars', {}, { raw: '{bad' })).status, 400);
  assert.equal((await request(b, token, 'list_calendars', {}, { raw: '[]' })).status, 400);
  b.revoke('session'); assert.equal((await request(b, token, 'list_calendars')).status, 401);
});

test('broker revocation during body upload or handler execution suppresses all data', async () => {
  const f = setup(), b = brokerFor(f);
  let token = b.grant('session', [], 'pam');
  assert.equal((await request(b, token, 'list_calendars', {}, { beforeBody: () => b.revoke('session') })).status, 403);
  let unblock, entered;
  const started = new Promise((r) => { entered = r; });
  const pending = new Promise((r) => { unblock = r; });
  const c = brokerFor(f, { calendar: async () => { entered(); await pending; return { status: 200, body: { events: ['private data'] } }; } });
  token = c.grant('session', [], 'pam');
  const promise = request(c, token, 'search_events', SEARCH);
  await started; c.revoke('session'); unblock();
  const result = await promise;
  assert.equal(result.status, 403); assert.doesNotMatch(JSON.stringify(result), /private data/);
});

test('oversize, incomplete and malformed bodies cannot reach the calendar service; mail still uses its handler', async () => {
  let calendarCalls = 0, mailCalls = 0;
  const b = new IntegrationBroker({ getRecord() {}, getSecret() {}, calendar: async () => { calendarCalls++; return { status: 200, body: {} }; }, mail: async (id, op, body) => { mailCalls++; assert.equal(id, 'pam'); assert.equal(op, 'search'); assert.equal(body.mailbox, 'sales'); return { status: 200, body: { messages: [] } }; } });
  const token = b.grant('session', [], 'pam');
  assert.equal((await request(b, token, 'list_calendars', {}, { raw: 'x'.repeat(17000) })).status, 503);
  assert.equal((await request(b, token, 'list_calendars', {}, { complete: false })).status, 503);
  assert.equal(calendarCalls, 0);
  assert.equal((await request(b, token, '', { mailbox: 'sales' }, { url: '/mail/search' })).status, 200);
  assert.equal(mailCalls, 1);
});

test('metadata selection and grant deltas preserve verified state, stable IDs and unrelated capabilities', () => {
  let cfg = { calendarAccounts: [account()], agentCapabilities: { pam: { email: { enabled: true, mailboxes: ['sales'] }, connectors: { Gmail: true }, calendars: [] } } };
  const manager = new CalendarAccounts({ getConfig: () => cfg, saveConfig: (patch) => { cfg = { ...cfg, ...patch }; }, present: (id) => id === 'pam', canStoreSecrets: () => { throw Error('must not touch secret'); }, setSecret() { throw Error('must not touch secret'); }, deleteSecret: () => true });
  assert.deepEqual(manager.setGrant('pam', 'bookings', 'read'), { ok: true, restartNeeded: true });
  assert.deepEqual(manager.setGrant('pam', 'bookings', 'book'), { ok: true, restartNeeded: false });
  assert.deepEqual(cfg.agentCapabilities.pam.email, { enabled: true, mailboxes: ['sales'] });
  assert.deepEqual(cfg.agentCapabilities.pam.connectors, { Gmail: true });
  assert.equal(manager.selectCalendar('office', 'bookings', false).ok, true);
  assert.equal(cfg.calendarAccounts[0].status, 'connected'); assert.equal(cfg.calendarAccounts[0].calendars[0].id, 'bookings');
  assert.equal(calendarToolAccess(cfg, 'pam', 'list_calendars', {}).ok, false);
  assert.equal(manager.setGrant('pam', 'bookings', 'read').ok, false);
  assert.equal(manager.setGrant('pam', 'bookings', null).ok, true);
  assert.equal(manager.selectCalendar('office', 'bookings', true).ok, true);
  assert.equal(manager.setGrant('god', 'bookings', 'book').ok, false);
  assert.equal(manager.setGrant('pam', 'missing', 'read').ok, false);
  assert.equal(manager.setGrant('pam', 'bookings', 'automatic').ok, false);
  assert.equal(manager.selectCalendar('office', 'bookings', 'yes').ok, false);
  assert.deepEqual(cfg.agentCapabilities.pam.calendars, []);
});

test('attachment planning denies old config and defaults; unverified explicitly granted accounts still attach for repair', () => {
  const f = setup(); assert.equal(hasCalendarTools({}, 'god'), false);
  f.cfg.calendarAccounts[0].status = 'needs-attention';
  assert.equal(hasCalendarTools(f.cfg, 'pam'), true);
  assert.equal(calendarToolAccess(f.cfg, 'pam', 'list_calendars', {}).ok, false);
  f.cfg.calendarAccounts[0].calendars[0].enabled = false;
  assert.equal(hasCalendarTools(f.cfg, 'pam'), false);
});

test('actual PreToolUse hook and broker use identical read policy and reject writes and manipulated arguments', async (t) => {
  const electron = require.resolve('electron');
  require.cache[electron] = { id: electron, filename: electron, loaded: true, exports: { Notification: class { show() {} static isSupported() { return false; } } } };
  const { HiveManager } = loadTs('src/main/hive.ts');
  const { HookServer } = loadTs('src/main/hooks.ts');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'calendar hook '));
  t.after(() => fs.rmSync(home, { force: true, recursive: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'pam', name: 'Pam', provider: 'claude', cwd: home });
  const f = setup();
  const server = new HookServer(hive, () => null, () => ({ ...f.cfg, harnessHome: home }));
  server.memberPresent = (id) => id === 'pam';
  const call = (op, args, agent = 'pam') => server.handle({ agent_id: agent, hook_event_name: 'PreToolUse', tool_name: `mcp__md-calendar__${op}`, tool_input: args, cwd: home });
  for (const level of ['read', 'approval', 'book', undefined]) {
    f.cfg.agentCapabilities.pam.calendars = level ? [{ calendar: 'bookings', access: level }] : [];
    for (const [op, args] of [['list_calendars', {}], ['search_events', SEARCH], ['free_busy', FREE], ['free_busy', { ...FREE, calendars: ['bookings', 'private'] }], ['create_event', SEARCH], ['propose_event', SEARCH], ['constructor', SEARCH]]) {
      const hook = await call(op, args);
      const allowed = hook.hookSpecificOutput?.permissionDecision !== 'deny';
      assert.equal(allowed, calendarToolAccess(f.cfg, 'pam', op, args).ok, `${level} ${op}`);
      if (allowed && op !== 'list_calendars') f.queue(report(data()));
      assert.equal((await routes(f)('pam', op, args)).status === 200, allowed, `${level} ${op} broker`);
    }
  }
  assert.equal((await call('list_calendars', {}, 'unknown')).hookSpecificOutput?.permissionDecision, 'deny');
  const resource = await server.handle({ agent_id: 'pam', hook_event_name: 'PreToolUse', tool_name: 'ReadMcpResourceTool', tool_input: { server: 'md-calendar', uri: 'any' }, cwd: home });
  assert.equal(resource.hookSpecificOutput?.permissionDecision, 'deny');
});

module.exports = { request, brokerFor, routes };
