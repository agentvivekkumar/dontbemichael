'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const ts = require('typescript');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'md calendar accounts '));
let userData = root;
let encryptionOn = true;
let encryptThrows = false;
const password = 'test-app-password-sensitive';
const electron = require.resolve('electron');
require.cache[electron] = { id: electron, filename: electron, loaded: true, exports: {
  app: { getPath: () => userData },
  safeStorage: {
    isEncryptionAvailable: () => encryptionOn,
    encryptString: (s) => { if (encryptThrows) throw new Error(password); return Buffer.from(`encrypted:${s}`); },
    decryptString: (s) => s.toString().replace(/^encrypted:/, '')
  }
} };
const config = loadTs('src/main/config.ts');
const secrets = loadTs('src/main/integrations.ts');
const { CalendarAccounts } = loadTs('src/main/calendarAccounts.ts');
const { calendarAccess } = loadTs('src/shared/calendars.ts');
const { validateCalendarAccountSettings, calendarSettingsPatchAllowed } = loadTs('src/shared/calendarAccounts.ts');
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
let sequence = 0;
const settings = () => ({ id: 'office', label: 'Office calendar', provider: 'caldav', serverUrl: 'https://calendar.example.test/dav', username: 'owner@example.test',
  calendars: [{ id: 'business', url: 'https://calendar.example.test/dav/bookings', name: 'Bookings', enabled: true },
    { id: 'team', url: 'https://calendar.example.test/dav/team', name: 'Team', enabled: false }] });
const request = () => ({ account: settings(), password });
function setup() {
  userData = path.join(root, `case ${++sequence}`);
  encryptionOn = true;
  encryptThrows = false;
  config.writeConfig({});
  config.readConfig();
  let failSave = () => false;
  let failDelete = false;
  let storeOverride;
  const manager = new CalendarAccounts({
    getConfig: config.readConfig,
    saveConfig: (patch) => { if (failSave(patch)) throw new Error(password); config.writeConfig(patch); },
    canStoreSecrets: secrets.canStoreSecrets,
    setSecret: (ref, value) => storeOverride ? storeOverride(ref, value) : secrets.setSecret(ref, value),
    deleteSecret: (ref) => { if (failDelete) return false; return secrets.deleteSecret(ref); }
  });
  return { manager, configFile: path.join(userData, 'config.json'), secretsFile: path.join(userData, 'integration-secrets.json'),
    failSave: (fn) => { failSave = fn; }, failDelete: (value) => { failDelete = value; },
    storeOverride: (fn) => { storeOverride = fn; } };
}
const success = (r) => { assert.equal(r.ok, true, r.error); return r; };

for (const provider of ['icloud', 'fastmail', 'zoho', 'caldav']) {
  test(`${provider}: metadata persists and the password uses the existing encrypted store`, () => {
    const { manager, configFile, secretsFile } = setup();
    secrets.setSecret('mail:sales', 'existing-mail-password');
    const input = request();
    input.account.provider = provider;
    const result = success(manager.add(input));
    assert.equal(result.record.status, 'needs-attention');
    assert.match(result.record.statusReason, /not been verified/);
    assert.match(result.record.secretRef, /^calendar:office:[a-f0-9]{32}$/);
    assert.equal(secrets.getSecret(result.record.secretRef), password);
    assert.equal(secrets.getSecret('mail:sales'), 'existing-mail-password');
    assert.equal(fs.readFileSync(configFile, 'utf8').includes(password), false);
    assert.equal(fs.readFileSync(secretsFile, 'utf8').includes(password), false);
    assert.equal(JSON.stringify(result).includes(password), false);
    assert.equal(JSON.stringify(manager.list()).includes(password), false);
    assert.deepEqual(success(new CalendarAccounts({ getConfig: config.readConfig }).list()).accounts, [result.record]);
    if (process.platform !== 'win32') assert.equal(fs.statSync(secretsFile).mode & 0o777, 0o600);
    const listed = success(manager.list());
    listed.accounts[0].label = 'Changed externally';
    assert.equal(success(manager.list()).accounts[0].label, 'Office calendar');
    assert.deepEqual(config.readConfig().calendarSecretCleanup, []);
  });
}

