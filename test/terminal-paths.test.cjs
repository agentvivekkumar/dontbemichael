'use strict';

/**
 * ⌘-click on a path in terminal output. Two jobs, and the matcher is the one
 * that actually breaks: agent output is full of version strings and decimals
 * that look like filenames if the extension rule is loose.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const {
  classifyPathToken, isPathToken, pathTokenMatcher, stripPathToken
} = loadTs('src/shared/terminalPaths.ts');

/** Every token the pattern matches on one line of output. For a quoted match
 *  with a space inside, the provider also asks whether the whole is on disk
 *  first; linkableTokens (tested below with a stub) covers that step. */
function tokensIn(line) {
  const re = pathTokenMatcher();
  const out = [];
  let m;
  while ((m = re.exec(line)) !== null) {
    const p = stripPathToken(m[0]);
    if (isPathToken(p)) out.push(p);
  }
  return out;
}

/* ---------------------------------------------------------------- *
 * classification
 * ---------------------------------------------------------------- */

test('markdown previews, source edits — the v0.3.4 behaviour is unchanged', () => {
  assert.equal(classifyPathToken('RELEASE.md'), 'preview');
  assert.equal(classifyPathToken('docs/drops/v0.4.5.markdown'), 'preview');
  assert.equal(classifyPathToken('src/main/updater.ts'), 'edit');
  assert.equal(classifyPathToken('tools/copy-main-assets.cjs'), 'edit');
  assert.equal(classifyPathToken('electron-builder.yml'), 'edit');
  assert.equal(classifyPathToken('.github/workflows/release.yml'), 'edit');
});

test('images reveal rather than open — a click on a path is a navigation gesture', () => {
  for (const p of ['build/icon.png', 'shot.JPEG', 'a/b/logo.svg', 'anim.webp']) {
    assert.equal(classifyPathToken(p), 'reveal', p);
  }
});

test('anything we cannot honestly render reveals instead of guessing', () => {
  for (const p of ['report.pdf', 'dump.bin', 'archive.zip', 'db.sqlite', 'font.woff2']) {
    assert.equal(classifyPathToken(p), 'reveal', p);
  }
});

test('an executable never classifies as anything but reveal', () => {
  // The whole safety argument: reveal opens a file browser, it never launches.
  for (const p of ['installer.dmg', 'Payload.app', 'setup.exe', 'run.desktop']) {
    assert.equal(classifyPathToken(p), 'reveal', p);
  }
});

/* ---------------------------------------------------------------- *
 * matching — the part that goes wrong
 * ---------------------------------------------------------------- */

test('version strings and decimals are not files', () => {
  assert.deepEqual(tokensIn('bumped to v0.4.5 after 1.5 hours, cost $0.92'), []);
  assert.deepEqual(tokensIn('electron 43.0 and vite 7.1.2'), []);
});

test('a bare unknown extension needs a separator to count as a path', () => {
  // No separator and an extension we do not know: could be prose. Left alone.
  assert.deepEqual(tokensIn('the release is codenamed spring.thaw'), []);
  // Same extension, now unambiguously a path.
  assert.deepEqual(tokensIn('wrote out/spring.thaw'), ['out/spring.thaw']);
});

test('a known extension is a path with or without a separator', () => {
  assert.deepEqual(tokensIn('see RELEASE.md'), ['RELEASE.md']);
  assert.deepEqual(tokensIn('edited package.json'), ['package.json']);
});

test('several tokens on one line all resolve independently', () => {
  assert.deepEqual(
    tokensIn('moved src/main/updater.ts and build/icon.png, see RELEASE.md'),
    ['src/main/updater.ts', 'build/icon.png', 'RELEASE.md']
  );
});

test('shell and prose wrapping comes off, and so does :line', () => {
  assert.equal(stripPathToken('`src/main/index.ts`'), 'src/main/index.ts');
  assert.equal(stripPathToken('"docs/a.md",'), 'docs/a.md');
  assert.equal(stripPathToken('(build/icon.png)'), 'build/icon.png');
  assert.equal(stripPathToken('src/main/updater.ts:165'), 'src/main/updater.ts');
});

