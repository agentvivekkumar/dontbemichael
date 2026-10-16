'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const {
  detectCodeFirstIntent,
  parseCsv,
  extractDataRecords,
  extractNumbers,
  executeFindDuplicates,
  executeCheckData,
  executeCalculate,
  executeCheckTaskStatus,
  tryCodeFirstExecution
} = loadTs('src/shared/codeFirstExecution.ts');

/* ── 1. Intent Detection ────────────────────────────────────────────── */

test('detectCodeFirstIntent detects explicit taskType', () => {
  assert.deepEqual(
    detectCodeFirstIntent({ text: 'anything', taskType: 'find_duplicates', key: 'email' }),
    { type: 'find_duplicates', key: 'email', operation: undefined }
  );
  assert.deepEqual(
    detectCodeFirstIntent({ text: 'anything', taskType: 'calculate', operation: 'sum' }),
    { type: 'calculate', key: undefined, operation: 'sum' }
  );
});

test('detectCodeFirstIntent detects duplicate search intents', () => {
  const t1 = detectCodeFirstIntent({ text: 'Please find duplicates in these records' });
  assert.equal(t1?.type, 'find_duplicates');

  const t2 = detectCodeFirstIntent({ text: 'Check for duplicate emails in this contact list' });
  assert.equal(t2?.type, 'find_duplicates');
  assert.equal(t2?.key, 'email');

  const t3 = detectCodeFirstIntent({ text: 'Deduplicate rows by id' });
  assert.equal(t3?.type, 'find_duplicates');
  assert.equal(t3?.key, 'id');
});

test('detectCodeFirstIntent detects data check intents', () => {
  const t1 = detectCodeFirstIntent({ text: 'Validate data for missing fields' });
  assert.equal(t1?.type, 'check_data');

  const t2 = detectCodeFirstIntent({ text: 'Please check records in the csv file' });
  assert.equal(t2?.type, 'check_data');
});

test('detectCodeFirstIntent detects calculation intents', () => {
  const t1 = detectCodeFirstIntent({ text: 'Calculate sum of expenses: $50, $75, $100' });
  assert.equal(t1?.type, 'calculate');
  assert.equal(t1?.operation, 'sum');

  const t2 = detectCodeFirstIntent({ text: 'Compute average of test scores' });
  assert.equal(t2?.type, 'calculate');
  assert.equal(t2?.operation, 'average');
});

test('detectCodeFirstIntent detects task status lookup', () => {
  const t1 = detectCodeFirstIntent({ text: 'What is the task status of webhook-abc1234' });
  assert.equal(t1?.type, 'task_status');
  assert.equal(t1?.key, 'webhook-abc1234');

  const t2 = detectCodeFirstIntent({ text: 'Check card status for invoice-sync' });
  assert.equal(t2?.type, 'task_status');
});

test('detectCodeFirstIntent returns null for non-deterministic prompts', () => {
  assert.equal(detectCodeFirstIntent({ text: '' }), null);
  assert.equal(detectCodeFirstIntent({ text: 'Hey Michael, how should we organize the sprint?' }), null);
  assert.equal(detectCodeFirstIntent({ text: 'Draft a polite follow up email to the customer' }), null);
  assert.equal(detectCodeFirstIntent({ text: 'Write a bash script to deploy the website' }), null);
});

/* ── 2. Data Parsing & Extraction ──────────────────────────────────── */

test('parseCsv correctly parses headers and rows with commas in quotes', () => {
  const csv = 'Name,Company,Role\n"Smith, John","Acme, Inc.",Manager\nAlice,Beta,Engineer';
  const records = parseCsv(csv);
  assert.equal(records.length, 2);
  assert.equal(records[0].Name, 'Smith, John');
  assert.equal(records[0].Company, 'Acme, Inc.');
  assert.equal(records[0].Role, 'Manager');
  assert.equal(records[1].Name, 'Alice');
});

