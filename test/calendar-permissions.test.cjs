'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { calendarAccess, CALENDAR_TOOL_OPS } = loadTs('src/shared/calendars.ts');
const { mailAccess } = loadTs('src/shared/mailboxes.ts');

const operations = ['list', 'read', 'propose', 'write'];
const inherited = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', 'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString', '__defineGetter__', '__lookupGetter__'];
const office = (access = 'read') => ({
  calendarAccounts: [{ id: 'account', label: 'Bookings', provider: 'caldav', serverUrl: 'https://example.com', username: 'owner', secretRef: 'calendar:account', status: 'connected',
    calendars: [{ id: 'business', url: 'https://example.com/business', name: 'Business', enabled: true }, { id: 'team', url: 'https://example.com/team', name: 'Team', enabled: true }] }],
  agentCapabilities: { pam: { calendars: [{ calendar: 'business', access }] } }
});
const check = (cfg, op, id = 'business', agent = 'pam', proposal) => calendarAccess(cfg, agent, id, op, proposal);
const denyAll = (cfg, agent = 'pam') => {
  for (const op of operations) assert.equal(check(cfg, op, 'business', agent).ok, false, op);
  assert.equal(calendarAccess(cfg, agent, undefined, 'list').ok, false, 'unnamed list');
};

// Explicit expected sets keep the specification independent of implementation.
for (const [level, allowed] of [['read', ['list', 'read']], ['approval', ['list', 'read', 'propose']], ['book', ['list', 'read', 'write']]]) {
  for (const op of operations) {
    test(`${level}: ${op}`, () => {
      const result = check(office(level), op);
      assert.equal(result.ok, allowed.includes(op));
      if (!result.ok) assert.equal(typeof result.reason, 'string');
    });
  }
  test(`${level}: unknown operations and tool names deny`, () => {
    for (const op of [...inherited, '', null, undefined, {}, 'book', 'delete', 'create_event']) {
      assert.equal(check(office(level), op).ok, false, String(op));
    }
  });
  test(`${level}: only enabled, known and explicitly granted calendars allow access`, () => {
    const cfg = office(level);
    for (const id of ['team', 'missing', '*', '', 'Business', ' business', null, 1, {}, ...inherited]) {
      for (const op of operations) assert.equal(check(cfg, op, id).ok, false, `${op} ${String(id)}`);
    }
    for (const op of ['read', 'propose', 'write']) assert.equal(calendarAccess(cfg, 'pam', undefined, op).ok, false);
    assert.equal(calendarAccess(cfg, 'pam', undefined, 'list').ok, true);
    cfg.calendarAccounts[0].calendars[0].enabled = false;
    denyAll(cfg);
    cfg.calendarAccounts[0].calendars[0].enabled = true;
    cfg.calendarAccounts[0].status = 'needs-attention';
    denyAll(cfg);
    cfg.calendarAccounts = [];
    denyAll(cfg);
  });
}

test('no grant, missing agents and malformed configuration deny safely', () => {
  for (const cfg of [undefined, null, false, true, '', [], {}, { agentCapabilities: {} },
    ...[undefined, null, [], false, 'pam'].map((agentCapabilities) => ({ ...office(), agentCapabilities }))]) denyAll(cfg);
  for (const agent of [undefined, null, '', 'missing', {}, 1, ...inherited]) {
    for (const op of operations) assert.equal(calendarAccess(office(), agent, 'business', op).ok, false);
    assert.equal(calendarAccess(office(), agent, undefined, 'list').ok, false);
  }
  for (const agent of [undefined, null, [], {}, { calendars: [] }, { calendars: null }]) {
    const cfg = office();
    cfg.agentCapabilities.pam = agent;
    denyAll(cfg);
  }
  const invalidGrants = [undefined, null, '', {}, [], [null], [false], [1], [[]], [{}], new Array(1),
    ...[undefined, null, '', 'automatic', 'read-only', 'approval-required', true, {}].map((access) => [{ calendar: 'business', access }]),
    ...[undefined, null, '', ' business', 'business ', '*', 1, {}].map((calendar) => [{ calendar, access: 'book' }]),
    [{ calendar: 'business', access: 'read' }, { calendar: 'business', access: 'book' }],
    [{ calendar: 'business', access: 'book' }, null]];
  for (const grants of invalidGrants) {
    const cfg = office();
    cfg.agentCapabilities.pam.calendars = grants;
    denyAll(cfg);
  }
});

test('malformed calendar accounts, flags and duplicate IDs deny', () => {
  for (const accounts of [undefined, null, {}, '', [null], [[]], [{}], new Array(1)]) {
    denyAll({ ...office('book'), calendarAccounts: accounts });
  }
  for (const calendars of [undefined, null, {}, [null], [{}], new Array(1)]) {
    const cfg = office('book');
    cfg.calendarAccounts[0].calendars = calendars;
    denyAll(cfg);
  }
  for (const enabled of [undefined, null, 'true', 1]) {
    const cfg = office('book');
    cfg.calendarAccounts[0].calendars[0].enabled = enabled;
    denyAll(cfg);
  }
  for (const status of [undefined, null, true, 'unknown']) {
    const cfg = office('book');
    cfg.calendarAccounts[0].status = status;
    denyAll(cfg);
  }
  for (const id of [undefined, null, '', '*', 1, ' business']) {
    const cfg = office('book');
    cfg.calendarAccounts[0].calendars[0].id = id;
    denyAll(cfg);
  }
  const duplicateCalendar = office('book');
  duplicateCalendar.calendarAccounts[0].calendars.push({ ...duplicateCalendar.calendarAccounts[0].calendars[0] });
  denyAll(duplicateCalendar);
  const duplicateAccount = office('book');
  duplicateAccount.calendarAccounts.push(structuredClone(duplicateAccount.calendarAccounts[0]));
  denyAll(duplicateAccount);
});

