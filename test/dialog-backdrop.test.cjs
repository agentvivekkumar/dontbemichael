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
  for (const f of ['AddAgentModal', 'EditAgentModal']) {
    const src = read(`src/renderer/src/components/${f}.tsx`);
    assert.match(src, /const backdrop = useBackdropClose\(onClose\);/, f);
    assert.match(src, /\{\.\.\.backdrop\}\n      style=\{\{\n        position: 'fixed', inset: 0,/, f);
  }
});

test('Escape in a field, list or info bubble does not close the hire dialog', () => {
  const src = read('src/renderer/src/components/AddAgentModal.tsx');
  assert.match(src, /if \(e\.key !== 'Escape' \|\| escapeBelongsToField\(e\.target\)\) return;/);
  const { escapeBelongsToField } = loadTs('src/renderer/src/hooks/useBackdropClose.ts');
  const el = (hit) => ({ closest: (sel) => (hit && sel.includes(hit) ? {} : null) });
  assert.equal(escapeBelongsToField(el('textarea')), true);
  assert.equal(escapeBelongsToField(el('select')), true);
  assert.equal(escapeBelongsToField(el('[data-infotip]')), true);
  assert.equal(escapeBelongsToField(el(null)), false);
  assert.equal(escapeBelongsToField(null), false);
  assert.match(read('src/renderer/src/components/InfoTip.tsx'), /data-infotip=""/);
});
