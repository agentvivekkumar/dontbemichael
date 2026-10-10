'use strict';

/**
 * Issue #63: three agent trust-boundary leaks.
 *  1) Owner Claude plugins stay off in agent sessions (per-session settings).
 *  2) md-mail.mcp.json (broker token) lives under harnessHome/private, is
 *     deleted on teardown, and orphans are swept at boot.
 *  3) Owner dock mail and state leave hive/agents/human.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

test('shared helpers pin private paths and plugin disable map', () => {
  // Value: protects=token and owner dock paths stay out of hive/agents, and only enabled plugins are flipped off; fails_when=helpers move back under agents/ or keep true; why_new=#63; seam=none
  const src = read('src/shared/agentPrivatePaths.ts');
  assert.match(src, /join\(harnessHome, 'private'\)/);
  assert.match(src, /join\(privateRoot\(harnessHome\), 'agent-mcp', agentId\)/);
  assert.match(src, /'md-mail\.mcp\.json'/);
  assert.match(src, /join\(hiveRoot, 'agents', agentId, 'md-mail\.mcp\.json'\)/);
  assert.match(src, /join\(privateRoot\(harnessHome\), 'owner'\)/);
  assert.match(src, /join\(hiveRoot, 'agents', 'human', 'outbox', '\.sent'\)/);
  assert.match(src, /join\(hiveRoot, 'agents', 'human', 'state\.json'\)/);
  assert.match(src, /if \(on === true \|\| on === 'true'\) out\[id\] = false;/);
});

test('spawn writes md-mail under private/, teardown deletes it, boot sweeps orphans', () => {
  // Value: protects=token file never stays in hive/agents and does not outlive the PTY; fails_when=legacy path returns, or remove/sweep helpers disappear; why_new=#63 mail token; seam=source pin
  const main = read('src/main/index.ts');
  assert.match(main, /mdMailMcpPath\(home, agentId\)/);
  assert.match(main, /unlinkSync\(legacyMdMailMcpPath\(root, agentId\)\)/);
  assert.match(main, /function removeMdMailMcp\(/);
  assert.match(main, /try \{ removeMdMailMcp\(agentId \?\? id\); \} catch/);
  assert.match(main, /function sweepOrphanAgentMcp\(/);
  assert.match(main, /try \{ sweepOrphanAgentMcp\(\); \} catch/);
  assert.doesNotMatch(main, /join\(root, 'agents', agentId, 'md-mail\.mcp\.json'\)/);
});

test('hive owner dock uses private/owner and migrates agents/human once', () => {
  // Value: protects=owner text is not writable as agents/human; fails_when=ownerSentDir goes back under agentDir\('human'\); why_new=#63 owner paths; seam=source pin
  const hive = read('src/main/hive.ts');
  assert.match(hive, /privateOwnerSentDir\(home\)/);
  assert.match(hive, /privateOwnerStatePath\(home\)/);
  assert.match(hive, /migrateOwnerPrivate\(/);
  assert.match(hive, /this\.migrateOwnerPrivate\(\);/);
  assert.match(hive, /legacyOwnerSentDir\(root\)/);
  assert.doesNotMatch(hive, /ownerSentDir\(\): string \{ return join\(this\.agentDir\('human'\)/);
});

test('agent session settings turn the owner\'s enabled plugins off', () => {
  // Value: protects=plugin skills/hooks do not ride into agent sessions; fails_when=enabledPlugins block leaves hookSettings; why_new=#63 plugins; seam=source pin
  const hive = read('src/main/hive.ts');
  assert.match(hive, /ownerPluginsOffForSession\(/);
  assert.match(hive, /enabledPlugins: disabledPlugins/);
  assert.match(hive, /pluginsDisabledForSession\(raw\.enabledPlugins\)/);
});
