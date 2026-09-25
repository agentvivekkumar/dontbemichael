'use strict';

/**
 * Company knowledge lives in the knowledge feature (owner, 2026-09-25): it is
 * on for every office, every agent including Michael is told to search it, and
 * no folder is shared. The retired Office folder becomes an ordinary folder
 * inside Michael's private one.
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
  exports: { app: { getPath: () => os.tmpdir() }, Notification: class { show() {} static isSupported() { return false; } } }
};

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
const main = read('src/main/index.ts');

test('the knowledge feature is on for new offices and switched on once for existing ones', () => {
  assert.match(read('src/main/config.ts'), /knowledgeGraph: \{ enabled: true \}/);
  const at = main.indexOf('function migrateBusinessFolder(): void {');
  const fn = main.slice(at, main.indexOf('\n}\n', at));
  assert.match(fn, /if \(!readConfig\(\)\.knowledgeOnSeeded\) \{/, 'once: an owner who turns it off keeps it off');
  assert.match(fn, /enabled: true \}, knowledgeOnSeeded: true/);
});

test('an office set up with an Office folder gets Michael\'s folder: the one holding it', () => {
  const at = main.indexOf('function migrateBusinessFolder(): void {');
  const fn = main.slice(at, main.indexOf('\n}\n', at));
  assert.match(fn, /if \(!cfg\.businessFolder && cfg\.officeFolder\) \{/);
  assert.match(fn, /writeConfig\(\{ businessFolder: parent && isUsableTeamFolder\(parent\) \? parent : office \}\);/);
  assert.match(main, /migrateBusinessFolder\(\); \/\/ one-time/);
  const { legacyBusinessFolder } = loadTs('src/shared/officeRecord.ts');
  assert.equal(legacyBusinessFolder('/Users/o/Documents/Biz/Office'), '/Users/o/Documents/Biz');
  assert.equal(legacyBusinessFolder('/Users/o/Documents/Biz/Office/'), '/Users/o/Documents/Biz');
  assert.equal(legacyBusinessFolder(undefined), undefined);
});

test('every agent, Michael included, is told to search company knowledge, and no folder is shared', async () => {
  const { HiveManager } = loadTs('src/main/hive.ts');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-knowledge-'));
  const hive = new HiveManager(() => home);
  const promptOf = (inj) => inj.args[inj.args.indexOf('--append-system-prompt') + 1];
  const opts = { knowledgeGraph: true, kgCliPath: '/App/kg.cjs', businessFolder: home };
  for (const meta of [
    { id: 'god', name: 'Michael', provider: 'claude', cwd: home, isGod: true },
    { id: 'oscar', name: 'Oscar', provider: 'claude', cwd: path.join(home, 'Finance') }
  ]) {
    const p = promptOf(await hive.ensureAgent(meta, opts));
    assert.match(p, /COMPANY KNOWLEDGE: the owner keeps company wide information in the company knowledge store/, meta.id);
    assert.ok(p.includes('"/App/kg.cjs" search "<words>"'), meta.id);
    assert.doesNotMatch(p, /Office folder/, meta.id);
  }
});
