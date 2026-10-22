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

const { formatWorkStyleDraft, parseRoleLine, parseWorkStyleDraft, profileDuties, workStyleBody } = loadTs('src/shared/agentProfile.ts');
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
  assert.equal(workStyleBody('The owner set this work style for your role at Sunrise Bakery, Austin.\n\n### The job\nSort mail.'), '### The job\nSort mail.');
  assert.equal(workStyleBody(undefined), '');
});

test("a saved work style supplies what they do and what asks the owner first", () => {
  const pack = JSON.parse(read('resources/packs/restaurant-food.json'));
  const pam = pack.agents.find((a) => a.id === 'pam').workStyle;
  const duties = profileDuties(pam);
  assert.equal(duties.found, true);
  assert.ok(duties.does.some((line) => line.startsWith('Work oldest first')), duties.does.join(' | '));
  assert.ok(duties.does.every((line) => !line.startsWith('You keep the business inbox')), 'the job paragraph is not a duty');
  assert.ok(duties.asksFirst.some((line) => /Delete nothing/.test(line)), duties.asksFirst.join(' | '));
  assert.ok(duties.asksFirst.every((line) => !/inbox at zero/.test(line)));
});

test('the plain labels the owner edits are the same two lists', () => {
  const duties = profileDuties([
    'The job: Answers guests.',
    '',
    'How the work is done: Drafts a reply in the owner\'s voice, because the guest should feel it came from the restaurant.',
    '',
    'Asks the owner first: Any refund, even a small one, because money leaves the business only when the owner says so.'
  ].join('\n'));
  assert.equal(duties.found, true);
  assert.deepEqual(duties.does, ['Drafts a reply in the owner\'s voice, because the guest should feel it came from the restaurant.']);
  assert.deepEqual(duties.asksFirst, ['Any refund, even a small one, because money leaves the business only when the owner says so.']);
});

test('a work style built from card fields keeps each bullet', () => {
  const duties = profileDuties([
    'The owner set this work style for your role at Pho Saigon Kitchen, Austin.',
    '',
    'The job: Tracks food cost.',
    '',
    'What you do:',
    '• Watch invoices',
    '',
    'Needs the owner\'s approval (send it to Michael first):',
    '• Move money'
  ].join('\n'));
  assert.equal(duties.found, true);
  assert.deepEqual(duties.does, ['Watch invoices']);
  assert.deepEqual(duties.asksFirst, ['Move money']);
});

test('a work style with no such sections leaves the pack lists in place', () => {
  assert.deepEqual(profileDuties('Helps with whatever comes up.'), { found: false, does: [], asksFirst: [] });
  assert.deepEqual(profileDuties(undefined), { found: false, does: [], asksFirst: [] });
  // A sentence that only starts with the heading words is not a heading.
  const prose = profileDuties('How to work the dough takes practice.');
  assert.equal(prose.found, false);
});

test('the work style the owner edits is a list of lines and writes back the same labels', () => {
  const text = [
    'The job:',
    'Keep the inbox clear, so nothing waits overnight.',
    '',
    'How the work is done:',
    'Work oldest first.',
    'File receipts.',
    '',
    'Asks the owner first:',
    'Delete nothing.'
  ].join('\n');
  const draft = parseWorkStyleDraft(text);
  assert.equal(draft.job, 'Keep the inbox clear, so nothing waits overnight.');
  assert.deepEqual(draft.does, ['Work oldest first.', 'File receipts.']);
  assert.deepEqual(draft.asksFirst, ['Delete nothing.']);
  const again = parseWorkStyleDraft(formatWorkStyleDraft(draft));
  assert.equal(again.job, draft.job);
  assert.deepEqual(again.does, draft.does);
  assert.deepEqual(again.asksFirst, draft.asksFirst);
  assert.equal(formatWorkStyleDraft({ job: '', does: ['  '], asksFirst: [] }), '');
});

