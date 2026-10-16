'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const loadTs = require('./load-ts.cjs');
const { setup, range, discovery, response, account } = require('./caldav-fixtures.cjs');
const { saveCalendarDraft, CALENDAR_SERVERS } = loadTs('src/renderer/src/components/calendarAccountActions.ts');
const { CalendarAccounts } = loadTs('src/main/calendarAccounts.ts');
const { CalendarSessions } = loadTs('src/main/calendarSessions.ts');
const locales = Object.fromEntries(['en', 'zh-CN', 'ar'].map((l) => [l, require(`../src/renderer/src/i18n/locales/${l}.json`).calendars]));
const draft = () => ({ id: 'office', label: 'Office', provider: 'caldav', serverUrl: 'https://calendar.example.test/dav', username: 'owner@example.test' });
function apiFor(f) {
  return { calendarAccountsList: async () => f.accounts.list(), calendarAccountsAdd: async (input) => f.accounts.add(input), calendarAccountsUpdate: async (id, input) => f.accounts.update(id, input), calendarAccountsTest: (id) => f.service.testConnection(id) };
}
function translate(key, args = {}) {
  const value = key.split('.').reduce((v, k) => v?.[k], { calendars: locales.en });
  return typeof value === 'string' ? value.replace(/{{(\w+)}}/g, (_, k) => String(args[k] ?? '')) : args.defaultValue ?? key;
}
/** Execute real component handlers with minimal hook state and a mocked IPC
 * boundary. No browser, Electron launch or network is needed for these flows. */
function component(name, extra = {}) {
  let cursor = 0;
  const state = [], effects = [];
  const react = { useState(init) { const i = cursor++; if (!(i in state)) state[i] = typeof init === 'function' ? init() : init; return [state[i], (v) => { state[i] = typeof v === 'function' ? v(state[i]) : v; }]; }, useRef(init) { const i = cursor++; return state[i] ??= { current: init }; }, useId() { return `calendar-test-${cursor++}`; }, useEffect(fn) { const i = cursor++; if (!(i in state)) { state[i] = true; effects.push(fn); } }, useCallback(fn) { cursor++; return fn; } };
  const getState = () => ({ agents: [], pendingRestart: {}, setPendingRestart() {} });
  const useStore = (fn) => fn(getState()); useStore.getState = getState;
  const mocks = { react, 'react-i18next': { useTranslation: () => ({ t: translate }) }, './PixelButton': { PixelButton: 'button' }, './triggers/ui': { TriggerCard: 'card', MiniButton: 'button', Select: 'select', Toggle: 'toggle' }, './CalendarAccountDialog': { CalendarAccountDialog: 'dialog' }, '../store/store': { useStore }, '@/store/store': { useStore }, ...extra };
  const filename = path.resolve(__dirname, `../src/renderer/src/components/${name}.tsx`);
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }, fileName: filename }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', js)((id) => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    if (id.endsWith('.css')) return {};
    if (id.startsWith('@shared/')) return loadTs(`src/shared/${id.slice(8)}.ts`);
    if (id === './calendarAccountActions') return { saveCalendarDraft, CALENDAR_SERVERS };
    return require(id);
  }, mod, mod.exports);
  return { render(props = {}) { cursor = 0; return mod.exports[name](props); }, mount() { return effects.splice(0).map((f) => f()); } };
}
function nodes(tree) {
  if (tree == null || typeof tree === 'boolean') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (typeof tree !== 'object') return [];
  return [tree, ...nodes(tree.props?.children)];
}
const find = (tree, type, predicate = () => true) => { const node = nodes(tree).find((n) => n.type === type && predicate(n.props)); assert.ok(node, `missing ${type}`); return node.props; };
const flush = async () => { for (let i = 0; i < 12; i++) await new Promise(setImmediate); };

for (const provider of ['icloud', 'fastmail', 'zoho', 'caldav']) test(`${provider} account form workflow saves only metadata, tests authentication and discovers disabled calendars`, async () => {
  const f = setup(); f.cfg = {};
  f.queue(...discovery());
  const result = await saveCalendarDraft(apiFor(f), { ...draft(), provider }, 'app-password', false);
  assert.deepEqual(result, { ok: true });
  const saved = f.cfg.calendarAccounts[0];
  assert.equal(saved.status, 'connected'); assert.equal(saved.calendars.length, 1); assert.equal(saved.calendars[0].enabled, false);
  assert.equal(JSON.stringify(f.cfg).includes('app-password'), false);
  assert.equal(f.secrets.get(saved.secretRef), 'app-password');
});

test('form validation refuses unsafe settings before persistence or network calls', async () => {
  for (const change of [{ label: '' }, { username: 'bad user' }, { serverUrl: 'http://localhost' }, { id: '../bad' }, { provider: 'google' }]) {
    const f = setup(); f.cfg = {};
    assert.deepEqual(await saveCalendarDraft(apiFor(f), { ...draft(), ...change }, 'app-password', false), { ok: false, code: 'settings' });
    assert.deepEqual(f.cfg, {}); assert.equal(f.sent.length, 0);
  }
});

