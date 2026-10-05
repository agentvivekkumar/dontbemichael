'use strict';
// Beta pill and a prefilled problem report on every build
// (docs/designs/windows-11-installer.md, E4).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const { reportProblemUrl } = loadTs('src/shared/reportProblem.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

test('the report link fills the bug form\'s version and OS fields, and nothing else', () => {
  // Value: protects=reports arrive labeled by OS and version without private data; fails_when=the field ids drift from bug_report.yml, the OS value is not a dropdown option, or more goes in the URL; why_new=E4; seam=none
  const win = new URL(reportProblemUrl({ appVersion: '0.1.1', platform: 'win32', arch: 'x64', osVersion: '10.0.26100' }));
  assert.equal(win.pathname, '/agentvivekkumar/dontbemichael/issues/new');
  assert.deepEqual([...win.searchParams.keys()].sort(), ['app-version', 'os', 'os-version', 'template']);
  assert.equal(win.searchParams.get('os'), 'Windows');
  assert.equal(win.searchParams.get('template'), 'bug_report.yml');
  assert.equal(new URL(reportProblemUrl({ appVersion: '0.1.1', platform: 'darwin', arch: 'arm64' })).searchParams.get('os'), 'macOS (Apple Silicon)');
  assert.equal(new URL(reportProblemUrl({ appVersion: '0.1.1', platform: 'darwin', arch: 'x64' })).searchParams.get('os'), 'macOS (Intel)');
  const form = read('.github/ISSUE_TEMPLATE/bug_report.yml');
  for (const id of ['app-version', 'os', 'os-version']) assert.match(form, new RegExp(`id: ${id}\\b`), `${id} is a field of the form`);
  for (const os of ['macOS (Apple Silicon)', 'macOS (Intel)', 'Windows']) assert.ok(form.includes(`- ${os}`), `${os} is a dropdown option`);
});

test('Settings and the top bar show a Beta pill with an InfoTip on every build', () => {
  const hero = read('src/renderer/src/components/SettingsHeroCard.tsx');
  assert.match(hero, /<BetaPill info=\{t\('settingsHero\.betaInfo'\)\} \/>/);
  const pill = read('src/renderer/src/components/BetaPill.tsx');
  assert.match(pill, /\{t\('settingsHero\.beta'\)\}<\/span>[\s\S]*?<InfoTip label=\{`\$\{t\('settingsHero\.beta'\)\}: \$\{info\}`\} text=\{info\} align=\{align\} \/>/);
  // Beside the version in the top bar too (owner, 2026-10-05), its tip pointing to Settings.
  const bar = read('src/renderer/src/shell/TopBar.tsx');
  const at = (needle) => bar.indexOf(needle);
  assert.ok(at('<UpdateBadge />') > 0 && at('<UpdateBadge />') < at(`<BetaPill info={t('shell.betaInfo')} align="end" />`) && at(`<BetaPill info={t('shell.betaInfo')} align="end" />`) < at('<CliUpdateBadge />'), 'the pill sits right after the version');
  // The pill is its own layer (or its tip opens under the Tasks board); the bar
  // is not, so the update badge's cards still outrank toasts.
  assert.match(bar, /<span style=\{\{ position: 'relative', zIndex: 240, display: 'inline-flex' \}\}>\n\s+<BetaPill info=\{t\('shell\.betaInfo'\)\} align="end" \/>/);
  assert.doesNotMatch(bar, /className="cth-titlebar-drag"\n\s+style=\{\{\n\s+(\/\/[^\n]*\n\s+)*position: 'relative', zIndex:/);
  assert.match(hero, /onClick=\{open\(reportProblemUrl\(\{ appVersion: __APP_VERSION__, platform: window\.cth\.platform, arch: window\.cth\.arch, osVersion: window\.cth\.osVersion \}\)\)\}/);
  assert.doesNotMatch(hero, /issues\/new`\)/, 'one report link, not a second');
  for (const loc of ['en', 'zh-CN', 'ar']) {
    const h = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).settingsHero;
    const shell = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).shell;
    // Dashes in these strings are no-dashes.test.cjs's job.
    assert.ok(h.beta && h.betaInfo && shell.betaInfo, loc);
  }
});
