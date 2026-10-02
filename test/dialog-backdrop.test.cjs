'use strict';

/**
 * A text selection that ends past the dialog's edge, or Escape in a field,
 * must not close the hire or edit dialog (owner, 2026-09-27: the dialog closed
 * mid-edit).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

test('the backdrop closes only when the press and the click are both on it', () => {
  const hook = read('src/renderer/src/hooks/useBackdropClose.ts');
  assert.match(hook, /pressedOnBackdrop\.current = e\.target === e\.currentTarget;/);
  assert.match(hook, /const close = pressedOnBackdrop\.current && e\.target === e\.currentTarget;/);
  // Every v2 dialog frame closes through it (shell/Dialog.tsx).
  const frame = read('src/renderer/src/shell/Dialog.tsx');
  assert.match(frame, /const backdrop = useBackdropClose\(close\);/);
  assert.match(frame, /<div \{\.\.\.backdrop\} style=\{\{\n      position: 'fixed', inset: 0,/);
  for (const f of ['AddAgentModal', 'EditAgentModal']) {
    const src = read(`src/renderer/src/components/${f}.tsx`);
    assert.ok(/<Dialog\b/.test(src) || /const backdrop = useBackdropClose\((?:onClose|close)\);/.test(src), f);
  }
});

test('Escape in a field, list or info bubble does not close a dialog', () => {
  assert.match(read('src/renderer/src/shell/useDialog.ts'), /if \(e\.defaultPrevented \|\| escapeBelongsToField\(e\.target\)\) return;/);
  const { escapeBelongsToField } = loadTs('src/renderer/src/hooks/useBackdropClose.ts');
  const el = (hit) => ({ closest: (sel) => (hit && sel.includes(hit) ? {} : null) });
  assert.equal(escapeBelongsToField(el('textarea')), true);
  assert.equal(escapeBelongsToField(el('select')), true);
  assert.equal(escapeBelongsToField(el('[data-infotip]')), true);
  assert.equal(escapeBelongsToField(el(null)), false);
  assert.equal(escapeBelongsToField(null), false);
  assert.match(read('src/renderer/src/components/InfoTip.tsx'), /data-infotip=""/);
});

test('the hire dialog can\'t be closed while Hire runs (pre-landing review)', () => {
  const src = read('src/renderer/src/components/AddAgentModal.tsx');
  assert.match(src, /const close = \(\): void => \{ if \(!submitting\.current\) onClose\(\); \};/);
  assert.match(src, /<Dialog\n      title=\{tr\('addAgent\.title'\)\}\n      onClose=\{close\}/, 'Esc and the backdrop go through close() too');
  assert.match(src, /try \{ await submitHire\(\); \} finally \{ submitting\.current = false; \}/);
});
