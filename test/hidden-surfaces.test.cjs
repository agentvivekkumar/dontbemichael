'use strict';

/**
 * Surfaces this build hides from business owners (src/shared/buildFeatures.ts).
 *
 * Git is hidden from the owner in this build (owner, 2026-09-23): no GIT tab on
 * any agent, and no CHANGES / HISTORY / COMPARE rail in the IDE, which was the
 * only git view Michael had. The code stays; SHOW_GIT brings it all back.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const read = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');

test('this build hides git', () => {
  assert.equal(loadTs('src/shared/buildFeatures.ts').SHOW_GIT, false);
});

test('the agent sidebar drops the GIT tab, and a saved GIT tab opens the terminal', () => {
  assert.match(read('src/renderer/src/components/SidebarTabs.tsx'), /ALL_TABS\.filter\(\(tab\) => tab\.key !== 'git' \|\| SHOW_GIT\)/);
  assert.match(read('src/renderer/src/components/AgentDetailPanel.tsx'), /SHOW_GIT && sidebarTab === 'git'/);
  assert.match(read('src/renderer/src/store/store.ts'), /if \(v === 'git'\) return SHOW_GIT \? v : 'terminal';/);
});

test('the IDE hides its git rail and stops polling git status', () => {
  const ide = read('src/renderer/src/ide/IdePanel.tsx');
  const open = ide.indexOf('{SHOW_GIT && (<>');
  const close = ide.indexOf('</>)}', open);
  assert.ok(open > 0 && close > open, 'git rail wrapped in SHOW_GIT');
  const rail = ide.slice(open, close);
  for (const piece of ['toggleGitRail', "'changes', 'history', 'compare'", '<HistoryPane', '<ComparePane']) {
    assert.ok(rail.includes(piece), `${piece} is inside the hidden block`);
  }
  assert.match(ide, /const refreshStatus = useCallback\(async \(\) => \{[\s\S]{0,120}if \(!SHOW_GIT\) return;/);
});

/**
 * The IDE is hidden too (owner, 2026-09-23): no IDE button on any agent, and no
 * other path can open it. SHOW_IDE brings it back.
 */
test('this build hides the IDE', () => {
  assert.equal(loadTs('src/shared/buildFeatures.ts').SHOW_IDE, false);
});