test('a :line suffix survives matching and still classifies by extension', () => {
  assert.deepEqual(tokensIn('fails at src/main/updater.ts:165'), ['src/main/updater.ts']);
  assert.equal(classifyPathToken('src/main/updater.ts'), 'edit');
});

test('absolute, home, and Windows paths are all recognised', () => {
  assert.deepEqual(tokensIn('at /Users/x/notes.md'), ['/Users/x/notes.md']);
  assert.deepEqual(tokensIn('at ~/HarnessAgents/board.md'), ['~/HarnessAgents/board.md']);
  assert.deepEqual(tokensIn('at C:\\Users\\x\\a.ts'), ['C:\\Users\\x\\a.ts']);
});

test('quoted paths with spaces keep their entire path, including the Windows drive', () => {
  assert.deepEqual(
    tokensIn('saved "C:\\Users\\Jane\\Business Reports\\summary.md"'),
    ['C:\\Users\\Jane\\Business Reports\\summary.md']
  );
  assert.deepEqual(tokensIn("saved '/Users/Jane/Business Reports/summary.md'"), ['/Users/Jane/Business Reports/summary.md']);
  assert.deepEqual(tokensIn('saved `~/Business Reports/summary.md`'), ['~/Business Reports/summary.md']);
  assert.deepEqual(tokensIn('saved "./Business Reports/summary.md"'), ['./Business Reports/summary.md']);
  assert.deepEqual(tokensIn('saved "../Business Reports/summary.md"'), ['../Business Reports/summary.md']);
  assert.deepEqual(tokensIn('saved "\\Business Reports\\summary.md"'), ['\\Business Reports\\summary.md']);
});

test('quoted paths coexist with unquoted paths and preserve line suffix handling', () => {
  assert.deepEqual(
    tokensIn('see "./src/my folder/index.ts:42", build/icon.png and \'./docs/my notes.md\''),
    ['./src/my folder/index.ts', 'build/icon.png', './docs/my notes.md']
  );
});

test('quoted prose keeps linking the file name inside it', () => {
  assert.deepEqual(tokensIn('git commit -m "Update README.md"'), ['README.md']);
  assert.deepEqual(tokensIn('error: "Could not read config.yml"'), ['config.yml']);
  assert.deepEqual(tokensIn("Michael's notes: see plan.md' later"), ['plan.md']);
});

test('quoted prose that starts with a slash links only the file name inside it', () => {
  assert.deepEqual(tokensIn('note: "/ see notes.md"'), ['notes.md']);
  assert.deepEqual(tokensIn("note: '/ see notes.md'"), ['notes.md']);
  assert.deepEqual(tokensIn('note: `./ then open plan.md`'), ['plan.md']);
  // a real path with spaces inside its folder names still links whole
  assert.deepEqual(tokensIn('saved "/Users/Jane/Business Reports/summary.md"'), ['/Users/Jane/Business Reports/summary.md']);
});

test('quoted prose that starts with a folder links the file name inside it when the whole is not on disk', () => {
  // Value: protects=a ⌘-click on "/tmp is full, see notes.md" finds notes.md, not a path that leads nowhere (TODOS, terminal links); fails_when=the whole phrase is underlined though it is not known on disk, a real spaced path stops linking whole, or a path with no space is asked about; why_new=review of #436; seam=the onDisk callback stands in for the terminal's stat cache
  const { linkableTokens, quotedNeedsCheck } = loadTs('src/shared/terminalPaths.ts');
  const asked = [];
  const disk = (onDisk) => (raw) => { asked.push(raw); return onDisk.includes(raw); };
  const prose = 'warn: "/tmp is full, see notes.md" now';
  assert.deepEqual(linkableTokens(prose, disk([])), [{ raw: 'notes.md', index: prose.indexOf('notes.md') }], 'the file name, at its own offset');
  assert.deepEqual(asked, ['"/tmp is full, see notes.md"'], 'the disk is asked about the quoted whole');

  const real = 'saved "/Users/Jane/Business Reports/summary.md"';
  const whole = '"/Users/Jane/Business Reports/summary.md"';
  assert.deepEqual(linkableTokens(real, disk([whole])), [{ raw: whole, index: real.indexOf(whole) }], 'a real path with spaces links whole');

  asked.length = 0;
  const plain = 'open "/tmp/report.md" and src/main/a.ts';
  assert.deepEqual(linkableTokens(plain, disk([])).map((t) => t.raw), ['"/tmp/report.md"', 'src/main/a.ts'], 'no space, no question');
  assert.deepEqual(asked, [], 'a quoted path with no space is never asked about');

  const failing = () => { throw new Error('ipc gone'); };
  assert.deepEqual(linkableTokens(prose, failing).map((t) => t.raw), ['notes.md'], 'a failed check counts as not on disk');

  assert.equal(quotedNeedsCheck('"/a b/c.md"'), true);
  assert.equal(quotedNeedsCheck('"/a/c.md"'), false);
  assert.equal(quotedNeedsCheck('a b.md'), false, 'unquoted');
});

