'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { EventEmitter } = require('node:events');
const loadTs = require('./load-ts.cjs');
const { setup, range, report, ics, event } = require('./caldav-fixtures.cjs');
const { IntegrationBroker } = loadTs('src/main/integrationBroker.ts');
const { handleCalendarRequest } = loadTs('src/main/calendarRoutes.ts');
const contract = require('../resources/calendar-tool-contract.cjs');
const script = fs.readFileSync(path.join(__dirname, '../resources/md-calendar-mcp.cjs'), 'utf8');
const flush = async () => { for (let n = 0; n < 12; n++) await new Promise(setImmediate); };
/** Real stdio adapter and broker HTTP handler, using memory streams instead of
 * listening sockets. Production loopback/auth checks are left intact. */
function harness(options = {}) {
  const f = setup();
  const broker = new IntegrationBroker({ getRecord() {}, getSecret() { throw Error('calendar credentials must stay in CalendarService'); }, calendar: (id, tool, args) => handleCalendarRequest(f.service, { getConfig: () => f.cfg, present: (id) => id === 'pam' }, id, tool, args) });
  const token = broker.grant('session', [], 'pam');
  const stdin = new EventEmitter(), out = [], sent = [], timers = new Set();
  const fakeHttp = { request(url, opts, callback) {
    sent.push({ url: url.href, opts });
    const req = new EventEmitter();
    req.destroy = () => {};
    req.end = (body) => queueMicrotask(() => {
      if (options.timeout) return;
      const incoming = new EventEmitter();
      Object.assign(incoming, { url: url.pathname, method: opts.method, headers: opts.headers, complete: true, socket: { remoteAddress: '127.0.0.1' }, destroy() { this.emit('aborted'); } });
      let status;
      const res = { headersSent: false, writeHead(code) { status = code; this.headersSent = true; }, end(data) {
        const stream = new EventEmitter(); stream.statusCode = options.status ?? status; stream.complete = options.complete ?? true;
        callback(stream);
        queueMicrotask(() => { if (options.aborted) stream.emit('aborted'); else { stream.emit('data', Buffer.from(options.response ?? data)); stream.emit('end'); } });
      } };
      if (options.networkError) { req.emit('error', Error('secret-password-never-echo raw OS details')); return; }
      broker.handle(incoming, res);
      incoming.emit('data', Buffer.from(body)); incoming.emit('end');
    });
    return req;
  } };
  const processMock = { env: { MD_BROKER_URL: 'http://127.0.0.1:12345', MD_BROKER_TOKEN: token, ...options.env }, stdin, stdout: { write: (line) => out.push(JSON.parse(line)) } };
  vm.runInNewContext(script, { require: (id) => id === 'node:http' ? fakeHttp : contract, process: processMock, URL, Buffer, JSON,
    setTimeout: (fn, ms) => { const timer = setTimeout(fn, options.timeout ? 0 : ms); timers.add(timer); return timer; }, clearTimeout: (id) => { clearTimeout(id); timers.delete(id); } });
  let id = 0;
  return { f, broker, token, sent, out, async call(method, params) { const requestId = ++id; stdin.emit('data', Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: requestId, method, ...(params === undefined ? {} : { params }) }) + '\n')); await flush(); const result = out.find((r) => r.id === requestId); assert.ok(result, 'MCP response'); return result; }, async raw(value) { stdin.emit('data', Buffer.from(value)); await flush(); return out; }, close() { for (const t of timers) clearTimeout(t); broker.stop(); } };
}

