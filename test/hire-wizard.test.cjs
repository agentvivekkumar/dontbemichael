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

test('three steps, Who then Job then Review; a queued hire opens on Review', () => {
  assert.match(modal, /const STEPS: Step\[\] = \['who', 'job', 'review'\];/);
  assert.match(modal, /useState<Step>\(pendingHire \? 'review' : 'who'\)/);
  assert.doesNotMatch(modal, /DESCRIPTION_TEMPLATES/, 'the developer templates are gone');
});

test('the job list offers the character\'s own job, the office\'s jobs, a new job and every pack\'s', () => {
  assert.match(modal, /ownJob\(character, officeJobs, cards\)/);
  assert.match(modal, /teamJobs\(team, cards\)/);
  assert.match(modal, /officeJobs\.filter\(\(j\) => j\.key !== theirJob\?\.key && \(listAll \|\| sameFamily\(j, character\)\)\)/, 'office jobs open on the character\'s family');
  assert.match(modal, /for \(const c of cards\.filter\(\(j\) => listAll \|\| inFamily\(j\)\)\)/, 'pack jobs too');
  assert.match(modal, /useEffect\(\(\) => \{ setShowAll\(false\); \}, \[character\]\);/, 'a new character closes the list again');
  assert.match(modal, /tr\('addAgent\.wizard\.showAll', \{ count: hiddenCount \}\)/);
  assert.match(modal, /\{familyJobs\.map\(\(j\) => \(/);
  assert.match(modal, /cardJobs\(res\.packs\.map\(\(p\) => p\.pack\), res\.core, config\.businessType, business\)/);
  assert.match(modal, /const copy = jobFor\(chosenJob, name\.trim\(\)\);/, 'the name is swapped in');
});

test('Hire needs a distinct job or a binding, checked again after any edit', () => {
  const start = modal.indexOf('const submit = async');
  const flow = modal.slice(start, modal.indexOf('\n  return (', start));
  assert.match(flow, /if \(!v\) v = await runCheck\(\);/);
  assert.match(flow, /if \(overlaps\.length > 0 && !binding\) \{ setError\(tr\('addAgent\.wizard\.errOverlap'\)\); return; \}/);
  assert.ok(flow.indexOf('runCheck') < flow.indexOf('spawnPty'), 'checked before spawning');
  assert.match(modal, /const checkSig = `\$\{profile\.name\}\\n\$\{profile\.title\}\\n\$\{profile\.routing\}`;/);
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
  const v = rulesVerdict({ name: 'Erin', title: 'Admin', routing: 'x' }, [{ name: 'Pam', title: 'admin', routing: 'y' }]);
  assert.deepEqual(v, { distinct: false, overlapsWith: ['Pam'], why: '', source: 'rules' });
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
    for (const s of ['who', 'job', 'review']) assert.ok(w.step[s] && w.stepHint[s], `${loc}: step ${s}`);
  }
});

test('the model list starts on the default for agents from Settings, marked default', () => {
  assert.match(modal, /const defaultModel = isClaudeProvider\(provider\) \? config\.defaultModel : config\.providerDefaultModels\?\.\[provider\];/);
  assert.match(modal, /m\.id === defaultModel \? tr\('addAgent\.wizard\.modelDefault', \{ model: m\.label \}\) : m\.label/);
  assert.doesNotMatch(modal, /'best' \| 'fast'/, 'no Best or Fast');
});
