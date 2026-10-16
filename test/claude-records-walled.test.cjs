'use strict';
// No agent, Michael included, opens Claude Code's own records with its tools or
// shell: the projects folder (every member's transcripts, and hidden checks'
// prompts) and history.jsonl (TODOS, "Keep Claude Code's transcripts and
// history out of agents' reach").
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

const { folderPolicy, folderDecision } = loadTs('src/shared/folderAccess.ts');
const P = (p) => path.resolve(p);
const projects = P('/w/claude cfg/projects');
const history = P('/w/claude cfg/history.jsonl');
const records = { claudeProjects: projects, claudeHistory: history };
const asRule = (p) => `/${p.replace(/\\/g, '/').replace(/^(?!\/)/, '/')}`;

test('no agent reads or changes Claude Code\'s transcripts or prompt history, with or without a business folder', () => {
  const withBiz = { business: P('/w/Biz'), teamFolders: [P('/w/Biz/Sales'), P('/w/Biz/Ops')], ...records };
  const bare = { teamFolders: [], ...records };
  const teammate = path.join(projects, '-w-Biz-Sales', 'abc.jsonl');
  for (const layout of [withBiz, bare]) {
    for (const agent of [{ isGod: false, cwd: P('/w/Biz/Ops') }, { isGod: true, cwd: P('/w/Biz') }]) {
      const who = agent.isGod ? 'Michael' : 'team member';
      const pol = folderPolicy(agent, layout, false);
      for (const f of [projects, history]) {
        assert.ok(pol.sandbox.denyRead.includes(f), `shell reads ${f} (${who})`);
        assert.ok(pol.sandbox.denyWrite.includes(f), `shell writes ${f} (${who})`);
      }
      // The folder by everything under it; the history file by its own path.
      for (const tool of ['Read', 'Edit']) {
        assert.ok(pol.deny.includes(`${tool}(${asRule(projects)}/**)`), `${tool} tool, projects (${who})`);
        assert.ok(pol.deny.includes(`${tool}(${asRule(history)})`), `${tool} tool, history (${who})`);
      }
      for (const target of [teammate, history, projects]) {
        for (const tool of ['Read', 'Grep', 'Glob', 'Write', 'Edit']) {
          const r = folderDecision(agent, layout, tool, target, false);
          assert.equal(r.deny, true, `${tool} ${target} (${who})`);
          assert.match(r.reason, /Claude Code's own record/);
        }
      }
    }
  }
  const ops = { isGod: false, cwd: P('/w/Biz/Ops') };
  assert.equal(folderDecision(ops, withBiz, 'Read', P('/w/Biz/Ops/notes.md'), false).deny, false, 'own folder still opens');
  assert.equal(folderDecision(ops, withBiz, 'Read', P('/w/claude cfg/history.jsonl.bak'), false).deny, false, 'only the history file itself');
});

test('the office layout names Claude Code\'s records where CLAUDE_CONFIG_DIR puts them', (t) => {
  const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'md claude cfg-'));
  const before = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = cfg;
  t.after(() => {
    if (before === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = before;
    fs.rmSync(cfg, { recursive: true, force: true });
  });
  const { folderLayoutFor } = loadTs('src/main/officeFile.ts');
  const real = fs.realpathSync.native(cfg);
  for (const layout of [folderLayoutFor(undefined, []), folderLayoutFor(undefined, [], path.join(cfg, 'home'))]) {
    assert.equal(layout.claudeProjects, path.join(real, 'projects'));
    assert.equal(layout.claudeHistory, path.join(real, 'history.jsonl'));
  }
});

test('agents start with Claude Code\'s auto memory off, since it lives in the walled projects folder', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md auto memory-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const { HiveManager } = loadTs('src/main/hive.ts');
  const hive = new HiveManager(() => home);
  const inj = await hive.ensureAgent({ id: 'pam', name: 'Pam', provider: 'claude', cwd: home });
  const settings = JSON.parse(fs.readFileSync(inj.args[inj.args.indexOf('--settings') + 1], 'utf8'));
  assert.equal(settings.autoMemoryEnabled, false);
});

test('Pete is walled from the history file even when CLAUDE_CONFIG_DIR is outside the home folder', () => {
  const { researchFolderPolicy, researchFolderDecision } = loadTs('src/shared/folderAccess.ts');
  const home = P('/w/home');
  const desk = P('/w/home/app/research');
  const walled = [home, projects, history];
  assert.ok(researchFolderPolicy(walled, [desk], home).sandbox.denyRead.includes(history), 'its shell');
  assert.equal(researchFolderDecision(walled, [desk], 'Read', history, false).deny, true, 'its file tools');
  assert.equal(researchFolderDecision(walled, [desk], 'Read', path.join(desk, 'notes.md'), false).deny, false, 'its own desk');
});