test('failed authentication persists needs-attention and a retry reuses the account and saved password', async () => {
  const f = setup(); f.cfg = {}; f.queue(response('private diagnostic', 401));
  const api = apiFor(f);
  assert.deepEqual(await saveCalendarDraft(api, draft(), 'app-password', false), { ok: false, code: 'authentication' });
  assert.equal(f.cfg.calendarAccounts[0].status, 'needs-attention');
  assert.equal(f.cfg.calendarAccounts.length, 1);
  f.queue(...discovery());
  assert.deepEqual(await saveCalendarDraft(api, draft(), undefined, false), { ok: true });
  assert.equal(f.cfg.calendarAccounts.length, 1); assert.equal(f.cfg.calendarAccounts[0].status, 'connected');
});

test('editing uses latest discovered selections, preserves password, and never resurrects removed accounts', async () => {
  const f = setup(), before = f.cfg.calendarAccounts[0].secretRef;
  const api = apiFor(f);
  f.cfg.calendarAccounts[0].calendars[0].enabled = false;
  f.queue(...discovery());
  assert.deepEqual(await saveCalendarDraft(api, { ...draft(), label: 'Renamed' }, undefined, true), { ok: true });
  assert.equal(f.cfg.calendarAccounts[0].calendars[0].enabled, false);
  assert.equal(f.cfg.calendarAccounts[0].calendars[0].id, 'bookings');
  assert.equal(f.cfg.calendarAccounts[0].secretRef, before);
  f.accounts.remove('office');
  assert.deepEqual(await saveCalendarDraft(api, draft(), undefined, true), { ok: false, code: 'changed' });
  assert.deepEqual(f.cfg.calendarAccounts, []);
});

test('raw IPC exceptions never enter form errors', async () => {
  const api = { calendarAccountsList: async () => { throw Error('PASSWORD private OS error'); } };
  assert.deepEqual(await saveCalendarDraft(api, draft(), 'PASSWORD', false), { ok: false, code: 'save' });
});

test('account dialog submits a new password only, clears it at once, and surfaces sanitized authentication failures', async () => {
  const originalWindow = global.window;
  let sent, finish, saved = 0;
  const fakePassword = { value: 'new-app-password' };
  global.window = { cth: { calendarAccountsList: async () => ({ ok: true, accounts: [account()] }), calendarAccountsUpdate: async (id, input) => { sent = input; return { ok: true, record: account() }; }, calendarAccountsTest: async () => new Promise((r) => { finish = r; }) } };
  try {
    const c = component('CalendarAccountDialog');
    const props = { account: account(), onClose() {}, onSaved() { saved++; } };
    let tree = c.render(props);
    const password = find(tree, 'input', (p) => p.type === 'password');
    assert.equal(password.value, undefined); assert.equal(password.defaultValue, undefined);
    const passwordNode = nodes(tree).find((n) => n.type === 'input' && n.props.type === 'password');
    passwordNode.ref.current = fakePassword;
    const submit = find(tree, 'form').onSubmit({ preventDefault() {} });
    assert.equal(fakePassword.value, '');
    await flush();
    assert.equal(sent.password, 'new-app-password'); assert.equal(sent.account.secretRef, undefined); assert.equal(sent.account.status, undefined);
    tree = c.render(props); assert.equal(find(tree, 'fieldset').disabled, true);
    finish({ ok: false, code: 'authentication', error: 'new-app-password RAW ERROR' }); await submit;
    tree = c.render(props);
    assert.equal(find(tree, 'p', (p) => p.role === 'alert').children, locales.en.errors.authentication);
    assert.equal(saved, 0); assert.equal(JSON.stringify(tree).includes('new-app-password'), false);
  } finally { global.window = originalWindow; }
});

test('account settings handles loading, discovery, selections, confirmation, deletion and IPC failure states', async () => {
  const originalWindow = global.window;
  const f = setup(); let observer, removed = 0;
  global.window = { cth: { ...apiFor(f), onConfigChanged: (fn) => { observer = fn; return () => {}; }, calendarAccountsSelect: async (...args) => f.accounts.selectCalendar(...args), calendarAccountsRemove: async (id) => { removed++; return f.accounts.remove(id); } } };
  try {
    const c = component('CalendarsSettings');
    let tree = c.render(); assert.match(find(tree, 'div', (p) => p.role === 'status').children[0], /Loading/);
    c.mount(); await flush();
    tree = c.render(); assert.equal(find(tree, 'input', (p) => p.type === 'checkbox').checked, true);
    find(tree, 'input', (p) => p.type === 'checkbox').onChange({ target: { checked: false } }); await flush();
    tree = c.render(); assert.equal(find(tree, 'input', (p) => p.type === 'checkbox').checked, false);
    f.queue(...discovery());
    find(tree, 'button', (p) => p.children === locales.en.test).onClick(); await flush();
    assert.equal(f.sent.length, 3);
    tree = c.render(); find(tree, 'button', (p) => p.children === locales.en.remove).onClick();
    assert.equal(removed, 0);
    tree = c.render(); find(tree, 'button', (p) => p.children === locales.en.confirm).onClick(); await flush();
    tree = c.render(); assert.equal(removed, 1); assert.ok(nodes(tree).some((n) => n.props?.children === locales.en.empty));
    global.window.cth.calendarAccountsList = async () => { throw Error('private credential'); }; observer(); await flush();
    tree = c.render(); assert.equal(find(tree, 'div', (p) => p.role === 'alert').children, locales.en.errors.settings);
    assert.equal(JSON.stringify(tree).includes('private credential'), false);
  } finally { global.window = originalWindow; }
});

