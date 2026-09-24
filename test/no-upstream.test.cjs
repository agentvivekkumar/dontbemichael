'use strict';

/**
 * Nothing in the app, its build, or this repo's GitHub setup points at the
 * upstream munder-difflin project (owner, 2026-09-24): not updates, not
 * fetched content, not links, not the URL scheme its website uses, not its
 * funding page. Credit for the fork stays in README.md, which is not scanned.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const UPSTREAM = /chaitanyagiri|munderdiffl\.in|girichaitanya|munderdifflinfund|discord\.gg\/SEDzP5ZPk5/i;

function files(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) return files(rel);
    return /\.(ts|tsx|cjs|mjs|js|json|yml|yaml|md|html|txt)$/.test(e.name) ? [rel] : [];
  });
}

test('no file the app ships or builds from points upstream', () => {
  const scanned = [
    ...files('src'), ...files('resources'), ...files('scripts'), ...files('.github'),
    'electron-builder.yml', 'electron.vite.config.ts', 'package.json', 'SECURITY.md', 'CONTRIBUTING.md'
  ];
  assert.ok(scanned.length > 300, `sanity: ${scanned.length} files`);
  for (const f of scanned) {
    const hit = read(f).split('\n').findIndex((l) => UPSTREAM.test(l));
    assert.equal(hit, -1, `${f}:${hit + 1} points at the upstream project`);
  }
});

test('updates come from this repo, with installers named for this app', () => {
  const { REPO, installerUrl } = loadTs('src/shared/updateState.ts');
  assert.equal(REPO, 'agentvivekkumar/dontbemichael');
  assert.equal(installerUrl('1.0.0', 'darwin', 'arm64'),
    'https://github.com/agentvivekkumar/dontbemichael/releases/download/v1.0.0/Dont-Be-Michael-1.0.0-mac-arm64.dmg');
  assert.match(read('src/main/updater.ts'), /import \{[^}]*\bREPO\b[^}]*\} from '\.\.\/shared\/updateState';/, 'one REPO, shared');
  const builder = read('electron-builder.yml');
  assert.match(builder, /publish:\n\s+provider: github\n\s+owner: agentvivekkumar\n\s+repo: dontbemichael/);
  // The file names the build produces are the ones installerUrl() links to.
  for (const name of ['Dont-Be-Michael-${version}-mac-${arch}.${ext}', 'Dont-Be-Michael-${version}-win-x64-setup.exe', 'Dont-Be-Michael-${version}-linux-x86_64.AppImage']) {
    assert.ok(builder.includes(`artifactName: ${name}`), name);
  }
});

test('fetched content comes from this repo', () => {
  assert.match(read('src/main/hero.ts'), /raw\.githubusercontent\.com\/agentvivekkumar\/dontbemichael\/main\/docs\/hero\.json/);
  assert.match(read('src/main/modelCatalog.ts'), /raw\.githubusercontent\.com\/agentvivekkumar\/dontbemichael\/main\/docs\/model-catalog\.json/);
  assert.ok(fs.existsSync(path.join(root, 'docs/hero.json')) && fs.existsSync(path.join(root, 'docs/model-catalog.json')));
});

test('the app registers its own URL scheme, not the one upstream\'s website links to', () => {
  const main = read('src/main/index.ts');
  assert.doesNotMatch(main, /setAsDefaultProtocolClient\('munderdifflin'/);
  // One constant, used everywhere the scheme appears.
  assert.equal(loadTs('src/shared/appName.ts').APP_URL_SCHEME, 'dontbemichael');
  assert.match(main, /setAsDefaultProtocolClient\(APP_URL_SCHEME/);
  assert.doesNotMatch(main + read('src/shared/hire.ts'), /'dontbemichael(:|:\/\/)?'/);
  assert.match(read('electron-builder.yml'), /schemes:\n\s+- dontbemichael\n/);
  const { parseHireDeepLink } = loadTs('src/shared/hire.ts');
  assert.equal(parseHireDeepLink('munderdifflin://hire?src=https://example.com/a.hire.json'), null);
});