test('older configs list no accounts and unrelated config writes preserve saved metadata', () => {
  const { manager } = setup();
  assert.deepEqual(manager.list(), { ok: true, accounts: [] });
  assert.equal(config.readConfig().calendarAccounts, undefined);
  const added = success(manager.add(request()));
  config.writeConfig({ notifications: false, agentCapabilities: { pam: { email: { enabled: true, mailboxes: ['sales'], send: true } } } });
  assert.deepEqual(success(manager.list()).accounts, [added.record]);
  success(manager.remove('office'));
  assert.equal(config.readConfig().agentCapabilities.pam.email.send, true);
});

test('invalid account settings and password payloads make no changes', () => {
  const { manager, configFile, secretsFile } = setup();
  const before = fs.readFileSync(configFile, 'utf8');
  const invalid = [null, [], {}, Object.create(settings()),
    ...['../x', '__proto__', 'constructor', 'prototype', 'With Spaces', 'UPPER', '', 'x'.repeat(41), 1].map((id) => ({ ...settings(), id })),
    ...['', ' '.repeat(2), ' x', 'x ', 'x\nsecret', 'x'.repeat(121), null].map((label) => ({ ...settings(), label })),
    ...['gmail', 'other', '', null, 'constructor'].map((provider) => ({ ...settings(), provider })),
    ...['', 'owner name', 'x\r\nAuthorization: value', null, 'x'.repeat(321)].map((username) => ({ ...settings(), username })),
    ...['http://calendar.example.test', 'file:///secret', 'https://user:password@example.test/dav', 'https://example.test/?token=secret', 'https://example.test/#secret',
      'https://example.test/dav/../secret', 'https://example.test/dav/%2e%2e/secret', 'https://example.test/%0d%0asecret', ' https://example.test', 'https:\\example.test', 'not-url', null].map((serverUrl) => ({ ...settings(), serverUrl })),
    ...[{}, null, new Array(1), [null], [{}], [{ ...settings().calendars[0], password }],
      [{ ...settings().calendars[0], enabled: 'true' }], [{ ...settings().calendars[0], id: '../x' }],
      [{ ...settings().calendars[0], name: '' }], [{ ...settings().calendars[0], url: 'https://other.example.test/calendar' }],
      [settings().calendars[0], settings().calendars[0]]].map((calendars) => ({ ...settings(), calendars })),
    { ...settings(), password }, { ...settings(), secretRef: 'mail:sales' }, { ...settings(), status: 'connected' }];
  for (const account of invalid) assert.equal(manager.add({ account, password }).ok, false);
  for (const input of [undefined, [], null, {}, { account: settings() }, { ...request(), approved: true },
    ...['', ' ', null, true, 'x\nsecret', 'x'.repeat(4097)].map((value) => ({ account: settings(), password: value }))]) assert.equal(manager.add(input).ok, false);
  assert.equal(fs.readFileSync(configFile, 'utf8'), before);
  assert.equal(fs.existsSync(secretsFile), false);
});

test('duplicate accounts, cross account calendar IDs, missing updates and ID renames are refused', () => {
  const { manager } = setup();
  success(manager.add(request()));
  assert.equal(manager.add(request()).ok, false);
  const next = request();
  next.account.id = 'second';
  assert.equal(manager.add(next).ok, false, 'global calendar IDs cannot collide');
  next.account.calendars = [{ id: 'other', name: 'Other', url: 'https://calendar.example.test/other', enabled: true }];
  success(manager.add(next));
  assert.equal(manager.update('missing', request()).ok, false);
  assert.equal(manager.update('office', next).ok, false);
  for (const id of [null, '', [], '__proto__', 'constructor']) {
    assert.equal(manager.update(id, request()).ok, false);
    assert.equal(manager.remove(id).ok, false);
  }
  assert.equal(success(manager.list()).accounts.length, 2);
});

