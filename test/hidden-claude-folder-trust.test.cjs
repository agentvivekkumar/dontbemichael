'use strict';

// A hidden Claude session starts in a folder marked trusted (issue 712): Claude
// Code 2.1.323 asks "trust this folder?" with "No, exit" chosen, so in an
// office folder no one had opened Claude in, the Enter that sends the prompt
// quit it before it wrote anything, and every job change failed as "no
// assistant response" (12 reports from 0.4.0). Runs a fake `claude` in a real
// PTY that asks that question unless ~/.claude.json trusts its folder.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const POSIX = process.platform !== 'win32';
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hidden-trust-home-'));
process.env.HOME = home;
test.after(() => fs.rmSync(home, { recursive: true, force: true }));

const H = loadTs('src/main/hiddenClaude.ts');
const { projectDir } = loadTs('src/main/transcript.ts');

const FAKE = `
const fs = require('fs');
const path = require('path');
const id = process.argv[process.argv.indexOf('--session-id') + 1];
let trusted = false;
try { trusted = JSON.parse(fs.readFileSync(path.join(process.env.HOME, '.claude.json'), 'utf8')).projects[process.cwd()].hasTrustDialogAccepted === true; } catch {}
const line = (type, text) => JSON.stringify({ type, message: { content: [{ type: 'text', text }] } }) + '\\n';
// Words drawn with cursor moves, as Claude Code draws them.
process.stdout.write(trusted ? '> ' : 'Quick\\x1b[1Csafety\\x1b[1Ccheck\\n\\u276f No,\\x1b[1Cexit\\n  Yes,\\x1b[1CI\\x1b[1Ctrust\\x1b[1Cthis\\x1b[1Cfolder\\n');
process.stdin.on('data', (d) => {
  if (!/[\\r\\n]/.test(String(d))) return;
  if (!trusted) process.exit(1);
  fs.mkdirSync(process.env.FAKE_DIR, { recursive: true });
  const file = path.join(process.env.FAKE_DIR, id + '.jsonl');
  fs.writeFileSync(file, line('user', 'check'));
  setTimeout(() => fs.appendFileSync(file, line('assistant', 'DONE')), 100);
});
`;

function fakeClaude() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hidden-trust-bin-'));
  fs.writeFileSync(path.join(dir, 'fake.cjs'), FAKE);
  const bin = path.join(dir, 'claude');
  fs.writeFileSync(bin, `#!/bin/sh\nexec "${process.execPath}" "${path.join(dir, 'fake.cjs')}" "$@"\n`, { mode: 0o755 });
  const cwd = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'hidden-trust-cwd-')));
  return { bin, cwd };
}

const opts = (bin, cwd) => ({ model: 'claude-sonnet-5', cwd, command: bin, noTools: true, env: { FAKE_DIR: projectDir(cwd) }, bootCapMs: 2000, timeoutMs: 20_000, promptTakenMs: 8000 });

test('a trust question ends a session in a folder nothing trusted, and the result names it', { skip: !POSIX }, async () => {
  // Value: protects=the next report like issue 712 names the question Claude quit on, and a trusted folder runs; fails_when=an ended session no longer says trust-folder, or trust in ~/.claude.json is not what lets it run; why_new=issue 712, 12 reports from 0.4.0; seam=fake claude in a real PTY; no_claim=that real Claude Code reads hasTrustDialogAccepted under these keys (verified live with 2.1.323: the question defaults to No, exit)
  const { bin, cwd } = fakeClaude();
  fs.rmSync(path.join(home, '.claude.json'), { force: true });
  assert.deepEqual(await H.runHiddenClaude('Say done.', opts(bin, cwd)), { ok: false, error: 'no assistant response found in transcript', exitCause: 'trust-folder' });
  fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ projects: { [cwd]: { hasTrustDialogAccepted: true } } }));
  assert.deepEqual(await H.runHiddenClaude('Say done.', opts(bin, cwd)), { ok: true, text: 'DONE' });
});

