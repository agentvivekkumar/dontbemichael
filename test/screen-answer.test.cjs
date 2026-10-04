'use strict';

/**
 * "Suggest me" streams its draft into the field (owner, 2026-10-03: the button
 * sat on "Writing..." with no sign of life, and stayed there when the call
 * failed). The live text is read off the hidden session's screen.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { screenAnswer } = loadTs('src/main/screenAnswer.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

test('the live draft is the text after the answer marker, in paragraphs, without the status lines', () => {
  // Value: protects=the owner sees a readable draft while it is written; fails_when=the prompt, the spinner or the effort line leaks in, or terminal wraps split sentences; why_new=new preview; seam=none
  const screen = [
    '> Write a first work style for Creed ... Answer with the description only.',
    '',
    '⏺ The job: Creed keeps HubSpot clean, so this matters even though it',
    '  looks like small, quiet work.',
    '',
    '  How the work is done: Creed checks records for duplicates because',
    '  duplicates split history.',
    '',
    '● high · /effort',
    '✻ Writing… (3s · ↓ 120 tokens)',
    '❯ '
  ];
  assert.equal(screenAnswer(screen), 'The job: Creed keeps HubSpot clean, so this matters even though it looks like small, quiet work.\n\nHow the work is done: Creed checks records for duplicates because duplicates split history.');
  assert.equal(screenAnswer(['> prompt', '✻ Thinking…']), '', 'nothing written yet');
  assert.equal(screenAnswer(['⏺ first answer', '', '> next', '⏺ The job: second.']), 'The job: second.', 'the last answer only');
});

test('the wizard streams the draft, can stop it, and never stays stuck', () => {
  // Value: protects=Suggest me shows progress, can be stopped, and always gives the field back; fails_when=no live text, no Stop, or a thrown error leaves "Writing..." forever (a stale preload did exactly that); why_new=owner 2026-10-03; seam=source pin
  const modal = read('src/renderer/src/components/AddAgentModal.tsx');
  const fn = modal.slice(modal.indexOf('const suggestWorkStyle = async'), modal.indexOf('const stopSuggest ='));
  assert.match(fn, /window\.cth\.onWorkStyleSuggestText\?\.\(\(e\) => \{\s*if \(e\.requestId === id && suggestRun\.current\?\.id === id\) setWorkStyle\(e\.text\);/);
  assert.match(fn, /\} catch \{[\s\S]*?setWorkStyle\(before\); setSuggestFailed\(true\);[\s\S]*?\} finally \{\s*off\?\.\(\);[\s\S]*?setSuggesting\(false\);/, 'any failure gives the field and the button back');
  assert.match(modal, /readOnly=\{suggesting\}/);
  assert.match(modal, /onClick=\{stopSuggest\}>\{tr\('addAgent\.wizard\.suggestStop'\)\}/);
  assert.match(modal, /window\.cth\.workStyleSuggestStop\?\.\(run\.id\)/);
  const main = read('src/main/index.ts');
  assert.match(main, /evt\.sender\.send\('workStyle:suggestText', \{ requestId, text \}\)/);
  assert.match(main, /ipcMain\.handle\('workStyle:suggestStop'/);
  const hidden = read('src/main/hiddenClaude.ts');
  assert.match(hidden, /const screen = opts\.onScreenText \? new Terminal\(/, 'a headless terminal only when a preview is wanted');
  assert.match(hidden, /screen\?\.write\(data\);/);
  assert.match(hidden, /const onAbort = \(\) => finish\(\{ ok: false, error: 'cancelled' \}\);/);
  assert.match(read('package.json'), /"@xterm\/headless": "\^5\.5\.0"/);
  for (const loc of ['en', 'ar', 'zh-CN']) assert.ok(JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).addAgent.wizard.suggestStop, loc);
});
