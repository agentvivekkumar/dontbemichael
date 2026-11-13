'use strict';

/**
 * A file an agent could have placed is never opened through a link, on any
 * platform (src/main/noFollow.ts; PR 695 review, 2026-11-12). POSIX has
 * O_NOFOLLOW; Windows has none, and `O_NOFOLLOW ?? 0` there meant "follow
 * it". The Windows way (a look before and after the open) is forced here by
 * passing no flag, so it runs on every platform that can make a link.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { openNoFollow, openNoFollowAsync, NOFOLLOW } = loadTs('src/main/noFollow.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

/** A folder with a plain file, a secret outside it, and links to both. Null
 *  where this account cannot make links (Windows without Developer Mode). */
function office(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-follow-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const secret = path.join(dir, 'owner-secret.txt');
  fs.writeFileSync(secret, 'secret');
  const plain = path.join(dir, 'plain.json');
  fs.writeFileSync(plain, '{"ok":true}');
  const link = path.join(dir, 'link.json');
  const dangling = path.join(dir, 'dangling.json');
  try {
    fs.symlinkSync(secret, link, 'file');
    fs.symlinkSync(path.join(dir, 'made-through-link.txt'), dangling, 'file');
  } catch (e) {
    if (e.code === 'EPERM') return null;
    throw e;
  }
  return { dir, secret, plain, link, dangling };
}

for (const [way, nofollow] of [['without O_NOFOLLOW (the Windows way)', null], ['with the platform flag', NOFOLLOW]]) {
  if (nofollow === null && way === 'with the platform flag') continue; // Windows: one run is the platform's

  test(`${way}: a plain file opens, a link is refused with ELOOP`, (t) => {
    // Value: protects=a .json link an agent left never makes the app read or write the owner's file; fails_when=the open follows a link, refuses a plain file, or refuses with a code callers do not read as a link; why_new=PR 695 review (Windows had no O_NOFOLLOW); seam=nofollow parameter; no_claim=a real Windows kernel
    const o = office(t);
    if (!o) { t.skip('this account cannot make links'); return; }
    const fd = openNoFollow(o.plain, fs.constants.O_RDONLY, undefined, nofollow);
    assert.equal(fs.readFileSync(fd, 'utf8'), '{"ok":true}');
    fs.closeSync(fd);
    assert.throws(() => openNoFollow(o.link, fs.constants.O_RDONLY, undefined, nofollow), { code: 'ELOOP' });
    assert.throws(() => openNoFollow(o.link, fs.constants.O_WRONLY, undefined, nofollow), { code: 'ELOOP' });
    assert.equal(fs.readFileSync(o.secret, 'utf8'), 'secret', 'the file behind the link is untouched');
  });

  test(`${way}: a create never goes through a dangling link, and a new file is made`, (t) => {
    // Value: protects=an append that makes its file never makes one where an agent's link points; fails_when=O_CREAT follows a dangling link, or refuses a name with nothing there; why_new=PR 695 review; seam=nofollow parameter; no_claim=a real Windows kernel
    const o = office(t);
    if (!o) { t.skip('this account cannot make links'); return; }
    const flags = fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT;
    assert.throws(() => openNoFollow(o.dangling, flags, 0o644, nofollow), { code: 'ELOOP' });
    assert.equal(fs.existsSync(path.join(o.dir, 'made-through-link.txt')), false, 'nothing made where the link points');
    const fresh = path.join(o.dir, 'fresh.jsonl');
    const fd = openNoFollow(fresh, flags, 0o644, nofollow);
    fs.writeSync(fd, 'row\n');
    fs.closeSync(fd);
    assert.equal(fs.readFileSync(fresh, 'utf8'), 'row\n');
    assert.throws(() => openNoFollow(path.join(o.dir, 'nothing.json'), fs.constants.O_RDONLY, undefined, nofollow), { code: 'ENOENT' }, 'a read of nothing is still ENOENT');
  });

  test(`${way}: the promise version refuses a link too`, async (t) => {
    // Value: protects=the file tab and preview reads (openForRead) refuse a link on Windows as on POSIX; fails_when=openNoFollowAsync follows a link or refuses a plain file; why_new=PR 695 review; seam=nofollow parameter; no_claim=a real Windows kernel
    const o = office(t);
    if (!o) { t.skip('this account cannot make links'); return; }
    const fh = await openNoFollowAsync(o.plain, fs.constants.O_RDONLY, undefined, nofollow);
    assert.equal(await fh.readFile('utf8'), '{"ok":true}');
    await fh.close();
    await assert.rejects(openNoFollowAsync(o.link, fs.constants.O_RDONLY, undefined, nofollow), { code: 'ELOOP' });
  });
}

test('every open of a file an agent could place goes through openNoFollow', () => {
  // Value: protects=no open goes back to `O_NOFOLLOW ?? 0`, which follows links on Windows; fails_when=a main process file ORs in O_NOFOLLOW itself or a known site stops using the helper; why_new=PR 695 review; seam=source pins; no_claim=sites added later under other names
  const dir = path.resolve(__dirname, '..', 'src/main');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.ts') && n !== 'noFollow.ts')) {
    assert.doesNotMatch(fs.readFileSync(path.join(dir, f), 'utf8'), /constants\.O_NOFOLLOW/, `${f} uses O_NOFOLLOW directly`);
  }
  for (const [file, count] of [['src/main/messageFile.ts', 1], ['src/main/researchNotes.ts', 1], ['src/main/attachmentSave.ts', 2], ['src/main/hiveFile.ts', 3], ['src/main/hive.ts', 1]]) {
    assert.equal((read(file).match(/openNoFollow\(/g) ?? []).length, count, file);
  }
  assert.match(read('src/main/fs.ts'), /return openNoFollowAsync\(abs, READ_FLAGS\);/);
});