test('job and memory checks run isolated in the app\'s own folder, never the office folder', () => {
  // Value: protects=job changes, the hire overlap check, writing a work style, the focus check and memory tidy start where Claude asks no trust question, load no project settings or hooks, and keep no transcript; fails_when=one of them runs in harnessHome again, or drops isolateConfig, the user only setting sources or disableAllHooks; why_new=issue 712 and its ship review; seam=source pin, the callers need Electron; no_claim=the isolated folder's trust (hidden-claude-isolate.test.cjs) and real Claude Code (verified live with 2.1.323)
  const main = read('src/main/index.ts');
  assert.doesNotMatch(main, /cwd: cfg\.harnessHome \?\? app\.getPath\('home'\)/, 'no check runs in the office folder');
  assert.equal((main.match(/cwd: jobCheckDir\(\),/g) ?? []).length, 4, 'hire overlap, job change, work style, focus');
  assert.match(main, /\(\) => ownerNotes,\s*\/\/[^\n]*\n\s*\(\) => jobCheckDir\(\)\s*\);/, 'memory tidy');
  assert.match(main, /function jobCheckDir\(\): string \{\s*const dir = join\(app\.getPath\('userData'\), JOB_CHECK_DIR\);\s*try \{ mkdirSync\(dir, \{ recursive: true \}\); \}/);
  assert.match(read('src/main/memoryTidy.ts'), /cwd: this\.checkDir\(\) \?\? home,/);
  const calls = [
    ['hire overlap', read('src/main/hireCheck.ts'), 'export async function checkDistinct'],
    ['work style', read('src/main/workStyleConvert.ts'), 'export async function convertWorkStyle'],
    ['job change', read('src/main/workStyleConvert.ts'), 'export async function reviseWorkStyle'],
    ['focus', read('src/main/workStyleConvert.ts'), 'export async function checkFocusArea'],
    ['memory tidy', read('src/main/memoryTidy.ts'), 'private async askModel']
  ];
  for (const [name, src, at] of calls) {
    const body = src.slice(src.indexOf(at), src.indexOf('});', src.indexOf('runHiddenModel(', src.indexOf(at))));
    assert.match(body, /isolateConfig: true,/, name);
    assert.match(body, /settingSources: 'user',/, name);
    assert.match(body, /settingsJson: JSON\.stringify\(\{ disableAllHooks: true \}\),/, name);
  }
  assert.ok(loadTs('src/main/factoryReset.ts').CHECK_FOLDERS.includes('job-check'), 'a factory reset clears it with the other check folders');
});

test('an ended job change names the startup question in its log line and report', () => {
  // Value: protects=the next report like issue 712 says why Claude quit; fails_when=the cause is dropped from the log reason or has no report class; why_new=issue 712 said only "session-ended"; seam=none; no_claim=none beyond protects
  const electron = require.resolve('electron');
  require.cache[electron] = require.cache[electron] ?? { id: electron, filename: electron, loaded: true, exports: {} };
  const W = loadTs('src/main/workStyleConvert.ts');
  const R = loadTs('src/shared/failureReport.ts');
  const ended = { ok: false, error: 'no assistant response found in transcript' };
  assert.deepEqual(W.reviseLogReason({ ...ended, exitCause: 'trust-folder' }), { reason: 'ended without an answer: trust-folder', error: ended.error });
  assert.deepEqual(W.reviseLogReason({ ...ended, exitCause: 'other' }), { reason: 'ended without an answer', error: ended.error });
  assert.deepEqual(R.classifyLogEvent({ kind: 'work-style-revise-failed', reason: 'ended without an answer: trust-folder' }), { kind: 'hidden-call-failed', detail: 'work-style-revise-failed:session-ended-trust-folder' });
  assert.equal(R.classifyLogEvent({ kind: 'work-style-revise-failed', reason: 'ended without an answer: signed-out' }), null, 'a sign in is the owner\'s');
  assert.equal(H.hiddenExitCause('WARNING: Claude Code running in Bypass\x1b[1CPermissions mode\n❯ No, exit\n  Yes, I accept'), 'bypass-warning');
  assert.equal(H.hiddenExitCause('error: unknown option \'--tools\''), 'unknown-option');
  assert.equal(H.hiddenExitCause('Thinking about it'), 'other');
});
