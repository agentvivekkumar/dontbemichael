'use strict';

// Issue #425: the engine status badges and the "not installed" message on the
// orchestrator (Manager) setup step were English only, even for a Chinese or
// Arabic reader. The shared module's English words stay as the i18next
// defaultValue, and the locales carry the real strings.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const locale = (l) => JSON.parse(read(`src/renderer/src/i18n/locales/${l}.json`));
const LOCALES = ['en', 'zh-CN', 'ar'];

const KEYS = [
  'statusInstalled',
  'statusInstallsOnFirstRun',
  'statusNotInstalled',
  'engineNotInstalled',
  'checkAgain',
  'checking',
  'installInstructions'
];
const engineStatus = (l) => locale(l).onboarding.orchestrator;

test('every locale carries the engine status strings on the Manager step', () => {
  // Value: protects=engine status and its message translate on the setup step; fails_when=a locale misses a new key or ships it empty; why_new=the step was English only; seam=none
  for (const l of LOCALES) {
    for (const k of KEYS) {
      const v = engineStatus(l)[k];
      assert.equal(typeof v, 'string', `${l}: onboarding.orchestrator.${k} is missing`);
      assert.ok(v.trim(), `${l}: onboarding.orchestrator.${k} is empty`);
    }
  }
});

test('the engine status strings follow the house copy rules', () => {
  // Value: protects=the new strings match the product's copy rules; fails_when=a value carries a dash or names the manager directly; why_new=the strings are owner facing; seam=none
  for (const l of LOCALES) {
    for (const k of KEYS) {
      const v = engineStatus(l)[k];
      assert.doesNotMatch(v, /[\u002D\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/, `${l}: ${k} has a dash: ${v}`);
      assert.doesNotMatch(v, /Michael/i, `${l}: ${k} hardcodes the manager name: ${v}`);
    }
  }
});

test('the not installed message interpolates the engine and the manager', () => {
  // Value: protects=the message names the chosen engine and the manager; fails_when=an interpolation is dropped or permanently named; why_new=the message moves from code into the locales; seam=none
  for (const l of LOCALES) {
    const v = engineStatus(l).engineNotInstalled;
    assert.match(v, /\{\{label\}\}/, `${l}: engineNotInstalled lacks {{label}}`);
    assert.match(v, /\{\{godName\}\}/, `${l}: engineNotInstalled lacks {{godName}}`);
  }
});

test('the locales agree on the placeholders', () => {
  // Value: protects=a translation that drops an interpolation is caught; fails_when=one locale loses {{label}} or {{godName}} while the others keep it; why_new=three locales now carry the same message; seam=none
  const vars = (v) => [...new Set(String(v).match(/\{\{(\w+)\}\}/g) || [])].sort();
  const base = vars(engineStatus('en').engineNotInstalled).join(',');
  for (const l of ['zh-CN', 'ar']) {
    assert.equal(vars(engineStatus(l).engineNotInstalled).join(','), base, `${l}: placeholder drift`);
  }
});

test('the wizard renders the keys, with the English words as the fallback', () => {
  // Value: protects=the render path is wired to the locales; fails_when=the badge or the buttons ship hard-coded English again; why_new=the step joined the i18n system; seam=source pin like the neighbouring tests
  const src = read('src/renderer/src/components/OnboardingWizard.tsx');
  for (const [word, key] of [
    ['INSTALLED', 'onboarding.orchestrator.statusInstalled'],
    ['INSTALLS ON FIRST RUN', 'onboarding.orchestrator.statusInstallsOnFirstRun'],
    ['NOT INSTALLED', 'onboarding.orchestrator.statusNotInstalled']
  ]) {
    assert.match(src, new RegExp(`'${word.replace(/ /g, '\\s')}'\\s*:\\s*'${key.replace(/\./g, '\\.')}'`),
      `the badge for ${word} is not wired to ${key}`);
  }
  assert.match(src, /t\(ENGINE_STATUS_KEYS\[badge\],\s*\{\s*defaultValue:\s*badge\s*\}\)/,
    'the badge render lost the English defaultValue');
  assert.match(src, /t\('onboarding\.orchestrator\.engineNotInstalled',\s*\{\s*[\s\S]*?defaultValue:\s*engineAvailabilityMessage\(/,
    'the not installed message lost the shared English fallback');
  assert.match(src, /t\('onboarding\.orchestrator\.checking'\)/, 'the probing label is no longer translated');
  assert.match(src, /t\('onboarding\.orchestrator\.checkAgain'\)/, 'the check again button is no longer translated');
  assert.match(src, /t\('onboarding\.orchestrator\.installInstructions'\)/, 'the install instructions button is no longer translated');
  // The old hard-coded strings are gone from the step.
  assert.doesNotMatch(src, /'checking…?'[\s\S]{0,40}: 'check again'/, 'the probing label is still hard-coded');
  assert.doesNotMatch(src, />install instructions</, 'the install instructions button is still hard-coded');
  assert.doesNotMatch(src, />\{engineAvailabilityMessage\(/, 'the message is still raw English from the shared module');
});
