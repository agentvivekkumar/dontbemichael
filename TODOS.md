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

## Business mode (deferred from plan, v0.0.1 ship)

Deferred from plan: `docs/designs/business-mode-office-packs.md` (owner chose "ship, defer as P1 TODOs" on 2026-09-24).

### Enforcement compiler and the default-deny hook

**What:** Compile each agent's levels into real permissions: `dontAsk`, compiled allow/deny rules, a default-deny PreToolUse hook (Decision 4, tests T2/T3).

**Why:** Today only the prompt layer (`teamMemberGoal`) limits agents, `bypassPermissions` is still the default, and the hook fails open. "Asks before sending" is instructed, not enforced.

**Context:** `src/shared/agentDefinition.ts` already carries levels and outward capabilities; `src/main/harnessGuard.ts` shows the PreToolUse pattern. Start by compiling one agent's levels into its per-session settings.

**Effort:** L
**Priority:** P1
**Depends on:** None

### Regression test: nothing writes skip-permission flags into ~/.claude/settings.json

**What:** The mandatory regression test from Decision 18.

**Why:** The app writes per-session Claude settings; a regression that touched the owner's global settings would silently change every Claude Code session on the Mac.

**Context:** Point HOME at a temp dir, spawn through `spawnAgentCore` paths, assert `~/.claude/settings.json` is untouched.

**Effort:** S
**Priority:** P1
**Depends on:** None

### Approvals inbox (with the two-zone panel and draft-to-post flow)

