'use strict';
/**
 * Who talks to whom: the hover cards count messages, and one is the usual
 * count. A pair that swapped one message reads "1 message", not "1 messages",
 * and a team member with one link reads "1 message link".
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
const src = read('src/renderer/src/components/MemoryGraphPanel.tsx');
const locale = (loc) => JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).memoryGraph;

test('a count of one picks the singular string', () => {
  assert.match(src, /t\(node\.degree === 1 \? 'memoryGraph\.messageLink' : 'memoryGraph\.messageLinks', \{ count: node\.degree \}\)/);
  assert.match(src, /t\(edge\.weight === 1 \? 'memoryGraph\.messageCount' : 'memoryGraph\.messagesCount', \{ count: edge\.weight \}\)/);
});

test('English says one message and one message link', () => {
  const en = locale('en');
  assert.equal(en.messageCount, '{{count}} message');
  assert.equal(en.messagesCount, '{{count}} messages');
  assert.equal(en.messageLink, '{{count}} message link');
  assert.equal(en.messageLinks, '{{count}} message links');
});

test('every language has the singular strings and keeps the count', () => {
  for (const loc of ['en', 'zh-CN', 'ar']) {
    const d = locale(loc);
    for (const k of ['messageCount', 'messageLink']) assert.match(d[k], /\{\{count\}\}/, `${loc} ${k}`);
  }
});