test('the fallback links only bare file names, and each quoted match is judged on its own', () => {
  // Value: protects=a ⌘-click never opens a different file than the one printed (review of #687); fails_when=a piece with a separator falls back and is joined to the agent's folder, or two quoted matches on one line mix up their answers or offsets; why_new=review of #687; seam=the onDisk callback stands in for the terminal's stat cache
  const { linkableTokens } = loadTs('src/shared/terminalPaths.ts');
  const none = () => false;
  // Printed before the file exists: "Reports/summary.md" in the agent's folder may be another, older file.
  assert.deepEqual(linkableTokens('Writing "/Users/Jane/Office/Q3 Reports/summary.md"', none), [], 'a piece with a slash does not fall back');
  assert.deepEqual(linkableTokens('Writing "C:\\Users\\Jane\\My Docs\\a.md"', none), [], 'a piece with a backslash does not fall back');
  assert.deepEqual(linkableTokens('note: "/tmp is full, nothing to see here"', none), [], 'a quoted body with no file name links nothing');

  const line = 'saved "/srv/My Office/plan.md" then "/tmp is full, see notes.md"';
  const first = '"/srv/My Office/plan.md"';
  const got = linkableTokens(line, (raw) => raw === first);
  assert.deepEqual(got, [
    { raw: first, index: line.indexOf(first) },
    { raw: 'notes.md', index: line.indexOf('notes.md') }
  ], 'one on disk links whole, the other falls back, in line order at their own offsets');

  for (const q of ["'", '`']) {
    const text = `warn: ${q}/tmp is full, see notes.md${q} now`;
    assert.deepEqual(linkableTokens(text, none), [{ raw: 'notes.md', index: text.indexOf('notes.md') }], `${q} quotes fall back too`);
    const realQ = `saved ${q}/srv/My Office/plan.md${q}`;
    assert.deepEqual(linkableTokens(realQ, () => true).map((t) => t.raw), [`${q}/srv/My Office/plan.md${q}`], `${q} quotes link whole when on disk`);
  }
});

test('a network path is never stat\'ed: not on hover, not on click', async () => {
  // Value: protects=hovering or clicking a printed share path never reaches another machine (review of #687: SMB and NTLM on Windows, autofs on macOS); fails_when=a UNC, device or /net path is treated as local, a local path is refused, or main's statAbs stats one; why_new=review of #687; seam=none
  const { isNetworkPath } = loadTs('src/shared/terminalPaths.ts');
  for (const p of ['//some-host/share/My Docs/a.md', '\\\\some-host\\share\\a.md', '\\\\?\\UNC\\host\\share\\a.md', '\\\\.\\pipe\\x',
    '\\/host/share/a.md', '/net/some-host/x/a b.md', '/Network/Servers/host/a.md', '/NET/host/a.md', '  //host/a.md']) {
    assert.equal(isNetworkPath(p), true, `${p} names another machine`);
  }
  for (const p of ['/Users/Jane/a.md', '/tmp/a b.md', 'C:\\Users\\Jane\\a.md', 'C:/Users/a.md', '/netflix/a.md', '/networks/a.md', 'notes.md', '~/a.md', '']) {
    assert.equal(isNetworkPath(p), false, `${p} is local`);
  }
  const { statAbs } = loadTs('src/main/fs.ts');
  for (const p of ['//some-host/share/a.md', '\\\\some-host\\share\\a.md', '/net/some-host/a.md']) {
    assert.deepEqual(await statAbs(p), { exists: false, isFile: false, path: '' }, `main refuses ${p} without a stat`);
  }
  const here = await statAbs(__filename);
  assert.equal(here.exists, true, 'a local file is still stat\'ed');
});

