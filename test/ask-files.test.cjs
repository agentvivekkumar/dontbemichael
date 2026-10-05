'use strict';

/**
 * Ask me cards open the files a question names (docs/designs/ask-me-open-file.md;
 * owner, 2026-10-04). The path is agent written, so main opens it in the default
 * app only when it is an allowlisted document whose CANONICAL path sits inside
 * the office or a team member's folder; anything else is shown in Finder, and
 * revealing never launches an app bundle.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { askFilePaths, isFileSpan, kindOf, fileTitle, OPEN_EXTENSIONS } = loadTs('src/shared/askFiles.ts');
const { askFileVerdict, askFileRootsFor, resolveAskFileRoots, opensAsFolder } = loadTs('src/main/fs.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

test('only code spans with a known file ending are files; money, emails and domains never are', () => {
  // Value: protects=cards show rows only for real files; fails_when=detection goes back to any dot ending; why_new=37 of 54 spans in a real ledger were not files; seam=none
  for (const s of ['Sales/Weekly summary 2026-09-26.md', 'Draft blog post.md', 'HR/Team list.xlsx', 'notes.TXT', '~/Reports/q3.pdf', 'export.csv', 'data.json', 'Old sheet.xls']) {
    assert.equal(isFileSpan(s), true, s);
  }
  for (const s of ['$1,234.50', '$23.59', '29', 'ops@example.com', 'from:billing@example.com', 'example.com', 'enrichment.ai', 'Example.IT', 'v0.1.0', 'npm run build', '']) {
    assert.equal(isFileSpan(s), false, s);
  }
  const q = '**Review the checklist.** It is `Quality/Cleanup checklist.md`: `29` merges, `$1,687.50` paid, mail `ops@example.com`.\n\n```\ncat `skip.md`\n```\nAgain: `Quality/Cleanup checklist.md` and `Sales/Forecast.xlsx`.';
  assert.deepEqual(askFilePaths(q), ['Quality/Cleanup checklist.md', 'Sales/Forecast.xlsx'], 'in order, each once, nothing from a code fence');
  assert.equal(kindOf('a.MD'), 'markdown');
  assert.equal(kindOf('a.xls'), 'excel');
  assert.equal(kindOf('a.zip'), 'file');
  assert.equal(fileTitle('Quality/Cleanup checklist for owner.md'), 'Cleanup checklist for owner');
  assert.equal(OPEN_EXTENSIONS.has('xls'), false, 'old Excel can carry macros: shown, never opened (eng R2)');
});

test('main opens only allowlisted documents inside the roots, judged on the canonical path', async (t) => {
  // Value: protects=an agent named path opens only a safe document inside the office folders; fails_when=safeResolve, the canonical extension check or the allowlist is dropped; why_new=no code opened agent paths before; seam=none
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'md-askfiles-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const office = path.join(base, 'office');
  const team = path.join(office, 'Marketing');
  const outside = path.join(base, 'outside');
  fs.mkdirSync(team, { recursive: true });
  fs.mkdirSync(outside);
  fs.mkdirSync(path.join(office, 'Tool.app'));
  fs.mkdirSync(path.join(office, 'Folder.pdf'));
  fs.writeFileSync(path.join(office, 'Plan.md'), '# plan');
  fs.writeFileSync(path.join(office, 'Old.xls'), 'x');
  fs.writeFileSync(path.join(office, 'run.command'), 'echo hi');
  fs.writeFileSync(path.join(team, 'Draft blog.md'), 'draft');
  fs.writeFileSync(path.join(outside, 'secret.pdf'), 'x');
  fs.symlinkSync(path.join(office, 'Tool.app'), path.join(office, 'notes.md'));
  fs.symlinkSync(path.join(outside, 'secret.pdf'), path.join(office, 'leak.pdf'));
  fs.symlinkSync(path.join(office, 'gone.md'), path.join(office, 'dangling.md'));
  const roots = [office, team];
  const v = async (p) => (await askFileVerdict(p, roots)).verdict;

  assert.equal(await v('Plan.md'), 'open');
  assert.equal(await v(path.join(office, 'Plan.md')), 'open', 'an absolute path inside the office folder');
  assert.equal(await v('Draft blog.md'), 'open', 'found in the raising team member folder');
  assert.equal((await askFileVerdict('Draft blog.md', roots)).path, path.join(team, 'Draft blog.md'));
  assert.equal(await v('Old.xls'), 'reveal', 'xls is shown, not opened (eng R2)');
  assert.equal(await v('run.command'), 'reveal');
  assert.equal(await v('Tool.app'), 'reveal');
  assert.equal(await v('Folder.pdf'), 'reveal', 'a folder named like a document is not a regular file');
  assert.equal(await v('notes.md'), 'reveal', 'a link named notes.md that lands on an app is judged as the app');
  assert.equal(await v('leak.pdf'), 'missing', 'a link leaving the office folder is neither opened nor shown');
  assert.equal(await v(path.join(outside, 'secret.pdf')), 'missing', 'an absolute path outside every root is neither opened nor shown');
  assert.equal(await v('../outside/secret.pdf'), 'missing', 'a .. escape is neither opened nor shown');
  assert.equal(await v('dangling.md'), 'missing');
  assert.equal(await v('Moved away.md'), 'missing');
  assert.equal(await v('Plan.md\0x'), 'missing');
  assert.equal(await askFileVerdict('Plan.md', []).then((r) => r.verdict), 'missing', 'no roots, nothing opens');
  // An office reached through a link: its real path names the same file.
  const linked = path.join(base, 'office-link');
  fs.symlinkSync(office, linked);
  assert.equal((await askFileVerdict(path.join(office, 'Plan.md'), [linked])).verdict, 'open', 'the real path of a linked office');

  // A card's batch resolves each root once and must judge every path the same way.
  const batch = await resolveAskFileRoots(roots);
  for (const p of ['Plan.md', 'Draft blog.md', 'Old.xls', 'notes.md', 'leak.pdf', '../outside/secret.pdf', 'dangling.md', 'Moved away.md']) {
    assert.deepEqual(await askFileVerdict(p, batch), await askFileVerdict(p, roots), p);
  }
  assert.equal((await askFileVerdict('Plan.md', await resolveAskFileRoots([path.join(base, 'no such folder'), office]))).verdict, 'open', 'a missing root is skipped');
});

test('files are looked for in the office, then the raiser, the assignee and the rest of the team', () => {
  // Value: protects=Open looks in the right folders first and never in Michael's or his assistant's; fails_when=root order, the unknown id filter or the god and assistant rule changes; why_new=roots moved into a pure helper; seam=none
  const agents = {
    michael: { cwd: '/w/hive', isGod: true },
    helper: { cwd: '/w/assistant', isAssistant: true },
    ada: { cwd: '/w/office/Sales' },
    ben: { cwd: '/w/office/Marketing' },
    cy: { cwd: '/w/office/Ops' },
    twin: { cwd: '/w/office/Sales' },
    blank: { cwd: '  ' }
  };
  assert.deepEqual(askFileRootsFor('/w/office', agents, { raisedBy: 'cy', assignee: 'ben' }),
    ['/w/office', '/w/office/Ops', '/w/office/Marketing', '/w/office/Sales'], 'office, raiser, assignee, then the others, each once');
  assert.deepEqual(askFileRootsFor('/w/office', agents, { raisedBy: 'nobody', assignee: 42 }),
    ['/w/office', '/w/office/Sales', '/w/office/Marketing', '/w/office/Ops'], 'unknown ids are dropped');
  assert.deepEqual(askFileRootsFor('/w/office', agents, { raisedBy: 'michael', assignee: 'helper' }),
    ['/w/office', '/w/office/Sales', '/w/office/Marketing', '/w/office/Ops'], 'Michael and his assistant never add a folder');
  assert.deepEqual(askFileRootsFor(undefined, { ada: { cwd: '/w/office' }, ben: { cwd: '/w/office' } }, null), ['/w/office']);
  assert.deepEqual(askFileRootsFor('/w/office', {}, undefined), ['/w/office']);
});

test('revealing a directory never opens an app bundle, and the IPC re-checks before opening', () => {
  // Value: protects=an agent printed Tool.app is shown in Finder, not launched; fails_when=revealPath opens any directory again; why_new=fs:revealPath had no directory rule (eng R4); seam=none
  assert.equal(opensAsFolder('/Users/x/office/Sales'), true);
  assert.equal(opensAsFolder('/Users/x/Downloads/Tool.app'), false);
  assert.equal(opensAsFolder('/Users/x/Report.pages'), false);
  for (const dotted of ['/Users/x/office/acme.com', '/Users/x/office/Q3.2026', '/Users/x/office/v1.2']) assert.equal(opensAsFolder(dotted), true, dotted);
  const main = read('src/main/index.ts');
  assert.match(main, /if \(st\.isFile \|\| !opensAsFolder\(st\.path\)\) \{ shell\.showItemInFolder\(st\.path\); return \{ ok: true \}; \}/);
  // Open runs the check again in main; a document that will not open is shown instead.
  assert.match(main, /ipcMain\.handle\('fs:openAskFile'[\s\S]*?const r = await askFileVerdict\(p, askFileRoots\(who\)\);[\s\S]*?if \(r\.verdict === 'open' && !\(await shell\.openPath\(r\.path\)\)\)[\s\S]*?shell\.showItemInFolder\(r\.path\);/);
  assert.match(main, /function askFileRoots\(who: unknown\): string\[\] \{\n\s+const cfg = readConfig\(\);\n\s+const office = cfg\.businessFolder \?\? legacyBusinessFolder\(cfg\.officeFolder\);\n\s+\/\/ gstack-shortcut\(dec-150d1c26[\s\S]*?return askFileRootsFor\(office, agents, who\);/);
  assert.match(main, /ipcMain\.handle\('fs:askFiles'[\s\S]*?const roots = await resolveAskFileRoots\(askFileRoots\(who\)\);/, 'one realpath per root per card');
});

test('the open card and Task detail show the rows; strings exist in every language', () => {
  const tab = read('src/renderer/src/components/AskMeTab.tsx');
  assert.match(tab, /<MarkdownPreview source=\{open\.q\} variant="card" \/>\n\s+<\/div>\n\s+\{\/\* The files the question names[^\n]*\*\/\}\n\s+<AskFileRows question=\{open\.q\}/, 'between the question and the reply (design D2)');
  const kanban = read('src/renderer/src/components/TasksKanban.tsx');
  assert.match(kanban, /<AskFileRows question=\{e\.q\}[^\n]*verdicts=\{qaFiles\[[^\n]*endRule=\{!isAnswered\(e\)\}/, 'Task detail too (design D8), one check per card, no doubled hairline above an answer');
  assert.match(kanban, /const qaFiles = useAskFileVerdicts\(task\.humanQA, qaAssignee\);/);
  const rows = read('src/renderer/src/components/AskFileRows.tsx');
  assert.match(rows, /variant="secondary" size="sm"/, '28 px target (design D6)');
  assert.match(rows, /\{missing \? \(\n\s+<span[^>]*>\{t\('askMe\.fileNotFound'\)\}<\/span>/, 'Not found is text, not a button (design D3)');
  assert.doesNotMatch(rows, /background: 'var\(--cth-card-2\)'/, 'plain rows, no box in the card (design D5)');
  assert.match(rows, /const win = window\.cth\.platform === 'win32';/, 'Windows says folder, not Finder');
  assert.match(rows, /catch \{\n\s+for \(const p of chunk\) out\[p\] = 'reveal';/, 'a failed check leaves a working button');
  for (const loc of ['en', 'zh-CN', 'ar']) {
    const a = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).askMe;
    for (const k of ['fileFiles', 'fileOpen', 'fileReveal', 'fileRevealWindows', 'fileNotFound']) assert.ok(a[k], `${loc} ${k}`);
    for (const k of ['fileOpenLabel', 'fileRevealLabel', 'fileRevealLabelWindows']) assert.match(a[k], /\{\{name\}\}/, `${loc} ${k}`);
    for (const kind of ['markdown', 'text', 'csv', 'excel', 'word', 'powerpoint', 'pdf', 'image', 'file']) assert.ok(a.fileKind[kind], `${loc} ${kind}`);
    assert.doesNotMatch(JSON.stringify(a), /[–—]/, `${loc}: no dashes`);
  }
});