test('updates rotate only their own credential and never accept caller supplied connection status', () => {
  const { manager } = setup();
  const old = success(manager.add(request())).record;
  secrets.setSecret('int:unrelated', 'keep-me');
  const replacement = { account: settings(), password: 'replacement-password' };
  const saved = success(manager.update('office', replacement)).record;
  assert.notEqual(saved.secretRef, old.secretRef);
  assert.equal(secrets.hasSecret(old.secretRef), false);
  assert.equal(secrets.getSecret(saved.secretRef), replacement.password);
  assert.equal(secrets.getSecret('int:unrelated'), 'keep-me');
  assert.equal(saved.status, 'needs-attention');
  assert.equal(manager.update('office', { ...replacement, status: 'connected' }).ok, false);
});

test('metadata edits preserve a previously verified login, but credential and identity edits invalidate it', () => {
  const { manager } = setup();
  const added = success(manager.add(request())).record;
  config.writeConfig({ calendarAccounts: [{ ...added, status: 'connected', statusReason: undefined }] });
  const account = { ...settings(), label: 'New label' };
  const renamed = success(manager.update('office', { account })).record;
  assert.equal(renamed.secretRef, added.secretRef);
  assert.equal(renamed.status, 'connected');
  const identity = { ...account, username: 'new-owner@example.test' };
  assert.equal(manager.update('office', { account: identity }).ok, false);
  assert.equal(success(manager.update('office', { account: identity, password })).record.status, 'needs-attention');
  assert.equal(success(manager.update('office', { account: identity, password })).record.status, 'needs-attention');
});

for (const change of ['remove-calendar', 'change-url', 'change-identity', 'remove-account']) {
  test(`${change}: stale grants are revoked atomically and other capabilities survive`, () => {
    const { manager } = setup();
    success(manager.add(request()));
    const email = { enabled: true, mailboxes: ['sales'], send: true };
    config.writeConfig({ agentCapabilities: {
      pam: { email, calendars: [{ calendar: 'business', access: 'book' }, { calendar: 'team', access: 'read' }] },
      oscar: { connectors: ['Google Calendar'], calendars: [{ calendar: 'business', access: 'read' }] },
      legacy: { email }
    } });
    const account = settings();
    if (change === 'remove-account') assert.deepEqual(success(manager.remove('office')).affected.sort(), ['oscar', 'pam']);
    else {
      if (change === 'remove-calendar') account.calendars = account.calendars.slice(1);
      if (change === 'change-url') account.calendars[0].url += '/replacement';
      if (change === 'change-identity') account.username = 'another@example.test';
      success(manager.update('office', { account, ...(change === 'change-identity' ? { password } : {}) }));
    }
    const caps = config.readConfig().agentCapabilities;
    assert.deepEqual(caps.pam.email, email);
    assert.deepEqual(caps.legacy.email, email);
    assert.deepEqual(caps.oscar.connectors, ['Google Calendar']);
    assert.deepEqual(caps.oscar.calendars, []);
    assert.deepEqual(caps.pam.calendars, change === 'remove-account' || change === 'change-identity' ? [] : [{ calendar: 'team', access: 'read' }]);
    assert.equal(calendarAccess(config.readConfig(), 'pam', 'business', 'write').ok, false);
  });
}

test('new calendar IDs cannot reactivate dangling legacy grants', () => {
  const { manager } = setup();
  config.writeConfig({ agentCapabilities: { pam: { calendars: [{ calendar: 'business', access: 'book' }] } } });
  success(manager.add(request()));
  assert.deepEqual(config.readConfig().agentCapabilities.pam.calendars, []);
});

test('removing an account deletes its secret and is idempotent', () => {
  const { manager } = setup();
  const added = success(manager.add(request())).record;
  secrets.setSecret('mail:sales', 'keep-me');
  success(manager.remove('office'));
  assert.equal(secrets.hasSecret(added.secretRef), false);
  assert.equal(secrets.getSecret('mail:sales'), 'keep-me');
  assert.deepEqual(manager.remove('office'), { ok: true, affected: [], cleanupPending: false });
  assert.deepEqual(manager.list(), { ok: true, accounts: [] });
});

