'use strict';

/**
 * Platform scoped tests (owner, 2026-10-09): a test runs only on the platforms
 * its behaviour exists on. A test that asserts Mac or POSIX behaviour (POSIX
 * paths, symlink semantics, shell scripts, Unix sockets, case rules, Mac only
 * features) is skipped on Windows, and a Windows only test is skipped elsewhere.
 *
 *   const { posixOnly } = require('./platform.cjs');
 *   test('name', posixOnly('a Unix socket path'), () => { ... });
 *
 * Every skip states its reason. Never skip a whole file that also holds
 * portable tests, and never skip a test to hide a real Windows bug: fix the
 * product, or leave the test failing and report it. A test that fails only
 * because of a test side assumption (CRLF, path separators, a POSIX literal
 * path, a short 8.3 temp path) is made portable, not skipped.
 */

const onWindows = process.platform === 'win32';

/** Runs on macOS and Linux; skipped on Windows. */
const posixOnly = (reason) => ({ skip: onWindows && `POSIX only: ${reason}` });

/** Runs on Windows; skipped on macOS and Linux. */
const windowsOnly = (reason) => ({ skip: !onWindows && `Windows only: ${reason}` });

/** Runs on macOS; skipped on Windows and Linux. */
const macOnly = (reason) => ({ skip: process.platform !== 'darwin' && `macOS only: ${reason}` });

module.exports = { onWindows, posixOnly, windowsOnly, macOnly };
