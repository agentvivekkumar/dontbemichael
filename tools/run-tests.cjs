#!/usr/bin/env node
'use strict';
// Runs every test/*.test.cjs through `node --test`, on every platform
// (docs/designs/windows-11-installer.md). The old script passed a shell glob,
// which cmd.exe on Windows never expands, and Node 20's --test has no glob of
// its own. Extra arguments (a file filter) pass through to node --test.

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const dir = path.join(__dirname, '..', 'test');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.test.cjs')).sort().map((f) => path.join('test', f));
if (!files.length) { console.error('No test/*.test.cjs files found.'); process.exit(1); }
const r = spawnSync(process.execPath, ['--test', ...process.argv.slice(2), ...files], { stdio: 'inherit', cwd: path.join(__dirname, '..') });
process.exit(r.status ?? 1);