test('quoted versions and prose do not become file paths', () => {
  assert.deepEqual(tokensIn('version "v0.4.5", cost \'0.92\', called `spring.thaw`'), []);
});

test('a dotted directory name cannot masquerade as an extension', () => {
  // extensionOf looks at the LAST segment only, so v1.2 here is not the extension.
  assert.equal(classifyPathToken('reports/v1.2/summary.md'), 'preview');
});

test('case does not decide the verdict', () => {
  assert.equal(classifyPathToken('README.MD'), 'preview');
  assert.equal(classifyPathToken('src/App.TSX'), 'edit');
});

test('a link covers the cells of its path, past wide characters and inside its quotes', () => {
  // Value: protects=the underline and click land on the path when the line holds Chinese text or quotes; fails_when=string offsets are used as cell columns or the quotes are underlined; why_new=design review of #280; seam=none
  const { linkCellRange } = loadTs('src/shared/terminalPaths.ts');
  const cellsFor = (s) => [...s].flatMap((ch) => (/[一-鿿]/.test(ch) ? [{ chars: ch, width: 2 }, { chars: '', width: 0 }] : [{ chars: ch, width: 1 }]));
  const line = '报告 "/tmp/a b.md"';
  const raw = '"/tmp/a b.md"';
  const start = line.indexOf(raw);
  assert.deepEqual(linkCellRange(cellsFor(line), start, start + raw.length, raw), { startX: 7, endX: 17 });
  const plain = 'see notes.md';
  assert.deepEqual(linkCellRange(cellsFor(plain), 4, 12, 'notes.md'), { startX: 5, endX: 12 });
});

test('a dotfile is named by its type: .gitignore, .env and .npmrc open as text', () => {
  // Value: protects=dotfiles on the edit list open for editing instead of revealing; fails_when=the dotfile rule is dropped or extensionOf's no-extension answer wins; why_new=gitignore, dockerignore, env and npmrc never matched a real dotfile; seam=none; no_claim=a long dotfile name as a token, which waits on the longer extension fix (#190)
  for (const p of ['.gitignore', 'src/.dockerignore', './.env', '~/.npmrc', 'C:\\proj\\.editorconfig']) {
    assert.equal(classifyPathToken(p), 'edit', p);
  }
  assert.deepEqual(tokensIn('wrote ./.env and ~/.npmrc'), ['./.env', '~/.npmrc']);
  // A dotfile that is not on a list is still only revealed, and a name with a
  // real extension after the dot keeps it.
  assert.equal(classifyPathToken('~/.bashrc'), 'reveal');
  assert.equal(classifyPathToken('.env.local'), 'reveal');
  assert.equal(classifyPathToken('src/.eslintrc.json'), 'edit');
});

test('extensions longer than 8 characters match without truncation and classify correctly', () => {
  // Bare properties file (10-char extension in EDIT_EXTS)
  assert.deepEqual(tokensIn('check application.properties for db config'), ['application.properties']);
  assert.equal(classifyPathToken('application.properties'), 'edit');

  // Quoted path containing spaces and explicit path prefix
  assert.deepEqual(tokensIn('saved "./My Docs/app.properties" in project'), ['./My Docs/app.properties']);
  assert.equal(classifyPathToken('./My Docs/app.properties'), 'edit');

  // Windows path with long extension
  assert.deepEqual(tokensIn('configured C:\\proj\\settings.properties successfully'), ['C:\\proj\\settings.properties']);
  assert.equal(classifyPathToken('C:\\proj\\settings.properties'), 'edit');

  // Existing short extensions and version-like strings behave correctly
  assert.deepEqual(tokensIn('built src/index.ts in v0.4.5 after 1.5 hours'), ['src/index.ts']);
  assert.equal(classifyPathToken('src/index.ts'), 'edit');
});
