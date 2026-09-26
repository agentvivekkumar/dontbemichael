'use strict';

/**
 * Michael's panel opens on ASK ME, and ASK ME is the first tab. A terminal is
 * the least friendly thing a business owner can meet first (owner, 2026-09-23).
 * Focus mode still opens on the terminal: reaching it means asking for the
 * terminal full screen.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.resolve(__dirname, '../src/renderer/src/components/CommandCenterPanel.tsx'), 'utf8');

// PROFILE is first on every agent (owner, 2026-09-25); ASK ME right after it,
// and the panel still opens on ASK ME (next test).
test('PROFILE then ASK ME lead Michael\'s panel', () => {
  const block = src.match(/const TABS:[^=]*= \[([\s\S]*?)\n\];/);
  assert.ok(block, 'could not find the TABS list');
  const keys = [...block[1].matchAll(/key: '([a-z-]+)'/g)].map((m) => m[1]);
  assert.deepEqual(keys.slice(0, 2), ['profile', 'human']);
  assert.ok(keys.includes('terminal'), 'the terminal is still there, just not first');
});

test('the docked panel opens on ASK ME; only focus mode opens on the terminal', () => {
  assert.match(src, /const defaultTab: CCTab = fullscreen \? 'terminal' : 'human';/);
  assert.match(src, /useState<CCTab>\(defaultTab\)/);
  assert.doesNotMatch(src, /setTab\('terminal'\)/, 'nothing falls back to the terminal behind the default\'s back');
});

/**
 * Skills moved from Michael's panel to Settings (owner, 2026-09-23). A tab on
 * Michael read as "Michael's skills", but they are the whole team's: a catalog
 * install lands in ~/.claude/skills, which every Claude Code session on the Mac
 * reads, and bundled skills are copied into every agent at spawn.
 */
test('Michael\'s panel has no Skills tab; Settings has a Skills section', () => {
  assert.doesNotMatch(src, /'skills'|SkillsTab/);
  const settings = fs.readFileSync(path.resolve(__dirname, '../src/renderer/src/components/SettingsModal.tsx'), 'utf8');
  assert.match(settings, /const NAV_SECTIONS: Section\[\] = \[[^\]]*'Skills'/);
  assert.match(settings, /activeSection === 'Skills'[\s\S]{0,900}<SkillsTab \/>/, 'no agent passed: the list covers every team folder');
});

test('the Settings copy is true: skills install where every agent reads them', () => {
  const skills = fs.readFileSync(path.resolve(__dirname, '../src/main/skills.ts'), 'utf8');
  assert.match(skills, /const root = join\(homedir\(\), '\.claude', 'skills'\);/, 'catalog installs are machine wide');
  const hive = fs.readFileSync(path.resolve(__dirname, '../src/main/hive.ts'), 'utf8');
  assert.match(hive, /if \(opts\.skillsDir\) this\.copyBundledSkills\(opts\.skillsDir, join\(dir, '\.claude', 'skills'\)\);/, 'bundled skills go to every agent');
});

/**
 * MONITOR and ACTIVITY moved into one ADVANCED tab as collapsible cards, in the
 * TRIGGERS tab's style (owner, 2026-09-24). Links that asked for either tab
 * (task "assign", setup's "ask Michael") open ADVANCED with that card expanded.
 */
test('Monitor and Activity are cards inside a last ADVANCED tab', () => {
  const block = src.match(/const TABS:[^=]*= \[([\s\S]*?)\n\];/);
  const keys = [...block[1].matchAll(/key: '([a-z-]+)'/g)].map((m) => m[1]);
  assert.ok(!keys.includes('floor') && !keys.includes('activity'), 'no longer top level tabs');
  assert.equal(keys[keys.length - 1], 'advanced');
  const adv = src.slice(src.indexOf('function AdvancedTab('), src.indexOf('function Bare('));
  assert.match(adv, /<TriggerCard[\s\S]*?defaultOpen=\{focus === 'monitor'\}[\s\S]*?<FloorTab seed=\{seed\} embedded \/>/);
  assert.match(adv, /<TriggerCard[\s\S]*?defaultOpen=\{focus === 'activity'\}[\s\S]*?<ActivityTab embedded \/>/);
});

test('a request for the old tabs opens ADVANCED on that card', () => {
  assert.match(src, /if \(ccTabRequest\.tab === 'floor' \|\| ccTabRequest\.tab === 'activity'\) \{\s*setAdvancedFocus\(\{ card: ccTabRequest\.tab === 'floor' \? 'monitor' : 'activity', seq: ccTabRequest\.seq \}\);\s*setTab\('advanced'\);/);
  assert.match(src, /<AdvancedTab key=\{advancedFocus\.seq\} focus=\{advancedFocus\.card\}/);
});

/**
 * TASKS left Michael's panel (owner, 2026-09-24): the task board is now the
 * floor's TASKS view, which is where anything asking for 'tasks' lands.
 */
test('Michael\'s panel has no Tasks tab; a request for it opens the floor\'s Tasks view', () => {
  const block = src.match(/const TABS:[^=]*= \[([\s\S]*?)\n\];/);
  const keys = [...block[1].matchAll(/key: '([a-z-]+)'/g)].map((m) => m[1]);
  assert.ok(!keys.includes('tasks'));
  assert.doesNotMatch(src, /<TasksKanban/);
  // 'tasks' and 'graph' both became floor views.
  assert.match(src, /if \(ccTabRequest\.tab === 'tasks' \|\| ccTabRequest\.tab === 'graph'\) \{ useStore\.getState\(\)\.setFloorView\(ccTabRequest\.tab\); return; \}/);
});

test("Michael's schedule tab is called schedules, like every other agent's", () => {
  assert.match(src, /\{ key: 'triggers', labelKey: 'sidebar\.schedules', icon: 'clock' \}/);
  for (const loc of ['en', 'zh-CN', 'ar']) {
    const d = JSON.parse(fs.readFileSync(require('node:path').resolve(__dirname, `../src/renderer/src/i18n/locales/${loc}.json`), 'utf8'));
    assert.equal(d.commandCenter.tabs.triggers, undefined, `${loc}: the old label is gone`);
  }
});