test('agent access control defaults new grants to read, supports each configured level and uses delta IPC', async () => {
  const originalWindow = global.window;
  let cfg = { calendarAccounts: [account()], agentCapabilities: { pam: { email: { enabled: true, mailboxes: ['sales'] }, connectors: ['Gmail'] } } };
  const manager = new CalendarAccounts({ getConfig: () => cfg, saveConfig: (p) => { cfg = { ...cfg, ...p }; }, present: (id) => id === 'pam', deleteSecret: () => true });
  const calls = [];
  global.window = { cth: { calendarSetGrant: async (...args) => { calls.push(args); return manager.setGrant(...args); } } };
  try {
    const c = component('CalendarAccessSection');
    const agent = { id: 'pam', name: 'Pam' };
    let tree = c.render({ agent, config: cfg });
    assert.equal(find(tree, 'toggle').on, false);
    find(tree, 'toggle').onClick(); await flush();
    assert.deepEqual(calls[0], ['pam', 'bookings', 'read']);
    for (const level of ['approval', 'book', 'read']) {
      tree = c.render({ agent, config: cfg }); find(tree, 'select').onChange(level); await flush();
      assert.equal(cfg.agentCapabilities.pam.calendars[0].access, level);
    }
    cfg.calendarAccounts[0].calendars[0].enabled = false;
    tree = c.render({ agent, config: cfg });
    assert.equal(find(tree, 'fieldset').disabled, true);
    assert.ok(nodes(tree).some((n) => n.props?.children === locales.en.access.unavailable));
    find(tree, 'toggle').onClick(); await flush();
    assert.deepEqual(cfg.agentCapabilities.pam.calendars, []);
    assert.deepEqual(cfg.agentCapabilities.pam.connectors, ['Gmail']);
    assert.deepEqual(cfg.agentCapabilities.pam.email, { enabled: true, mailboxes: ['sales'] });
  } finally { global.window = originalWindow; }
});

test('sessions started without tools request one restart after a grant, repair or re-enable, with reload recovery and teardown', () => {
  const f = setup(), sessions = new CalendarSessions(), notices = [];
  f.cfg.calendarAccounts[0].calendars[0].enabled = false;
  sessions.record('pty', 'pam', false);
  const changed = () => sessions.changed(f.cfg, (id) => id === 'pam', (id) => notices.push(id));
  changed(); assert.deepEqual(notices, []);
  f.cfg.calendarAccounts[0].calendars[0].enabled = true;
  changed(); changed(); assert.deepEqual(notices, ['pam']);
  assert.deepEqual(sessions.pending(f.cfg, () => true), ['pam']);
  sessions.record('pty', 'pam', true); changed(); assert.deepEqual(sessions.pending(f.cfg, () => true), []);
  sessions.remove('pty'); assert.deepEqual(sessions.pending(f.cfg, () => true), []);
});

test('all calendar UI copy has translations, consistent placeholders and token based styles', () => {
  const flatten = (o, prefix = '') => Object.entries(o).flatMap(([k, v]) => typeof v === 'string' ? [[prefix + k, v]] : flatten(v, `${prefix}${k}.`));
  const en = flatten(locales.en);
  for (const l of ['zh-CN', 'ar']) {
    const translated = Object.fromEntries(flatten(locales[l]));
    assert.deepEqual(Object.keys(translated).sort(), en.map(([k]) => k).sort());
    for (const [key, text] of en) assert.deepEqual((translated[key].match(/{{\w+}}/g) ?? []).sort(), (text.match(/{{\w+}}/g) ?? []).sort());
  }
  const css = fs.readFileSync(path.join(__dirname, '../src/renderer/src/components/calendars.css'), 'utf8');
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(/i);
  const tokens = fs.readFileSync(path.join(__dirname, '../src/renderer/src/design/tokens.css'), 'utf8');
  for (const [, token] of css.matchAll(/var\((--cth-[\w-]+)\)/g)) assert.ok(tokens.includes(`${token}:`), token);
});