test('an arbitrary proposal ID or approval claim never authorizes approval writes', () => {
  for (const id of [undefined, '', 'approved-id', true, { approved: true }, { agentId: 'pam', calendar: 'business', state: 'approved' }]) {
    const cfg = office('approval');
    Object.assign(cfg.agentCapabilities.pam.calendars[0], { approved: true, proposal: 'approved-id', approvalId: 'owner-approved' });
    const result = check(cfg, 'write', 'business', 'pam', id);
    assert.equal(result.ok, false);
    assert.match(result.reason, /trusted approval workflow/);
  }
});

test('book refuses proposals with an actionable reason; read names the Access tab', () => {
  assert.match(check(office('book'), 'propose').reason, /Make the change yourself/);
  assert.match(check(office('read'), 'write').reason, /Access tab/);
});

test('tool map has exactly the design tools and no inherited permissions', () => {
  assert.equal(Object.getPrototypeOf(CALENDAR_TOOL_OPS), null);
  assert.deepEqual(Object.entries(CALENDAR_TOOL_OPS).sort(), Object.entries({
    list_calendars: 'list', search_events: 'read', free_busy: 'read', propose_event: 'propose',
    create_event: 'write', update_event: 'write', cancel_event: 'write'
  }).sort());
  for (const tool of [...inherited, 'delete_event', 'unknown_tool']) {
    assert.equal(CALENDAR_TOOL_OPS[tool], undefined);
    assert.equal(check(office('book'), CALENDAR_TOOL_OPS[tool]).ok, false);
  }
});

test('inherited agents, grants and configuration fields cannot authorize calls', () => {
  const cfg = office('book');
  cfg.agentCapabilities = Object.create({ pam: cfg.agentCapabilities.pam });
  denyAll(cfg);
  const inheritedCfg = Object.create(office('book'));
  denyAll(inheritedCfg);
  const inheritedGrant = office('book');
  inheritedGrant.agentCapabilities.pam.calendars = [Object.create({ calendar: 'business', access: 'book' })];
  denyAll(inheritedGrant);
  const nullPrototype = office('book');
  nullPrototype.agentCapabilities = Object.assign(Object.create(null), nullPrototype.agentCapabilities);
  assert.equal(check(nullPrototype, 'write').ok, true);
});

test('per agent, per calendar grants and current revocation apply without mutation', () => {
  const cfg = office('book');
  cfg.agentCapabilities.pam.calendars.push({ calendar: 'team', access: 'read' });
  cfg.agentCapabilities.oscar = { calendars: [{ calendar: 'business', access: 'read' }] };
  const before = structuredClone(cfg);
  assert.equal(check(cfg, 'write').ok, true);
  assert.equal(check(cfg, 'write', 'team').ok, false);
  assert.equal(check(cfg, 'read', 'team').ok, true);
  assert.equal(check(cfg, 'write', 'business', 'oscar').ok, false);
  assert.deepEqual(cfg, before);
  cfg.agentCapabilities.pam.calendars[0].access = 'approval';
  assert.equal(check(cfg, 'write').ok, false);
  cfg.agentCapabilities.pam.calendars = [];
  denyAll(cfg);
});

test('list remains available for another enabled grant when one calendar is disabled', () => {
  const cfg = office();
  cfg.agentCapabilities.pam.calendars.push({ calendar: 'team', access: 'read' });
  cfg.calendarAccounts[0].calendars[0].enabled = false;
  assert.equal(calendarAccess(cfg, 'pam', undefined, 'list').ok, true);
  assert.equal(check(cfg, 'list').ok, false);
  assert.equal(check(cfg, 'read', 'team').ok, true);
});

test('legacy email and connector configurations remain compatible and grant no calendar access', () => {
  const legacy = { email: { enabled: true, mailboxes: ['business'], send: true }, connectors: ['Google Calendar'] };
  const cfg = { mailboxes: [{ id: 'business' }], agentCapabilities: { pam: legacy } };
  denyAll(cfg);
  assert.equal(mailAccess(cfg, 'pam', 'business', 'send').ok, true);
  Object.assign(cfg, { calendarAccounts: office().calendarAccounts });
  cfg.agentCapabilities.pam = { ...legacy, calendars: [{ calendar: 'business', access: 'read' }] };
  assert.equal(check(cfg, 'read').ok, true);
  assert.equal(mailAccess(cfg, 'pam', 'business', 'send').ok, true);
  assert.equal(mailAccess({}, 'pam', 'business', 'read').ok, false);
});
