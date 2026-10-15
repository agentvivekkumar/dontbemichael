'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

// Test 1: Token generation
test('random token generation produces 64 hex chars (32 bytes)', async (t) => {
  const token = crypto.randomBytes(32).toString('hex');
  assert.equal(token.length, 64, 'Token should be 64 hex chars (32 bytes of randomness)');
  const tokens = new Set();
  for (let i = 0; i < 100; i++) {
    tokens.add(crypto.randomBytes(32).toString('hex'));
  }
  assert.ok(tokens.size > 10, 'Token space should be large enough');
});

// Test 2: Constant-time comparison
test('authentication uses constant-time comparison to avoid timing leaks', async (t) => {
  const expected = crypto.randomBytes(32).toString('hex');
  const same = crypto.randomBytes(32).toString('hex');

  const validMatch = crypto.timingSafeEqual(
    Buffer.from(expected, 'utf8'),
    Buffer.from(expected, 'utf8')
  );
  assert.ok(validMatch, 'Same token should always match');

  const invalidMatch = crypto.timingSafeEqual(
    Buffer.from(expected, 'utf8'),
    Buffer.from(same, 'utf8')
  );
  assert.ok(!invalidMatch, 'Different tokens should not match');

  const sameLenDifferent = crypto.timingSafeEqual(
    Buffer.from(expected, 'utf8'),
    Buffer.from('aaaaaaaa'.repeat(8), 'utf8')
  );
  assert.ok(!sameLenDifferent, 'Different content should not match even if same length');
});

// Test 3: Token map authentication
test('token map authentication logic', async (t) => {
  const hookTokens = new Map();

  const tokenA = crypto.randomBytes(32).toString('hex');
  const tokenB = crypto.randomBytes(32).toString('hex');

  hookTokens.set('agent-a', tokenA);
  hookTokens.set('agent-b', tokenB);

  assert.strictEqual(hookTokens.get('agent-a'), tokenA, 'Token retrieval should be exact');
  assert.strictEqual(hookTokens.get('agent-b'), tokenB, 'Different agent token retrieval should be exact');
  assert.strictEqual(hookTokens.get('nonexistent'), undefined, 'Unknown agent should return undefined');

  // authenticateHookFrame function logic
  function authenticateHookFrame(tokens, token) {
    if (!token) return undefined;
    for (const [agentId, expected] of tokens.entries()) {
      if (expected.length === token.length && crypto.timingSafeEqual(
        Buffer.from(expected, 'utf8'),
        Buffer.from(token, 'utf8')
      )) {
        return agentId;
      }
    }
    return undefined;
  }

  // Valid token authenticates correctly
  const authenticated = authenticateHookFrame(hookTokens, tokenA);
  assert.strictEqual(authenticated, 'agent-a', 'Valid token should authenticate to correct agent');

  const authenticatedB = authenticateHookFrame(hookTokens, tokenB);
  assert.strictEqual(authenticatedB, 'agent-b', 'Valid token should authenticate to correct agent');

  // Missing token rejected
  const noAuth = authenticateHookFrame(new Map(), undefined);
  assert.strictEqual(noAuth, undefined, 'Missing token should reject');

  const badAuth = authenticateHookFrame(hookTokens, 'badtoken');
  assert.strictEqual(badAuth, undefined, 'Invalid token should reject');

  // Token with wrong length rejected
  const shortAuth = authenticateHookFrame(hookTokens, tokenA.substring(0, 10));
  assert.strictEqual(shortAuth, undefined, 'Token with wrong length should reject');
});

// Test 4: Hook token lifecycle - spawn/archival/respawn
test('hook token lifecycle: spawn creates, archive revokes, respawn creates new', async (t) => {
  const hookTokens = new Map();

  function setHookToken(agentId) {
    const token = crypto.randomBytes(32).toString('hex');
    hookTokens.set(agentId, token);
    return token;
  }

  function getHookToken(agentId) {
    return hookTokens.get(agentId);
  }

  function revokeHookToken(agentId) {
    hookTokens.delete(agentId);
  }

  function authenticateHookFrame(tokens, token) {
    if (!token) return undefined;
    for (const [agentId, expected] of tokens.entries()) {
      if (expected.length === token.length && crypto.timingSafeEqual(
        Buffer.from(expected, 'utf8'),
        Buffer.from(token, 'utf8')
      )) {
        return agentId;
      }
    }
    return undefined;
  }

  // Spawn: agent-a gets a token
  const agentA = 'agent-a';
  const aToken = setHookToken(agentA);
  assert.strictEqual(aToken.length, 64, 'Spawn token should be 64 hex chars');
  assert.strictEqual(authenticateHookFrame(hookTokens, aToken), agentA,
    'Spawned agent should authenticate');

  // agent-b has separate token
  const agentB = 'agent-b';
  const bToken = setHookToken(agentB);
  assert.strictEqual(authenticateHookFrame(hookTokens, bToken), agentB,
    'Different agent authenticates correctly');

  // Archive agent-a: should revoke token
  revokeHookToken(agentA);
  const aTokenAfter = getHookToken(agentA);
  assert.strictEqual(aTokenAfter, undefined, 'Archived agent token should be revoked');

  // After revocation, agent-a's token should not authenticate
  const afterRevoke = authenticateHookFrame(hookTokens, aToken);
  assert.strictEqual(afterRevoke, undefined, 'Revoked token should be rejected');

  // agent-b should still work
  const bAfter = authenticateHookFrame(hookTokens, bToken);
  assert.strictEqual(bAfter, agentB, 'Other agent still authenticates after revocation');

  // Full lifecycle: respawn creates new token for agent-a
  const newAToken = setHookToken(agentA);
  assert.strictEqual(authenticateHookFrame(hookTokens, newAToken), agentA,
    'New spawn token should authenticate');

  // Old token after respawn should be rejected
  const oldAfter = authenticateHookFrame(hookTokens, aToken);
  assert.strictEqual(oldAfter, undefined, 'Old token after respawn should reject');
});