test('every IDE button is behind SHOW_IDE', () => {
  for (const f of ['CommandCenterPanel.tsx', 'AgentDetailPanel.tsx', 'FullscreenTerminal.tsx']) {
    const src = read(`src/renderer/src/components/${f}`);
    const calls = [...src.matchAll(/setIdeOpen\(true/g)].map((m) => m.index);
    assert.ok(calls.length > 0, `${f} still has its IDE button code`);
    for (const at of calls) {
      const before = src.slice(Math.max(0, at - 400), at);
      assert.ok(before.includes('{SHOW_IDE && ('), `${f}: IDE button at ${at} is not behind SHOW_IDE`);
    }
  }
});

test('nothing else can open the IDE, and terminal file links go to Finder', () => {
  const store = read('src/renderer/src/store/store.ts');
  assert.match(store, /setIdeOpen: \(open, agentId\) => set\(\{ ideOpen: open && SHOW_IDE,/);
  assert.match(store, /openFileInIde: \(absPath\) => \{\n\s+if \(!SHOW_IDE\) return;/);
  assert.match(read('src/renderer/src/App.tsx'), /\{SHOW_IDE && ideOpen && <IdePanel \/>\}/);
  assert.match(read('src/renderer/src/components/terminalPool.ts'), /if \(action === 'reveal' \|\| !hit\.isFile \|\| !SHOW_IDE\) \{\n\s+void window\.cth\.revealPath/);
});

/**
 * ORGANISATION is hidden (owner, 2026-09-24): configuration only, nothing reads
 * the key yet. WEBHOOKS moved out of Michael's Triggers tab into Settings →
 * Connections: one server and one tunnel serve the whole office, and whatever
 * arrives goes to Michael to route, so they were never his alone.
 */
test('this build hides the organisation trigger', () => {
  assert.equal(loadTs('src/shared/buildFeatures.ts').SHOW_ORG_TRIGGER, false);
  const triggers = read('src/renderer/src/components/triggers/TriggersTab.tsx');
  assert.match(triggers, /\{SHOW_ORG_TRIGGER && \(\s*<TriggerCard\s+title=\{t\('triggersTab\.organisation'\)\}/);
  const settings = read('src/renderer/src/components/SettingsModal.tsx');
  const gate = settings.indexOf('{SHOW_ORG_TRIGGER && (<>');
  assert.ok(gate > 0 && settings.indexOf("t('settings.connections.organisation')") > gate, 'Settings block is behind the flag');
  // A leftover org key must not bring back the History tab on its own.
  assert.match(read('src/renderer/src/store/store.ts'), /\(SHOW_ORG_TRIGGER && s\.orgTrigger\.apiKey\.trim\(\) !== ''\)/);
});

test('webhooks live in Settings, with nothing lost from the Triggers card', () => {
  const triggers = read('src/renderer/src/components/triggers/TriggersTab.tsx');
  assert.doesNotMatch(triggers, /<WebhooksSection/);
  const settings = read('src/renderer/src/components/SettingsModal.tsx');
  // Settings already had name, on/off, URL, secret, mode and delete; the body
  // format editor was the one piece only Triggers had.
  assert.match(settings, /<WebhookSchemaEditor schema=\{w\.schema\} onSave=\{\(schema\) => \{ void patchWebhook\(w\.id, \{ schema \}\); \}\} \/>/);
  for (const piece of ['patchWebhook(w.id, { enabled: !w.enabled })', 'rotateWebhookSecret(w.id)', 'patchWebhook(w.id, { mode:', 'addWebhook']) {
    assert.ok(settings.includes(piece), `Settings still has: ${piece}`);
  }
});

/**
 * Context upkeep (the compact / clear rules) moved from Michael's Triggers tab
 * to Settings → Agents & Models (owner, 2026-09-24): each run goes through every
 * live agent, so it is a setting for how all agents run, not Michael's trigger.
 */
test('context upkeep lives in Settings, and it really does apply to every agent', () => {
  assert.doesNotMatch(read('src/renderer/src/components/triggers/TriggersTab.tsx'), /ContextSection/);
  const settings = read('src/renderer/src/components/SettingsModal.tsx');
  const agents = settings.indexOf("activeSection === 'Agents & Models'");
  const autonomy = settings.indexOf("activeSection === 'Autonomy & Budgets'");
  const at = settings.indexOf('<ContextSection />');
  assert.ok(agents > 0 && at > agents && at < autonomy, 'inside Agents & Models');
  const hive = read('src/renderer/src/hooks/useHive.ts');
  const fire = hive.indexOf("const fire = (action: 'compact' | 'clear', rule: ContextRule): void => {");
  assert.ok(fire > 0, 'the context trigger handler');
  assert.match(hive.slice(fire, fire + 300), /for \(const a of agents\) \{/, 'loops over every agent, not only Michael');
});

/**
 * Anonymous usage stats are hidden until the owner decides whether to collect
 * anything (owner, 2026-09-24): no onboarding row, no Settings switch, and no
 * sending even from a build that carries a PostHog key. COLLECT_USAGE_STATS
 * brings all three back together.
 */
test('this build collects no usage stats', () => {
  assert.equal(loadTs('src/shared/buildFeatures.ts').COLLECT_USAGE_STATS, false);
});

test('the usage stats choice is hidden in onboarding and Settings', () => {
  const wizard = read('src/renderer/src/components/OnboardingWizard.tsx');
  const row = wizard.indexOf("label={t('onboarding.permissions.shareStats')}");
  assert.ok(row > 0 && wizard.slice(row - 200, row).includes('{COLLECT_USAGE_STATS && ('), 'onboarding row is behind the switch');
  assert.match(wizard, /\.\.\.\(COLLECT_USAGE_STATS \? \{ telemetryEnabled: shareStats \} : \{\}\)/);

  const settings = read('src/renderer/src/components/SettingsModal.tsx');
  const sw = settings.indexOf("{t('settings.general.telemetry')}");
  assert.ok(sw > 0 && settings.slice(sw - 700, sw).includes('{COLLECT_USAGE_STATS && (<>'), 'Settings switch is behind the switch');
});

test('nothing is sent while usage stats are hidden, whatever the saved setting', () => {
  const main = read('src/main/index.ts');
  assert.match(main, /enabled: COLLECT_USAGE_STATS && readConfig\(\)\.telemetryEnabled !== false/);
  assert.match(main, /analytics\.setEnabled\(COLLECT_USAGE_STATS && patch\.telemetryEnabled\)/);
});
