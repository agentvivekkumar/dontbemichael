'use strict';

/**
 * Business-mode onboarding — the parts that can be held without a React harness.
 *
 * The wizard itself (business grid → welcome → … → finish) is a UI flow and is
 * covered by manual/E2E QA. What this file pins is what that flow DEPENDS on:
 *
 *   - the config actually persists the business the owner picked, and an
 *     install that already chose an audience keeps it (onboarding no longer
 *     writes `audience`, but Settings' "simple mode" still reads it);
 *   - every string the business screen asks for exists in every shipped locale,
 *     so no owner sees a raw `onboarding.business.*` key on their first screen;
 *   - every glyph a shipped pack names is one the wizard can draw, so no tile
 *     falls back to "?".
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// config.ts resolves its file through Electron's app.getPath(); point it at a
// throwaway userData root (same seam as config-write-notify.test.cjs).
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'md-business-onboarding-'));
const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron,
  filename: electron,
  loaded: true,
  exports: { app: { getPath: () => userData } }
};
const { writeConfig, readConfig } = loadTs('src/main/config.ts');
test.after(() => fs.rmSync(userData, { recursive: true, force: true }));

test('the business the owner picked persists, an existing audience survives, and fresh installs read as unset', () => {
  // An install that predates business mode: it chose "simple mode" long ago.
  writeConfig({ audience: 'non-technical' });

  // What the wizard's finish() now writes: no audience key at all.
  writeConfig({
    onboardingComplete: true,
    businessType: 'restaurant-food',
    businessName: 'Pho Saigon Kitchen',
    businessCity: 'Austin, TX'
  });

  const cfg = readConfig();
  assert.equal(cfg.businessType, 'restaurant-food');
  assert.equal(cfg.businessName, 'Pho Saigon Kitchen');
  assert.equal(cfg.businessCity, 'Austin, TX');
  assert.equal(cfg.audience, 'non-technical', 'onboarding must not reset an existing simple-mode choice');

  // DEFAULTS must not invent a pack for installs that never picked one.
  const cfgFile = path.join(userData, 'config.json');
  const saved = fs.readFileSync(cfgFile, 'utf8');
  fs.rmSync(cfgFile);
  try {
    const cfg = readConfig();
    assert.equal(cfg.businessType, undefined);
    assert.equal(cfg.businessName, undefined);
    assert.equal(cfg.businessCity, undefined);
  } finally {
    fs.writeFileSync(cfgFile, saved);
  }
});

function flatten(obj, pre = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = pre ? `${pre}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

test('every onboarding key the wizard uses exists in every shipped locale', () => {
  const wizard = read('src/renderer/src/components/OnboardingWizard.tsx');
  const used = [...new Set([...wizard.matchAll(/\bt\('(onboarding\.[A-Za-z0-9_.]+)'/g)].map((m) => m[1]))];
  assert.ok(used.includes('onboarding.business.ask'), 'sanity: the business screen keys are scanned');
  const locales = fs
    .readdirSync(path.join(root, 'src/renderer/src/i18n/locales'))
    .filter((f) => f.endsWith('.json'));
  assert.ok(locales.length >= 3);
  for (const file of locales) {
    const keys = flatten(JSON.parse(read(`src/renderer/src/i18n/locales/${file}`)));
    const missing = used.filter((k) => typeof keys[k] !== 'string' || !keys[k].trim());
    assert.deepEqual(missing, [], `${file} is missing onboarding keys the wizard renders`);
  }
});

test('every glyph a shipped pack names has a drawing in the wizard', () => {
  const wizard = read('src/renderer/src/components/OnboardingWizard.tsx');
  const block = wizard.match(/const GLYPH_EMOJI[^{]*\{([\s\S]*?)\};/);
  assert.ok(block, 'GLYPH_EMOJI map not found in OnboardingWizard.tsx');
  const known = new Set([...block[1].matchAll(/^\s*([a-z][a-z0-9-]*)\s*:/gm)].map((m) => m[1]));
  const dir = path.join(root, 'resources/packs');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const pack = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    if (pack.businessType === 'core' || !pack.glyph) continue;
    assert.ok(known.has(pack.glyph), `${file}: glyph "${pack.glyph}" would render as "?" on the business grid`);
  }
});
