'use strict';

/**
 * Surfaces this build hides from business owners (src/shared/buildFeatures.ts).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const read = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');

test('the agent sidebar has no GIT or TRACES tab; saved ones open elsewhere', () => {
  // Value: protects=a tab saved by an older build opens a tab that exists; fails_when=the mapping goes and the panel opens on nothing; why_new=the git tab was removed; seam=none
  assert.doesNotMatch(read('src/renderer/src/components/SidebarTabs.tsx'), /'git'|'traces'/);
  assert.match(read('src/renderer/src/store/store.ts'), /if \(v === 'traces'\) return 'profile';/);
  assert.match(read('src/renderer/src/store/store.ts'), /if \(v === 'git'\) return 'terminal';/);
});

test('a file link in a terminal shows the file in Finder and never opens it', () => {
  // Value: protects=a path an agent prints is only ever revealed, never launched; fails_when=activatePath opens the file or hands it to another viewer; why_new=kept from the IDE test when the IDE was removed; seam=source pin (terminalPool imports xterm)
  const pool = read('src/renderer/src/components/terminalPool.ts');
  const at = pool.indexOf('async function activatePath(abs: string): Promise<void> {');
  assert.ok(at > 0, 'activatePath takes only the path');
  const body = pool.slice(at, pool.indexOf('\n}\n', at));
  assert.match(body, /void window\.cth\.revealPath\(hit\)/);
  assert.doesNotMatch(body, /openPath|openExternal|openFile|openAskFile/);
  assert.match(pool, /void activatePath\(abs\);/);
});

test('a ⌘-click on an unchecked quoted path only reveals, and reveals only through activatePath or revealPath', () => {
  // Value: protects=the click on an unchecked quoted match (no underline yet) is held to reveal only, like activatePath (re-review of #687 at 49b13c14, smaller item 1); fails_when=activateUnchecked calls any window.cth bridge but revealPath, or reveals the name inside without activatePath's disk check; why_new=the pin above read only activatePath's body; seam=source pin (terminalPool imports xterm)
  const pool = read('src/renderer/src/components/terminalPool.ts');
  const at = pool.indexOf('async function activateUnchecked(abs: string, nameAbs: string | null): Promise<void> {');
  assert.ok(at > 0, 'activateUnchecked takes the path and the one name inside it');
  const body = pool.slice(at, pool.indexOf('\n}\n', at));
  const bridges = [...body.matchAll(/window\.cth\.(\w+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(bridges)], ['revealPath'], 'the only bridge it calls is revealPath');
  const calls = [...body.matchAll(/\b(?:await|void)\s+([\w.]+)\(/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(calls)].sort(), ['activatePath', 'pathStats.lookForClick', 'window.cth.revealPath'], 'it looks, reveals, or hands the name to activatePath, nothing else');
  assert.doesNotMatch(body, /openPath|openExternal|openFile|openAskFile/);
});

/**
 * ORGANISATION is gone (owner, 2026-09-24 hid it; removed 2026-11-11): it was
 * configuration only and nothing read the key.
 */