test('MCP initializes, lists exactly three read tools, then reads through authenticated broker and mock CalDAV', async (t) => {
  const h = harness(); t.after(() => h.close());
  const initialized = await h.call('initialize', { protocolVersion: '2025-06-18' });
  assert.equal(initialized.result.serverInfo.name, 'md-calendar');
  const tools = (await h.call('tools/list')).result.tools;
  assert.deepEqual(tools.map((t) => t.name), ['list_calendars', 'search_events', 'free_busy']);
  assert.ok(tools.every((t) => t.annotations.readOnlyHint && !t.annotations.destructiveHint && t.inputSchema.additionalProperties === false));
  const listed = await h.call('tools/call', { name: 'list_calendars', arguments: {} });
  assert.equal(listed.result.isError, false); assert.equal(listed.result.structuredContent.calendars[0].calendar, 'bookings');
  assert.deepEqual(JSON.parse(listed.result.content[0].text), listed.result.structuredContent);
  h.f.queue(report(ics(event(['DTSTART:20261016T100000Z', 'DTEND:20261016T110000Z', 'SUMMARY:Visit']))));
  const events = await h.call('tools/call', { name: 'search_events', arguments: { calendar: 'bookings', ...range } });
  assert.equal(events.result.structuredContent.events[0].summary, 'Visit');
  h.f.queue(report(ics(event(['DTSTART:20261016T100000Z', 'DTEND:20261016T110000Z']))));
  assert.equal((await h.call('tools/call', { name: 'free_busy', arguments: { calendars: ['bookings'], ...range } })).result.structuredContent.busy.length, 1);
  assert.equal(h.sent.length, 3); assert.ok(h.sent.every((r) => r.opts.headers['x-md-broker-token'] === h.token));
  assert.doesNotMatch(JSON.stringify(h.out), /secret-password|secretRef|owner@example|"authorization"/i);
  assert.equal(h.sent.some((r) => JSON.stringify(r).includes('secret-password')), false);
});

test('MCP rejects unknown writes, inherited tool names, manipulated identities and invalid ranges without HTTP', async (t) => {
  const h = harness(); t.after(() => h.close());
  for (const name of ['create_event', 'update_event', 'cancel_event', 'propose_event', 'constructor', 'toString', '__proto__']) assert.equal((await h.call('tools/call', { name, arguments: {} })).error.code, -32602);
  for (const args of [{ calendar: 'bookings', ...range, agentId: 'god' }, { calendar: '../bookings', ...range }, { calendar: 'bookings', ...range, end: '2028-10-16T00:00:00Z' }]) assert.equal((await h.call('tools/call', { name: 'search_events', arguments: args })).error.code, -32602);
  assert.equal(h.sent.length, 0);
});

test('MCP caller cannot claim another agent; live grant removal is refused by broker', async (t) => {
  const h = harness(); t.after(() => h.close());
  h.f.cfg.agentCapabilities.pam.calendars = [];
  const result = await h.call('tools/call', { name: 'list_calendars', arguments: {} });
  assert.equal(result.result.isError, true); assert.equal(result.result.structuredContent.code, 'denied'); assert.equal(result.result.structuredContent.calendars, undefined);
  assert.equal(h.f.sent.length, 0);
});

test('MCP revoked token fails authentication without returning data', async (t) => {
  const h = harness(); t.after(() => h.close()); h.broker.revoke('session');
  const result = await h.call('tools/call', { name: 'list_calendars', arguments: {} });
  assert.equal(result.result.isError, true); assert.equal(result.result.structuredContent.code, 'unauthorized');
});

for (const opts of [{ env: { MD_BROKER_URL: 'https://evil.test' } }, { env: { MD_BROKER_URL: 'http://127.0.0.1:1234/evil' } }, { env: { MD_BROKER_TOKEN: '' } }, { networkError: true }, { timeout: true }, { response: '<html>secret-password-never-echo</html>' }, { complete: false }, { aborted: true }, { response: 'x'.repeat(4 * 1024 * 1024 + 1) }]) test(`MCP transport fails safely for ${Object.keys(opts).join(',')}`, async (t) => {
  const h = harness(opts); t.after(() => h.close());
  const result = await h.call('tools/call', { name: 'list_calendars', arguments: {} });
  assert.equal(result.result.isError, true); assert.doesNotMatch(JSON.stringify(result), /secret-password|raw OS/);
  if (opts.env) assert.equal(h.sent.length, 0);
});