**What:** Approval action payloads, an executor, and the approvals UI (Decisions 31 and Ryan's "copy to clipboard and mark posted").

**Why:** Outward actions (emails, posts, spending) need a place for the owner to say yes; Ask me covers questions only.

**Context:** Ask me is the first tab on Michael's panel now; approvals likely sit beside it.

**Effort:** XL
**Priority:** P1
**Depends on:** Enforcement compiler

### Office schedule (officeHours)

**What:** Honour each pack's `officeHours`: soft pause outside hours, office state, wired to `weeklySchedule`.

**Why:** Validated in the pack schema but never used, so the office runs around the clock regardless.

**Context:** `src/shared/officePack.ts` (officeWindow), `src/shared/weeklySchedule.ts`.

**Effort:** M
**Priority:** P1
**Depends on:** None

### Plan-limit handling

**What:** Detect Claude usage limits (StopFailure `rate_limit`, quota hooks), show an office break state and a banner.

**Why:** On smaller Claude plans the office stops mid-day with no explanation; setup now tells owners a Max plan is needed, but nothing handles hitting the limit.

**Context:** Hooks arrive in `src/main/hooks.ts`.

**Effort:** M
**Priority:** P1
**Depends on:** Attention strip

### Attention strip and owner floor layout (Decisions 25, 27)

**What:** The minimal attention strip, plain-language agent cards, approvals in the right panel.

**Why:** Owners need one place that says what needs them now.

**Context:** The floor now has OFFICE, TASKS and GRAPH views and a blocked-count badge; the strip is the next layer.

**Effort:** M
**Priority:** P1
**Depends on:** None

### Close dialog and tray (Decisions 1, 39)

**What:** A close dialog with a safe default and keyboard contract, and a tray so the office keeps running.

**Why:** Closing the window stops every agent without warning today.

**Context:** `src/renderer/src/components/QuitWarningModal.tsx` exists for quit; the close path does not use it.

**Effort:** M
**Priority:** P1
**Depends on:** None

### Per-agent levels screen (Decision 33)

**What:** A screen per agent in the order job, limits, connect.

**Why:** Autonomy is one global checkbox; owners cannot give Oscar less freedom than Pam.

**Context:** Pairs with the enforcement compiler.

**Effort:** L
**Priority:** P1
**Depends on:** Enforcement compiler

### First-success confirmation and morning report (Decision 32)

**What:** Confirm the first finished job to the owner, and a morning summary.

**Why:** New owners need proof the office works while they were away.

**Context:** Packs declare `firstAction` (Decision 29), used only in agent goals today.

**Effort:** M
**Priority:** P1
**Depends on:** None

### Owner floor narrow layout (Decision 38)

**What:** A layout for narrow windows.

**Why:** The floor and side panel crowd each other on small laptop screens.

**Context:** `src/renderer/src/App.tsx` floor area and SidebarSplitter.

**Effort:** M
**Priority:** P1
**Depends on:** None

### 14px text floor on the remaining setup screens (Decision 36)

**What:** Raise the business and team setup screens' 10 to 13px text to 14px or more.

**Why:** The owner's standing rule; the surfaces added later in the branch were already fixed.

**Context:** `src/renderer/src/components/OnboardingWizard.tsx` (business, team steps; TeamCard, PackTile).

**Effort:** S
**Priority:** P1
**Depends on:** None

## Documents and security (review items skipped for v0.0.1)

### Cap the total size of an Office file's zip entries

**What:** In `src/main/docText.ts` (unzip filter, ~line 108) cap total uncompressed bytes and entry count, not only each entry.

**Why:** A crafted .docx/.xlsx/.pptx can declare many large entries and exhaust memory in the main process, taking every agent down. Owner skipped this at ship review 2026-09-24.

**Context:** Count accepted entries and sum `originalSize` in the filter; reject past e.g. 200 MB / 5,000 entries.

**Effort:** S
**Priority:** P1
**Depends on:** None

### Refuse a "move" onto a folder that already holds an office, in main

**What:** `config:changeHome` in `src/main/index.ts` refuses mode `move` when the target has `hive/registry.json`.

**Why:** Only the Settings screen prevents copying one office over another today. Owner skipped this at ship review 2026-09-24.

**Context:** Reuse `homeFolderStatus` from `src/main/homeFolder.ts`.

**Effort:** S
**Priority:** P1
**Depends on:** None

### Parse documents off the main thread

**What:** Run PDF and OOXML extraction in a worker thread or utility process, with a time and page limit.

**Why:** Large or crafted files block every window while they parse.

**Context:** `src/main/docText.ts`; `docTextCli.ts` already runs the same code as a separate entry.

**Effort:** M
**Priority:** P2
**Depends on:** None

## Schedules

### Make the heartbeat's description honest

**What:** The heartbeat card in Schedules shows an editable description box, but the heartbeat never sends that text. It sends a summary it builds itself (`buildHeartbeatDigest`, `src/main/index.ts`). Either show the heartbeat's description as fixed text, or send the owner's text ahead of the summary.

**Why:** An owner who edits the box expects Michael to receive it. Every other schedule stopped carrying a prompt on 2026-09-25 (the label names the job and the agent's Work style says how), so the heartbeat is the one card left with a box, and it's a box that does nothing.

**Context:** Found in the 2026-09-25 agent instructions audit; the owner chose to leave the heartbeat as it is for now (it ships off). `SchedulesSection.tsx` keeps the box for `kind: 'heartbeat'` only.

**Effort:** S
**Priority:** P3
**Depends on:** nothing.

## Engines

### Make a second engine (Codex first) ready for an office

**What:** Close the gaps that keep engines other than Claude Code out of `BUILD_ENGINES`, starting with Codex, then add it to the list.

**Why:** An audit on 2026-09-24 found that the code for Codex, Gemini CLI and Antigravity exists, but none is ready for an office without Claude. Only Codex has live history (hooks, idle, messaging and resume were debugged on real workers). Every picker and voice hiring now offer only `BUILD_ENGINES`, so nothing half-working can be chosen until this is done.

**Context:** In order of impact:
1. The team always starts on the default engine: `startBusinessTeam` uses `inferAgentProvider(config.defaultCommand)` (`src/renderer/src/hooks/useHive.ts:310`), which is `claude` (`src/main/config.ts:449`), because setup saves `godProvider` but not `defaultCommand`. Ephemeral workers fall back the same way (`src/main/workerLaunch.ts:31`).
2. No cost or token data: the telemetry env is added only for Claude (`src/main/hive.ts:951`); the transcript fallback reads `~/.claude/projects` (`src/main/transcript.ts:44`); `src/main/pricing.ts` knows only Claude models. Cost views, caps, token caps and the context gauge are empty.
3. MCP servers go only into Claude's `--settings` (`src/main/hive.ts:1163`), and bundled skills only into `.claude/skills` (`src/main/hive.ts:733`).
4. Gemini and Antigravity get no extra writable directories (`--add-dir` exists for Codex only, `src/main/hive.ts:859`), so hive file writes may be refused.
5. Antigravity agents never get their standing goal, and an Antigravity Michael never gets the roster (no SessionStart/UserPromptSubmit event).
6. Memory condensing runs a hidden Claude session (`src/main/reflect.ts:279`); without Claude it does nothing.
7. Michael's prompts are written for Claude ("hive of Claude agents", `src/main/hive.ts:1519`; `INITIAL_GOD_PROMPT` in `src/renderer/src/hooks/useHive.ts:77`).
8. No permission-prompt detection for these engines (no Notification event), which matters only with auto mode off.
A live end-to-end run is required before adding an engine: Gemini has never been run for real, and Codex needs an OpenAI account with credits.

**Effort:** L
**Priority:** P3
**Depends on:** A decision to offer a second engine.

## Onboarding

### Retry team members that failed their first start

**What:** Mark `businessTeamStarted` only once every picked member is running; tell the owner who did not start.

**Why:** A member that fails at first launch is never retried and the owner is not told. Owner chose to leave it at ship review 2026-09-24.

**Context:** `startBusinessTeam` in `src/renderer/src/hooks/useHive.ts`.

**Effort:** S
**Priority:** P2
**Depends on:** None

## Settings

### Log the webhook format editor's parse error

**What:** `console.error` the raw JSON parse message in `src/renderer/src/components/triggers/WebhookSchemaEditor.tsx`, and make `error` a boolean.

**Why:** The owner now sees plain words, but nobody can see where the mistake was.

**Context:** Third review pass, 2026-09-24.

**Effort:** S
**Priority:** P2
**Depends on:** None

## Release

### Sign and notarize the Mac build with an Apple Developer ID

**What:** Add the Developer ID Application cert and notarization credentials as repo secrets (`APPLE_CERTIFICATE_P12`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`). `release.yml` and `build/notarize.cjs` already use them when present.

**Why:** 0.0.1 ships ad-hoc signed. Owners must clear a "could not verify" dialog through Privacy & Security on first open, and Squirrel.Mac cannot update an ad-hoc app in place, so every update falls back to "download the new version" instead of restart to install. macOS also forgets folder grants between versions without a stable signature.

**Context:** Needs an Apple Developer Program membership (paid, per organization). Once the secrets exist, the ad-hoc fallback in `release.yml` switches off by itself; update RELEASE.md's install steps then.

**Effort:** S (after the Apple account exists)
**Priority:** P1
**Depends on:** Apple Developer Program membership

## Repo

### Remove or rewrite the old project's website files in docs/

**What:** `docs/index.html`, `docs/blog/`, `docs/CNAME` and friends are the old project's website. (`docs/llms.txt` and `docs/llms-full.txt` were removed in the 0.0.1 land: GitHub Pages is off for this repo, so nothing served them.)

**Why:** They describe the other product.

**Context:** The website for this app lives in its own repo; keep only files the app reads at runtime (`docs/model-catalog.json`, `docs/hero.json`).

**Effort:** S
**Priority:** P3
**Depends on:** None

## Completed

### Point the contributors workflow at this fork's credit, or turn it off

**What:** `.github/workflows/contributors.yml` regenerates CONTRIBUTORS.md from this repo's merged pull requests and opens a bot pull request.

**Why:** On this fork that list would drop the original project's contributors, which the README credits.

**Context:** Found in the 0.0.1 land audit. A bot pull request is harmless until someone merges it.

**Effort:** S
**Priority:** P3
**Depends on:** None
**Completed:** 2026-09-24 (the workflow stays on; CONTRIBUTORS.md now lists this repo's contributors only, and the README no longer credits the upstream list there)
