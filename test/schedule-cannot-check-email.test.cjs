'use strict';

/**
 * TODOS "Say cannot check email beside a schedule" (docs/designs/multi-mailbox.md,
 * Section 4): a mail check schedule on a team member with email off still
 * nudges it, and every check is refused. The row now says "Pam cannot check
 * email" in the On a schedule section and the Office schedule
 * (src/shared/scheduleEmail.ts, ScheduleList.tsx).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { isMailCheckJob, canCheckEmail, cannotCheckEmailNote } = loadTs('src/shared/scheduleEmail.ts');

const mailbox = { id: 'ceo', address: 'ceo@example.com', provider: 'other', imap: {}, smtp: {} };
const job = (over) => ({ label: 'Check the support inbox', body: '', enabled: true, ...over });

test('a job reads as a mail check from its name, focus area or older prompt', () => {
  // Value: protects=the note shows on the jobs that check mail and nowhere else; fails_when=a mail job is missed or an unrelated one is flagged; why_new=new rule; seam=none
  assert.equal(isMailCheckJob(job({ label: 'Inbox to zero' })), true);
  assert.equal(isMailCheckJob(job({ label: 'Morning sweep', focus: 'reply to new emails from clients' })), true);
  assert.equal(isMailCheckJob(job({ label: 'Morning sweep', body: 'Read the mailbox and draft replies' })), true);
  assert.equal(isMailCheckJob(job({ label: 'Follow up on unpaid invoices', focus: 'invoices more than 30 days unpaid' })), false);
  // Words that only contain "mail" are not a mail check.
  assert.equal(isMailCheckJob(job({ label: 'Mailchimp campaign report' })), false);
  // The app's own upkeep and a relay to Michael are never flagged.
  assert.equal(isMailCheckJob(job({ kind: 'heartbeat', label: 'Check inbox' })), false);
  assert.equal(isMailCheckJob(job({ kind: 'compact', label: 'Check inbox' })), false);
  assert.equal(isMailCheckJob(job({ relay: true })), false);
});

test('a team member can check email with its own mailbox or a given Gmail connector, by the mail tools rule', () => {
  // Value: protects=no false note on an agent that really reads mail; fails_when=a mailbox or a granted Gmail connector is not counted, or a removed mailbox or an off connector is; why_new=new rule; seam=none
  const list = [{ key: 'Gmail', url: 'u', status: 'connected' }];
  assert.equal(canCheckEmail({ mailboxes: [mailbox], agentCapabilities: { pam: { email: { enabled: true, mailboxes: ['ceo'], send: false } } } }, 'pam'), true);
  assert.equal(canCheckEmail({ mailboxes: [mailbox], agentCapabilities: { pam: { email: { enabled: false, mailboxes: ['ceo'], send: false } } } }, 'pam'), false);
  assert.equal(canCheckEmail({ mailboxes: [], agentCapabilities: { pam: { email: { enabled: true, mailboxes: ['ceo'], send: false } } } }, 'pam'), false);
  assert.equal(canCheckEmail({ claudeConnectors: { list }, connectorsOn: { Gmail: true }, agentCapabilities: { pam: { connectors: ['Gmail'] } } }, 'pam'), true);
  assert.equal(canCheckEmail({ claudeConnectors: { list }, connectorsOn: { Gmail: false }, agentCapabilities: { pam: { connectors: ['Gmail'] } } }, 'pam'), false);
  assert.equal(canCheckEmail({ agentCapabilities: {} }, 'pam'), false);
});

test('the note shows only on a mail job that is on, for a team member without email, once config has loaded', () => {
  // Value: protects=the row never cries wolf; fails_when=a paused job, an agent with email, or a not yet loaded config shows the note; why_new=new rule; seam=none
  const noEmail = { mailboxes: [mailbox], agentCapabilities: {} };
  const withEmail = { mailboxes: [mailbox], agentCapabilities: { pam: { email: { enabled: true, mailboxes: ['ceo'], send: false } } } };
  assert.equal(cannotCheckEmailNote(noEmail, 'pam', job()), true);
  assert.equal(cannotCheckEmailNote(noEmail, 'pam', job({ enabled: false })), false);
  assert.equal(cannotCheckEmailNote(withEmail, 'pam', job()), false);
  assert.equal(cannotCheckEmailNote(null, 'pam', job()), false);
});

test('the schedule row shows the note for the job owner, and the text exists in all three languages', () => {
  // Value: protects=the rule is wired into both lists and translated; fails_when=the row stops calling it, names the wrong agent, or a locale is missing the string; why_new=new UI; seam=ScheduleList.tsx and the locale files
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/renderer/src/components/triggers/ScheduleList.tsx'), 'utf8');
  assert.match(src, /cannotCheckEmailNote\(config, ownerOf\(mission, godId\), mission\)/);
  assert.match(src, /schedulesSection\.cannotCheckEmail', \{ name: ownerName \}/);
  for (const lang of ['en', 'ar', 'zh-CN']) {
    const json = JSON.parse(fs.readFileSync(path.join(__dirname, '..', `src/renderer/src/i18n/locales/${lang}.json`), 'utf8'));
    const text = json.schedulesSection.cannotCheckEmail;
    assert.equal(typeof text, 'string', `${lang} is missing schedulesSection.cannotCheckEmail`);
    assert.match(text, /\{\{name\}\}/, `${lang} must name the team member`);
  }
});
