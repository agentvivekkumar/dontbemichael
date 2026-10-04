'use strict';

/**
 * Owner, 2026-10-03: "work style and role should not mention the agent's own
 * name. In future if the agent name is changed it may create problems." Pack
 * text names nobody: the agent is "you" or nameless, teammates are their role.
 * Text that still carries a name (an older hire, a teammate's "that goes to
 * <Name>" line) follows a rename.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { renamePatches } = loadTs('src/shared/hireTemplates.ts');
const dir = path.resolve(__dirname, '../resources/packs');

test('no pack card names an agent in its role, Work style, summary, duties or first task', () => {
  // Value: protects=a rename never leaves a stale name in what an agent or Michael reads; fails_when=a card says "Pam runs..." or "route to Kelly"; why_new=owner rule 2026-10-03; seam=none
  const packs = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  const names = new Set();
  for (const p of packs) for (const a of p.agents) { names.add(a.id[0].toUpperCase() + a.id.slice(1)); if (a.character) names.add(a.character); }
  const found = [];
  for (const p of packs) {
    for (const a of p.agents) {
      for (const field of ['role', 'routing', 'workStyle', 'summary', 'does', 'wontDo', 'firstTask']) {
        const text = [].concat(field === 'firstTask' ? [a.firstTask?.title, a.firstTask?.ask].filter(Boolean) : a[field] ?? []).join(' | ');
        for (const n of names) if (new RegExp(`(?<![\\p{L}\\p{N}])${n}(?![\\p{L}\\p{N}])`, 'u').test(text)) found.push(`${p.businessType}/${a.id}.${field}: ${n}`);
      }
    }
  }
  assert.deepEqual(found, []);
});

test('a rename reaches every role line and Work style that still carries the old name', () => {
  // Value: protects=existing offices, hired from older cards, stay right after a rename; fails_when=the renamed agent's own text or a teammate's "that goes to <Name>" keeps the old name, or a word containing it changes; why_new=new; seam=source pin for the store wiring
  const agents = [
    { id: 'pam', description: 'Executive Admin: Pam runs the business inbox.', goal: 'Pam sorts mail. Pamphlets are filed.' },
    { id: 'kelly', description: 'Customer Support: Answers customers. Not for the inbox; that goes to Pam.', goal: 'Answer customers.' },
    { id: 'oscar', description: 'Finance: Keeps the books.' }
  ];
  assert.deepEqual(renamePatches(agents, 'Pam', 'Jan'), [
    { id: 'pam', description: 'Executive Admin: Jan runs the business inbox.', goal: 'Jan sorts mail. Pamphlets are filed.' },
    { id: 'kelly', description: 'Customer Support: Answers customers. Not for the inbox; that goes to Jan.' }
  ]);
  const store = fs.readFileSync(path.resolve(__dirname, '../src/renderer/src/store/store.ts'), 'utf8');
  assert.match(store, /renamePatches\(\[\.\.\.before\.agents, \.\.\.before\.archivedAgents, \.\.\.before\.restorableAgents\], previousName, nextName\)/);
  assert.match(store, /if \(p\.description\) void window\.cth\.hivePatchAgentRole\(p\.id, p\.description\)/);
});
