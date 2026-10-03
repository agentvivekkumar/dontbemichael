'use strict';

/**
 * Work style in two forms (owner, 2026-09-27): a plain description the owner
 * edits, instructions the agent gets (src/shared/workStyleText.ts).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const W = loadTs('src/shared/workStyleText.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
const pack = JSON.parse(read('resources/packs/restaurant-food.json'));
const pam = pack.agents.find((a) => a.id === 'pam').workStyle;
const ctx = { name: 'Erin', title: 'Executive Admin', business: { name: 'Taco Shop', city: 'Austin' } };

test('the quick plain rewrite drops the agent-facing opening and markdown', () => {
  const plain = W.plainFallback(pam);
  assert.doesNotMatch(plain, /The owner set this work style|###|\{Business\}/);
  assert.match(plain, /^The job:/m);
  assert.match(plain, /^How the work is done:/m);
  assert.match(plain, /^Asks the owner first:/m);
});

test('the quick instructions rewrite restores the house opening and headings', () => {
  const back = W.instructionsFallback(W.plainFallback(pam), ctx);
  assert.match(back, /^The owner set this work style for your role at Taco Shop, Austin\./);
  for (const h of ['### The job', '### How to work', "### Needs the owner's approval"]) assert.ok(back.includes(h), h);
});

test('the instructions prompt carries the house prompting rules and the previous wording', () => {
  const p = W.toInstructionsPrompt('The job: sorts mail.', ctx, 'old text');
  assert.match(p, /Start with exactly this line: "The owner set this work style for your role at Taco Shop, Austin\."/);
  assert.match(p, /each with its reason after "because" or "so"/);
  assert.match(p, /no "must", "never" or "critical"/);
  assert.match(p, /without "try to" or "if possible"/);
  assert.match(p, /add no duties of your own/);
  assert.match(p, /under 300 words/);
  assert.match(p, /--- PREVIOUS WORK STYLE ---\nold text/);
  assert.match(W.toPlainPrompt(pam, ctx), /in the third person/);
  assert.equal(W.cleanAnswer('```\nhello\n```'), 'hello');
});

test('the wizard shows the plain description and writes instructions only when it changed', () => {
  const modal = read('src/renderer/src/components/AddAgentModal.tsx');
  assert.match(modal, /setInstructions\(copy\.workStyle, name\.trim\(\), copy\.title\);/);
  assert.match(modal, /if \(!goal \|\| workStyle\.trim\(\) !== plainOfBase\.trim\(\)\) \{/);
  assert.match(modal, /workStyleConvert\(\{ to: 'instructions', text: workStyle, ctx: styleCtx\(\), previous: baseInstructions \|\| undefined \}\)/);
  const start = modal.indexOf('const submit = async');
  const flow = modal.slice(start, modal.indexOf('\n  return (', start));
  assert.ok(flow.indexOf("to: 'instructions'") < flow.indexOf('spawnPty'), 'written before the spawn');
  const main = read('src/main/workStyleConvert.ts');
  assert.match(main, /const INSTRUCTIONS_MODEL = 'claude-sonnet-5';/);
  assert.match(main, /noTools: true,/);
});

test('Edit Agent shows the plain description and rewrites instructions only when it changed', () => {
  const edit = read('src/renderer/src/components/EditAgentModal.tsx');
  assert.match(edit, /describe\(effectiveWorkStyle\(agent\)\);/, 'opens on the plain description, Michael on his default (F6)');
  assert.match(edit, /let trimmedGoal = \(agent\.goal \?\? ''\)\.trim\(\);/, 'unchanged keeps the instructions as they are');
  assert.match(edit, /else if \(goal\.trim\(\) !== plainOfGoal\.trim\(\)\) \{/);
  assert.match(edit, /to: 'instructions',[\s\S]{0,300}previous: effectiveWorkStyle\(agent\) \|\| undefined/);
  const save = edit.slice(edit.indexOf('const save = async'));
  assert.ok(save.indexOf("to: 'instructions'") < save.indexOf('renameAgent('), 'written before anything is saved');
  assert.doesNotMatch(edit, /Check every number twice/, 'no prompt-style placeholder');
});

test('the plain description names the owner and Michael, never "you" (owner, 2026-09-27)', () => {
  const p = W.toPlainPrompt(pam, { ...ctx, manager: 'Michael' });
  assert.match(p, /Never write "you" or "your"/);
  assert.match(p, /The business owner is "the owner"\. Michael is the office manager/);
  assert.match(p, /anything Erin sends, reports or asks for approval goes to Michael/);
  assert.match(p, /"Asks the owner first:"/);
  assert.match(W.toInstructionsPrompt('x', { ...ctx, manager: 'Michael' }), /Team members send reports and approvals to Michael, never to the owner directly\./);
  const quick = W.plainFallback('### How to work\nYou are the admin. Send your summary to Michael so you can move on.', 'Erin');
  assert.doesNotMatch(quick, /\byou\b|\byour\b/i);
  assert.match(quick, /Erin is the admin\. Send Erin's summary to Michael so Erin can move on\./);
  // The owner's old label still reads back as the approval heading.
  assert.match(W.instructionsFallback('Asks you first: refunds.', ctx), /### Needs the owner's approval\nrefunds\./);
});
