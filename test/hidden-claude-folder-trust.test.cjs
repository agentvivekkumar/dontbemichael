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

test('a hidden session trusts its folder first, and says so when a trust question ended it', { skip: !POSIX }, async () => {
  // Value: protects=job changes and the other hidden checks in an office folder Claude was never opened in; fails_when=runHiddenClaude starts the session before the folder trust hook, or an ended session no longer names the question it stopped on; why_new=issue 712, 12 reports from 0.4.0; seam=fake claude in a real PTY, setHiddenClaudeFolderTrust (set by index.ts); no_claim=that real Claude Code reads hasTrustDialogAccepted under these keys (verified live with 2.1.323: the question defaults to No, exit)
  const { bin, cwd } = fakeClaude();
  // No trust hook: the question takes the Enter, and the result says which question.
  H.setHiddenClaudeFolderTrust(() => {});
  assert.deepEqual(await H.runHiddenClaude('Say done.', opts(bin, cwd)), { ok: false, error: 'no assistant response found in transcript', exitCause: 'trust-folder' });
  // The app's hook trusts the folder before the session starts.
  const seen = [];
  H.setHiddenClaudeFolderTrust((dir) => {
    seen.push(dir);
    fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ projects: { [dir]: { hasTrustDialogAccepted: true } } }));
  });
  assert.deepEqual(await H.runHiddenClaude('Say done.', opts(bin, cwd)), { ok: true, text: 'DONE' });
  assert.deepEqual(seen, [cwd]);
  H.setHiddenClaudeFolderTrust(() => {});
});

test('the app trusts each hidden check\'s folder once, with the helper team members use', () => {
  // Value: protects=the wiring the PTY test stands in for; fails_when=index.ts stops setting the trust hook or uses another helper than ensureClaudePermissionsAccepted; why_new=issue 712; seam=source pin, the hook is set in main
  assert.match(read('src/main/index.ts'), /setHiddenClaudeFolderTrust\(\(cwd\) => \{\s*if \(hiddenTrusted\.has\(cwd\)\) return;\s*ensureClaudePermissionsAccepted\(cwd\);\s*hiddenTrusted\.add\(cwd\);\s*\}\);/);
  assert.match(read('src/main/hiddenClaude.ts'), /if \(!opts\.isolateConfig\) \{ try \{ hiddenClaudeFolderTrust\(opts\.cwd\); \}[^\n]*\n\s*let isolated/, 'before the session starts');
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