test('extractDataRecords extracts JSON blocks in natural text', () => {
  const text = 'Here is the data:\n```json\n[{"id": 1, "name": "A"}, {"id": 2, "name": "B"}]\n```';
  const records = extractDataRecords({ text });
  assert.equal(Array.isArray(records), true);
  assert.equal(records.length, 2);
  assert.equal(records[0].id, 1);
});

test('extractNumbers extracts numeric values with currency symbols and formatting', () => {
  const text = 'Expenses: $1,250.50, $300.00, $45.25 and -$20.00';
  const nums = extractNumbers({ text });
  assert.deepEqual(nums, [1250.5, 300, 45.25, -20]);
});

test('extractNumbers extracts specific field from object records', () => {
  const data = [
    { item: 'A', price: 100 },
    { item: 'B', price: '$250.50' },
    { item: 'C', price: 50 }
  ];
  const nums = extractNumbers({ text: '', data }, 'price');
  assert.deepEqual(nums, [100, 250.5, 50]);
});

/* ── 3. Find Duplicates Handler ────────────────────────────────────── */

test('executeFindDuplicates identifies duplicates on a given key', () => {
  const records = [
    { id: 1, email: 'alice@example.com', name: 'Alice 1' },
    { id: 2, email: 'bob@example.com', name: 'Bob' },
    { id: 3, email: 'alice@example.com', name: 'Alice 2' },
    { id: 4, email: 'charlie@example.com', name: 'Charlie' }
  ];

  const res = executeFindDuplicates(records, 'email');
  assert.equal(res.success, true);
  assert.equal(res.data.total, 4);
  assert.equal(res.data.duplicateCount, 1);
  assert.equal(res.data.duplicateRecordsCount, 2);
  assert.equal(res.data.duplicates[0].value, 'alice@example.com');
  assert.deepEqual(res.data.duplicates[0].indices, [0, 2]);
  assert.match(res.summary, /Found 1 duplicate value across 4 records/);
});

test('executeFindDuplicates reports zero duplicates when records are unique', () => {
  const records = [
    { id: 'A', code: 101 },
    { id: 'B', code: 102 },
    { id: 'C', code: 103 }
  ];

  const res = executeFindDuplicates(records, 'id');
  assert.equal(res.data.duplicateCount, 0);
  assert.equal(res.data.duplicateRecordsCount, 0);
  assert.match(res.summary, /No duplicate records found across 3 items/);
});

test('executeFindDuplicates works on primitive arrays', () => {
  const items = ['apple', 'orange', 'banana', 'apple', 'banana', 'apple'];
  const res = executeFindDuplicates(items);
  assert.equal(res.data.total, 6);
  assert.equal(res.data.uniqueCount, 3);
  assert.equal(res.data.duplicateCount, 2); // 'apple' and 'banana'
});

/* ── 4. Check Data Handler ─────────────────────────────────────────── */

test('executeCheckData passes when all required fields are present', () => {
  const records = [
    { id: '1', name: 'Alice', role: 'Dev' },
    { id: '2', name: 'Bob', role: 'Designer' }
  ];

  const res = executeCheckData(records);
  assert.equal(res.success, true);
  assert.equal(res.data.issueCount, 0);
  assert.equal(res.data.validRows, 2);
  assert.match(res.summary, /Data check passed/);
});

test('executeCheckData identifies missing and empty fields with row indices', () => {
  const records = [
    { id: '1', name: 'Alice', email: 'alice@test.com' },
    { id: '2', name: '', email: 'bob@test.com' },
    { id: '3', name: 'Charlie' }, // missing email
    null
  ];

  const res = executeCheckData(records);
  assert.equal(res.success, true);
  assert.equal(res.data.totalRows, 4);
  assert.equal(res.data.validRows, 1);
  assert.equal(res.data.invalidRows, 3);
  assert.ok(res.data.issueCount >= 3);
  assert.match(res.summary, /Data check identified/);
});

/* ── 5. Calculate Handler ──────────────────────────────────────────── */

