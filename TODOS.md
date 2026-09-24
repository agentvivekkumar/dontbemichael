# TODOS

## Connections

### Third-party rate-limit backoff in the broker

**What:** Per-connection rate-limit handling in the loopback broker: read the provider's `Retry-After` or rate-limit headers, back off, and queue instead of hammering.

**Why:** Gmail, Google Business Profile, Meta and QuickBooks all throttle. Today the broker passes the upstream status straight back to the calling agent with no retry (`src/main/integrationBroker.ts:264`, `:272`) behind a 30-second timeout, so a throttled provider reads to the agent as a failure and it retries blind, burning plan quota.

**Context:** Surfaced by the outside-voice pass during the 2026-09-15 engineering review of `docs/designs/business-mode-office-packs.md`. Decision 22 established a serialized executor with at most one in-flight execution per connection, and named that as the right home for backoff without deciding to build it. Decision 10's transient-versus-terminal retry classification covers approvals only, not ordinary agent calls. Start in the executor: classify 429 and 503 with `Retry-After`, hold the connection's queue, and surface a persistent throttle on the attention strip (Decision 25) rather than retrying silently forever.

**Effort:** M
**Priority:** P2
**Depends on:** Decision 2 (per-agent grants), Decision 22 (serialized executor); only relevant from Phase 2, when agents make real third-party calls.

### Message when the OS cannot encrypt stored credentials

**What:** A plain-language path for when Electron's `safeStorage` reports encryption unavailable, so connecting an account fails visibly instead of silently.

**Why:** The secret store refuses to write without OS encryption — "a secret is never written unless `safeStorage.isEncryptionAvailable()`" (`src/main/integrations.ts:12`, enforced at `:111`). That is the correct security behavior, but no screen explains it. On Linux without a keyring, or a Mac with a damaged keychain, the owner clicks Connect and nothing happens.

**Context:** Surfaced by the outside-voice pass during the 2026-09-15 engineering review. The onboarding failure table in the design doc covers cancelled sign-ins, wrong accounts, denied scopes and expired tokens, but not this one. Cheapest fix: check availability before opening the sign-in window in the Connector Center, say what is wrong and what to do, and gate any credential write on the same check. One test for the unavailable case.

**Effort:** S
**Priority:** P2
**Depends on:** Decision 8 (product-owned connections) and the Connector Center screen; only bites once the product holds credentials itself, from Phase 2.
