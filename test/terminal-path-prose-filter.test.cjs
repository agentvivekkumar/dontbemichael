/**
 * isPathToken must not underline prose-like quoted patterns.
 *
 * Context: TODOS.md "A quoted phrase that starts with a slash links as a path".
 * The PATH_TOKEN_RE in terminal paths matches quoted strings that start with a
 * path prefix, but prose like "/ see notes.md" should not be linked since it
 * contains multiple words before the filename.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { isPathToken } = require('../out/shared/terminalPaths.js');

describe('terminal path prose filtering', () => {
  it('links a real quoted path', () => {
    assert.strictEqual(isPathToken('docs/notes.md', '"docs/notes.md"'), true);
    assert.strictEqual(isPathToken('/path/to/file.ts', '"/path/to/file.ts"'), true);
    assert.strictEqual(isPathToken('~/Documents/report.pdf', '"~/Documents/report.pdf"'), true);
  });

  it('links a quoted path with one word prefix', () => {
    // "Update notes.md" has just one word before the filename
    assert.strictEqual(isPathToken('notes.md', '"Update notes.md"'), true);
  });

  it('does not link prose with multiple words', () => {
    // "/ see notes.md" has multiple words (spaces) before the filename
    assert.strictEqual(isPathToken('/ see notes.md', '"/ see notes.md"'), false);
    assert.strictEqual(isPathToken('/ check the report.pdf', '"/ check the report.pdf"'), false);
  });

  it('links paths without quotes', () => {
    // Unquoted paths should still work as before
    assert.strictEqual(isPathToken('src/main/index.ts'), true);
    assert.strictEqual(isPathToken('README.md'), true);
  });

  it('handles paths with known extensions', () => {
    // Known extensions are always linked, even without separators
    assert.strictEqual(isPathToken('README.md'), true);
    assert.strictEqual(isPathToken('test.ts'), true);
    assert.strictEqual(isPathToken('config.json'), true);
  });

  it('does not link invalid patterns', () => {
    // No extension
    assert.strictEqual(isPathToken('no-extension'), false);
    // Version numbers
    assert.strictEqual(isPathToken('v0.4.5'), false);
    assert.strictEqual(isPathToken('1.5'), false);
  });

  it('handles single-quoted strings', () => {
    assert.strictEqual(isPathToken('docs/file.md', "'docs/file.md'"), true);
    assert.strictEqual(isPathToken('/ see this file.md', "'/  see this file.md'"), false);
  });

  it('handles backtick-quoted strings', () => {
    assert.strictEqual(isPathToken('src/app.ts', '`src/app.ts`'), true);
    assert.strictEqual(isPathToken('/ read the docs.md', '`/ read the docs.md`'), false);
  });
});
