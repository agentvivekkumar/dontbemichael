'use strict';
/**
 * Every agent's first tab is its Profile (owner, 2026-09-25;
 * docs/designs/agent-profile.md).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { parseRoleLine, workStyleBody } = loadTs('src/shared/agentProfile.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

const PAM = 'Executive Admin: Pam sorts the business inbox: email from clients, prospects, vendors and software services, urgent and due soon messages, newsletters and junk. Send here for "anything important in email", "did the client reply" or inbox cleanup. Not for writing answers to customer questions; that goes to Customer Support.';

test("Pam's role line splits into title, summary, what to send, and what goes elsewhere", () => {
  const r = parseRoleLine(PAM);
  assert.equal(r.title, 'Executive Admin');
  assert.equal(r.summary, 'Pam sorts the business inbox: email from clients, prospects, vendors and software services, urgent and due soon messages, newsletters and junk.');
  assert.deepEqual(r.sendFor, ['anything important in email', 'did the client reply', 'inbox cleanup']);
  assert.equal(r.notFor, 'Not for writing answers to customer questions; that goes to Customer Support.');
});

test("Michael's short line and a line with no title", () => {
  const m = parseRoleLine('office manager: runs the floor, triages requests, and brings you only the critical calls');
  assert.equal(m.title, 'Office manager');
  assert.equal(m.summary, 'Runs the floor, triages requests, and brings you only the critical calls');
  assert.deepEqual(m.sendFor, []);
  const plain = parseRoleLine('Helps with whatever comes up. Keeps notes.');
  assert.equal(plain.title, '');
  assert.equal(plain.summary, 'Helps with whatever comes up. Keeps notes.');
  assert.deepEqual(parseRoleLine(undefined), { title: '', summary: '', sendFor: [], notFor: '' });
});

test('a period inside a quoted request does not split the sentence', () => {
  const r = parseRoleLine('Sales: Finds deals. Send here for "who is Acme Inc. anyway" or pipeline.');
  assert.deepEqual(r.sendFor, ['who is Acme Inc. anyway', 'pipeline']);
  assert.equal(r.summary, 'Finds deals.');
});

test('the work style drops the line that addresses the agent', () => {
  assert.equal(workStyleBody('The owner set this work style for your role at Moblize, Mountain View.\n\n### The job\nSort mail.'), '### The job\nSort mail.');
  assert.equal(workStyleBody(undefined), '');
});

test('Profile is the first tab on every agent, and new windows open on it', () => {
  const tabs = read('src/renderer/src/components/SidebarTabs.tsx');
  assert.equal([...tabs.matchAll(/\{ key: '(\w+)',/g)].map((m) => m[1])[0], 'profile');
  const panel = read('src/renderer/src/components/AgentDetailPanel.tsx');
  assert.match(panel, /\{sidebarTab === 'profile' && \(\s*<ProfileTab agent=\{agent\} \/>/);
  assert.match(read('src/renderer/src/store/store.ts'), /\/\/ First visit: the agent's Profile, the first tab \(owner, 2026-09-25\)\.\n  return 'profile';/);
  const cc = read('src/renderer/src/components/CommandCenterPanel.tsx');
  assert.match(cc, /\{tab === 'profile' && <ProfileTab agent=\{agent\} \/>\}/);
});

test('the profile reads the pack card for this office, with sections an owner scans', () => {
  const src = read('src/renderer/src/components/ProfileTab.tsx');
  assert.match(src, /res\.packs\.find\(\(p\) => p\.pack\.businessType === type\)\?\.pack \?\? res\.core/);
  for (const k of ['profile.sendFor', 'profile.does', 'profile.asksFirst', 'profile.facts', 'profile.instructions']) assert.ok(src.includes(`t('${k}'`), k);
  assert.match(src, /aria-expanded=\{showInstructions\}/);
  assert.match(src, /<dl style/);
});

test('strings in every language, no dashes, no literal Michael', () => {
  const en = JSON.parse(read('src/renderer/src/i18n/locales/en.json'));
  for (const loc of ['en', 'zh-CN', 'ar']) {
    const d = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`));
    assert.deepEqual(Object.keys(d.profile).sort(), Object.keys(en.profile).sort(), loc);
    assert.ok(d.sidebar.profile, loc);
    for (const [k, v] of Object.entries(d.profile)) {
      assert.doesNotMatch(v, /[–—]| - /, `${loc} ${k}`);
      assert.doesNotMatch(v, /Michael/, `${loc} ${k}`);
    }
  }
});
