'use strict';

/**
 * Onboarding step 1 cannot be passed without a business name, a location and a
 * business type. Agents write as this business, so an office with no name or
 * place ends up drafting mail signed "your business".
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { missingBusinessFields } = loadTs('src/shared/businessProfile.ts');

const complete = { name: 'Pho Saigon Kitchen', location: 'Austin, TX', type: 'restaurant-food' };

test('a complete step 1 has nothing missing', () => {
  assert.deepEqual(missingBusinessFields(complete), []);
});

test('each field is required on its own', () => {
  assert.deepEqual(missingBusinessFields({ ...complete, name: '' }), ['name']);
  assert.deepEqual(missingBusinessFields({ ...complete, location: '' }), ['location']);
  assert.deepEqual(missingBusinessFields({ ...complete, type: undefined }), ['type']);
});

test('whitespace is not an answer', () => {
  assert.deepEqual(missingBusinessFields({ ...complete, name: '   ', location: '\t\n' }), ['name', 'location']);
});

test('an untouched screen reports everything, in on-screen order', () => {
  assert.deepEqual(missingBusinessFields({ name: '', location: '' }), ['name', 'location', 'type']);
});

test('"Something else" counts as a chosen type', () => {
  assert.deepEqual(missingBusinessFields({ ...complete, type: '__other__' }), []);
});

test('location format is not policed: "Austin TX" and non-US places are real answers', () => {
  for (const location of ['Austin TX', 'Toronto, ON', 'Taipei']) {
    assert.deepEqual(missingBusinessFields({ ...complete, location }), [], location);
  }
});