test('encryption unavailable, encryption errors and damaged secret files fail without exposing errors', () => {
  const { manager, secretsFile } = setup();
  encryptionOn = false;
  assert.equal(manager.add(request()).ok, false);
  assert.equal(fs.existsSync(secretsFile), false);
  encryptionOn = true;
  encryptThrows = true;
  let result = manager.add(request());
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(result).includes(password), false);
  encryptThrows = false;
  fs.writeFileSync(secretsFile, '{damaged');
  result = manager.add(request());
  assert.equal(result.ok, false);
  assert.equal(fs.readFileSync(secretsFile, 'utf8'), '{damaged');
  assert.deepEqual(success(manager.list()).accounts, []);
});

test('a failed journal write never stores a password; a failed metadata write keeps the prior password', () => {
  const f = setup();
  f.failSave(() => true);
  assert.equal(f.manager.add(request()).ok, false);
  assert.equal(fs.existsSync(f.secretsFile), false);
  f.failSave(() => false);
  const old = success(f.manager.add(request())).record;
  f.failSave((patch) => !!patch.calendarAccounts);
  const result = f.manager.update('office', { account: settings(), password: 'replacement-password' });
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(result).includes(password), false);
  assert.deepEqual(success(f.manager.list()).accounts, [old]);
  assert.equal(secrets.getSecret(old.secretRef), password);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(f.secretsFile, 'utf8'))), [old.secretRef]);
});

test('failed rollback deletion remains journaled and is recoverable after restart', () => {
  const f = setup();
  const old = success(f.manager.add(request())).record;
  f.failSave((patch) => !!patch.calendarAccounts);
  f.failDelete(true);
  assert.equal(f.manager.update('office', { account: settings(), password: 'replacement' }).ok, false);
  const pending = config.readConfig().calendarSecretCleanup;
  assert.equal(pending.length, 1);
  assert.notEqual(pending[0], old.secretRef);
  assert.equal(secrets.getSecret(pending[0]), 'replacement');
  const restarted = new CalendarAccounts({ getConfig: config.readConfig, saveConfig: config.writeConfig, deleteSecret: secrets.deleteSecret });
  assert.equal(restarted.cleanup(), false);
  assert.equal(secrets.hasSecret(pending[0]), false);
  assert.equal(secrets.getSecret(old.secretRef), password);
});

test('failed secret deletion revokes access immediately and leaves a retryable cleanup journal', () => {
  const f = setup();
  const old = success(f.manager.add(request())).record;
  f.failDelete(true);
  assert.equal(success(f.manager.remove('office')).cleanupPending, true);
  assert.deepEqual(success(f.manager.list()).accounts, []);
  assert.deepEqual(config.readConfig().calendarSecretCleanup, [old.secretRef]);
  f.failDelete(false);
  assert.equal(success(f.manager.remove('office')).cleanupPending, false);
  assert.equal(secrets.hasSecret(old.secretRef), false);
});

test('failed cleanup journal clearing is safely retried', () => {
  const f = setup();
  const old = success(f.manager.add(request())).record;
  f.failDelete(true);
  success(f.manager.remove('office'));
  f.failDelete(false);
  f.failSave((patch) => !patch.calendarAccounts);
  assert.equal(f.manager.cleanup(), true);
  assert.equal(secrets.hasSecret(old.secretRef), false);
  assert.deepEqual(config.readConfig().calendarSecretCleanup, [old.secretRef]);
  f.failSave(() => false);
  assert.equal(f.manager.cleanup(), false);
});

test('failed removal preserves config and its secret', () => {
  const f = setup();
  const old = success(f.manager.add(request())).record;
  f.failSave(() => true);
  assert.equal(f.manager.remove('office').ok, false);
  assert.deepEqual(success(f.manager.list()).accounts, [old]);
  assert.equal(secrets.getSecret(old.secretRef), password);
});

