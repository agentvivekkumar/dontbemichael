'use strict';

/**
 * The pick-your-team step of onboarding (Decisions 44, 47): who starts picked,
 * which folder each agent works in, what needs connecting, and what finish
 * persists. The wizard is a view over these rules.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { OFFICE_KEY, folderNameFor, folderNames, initialPicks, folderFor, michaelFolderFor, connectionsNeeded, teamPlan } =
  loadTs('src/shared/teamPlan.ts');

const agent = (id, over = {}) => ({
  schemaVersion: 1, id, role: id[0].toUpperCase() + id.slice(1), summary: 's',
  does: [], wontDo: [], connections: [], tools: [], ...over
});

const oscar = agent('oscar', { role: 'Finance', folder: 'Finance', connections: [{ id: 'quickbooks', required: false }] });
const pam = agent('pam', { role: 'Admin', folder: 'Admin', connections: [{ id: 'email', required: true }] });
const kelly = agent('kelly', {
  role: 'Customer Care', folder: 'Customers',
  connections: [{ id: 'email', required: true }, { id: 'google-business', required: false }]
});
const creed = agent('creed', { role: 'Quality' }); // no folder: falls back to role
const pack = { agents: [oscar, pam, kelly, creed], defaultPicks: ['oscar', 'pam', 'kelly'] };

const suggestions = {
  root: '/D/Pho',
  office: '/D/Pho/Office',
  byFolder: { Finance: '/D/Pho/Finance', Admin: '/D/Pho/Admin', Customers: '/D/Pho/Customers', Quality: '/D/Pho/Quality' }
};

test('an agent works in its pack folder, or its role when the pack names none', () => {
  assert.equal(folderNameFor(oscar), 'Finance');
  assert.equal(folderNameFor(creed), 'Quality');
  assert.deepEqual(folderNames(pack.agents), ['Finance', 'Admin', 'Customers', 'Quality']);
});

test('agents sharing a folder name ask for it once', () => {
  const twin = agent('ryan', { folder: 'Customers' });
  assert.deepEqual(folderNames([kelly, twin]), ['Customers']);
});

test('the pack\'s default picks start checked, and only those', () => {
  assert.deepEqual(initialPicks(pack), { oscar: true, pam: true, kelly: true, creed: false });
});

test('the owner\'s folder choice wins over the suggestion', () => {
  assert.equal(folderFor(oscar, suggestions, {}), '/D/Pho/Finance');
  assert.equal(folderFor(oscar, suggestions, { oscar: '/Users/me/Dropbox/Books' }), '/Users/me/Dropbox/Books');
});

test('no folder is invented before main has said where folders go', () => {
  assert.equal(folderFor(oscar, undefined, {}), undefined);
});

test('accounts to connect: counted once, and required wins over optional', () => {
  const picked = { oscar: true, pam: true, kelly: true, creed: false };
  assert.deepEqual(connectionsNeeded(pack.agents, picked), {
    required: ['email'],
    optional: ['quickbooks', 'google-business']
  });
});

test('unpicked agents add nothing to connect', () => {
  assert.deepEqual(connectionsNeeded(pack.agents, { creed: true }), { required: [], optional: [] });
});

test('finish persists only picked agents, each with its folder, Office first and deduplicated', () => {
  const plan = teamPlan(pack.agents, { oscar: true, pam: false, kelly: true, creed: true }, suggestions,
    { kelly: '/D/Pho/Finance' }); // owner pointed Kelly at Oscar's folder: they share it
  assert.equal(plan.ok, true);
  assert.equal(plan.office, '/D/Pho/Office');
  assert.deepEqual(plan.team, [
    { agentId: 'oscar', folder: '/D/Pho/Finance' },
    { agentId: 'kelly', folder: '/D/Pho/Finance' },
    { agentId: 'creed', folder: '/D/Pho/Quality' }
  ]);
  assert.deepEqual(plan.folders, ['/D/Pho/Office', '/D/Pho/Finance', '/D/Pho/Quality']);
});

test('picking Michael\'s folder moves the Office and the team\'s default folders with it', () => {
  const picked = { [OFFICE_KEY]: '/Users/me/Dropbox/Pho' };
  // Until main has worked out the defaults under the new folder, nothing is ready.
  assert.equal(teamPlan(pack.agents, { oscar: true }, suggestions, picked).ok, false);
  assert.equal(michaelFolderFor(suggestions, picked), '/Users/me/Dropbox/Pho');
  const moved = {
    root: '/Users/me/Dropbox/Pho',
    office: '/Users/me/Dropbox/Pho/Office',
    byFolder: { Finance: '/Users/me/Dropbox/Pho/Finance', Admin: '/Users/me/Dropbox/Pho/Admin' }
  };
  const plan = teamPlan(pack.agents, { oscar: true }, moved, picked);
  assert.equal(plan.office, '/Users/me/Dropbox/Pho/Office');
  assert.deepEqual(plan.team, [{ agentId: 'oscar', folder: '/Users/me/Dropbox/Pho/Finance' }]);
  // A folder main refused (the home folder, say) never becomes the plan.
  assert.equal(teamPlan(pack.agents, { oscar: true }, { ...moved, rootRefused: true }, picked).ok, false);
});

test('Michael\'s folder is the suggested business folder until the owner picks one', () => {
  assert.equal(michaelFolderFor(suggestions, {}), suggestions.root);
});

test('a team of just Michael is allowed', () => {
  const plan = teamPlan(pack.agents, {}, suggestions, {});
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.team, []);
  assert.deepEqual(plan.folders, ['/D/Pho/Office']);
});

test('not ready until every folder is resolved', () => {
  assert.equal(teamPlan(pack.agents, { oscar: true }, undefined, {}).ok, false);
  const partial = { ...suggestions, byFolder: { Finance: '/D/Pho/Finance' } };
  assert.equal(teamPlan(pack.agents, { oscar: true, pam: true }, partial, {}).ok, false);
});

// ─── Starting a picked team member ───────────────────────────────────────────

const { teamMemberName, teamMemberRole, teamMemberGoal, teamAccent } = loadTs('src/shared/teamPlan.ts');

test('a team member is named after their character', () => {
  assert.equal(teamMemberName({ id: 'oscar', character: 'oscar' }), 'Oscar');
  assert.equal(teamMemberName({ id: 'kelly' }), 'Kelly');
});

test('the role is the job title plus the plain-language summary, so Michael can route by it', () => {
  assert.equal(teamMemberRole({ role: 'Finance', summary: 'Tracks food cost.' }), 'Finance: Tracks food cost.');
});

test('the standing goal carries the whole job description, addressed to the business', () => {
  const goal = teamMemberGoal(
    { role: 'Finance', summary: 'Tracks food cost.', does: ['Watch invoices'], wontDo: ['Move money'], firstAction: 'Send a money summary Monday' },
    { name: 'Pho Saigon Kitchen', city: 'Austin, TX' }
  );
  assert.equal(goal, [
    'You are the Finance for Pho Saigon Kitchen, Austin, TX. Tracks food cost.',
    '',
    'What you do:',
    '• Watch invoices',
    '',
    'Leave these alone and ask the owner first:',
    '• Move money',
    '',
    'Your first job: Send a money summary Monday'
  ].join('\n'));
});

test('a goal still reads well with no business name and no rules', () => {
  const goal = teamMemberGoal({ role: 'Quality', summary: 'Keeps checklists.', does: [], wontDo: [] }, {});
  assert.equal(goal, 'You are the Quality for the business. Keeps checklists.');
});

test('team colours cycle, with Michael\'s lemon last', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(teamAccent), ['mint', 'sky', 'coral', 'lilac', 'peach', 'lemon', 'mint']);
});