test('the organisation trigger is gone', () => {
  assert.equal(loadTs('src/shared/buildFeatures.ts').SHOW_ORG_TRIGGER, undefined);
  assert.ok(!fs.existsSync(path.resolve(__dirname, '../src/renderer/src/components/triggers/OrgSection.tsx')));
  assert.doesNotMatch(read('src/preload/index.ts'), /'org:/);
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
 * The header's "auto mode on / off" text is hidden (owner, 2026-09-24). The
 * setting itself still works and stays in Settings → Agents.
 */
test('the header hides the auto mode text', () => {
  assert.equal(loadTs('src/shared/buildFeatures.ts').SHOW_AUTO_MODE_LABEL, undefined, 'the flag is gone with the text');
  // Design v2's top bar (shell/TopBar.tsx) has no auto mode text at all.
  for (const f of ['src/renderer/src/App.tsx', 'src/renderer/src/shell/TopBar.tsx']) {
    assert.doesNotMatch(read(f), /auto mode on/, f);
  }
});

/**
 * The close button on a team member is hidden (owner, 2026-09-24): it stopped
 * the agent mid-task and archived it with no way back in the app.
 */
test('the close agent button is hidden everywhere', () => {
  assert.equal(loadTs('src/shared/buildFeatures.ts').SHOW_CLOSE_AGENT, false);
  assert.match(read('src/renderer/src/components/AgentDetailPanel.tsx'),
    /\{isReal && SHOW_CLOSE_AGENT && \(\s*<PixelButton variant="destructive" size="md" onClick=\{onKill\}>/);
});

/**
 * "Open a Terminal window here" is hidden everywhere (owner, 2026-09-24): the
 * open button next to edit, and the terminal icon beside each folder in
 * Michael's Command Center.
 */
test('the open terminal buttons are hidden everywhere', () => {
  assert.equal(loadTs('src/shared/buildFeatures.ts').SHOW_OPEN_TERMINAL, false);
  const cases = [
    ['AgentDetailPanel.tsx', "onClick={openTerminal} disabled={openTerminalState === 'opening'}"],
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
 * Voice is gone (owner, 2026-09-24 hid it; removed 2026-11-11): no Talk
 * toggle, no dictation mic or hold Option, no Voice tab, no voice IPC, and the
 * window never grants the microphone.
 */
test('voice is gone everywhere', () => {
  const features = loadTs('src/shared/buildFeatures.ts');
  assert.equal(features.SHOW_VOICE, undefined);
  assert.equal(features.ALLOW_VOICE_HIRE, undefined);
  for (const f of [
    'src/renderer/src/components/RealtimeMichaelToggle.tsx', 'src/renderer/src/realtime', 'src/renderer/src/freeflow',
    'src/main/realtime.ts', 'src/main/realtimeActions.ts', 'src/main/freeflow.ts'
  ]) assert.ok(!fs.existsSync(path.resolve(__dirname, '..', f)), `${f} is gone`);
  const settings = read('src/renderer/src/components/SettingsModal.tsx');
  assert.match(settings, /\{VISIBLE_SECTIONS\.map\(\(section\) => \{/);
  assert.doesNotMatch(settings, /'Voice'/);
  const main = read('src/main/index.ts');
  assert.doesNotMatch(main, /ipcMain\.handle\('(realtime|freeflow):/);
  assert.match(main, /ses\.setPermissionRequestHandler\(\(_wc, permission, callback\) => \{\s*callback\(permission !== 'media'\);/);
  assert.match(main, /ses\.setPermissionCheckHandler\(\(_wc, permission\) => permission !== 'media'\);/);
  assert.doesNotMatch(read('src/preload/index.ts'), /realtime|freeflow/i);
});

test('the Skills page is gone, and agents keep their skills', () => {
  // Value: protects=spawn still copies bundled skills after the page went; fails_when=the page comes back or spawn stops copying skills; why_new=owners have no known use for it (2026-11-02, removed 2026-11-11); seam=none
  assert.equal(loadTs('src/shared/buildFeatures.ts').SHOW_SKILLS, undefined);
  for (const f of ['src/main/skills.ts', 'src/renderer/src/components/SkillsTab.tsx']) assert.ok(!fs.existsSync(path.resolve(__dirname, '..', f)), `${f} is gone`);
  assert.doesNotMatch(read('src/preload/index.ts'), /'skills:/);
  assert.match(read('src/main/hive.ts'), /if \(opts\.skillsDir\) this\.copyBundledSkills\(/);
});

test('the pixel office themes are gone with the floor', () => {
  assert.equal(loadTs('src/shared/buildFeatures.ts').SHOW_OFFICE_THEME, undefined, 'the flag is gone with the picker');
  assert.doesNotMatch(read('src/renderer/src/components/SettingsModal.tsx'), /OfficeThemePicker/);
  assert.doesNotMatch(read('src/renderer/src/App.tsx'), /setOfficeTheme/);
  assert.equal(fs.existsSync(path.resolve(__dirname, '../src/renderer/src/scene/office/themeRegistry.ts')), false);
});

test('there is no automatic updates switch: every installed build checks (owner, 2026-10-02)', () => {
  assert.equal(loadTs('src/shared/buildFeatures.ts').SHOW_AUTO_UPDATE_SWITCH, undefined, 'the flag is gone with the switch');
  const settings = read('src/renderer/src/components/SettingsModal.tsx');
  assert.doesNotMatch(settings, /autoUpdate/);
});

test('Slack is gone: no listener, no reply helper, no Settings block', () => {
  assert.equal(loadTs('src/shared/buildFeatures.ts').SHOW_SLACK, undefined);
  for (const f of ['src/main/slack.ts', 'src/main/slack-trigger.cjs', 'resources/md-slack-reply.cjs']) assert.ok(!fs.existsSync(path.resolve(__dirname, '..', f)), `${f} is gone`);
  assert.doesNotMatch(read('src/main/index.ts'), /startSlackServer|'slack:/);
  assert.doesNotMatch(read('src/preload/index.ts'), /'slack:/);
  assert.doesNotMatch(read('src/renderer/src/components/SettingsModal.tsx'), /SLACK_CONNECT_STEPS|startSlack/);
  assert.doesNotMatch(read('electron-builder.yml'), /md-slack-reply/);
});

test('the Default MCP servers section is gone, and no agent gets a server map Claude Code never read', () => {
  // Claude Code ignores mcpServers in the --settings file each agent starts
  // with (probe on 2.1.287), so every switch there did nothing (owner, 2026-10-01).
  const features = loadTs('src/shared/buildFeatures.ts');
  assert.equal(features.SHOW_MCP_DEFAULTS, undefined);
  assert.equal(features.SHOW_READONLY_SERVERS, undefined);
  assert.ok(!fs.existsSync(path.resolve(__dirname, '../src/renderer/src/components/McpDefaultsSettings.tsx')));
  assert.doesNotMatch(read('src/main/hive.ts'), /buildDefaultMcpServers|\{ mcpServers \}/);
});

test('Add Agent hides import hire and its AI prompt; the button says hire (owner, 2026-09-27)', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'src/renderer/src/components/AddAgentModal.tsx'), 'utf8');
  assert.match(fs.readFileSync(path.resolve(__dirname, '..', 'src/shared/buildFeatures.ts'), 'utf8'), /export const SHOW_IMPORT_HIRE = false;/);
  assert.match(src, /\{SHOW_IMPORT_HIRE && <div style=\{\{/, 'the explainer and generate with AI are gated');
  assert.match(src, /\{SHOW_IMPORT_HIRE && \(\s*<PixelButton[\s\S]*?onClick=\{importHire\}/, 'the import hire button is gated');
  for (const loc of ['en']) {
    const d = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', `src/renderer/src/i18n/locales/${loc}.json`), 'utf8'));
    assert.doesNotMatch(d.addAgent.spawn, /spawn|生成|إنشاء/i, `${loc}: the button hires`);
  }
  assert.equal(JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'src/renderer/src/i18n/locales/en.json'), 'utf8')).addAgent.spawn, 'Hire');
});

test('Add Agent groups the characters by their job in the show (owner, 2026-09-27)', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'src/renderer/src/components/AddAgentModal.tsx'), 'utf8');
  assert.match(src, /CAST_GROUPS\.map\(\(g\) =>/);
  assert.match(src, /tr\(`addAgent\.castGroup\.\$\{g\.key\}`\)/);
  const { OFFICE_CAST, CAST_GROUPS } = loadTs('src/renderer/src/scene/office/cast.ts');
  const grouped = CAST_GROUPS.flatMap((g) => g.members);
  // Pete is the Research member's own face and no hire's (owner, third ship D4).
  assert.deepEqual([...grouped].sort(), OFFICE_CAST.map((c) => c.name).filter((n) => n !== 'pete').sort(), 'every hireable character is in exactly one group');
  assert.equal(new Set(grouped).size, grouped.length);
  assert.deepEqual(CAST_GROUPS[0], { key: 'office', members: ['michael', 'pam', 'erin'] });
  assert.deepEqual(CAST_GROUPS[1].members.slice(0, 2), ['dwight', 'jim']);
  assert.ok(CAST_GROUPS.every((g) => g.members.length >= 2), 'no group is a lone tile');
  assert.match(src, /flexWrap: 'wrap', columnGap: 20/, 'groups sit side by side and wrap');
  assert.match(src, /tr\(`addAgent\.castRole\.\$\{c\.name\}`\)/, 'each tile names its job');
  for (const loc of ['en']) {
    const d = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', `src/renderer/src/i18n/locales/${loc}.json`), 'utf8'));
    for (const g of CAST_GROUPS) assert.ok(d.addAgent.castGroup?.[g.key], `${loc}: ${g.key} has a heading`);
    for (const n of grouped) assert.ok(d.addAgent.castRole?.[n], `${loc}: ${n} names its own job`);
  }
});

test('the hire wizard has no worktree, resume, projects or engine choices (owner, 2026-09-27)', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'src/renderer/src/components/AddAgentModal.tsx'), 'utf8');
  const flags = fs.readFileSync(path.resolve(__dirname, '..', 'src/shared/buildFeatures.ts'), 'utf8');
  assert.match(src, /isolate: false,/, 'never a worktree');
  assert.doesNotMatch(src, /resumeSessionId|registerProject|gitIsolation/, 'no resume or project list');
  assert.match(flags, /export const SHOW_ENGINE_PICKER = false;/);
  assert.match(src, /\{SHOW_ENGINE_PICKER && <>[\s\S]*?addAgent\.provider[\s\S]*?addAgent\.command[\s\S]*?<\/>\}/, 'engine and command are gated');
  assert.match(src, /const model = customModel \?\? defaultModel;/, 'the model starts on the Settings default');
});

test('Settings, General: one About card carries the version once and the update status (owner, 2026-10-01)', () => {
  // docs/designs/about-updates-card.md: the hero card and the Updates block
  // said the version twice and offered release notes three ways.
  const modal = read('src/renderer/src/components/SettingsModal.tsx');
  assert.match(modal, /<SettingsHeroCard \/>/);
  assert.doesNotMatch(modal, /<UpdatesSection \/>/, 'no separate Updates block');
  const card = read('src/renderer/src/components/SettingsHeroCard.tsx');
  assert.equal((card.match(/v\{__APP_VERSION__\}/g) || []).length, 1, 'the version once');
  assert.match(card, /const u = useUpdates\(\);/);
  assert.match(card, /<UpdateStatusLine u=\{u\} \/>[\s\S]*<UpdateButtons u=\{u\} \/>[\s\S]*<UpdateDetails u=\{u\} \/>/);
  assert.doesNotMatch(card, /download v\{pending\}|border: `2px solid/, 'no second download, no v1 ink frame');
  assert.match(card, /<InfoTip label=\{hero\.plan\.label\} text=\{hero\.plan\.blurb\} \/>/, 'the plan blurb sits behind an info icon');
  assert.doesNotMatch(card, /⭐/);
  const upd = read('src/renderer/src/components/UpdatesSection.tsx');
  assert.match(upd, /const quiet = !status \|\| status\.state === 'idle' \|\| status\.state === 'checking' \|\| status\.state === 'not-available' \|\| status\.state === 'just-updated';/, 'quiet states do not repeat the version');
  assert.match(upd, /notes: quiet \? \[\] : notes/, 'notes only for a newer version');
  // In Settings' scrolling flex column a card with overflow hidden shrank to
  // 1px (owner, 2026-10-01: "I no longer see the entire merged section").
  assert.match(card, /<div style=\{\{ flexShrink: 0, background: panelStyle\.background, borderRadius: panelStyle\.borderRadius \}\}>/, 'on the soft panel (app-style-rollout.md AS2)');
  assert.doesNotMatch(card, /overflow: 'hidden'/);
});

test("What's new opens a popover under its link with the notes of this version (owner, 2026-10-02)", () => {
  // It opened GitHub behind the app, then a corner toast that was easy to miss
  // on a mostly white app; the answer to a click sits where you clicked.
  const card = read('src/renderer/src/components/SettingsHeroCard.tsx');
  assert.match(card, /<button type="button" ref=\{whatsNewRef\} style=\{footLink\} onClick=\{toggleNotes\} aria-expanded=\{notesOpen\} aria-haspopup="dialog">/);
  assert.match(card, /\{notesOpen && <WhatsNewPopover notes=\{whatsNew\.notes\} loading=\{whatsNew\.loading\} anchor=\{whatsNewRef\} onClose=\{\(\) => setNotesOpen\(false\)\} \/>\}/);
  assert.match(card, /<div style=\{\{ position: 'relative', display: 'flex'/, 'the footer anchors the popover');
  assert.doesNotMatch(card, /fullChangelog|cth:show-release-notes/);
  const pop = read('src/renderer/src/components/WhatsNewPopover.tsx');
  assert.match(pop, /if \(cur\.state === 'just-updated' && cur\.notes\) \{ setNotes/);
  assert.match(pop, /const r = await window\.cth\.updateReleaseNotes\(\);/);
  assert.match(pop, /onKeyDown=\{\(e\) => \{ if \(e\.key === 'Escape'\) \{ e\.preventDefault\(\); close\(\); \} \}\}/, 'Esc closes the popover, not Settings');
  assert.match(pop, /document\.addEventListener\('mousedown', onDown\)/, 'a click outside closes it');
  assert.match(pop, /t\('whatsNewPopover\.failed'\)/, 'a failure says so');
  assert.match(pop, /onClick=\{\(\) => void window\.cth\.openExternal\(changelog\)\}>\{t\('whatsNewPopover\.fullChangelog'\)\}<\/button>/);
  for (const loc of ['en']) {
    const w = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).whatsNewPopover;
    for (const k of ['title', 'titleVersion', 'loading', 'failed', 'fullChangelog', 'releasePage', 'close']) assert.ok(w[k], `${loc} whatsNewPopover.${k}`);
  }
  // Ink fill like the info tooltips: white on a white card was hard to read.
  assert.match(pop, /background: 'var\(--cth-ink\)', color: ON,/);
  // Main answers for the running version from its GitHub release, in dev too.
  const upd = read('src/main/updater.ts');
  const reg = upd.indexOf("ipcMain.handle('update:releaseNotes'");
  assert.ok(reg > 0 && reg < upd.indexOf('if (!app.isPackaged) return;'), 'registered before the packaged-only block');
});

test('Settings, General hides Explain things simply; the Arabic terminal switch is gone (owner, 2026-10-02)', () => {
  const flags = loadTs('src/shared/buildFeatures.ts');
  assert.equal(flags.SHOW_SIMPLE_MODE_SWITCH, false);
  assert.equal(flags.SHOW_ARABIC_TERMINAL_SWITCH, undefined);
  const modal = read('src/renderer/src/components/SettingsModal.tsx');
  assert.match(modal, /\{SHOW_SIMPLE_MODE_SWITCH && \(\s*<div[^>]*>\s*<div[^>]*>\s*<span[^>]*>\{t\('settings\.general\.simpleMode'\)\}/);
  assert.doesNotMatch(modal, /arabicTerminal/);
});

test('Settings, General has no Language section: the app is English only (owner, 2026-11-11)', () => {
  assert.equal(loadTs('src/shared/buildFeatures.ts').SHOW_LANGUAGE_PICKER, undefined);
  const modal = read('src/renderer/src/components/SettingsModal.tsx');
  assert.doesNotMatch(modal, /SHOW_LANGUAGE_PICKER|setLanguage|settings\.general\.language/);
});

test('the Danger zone is a loud red card with a filled reset button (owner, 2026-10-02)', () => {
  // It was a 10px label, grey prose and a white button: easy to miss for the
  // one action that wipes the office.
  const modal = read('src/renderer/src/components/SettingsModal.tsx');
  const zone = modal.slice(modal.indexOf('{/* Danger zone: loud on purpose'), modal.indexOf('{/* Footer */}'));
  assert.match(zone, /<div role="group" aria-labelledby="settings-danger-zone" style=\{\{[^}]*background: 'var\(--cth-coral-soft\)'/);
  assert.match(zone, /<svg width="22"[^>]*aria-hidden="true"/, 'a warning mark');
  assert.match(zone, /background: 'var\(--cth-coral-strong\)', color: 'var\(--cth-on-coral\)'/, 'a filled red button, readable in dark mode too');
  assert.match(zone, /onClick=\{\(\) => setConfirming\(true\)\}/, 'reset still asks first');
  assert.match(read('branding/DESIGN.md'), /Reset & start over inside the Danger zone card/);
});

test('the update line only promises automatic checks when they run (owner, 2026-10-02)', () => {
  // updater.ts checks every 6h in every installed build (the old autoUpdate
  // flag is ignored); a dev build never checks.
  const upd = read('src/main/updater.ts');
  assert.match(upd, /const CHECK_INTERVAL_MS = 6 \* 60 \* 60 \* 1000;/, 'the 6 hours the line names');
  assert.match(upd, /const tick = \(\): void => \{ void runCheck\(\); \};/, 'always check (owner, 2026-10-02)');
  assert.doesNotMatch(upd, /autoUpdateEnabled|readConfig\(\)\.autoUpdate/);
  assert.match(read('src/main/index.ts'), /ipcMain\.handle\('app:info', \(\) => \(\{ version: app\.getVersion\(\), packaged: app\.isPackaged \}\)\);/);
  const ui = read('src/renderer/src/components/UpdatesSection.tsx');
  assert.match(ui, /if \(packaged === false\) return \{ headline: t\('updatesSection\.onVersion', \{ v \}\), detail: t\('updatesSection\.devDetail'\), button: null \};/);
  assert.match(ui, /detail: t\('updatesSection\.idleDetail'\),/);
  for (const loc of ['en']) {
    const u = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).updatesSection;
    assert.ok(u.devDetail, loc);
  }
});