test('store errors and throws never reach responses or logs', () => {
  const f = setup();
  const logs = [];
  const realError = console.error;
  console.error = (...args) => logs.push(args);
  try {
    for (const store of [() => ({ ok: false, error: password }), () => { throw new Error(password); }]) {
      f.storeOverride(store);
      const result = f.manager.add(request());
      assert.equal(result.ok, false);
      assert.equal(JSON.stringify(result).includes(password), false);
    }
  } finally { console.error = realError; }
  assert.deepEqual(logs, []);
});

test('malformed persisted metadata and cleanup handles deny operations without changing secrets', () => {
  const f = setup();
  const added = success(f.manager.add(request())).record;
  secrets.setSecret('mail:sales', 'keep-me');
  for (const invalid of [null, {}, [null], [{ ...added, password }], [{ ...added, secretRef: 'mail:sales' }], [added, added]]) {
    config.writeConfig({ calendarAccounts: invalid });
    assert.equal(f.manager.list().ok, false);
    assert.equal(f.manager.add(request()).ok, false);
    assert.equal(f.manager.remove('office').ok, false);
  }
  config.writeConfig({ calendarAccounts: [added] });
  for (const journal of [null, {}, ['mail:sales'], [added.secretRef], new Array(1)]) {
    config.writeConfig({ calendarSecretCleanup: journal });
    assert.equal(f.manager.cleanup(), true);
    assert.equal(f.manager.list().ok, false);
  }
  assert.equal(secrets.getSecret('mail:sales'), 'keep-me');
  assert.equal(secrets.getSecret(added.secretRef), password);
});

