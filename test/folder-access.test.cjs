'use strict';

/**
 * Who may open and change which folder (owner, 2026-09-25;
 * src/shared/folderAccess.ts):
 *  - Michael works in the business folder, which holds the Office and every
 *    team member's folder.
 *  - A team member's folder is private to that member (and anyone sharing it)
 *    and Michael; Michael reads it but does not change it.
 *  - The Office folder is company knowledge: everyone reads it, only Michael
 *    changes it.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron, filename: electron, loaded: true,
  exports: { Notification: class { show() {} static isSupported() { return false; } } }
};

const { businessFolderOf, folderPolicy, folderDecision, folderToolTarget } = loadTs('src/shared/folderAccess.ts');
const { folderLayoutFor } = loadTs('src/main/officeFile.ts');
const { HiveManager } = loadTs('src/main/hive.ts');

const B = '/Users/me/Documents/Pho';
const layout = {
  business: B,
  office: `${B}/Office`,
  teamFolders: [`${B}/Finance`, `${B}/Admin`, '/Users/me/Dropbox/Sales']
};
const oscar = { isGod: false, cwd: `${B}/Finance` };
const michael = { isGod: true, cwd: B };

test('Michael\'s folder is the one holding the Office', () => {
  assert.equal(businessFolderOf(`${B}/Office`), B);
  assert.equal(businessFolderOf(undefined), undefined);
});

test('a team member opens its own folder and reads the Office, and nothing else of the office', () => {
  const allow = (tool, p) => folderDecision(oscar, layout, tool, p, true).deny === false;
  assert.ok(allow('Read', `${B}/Finance/statements/june.pdf`));
  assert.ok(allow('Write', `${B}/Finance/summary.md`));
  assert.ok(allow('Read', `${B}/Office/Company profile.md`));
  assert.ok(!allow('Write', `${B}/Office/Company profile.md`), 'the Office is only Michael\'s to change');
  assert.ok(!allow('Read', `${B}/Admin/contracts.docx`), 'a peer\'s folder is private');
  assert.ok(!allow('Grep', '/Users/me/Dropbox/Sales'), 'even when the owner put it outside the business folder');
  assert.ok(!allow('Read', `${B}/plan.md`), 'Michael\'s own files are his');
  assert.ok(allow('Read', '/Users/me/Downloads/rates.csv'), 'places outside the office are not this rule\'s business');
  // Case differs from the disk on macOS: the registry once held "MoblizeIt" for "MoblizeIT".
  assert.ok(!allow('Read', `${B.toLowerCase()}/admin/x`));
});

test('the refusal tells the agent what to do instead', () => {
  const d = folderDecision(oscar, layout, 'Edit', `${B}/Office/Prices.md`, true, 'Michael');
  assert.equal(d.deny, true);
  assert.match(d.reason, /only Michael and the owner change it/);
  assert.match(d.reason, /send anything meant for everyone to Michael/);
  assert.doesNotMatch(d.reason, /[–—]/, 'no dashes in agent-facing text');
});

test('agents sharing a folder (same role) both open it', () => {
  const kevin = { isGod: false, cwd: `${B}/Finance` };
  assert.equal(folderDecision(kevin, layout, 'Read', `${B}/Finance/june.pdf`, true).deny, false);
});

test('Michael reads everything and changes only what is his', () => {
  const allow = (tool, p) => folderDecision(michael, layout, tool, p, true).deny === false;
  assert.ok(allow('Read', `${B}/Finance/june.pdf`));
  assert.ok(allow('Read', '/Users/me/Dropbox/Sales/leads.csv'));
  assert.ok(!allow('Write', `${B}/Finance/june.pdf`), 'a team member\'s folder is theirs to change');
  assert.ok(!allow('Edit', '/Users/me/Dropbox/Sales/leads.csv'));
  assert.ok(allow('Write', `${B}/Office/Policies/refunds.md`), 'Michael keeps the Office');
  assert.ok(allow('Write', `${B}/notes.md`));
});

test('the spawn settings hold the same rules for shell commands and file tools', () => {
  const w = folderPolicy(oscar, layout, true);
  assert.deepEqual(w.sandbox.denyRead, [B, `${B}/Admin`, '/Users/me/Dropbox/Sales']);
  assert.deepEqual(w.sandbox.allowRead, [`${B}/Finance`, `${B}/Office`], 'its own folder and the Office reopened');
  assert.deepEqual(w.sandbox.denyWrite, [`${B}/Office`]);
  assert.ok(w.deny.includes(`Read(//Users/me/Documents/Pho/Admin/**)`));
  assert.ok(w.deny.includes(`Edit(//Users/me/Documents/Pho/Office/**)`));
  assert.ok(!w.deny.some((r) => r.includes('/Finance')), 'never locks the agent out of its own folder');

  const g = folderPolicy(michael, layout, true);
  assert.deepEqual(g.sandbox.denyRead, []);
  assert.deepEqual(g.sandbox.denyWrite, [`${B}/Finance`, `${B}/Admin`, '/Users/me/Dropbox/Sales']);
  assert.ok(g.deny.every((r) => r.startsWith('Edit(')), 'Michael is never denied a read');
});

test('the path a file tool touches', () => {
  assert.equal(folderToolTarget('Read', { file_path: 'june.pdf' }, `${B}/Finance`), `${B}/Finance/june.pdf`);
  assert.equal(folderToolTarget('Grep', { pattern: 'x', path: `${B}/Admin` }, `${B}/Finance`), `${B}/Admin`);
  assert.equal(folderToolTarget('Glob', { pattern: `${B}/Admin/**/*.md` }, `${B}/Finance`), `${B}/Admin`);
  assert.equal(folderToolTarget('Grep', { pattern: 'x' }, `${B}/Finance`), null, 'no path: its own folder');
});

test('the layout drops folders that are not a team member\'s own place', () => {
  const docs = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'md-folders-')));
  const biz = path.join(docs, 'Pho');
  for (const f of ['Office', 'Finance', 'Admin']) fs.mkdirSync(path.join(biz, f), { recursive: true });
  const app = path.join(docs, 'HarnessAgents');
  fs.mkdirSync(app);
  const l = folderLayoutFor(path.join(biz, 'Office'), [
    path.join(biz, 'Finance'), path.join(biz, 'Admin'), path.join(biz, 'Finance'),
    docs, // an agent started in Documents doesn't hide Documents
    app, // the app's own folder
    os.homedir()
  ], app);
  assert.equal(l.business, biz);
  assert.equal(l.office, path.join(biz, 'Office'));
  assert.deepEqual(l.teamFolders, [path.join(biz, 'Finance'), path.join(biz, 'Admin')]);
});

test('a Claude agent\'s settings file carries the folder rules', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-folder-settings-'));
  const hive = new HiveManager(() => home);
  const inj = await hive.ensureAgent(
    { id: 'oscar', name: 'Oscar', provider: 'claude', cwd: oscar.cwd },
    { folderPolicy: folderPolicy(oscar, layout, true) }
  );
  const settings = JSON.parse(fs.readFileSync(inj.args[inj.args.indexOf('--settings') + 1], 'utf8'));
  assert.deepEqual(settings.sandbox.filesystem.denyRead, [B, `${B}/Admin`, '/Users/me/Dropbox/Sales']);
  assert.deepEqual(settings.sandbox.filesystem.allowRead, [`${B}/Finance`, `${B}/Office`]);
  assert.deepEqual(settings.sandbox.filesystem.denyWrite, [`${B}/Office`]);
  assert.ok(settings.permissions.deny.includes('Read(//Users/me/Documents/Pho/Admin/**)'));
  assert.ok(Array.isArray(settings.permissions.additionalDirectories), 'the write allowances are still there');
});
