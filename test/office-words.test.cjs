'use strict';

/**
 * Captions in office words (owner, 2026-09-30: "using Bash" confuses a
 * business owner). actionText turns engine words and tool calls into plain
 * phrases for every card, panel header and closing time row; the stored
 * action itself never changes.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { actionText, toolOfAction } = loadTs('src/renderer/src/store/store.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
const en = JSON.parse(read('src/renderer/src/i18n/locales/en.json'));
// i18next-like: look the key up in English and fill {{placeholders}}.
const t = (key, opts = {}) => {
  const v = key.split('.').reduce((o, k) => (o ? o[k] : undefined), en);
  if (typeof v !== 'string') throw new Error(`missing key ${key}`);
  return v.replace(/\{\{(\w+)\}\}/g, (_, k) => String(opts[k]));
};

test('tool calls read as office work', () => {
  const cases = [
    ['using Bash', 'Running a task on the computer'],
    ['bash npm test', 'Running a task on the computer'],
    ['read src/app.ts', 'Reading a file'],
    ['using Edit', 'Editing a document'],
    ['using Grep', 'Looking through files'],
    ['using WebSearch', 'Searching the web'],
    ['using WebFetch', 'Reading a web page'],
    ['using mcp__md-mail__search', 'Checking email'],
    ['using mcp__md-mail__send', 'Sending an email'],
    ['using mcp__md-mail__draft', 'Drafting an email'],
    ['using mcp__claude_ai_QuickBooks__get_invoices', 'Working in QuickBooks'],
    ['using mcp__claude_ai_HubSpot__search_crm_objects', 'Working in HubSpot'],
    ['using mcp__google_calendar__list_events', 'Checking the calendar'],
    ['using SomethingNew', 'Working']
  ];
  for (const [action, said] of cases) assert.equal(actionText(action, t), said, action);
});

test('fixed engine captions read as office words; everything else passes through', () => {
  assert.equal(actionText('waiting at a prompt', t), 'Waiting for an answer');
  assert.equal(actionText('compacting context', t), 'Organizing their notes');
  assert.equal(actionText('reading inbox', t), 'Reading messages');
  assert.equal(actionText('worktree gone, using base repo', t), 'Working in the main folder');
  assert.equal(actionText('idle', t), 'nothing to do');
  // A real description of the work is already in plain words.
  assert.equal(actionText('Replying to Invoice #4471', t), 'Replying to Invoice #4471');
  assert.equal(toolOfAction('Reading the September report'), null, 'a sentence that starts with a tool-like word is not a tool');
});

test('every office word exists in all three languages', () => {
  const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
  const want = keys(en.office.activity).sort();
  for (const loc of ['zh-CN', 'ar']) {
    const d = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`));
    assert.deepEqual(keys(d.office.activity).sort(), want, loc);
    assert.match(d.office.activity.tool.inApp, /\{\{app\}\}/, loc);
  }
});