test('generic settings IPC cannot bypass account management', () => {
  assert.equal(calendarSettingsPatchAllowed({ notifications: false }), true);
  for (const patch of [undefined, null, [], { calendarAccounts: [] }, { calendarAccounts: [{ ...settings(), password, status: 'connected' }] }, { calendarSecretCleanup: ['mail:sales'] }]) {
    assert.equal(calendarSettingsPatchAllowed(patch), false);
  }
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'index.ts'), 'utf8');
  assert.match(main, /if \(!calendarSettingsPatchAllowed\(patch\)\) throw new Error/);
  assert.match(main, /app\.whenReady\(\)\.then\(\(\) => \{\s*calendarAccounts\.cleanup\(\)/);
  const handlers = new Map();
  const ipcMain = { handle: (name, handler) => handlers.set(name, handler) };
  const lines = main.split('\n').filter((line) => line.startsWith("ipcMain.handle('calendarAccounts:") && !line.startsWith("ipcMain.handle('calendarAccounts:test'"));
  assert.equal(lines.length, 4);
  // Exercise the actual IPC registrations without booting Electron or a network.
  const registrations = ts.transpileModule(lines.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('ipcMain', 'calendarAccounts', registrations)(ipcMain, setup().manager);
  success(handlers.get('calendarAccounts:add')({}, request()));
  assert.equal(success(handlers.get('calendarAccounts:list')({})).accounts.length, 1);
  assert.equal(handlers.get('calendarAccounts:update')({}, 'office', { account: { ...settings(), password } }).ok, false);
  success(handlers.get('calendarAccounts:remove')({}, 'office'));
  const preload = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload', 'index.ts'), 'utf8');
  for (const op of ['List', 'Add', 'Update', 'Remove']) assert.match(preload, new RegExp(`calendarAccounts${op}:`));
  assert.doesNotMatch(preload, /calendarAccounts(?:GetPassword|GetSecret)/);
});

test('encoded calendar names with spaces are accepted, while duplicate URLs and excessive lists are rejected', () => {
  const account = settings();
  account.calendars[0].url = 'https://calendar.example.test/dav/My%20Calendar';
  assert.equal(validateCalendarAccountSettings(account).ok, true);
  const duplicate = { ...account.calendars[0], id: 'another' };
  account.calendars.push(duplicate);
  assert.equal(validateCalendarAccountSettings(account).ok, false);
  account.calendars = Array.from({ length: 201 }, (_, n) => ({ id: `calendar-${n}`, url: `https://calendar.example.test/${n}`, name: 'Calendar', enabled: true }));
  assert.equal(validateCalendarAccountSettings(account).ok, false);
});

for (const field of ['provider', 'serverUrl']) {
  test(`changing ${field} requires a password and invalidates prior authentication`, () => {
    const { manager } = setup();
    const old = success(manager.add(request())).record;
    config.writeConfig({ calendarAccounts: [{ ...old, status: 'connected' }], agentCapabilities: { pam: { calendars: [{ calendar: 'business', access: 'book' }] } } });
    const account = settings();
    account[field] = field === 'provider' ? 'fastmail' : 'https://calendar.example.test/new-home';
    assert.equal(manager.update('office', { account }).ok, false);
    assert.equal(success(manager.update('office', { account, password })).record.status, 'needs-attention');
    assert.deepEqual(config.readConfig().agentCapabilities.pam.calendars, []);
  });
}

test('new unverified accounts never authorize calendar operations even with a grant', () => {
  const { manager } = setup();
  success(manager.add(request()));
  config.writeConfig({ agentCapabilities: { pam: { calendars: [{ calendar: 'business', access: 'book' }] } } });
  for (const op of ['list', 'read', 'propose', 'write']) assert.equal(calendarAccess(config.readConfig(), 'pam', 'business', op).ok, false);
});

test('malformed agent grants fail safely without changing config or existing credentials', () => {
  const f = setup();
  const old = success(f.manager.add(request())).record;
  for (const caps of [null, [], { pam: null }, { pam: { calendars: {} } }, { pam: { calendars: [null] } },
    { pam: { calendars: [{ calendar: 'business', access: 'automatic' }] } }]) {
    config.writeConfig({ agentCapabilities: caps });
    const before = fs.readFileSync(f.configFile, 'utf8');
    assert.equal(f.manager.update('office', { account: settings() }).ok, false);
    assert.equal(f.manager.remove('office').ok, false);
    assert.equal(fs.readFileSync(f.configFile, 'utf8'), before);
    assert.equal(secrets.getSecret(old.secretRef), password);
  }
});

test('a secret store failure after writing a secret is recovered from the journal', () => {
  const f = setup();
  f.storeOverride((ref, value) => { secrets.setSecret(ref, value); throw new Error(password); });
  assert.equal(f.manager.add(request()).ok, false);
  assert.deepEqual(success(f.manager.list()).accounts, []);
  assert.deepEqual(config.readConfig().calendarSecretCleanup, []);
  assert.equal(fs.existsSync(f.secretsFile), false);
});

test('authenticated discovery uses the real encrypted store and persists only verified metadata', async () => {
  const f = setup();
  const added = success(f.manager.add(request())).record;
  const { discovery } = require('./caldav-fixtures.cjs');
  const { CalendarService } = loadTs('src/main/calendar.ts');
  const { CaldavTransport } = loadTs('src/main/caldavTransport.ts');
  const replies = discovery();
  const transport = new CaldavTransport({ resolve: async () => [{ address: '8.8.8.8', family: 4 }], send: async (r) => {
    assert.equal(r.headers.authorization, `Basic ${Buffer.from(`${settings().username}:${password}`).toString('base64')}`);
    return replies.shift();
  } });
  const service = new CalendarService({ accounts: f.manager, getConfig: config.readConfig, getSecret: secrets.getSecret, transport });
  const result = await service.testConnection('office');
  assert.equal(result.ok, true, result.error);
  assert.equal(config.readConfig().calendarAccounts[0].status, 'connected');
  assert.equal(secrets.getSecret(added.secretRef), password);
  assert.equal(JSON.stringify(result).includes(password), false);
  assert.equal(fs.readFileSync(f.configFile, 'utf8').includes(password), false);
});
