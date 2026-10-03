'use strict';

/**
 * Closing time on the floor (docs/designs/closing-floor.md, owner 2026-10-03):
 * "as the agents are done, remove the name chip and other options to interact
 * with closed agents, as that is what closing really means."
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { stillIn, canOpen, columnAfterGoneHome } = loadTs('src/renderer/src/shell/closingFloor.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

test('a person who has gone home leaves the pod, and opens from nowhere', () => {
  // Value: protects=1A, 2A, 5A; fails_when=a gone-home person stays on the chip, a shared pod waits for everyone, or a gone-home person can still be opened; why_new=new; seam=none
  const pam = { id: 'pam' }; const erin = { id: 'erin' };
  assert.deepEqual(stillIn([pam, erin], new Set(['pam'])), [erin], 'per person');
  assert.deepEqual(stillIn([pam, erin], new Set(['pam', 'erin'])), []);
  assert.deepEqual(stillIn([pam], new Set()), [pam]);
  assert.equal(canOpen('pam', ['pam']), false);
  assert.equal(canOpen('god', ['pam']), true, 'Michael is never in the list (3A)');
});

test('an open panel on someone who goes home closes, to Needs you while anything waits', () => {
  // Value: protects=4A; fails_when=the panel stays open on a gone-home person or opens the board with nothing waiting; why_new=new; seam=none
  assert.equal(columnAfterGoneHome('person', 'pam', ['pam'], true), 'board');
  assert.equal(columnAfterGoneHome('person', 'pam', ['pam'], false), 'closed');
  assert.equal(columnAfterGoneHome('person', 'erin', ['pam'], false), null);
  assert.equal(columnAfterGoneHome('board', 'pam', ['pam'], false), null);
});

test('the store, the stage and the app follow the rule, and Cancel brings everything back', () => {
  // Value: protects=5A 6A 7A 8A wiring; fails_when=select ignores the list, Cancel leaves people gone, the chip stays clickable, or mail tags keep full strength; why_new=new; seam=source pins, the renderer has no DOM harness
  const store = read('src/renderer/src/store/store.ts');
  assert.match(store, /select: \(id\) => set\(\(s\) => \{\n\s*if \(!canOpen\(id, s\.goneHome\)\) return \{\};/);
  assert.match(store, /: s\.selectedId && !canOpen\(s\.selectedId, s\.goneHome\)/);
  const app = read('src/renderer/src/App.tsx');
  assert.match(app, /setGoneHome\(r\.phase === 'cancelled' \? \[\] : \[\.\.\.\(r\.confirmed \?\? \[\]\), \.\.\.\(r\.excused \?\? \[\]\)\]\)/, 'Cancel empties it (7A)');
  assert.match(app, /document\.querySelector<HTMLElement>\('\[data-closing-bar\]'\)\?\.focus/);
  const stage = read('src/renderer/src/scene/studio/StudioStage.tsx');
  assert.match(stage, /const present = stillIn\(pod\.members, closing\?\.out \?\? NOBODY\);/);
  assert.match(stage, /className="cth-st-gone" aria-hidden="true" ref=\{\(el\) => el\?\.setAttribute\('inert', ''\)\}/);
  assert.match(stage, /away: away\.has\(a\.id\) \|\| !!closing\?\.out\.has\(a\.id\)/);
  assert.equal((stage.match(/\|\| \(!!owner && !!closing\?\.out\.has\(owner\.id\)\)/g) ?? []).length, 2, 'post and tag dim (6A)');
  const css = read('src/renderer/src/design/global.css');
  assert.match(css, /\.cth-st-gone \{ pointer-events: none; animation: cth-st-gone 1\.4s var\(--cth-ease\) forwards; \}/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{ \.cth-st-gone \{ animation: none;/);
});
