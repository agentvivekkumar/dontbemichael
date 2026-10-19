#!/usr/bin/env node
'use strict';

/** Read-only CSV data-quality profile. Node 20+, no dependencies or network. */
const fs = require('node:fs');
const path = require('node:path');

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_COLUMNS = 200;
const MAX_ROWS = 100_000;
const OUTLIER_MIN_OBSERVATIONS = 4;
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/** RFC 4180 quoted fields (including escaped quotes and embedded newlines). */
function parseCsv(text) {
  const source = String(text).replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let closedQuote = false;
  let rowStarted = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closedQuote = true; }
      } else { field += ch; }
      continue;
    }
    if (ch === '"') {
      if (field !== '' || closedQuote) throw new Error(`Unexpected quote at character ${i + 1}`);
      quoted = true;
      rowStarted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
      closedQuote = false;
      rowStarted = true;
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && source[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      if (rows.length > MAX_ROWS + 1) throw new Error(`CSV exceeds ${MAX_ROWS} data rows`);
      row = [];
      field = '';
      closedQuote = false;
      rowStarted = false;
    } else {
      if (closedQuote) throw new Error(`Unexpected text after closing quote at character ${i + 1}`);
      field += ch;
      rowStarted = true;
    }
  }
  if (quoted) throw new Error('Unterminated quoted CSV field');
  if (rowStarted || row.length || field !== '' || closedQuote) {
    row.push(field);
    rows.push(row);
    if (rows.length > MAX_ROWS + 1) throw new Error(`CSV exceeds ${MAX_ROWS} data rows`);
  }
  return rows;
}

function numericValue(value) {
  const s = value.trim();
  if (!NUMBER.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Linear interpolation of sorted values; reports quartiles, not inferential bounds. */
function quantile(sorted, fraction) {
  const index = (sorted.length - 1) * fraction;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

function profileRows(rows) {
  if (!rows.length || (rows.length === 1 && rows[0].length === 1 && rows[0][0] === '')) {
    throw new Error('CSV must contain a non-empty header row');
  }
  const header = rows[0];
  if (header.length > MAX_COLUMNS) throw new Error(`CSV exceeds ${MAX_COLUMNS} columns`);
  if (header.every(h => !h.trim())) throw new Error('CSV header must contain a column name');
  if (rows.length - 1 > MAX_ROWS) throw new Error(`CSV exceeds ${MAX_ROWS} data rows`);

  const badRows = [];
  const valid = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].length !== header.length) {
      badRows.push(i + 1); // physical record number, not line number
    } else {
      valid.push(rows[i]);
    }
  }
  const seen = new Set();
  let duplicates = 0;
  for (const row of valid) {
    const key = JSON.stringify(row);
    if (seen.has(key)) duplicates++;
    else seen.add(key);
  }
  const cols = header.map((name, index) => {
    const values = valid.map(row => row[index]);
    const present = values.map(s => s.trim()).filter(Boolean);
    const missing = values.length - present.length;
    const parsed = present.map(numericValue);
    const numeric = present.length > 0 && parsed.every(n => n !== null);
    const column = { index: index + 1, name: name.trim(), missing, missingPercent: valid.length ? Number((missing / valid.length * 100).toFixed(2)) : 0, type: numeric ? 'numeric' : 'text' };
    if (!numeric) return column;
    const numbers = parsed.slice().sort((a, b) => a - b);
    const count = numbers.length;
    // Dividing before accumulation avoids overflow for large finite inputs.
    const mean = numbers.reduce((acc, value) => acc + value / count, 0);
    const q1 = quantile(numbers, 0.25);
    const q3 = quantile(numbers, 0.75);
    const iqr = q3 - q1;
    // Tukey fences identify review candidates, NOT errors. Suppress tiny samples.
    const outliers = count >= OUTLIER_MIN_OBSERVATIONS
      ? numbers.filter(n => n < q1 - 1.5 * iqr || n > q3 + 1.5 * iqr).length : 0;
    return { ...column, count, min: numbers[0], max: numbers[count - 1], mean, median: quantile(numbers, 0.5), q1, q3, iqrOutliers: outliers };
  });
  const names = new Set();
  const repeated = [];
  for (const name of header) {
    if (!name.trim() || names.has(name.trim())) repeated.push(name);
    names.add(name.trim());
  }
  return {
    totalRows: rows.length - 1,
    analyzedRows: valid.length,
    columns: header.length,
    duplicateRows: duplicates,
    malformedRowCount: badRows.length,
    malformedRowExamples: badRows.slice(0, 5),
    duplicateOrEmptyHeaders: repeated,
    columnProfiles: cols,
    notes: [
      'Missing means an empty or whitespace-only cell; text such as NA is not automatically missing.',
      'Only columns with exclusively plain finite numeric non-empty values are treated as numeric.',
      'IQR outliers are review candidates, not data errors; no values were changed.',
      ...(badRows.length ? ['Malformed-width records were excluded from column statistics and duplicate counts.'] : [])
    ]
  };
}

function profileFile(filePath) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) throw new Error('Input must be a regular file');
  if (stat.size > MAX_BYTES) throw new Error(`CSV exceeds ${MAX_BYTES} byte read limit`);
  const bytes = fs.readFileSync(filePath);
  // Invalid UTF-8 can silently alter business data; reject instead of replacing bytes.
  const csv = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return profileRows(parseCsv(csv));
}

function formatReport(report) {
  const lines = [
    'CSV data quality (read-only)',
    `Rows: ${report.totalRows} total, ${report.analyzedRows} analysed`,
    `Columns: ${report.columns}`,
    `Duplicate rows: ${report.duplicateRows}`,
    `Incorrect-width records: ${report.malformedRowCount}`
  ];
  if (report.duplicateOrEmptyHeaders.length) lines.push(`Duplicate/empty headers: ${report.duplicateOrEmptyHeaders.map(x => JSON.stringify(x)).join(', ')}`);
  if (report.malformedRowCount) lines.push(`Examples of incorrect-width record numbers: ${report.malformedRowExamples.join(', ')}`);
  for (const column of report.columnProfiles) {
    let line = `- Column ${column.index} (${JSON.stringify(column.name)}): ${column.missing} missing (${column.missingPercent}%), ${column.type}`;
    if (column.type === 'numeric') line += `; min=${column.min}, max=${column.max}, mean=${column.mean}, median=${column.median}, potential IQR outliers=${column.iqrOutliers}`;
    lines.push(line);
  }
  return lines.concat(report.notes.map(note => `Note: ${note}`)).join('\n');
}

function main(args) {
  if (args.length < 1 || args.length > 2 || (args.length === 2 && args[1] !== '--json') || args[0].startsWith('--')) {
    throw new Error('Usage: node profile.cjs <path/to/file.csv> [--json]');
  }
  const file = path.resolve(args[0]);
  const result = profileFile(file);
  process.stdout.write((args[1] === '--json' ? JSON.stringify(result, null, 2) : formatReport(result)) + '\n');
}

if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (err) { console.error(`CSV profile: ${err.message}`); process.exitCode = 1; }
}

module.exports = { parseCsv, numericValue, profileRows, profileFile, formatReport };
