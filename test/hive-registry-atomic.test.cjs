'use strict';

// registry.json is the office's roster. Every write of it must be a new file
// renamed over the old one: a write that dies part way (disk full, crash)
// otherwise leaves a torn file, registry() reads that as an empty roster, and
// the next agent start saves a one-member roster over it. Michael, every
// teammate and their hold/closed flags are gone. Hold, rename and role edits
// wrote it in place.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'hive-reg-atomic-'));
process.env.HOME = base;
process.env.USERPROFILE = base;
const loadTs = require('./load-ts.cjs');
const { HiveManager } = loadTs('src/main/hive.ts');

test.after(() => fs.rmSync(base, { recursive: true, force: true }));

/** A team of three, then `edit` runs while every in-place write of the roster
 *  dies part way, the way a full disk fails a write. */
async function tornDuring(name, edit) {
  const hive = new HiveManager(() => path.join(base, name));
  await hive.ensureAgent({ id: 'god', name: 'Michael', cwd: base, isGod: true });
  await hive.ensureAgent({ id: 'pam', name: 'Pam', cwd: base });
  await hive.ensureAgent({ id: 'jim', name: 'Jim', cwd: base });
  const reg = path.join(hive.root(), 'registry.json');
  const real = fs.writeFileSync;
  fs.writeFileSync = function (p, data, ...rest) {
    if (p === reg) {
      real(p, String(data).slice(0, 120));
      throw Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' });
    }
    return real.call(this, p, data, ...rest);
  };
  try { edit(hive); } finally { fs.writeFileSync = real; }
  return hive;
}

for (const [label, edit] of [
  ['putting Pam on hold', (h) => h.setAgentHold('pam', true)],
  ['renaming Pam', (h) => h.renameAgent('pam', 'Angela')],
  ['editing Pam\'s role', (h) => h.patchAgentRole('pam', 'Office manager')]
]) {
  test(`a write that dies while ${label} keeps the whole roster`, async () => {
    const hive = await tornDuring(label.replace(/\W+/g, '-'), edit);
    const reg = hive.registry();
    assert.equal(reg.godId, 'god');
    assert.deepEqual(Object.keys(reg.agents).sort(), ['god', 'jim', 'pam']);
    // The next start of any agent saves over what it read: still all three.
    await hive.ensureAgent({ id: 'jim', name: 'Jim', cwd: base });
    assert.deepEqual(Object.keys(hive.registry().agents).sort(), ['god', 'jim', 'pam']);
  });
}

test('the roster is never written through in place', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'src/main/hive.ts'), 'utf8');
  assert.doesNotMatch(src, /this\.writeJson\(join\(root, 'registry\.json'\)/);
});
