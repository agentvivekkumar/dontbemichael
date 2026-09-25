'use strict';

/**
 * Who may open and change which folder (owner, 2026-09-25;
 * src/shared/folderAccess.ts):
 *  - Every agent's folder is private to that agent (and anyone sharing it) and
 *    anyone above it. Michael's is private to him and the owner.
 *  - Michael works in the business folder, which holds every team member's
 *    folder, and reads them but does not change them.
 *  - No folder is shared: company knowledge lives in the knowledge feature.
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

const { folderPolicy, folderDecision, folderToolTarget } = loadTs('src/shared/folderAccess.ts');
const { folderLayoutFor } = loadTs('src/main/officeFile.ts');
const { HiveManager } = loadTs('src/main/hive.ts');

const B = '/Users/me/Documents/Pho';
const layout = {
  business: B,
  teamFolders: [`${B}/Finance`, `${B}/Admin`, '/Users/me/Dropbox/Sales']
};
const oscar = { isGod: false, cwd: `${B}/Finance` };
const michael = { isGod: true, cwd: B };

test('a team member opens its own folder and nothing else of the office', () => {
  const allow = (tool, p) => folderDecision(oscar, layout, tool, p, true).deny === false;
  assert.ok(allow('Read', `${B}/Finance/statements/june.pdf`));
  assert.ok(allow('Write', `${B}/Finance/summary.md`));
  assert.ok(!allow('Read', `${B}/Admin/contracts.docx`), 'a peer\'s folder is private');
  assert.ok(!allow('Grep', '/Users/me/Dropbox/Sales'), 'even when the owner put it outside the business folder');
  assert.ok(!allow('Read', `${B}/plan.md`), 'Michael\'s own files are his');
  assert.ok(!allow('Read', `${B}/Office/Company profile.md`), 'the retired Office folder is just part of Michael\'s');
  assert.ok(allow('Read', '/Users/me/Downloads/rates.csv'), 'places outside the office are not this rule\'s business');
  // Case differs from the disk on macOS: the registry once held "MoblizeIt" for "MoblizeIT".
  assert.ok(!allow('Read', `${B.toLowerCase()}/admin/x`));
});

test('the refusal tells the agent what to do instead', () => {
  const d = folderDecision(oscar, layout, 'Read', `${B}/Admin/x.md`, true, 'Michael');
  assert.equal(d.deny, true);
  assert.match(d.reason, /only they and Michael can open it/);
  assert.match(d.reason, /ask Michael/);
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
  assert.ok(allow('Write', `${B}/notes.md`), 'his own folder');
});

test('the spawn settings hold the same rules for shell commands and file tools', () => {
  const w = folderPolicy(oscar, layout, true);
  assert.deepEqual(w.sandbox.denyRead, [B, `${B}/Admin`, '/Users/me/Dropbox/Sales']);
  assert.deepEqual(w.sandbox.allowRead, [`${B}/Finance`], 'its own folder reopened inside Michael\'s');
  assert.deepEqual(w.sandbox.denyWrite, []);
  assert.ok(w.deny.includes(`Read(//Users/me/Documents/Pho/Admin/**)`));
  assert.ok(!w.deny.some((r) => r.includes('/Finance')), 'never locks the agent out of its own folder');

  assert.equal(w.sandboxOnly, true, 'a team member can\'t switch the sandbox off');
  const g = folderPolicy(michael, layout, true);
  assert.equal(g.sandboxOnly, false, 'Michael keeps it');
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
  for (const f of ['Finance', 'Admin']) fs.mkdirSync(path.join(biz, f), { recursive: true });
  const app = path.join(docs, 'HarnessAgents');
  fs.mkdirSync(app);
  const l = folderLayoutFor(biz, [
    path.join(biz, 'Finance'), path.join(biz, 'Admin'), path.join(biz, 'Finance'),
    docs, // an agent started in Documents doesn't hide Documents
    app, // the app's own folder
    os.homedir()
  ], app);
  assert.equal(l.business, biz);
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
  assert.deepEqual(settings.sandbox.filesystem.allowRead, [`${B}/Finance`]);
  assert.ok(settings.permissions.deny.includes('Read(//Users/me/Documents/Pho/Admin/**)'));
  assert.ok(Array.isArray(settings.permissions.additionalDirectories), 'the write allowances are still there');
  assert.equal(settings.sandbox.allowUnsandboxedCommands, false, 'no shell command runs outside the sandbox');
});

test('a name starting with two dots is inside its folder; a relative Glob is judged by its folder', () => {
  const allow = (tool, p) => folderDecision(oscar, layout, tool, p, true).deny === false;
  assert.ok(allow('Read', `${B}/Finance/..notes`));
  assert.equal(folderToolTarget('Glob', { pattern: '../Admin/**' }, `${B}/Finance`), `${B}/Admin/`.replace(/\/$/, ''));
  assert.ok(!allow('Glob', folderToolTarget('Glob', { pattern: '../Admin/**' }, `${B}/Finance`)));
  assert.equal(folderToolTarget('Glob', { pattern: '**/*.md' }, `${B}/Finance`), null, 'a pattern in its own folder names no other');
});

