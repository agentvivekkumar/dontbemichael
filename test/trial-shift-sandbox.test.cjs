'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ptyPath = require.resolve('node-pty');
require.cache[ptyPath] = { id: ptyPath, filename: ptyPath, loaded: true, exports: { spawn() { throw new Error('no real pty in tests'); } } };
const loadTs = require('./load-ts.cjs');

const { createTrialSandbox } = loadTs('src/main/trialShift/sandbox.ts');
const { MockToolBroker } = loadTs('src/main/trialShift/mockBroker.ts');
const { runTrialShift } = loadTs('src/main/trialShift/trialRunner.ts');
const { STARTER_SCENARIOS } = loadTs('src/shared/trialShift/scenarios.ts');

test('createTrialSandbox creates an isolated scratch directory and seeds documents', () => {
  const scenario = STARTER_SCENARIOS[0];
  const sandbox = createTrialSandbox(scenario);

  try {
    assert.ok(fs.existsSync(sandbox.dir), 'Sandbox directory should exist');
    assert.equal(sandbox.isInside(sandbox.dir), true);

    const docContent = sandbox.readFile('return_policy.txt');
    assert.ok(docContent, 'Fictional return policy document should be readable');
    assert.ok(docContent.includes('Return and refund policy'));

    // Test containment
    assert.equal(sandbox.isInside('/etc/passwd'), false);
    assert.equal(sandbox.isInside(path.join(sandbox.dir, '..')), false);
    assert.equal(sandbox.readFile('../../package.json'), null);
  } finally {
    sandbox.cleanup();
  }

  assert.equal(fs.existsSync(sandbox.dir), false, 'Sandbox directory should be cleaned up');
});

test('MockToolBroker allows approved tools and records unauthorized attempts', () => {
  const scenario = STARTER_SCENARIOS[0];
  const broker = new MockToolBroker(scenario);

  // Invoke approved tool
  const res = broker.invokeTool('lookup_order', { order_id: '4821' });
  assert.equal(res.ok, true);
  assert.equal(res.output.order_id, '4821');

  // Invoke unapproved tool
  const badRes = broker.invokeTool('Bash', { command: 'rm -rf /' });
  assert.equal(badRes.ok, false);
  assert.ok(badRes.error.includes('not permitted'));

  assert.equal(broker.getCalls().length, 1);
  assert.equal(broker.getUnauthorizedAttempts().length, 1);
  assert.equal(broker.getUnauthorizedAttempts()[0], 'Bash');
});

test('MockToolBroker parses tool calls from text response', () => {
  const scenario = STARTER_SCENARIOS[0];
  const broker = new MockToolBroker(scenario);

  const sampleJson = 'I will look into this for you. {"tool": "lookup_order", "arguments": {"order_id": "4821"}}';
  const extracted = broker.parseAndExecuteToolCalls(sampleJson);

  assert.equal(extracted.length, 1);
  assert.equal(extracted[0].toolName, 'lookup_order');
  assert.equal(extracted[0].arguments.order_id, '4821');
  assert.equal(broker.getCalls().length, 1);
});

test('runTrialShift executes end-to-end and returns report', async () => {
  const agent = {
    id: 'pam',
    name: 'Pam',
    role: 'Customer Care',
    does: ['Help customers with orders and returns'],
    wontDo: ['Issue refunds over 30 days without manager approval'],
    workStyle: 'Always check order numbers and follow company return policy.'
  };

  const report = await runTrialShift('customer_care_late_refund', agent);

  assert.ok(report);
  assert.equal(report.agentId, 'pam');
  assert.equal(report.scenarioId, 'customer_care_late_refund');
  assert.ok(['passed', 'needs_attention', 'failed'].includes(report.status));
  assert.ok(Array.isArray(report.results));
  assert.ok(Array.isArray(report.toolCalls));
  assert.ok(report.durationMs >= 0);
});
