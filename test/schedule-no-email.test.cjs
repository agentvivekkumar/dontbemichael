'use strict';

/**
 * docs/designs/multi-mailbox.md, CEO Section 4: a mail check schedule on an
 * agent without email still nudges it, and the check is refused. The row says
 * "Pam cannot check email" in the On a schedule section and the office
 * schedule, so the owner sees why nothing happens.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { isMailCheck, cannotCheckEmail, noEmailNote } = loadTs('src/renderer/src/components/triggers/scheduleEmail.ts');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const en = JSON.parse(read('src/renderer/src/i18n/locales/en.json'));
// The English text, the way i18next fills it in.
const t = (key, opts) => key.split('.').reduce((o, k) => o[k], en).replace('{{name}}', opts.name);

const mailbox = { id: 'sales-example-com', address: 'sales@example.com', provider: 'gmail', status: 'connected' };
const job = (label, extra = {}) => ({ id: 'm1', label, to: 'pam', body: '', intervalMs: 600_000, enabled: true, ...extra });
const emailOff = { mailboxes: [mailbox], agentCapabilities: { pam: { email: { enabled: false, mailboxes: [], send: false } } } };
const emailOn = { mailboxes: [mailbox], agentCapabilities: { pam: { email: { enabled: true, mailboxes: [mailbox.id], send: false } } } };

test('a mail check on an agent with email off says so, with the agent\'s name', () => {
  // Value: protects=the owner sees why a mail check does nothing; fails_when=the note is missing or does not name the agent; why_new=CEO Section 4 note; seam=none
  assert.equal(noEmailNote(job('Check email'), emailOff, 'pam', 'Pam', t), 'Pam cannot check email.');
  assert.equal(noEmailNote(job('Check sales@ every 10 minutes'), emailOff, 'pam', 'Pam', t), 'Pam cannot check email.');
  assert.equal(noEmailNote(job('Morning round', { focus: 'Answer new emails in the support inbox' }), {}, 'pam', 'Pam', t), 'Pam cannot check email.', 'no capabilities saved yet is email off');
  // A mailbox removed in Settings leaves nothing to read.
  assert.equal(noEmailNote(job('Check email'), { ...emailOn, mailboxes: [] }, 'pam', 'Pam', t), 'Pam cannot check email.');
  // Send only from another member's mailbox is not reading one.
  assert.equal(noEmailNote(job('Check email'), { ...emailOff, agentCapabilities: { pam: { sendOnly: { mailbox: mailbox.id, sending: 'draft' } } } }, 'pam', 'Pam', t), 'Pam cannot check email.');
});

test('no note when the agent can check email, or the job is not a mail check', () => {
  // Value: protects=the note never shows on a schedule that works; fails_when=it shows with email on, on a non mail job, or while the config loads; why_new=CEO Section 4 note; seam=none
  assert.equal(noEmailNote(job('Check email'), emailOn, 'pam', 'Pam', t), null, 'email on');
  assert.equal(noEmailNote(job('Follow up on unpaid invoices', { focus: 'invoices more than 30 days unpaid' }), emailOff, 'pam', 'Pam', t), null, 'not a mail check');
  assert.equal(noEmailNote(job('Check email'), null, 'pam', 'Pam', t), null, 'config still loading');
  assert.equal(cannotCheckEmail(emailOn, 'pam'), false);
  // A Gmail connector the agent may use can check mail too: the same access
  // its profile lists.
  assert.match(read('src/renderer/src/components/triggers/scheduleEmail.ts'), /agentAccessSummary\(cfg, agentId, false\)\.some\(\(i\) => i\.kind === 'mailbox' \|\| \(i\.kind === 'connector' && \/\^gmail\$\/i\.test/);
});

test('what reads as a mail check', () => {
  // Value: protects=only mail jobs get the note; fails_when=a mail job is missed or a plain job matches; why_new=schedules carry no mail kind, so the words decide; seam=none
  for (const label of ['Check email', 'Answer e-mails', 'Clear the inbox', 'Check Gmail', 'Sort the mailbox', 'Check sales@example.com', '查看邮件', 'تحقق من البريد']) {
    assert.equal(isMailCheck(job(label)), true, label);
  }
  for (const label of ['Follow up on unpaid invoices', 'Post on Instagram', 'Call back voicemail', 'Weekly report']) {
    assert.equal(isMailCheck(job(label)), false, label);
  }
  assert.equal(isMailCheck(job('Daily round', { body: 'Read new mail first.' })), true, 'an older prompt counts');
  assert.equal(isMailCheck(job('Check email', { kind: 'compact' })), false, 'a compact job is never a mail check');
});

test('both schedule views show the note, in the hint style', () => {
  // Value: protects=the note is on the On a schedule section and the office schedule; fails_when=either view drops it; why_new=CEO Section 4 note; seam=source check, the list is a React component
  const list = read('src/renderer/src/components/triggers/ScheduleList.tsx');
  assert.match(list, /\{noEmail && <Hint>\{noEmail\}<\/Hint>\}/);
  assert.match(list, /noEmail=\{noEmailNote\(m, config, agentId, agentName, t\)\}/, 'On a schedule');
  assert.match(list, /noEmail=\{noEmailNote\(m, config, owner, name, t\)\}/, 'office schedule');
  for (const loc of ['en', 'zh-CN', 'ar']) {
    const s = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).schedulesSection.cannotCheckEmail;
    assert.ok(s && s.includes('{{name}}'), loc);
  }
});