test('the hook judges the real path too, so a link out of an agent\'s folder is refused', () => {
  const hooks = fs.readFileSync(path.resolve(__dirname, '../src/main/hooks.ts'), 'utf8');
  assert.match(hooks, /const real = realPathOf\(target\);/);
  const { realPathOf } = loadTs('src/main/hooks.ts');
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'md-link-')));
  fs.mkdirSync(path.join(dir, 'Biz', 'Finance'), { recursive: true });
  fs.symlinkSync(path.join(dir, 'Biz'), path.join(dir, 'Biz', 'Finance', 'biz'));
  const real = realPathOf(path.join(dir, 'Biz', 'Finance', 'biz', 'payroll.xlsx'));
  assert.equal(real, path.join(dir, 'Biz', 'payroll.xlsx'), 'a file not there yet takes its folder\'s real path');
  const l = { business: path.join(dir, 'Biz'), teamFolders: [path.join(dir, 'Biz', 'Finance')] };
  const me = { isGod: false, cwd: path.join(dir, 'Biz', 'Finance') };
  assert.equal(folderDecision(me, l, 'Read', real, true).deny, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a Glob with a path is judged by where its pattern points', () => {
  assert.equal(folderToolTarget('Glob', { pattern: '../Admin/**', path: `${B}/Finance` }, `${B}/Finance`), `${B}/Admin`);
  assert.equal(folderToolTarget('Glob', { pattern: '**/*.md', path: `${B}/Finance/docs` }, `${B}/Finance`), `${B}/Finance/docs`);
  assert.equal(folderToolTarget('Glob', { pattern: `${B}/Admin/*.pdf`, path: `${B}/Finance` }, `${B}/Finance`), `${B}/Admin`);
});

test('an agent whose folder is reached through a link still opens its own files', () => {
  const { realPathOf } = loadTs('src/main/hooks.ts');
  const hooks = fs.readFileSync(path.resolve(__dirname, '../src/main/hooks.ts'), 'utf8');
  assert.match(hooks, /cwd: realPathOf\(me\.cwd\) \?\? me\.cwd/);
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'md-linkcwd-')));
  fs.mkdirSync(path.join(dir, 'Biz', 'Finance'), { recursive: true });
  fs.symlinkSync(path.join(dir, 'Biz'), path.join(dir, 'BizLink'));
  const l = { business: path.join(dir, 'Biz'), teamFolders: [path.join(dir, 'Biz', 'Finance')] };
  const linkedCwd = path.join(dir, 'BizLink', 'Finance');
  const real = realPathOf(path.join(linkedCwd, 'june.pdf'));
  assert.equal(folderDecision({ isGod: false, cwd: realPathOf(linkedCwd) }, l, 'Read', real, true).deny, false);
  fs.rmSync(dir, { recursive: true, force: true });
});
