'use strict';

/**
 * A hidden Claude call reads only its own session's transcript (2026-09-27).
 * Two memory tidy calls ran back to back in the same project folder; the second
 * (Toby's) read "the newest transcript" while its model was still thinking and
 * got the first one's answer (Sadiq's), so Sadiq's memory was written into Toby's.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { lastAssistantText, transcriptFile } = loadTs('src/main/transcriptText.ts');
const read = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');

const line = (type, text) => JSON.stringify({ type, message: { content: [{ type: 'text', text }] } });

test('each session reads its own transcript, even when a neighbour finished a moment ago', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hidden-claude-'));
  // Sadiq's call just finished: its transcript is the newest file in the folder.
  fs.writeFileSync(transcriptFile(dir, 'sadiq-session'), [line('user', 'notes for Sadiq'), line('assistant', '{"ops":["sadiq"]}')].join('\n'));
  // Toby's call is still thinking: its transcript has the prompt but no answer yet.
  fs.writeFileSync(transcriptFile(dir, 'toby-session'), line('user', 'notes for Toby'));
  const sadiqMtime = new Date(Date.now() + 1000);
  fs.utimesSync(transcriptFile(dir, 'sadiq-session'), sadiqMtime, sadiqMtime);

  assert.equal(lastAssistantText(transcriptFile(dir, 'toby-session')), null, 'no answer yet means keep waiting, never borrow one');
  fs.appendFileSync(transcriptFile(dir, 'toby-session'), '\n' + line('assistant', '{"ops":["toby"]}'));
  assert.equal(lastAssistantText(transcriptFile(dir, 'toby-session')), '{"ops":["toby"]}');
  assert.equal(lastAssistantText(transcriptFile(dir, 'missing')), null);
});

test('runHiddenClaude names its session and never picks the newest file in the folder', () => {
  const src = read('src/main/hiddenClaude.ts');
  assert.match(src, /'--session-id', sessionId,/);
  assert.match(src, /lastAssistantText\(transcriptFile\(projectDir\(opts\.cwd\), sessionId\)\)/);
  assert.doesNotMatch(src, /readdirSync|mtime/, 'no newest-file guess');
  // A quiet screen without an answer waits instead of failing.
  assert.match(src, /if \(text\) \{ finish\(\{ ok: true, text \}\); return; \}\s*if \(idleTimer\) clearTimeout\(idleTimer\);\s*idleTimer = setTimeout\(captureAndFinish, idleMs\);/);
});
