'use strict';

/**
 * A schedule says when and which job (owner, 2026-09-25): its label names the
 * job and the agent does it the way its Work style says. Every run sends the
 * same short message; an older schedule's prompt rides along until the owner
 * moves it into the agent's Work style, and is never silently dropped.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { scheduledRunBody } = loadTs('src/shared/scheduleMessage.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

test('every run sends the job name and points at the Work style, with a way to stay quiet', () => {
  const body = scheduledRunBody('  Weekly money summary ');
  assert.equal(body, 'Scheduled run: Weekly money summary.\nDo it the way your Work style and your saved procedures say. If there is nothing to do, stop without messaging anyone.');
  assert.doesNotMatch(body, /[\u2013\u2014]/);
});

test('an older schedule\'s prompt is still sent, labelled, until it moves', () => {
  const body = scheduledRunBody('Email triage', 'Check Gmail and flag anything urgent.');
  assert.match(body, /Older instructions the owner gave this schedule, until they move into your Work style:\nCheck Gmail and flag anything urgent\.$/);
});

test('the scheduler sends that message, and the Schedules card has no prompt for new schedules', () => {
  const main = read('src/main/index.ts');
  assert.equal((main.match(/body: scheduledRunBody\(m\.label, m\.body\)/g) ?? []).length, 2, 'the timer and the launch standup');
  const ui = read('src/renderer/src/components/triggers/SchedulesSection.tsx');
  assert.match(ui, /if \(!mLabel\.trim\(\) \|\| !whenIsUsable\) return;/, 'a label is all a new schedule needs');
  assert.doesNotMatch(ui, /mBody/);
  assert.match(ui, /updateAgent\(agent\.id, \{ goal: \[agent\.goal\?\.trim\(\), `\$\{m\.label\}: \$\{text\}`\]/, 'older instructions move into the Work style');
  assert.match(ui, /\{heartbeat && \(\s*<Field label=\{t\('schedulesSection\.prompt'\)\}>/, 'the heartbeat keeps its box for now');
  const en = JSON.parse(read('src/renderer/src/i18n/locales/en.json'));
  assert.match(en.addAgent.workStyleHelp, /jobs it runs on a schedule included/);
  for (const loc of ['en', 'zh-CN', 'ar']) {
    const d = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`));
    for (const k of ['labelHint', 'olderInstructions', 'olderInstructionsHint', 'moveToWorkStyle', 'removeOlder']) assert.ok(d.schedulesSection[k], `${loc} ${k}`);
  }
});

test('voice-created schedules take a job name, not a prompt', () => {
  const actions = read('src/renderer/src/realtime/actions.ts');
  assert.match(actions, /required: \['label'\],/);
  assert.match(read('src/main/realtimeActions.ts'), /to: targetId,\n\s*body: '',/);
});