test('executeCalculate calculates sum, average, min, max, and median', () => {
  const nums = [10, 20, 30, 40, 50];
  const res = executeCalculate(nums, 'all');

  assert.equal(res.data.count, 5);
  assert.equal(res.data.sum, 150);
  assert.equal(res.data.average, 30);
  assert.equal(res.data.min, 10);
  assert.equal(res.data.max, 50);
  assert.equal(res.data.median, 30);
  assert.match(res.summary, /Calculation results across 5 values/);
});

test('executeCalculate emphasizes requested operation in summary', () => {
  const nums = [15.5, 24.5, 60.0];
  const res = executeCalculate(nums, 'sum');
  assert.equal(res.data.resultValue, 100);
  assert.match(res.summary, /Calculation result: sum is 100/);

  const resAvg = executeCalculate(nums, 'average');
  assert.equal(resAvg.data.resultValue, 33.33);
  assert.match(resAvg.summary, /Calculation result: average is 33.33/);
});

/* ── 6. Task Status Lookup Handler ─────────────────────────────────── */

test('executeCheckTaskStatus finds task by exact ID or title', () => {
  const mockTasks = [
    { id: 'task-101', title: 'Prepare monthly balance sheet', status: 'done', result: 'Sheet generated and archived.' },
    { id: 'webhook-99', title: 'Sync client database', status: 'doing', assignee: 'Michael' },
    { id: 'task-102', title: 'Awaiting supplier signature', status: 'waiting', waitingOn: 'Supplier VP' }
  ];

  const res1 = executeCheckTaskStatus('webhook-99', mockTasks);
  assert.equal(res1.data.found, true);
  assert.equal(res1.data.task.status, 'doing');
  assert.match(res1.summary, /status is doing\. Assigned to: Michael\./);

  const res2 = executeCheckTaskStatus('monthly balance', mockTasks);
  assert.equal(res2.data.found, true);
  assert.equal(res2.data.task.status, 'done');
  assert.match(res2.summary, /Result: Sheet generated and archived\./);

  const res3 = executeCheckTaskStatus('non-existent-task', mockTasks);
  assert.equal(res3.data.found, false);
  assert.match(res3.summary, /No task found/);
});

/* ── 7. tryCodeFirstExecution End-to-End & Fallbacks ───────────────── */

test('tryCodeFirstExecution succeeds on duplicate detection with CSV input', () => {
  const csvData = 'id,sku,qty\n1,ITEM-A,5\n2,ITEM-B,10\n3,ITEM-A,2';
  const res = tryCodeFirstExecution({
    text: 'Please find duplicate records by sku in this data',
    data: csvData
  });

  assert.equal(res.matched, true);
  assert.equal(res.handled, true);
  assert.equal(res.taskType, 'find_duplicates');
  assert.match(res.summary, /Found 1 duplicate value across 3 records for field "sku"/);
});

test('tryCodeFirstExecution succeeds on calculation with numbers in text', () => {
  const res = tryCodeFirstExecution({
    text: 'Compute total of receipts: $120.00, $45.50, and $34.50'
  });

  assert.equal(res.matched, true);
  assert.equal(res.handled, true);
  assert.equal(res.taskType, 'calculate');
  assert.equal(res.data.resultValue, 200);
});

test('tryCodeFirstExecution falls back when intent is unsupported', () => {
  const res = tryCodeFirstExecution({
    text: 'Can you write a poem about the coffee machine in the office?'
  });

  assert.equal(res.matched, false);
  assert.equal(res.handled, false);
  assert.equal(res.fallbackReason, 'unsupported');
});

test('tryCodeFirstExecution falls back gracefully on missing input data', () => {
  const res = tryCodeFirstExecution({
    text: 'Please find duplicates in the following dataset:'
    // No data provided at all
  });

  assert.equal(res.matched, true);
  assert.equal(res.handled, false);
  assert.equal(res.fallbackReason, 'invalid_input');
  assert.ok(res.error);
});

test('tryCodeFirstExecution falls back gracefully on empty calculation query', () => {
  const res = tryCodeFirstExecution({
    text: 'Calculate sum of'
  });

  assert.equal(res.matched, true);
  assert.equal(res.handled, false);
  assert.equal(res.fallbackReason, 'invalid_input');
  assert.ok(res.error);
});
