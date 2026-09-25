'use strict';

/**
 * Launch goes straight into the office. The "which folder?" screen shows only
 * when the office folder went missing (moved, renamed or deleted), and then the
 * app does NOT rebuild an empty office at the old path behind the owner's back.
 * Switching folders on purpose lives in Settings → General (owner, 2026-09-24).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { homeFolderStatus, homeReadyAtLaunch } = loadTs('src/main/homeFolder.ts');
const read = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');

function tmp(t) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'office-launch-'));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  return d;
}

test('a folder with an office in it is ready', (t) => {
  const home = tmp(t);
  fs.mkdirSync(path.join(home, 'hive'));
  fs.writeFileSync(path.join(home, 'hive', 'registry.json'), '{"godId":null,"agents":{}}');
  assert.deepEqual(homeFolderStatus(home), { path: home, exists: true, hasOffice: true });
  assert.equal(homeReadyAtLaunch({ onboardingComplete: true, harnessHome: home }), true);
});

test('a moved or deleted folder is not, and neither is an emptied one', (t) => {
  const base = tmp(t);
  const gone = path.join(base, 'HarnessAgents');
  assert.deepEqual(homeFolderStatus(gone), { path: gone, exists: false, hasOffice: false });
  assert.equal(homeReadyAtLaunch({ onboardingComplete: true, harnessHome: gone }), false);
  fs.mkdirSync(gone);
  assert.deepEqual(homeFolderStatus(gone), { path: gone, exists: true, hasOffice: false });
  assert.equal(homeReadyAtLaunch({ onboardingComplete: true, harnessHome: gone }), false);
  const file = path.join(base, 'not-a-folder');
  fs.writeFileSync(file, 'x');
  assert.equal(homeFolderStatus(file).exists, false);
});

test('before onboarding there is nothing to lose, so launch proceeds', () => {
  assert.equal(homeReadyAtLaunch({ onboardingComplete: false }), true);
  assert.equal(homeReadyAtLaunch({ onboardingComplete: true, harnessHome: '' }), false);
});

test('a missing office is never rebuilt empty at launch, and nothing that feeds it starts', () => {
  const main = read('src/main/index.ts');
  assert.match(main, /const homeReady = homeReadyAtLaunch\(readConfig\(\)\);\s*if \(homeReady\) \{?\s*bootstrapHiveServices\(\);/);
  assert.match(main, /if \(homeReady && slackCfg\.slackEnabled && slackCfg\.slackSigningSecret\)/);
  assert.match(main, /if \(homeReady && enabledWebhookEndpoints\(\)\.length > 0\)/);
});

test('a normal launch shows no picker; only a missing office shows the new screen', () => {
  const app = read('src/renderer/src/App.tsx');
  assert.doesNotMatch(app, /HivePicker/);
  assert.ok(!fs.existsSync(path.resolve(__dirname, '../src/renderer/src/components/HivePicker.tsx')));
  assert.match(app, /setHomeState\(st\.hasOffice \? 'ok' : 'missing'\)/);
  assert.match(app, /if \(homeState === 'missing'\) \{\s*return <OfficeFolderMissing config=\{config\} \/>;/);
  // Onboarding lands straight in the office it just made (after reloading, when
  // that office is not the one the roster was loaded for: roster-source.test.cjs).
  assert.match(app, /onComplete=\{\(next\) => \{[\s\S]{0,200}?setConfig\(next\); setHomeState\('ok'\);\s*\}\}/);
});

test('the missing screen only opens a folder that really holds an office', () => {
  const screen = read('src/renderer/src/components/OfficeFolderMissing.tsx');
  assert.match(screen, /if \(!status\?\.hasOffice\) \{\s*setError\(t\('officeMissing\.notAnOffice'\)\);/);
  // Starting over is a confirmed, deliberate choice.
  assert.match(screen, /setConfirmStartOver\(true\)/);
  assert.match(screen, /window\.cth\.startOverHere\(\)/);
});

test('Settings never offers to move an office on top of another one', () => {
  const settings = read('src/renderer/src/components/SettingsModal.tsx');
  assert.match(settings, /\(changeTargetHasOffice\s*\? \[\['fresh', t\('settings\.changeHome\.openTitle'\)/);
  assert.match(settings, /setChangeMode\(hasOffice \? 'fresh' : 'move'\)/);
  assert.match(settings, /otherOffices\.map\(\(h\) =>/);
});

test('"start over here" leaves a real office behind, so the next launch goes in', async (t) => {
  // The relaunch trusts only a folder holding hive/registry.json; a bare folder
  // would loop the owner back to the missing screen.
  const main = read('src/main/index.ts');
  const handler = main.slice(main.indexOf("ipcMain.handle('config:startOverHere'"));
  assert.match(handler.slice(0, 1200), /ensureHarnessHome\(home\)[\s\S]*hive\.ensureHive\(\)[\s\S]*app\.relaunch\(\)/);
  // And ensureHive really writes what the launch check reads.
  const home = tmp(t);
  const { HiveManager } = loadTs('src/main/hive.ts');
  new HiveManager(() => home).ensureHive();
  assert.equal(homeFolderStatus(home).hasOffice, true);
});
