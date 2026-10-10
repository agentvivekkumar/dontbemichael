'use strict';

/**
 * A Windows office saw Claude's last terminal row drawn past its box, over the
 * Queue box (2026-10-09). A correct fit never does that (probed at display
 * scales 1 to 1.75, page zoom and font zoom), so the terminal now refits when
 * xterm's cell changes size on its own, and logs the sizes when a fit still
 * leaves the screen past its box.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { terminalOverflowEvent } = loadTs('src/shared/terminalOverflow.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

test('the overflow log line keeps numbers and short words only', () => {
  // Value: protects=the office log (committed) never gets terminal text or paths from this line; fails_when=strings pass unchecked, keys or entries are unbounded, or bad input throws; why_new=new IPC; seam=none
  assert.deepEqual(
    terminalOverflowEvent({ overflowPx: 14.4567, rows: 31, dpr: 1.25, renderer: 'webgl' }, 'win32'),
    { kind: 'terminal-overflow', platform: 'win32', overflowPx: 14.46, rows: 31, dpr: 1.25 },
    'only the known size fields, as numbers'
  );
  const bad = terminalOverflowEvent({ overflowPx: 9, path: 'C:\\Users\\x\\secret.txt', text: 'claude said: hello world, here is a long line', n: NaN, inf: Infinity, obj: { a: 1 } }, 'win32');
  assert.deepEqual(bad, { kind: 'terminal-overflow', platform: 'win32', overflowPx: 9 });
  assert.equal(terminalOverflowEvent(null, 'win32'), null);
  assert.equal(terminalOverflowEvent([1, 2], 'win32'), null);
  assert.equal(terminalOverflowEvent('x', 'win32'), null);
  const many = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, i]));
  assert.deepEqual(terminalOverflowEvent({ ...many, overflowPx: 4 }, 'darwin'), { kind: 'terminal-overflow', platform: 'darwin', overflowPx: 4 }, 'unknown keys are dropped');
  assert.deepEqual(terminalOverflowEvent({ 'C:\\Users\\x\\secret.txt': 1, 'claude said hello': 2, ts: 5, rows: 3, overflowPx: 6 }, 'win32'), { kind: 'terminal-overflow', platform: 'win32', rows: 3, overflowPx: 6 }, 'no path or text as a key, and no timestamp override');
  assert.deepEqual(terminalOverflowEvent({ rows: '31', overflowPx: 6 }, 'win32'), { kind: 'terminal-overflow', platform: 'win32', overflowPx: 6 }, 'a field must be a number');
  assert.deepEqual(terminalOverflowEvent({ kind: 'x', platform: 'y', overflowPx: 6 }, 'win32'), { kind: 'terminal-overflow', platform: 'win32', overflowPx: 6 }, 'kind and platform cannot be overridden');
  for (const empty of [{}, many, { rows: 3 }, { overflowPx: 1 }, { overflowPx: 0.5 }, { overflowPx: '9' }]) {
    assert.equal(terminalOverflowEvent(empty, 'win32'), null, 'no line without an actual overflow');
  }
});

test('the terminal refits on a cell size change, unsubscribes, and logs a fit that still overflows', () => {
  // Value: protects=a cell size change with the box unchanged (font load, display scale, renderer swap) refits, and a remaining overflow is reported once a minute; fails_when=the listener, its cleanup, the check or the IPC wiring is dropped; why_new=the Windows overflow report; seam=none
  const view = read('src/renderer/src/components/PtyTerminalView.tsx');
  assert.match(view, /const offCellSize = onCellSizeChange\(entry, \(\) => requestAnimationFrame\(\(\) => tryFit\(false\)\)\);/);
  assert.match(view, /ro\.disconnect\(\);\n\s+offCellSize\(\);/);
  assert.match(view, /if \(Date\.now\(\) - lastOverflowCheck > 60_000\) \{\n\s+lastOverflowCheck = Date\.now\(\);\n\s+over = screenOverflowPx\(entry\);\n\s+\}/, 'measured at most once a minute, fit or not');
  const pool = read('src/renderer/src/components/terminalPool.ts');
  assert.match(pool, /export function screenOverflowPx\(entry: TerminalEntry\): number \{/);
  assert.match(pool, /const sub = rs\?\.onDimensionsChange\?\.\(cb\);/);
  assert.match(read('src/preload/index.ts'), /logTerminalOverflow: \(info: Record<string, number \| string>\): void =>\n\s+ipcRenderer\.send\('terminal:overflow', info\)/);
  assert.match(read('src/main/index.ts'), /if \(Date\.now\(\) - lastTerminalOverflowLog < 60_000\) return;\n\s+const event = terminalOverflowEvent\(info, process\.platform\);\n[^\n]*\n\s+if \(!event \|\| loggedOverflowSizes\.has\(size\) \|\| loggedOverflowSizes\.size >= 20\) return;/, 'main logs one line a minute, each size once a session');
  // The private event the listener relies on still exists in the installed xterm.
  assert.match(read('node_modules/@xterm/xterm/src/browser/services/RenderService.ts'), /public readonly onDimensionsChange = this\._onDimensionsChange\.event;/);
});

test('the overflow measure is zero when the screen fits or the host is off screen, and a missing xterm hook never throws', () => {
  // Value: protects=a detached or fitting terminal never logs an overflow, and an xterm without the private resize event still mounts; fails_when=the connected host guard or the clamp at zero is dropped, or onCellSizeChange throws or returns no cleanup when _core or onDimensionsChange is absent; why_new=the other test only matches the source text; seam=none (the two functions are compiled from the shipped file, which needs a DOM to load whole)
  const ts = require('typescript');
  const src = read('src/renderer/src/components/terminalPool.ts');
  const fn = (name) => {
    const m = src.match(new RegExp(`export function ${name}\\([\\s\\S]*?\\n\\}\\n`));
    assert.ok(m, name);
    const js = ts.transpileModule(m[0].replace(/^export /, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    return new Function(`${js}\nreturn ${name};`)();
  };
  const screenOverflowPx = fn('screenOverflowPx');
  const onCellSizeChange = fn('onCellSizeChange');
  const entry = (screenBottom, hostBottom, connected = true) => ({
    term: { element: { querySelector: (sel) => (sel === '.xterm-screen' && screenBottom !== null ? { getBoundingClientRect: () => ({ bottom: screenBottom }) } : null) } },
    host: { isConnected: connected, getBoundingClientRect: () => ({ bottom: hostBottom }) }
  });
  assert.equal(screenOverflowPx(entry(520, 500)), 20, 'drawn 20px past its box');
  assert.equal(screenOverflowPx(entry(480, 500)), 0, 'fits');
  assert.equal(screenOverflowPx(entry(520, 500, false)), 0, 'a detached host is not measured');
  assert.equal(screenOverflowPx(entry(null, 500)), 0, 'no screen yet');
  assert.equal(screenOverflowPx({ term: {}, host: { isConnected: true } }), 0, 'not opened yet');

  let fired = 0;
  let disposed = 0;
  const live = { term: { _core: { _renderService: { onDimensionsChange: (cb) => { fired = cb; return { dispose: () => { disposed++; } }; } } } } };
  const off = onCellSizeChange(live, () => {});
  assert.equal(typeof fired, 'function', 'subscribed to the cell size event');
  off();
  assert.equal(disposed, 1, 'the cleanup unsubscribes');
  for (const term of [{}, { _core: {} }, { _core: { _renderService: {} } }, { get _core() { throw new Error('private API gone'); } }]) {
    const noop = onCellSizeChange({ term }, () => {});
    assert.equal(typeof noop, 'function');
    assert.doesNotThrow(noop);
  }
  const broken = { term: { _core: { _renderService: { onDimensionsChange: () => ({ dispose: () => { throw new Error('gone'); } }) } } } };
  assert.doesNotThrow(onCellSizeChange(broken, () => {}), 'a failing dispose is swallowed');
});
