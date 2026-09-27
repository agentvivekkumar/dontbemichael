'use strict';

/**
 * Office open (src/shared/officeOpen.ts, owner 2026-09-26): after Closing Time,
 * the next launch tells every agent the office is open again, so a resumed
 * agent stops holding its work. Seen live: Pam held every "Check Emails" run.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { officeClosedInLog, officeOpenBody, OFFICE_OPEN_SUBJECT } = loadTs('src/shared/officeOpen.ts');
const read = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
const msg = (subject, over = {}) => ({ kind: 'message', subject, from: 'god', to: 'pam', ...over });

test('closed after a closing time with no opening since; open once told', () => {
  // The live sequence from 2026-09-26: brief, Michael's broadcast, acks, complete, relaunch.
  const night = [
    msg('Closing time: close the office now', { from: 'human', to: 'god' }),
    msg('Closing time', { to: 'broadcast' }),
    msg('CLOSING-TIME-ACK', { from: 'pam', to: 'michael' }),
    msg('CLOSING-TIME-COMPLETE', { to: 'human' }),
    { kind: 'app-start' },
    msg('Check Emails', { from: 'scheduler' }),
    msg('Email check held until opening', { from: 'pam', to: 'michael' })
  ];
  assert.equal(officeClosedInLog(night), true);
  assert.equal(officeClosedInLog([...night, msg(OFFICE_OPEN_SUBJECT, { from: 'human' })]), false);
  assert.equal(officeClosedInLog([...night, msg('Closing time cancelled', { from: 'human', to: 'broadcast' })]), false);
  assert.equal(officeClosedInLog([msg('Check Emails')]), false, 'never closed');
  assert.equal(officeClosedInLog([msg('Closing time: still waiting on the team', { to: 'god' })]), false, 'a reminder is not a closing');
});

test('the message says to carry on and do what was held, and asks for no reply', () => {
  const body = officeOpenBody();
  assert.match(body, /open again/);
  assert.match(body, /If you held anything because of closing time, do it now/);
  assert.match(body, /Do not reply/);
  assert.doesNotMatch(body, /[–—]/, 'no dashes in agent text');
});

test('each agent is told as it starts, once per launch; a cancel tells everyone', () => {
  const main = read('src/main/index.ts');
  assert.match(main, /if \(res\.ok && opts\.hive\?\.id\) tellOfficeOpen\(opts\.hive\.id\);/);
  assert.match(main, /officeClosedAtLaunch = officeClosedInLog\(hive\.logTail\(5000\)\)/);
  assert.match(main, /toldOfficeOpen\.has\(agentId\)/);
  assert.match(read('src/main/closingTime.ts'), /to: 'broadcast',\s*act: 'inform',\s*subject: 'Closing time cancelled'/);
});
