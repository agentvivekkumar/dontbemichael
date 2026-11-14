'use strict';

/**
 * ⌘-click on a path in terminal output shows it in the file browser. The
 * matcher is the part that actually breaks: agent output is full of version strings and decimals
 * that look like filenames if the extension rule is loose.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const {
  isPathToken, pathTokenMatcher, stripPathToken
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

test('a :line suffix survives matching', () => {
  assert.deepEqual(tokensIn('fails at src/main/updater.ts:165'), ['src/main/updater.ts']);
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
  // the pattern still matches a real path with spaces in its folder names
  // whole; the provider links it whole only once the disk says it is there
  // (linkableTokens, below)
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

test('a quoted match not checked yet links whole with no underline, and names the one file inside it for the click', () => {
  // Value: protects=the first ⌘-click on a real quoted path with a space reveals it, though xterm keeps the row's first answer while the pointer stays (re-review of #687 at 7f6d371f, item 1), and the first hover on "/Users/Jane/Q3 summary.md" never underlines summary.md in the agent's folder (item 5 before it); fails_when=an unknown answer gives no link over the whole match, falls back to the file names inside, names a file when there are two or one with a separator, or stops other matches on the line from linking; why_new=an unchecked match linked nothing, so the first click did nothing; seam=the onDisk callback stands in for the terminal's stat cache
  const { linkableTokens } = loadTs('src/shared/terminalPaths.ts');
  const unknown = () => undefined;
  const realLine = 'saved "/Users/Jane/Q3 summary.md"';
  const real = '"/Users/Jane/Q3 summary.md"';
  assert.deepEqual(linkableTokens(realLine, unknown), [
    { raw: real, index: realLine.indexOf(real), unchecked: true, onlyName: { raw: 'summary.md', index: realLine.indexOf('summary.md') } }
  ], 'the whole match, unchecked, with the one name inside for a miss');
  const prose = 'warn: "/tmp is full, see notes.md" now';
  assert.deepEqual(linkableTokens(prose, unknown), [
    { raw: '"/tmp is full, see notes.md"', index: prose.indexOf('"'), unchecked: true, onlyName: { raw: 'notes.md', index: prose.indexOf('notes.md') } }
  ], 'quoted prose links on the first click too');
  assert.deepEqual(linkableTokens('note: "/tmp has a.md and b.md"', unknown).map((t) => [t.unchecked, t.onlyName]), [[true, undefined]], 'two names inside: none is guessed');
  assert.deepEqual(linkableTokens('Writing "/Users/Jane/Q3 Reports/summary.md"', unknown).map((t) => [t.unchecked, t.onlyName]), [[true, undefined]], 'a piece with a separator is never named');

  const line = 'open src/a.ts, "/Users/Jane/Q3 summary.md" and "/tmp/x.md"';
  assert.deepEqual(linkableTokens(line, unknown).map((t) => [t.raw, !!t.unchecked]), [['src/a.ts', false], [real, true], ['"/tmp/x.md"', false]], 'other matches on the line link as before');

  // Once the check is back, the same line links by the answer, underlined.
  assert.deepEqual(linkableTokens(realLine, () => true), [{ raw: real, index: realLine.indexOf(real) }]);
  assert.deepEqual(linkableTokens(prose, () => false).map((t) => t.raw), ['notes.md']);
});

test('the terminal gives an unchecked match no underline and looks at the disk on click', () => {
  // Value: protects=the provider wires the unchecked token to a click time look instead of dropping it (re-review of #687 at 7f6d371f, item 1); fails_when=an unchecked token is underlined, skipped, or its click reveals without asking the disk; why_new=the provider skipped unchecked tokens; seam=source pin, since the provider needs a live xterm
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'src/renderer/src/components/terminalPool.ts'), 'utf8');
  assert.match(src, /decorations: \{ underline: !unchecked, pointerCursor: !unchecked \}/);
  assert.match(src, /if \(unchecked\) \{ void activateUnchecked\(abs, nameAbs\); return; \}/);
  const fn = src.slice(src.indexOf('async function activateUnchecked'), src.indexOf('function quotedKnownOnDisk'));
  assert.match(fn, /await pathStats\.lookForClick\(abs\)/);
  assert.match(fn, /if \(res && nameAbs\) await activatePath\(nameAbs\)/, 'the name is tried only on a definite miss');
  assert.match(fn, /void window\.cth\.revealPath\(res\.path\)/, 'the whole path is only revealed');
  assert.doesNotMatch(fn, /openPath|openExternal|openFile|openAskFile/);
});

test('quoted versions and prose do not become file paths', () => {
  assert.deepEqual(tokensIn('version "v0.4.5", cost \'0.92\', called `spring.thaw`'), []);
});

test('a dotted directory name cannot masquerade as an extension', () => {
  // extensionOf looks at the LAST segment only, so v1.2 here is not the extension.
  assert.deepEqual(tokensIn('see reports/v1.2/summary.md'), ['reports/v1.2/summary.md']);
});

test('case does not decide whether a bare name is a path', () => {
  assert.equal(isPathToken('README.MD'), true);
  assert.equal(isPathToken('App.TSX'), true);
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

test('a dotfile is named by its type: .gitignore, .env and .npmrc are paths alone', () => {
  // Value: protects=a bare known dotfile links without a separator; fails_when=the dotfile rule is dropped or extensionOf's no-extension answer wins; why_new=gitignore, dockerignore, env and npmrc never matched a real dotfile; seam=none; no_claim=a long dotfile name as a token, which waits on the longer extension fix (#190)
  for (const p of ['.gitignore', '.dockerignore', '.env', '.npmrc', '.editorconfig']) {
    assert.equal(isPathToken(p), true, p);
  }
  assert.deepEqual(tokensIn('wrote ./.env and ~/.npmrc'), ['./.env', '~/.npmrc']);
  // A bare dotfile that is not on the list needs a separator, and a name with
  // a real extension after the dot keeps it.
  assert.equal(isPathToken('.bashrc'), false);
  assert.equal(isPathToken('~/.bashrc'), true);
  assert.equal(isPathToken('.env.local'), false);
  assert.equal(isPathToken('.eslintrc.json'), true);
});

test('extensions longer than 8 characters match without truncation', () => {
  // Bare properties file (10-char extension in KNOWN_EXTS)
  assert.deepEqual(tokensIn('check application.properties for db config'), ['application.properties']);

  // Quoted path containing spaces and explicit path prefix
  assert.deepEqual(tokensIn('saved "./My Docs/app.properties" in project'), ['./My Docs/app.properties']);

  // Windows path with long extension
  assert.deepEqual(tokensIn('configured C:\\proj\\settings.properties successfully'), ['C:\\proj\\settings.properties']);

  // Existing short extensions and version-like strings behave correctly
  assert.deepEqual(tokensIn('built src/index.ts in v0.4.5 after 1.5 hours'), ['src/index.ts']);
});
