'use strict';

/**
 * House rules (owner, 2026-09-25): no agent, Michael included, makes up
 * information. They ride the system prompt every agent gets, identical for all.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron, filename: electron, loaded: true,
  exports: { Notification: class { show() {} static isSupported() { return false; } } }
};

const { HiveManager, HOUSE_RULES } = loadTs('src/main/hive.ts');

const promptOf = (inj) => inj.args[inj.args.indexOf('--append-system-prompt') + 1];

test('Michael and every team member get the same house rules', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-rules-'));
  const hive = new HiveManager(() => home);
  const god = promptOf(await hive.ensureAgent({ id: 'god', name: 'Michael', provider: 'claude', cwd: home, isGod: true }));
  const oscar = promptOf(await hive.ensureAgent({ id: 'oscar', name: 'Oscar', provider: 'claude', cwd: home, role: 'Finance' }));
  assert.ok(god.includes(HOUSE_RULES), 'Michael');
  assert.ok(oscar.includes(HOUSE_RULES), 'a team member');
});

test('the rules cover sources, not knowing, estimates, honest reports and real people', () => {
  assert.match(HOUSE_RULES, /State only facts you can trace to a source/);
  assert.match(HOUSE_RULES, /When you don't know or can't find something, say so/);
  assert.match(HOUSE_RULES, /Mark estimates and assumptions/);
  assert.match(HOUSE_RULES, /Call work finished only when it is/);
  assert.match(HOUSE_RULES, /Make up an example only when the owner asks for a sample/);
});

test('written calmly: no dashes, no shouting, no dates that would break the prompt cache', () => {
  assert.doesNotMatch(HOUSE_RULES, /[–—]/);
  assert.doesNotMatch(HOUSE_RULES.replace(/^HOUSE RULES\./, ''), /\b(MUST|NEVER|ALWAYS|CRITICAL)\b/);
  assert.doesNotMatch(HOUSE_RULES, /\b20\d\d\b/);
});
