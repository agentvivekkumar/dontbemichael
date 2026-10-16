'use strict';

/**
 * Suggested starter jobs in an agent's empty Schedules tab (Decision 5A,
 * docs/designs/per-agent-schedules.md; TODOS, "Starter jobs in an agent's empty
 * Schedules tab"). Up to 3 suggested jobs from the pack card, each added paused
 * so nothing runs autonomously until the owner turns it on.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { parseStarterSchedule, suggestedStarterMissions } = loadTs('src/shared/starterJobs.ts');

const hours = {
  days: ['mon', 'tue', 'wed', 'thu', 'fri'],
  work: { start: '09:00', end: '17:00' }
};

const sampleJobs = [
  { agentId: 'pam', title: 'Inbox to zero', schedule: 'every 2h during office hours', focus: 'Clear the inbox.' },
  { agentId: 'pam', title: 'Follow up on leads', schedule: '18:00 on office days', focus: 'Check inquiries.' },
  { agentId: 'pam', title: 'Draft weekly summary', schedule: 'mon 09:00', focus: 'Prepare draft.' },
  { agentId: 'pam', title: 'Extra routine 4', schedule: 'mon 09:00', focus: 'Extra work.' },
  { agentId: 'oscar', title: 'Weekly money summary', schedule: 'mon 09:00', focus: 'Check numbers.' }
];

test('suggestedStarterMissions returns valid missions with enabled: false', () => {
  const suggestions = suggestedStarterMissions(
    sampleJobs,
    hours,
    'pam',
    'pam-1',
    [],
    'god',
    (i) => `sugg_${i}`
  );

  assert.equal(suggestions.length, 3, 'capped at 3 suggestions (Decision 5A)');
  assert.equal(suggestions[0].label, 'Inbox to zero');
  assert.equal(suggestions[0].enabled, false, 'starter suggestions are always added paused');
  assert.equal(suggestions[0].to, 'pam-1');
  assert.equal(suggestions[0].createdBy, 'owner');
  assert.equal(suggestions[0].focus, 'Clear the inbox.');
  assert.ok(suggestions[0].times && suggestions[0].times.length > 0);

  assert.equal(suggestions[1].label, 'Follow up on leads');
  assert.equal(suggestions[1].enabled, false);
  assert.deepEqual(suggestions[1].weekly, { days: [1, 2, 3, 4, 5], minute: 1080 });

  assert.equal(suggestions[2].label, 'Draft weekly summary');
  assert.equal(suggestions[2].enabled, false);
  assert.deepEqual(suggestions[2].weekly, { days: [1], minute: 540 });
});

test('suggestedStarterMissions excludes jobs the agent already has by label', () => {
  const existing = [
    { id: 'm1', label: 'Inbox to zero', intervalMs: 3600000, to: 'pam-1', enabled: true, createdBy: 'owner' }
  ];

  const suggestions = suggestedStarterMissions(
    sampleJobs,
    hours,
    'pam',
    'pam-1',
    existing,
    'god',
    (i) => `sugg_${i}`
  );

  assert.equal(suggestions.length, 3);
  assert.equal(suggestions[0].label, 'Follow up on leads');
  assert.equal(suggestions[1].label, 'Draft weekly summary');
  assert.equal(suggestions[2].label, 'Extra routine 4');
});

test('suggestedStarterMissions ignores jobs belonging to another agent definition', () => {
  const suggestions = suggestedStarterMissions(
    sampleJobs,
    hours,
    'oscar',
    'oscar-1',
    [],
    'god',
    (i) => `sugg_${i}`
  );

  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].label, 'Weekly money summary');
  assert.equal(suggestions[0].to, 'oscar-1');
  assert.equal(suggestions[0].enabled, false);
});

test('suggestedStarterMissions returns empty array when no pack jobs or hours are provided', () => {
  assert.deepEqual(suggestedStarterMissions(undefined, hours, 'pam', 'pam-1', [], 'god', (i) => `${i}`), []);
  assert.deepEqual(suggestedStarterMissions([], hours, 'pam', 'pam-1', [], 'god', (i) => `${i}`), []);
  assert.deepEqual(suggestedStarterMissions(sampleJobs, undefined, 'pam', 'pam-1', [], 'god', (i) => `${i}`), []);
  assert.deepEqual(suggestedStarterMissions(sampleJobs, hours, 'unknown', 'unk-1', [], 'god', (i) => `${i}`), []);
});
