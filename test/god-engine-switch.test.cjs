'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

// config.ts resolves its file through Electron's app.getPath(). Point that one
// dependency at a throwaway userData root so this test never touches the real
// application config.
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'md-god-engine-'));
const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron,
  filename: electron,
  loaded: true,
  exports: { app: { getPath: () => userData } }
};

const { writeConfig, readConfig } = loadTs('src/main/config.ts');
const { providerPreset } = loadTs('src/shared/agentProvider.ts');

test.after(() => fs.rmSync(userData, { recursive: true, force: true }));

// Settle the one-shot migration first, as a real start-up does.
writeConfig({});
readConfig();

test('switching Michael to another engine alone gives him that engine\'s model', () => {
  writeConfig({ godProvider: 'claude', godModel: 'claude-opus-5-5' });

  writeConfig({ godProvider: 'codex' });

  const cfg = readConfig();
  assert.equal(cfg.godProvider, 'codex');
  assert.equal(cfg.godModel, providerPreset('codex').recommendedOrchestratorModel);
  assert.notEqual(cfg.godModel, 'claude-opus-5-5');
});

test('an engine and model saved together keep the model given', () => {
  writeConfig({ godProvider: 'claude', godModel: 'claude-opus-5-5' });

  writeConfig({ godProvider: 'qwen', godModel: 'qwen-max' });

  const cfg = readConfig();
  assert.equal(cfg.godProvider, 'qwen');
  assert.equal(cfg.godModel, 'qwen-max');
});

test('saving the same engine again keeps the chosen model', () => {
  writeConfig({ godProvider: 'claude', godModel: 'claude-fable-5-1' });

  writeConfig({ godProvider: 'claude' });

  assert.equal(readConfig().godModel, 'claude-fable-5-1');
});
