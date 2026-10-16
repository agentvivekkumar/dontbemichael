'use strict';

/**
 * The owner reads the instructions written from a work style before they are
 * saved (TODOS.md, "Show the rewritten instructions before saving a work
 * style"). Hire and Edit Agent show them first, say when the simpler rewrite
 * answered, and keep exactly what was shown.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { reviewKey, standingReview, reviewOf } = loadTs('src/shared/workStyleReview.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

test('a review stands only for the work style, name and title it was written from', () => {
  const key = reviewKey('Answer every email the same day.', { name: 'Kelly', title: 'Customer Support' });
  const review = { key, text: 'The owner set this work style for your role.\n\nAnswer the same day.', source: 'ai' };
  assert.equal(standingReview(review, reviewKey('  Answer every email the same day.\n', { name: ' Kelly ', title: 'Customer Support' })), review, 'spacing at the ends is not a change');
  assert.equal(standingReview(review, reviewKey('Answer every email within two days.', { name: 'Kelly', title: 'Customer Support' })), null, 'a new work style');
  assert.equal(standingReview(review, reviewKey('Answer every email the same day.', { name: 'Erin', title: 'Customer Support' })), null, 'a new name');
  assert.equal(standingReview(review, reviewKey('Answer every email the same day.', { name: 'Kelly', title: 'Front desk' })), null, 'a new title');
  assert.equal(standingReview(review, reviewKey('Answer every email the same day.', { name: 'Kelly' })), null, 'a cleared title');
  assert.equal(standingReview(null, key), null);
  assert.equal(standingReview({ ...review, text: '  ' }, key), null, 'nothing to keep');
});

test('a convert answer is held with where it came from, and an empty one is not', () => {
  assert.deepEqual(reviewOf('k', { text: ' Do it. \n', source: 'ai' }), { key: 'k', text: 'Do it.', source: 'ai' });
  assert.deepEqual(reviewOf('k', { text: 'Do it.', source: 'rules' }), { key: 'k', text: 'Do it.', source: 'rules' });
  assert.equal(reviewOf('k', { text: 'Do it.' }).source, 'rules', 'an unnamed source is never shown as the full rewrite');
  assert.equal(reviewOf('k', { text: '   ', source: 'ai' }), null);
  assert.equal(reviewOf('k', null), null);
  assert.equal(reviewOf('k', undefined), null);
});

test('Edit Agent shows the instructions on the first Save and keeps them on the second', () => {
  const src = read('src/renderer/src/components/EditAgentModal.tsx');
  const save = src.slice(src.indexOf('const save = async () => {'), src.indexOf('const who = '));
  const shown = save.indexOf('const shown = standingReview(review, key);');
  const convert = save.indexOf('window.cth.workStyleConvert(');
  const held = save.indexOf('setReview(written);');
  const update = save.indexOf('updateAgent(agent.id, {');
  assert.ok(shown > 0 && convert > shown, 'a standing review is checked before writing again');
  assert.match(save, /if \(shown\) trimmedGoal = shown\.text;/, 'what was shown is what is saved');
  assert.ok(held > convert && update > held, 'the new instructions are shown, not saved');
  assert.match(save.slice(held, held + 60), /setReview\(written\);\n\s+return;/, 'Save stops at the review');
  assert.match(save, /const key = reviewKey\(goal, \{ name: trimmedName, title: role \}\);/);
  assert.match(src, /reviewKey\(goal, \{ name: who, title: role \}\)/, 'the panel and Save read the same key');
  assert.match(src, /<WorkStyleReviewPanel review=\{reviewing\} name=\{who\} onChange=\{\(\) => setReview\(null\)\} grow \/>/);
  assert.match(src, /reviewing \? t\('workStyleReview\.use'\) : t\('editAgent\.save'\)/);
  assert.match(src, /setReview\(null\);\n\s+describe\(effectiveWorkStyle\(agent\)\);/, 'another agent starts with no review');
});

test('Hire shows the instructions before anyone is hired, and hires with them as shown', () => {
  const src = read('src/renderer/src/components/AddAgentModal.tsx');
  const start = src.indexOf('const submitHire = async');
  const flow = src.slice(start, src.indexOf('\n  return (', start));
  const held = flow.indexOf('setReview(written);');
  assert.ok(held > 0 && held < flow.indexOf('spawnPty'), 'shown before the spawn');
  assert.ok(held < flow.indexOf('foldersEnsure'), 'no folder is made for a hire still being read');
  assert.match(flow.slice(held, held + 60), /setReview\(written\);\n\s+return;/, 'Hire stops at the review');
  assert.match(flow, /if \(shown\) goal = shown\.text;/, 'what was shown is what is hired with');
  assert.match(flow, /const written = reviewOf\(key, res\);\n\s+setBusy\(false\);/, 'the dialog is free again while the owner reads');
  assert.match(src, /const reviewing = standingReview\(review, reviewKey\(workStyle, styleCtx\(\)\)\);/, 'the panel and Hire read the same key');
  assert.match(src, /<WorkStyleReviewPanel review=\{reviewing\} name=\{name\.trim\(\)\} onChange=\{\(\) => setReview\(null\)\} \/>/);
  assert.match(src, /reviewing \? tr\('workStyleReview\.useAndHire', \{ name: name\.trim\(\) \}\) : tr\('addAgent\.spawn'\)/);
});

test('the panel is read only, shows the body the agent follows, and names a simpler rewrite', () => {
  const panel = read('src/renderer/src/components/WorkStyleReviewPanel.tsx');
  assert.match(panel, /<MarkdownPreview source=\{workStyleBody\(review\.text\)\} variant="card" \/>/);
  assert.match(panel, /review\.source === 'rules' && \(\n\s+<div role="status"/);
  assert.doesNotMatch(panel, /<textarea|<input/, 'the owner changes the work style, not the instructions');
  assert.doesNotMatch(panel, /#[0-9a-f]{3,6}\b/i, 'colors come from the design tokens');
});

test('every language has the review words, and none names the manager', () => {
  const keys = ['title', 'intro', 'simpler', 'change', 'use', 'useAndHire'];
  for (const loc of ['en', 'zh-CN', 'ar']) {
    const r = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).workStyleReview;
    assert.deepEqual(Object.keys(r), keys, loc);
    for (const k of keys) assert.ok(r[k].trim(), `${loc} ${k}`);
    assert.match(r.title, /\{\{name\}\}/, `${loc} title names the team member`);
    assert.match(r.useAndHire, /\{\{name\}\}/, `${loc} useAndHire names the hire`);
    assert.doesNotMatch(JSON.stringify(r), /Michael|godName/, loc);
  }
});
