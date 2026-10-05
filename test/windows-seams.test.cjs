'use strict';
// Platform seams on Windows (docs/designs/windows-11-installer.md, item 3): the
// one Mac only launcher gets a Windows path, and the five seams that already
// branch for Windows keep doing so.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const { terminalLaunches } = loadTs('src/main/terminalAtFolder.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

test('a terminal opens at a folder on Windows: Windows Terminal, else cmd, never with a quoted injection', () => {
  // Value: protects=Open in terminal works on Windows and cannot run a crafted command; fails_when=the Windows branch is dropped, cmd args lose verbatim quoting, or a quote, ';' or '%' passes; why_new=open -a Terminal was Mac only; seam=none
  const cwd = 'C:\\Users\\José García\\My Office';
  assert.deepEqual(terminalLaunches('win32', cwd, 'C:\\Windows\\system32\\cmd.exe'), [
    { file: 'wt.exe', args: ['-d', cwd] },
    { file: 'C:\\Windows\\system32\\cmd.exe', args: [`/c start "" /D "${cwd}" cmd`], windowsVerbatimArguments: true }
  ]);
  assert.deepEqual(terminalLaunches('darwin', '/Users/x/Office'), [{ file: 'open', args: ['-a', 'Terminal', '/Users/x/Office'] }]);
  assert.deepEqual(terminalLaunches('win32', 'C:\\x" & calc & "'), { error: 'invalid cwd' });
  assert.deepEqual(terminalLaunches('win32', 'C:\\x\nnext'), { error: 'invalid cwd' });
  // Windows Terminal reads ';' as a new command; cmd expands %VAR% inside quotes.
  for (const bad of ['C:\\x; new-tab calc', 'C:\\%COMSPEC%', 'C:\\x^&calc', 'C:\\x!PATH!']) {
    assert.deepEqual(terminalLaunches('win32', bad), { error: 'invalid cwd' }, bad);
  }
  assert.deepEqual(terminalLaunches('darwin', '/Users/x/50% done; final'), [{ file: 'open', args: ['-a', 'Terminal', '/Users/x/50% done; final'] }], 'only Windows refuses them');
  assert.ok('error' in terminalLaunches('linux', '/home/x'));
  const main = read('src/main/index.ts');
  assert.match(main, /if \(!statSync\(cwd\)\.isDirectory\(\)\) return \{ ok: false, error: 'not a folder' \}/, 'only an existing folder reaches a launcher');
  assert.match(main, /if \(r\.ok \|\| !r\.missing\) return/, 'a missing launcher falls through to the next');
});

test('the five already branched seams keep their Windows paths', async () => {
  // Value: protects=Windows keeps working where it already did; fails_when=a refactor drops a win32 branch; why_new=CEO review audit (spec review corrected); seam=none
  const procKill = read('src/main/procKill.ts');
  assert.match(procKill, /if \(process\.platform === 'win32'\) \{\n\s+const t = setTimeout\(\(\) => hardKillTree\(pid\), graceMs\);/, 'kill uses taskkill on Windows, never ps');
  assert.match(procKill, /taskkill/);
  assert.match(read('src/main/memory.ts'), /spawnSync\('where', \['mempalace'\]/, 'mempalace lookup uses where on Windows');
  assert.match(read('src/main/docText.ts'), /if \(process\.platform !== 'darwin'\) \{\n\s+return \{\n\s+kind: 'unreadable',\n\s+reason: `\.\$\{ext\} files can only be read on a Mac for now/);
  const { macOcr } = loadTs('src/main/macOcr.ts');
  const real = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'win32' });
  try {
    assert.deepEqual(await macOcr('C:\\x.png', 'image'), { ok: false, reason: 'unsupported' });
  } finally {
    Object.defineProperty(process, 'platform', real);
  }
  const hive = read('src/main/hive.ts');
  assert.match(hive, /const command = \(event: string\) => process\.platform === 'win32'\n\s+\? this\.nodeRunUnquoted\(shim, event\)/, 'hook commands run the shim through node on Windows');
});
