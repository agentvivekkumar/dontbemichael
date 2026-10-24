#!/usr/bin/env node
// Reports which ESLint rules already pass on the current tree, so rules can be
// enabled one batch at a time without asking anyone to fix code first.
//
// Run `npm run lint:rules`. Exit code is 0 even when rules fail: this is a
// report, not a gate. `npm run lint` is the gate.

import { fileURLToPath } from 'node:url';
import { builtinRules } from 'eslint/use-at-your-own-risk';
import { ESLint } from 'eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import { plugin as tsPlugin } from 'typescript-eslint';
import config from '../eslint.config.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE_FILES = ['**/*.{js,mjs,cjs,ts,tsx}'];
const TS_FILES = ['**/*.{ts,tsx}'];

// Rules that are off unless given options. Enabling one says nothing about the
// codebase, so they are kept out of the report.
const OPTION_ONLY = new Set([
  '@typescript-eslint/no-restricted-types',
  'consistent-this',
  'id-denylist',
  'id-match',
  'no-restricted-exports',
  'no-restricted-globals',
  'no-restricted-imports',
  'no-restricted-properties',
  'no-restricted-syntax'
]);

function usable(rule) {
  return !rule.meta?.deprecated && !rule.meta?.docs?.requiresTypeChecking;
}

function ruleNames(rules, prefix = '') {
  return Object.entries(rules)
    .filter(([, rule]) => usable(rule))
    .map(([name]) => `${prefix}${name}`)
    .filter((name) => !OPTION_ONLY.has(name))
    .sort();
}

const coreRules = ruleNames(Object.fromEntries(builtinRules));
const tsRules = ruleNames(tsPlugin.rules, '@typescript-eslint/');
const hooksRules = ['exhaustive-deps', 'rules-of-hooks'].map((name) => `react-hooks/${name}`);

// Rules already on in eslint.config.mjs are not candidates: `npm run lint`
// already guards them. This keeps the report focused on the next batch.
function enabledRules(configArray) {
  const enabled = new Set();
  for (const block of configArray) {
    for (const [name, value] of Object.entries(block.rules ?? {})) {
      const severity = Array.isArray(value) ? value[0] : value;
      if (severity !== 'off' && severity !== 0) enabled.add(name);
    }
  }
  return enabled;
}

const alreadyEnabled = enabledRules(config);
const isCandidate = (rule) => !alreadyEnabled.has(rule);

// Core rules apply everywhere; TS rules only to TypeScript. Type-aware rules
// are skipped: this config does not generate parser services yet, and a rule
// that cannot read types would report a parser error rather than a result.
const candidates = [...coreRules, ...tsRules, ...hooksRules].filter(isCandidate);
const overrideConfig = [
  ...config,
  {
    files: SOURCE_FILES,
    rules: Object.fromEntries(coreRules.filter(isCandidate).map((rule) => [rule, 'error']))
  },
  {
    files: TS_FILES,
    rules: Object.fromEntries(tsRules.filter(isCandidate).map((rule) => [rule, 'error']))
  },
  {
    files: TS_FILES,
    rules: Object.fromEntries(hooksRules.filter(isCandidate).map((rule) => [rule, 'error']))
  }
];

const eslint = new ESLint({
  cwd: ROOT,
  overrideConfigFile: true,
  overrideConfig
});

const results = await eslint.lintFiles(['.']);

const problems = new Map();
const suppressed = new Map();
const fatal = [];
const bump = (map, rule) => map.set(rule, (map.get(rule) ?? 0) + 1);

for (const result of results) {
  for (const message of result.messages) {
    if (message.ruleId) bump(problems, message.ruleId);
    else if (message.fatal) fatal.push(`${result.filePath}: ${message.message}`);
  }
  for (const message of result.suppressedMessages) {
    if (message.ruleId) bump(suppressed, message.ruleId);
  }
}

const ready = [];
const suppressedOnly = [];
const blocked = [];

for (const rule of candidates) {
  const failures = problems.get(rule) ?? 0;
  const skips = suppressed.get(rule) ?? 0;
  if (failures > 0) blocked.push({ rule, failures });
  else if (skips > 0) suppressedOnly.push({ rule, skips });
  else ready.push(rule);
}

const width = Math.max(...blocked.map(({ rule }) => rule.length), 0);

console.log(`Linted ${results.length} files with ${candidates.length} candidate rules.`);
console.log(`Skipped ${alreadyEnabled.size} rules already enabled in eslint.config.mjs.\n`);

if (fatal.length) {
  console.log(`Could not parse ${fatal.length} file(s):`);
  for (const line of fatal.slice(0, 10)) console.log(`  ${line}`);
  console.log('');
}

console.log(`READY TO ENABLE (${ready.length})`);
console.log('These report zero problems and rely on no disable directives.');
for (const rule of ready) console.log(`  ${rule}`);
console.log('');

console.log(`PASSING ONLY BECAUSE OF DISABLE DIRECTIVES (${suppressedOnly.length})`);
console.log('Leave these off: the clean result is not the code following the rule.');
for (const { rule, skips } of suppressedOnly.sort((a, b) => b.skips - a.skips)) {
  console.log(`  ${rule} (${skips} suppressed)`);
}
console.log('');

console.log(`NOT YET CLEAN (${blocked.length})`);
for (const { rule, failures } of blocked.sort((a, b) => b.failures - a.failures)) {
  console.log(`  ${rule.padEnd(width)}  ${failures}`);
}
