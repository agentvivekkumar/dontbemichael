'use strict';

/**
 * Multi-mailbox UI wiring (docs/designs/multi-mailbox.md, design review):
 * Capabilities is a tab after Profile on every agent and on Michael (D2, E3);
 * Mailboxes leads Settings > Connections with the Team email switch (1A, 2A);
 * the Email & Calendar row left the server list; a new office never gets the
 * upgrade note (4A); the restart-on-enable watcher has its 10 minute ceiling (E5).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');

test('Capabilities is the tab after Profile, for team members and for Michael', () => {
  const side = read('src/renderer/src/components/SidebarTabs.tsx');
  assert.ok(side.indexOf("key: 'capabilities'") > side.indexOf("key: 'profile'"));
  assert.ok(side.indexOf("key: 'capabilities'") < side.indexOf("key: 'messages'"));
  assert.match(read('src/renderer/src/components/AgentDetailPanel.tsx'), /sidebarTab === 'capabilities' && \(\s*<CapabilitiesTab agent=\{agent\} \/>/);
  const cc = read('src/renderer/src/components/CommandCenterPanel.tsx');
  // On Michael, ASK ME stays second (owner, 2026-09-25); Capabilities follows it.
  assert.ok(cc.indexOf("key: 'capabilities'") > cc.indexOf("key: 'human'") && cc.indexOf("key: 'capabilities'") < cc.indexOf("key: 'terminal'"));
  assert.match(cc, /tab === 'capabilities' && <CapabilitiesTab agent=\{agent\} \/>/);
});

test('Mailboxes leads Connections; the Claude account row alone carries the switch; the server list no longer does', () => {
  const settings = read('src/renderer/src/components/SettingsModal.tsx');
  assert.ok(settings.indexOf('<MailboxesSettings />') < settings.indexOf('<IntegrationsRegistry />'));
  const mb = read('src/renderer/src/components/MailboxesSettings.tsx');
  assert.ok(mb.indexOf("t('mailboxes.claudeAccessLabel')") > mb.indexOf("t('mailboxes.claudeAccount')"), 'switch sits on the Claude account row');
  assert.equal((mb.match(/<Toggle /g) || []).length, 1, 'only one switch on the screen');
  assert.match(mb, /'email-calendar': \{ enabled: on \}/, 'writes the same master switch');
  assert.match(read('src/renderer/src/components/McpDefaultsSettings.tsx'), /e\.id !== 'email-calendar'/);
});

test('Draft only is chosen the first time email is turned on (6A); Sending is a radio group (7A)', () => {
  const cap = read('src/renderer/src/components/CapabilitiesTab.tsx');
  assert.match(cap, /\{ enabled: true, mailboxes: email\.mailboxes, send: email\.mailboxes\.length \? email\.send : false \}/);
  assert.match(cap, /role="radiogroup"/);
  assert.match(cap, /ArrowUp/);
});

test('removing a used mailbox names who loses it (8A)', () => {
  assert.match(read('src/renderer/src/components/MailboxesSettings.tsx'), /t\('mailboxes\.removeAffects', \{ names: list\(users\) \}\)/);
});

test('no Ask me card announces per-member email (owner, 2026-09-26); an old one is cleared', () => {
  const main = read('src/main/index.ts');
  assert.doesNotMatch(main, /Email is now set per team member/);
  assert.match(main, /hive\.deleteTask\('email-per-team-member'\)/);
});

test('restart on enable waits for idle, with a 10 minute ceiling (E2, E5)', () => {
  const hive = read('src/renderer/src/hooks/useHive.ts');
  assert.match(hive, /const CEILING_MS = 10 \* 60_000;/);
  assert.match(hive, /if \(BUSY\.has\(a\.status\) && !overdue\) continue;/);
  assert.match(hive, /respawnResumed\(a, a\.ptyId\)/);
});

test('md-mail is attached at spawn only for agents with email, as the last arguments', () => {
  const main = read('src/main/index.ts');
  const at = main.indexOf("opts.args = [...(opts.args ?? []), '--mcp-config', file];");
  assert.ok(at > 0);
  assert.ok(at < main.indexOf('const res = ptyManager.spawn(opts, owner);', at), 'right before the spawn');
  assert.match(main, /readConfig\(\)\.agentCapabilities\?\.\[agentId\]\?\.email\?\.enabled/);
  assert.match(read('electron-builder.yml'), /from: resources\/md-mail-mcp\.cjs/);
});

test('schedules live in Capabilities: Email and On a schedule fold separately (owner, 2026-09-26)', () => {
  const cap = read('src/renderer/src/components/CapabilitiesTab.tsx');
  assert.ok(cap.indexOf("title={t('capabilities.email')}") < cap.indexOf("title={t('capabilities.schedules')}"), 'Email first, then schedules');
  assert.equal((cap.match(/onToggle=\{\(open\) => setFold\('(email|schedules)', open\)\}/g) || []).length, 2, 'both sections fold');
  assert.match(cap, /<AgentSchedules agentId=\{agent\.id\} agentName=\{name\} \/>/);
  assert.match(cap, /try \{ window\.localStorage\.setItem\(LS_COLLAPSED/, 'the fold is remembered, guarded');
  assert.match(read('src/renderer/src/components/triggers/ui.tsx'), /aria-expanded=\{open\}/);
  assert.doesNotMatch(read('src/renderer/src/components/SidebarTabs.tsx'), /key: 'schedules'/);
  assert.doesNotMatch(read('src/renderer/src/components/AgentDetailPanel.tsx'), /sidebarTab === 'schedules'/);
});

test('a jump from the office schedule opens that agent\'s Capabilities; Michael\'s jobs are listed too', () => {
  const store = read('src/renderer/src/store/store.ts');
  assert.match(store, /if \(v === 'schedules'\) return 'capabilities';/, 'a saved Schedules tab opens Capabilities');
  assert.match(store, /sidebarTab: 'capabilities',\s*ccTabRequest: isGod \? \{ tab: 'capabilities'/);
  assert.match(read('src/renderer/src/components/triggers/ScheduleList.tsx'), /const others = missions;/);
  assert.doesNotMatch(read('src/renderer/src/components/triggers/TriggersTab.tsx'), /AgentSchedules/);
});
