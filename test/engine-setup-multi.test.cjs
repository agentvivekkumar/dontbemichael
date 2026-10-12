'use strict';

/**
 * Unified multi-engine onboarding (issue #237).
 *
 * The presets for non-Claude providers are wired, but "Get Michael ready"
 * only opened for Claude: engineSetup.ts returned `applies: false` for every
 * other engine, no credential was ever validated, and a Codex office hit its
 * first 401/429 at runtime. These checks pin the plumbing that makes a picked
 * engine actually work end to end: the per-provider credential contract, the
 * generic status read, the per-provider install, and per-provider rate-limit
 * recognition. Adding a provider to BUILD_ENGINES itself stays out of scope.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const setup = loadTs('src/main/engineSetup.ts');
const providers = loadTs('src/shared/agentProvider.ts');
const shared = loadTs('src/shared/engineSetup.ts');

test('every engine declares how the owner signs in to it', () => {
  // Value: protects=flipping BUILD_ENGINES on for an engine can never skip
  // credential validation by accident; fails_when=a preset gains no
  // credentialMethod, or codex/gemini stop declaring their key;
  // why_new=issue #237; seam=none (preset table, no I/O)
  for (const p of providers.AGENT_PROVIDER_PRESETS) {
    if (p.id === 'custom') continue;
    assert.ok(p.credentialMethod, `${p.id} declares a credentialMethod`);
  }
  assert.deepEqual(providers.credentialMethodForProvider('claude'), { kind: 'claude-account' });
  assert.deepEqual(
    providers.credentialMethodForProvider('codex'),
    { kind: 'api-key', envVar: 'OPENAI_API_KEY', label: 'OpenAI API key', backend: 'openai' }
  );
  assert.equal(providers.credentialMethodForProvider('gemini').envVar, 'GEMINI_API_KEY');
  assert.equal(providers.credentialMethodForProvider('antigravity').kind, 'cli-login');
  assert.equal(providers.credentialMethodForProvider('qwen').kind, 'none');
  assert.equal(providers.engineNeedsSignIn('claude'), true);
  assert.equal(providers.engineNeedsSignIn('codex'), true);
  assert.equal(providers.engineNeedsSignIn('qwen'), false);
});

test('a failed turn reads as the plan limit on any engine that says so', () => {
  // Value: protects=a Codex/Gemini office pauses gracefully at its quota
  // instead of dying silently; fails_when=rate_limit_exceeded or
  // RESOURCE_EXHAUSTED stop matching, or an ordinary API error starts the
  // break; why_new=issue #237; seam=none (pure strings)
  assert.equal(providers.isRateLimitFailure('rate_limit'), true, 'claude');
  assert.equal(providers.isRateLimitFailure('rate_limit_exceeded'), true, 'codex');
  assert.equal(providers.isRateLimitFailure('RESOURCE_EXHAUSTED'), true, 'gemini, any case');
  assert.equal(providers.isRateLimitFailure('resource_exhausted: quota'), true);
  assert.equal(providers.isRateLimitFailure('overloaded'), false);
  assert.equal(providers.isRateLimitFailure(''), false);
  assert.equal(providers.isRateLimitFailure(undefined), false);
  assert.equal(providers.isRateLimitFailure('ok', 'Rate limit reached, retry later'), true, 'message counts too');
  assert.deepEqual(providers.rateLimitSignalsForProvider('claude'), ['rate_limit']);
  assert.ok(providers.rateLimitSignalsForProvider('codex').includes('rate_limit_exceeded'));
});

test('the status read validates whichever engine the owner picked', async () => {
  // Value: protects=Michael never spawns on an engine whose credentials were
  // never checked; fails_when=a missing codex binary reads ready, a stored
  // key is ignored, or a local model blocks on sign-in; why_new=issue #237;
  // seam=none (hasApiKey and authStatus are plain inputs)
  const base = { isClaude: false, claudePath: null, hasKey: () => false, authStatus: async () => null };
  // Missing binary: applies, and Michael cannot start.
  assert.deepEqual(
    await setup.readEngineSetupStatus({ ...base, provider: 'codex', enginePath: null, hasApiKey: () => false }),
    { applies: true, provider: 'codex', credentialKind: 'api-key', installed: false, signedIn: false, needed: true }
  );
  // Binary + stored key: ready.
  assert.deepEqual(
    await setup.readEngineSetupStatus({ ...base, provider: 'codex', enginePath: '/usr/bin/codex', hasApiKey: () => true }),
    { applies: true, provider: 'codex', credentialKind: 'api-key', installed: true, signedIn: true, needed: false }
  );
  // Binary, no key: blocked.
  assert.deepEqual(
    await setup.readEngineSetupStatus({ ...base, provider: 'codex', enginePath: '/usr/bin/codex', hasApiKey: () => false }),
    { applies: true, provider: 'codex', credentialKind: 'api-key', installed: true, signedIn: false, needed: true }
  );
  // Install-only engine: installed is ready, no key needed.
  assert.deepEqual(
    await setup.readEngineSetupStatus({ ...base, provider: 'qwen', enginePath: '/usr/bin/qwen' }),
    { applies: true, provider: 'qwen', credentialKind: 'none', installed: true, signedIn: true, needed: false }
  );
  // Login-command engine: the probe decides, unreadable never blocks.
  assert.deepEqual(
    await setup.readEngineSetupStatus({
      ...base, provider: 'antigravity', enginePath: '/usr/bin/agy',
      authStatus: async () => ({ signedIn: true, email: 'o@example.com' })
    }),
    { applies: true, provider: 'antigravity', credentialKind: 'cli-login', installed: true, signedIn: true, email: 'o@example.com', needed: false }
  );
  assert.deepEqual(
    await setup.readEngineSetupStatus({ ...base, provider: 'antigravity', enginePath: '/usr/bin/agy' }),
    { applies: true, provider: 'antigravity', credentialKind: 'cli-login', installed: true, signedIn: null, needed: false }
  );
});

test('the Claude status shapes are untouched by the generic path', async () => {
  // Value: protects=the Ready step and the Ask me card keep working exactly as
  // pinned while other engines gain validation; fails_when=the legacy branch
  // gains provider keys or changes a shape; why_new=issue #237 generosity must
  // not move the Claude contract; seam=none
  const base = { claudePath: '/x/claude', hasKey: () => false, authStatus: async () => ({ signedIn: true, email: 'o@example.com' }) };
  assert.deepEqual(
    await setup.readEngineSetupStatus({ ...base, isClaude: true }),
    { applies: true, installed: true, signedIn: true, method: 'account', email: 'o@example.com', needed: false }
  );
  assert.deepEqual(
    await setup.readEngineSetupStatus({ ...base, isClaude: false }),
    { applies: false, installed: true, signedIn: null, needed: false }
  );
});

test('any engine binary is found without a login shell, and any engine installs visibly', () => {
  // Value: protects=status reads never freeze the app for a login shell, and
  // the install row runs something real per engine; fails_when=the PATH is
  // not searched for codex/gemini, or a provider without an installer prints
  // nothing actionable; why_new=issue #237; seam=none (exists injected)
  const find = (provider, pathEnv, have) =>
    setup.findEngineBinary({ provider, platform: 'darwin', pathEnv, home: '/Users/o', exists: (p) => have.includes(p) });
  assert.equal(find('codex', '/usr/bin:/opt/n/bin', ['/opt/n/bin/codex']), '/opt/n/bin/codex');
  assert.equal(find('gemini', '/usr/bin', ['/Users/o/.local/bin/gemini']), '/Users/o/.local/bin/gemini');
  assert.equal(find('codex', '/usr/bin', []), null);
  assert.equal(find('claude', '/usr/bin', ['/usr/bin/claude']), '/usr/bin/claude', 'claude delegates to the fast lookup');
  assert.match(setup.engineInstallScript('claude', 'darwin'), /claude\.ai\/install\.sh/);
  assert.match(setup.engineInstallScript('codex', 'darwin'), /@openai\/codex/);
  assert.match(setup.engineInstallScript('gemini', 'darwin'), /gemini-cli/);
  assert.doesNotMatch(setup.engineInstallScript('codex', 'win32'), /"/, 'no double quotes on Windows');
  assert.match(setup.engineInstallScript('custom', 'darwin'), /by hand/, 'no installer: an honest manual hint');
});

test('the Ready step opens for the picked engine, with sign-in only where it validates', () => {
  // Value: protects=a picked engine always lands on a Ready step that checks
  // it, instead of skipping validation; fails_when=custom gains a step, or a
  // key engine loses its sign-in row; why_new=issue #237; seam=none
  assert.equal(shared.engineSetupStepApplies('claude'), true);
  assert.equal(shared.engineSetupStepApplies('codex'), true);
  assert.equal(shared.engineSetupStepApplies('gemini'), true);
  assert.equal(shared.engineSetupStepApplies('custom'), false);
  assert.equal(shared.engineSetupStepApplies(undefined), false);
  assert.equal(shared.engineSetupValidatesSignIn('claude'), true);
  assert.equal(shared.engineSetupValidatesSignIn('codex'), true);
  assert.equal(shared.engineSetupValidatesSignIn('qwen'), false);
});

test('main, the bridges and the steps agree on the multi-engine contract', () => {
  // Value: protects=the pieces meet: status resolves a non-Claude binary and
  // key, the hook break hears non-Claude limits, and the step passes the
  // picked engine through; fails_when=one side stays Claude-only; why_new=the
  // units above run each piece alone; seam=source pins, main has no IPC harness
  const main = read('src/main/index.ts');
  assert.match(main, /credentialMethodForProvider\(resolved\)/, 'status resolves the credential contract');
  assert.match(main, /provider: resolved,\s*enginePath,/);
  assert.match(main, /engineInstallScript\(resolved, process\.platform\)/);
  assert.match(main, /engineSetup:signIn.*provider\?: unknown/s, 'sign-in takes the picked engine');
  assert.match(main, /credential\.command\.trim\(\)\.split/, 'a login command runs visibly');
  const hooks = read('src/main/hooks.ts');
  assert.match(hooks, /isRateLimitFailure\(p\.error, p\.message\)/);
  const hive = read('src/main/hive.ts');
  assert.match(hive, /entry\('rate_limit_exceeded'\)/);
  assert.match(hive, /entry\('RESOURCE_EXHAUSTED'\)/);
  const wizard = read('src/renderer/src/components/OnboardingWizard.tsx');
  assert.match(wizard, /const withReady = engineSetupStepApplies\(godProvider\);/);
  const ready = read('src/renderer/src/components/GetMichaelReady.tsx');
  assert.match(ready, /window\.cth\.engineSetupInstall\(engine\)/);
  assert.match(ready, /window\.cth\.engineSetupSignIn\(engine\)/);
  assert.match(ready, /window\.cth\.engineSetupUseApiKey\(keyDraft, apiBackend\)/);
  const preload = read('src/preload/index.ts');
  assert.match(preload, /engineSetupInstall: \(provider\?: AgentProvider\)/);
  assert.match(preload, /engineSetupUseApiKey: \(key: string, backend\?: string\)/);
});
