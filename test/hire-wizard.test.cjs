'use strict';

/**
 * The hire wizard's contract (docs/designs/hire-redesign.md): three steps, the
 * job check before Hire, bindings that hand work back, the source card, and the
 * new hire opening on Capabilities.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
const modal = read('src/renderer/src/components/AddAgentModal.tsx');

test('four steps, Who, Job, Role then Setup; a queued hire opens on Role', () => {
  assert.match(modal, /const STEPS: Step\[\] = \['who', 'job', 'role', 'setup'\];/);
  assert.match(modal, /useState<Step>\(pendingHire \? 'role' : 'who'\)/);
  assert.doesNotMatch(modal, /DESCRIPTION_TEMPLATES/, 'the developer templates are gone');
});

test('the job list offers the character\'s own job, the office\'s jobs, a new job and every pack\'s', () => {
  assert.match(modal, /ownJob\(character, officeJobs, cards\)/);
  assert.match(modal, /teamJobs\(team, cards\)/);
  assert.match(modal, /officeJobs\.filter\(\(j\) => j\.key !== theirJob\?\.key && \(listAll \|\| sameFamily\(j, character\)\)\)/, 'office jobs open on the character\'s family');
  assert.match(modal, /useEffect\(\(\) => \{ setShowAll\(false\); \}, \[character\]\);/, 'a new character closes the list again');
  assert.match(modal, /tr\('addAgent\.wizard\.showAll', \{ count: hiddenCount \}\)/);
  assert.match(modal, /\{familyJobs\.map\(\(j\) => \(/);
  assert.match(modal, /cardJobs\(res\.packs\.map\(\(p\) => p\.pack\), res\.core, config\.businessType, business\)/);
  assert.match(modal, /const copy = jobFor\(chosenJob, name\.trim\(\)\);/, 'the name is swapped in');
});

test('Setup opens only for a verified role: distinct, or bound; Hire checks again', () => {
  const gate = modal.slice(modal.indexOf('const roleReady = async'), modal.indexOf('const goTo = async'));
  assert.match(gate, /if \(!v\) v = await runCheck\(\);/);
  assert.match(gate, /if \(overlaps\.length > 0 && !binding\) \{ setError\(tr\('addAgent\.wizard\.errOverlap'\)\); return false; \}/);
  assert.match(modal, /if \(!\(await roleReady\(\)\)\) \{ setStep\('role'\); return; \}/);
  const start = modal.indexOf('const submit = async');
  const flow = modal.slice(start, modal.indexOf('\n  return (', start));
  assert.ok(flow.indexOf('roleReady()') < flow.indexOf('spawnPty'), 'checked before spawning');
  assert.match(modal, /const checkSig = `\$\{profile\.name\}\\n\$\{profile\.routing\}`;/, 'a title edit does not reset the check');
  assert.match(modal, /const overlapNames = \[\.\.\.new Set\(\[\.\.\.\(verdict\?\.overlapsWith \?\? \[\]\), \.\.\.ruleOverlaps\]\)\];/, 'the rules always count, live');
  assert.match(modal, /disabled=\{\(step === 'who' && !!whoError\) \|\| \(step === 'role' && \(checking \|\| \(overlapNames\.length > 0 && !binding\)\)\)\}/);
});

test('Finalize explains the work style, the folder and the model behind info icons', () => {
  const setup = modal.slice(modal.indexOf("{step === 'setup' && ("));
  for (const k of ['workStyleIntro', 'folderPurpose', 'modelPurpose']) assert.match(setup, new RegExp(`info=\\{tr\\('addAgent\\.wizard\\.${k}'`), k);
  assert.match(modal, /\{info && <InfoTip text=\{info\} label=\{label\} \/>\}/);
  assert.match(modal, /info=\{tr\('addAgent\.roleHelp'/, 'the role screen too');
  for (const loc of ['en', 'zh-CN', 'ar']) {
    const w = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).addAgent.wizard;
    assert.equal(w.step.setup, { en: 'Finalize', 'zh-CN': '完成', ar: 'إنهاء' }[loc]);
  }
  const role = modal.slice(modal.indexOf("{step === 'role' && ("), modal.indexOf("{step === 'setup' && ("));
  assert.match(role, /<DistinctBox/);
  assert.doesNotMatch(role, /addAgent\.workStyle'/, 'work style is not on the role screen');
});

test('a binding updates the overlapping teammates\' lines and a mailbox binding is set before the spawn', () => {
  const start = modal.indexOf('const submit = async');
  const flow = modal.slice(start, modal.indexOf('\n  return (', start));
  assert.ok(flow.indexOf('mailSetCapabilities(id, { email: { enabled: true') < flow.indexOf('spawnPty'));
  assert.match(flow, /void window\.cth\.hivePatchAgentRole\(mate\.id, next\)/);
  assert.match(flow, /appendOnce\(split\.roleDescription, others\)/);
  assert.match(modal, /maxLength=\{TOPIC_MAX\}/);
  assert.match(modal, /const TOPIC_MAX = 120;/);
});

test('the hire saves its source card and opens on Capabilities', () => {
  assert.match(modal, /\n      sourceCard,\n/);
  assert.match(modal, /setSidebarTab\('capabilities'\);/);
  assert.match(read('src/renderer/src/components/ProfileTab.tsx'), /o\.cards\.get\(agent\.id\) \?\? \(agent\.sourceCard \? o\.allCards\.get\(agent\.sourceCard\) : undefined\)/);
});

test('main checks with Haiku and no tools, and falls back to the rules', () => {
  const main = read('src/main/hireCheck.ts');
  assert.match(main, /const CHECK_MODEL = 'claude-haiku-4-5';/);
  assert.match(main, /noTools: true,/);
  const { rulesVerdict, readJobProfile } = loadTs('src/main/hireCheck.ts');
  assert.equal(readJobProfile({ name: '' }), null);
  assert.equal(readJobProfile({ name: 'Erin', title: 5 }).title, '');
  const v = rulesVerdict({ name: 'Erin', title: 'Admin', routing: 'Erin sorts the business inbox and supplier mail.' }, [{ name: 'Pam', title: 'Receptionist', routing: 'Pam sorts the business inbox and supplier mail.' }]);
  assert.deepEqual(v, { distinct: false, overlapsWith: ['Pam'], why: '', source: 'rules' });
  assert.match(main, /overlapsWith = \[\.\.\.new Set\(\[\.\.\.verdict\.overlapsWith, \.\.\.overlapsByRules\(job, team\)\]\)\]/, 'the AI cannot clear what the rules flag');
});

test('every wizard string exists in all three languages, without dashes', () => {
  const keys = [...new Set([...modal.matchAll(/'addAgent\.wizard\.([a-zA-Z.]+)'/g)].map((m) => m[1]))];
  for (const loc of ['en', 'zh-CN', 'ar']) {
    const w = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).addAgent.wizard;
    for (const k of keys) {
      const v = k.split('.').reduce((o, p) => o?.[p], w);
      assert.equal(typeof v, 'string', `${loc}: wizard.${k}`);
      assert.doesNotMatch(v, /[–—]| - /, `${loc}: wizard.${k} has a dash`);
    }
    for (const s of ['who', 'job', 'role', 'setup']) assert.ok(w.step[s] && w.stepHint[s], `${loc}: step ${s}`);
  }
});

test('the model list starts on the default for agents from Settings, marked default', () => {
  assert.match(modal, /const defaultModel = isClaudeProvider\(provider\) \? config\.defaultModel : config\.providerDefaultModels\?\.\[provider\];/);
  assert.match(modal, /m\.id === defaultModel \? tr\('addAgent\.wizard\.modelDefault', \{ model: m\.label \}\) : m\.label/);
  assert.doesNotMatch(modal, /'best' \| 'fast'/, 'no Best or Fast');
});

test('work style is required, when hiring and when editing (owner, 2026-09-27)', () => {
  assert.match(modal, /if \(!workStyle\.trim\(\)\) \{ setError\(tr\('addAgent\.wizard\.errWorkStyle'\)\); return; \}/);
  const edit = read('src/renderer/src/components/EditAgentModal.tsx');
  assert.match(edit, /if \(!agent\.isGod && !agent\.isAssistant && !goal\.trim\(\)\) \{ setGoalError\(true\); return; \}/);
  assert.doesNotMatch(edit, /Work style \(optional\)/);
  for (const loc of ['en', 'zh-CN', 'ar']) {
    const a = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).addAgent;
    assert.doesNotMatch(a.workStyle, /optional|可选|اختياري/, loc);
  }
});

test('the other businesses\' list leaves out this business\'s own card for the job (owner, 2026-09-27)', () => {
  assert.match(modal, /const ownBusinessCard = \(j: HireJob\) => !!config\.businessType && j\.sourceCard\?\.startsWith\(`\$\{config\.businessType\}\/`\) && inFamily\(j\) && !!family;/);
  assert.match(modal, /cards\.filter\(\(j\) => \(listAll \|\| inFamily\(j\)\) && !ownBusinessCard\(j\)\)/);
});

test('the role screen asks what the new hire handles, not what to send (owner, 2026-09-27)', () => {
  for (const loc of ['en', 'zh-CN', 'ar']) {
    const a = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).addAgent;
    assert.doesNotMatch(JSON.stringify(a), /what to send|What to send/, `${loc}: no "what to send" left`);
  }
  const en = JSON.parse(read('src/renderer/src/i18n/locales/en.json')).addAgent;
  assert.equal(en.wizard.whatToSend, 'What {{name}} handles');
  assert.match(modal, /tr\('addAgent\.roleHelp', \{ godName, name: name\.trim\(\) \}\)/);
});

test('a bound job says the overlap is resolved instead of repeating it (owner, 2026-09-27)', () => {
  assert.match(modal, /p\.binding\s*\? t\('addAgent\.wizard\.resolved', \{ name: p\.name, names: p\.overlapNames\.join\(listJoin\) \}\)\s*: t\('addAgent\.wizard\.overlaps'/);
  assert.match(modal, /\{!p\.binding && <span>\{p\.verdict\?\.why/);
});

test('the job check shows each teammate taking a turn while it runs (owner, 2026-09-27)', () => {
  assert.match(modal, /if \(p\.checking\) return <CheckingTeam team=\{p\.team\} \/>;/);
  const anim = modal.slice(modal.indexOf('function CheckingTeam'), modal.indexOf('interface DistinctBoxProps'));
  assert.match(anim, /setInterval\(\(\) => setTurn\(\(n\) => n \+ 1\), 900\)/);
  assert.match(anim, /prefers-reduced-motion: reduce/, 'still for reduced motion');
  assert.match(anim, /t\('addAgent\.wizard\.comparingWith', \{ name: current\.name \}\)/);
  assert.match(read('src/renderer/src/design/global.css'), /@keyframes cth-hop/);
});
