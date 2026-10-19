'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { STARTER_SCENARIOS, findScenario } = loadTs('src/shared/trialShift/scenarios.ts');

const DASH = /[\u002D\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/;

test('starter scenarios load with required properties and valid tools', () => {
  assert.ok(STARTER_SCENARIOS.length >= 3);
  for (const scenario of STARTER_SCENARIOS) {
    assert.ok(scenario.id, 'Scenario must have an id');
    assert.ok(scenario.name, 'Scenario must have a name');
    assert.ok(scenario.industry, 'Scenario must have an industry');
    assert.ok(scenario.summary, 'Scenario must have a summary');
    assert.ok(scenario.prompt, 'Scenario must have a prompt');
    assert.ok(Array.isArray(scenario.targetRoles) && scenario.targetRoles.length > 0);
    assert.ok(Array.isArray(scenario.assertions) && scenario.assertions.length > 0);
    assert.ok(Array.isArray(scenario.simulatedTools) && scenario.simulatedTools.length > 0);

    for (const tool of scenario.simulatedTools) {
      assert.ok(tool.name, 'Tool must have a name');
      assert.ok(tool.description, 'Tool must have a description');
      assert.ok(tool.mockResult !== undefined, 'Tool must define a mock result');
    }

    for (const assertion of scenario.assertions) {
      assert.ok(assertion.id, 'Assertion must have an id');
      assert.ok(assertion.title, 'Assertion must have a title');
      assert.ok(['policy', 'tool', 'safety'].includes(assertion.category));
      assert.ok(['critical', 'warning'].includes(assertion.severity));
    }
  }
});

test('findScenario locates existing scenario by id and returns undefined for unknown', () => {
  const found = findScenario('customer_care_late_refund');
  assert.ok(found);
  assert.equal(found.id, 'customer_care_late_refund');
  assert.equal(findScenario('non_existent_scenario'), undefined);
});

test('user facing scenario copy contains zero dashes or hyphens', () => {
  for (const s of STARTER_SCENARIOS) {
    assert.doesNotMatch(s.name, DASH, `Scenario name has dash: ${s.name}`);
    assert.doesNotMatch(s.summary, DASH, `Scenario summary has dash: ${s.summary}`);
    for (const tip of s.tipsForOwner) {
      assert.doesNotMatch(tip, DASH, `Tip has dash: ${tip}`);
    }
    for (const a of s.assertions) {
      assert.doesNotMatch(a.title, DASH, `Assertion title has dash: ${a.title}`);
      assert.doesNotMatch(a.description, DASH, `Assertion description has dash: ${a.description}`);
    }
  }
});
