'use strict';

/**
 * Fixes from the /ship pre-landing review of the v2 Studio redesign
 * (2026-10-01). Each pins the line that carries the behavior.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

test('closing time closes every dialog first, and its bar sits above dialogs', () => {
  // Value: protects=quitting with Settings open shows the closing bar; fails_when=dialogs stop listening or the bar drops below them; why_new=red team found the bar hidden behind modals; seam=none
  const dialog = read('src/renderer/src/shell/useDialog.ts');
  assert.match(dialog, /window\.addEventListener\(CLOSING_TIME_EVENT, onClosingTime\);/);
  assert.match(dialog, /window\.removeEventListener\(CLOSING_TIME_EVENT, onClosingTime\);/);
  assert.match(read('src/renderer/src/components/ClosingTimeBar.tsx'), /zIndex: 550,/);
});

test('the task detail is a real dialog: Esc from a field stays in the field, focus trapped', () => {
  // Value: protects=Esc on the status select does not close the card; fails_when=the detail goes back to its own window keydown; why_new=core review; seam=none
  const k = read('src/renderer/src/components/TasksKanban.tsx');
  assert.match(k, /useDialog\(dialogRef, onClose\);/);
  assert.match(k, /<div ref=\{dialogRef\} tabIndex=\{-1\} role="dialog"/);
  assert.doesNotMatch(k, /if \(e\.key === 'Escape' && !e\.isComposing\) onClose\(\);/);
});

test('the Done column reads newest first, folded or not', () => {
  // Value: protects=order stays the same when "N more" opens; fails_when=the expanded list goes back to file order; why_new=core review; seam=none
  assert.match(read('src/renderer/src/components/TasksKanban.tsx'), /col\.key === 'done' \? \(showAllDone \? \[\.\.\.all\]\.reverse\(\) : all\.slice\(-DONE_SHOWN\)\.reverse\(\)\) : all/);
});

test('a half written note never saves onto the next person', () => {
  // Value: protects=notes land on the right person; fails_when=NoteRow loses its key; why_new=core review; seam=none
  assert.match(read('src/renderer/src/shell/PanelChrome.tsx'), /<NoteRow key=\{agent\.id\} agent=\{agent\} \/>/);
});

test('the compact grid does not run under the right column, and the stage follows the layout switch', () => {
  // Value: protects=every card visible and clickable with 8+ departments; fails_when=the grid host bleeds again or the observer stays on the old host; why_new=red team; seam=none
  const st = read('src/renderer/src/scene/studio/StudioStage.tsx');
  assert.match(st, /<div ref=\{hostRef\} style=\{\{ position: 'absolute', inset: 0 \}\}>/);
  assert.match(st, /\}, \[plan\.compact\]\);/);
});

test('dark mode and focus: readable step numbers and force quit, focus rings on Ask me and the composer', () => {
  // Value: protects=contrast and keyboard focus in dark mode; fails_when=white text returns on ink or coral, or outline none hides focus; why_new=design review; seam=none
  assert.match(read('src/renderer/src/components/OnboardingWizard.tsx'), /color: done \|\| now \? 'var\(--cth-bg\)' : 'var\(--cth-ink-3\)',/);
  assert.match(read('src/renderer/src/components/ClosingTimeBar.tsx'), /background: 'var\(--cth-coral-strong\)', color: 'var\(--cth-on-coral\)'/);
  assert.match(read('src/renderer/src/components/AskMeTab.tsx'), /style=\{\{ flex: 1, minWidth: 0, cursor: 'pointer' \}\}/);
  assert.match(read('src/renderer/src/design/global.css'), /\.cth-composer:focus-within \{ box-shadow: inset 0 0 0 2px var\(--cth-indigo\)/);
  assert.match(read('src/renderer/src/shell/BottomBar.tsx'), /if \(isComposingKey\(e\)\) return;\n\s*if \(e\.key === 'Enter' && !e\.shiftKey\)/, 'IME Enter never sends a half typed message');
});

test('top bar buttons speak the app language; the release notes backdrop needs a full click', () => {
  // Value: protects=screen readers in Arabic and Chinese, and no dismiss on a drag; fails_when=English aria or mousedown dismiss return; why_new=core review; seam=none
  const top = read('src/renderer/src/shell/TopBar.tsx');
  assert.doesNotMatch(top, /aria="(Toggle dark mode|Settings|Toggle focus mode)"/);
  assert.match(top, /aria-label=\{label\}/);
  assert.match(read('src/renderer/src/components/ReleaseDrop.tsx'), /\{\.\.\.backdrop\}/);
});
