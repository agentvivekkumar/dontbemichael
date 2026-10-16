'use strict';
const loadTs = require('./load-ts.cjs');
const { CalendarAccounts } = loadTs('src/main/calendarAccounts.ts');
const { CalendarService } = loadTs('src/main/calendar.ts');
const { CaldavTransport } = loadTs('src/main/caldavTransport.ts');
const xml = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const multi = (...responses) => `<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">${responses.join('')}</d:multistatus>`;
const propstat = (props, code = 200) => `<d:propstat><d:prop>${props}</d:prop><d:status>HTTP/1.1 ${code} Status</d:status></d:propstat>`;
const resource = (href, props, failed = '') => `<d:response><d:href>${xml(href)}</d:href>${propstat(props)}${failed}</d:response>`;
const response = (body, status = 207, headers = {}) => ({ body, status, headers: { 'content-type': 'application/xml; charset=utf-8', ...headers } });
const discovery = (host = 'https://calendar.example.test') => [
  response(multi(resource('/dav', '<d:current-user-principal><d:href>/principal/owner</d:href></d:current-user-principal>'))),
  response(multi(resource('/principal/owner', '<c:calendar-home-set><d:href>/home/</d:href></c:calendar-home-set>'))),
  response(multi(resource('/home/', '<d:resourcetype><d:collection/></d:resourcetype>'),
    resource(`${host}/home/bookings/`, '<d:resourcetype><d:collection/><c:calendar/></d:resourcetype><d:displayname>Bookings &amp; visits</d:displayname><c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set><d:supported-report-set><d:supported-report><d:report><c:calendar-query/></d:report></d:supported-report></d:supported-report-set><d:current-user-privilege-set><d:privilege><d:read/></d:privilege></d:current-user-privilege-set>')))
];
const event = (lines = [], uid = 'visit') => ['BEGIN:VEVENT', `UID:${uid}`, ...lines, 'END:VEVENT'];
const ics = (...events) => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events.flat(), 'END:VCALENDAR', ''].join('\r\n');
const report = (data, code = 200) => response(multi(resource('/home/bookings/visit.ics', code === 200 ? `<d:getetag>&quot;version1&quot;</d:getetag><c:calendar-data>${xml(data)}</c:calendar-data>` : '<d:getetag>"version1"</d:getetag>', code !== 200 ? propstat('<c:calendar-data/>', code) : '')));
const range = { start: '2026-10-16T00:00:00Z', end: '2026-10-17T00:00:00Z' };
const account = () => ({ id: 'office', label: 'Office', provider: 'caldav', serverUrl: 'https://calendar.example.test/dav', username: 'owner@example.test', secretRef: `calendar:office:${'a'.repeat(32)}`, status: 'connected',
  calendars: [{ id: 'bookings', name: 'Bookings', url: 'https://calendar.example.test/home/bookings/', enabled: true }] });
function setup(options = {}) {
  let cfg = { calendarAccounts: [account()], agentCapabilities: { pam: { calendars: [{ calendar: 'bookings', access: 'read' }] } } };
  const secrets = new Map([[cfg.calendarAccounts[0].secretRef, 'secret-password-never-echo']]);
  const sent = [];
  let replies = [];
  const accounts = new CalendarAccounts({ getConfig: () => cfg, saveConfig: (patch) => { if (options.failSave) throw new Error('secret-password-never-echo'); cfg = { ...cfg, ...structuredClone(patch) }; },
    canStoreSecrets: () => true, setSecret: (ref, secret) => { secrets.set(ref, secret); return { ok: true }; }, deleteSecret: (ref) => { secrets.delete(ref); return true; } });
  const transport = new CaldavTransport({ resolve: options.resolve ?? (async () => [{ address: '93.184.216.34', family: 4 }]), send: async (r) => {
    sent.push(r);
    if (options.send) return options.send(r, sent.length);
    const next = replies.shift();
    if (next instanceof Error) throw next;
    if (!next) throw new Error('Unexpected request');
    return next;
  } });
  const service = new CalendarService({ accounts, getConfig: () => cfg, getSecret: (ref) => secrets.get(ref), transport });
  return { service, accounts, secrets, sent, get cfg() { return cfg; }, set cfg(value) { cfg = value; }, queue: (...values) => replies.push(...values) };
}
module.exports = { xml, multi, propstat, resource, response, discovery, event, ics, report, range, account, setup };
