'use strict';

/**
 * "Suggest me" on the hire wizard (owner, 2026-10-03: "it could be hard for
 * owner to type a nice detailed work style from scratch"): a first work style
 * from the role, what they handle, the business type and the team, in the
 * plain form the owner reviews and edits.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
const W = loadTs('src/shared/workStyleText.ts');
const { readSuggestRequest } = loadTs('src/main/workStyleConvert.ts');

const req = {
  ctx: { name: 'Creed', title: 'Quality Control', business: { name: 'Sunrise Bakery', city: 'Austin' }, manager: 'Michael' },
  handles: 'Duplicate and missing fields in HubSpot.',
  businessType: 'SaaS & Consulting',
  team: [{ name: 'Nick', title: 'IT Engineer', handles: 'Outages and bugs.' }]
};

test('the prompt carries the role, what they handle, the business and the team, in the plain three part form', () => {
  // Value: protects=the suggestion fits this hire in this business and stays out of teammates' work; fails_when=a field is dropped from the prompt or it asks for another format; why_new=new; seam=none
  const p = W.suggestWorkStylePrompt(req);
  assert.match(p, /a new AI team member whose job is Quality Control, at Sunrise Bakery, Austin, a SaaS & Consulting business\./);
  assert.match(p, /What the Quality Control handles: "Duplicate and missing fields in HubSpot\."/);
  assert.match(p, /- IT Engineer: Outages and bugs\./);
  assert.match(p, /"The job:"[\s\S]*"How the work is done:"[\s\S]*"Asks the owner first:"/, 'the labels the field and plainFallback use');
  assert.match(p, /Say nothing about how often or at what time the work runs/, 'schedules set frequency');
  assert.match(p, /Invent no prices, dates, tools, names or policies/, 'house rule 1');
  assert.match(p, /asks a teammate directly for a fact/);
  assert.match(p, /no dashes/);
  assert.doesNotMatch(p, /[–—]/);
});

test('the payload is read as short strings and needs a name and what they handle', () => {
  // Value: protects=main never runs a suggestion on junk; fails_when=missing fields pass or long text is not capped; why_new=new IPC; seam=none
  assert.equal(readSuggestRequest(null), null);
  assert.equal(readSuggestRequest({ ctx: { name: 'Creed' }, handles: '  ' }), null);
  assert.equal(readSuggestRequest({ ctx: {}, handles: 'x' }), null);
  const r = readSuggestRequest({ ...req, handles: 'x'.repeat(5000), team: [...Array(30)].map((_, i) => ({ name: `T${i}` })) });
  assert.equal(r.handles.length, 1500);
  assert.equal(r.team.length, 20);
  assert.equal(r.businessType, 'SaaS & Consulting');
});

test('the wizard offers it under the work style, asks before replacing, and Hire writes instructions from it', () => {
  // Value: protects=the owner gets a starting point without losing text they wrote, and the suggestion becomes the agent's instructions; fails_when=no button, no confirm over existing text, the picked job's instructions are kept instead, or Hire can run mid suggestion; why_new=new; seam=source pin
  const modal = read('src/renderer/src/components/AddAgentModal.tsx');
  assert.match(modal, /tr\('addAgent\.wizard\.suggest'\)/);
  assert.match(modal, /if \(workStyle\.trim\(\) && !window\.confirm\(tr\('addAgent\.wizard\.suggestReplace', \{ name: name\.trim\(\) \}\)\)\) return;/);
  assert.match(modal, /setWorkStyle\(text\);\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*setBaseInstructions\(''\);\s*setPlainOfBase\(''\);/);
  assert.match(modal, /disabled=\{busy \|\| checking \|\| suggesting \|\| !workStyle\.trim\(\)\}/);
  const convert = read('src/main/workStyleConvert.ts');
  const fn = convert.slice(convert.indexOf('export async function suggestWorkStyle'));
  assert.match(fn, /model: INSTRUCTIONS_MODEL,[\s\S]*noTools: true,\s*thinking: false,/, 'Sonnet, no tools, no extended thinking');
  assert.match(read('src/main/index.ts'), /ipcMain\.handle\('workStyle:suggest'/);
  for (const loc of ['en', 'ar', 'zh-CN']) {
    const w = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).addAgent.wizard;
    for (const k of ['suggest', 'suggesting', 'suggestReplace', 'suggestFailed']) assert.ok(w[k], `${loc} ${k}`);
  }
  assert.equal(JSON.parse(read('src/renderer/src/i18n/locales/en.json')).addAgent.wizard.suggest, 'Suggest me');
});

test('a suggestion names nobody: the hire and teammates go to the model by role only', () => {
  // Value: protects=a later rename never leaves a stale name in a work style (owner rule: job text names nobody); fails_when=the hire's or a teammate's name reaches the prompt, a name inside a role line survives, or the instruction writer keeps names; why_new=owner 2026-10-03: Suggest me wrote "Creed checks" and "Dwight can trust his pipeline"; seam=none
  const p = W.suggestWorkStylePrompt({
    ...req,
    handles: 'Creed checks HubSpot. Ask Dwight for deal facts.',
    team: [{ name: 'Dwight', title: 'Sales Director', handles: 'Dwight runs the pipeline. Not for X; that goes to Creed.' }, { name: 'Kelly', handles: 'Answers customers.' }, { name: 'Nick', title: 'IT Engineer', handles: 'Nicknames are not names.' }]
  });
  assert.doesNotMatch(p, /\b(Creed|Dwight|Kelly|Nick)\b/, 'no names at all');
  assert.match(p, /Quality Control checks HubSpot\. Ask Sales Director for deal facts\./);
  assert.match(p, /- Sales Director: Sales Director runs the pipeline\. Not for X; that goes to Quality Control\./);
  assert.match(p, /Nicknames are not names\./, 'whole words only');
  assert.match(p, /Name no person, because names change/);
  assert.match(p, /Michael is the only name you may use\./);
  assert.match(W.toInstructionsPrompt('The job: checks data.', { name: 'Creed' }), /name no other team member either: call a teammate by their role, such as the Sales Director, because names change/);
});