test('loading and saving Pam\'s pack work style keeps every line', () => {
  const pack = JSON.parse(read('resources/packs/restaurant-food.json'));
  const pam = pack.agents.find((a) => a.id === 'pam').workStyle;
  const saved = formatWorkStyleDraft(parseWorkStyleDraft(pam));
  for (const line of workStyleBody(pam).split('\n')) {
    const text = line.trim();
    if (!text || /^#{1,6}\s/.test(text)) continue;
    assert.ok(saved.split('\n').includes(text), text.slice(0, 90));
  }
  assert.equal(formatWorkStyleDraft(parseWorkStyleDraft(saved)), saved);
});

test('a paragraph of older duties splits into sentences, and a written line does not', () => {
  const old = profileDuties('How the work is done: Checks the bookings each morning, so the day is clear. Confirms the headcount, so the kitchen can plan.');
  assert.deepEqual(old.does, [
    'Checks the bookings each morning, so the day is clear.',
    'Confirms the headcount, so the kitchen can plan.'
  ]);
  const listed = parseWorkStyleDraft([
    'How the work is done:',
    'Work oldest first. Then file it.',
    'Route mail to Finance.'
  ].join('\n'));
  assert.deepEqual(listed.does, ['Work oldest first. Then file it.', 'Route mail to Finance.']);
});

test('a job keeps its paragraphs, and an unknown heading or markdown line is kept', () => {
  const text = [
    'The job:',
    'First paragraph stays.',
    '',
    'Second paragraph stays.',
    '',
    'How the work is done:',
    '**Route** mail to Finance.',
    '### Office notes',
    'The binder is in the safe.'
  ].join('\n');
  const draft = parseWorkStyleDraft(text);
  assert.equal(draft.job, 'First paragraph stays.\n\nSecond paragraph stays.');
  assert.deepEqual(draft.does, ['**Route** mail to Finance.', '### Office notes', 'The binder is in the safe.']);
  const again = parseWorkStyleDraft(formatWorkStyleDraft(draft));
  assert.equal(again.job, draft.job);
  assert.deepEqual(again.does, draft.does);
  assert.deepEqual(again.asksFirst, draft.asksFirst);
});

test('leaving out an approval section does not fall back to the pack', () => {
  const duties = profileDuties('How the work is done: Checks the bookings each morning.');
  assert.equal(duties.found, true);
  assert.deepEqual(duties.does, ['Checks the bookings each morning.']);
  assert.deepEqual(duties.asksFirst, []);
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

test('a saved work style replaces the pack lists, and Michael keeps his own', () => {
  const src = read('src/renderer/src/components/ProfileTab.tsx');
  assert.match(src, /const duties = god \? undefined : profileDuties\(effectiveWorkStyle\(agent\)\)/);
  assert.match(src, /duties\?\.found \? duties\.does : \(card\?\.does \?\? \[\]\)/);
  assert.match(src, /duties\?\.found \? duties\.asksFirst : \(card\?\.wontDo \?\? \[\]\)/);
  assert.match(src, /rows=\{!!duties\?\.found\}/, 'the row styling is only the saved work style');
  assert.match(src, /god\s*\?\s*\(t\('profile\.god\.does'/);
  assert.match(src, /god\s*\?\s*\(t\('profile\.god\.asksFirst'/);
});

test('the profile reads the pack card for this office, with sections an owner scans', () => {
  const src = read('src/renderer/src/components/ProfileTab.tsx');
  assert.match(src, /res\.packs\.find\(\(p\) => p\.pack\.businessType === c\.businessType\)\?\.pack \?\? res\.core/);
  for (const k of ['profile.does', 'profile.asksFirst', 'profile.facts', 'profile.instructions']) assert.ok(src.includes(`t('${k}'`), k);
  assert.match(src, /aria-expanded=\{showInstructions\}/);
  assert.match(src, /<dl style/);
});

test("Michael's profile says what his instructions tell him to do, his team and the business", () => {
  const src = read('src/renderer/src/components/ProfileTab.tsx');
  assert.match(src, /god \? t\('profile\.god\.summary', \{ name \}\)/);
  assert.match(src, /agents\.filter\(\(a\) => !a\.isGod && !a\.isAssistant && !a\.archived\)/, 'the live team, not archived agents');
  assert.match(src, /onClick=\{\(\) => useStore\.getState\(\)\.select\(a\.id\)\}/, 'a team member chip opens that agent');
  assert.match(src, /briefing: pack\?\.briefing \? fillBusiness\(pack\.briefing, business\) : ''/);
  const en = JSON.parse(read('src/renderer/src/i18n/locales/en.json')).profile.god;
  for (const k of ['does', 'asksFirst']) assert.ok(Array.isArray(en[k]) && en[k].length >= 3, k);
});

test('strings in every language, no dashes, no literal Michael', () => {
  const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? flat(v, `${p}${k}.`) : [[`${p}${k}`, v]]));
  const en = JSON.parse(read('src/renderer/src/i18n/locales/en.json'));
  for (const loc of ['en', 'zh-CN', 'ar']) {
    const d = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`));
    assert.deepEqual(flat(d.profile).map(([k]) => k).sort(), flat(en.profile).map(([k]) => k).sort(), loc);
    assert.ok(d.sidebar.profile, loc);
    for (const [k, v] of flat(d.profile)) {
      for (const s of [].concat(v)) {
        assert.doesNotMatch(s, /[\u2013\u2014]| - /, `${loc} ${k}`);
        assert.doesNotMatch(s, /Michael/, `${loc} ${k}`);
      }
    }
    assert.equal(d.profile.god.does.length, en.profile.god.does.length, `${loc} same number of duties`);
  }
});

test("every profile can open the agent's work folder, and says so when it can't", () => {
  const src = read('src/renderer/src/components/ProfileTab.tsx');
  assert.match(src, /window\.cth\.openAgentFolder\(agent\.id\)/, 'by id: main opens the folder it has on record, never a path from the renderer');
  // Only a folder the app's settings name opens; the registry's path is only shown (owner, third ship D2).
  assert.match(read('src/main/index.ts'), /const recorded = id === \(reg\.godId \?\? 'god'\) \? cfg\.businessFolder : \(cfg\.businessTeam \?\? \[\]\)\.find\(\(m\) => m\.agentId === id\)\?\.folder;[\s\S]{0,400}?if \(!recorded \|\| !dir \|\| isPackageDir\(shown\)\) \{ shell\.showItemInFolder\(shown\); return \{ ok: true \}; \}/);
  assert.match(src, /onClick=\{openFolder\}>\{t\('profile\.openFolder'\)\}/);
  assert.match(src, /if \(!r\.ok\) setFolderError\(true\);/);
  assert.match(src, /! \{t\('profile\.openFolderFailed'\)\}/);
});

test("no profile says what to send the agent: Michael decides who gets what", () => {
  const src = read('src/renderer/src/components/ProfileTab.tsx');
  assert.doesNotMatch(src, /profile\.sendFor|profile\.god\.sendFor|role\.notFor/);
  for (const loc of ['en', 'zh-CN', 'ar']) {
    const d = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).profile;
    assert.equal(d.sendFor, undefined, loc);
    assert.equal(d.god.sendFor, undefined, loc);
  }
  // The routing sentences stay out of the summary too.
  assert.doesNotMatch(parseRoleLine(PAM).summary, /Send here for|Not for/);
});
