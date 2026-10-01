'use strict';

/**
 * Agents coming back at launch, or starting for the first time, say "clocking
 * in…", not "reconnecting…" or "starting up" (owner, 2026-09-27: "very geeky
 * word").
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

test('startup captions are office words, and shown translated', () => {
  const store = read('src/renderer/src/store/store.ts');
  assert.match(store, /export const ACTION_CLOCKING_IN = 'clocking in…';/);
  assert.match(store, /action: ACTION_CLOCKING_IN,/);
  for (const f of ['src/renderer/src/store/store.ts', 'src/renderer/src/hooks/useHive.ts', 'src/renderer/src/hooks/useRestoreTeam.ts', 'src/renderer/src/components/AddAgentModal.tsx']) {
    assert.doesNotMatch(read(f), /action: '(?:reconnecting…|starting up)'/, f);
  }
  assert.match(read('src/renderer/src/shell/PanelChrome.tsx'), /const raw = agent\.action\?\.trim\(\) \? actionText\(agent\.action\.trim\(\), t\) : '';/);
  assert.match(read('src/renderer/src/scene/studio/StudioStage.tsx'), /const caption = sentence\(\(live \? actionText\(live, t\) : ''\)/);
  for (const loc of ['en', 'zh-CN', 'ar']) {
    assert.ok(JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).office.activity.clockingIn, loc);
  }
  const { isDurableRole } = loadTs('src/shared/agentRole.ts');
  assert.equal(isDurableRole('clocking in…'), false, 'never mistaken for a job');
});

test('an idle agent says "nothing to do" in the office (owner, 2026-09-27)', () => {
  const store = read('src/renderer/src/store/store.ts');
  assert.match(store, /if \(action\.trim\(\)\.toLowerCase\(\) === 'idle'\) return t\('office\.activity\.idle'\);/);
  const en = JSON.parse(read('src/renderer/src/i18n/locales/en.json'));
  assert.equal(en.office.activity.idle, 'nothing to do');
  for (const loc of ['zh-CN', 'ar']) {
    assert.notEqual(JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).office.activity.idle, 'nothing to do', `${loc} translated`);
  }
});
