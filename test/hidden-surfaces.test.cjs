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
 * Context upkeep has no setting any more (owner, 2026-09-25): compaction is
 * Claude Code's own, and a conversation is cleared only after a finished,
 * handed-off task (safeClearer.ts), never on a clock.
 */
test('no clock-driven context upkeep is left in Settings or the Triggers tab', () => {
  assert.doesNotMatch(read('src/renderer/src/components/triggers/TriggersTab.tsx'), /ContextSection/);
  assert.doesNotMatch(read('src/renderer/src/components/SettingsModal.tsx'), /ContextSection/);
  assert.doesNotMatch(read('src/renderer/src/hooks/useHive.ts'), /onContextTrigger/);
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

/**
 * The header's "auto mode on / off" text is hidden (owner, 2026-09-24). The
 * setting itself still works and stays in Settings → Autonomy & Budgets.
 */
test('the header hides the auto mode text', () => {
  assert.equal(loadTs('src/shared/buildFeatures.ts').SHOW_AUTO_MODE_LABEL, false);
  const app = read('src/renderer/src/App.tsx');
  const label = app.indexOf("'auto mode on' : 'auto mode off'");
  assert.ok(label > 0 && app.slice(label - 300, label).includes('{SHOW_AUTO_MODE_LABEL && ('), 'header text is behind the switch');
});

/**
 * The close button on a team member is hidden (owner, 2026-09-24): it stopped
 * the agent mid-task and archived it with no way back in the app. Hidden in
 * both places it lived, the agent panel and the full screen view.
 */
test('the close agent button is hidden everywhere', () => {
  assert.equal(loadTs('src/shared/buildFeatures.ts').SHOW_CLOSE_AGENT, false);
  assert.match(read('src/renderer/src/components/AgentDetailPanel.tsx'),
    /\{isReal && SHOW_CLOSE_AGENT && \(\s*<PixelButton variant="destructive" size="sm" onClick=\{onKill\}>/);
  assert.match(read('src/renderer/src/components/FullscreenTerminal.tsx'),
    /\{!agent\.isGod && SHOW_CLOSE_AGENT && \(\s*<PixelButton variant="destructive" size="sm" onClick=\{onKill\}>/);
});

/**
 * "Open a Terminal window here" is hidden everywhere (owner, 2026-09-24): the
 * open button next to edit, the same button in full screen, and the terminal
 * icon beside each folder in Michael's Command Center.
 */
test('the open terminal buttons are hidden everywhere', () => {
  assert.equal(loadTs('src/shared/buildFeatures.ts').SHOW_OPEN_TERMINAL, false);
  const cases = [
    ['AgentDetailPanel.tsx', "onClick={openTerminal} disabled={openTerminalState === 'opening'}"],
    ['FullscreenTerminal.tsx', "onClick={openTerminal} disabled={openState === 'opening'}"],
    ['CommandCenterPanel.tsx', 'onClick={() => window.cth.openTerminalAt(r)}']
  ];
  for (const [file, marker] of cases) {
    const src = read(`src/renderer/src/components/${file}`);
    const at = src.indexOf(marker);
    assert.ok(at > 0, `${file} still has the button`);
    assert.ok(src.slice(Math.max(0, at - 160), at).includes('{SHOW_OPEN_TERMINAL && ('), `${file}: behind SHOW_OPEN_TERMINAL`);
  }
});

/**
 * The floor-wide Auto / Pause delivery switch is hidden (owner, 2026-09-24).
 * A pause is saved per agent in the config and restored at launch, so while the
 * switch is hidden a saved pause is cleared instead: no one is left with held
 * messages and no switch to release them.
 */
test('the delivery switch is hidden, and a saved pause cannot strand messages', () => {
  assert.equal(loadTs('src/shared/buildFeatures.ts').SHOW_DELIVERY_SWITCH, false);
  const cc = read('src/renderer/src/components/CommandCenterPanel.tsx');
  const at = cc.indexOf("variant={floorDeliveryPaused ? 'primary' : 'secondary'}");
  assert.ok(at > 0 && cc.slice(at - 120, at).includes('{SHOW_DELIVERY_SWITCH && ('), 'switch behind SHOW_DELIVERY_SWITCH');
  const main = read('src/main/index.ts');
  assert.match(main, /if \(SHOW_DELIVERY_SWITCH\) \{\s*control\.replaceAutoDeliveryPauses\(readConfig\(\)\.autoDeliveryPausedAgents \?\? \[\]\);\s*\} else if \(\(readConfig\(\)\.autoDeliveryPausedAgents \?\? \[\]\)\.length > 0\) \{\s*writeConfig\(\{ autoDeliveryPausedAgents: \[\] \}\);/);
});

/**
 * Hiring by voice is off (owner, 2026-09-24): voice Michael is not given the
 * spawn_agent tool, his instructions say he can't hire, and main refuses a
 * spawn request that arrives anyway.
 */
test('voice Michael cannot hire', () => {
  assert.equal(loadTs('src/shared/buildFeatures.ts').ALLOW_VOICE_HIRE, false);
  const actions = read('src/renderer/src/realtime/actions.ts');
  const at = actions.indexOf("name: 'spawn_agent'");
  assert.ok(at > 0 && actions.slice(at - 120, at).includes('...(ALLOW_VOICE_HIRE ? ['), 'tool offered only when allowed');
  const session = read('src/renderer/src/realtime/session.ts');
  assert.match(session, /\$\{ALLOW_VOICE_HIRE \? 'hire a new agent, ' : ''\}/);
  assert.match(session, /You cannot hire new team members by voice in this version/);
  assert.match(read('src/main/realtimeActions.ts'), /if \(verb === 'spawn'\) \{[\s\S]{0,200}if \(!ALLOW_VOICE_HIRE\) \{\s*return \{ ok: false, spoken:/);
});

/**
 * Voice is off entirely (owner, 2026-09-24): no Talk toggle, no dictation mic
 * or hold Option, no Voice tab, and main refuses to start a voice session or
 * transcribe audio.
 */
test('voice is off everywhere', () => {
  assert.equal(loadTs('src/shared/buildFeatures.ts').SHOW_VOICE, false);
  for (const f of ['AgentCard.tsx', 'FullscreenTerminal.tsx']) {
    const src = read(`src/renderer/src/components/${f}`);
    assert.match(src, /\{SHOW_VOICE && <RealtimeMichaelToggle \/>\}/, `${f}: Talk toggle behind SHOW_VOICE`);
    assert.doesNotMatch(src.replace(/\{SHOW_VOICE && <RealtimeMichaelToggle \/>\}/g, ''), /<RealtimeMichaelToggle \/>/, `${f}: no ungated toggle`);
  }
  assert.match(read('src/renderer/src/store/store.ts'), /setFreeflowEnabled: \(on\) => set\(\{ freeflowEnabled: SHOW_VOICE && on \}\)/);
  const settings = read('src/renderer/src/components/SettingsModal.tsx');
  assert.match(settings, /const VISIBLE_SECTIONS: Section\[\] = NAV_SECTIONS\.filter\(\(s\) => s !== 'Voice' \|\| SHOW_VOICE\);/);
  assert.match(settings, /\{VISIBLE_SECTIONS\.map\(\(section\) => \{/);
  assert.match(settings, /activeSection === 'Voice' && SHOW_VOICE && \(/);
  assert.match(read('src/main/realtime.ts'), /if \(!SHOW_VOICE\) return \{ ok: false, error: 'Voice is off in this version\.', code: 'disabled' \};/);
  assert.match(read('src/main/index.ts'), /ipcMain\.handle\('freeflow:transcribe'[\s\S]{0,200}if \(!SHOW_VOICE\) return \{ ok: false/);
});
