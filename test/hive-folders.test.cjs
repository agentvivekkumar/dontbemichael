'use strict';

/**
 * Where agents are told their work lives (Decisions 44, 48; F4-F6).
 *
 * The folder instructions are GATED: they appear only on a business install,
 * one with an Office folder. On an older install Michael still runs inside the
 * harness folder, and telling him never to write there would contradict where
 * he actually is, so the gate matters in both directions.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { HiveManager } = loadTs('src/main/hive.ts');

/** The system-prompt text passed at spawn. */
function promptOf(inj) {
  const i = inj.args.indexOf('--append-system-prompt');
  assert.ok(i >= 0, 'claude spawns carry an appended system prompt');
  return inj.args[i + 1];
}

function setup(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hive-folders-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const office = path.join(home, 'Documents', 'Pho', 'Office');
  const finance = path.join(home, 'Documents', 'Pho', 'Finance');
  fs.mkdirSync(office, { recursive: true });
  fs.mkdirSync(finance, { recursive: true });
  return { home, office, finance, hive: new HiveManager(() => home) };
}

test('an older install (no Office folder) gets no folder instructions at all', async (t) => {
  const { home, hive } = setup(t);
  const p = promptOf(await hive.ensureAgent({ id: 'god', name: 'Michael', provider: 'claude', cwd: home, isGod: true }));
  assert.doesNotMatch(p, /YOUR FOLDERS/);
  assert.doesNotMatch(p, /NEVER save documents/);
});

test('a team member is told its own folder, the shared Office, and that the hive is off limits', async (t) => {
  const { hive, office, finance } = setup(t);
  const p = promptOf(await hive.ensureAgent(
    { id: 'oscar', name: 'Oscar', provider: 'claude', cwd: finance, role: 'Finance' },
    { officeFolder: office }
  ));
  assert.ok(p.includes(`you work in ${finance}`), 'names its own folder');
  assert.match(p, /read it for context before searching the internet/);
  assert.match(p, /It is private: only you, anyone sharing this folder, and Michael can open it/, 'its folder is private');
  assert.ok(p.includes(`${office} is the Office folder: company knowledge that everyone reads and only Michael and the owner change`), 'names the Office');
  assert.match(p, /NEVER save documents, drafts or other work anywhere in the hive/);
});

test('Michael works in the business folder, reads his team\'s folders, and keeps the Office', async (t) => {
  const { hive, office } = setup(t);
  const business = path.dirname(office);
  const p = promptOf(await hive.ensureAgent(
    { id: 'god', name: 'Michael', provider: 'claude', cwd: business, isGod: true },
    { officeFolder: office }
  ));
  assert.ok(p.includes(`you work in ${business}, the business folder`));
  assert.match(p, /You can read their files, but only they change them/);
  assert.ok(p.includes(`${office} is the Office folder: company knowledge that the whole team reads and only you and the owner change`));
  assert.match(p, /NEVER save documents/);
});

test('agents are given the exact doc-text command for Word, Excel and PowerPoint', async (t) => {
  const { hive, office, finance } = setup(t);
  const cli = '/App/Contents/Resources/app.asar/out/main/docTextCli.js';
  const p = promptOf(await hive.ensureAgent(
    { id: 'oscar', name: 'Oscar', provider: 'claude', cwd: finance },
    { officeFolder: office, docTextCliPath: cli }
  ));
  assert.match(p, /To read a Word, Excel or PowerPoint file, run/);
  assert.ok(p.includes(`"${cli}" "<file>"`), 'the absolute CLI path, quoted');
  assert.match(p, /You can open PDFs and images directly/);
});

test('the Office folder is writable for every agent it is given to', async (t) => {
  const { hive, office, finance } = setup(t);
  const inj = await hive.ensureAgent(
    { id: 'oscar', name: 'Oscar', provider: 'claude', cwd: finance },
    { officeFolder: office, extraWritableDirs: [office] }
  );
  const settingsArg = inj.args[inj.args.indexOf('--settings') + 1];
  const settings = JSON.parse(fs.readFileSync(settingsArg, 'utf8'));
  const dirs = settings.permissions?.additionalDirectories ?? [];
  assert.ok(dirs.includes(office), `Office in additionalDirectories: ${JSON.stringify(dirs)}`);
});
