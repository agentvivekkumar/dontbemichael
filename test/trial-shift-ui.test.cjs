'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('trial shift preload bridge exposes methods', () => {
  const preload = read('src/preload/index.ts');
  assert.match(preload, /trialShiftListScenarios:\s*\(\)/);
  assert.match(preload, /trialShiftRun:\s*\(scenarioId/);
  assert.match(preload, /'trialShift:listScenarios'/);
  assert.match(preload, /'trialShift:run'/);
});

test('trial shift main process wires IPC handlers', () => {
  const main = read('src/main/index.ts');
  assert.match(main, /ipcMain\.handle\('trialShift:listScenarios'/);
  assert.match(main, /ipcMain\.handle\('trialShift:run'/);
  assert.match(main, /runTrialShift\(p\.scenarioId,\s*p\.agent/);
});

test('ProfileTab and EditAgentModal provide Trial Shift action buttons', () => {
  const profileTab = read('src/renderer/src/components/ProfileTab.tsx');
  assert.match(profileTab, /TrialShiftModal/);
  assert.match(profileTab, /trialShift\.button/);
  assert.match(profileTab, /setTrialOpen\(true\)/);

  const editModal = read('src/renderer/src/components/EditAgentModal.tsx');
  assert.match(editModal, /TrialShiftModal/);
  assert.match(editModal, /trialShift\.button/);
  assert.match(editModal, /setTrialOpen\(true\)/);
});

test('all trial shift translation keys exist in all three locales', () => {
  const en = JSON.parse(read('src/renderer/src/i18n/locales/en.json'));
  const zh = JSON.parse(read('src/renderer/src/i18n/locales/zh-CN.json'));
  const ar = JSON.parse(read('src/renderer/src/i18n/locales/ar.json'));

  assert.ok(en.trialShift, 'en.json must have trialShift');
  assert.ok(zh.trialShift, 'zh-CN.json must have trialShift');
  assert.ok(ar.trialShift, 'ar.json must have trialShift');

  const enKeys = Object.keys(en.trialShift);
  assert.ok(enKeys.length >= 10);

  for (const k of enKeys) {
    assert.ok(zh.trialShift[k], `zh-CN.json missing trialShift.${k}`);
    assert.ok(ar.trialShift[k], `ar.json missing trialShift.${k}`);
  }
});