test('MCP rejects malformed or oversized framing, then accepts the next valid request', async (t) => {
  const h = harness(); t.after(() => h.close());
  await h.raw('{bad\n'); assert.equal(h.out.at(-1).error.code, -32700);
  await h.raw('x'.repeat(17000)); await h.raw('tail\n'); assert.equal(h.out.at(-1).error.message, 'Request too large');
  assert.deepEqual((await h.call('ping')).result, {});
  assert.equal((await h.call('resources/list')).error.code, -32601);
  await h.raw('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
  assert.equal(h.out.filter((r) => r.id === undefined).length, 0);
  assert.equal(h.sent.length, 0);
});

test('mail and calendar registration share one capability, stay private, and follow agent/provider/grant boundaries', () => {
  const main = fs.readFileSync(path.join(__dirname, '../src/main/index.ts'), 'utf8');
  const start = main.indexOf('  let calendarAttached = false;');
  const end = main.indexOf('  const res = ptyManager.spawn(opts, owner);', start);
  assert.ok(start > 0 && end > start);
  const body = ts.transpileModule(main.slice(start, end) + '\nreturn { opts, calendarAttached };', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const args = ['claudeProvider', 'opts', 'integrationBroker', 'readConfig', 'expandTilde', 'hive', 'SHOW_MAILBOXES', 'hasMailTools', 'calendarMemberPresent', 'hasCalendarTools', 'mdMailMcpPath', 'mkdirSync', 'dirname', 'writeFileSync', 'unlinkSync', 'legacyMdMailMcpPath', 'mdMailScriptPath', 'mdCalendarScriptPath'];
  const run = new Function(...args, body);
  function spawn({ mail = false, calendar = false, showMail = true, claude = true, role = 'member', present = true } = {}) {
    const files = [], grants = [];
    const opts = { id: 'pty', hive: { id: 'pam', role }, args: ['--resume', 'thread'] };
    const out = run(claude, opts, { running: () => true, url: () => 'http://127.0.0.1:12345', grant: (...a) => { grants.push(a); return 'shared-session-token'; } }, () => ({ harnessHome: '/home with spaces', agentCapabilities: { pam: {} } }), (p) => p, { root: () => '/hive with spaces', nodeCommand: () => '/node with spaces/node' }, showMail, () => mail, () => present, () => calendar, () => '/private/agent-mcp/pam/md-mail.mcp.json', () => {}, path.dirname, (file, text, flags) => files.push({ file, cfg: JSON.parse(text), flags }), () => {}, () => '/legacy/file', () => '/resources/md-mail-mcp.cjs', () => '/resources/md-calendar-mcp.cjs');
    return { ...out, files, grants };
  }
  const both = spawn({ mail: true, calendar: true });
  assert.equal(both.grants.length, 1); assert.deepEqual(both.grants[0], ['pty', [], 'pam']);
  assert.deepEqual(Object.keys(both.files[0].cfg.mcpServers), ['md-mail', 'md-calendar']);
  assert.equal(both.files[0].cfg.mcpServers['md-mail'].env.MD_BROKER_TOKEN, both.files[0].cfg.mcpServers['md-calendar'].env.MD_BROKER_TOKEN);
  assert.equal(both.files[0].flags.mode, 0o600); assert.deepEqual(both.opts.args.slice(-2), ['--mcp-config', both.files[0].file]);
  assert.equal(both.files[0].cfg.mcpServers['md-calendar'].command, '/node with spaces/node');
  assert.deepEqual(Object.keys(spawn({ mail: true, calendar: true, showMail: false }).files[0].cfg.mcpServers), ['md-calendar']);
  assert.deepEqual(Object.keys(spawn({ mail: true }).files[0].cfg.mcpServers), ['md-mail']);
  for (const options of [{ calendar: false }, { calendar: true, role: 'worker' }, { calendar: true, claude: false }, { calendar: true, present: false }]) assert.equal(spawn(options).files.length, 0);
  const manifest = fs.readFileSync(path.join(__dirname, '../electron-builder.yml'), 'utf8');
  for (const resource of ['md-calendar-mcp.cjs', 'calendar-tool-contract.cjs']) assert.ok(manifest.includes(`from: resources/${resource}`));
});
