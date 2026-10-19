'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SKILL = path.resolve(__dirname, '../resources/skills/csv-data-quality/SKILL.md');
const SCRIPT = path.resolve(__dirname, '../resources/skills/csv-data-quality/scripts/profile.cjs');
const { parseCsv, profileRows, numericValue } = require(SCRIPT);

function csvFile(t, contents, name = 'Sales Export.csv') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbm csv skill '));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, name);
  fs.writeFileSync(file, contents);
  return file;
}

function run(file, json = true) {
  return spawnSync(process.execPath, [SCRIPT, file, ...(json ? ['--json'] : [])], { encoding: 'utf8' });
}

test('bundled skill has discovery metadata and a working helper', () => {
  const md = fs.readFileSync(SKILL, 'utf8');
  assert.match(md, /^---\nname: csv-data-quality\n/);
  assert.match(md, /allowed-tools:/);
  assert.match(md, /profile\.cjs/);
});

test('quoted commas, escaped quotes, quoted newlines, CRLF, and BOM round-trip', () => {
  assert.deepEqual(parseCsv('\uFEFFname,comment,amount\r\n"Acme, Inc.","said ""hello""\nagain",10\r\n'), [
    ['name', 'comment', 'amount'], ['Acme, Inc.', 'said "hello"\nagain', '10']
  ]);
  assert.deepEqual(parseCsv('h1,h2\n1,2\n'), [['h1', 'h2'], ['1', '2']], 'terminal newline does not add a row');
  assert.deepEqual(parseCsv('x,y\n,""'), [['x', 'y'], ['', '']], 'quoted empty at EOF remains a field');
});

test('invalid quoting fails closed instead of guessing record boundaries', () => {
  assert.throws(() => parseCsv('a,b\n"unterminated'), /Unterminated/);
  assert.throws(() => parseCsv('a,b\na"b,c'), /Unexpected quote/);
  assert.throws(() => parseCsv('a,b\n"a"b,c'), /Unexpected text/);
});

test('clean profile distinguishes missing, duplicates, and numeric summary', () => {
  const result = profileRows(parseCsv('product,revenue,notes\nBook,10,ok\nPen,20,\nBook,10,ok\nTape,30,ok\nBag,100,ok\n'));
  assert.equal(result.totalRows, 5);
  assert.equal(result.analyzedRows, 5);
  assert.equal(result.duplicateRows, 1);
  assert.equal(result.malformedRowCount, 0);
  assert.equal(result.columnProfiles[2].missing, 1);
  const col = result.columnProfiles[1];
  assert.equal(col.type, 'numeric');
  assert.equal(col.min, 10);
  assert.equal(col.max, 100);
  assert.equal(col.mean, 34);
  assert.equal(col.median, 20);
  assert.equal(col.iqrOutliers, 1);
});

test('malformed-width rows are counted and excluded from statistics', () => {
  const result = profileRows(parseCsv('product,revenue\nA,10\nB\nC,20,extra\nD,30\n'));
  assert.equal(result.totalRows, 4);
  assert.equal(result.analyzedRows, 2);
  assert.equal(result.malformedRowCount, 2);
  assert.deepEqual(result.malformedRowExamples, [3, 4]);
  assert.equal(result.columnProfiles[1].mean, 20);
});

test('numeric inference rejects currency, NaN, Infinity, and mixed values', () => {
  for (const s of ['$1,200', 'Infinity', 'NaN', 'abc', '1,200']) assert.equal(numericValue(s), null);
  assert.equal(numericValue('1.2e3'), 1200);
  assert.equal(profileRows(parseCsv('cost\n"$12.50"\n18\n')).columnProfiles[0].type, 'text');
  assert.equal(profileRows(parseCsv('cost\n5\n')).columnProfiles[0].iqrOutliers, 0, 'tiny samples are not flagged');
});

test('report includes missing or repeated headers, empty CSV and row guard', () => {
  assert.deepEqual(profileRows(parseCsv('a,a,\n1,2,3')).duplicateOrEmptyHeaders, ['a', '']);
  assert.throws(() => profileRows(parseCsv('')), /header/);
  assert.throws(() => profileRows(parseCsv(',,\n')), /header/);
  assert.throws(() => profileRows([['x'], ...Array.from({ length: 100001 }, () => ['x'])]), /data rows/);
});

test('CLI JSON and human output work with spaced path, do not change source', (t) => {
  const file = csvFile(t, 'name,revenue\nA,10\nB,20\n');
  const before = fs.readFileSync(file);
  const result = run(file);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).columnProfiles[1].mean, 15);
  const plain = run(file, false);
  assert.equal(plain.status, 0, plain.stderr);
  assert.match(plain.stdout, /read-only/);
  assert.match(plain.stdout, /Duplicate rows: 0/);
  assert.deepEqual(fs.readFileSync(file), before);
});

test('CLI refuses malformed, invalid UTF-8, and oversized inputs', (t) => {
  const bad = csvFile(t, 'a,b\n"broken');
  assert.notEqual(run(bad).status, 0);
  assert.match(run(bad).stderr, /Unterminated/);
  const invalid = csvFile(t, Buffer.from([0xff, 0xfe]), 'bad.csv');
  assert.notEqual(run(invalid).status, 0);
  const oversized = csvFile(t, 'x'.repeat(5 * 1024 * 1024 + 1), 'big.csv');
  assert.notEqual(run(oversized).status, 0);
  assert.match(run(oversized).stderr, /read limit/);
});
