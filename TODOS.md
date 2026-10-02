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

## Attachments (from the Codex adversarial review of design/studio-v2, 2026-10-01)

### Keep pasted screenshots somewhere durable

**What:** A pasted screenshot is saved to the OS temp folder (`clipboard:saveImage` in `src/main/index.ts`), and only that path goes into the message. Save it in an app folder tied to the message instead, and delete it once the message is delivered or removed, and on startup.

**Why:** A screenshot pasted into a busy team member's queue is persisted as a temp path. If the app quits or the Mac restarts before delivery, the restored queue can send a path that no longer exists, and every pasted image stays in temp until the OS clears it.

**Context:** This predates the Studio redesign (the queue composer used it already); the redesign also lets Talk to Michael paste screenshots through `src/renderer/src/components/pasteAttachments.ts`, though those are sent at once.

**Effort:** S
**Priority:** P2
**Depends on:** None

## Mailboxes (deferred from ship of feat/multi-mailbox, 2026-09-26)

### Keep each agent's mail pass out of other agents' reach

**What:** Move each agent's `md-mail.mcp.json` (it holds that agent's broker token) out of the shared hive folder, or block other agents from reading `<hive>/agents/<other>/md-mail.mcp.json`, and delete it when the agent's terminal closes.

**Why:** Sandboxed team agents cannot reach the broker, but Michael runs unsandboxed and could read a Can send agent's token and send from its mailbox. Found in the pre-landing security review (`src/main/index.ts`, the md-mail block before `ptyManager.spawn`).

**Effort:** S
**Priority:** P1

### Log every mail call

**What:** One broker log line per md-mail call: agent, mailbox, operation, result and duration.

**Why:** Plan Section 8. Today there is no record of which agent used which mailbox. `MailDeps.log` exists in `src/main/mail.ts` and is never called.

**Context:** Deferred from plan: docs/designs/multi-mailbox.md

**Effort:** S
**Priority:** P1

### Say "cannot check email" beside a schedule

**What:** When a schedule's agent has email off, show a short note on that schedule ("Pam cannot check email") in the On a schedule section and the office schedule.

**Why:** Plan CEO Section 4. A mail check schedule on an agent without email is silently ignored.

**Context:** Deferred from plan: docs/designs/multi-mailbox.md

**Effort:** S
**Priority:** P1

### A build switch for the mailbox feature

**What:** A `buildFeatures.ts` flag that hides Mailboxes and the Email section, with the hook falling back to the Claude account switch alone when off.

**Why:** Plan Section 9 rollout.

**Context:** Deferred from plan: docs/designs/multi-mailbox.md

**Effort:** S
**Priority:** P1

### Note the Microsoft plan change in the office packs doc

**What:** Update Decision 8 in `docs/designs/business-mode-office-packs.md` to say MB-0 replaced the Microsoft app id in builds.

**Context:** Deferred from plan: docs/designs/multi-mailbox.md

**Effort:** XS
**Priority:** P1

### Read one email without downloading its attachments

**What:** `MailService.read` fetches the whole message, attachments included, before trimming the text to 50K. Fetch the body structure plus the text part only, and take attachment names and sizes from the structure.

**Why:** A 25 MB message is held in memory in the main process for one read.

**Effort:** M
**Priority:** P2

### Page a search without searching again

**What:** Each search page re-runs the full IMAP SEARCH (ALL with no filters) and sorts every UID. Cache the UID list per mailbox and query for a short time, or default an unfiltered search to a recent window.

**Effort:** S
**Priority:** P2

### Back the Claude account switch with more than the hook

**What:** The Your Claude account switch is enforced only by the PreToolUse hook, which lets calls through when the hook cannot reach the app, and matches connectors by server name. Also keep the connectors out at spawn when the switch is off, and match on tool names.

**Effort:** M
**Priority:** P2

### Close a stale "needs you" card after an edit race

**What:** In `mail:save` (`src/main/index.ts`), close the mailbox's Ask me card whenever a fix succeeds, not only when the mailbox was needs-attention before the login test. A failure during the test can open the card and leave it open.

**Effort:** XS
**Priority:** P3

## Update notices (deferred from ship of feat/claude-code-update-notice, 2026-09-30)

### Translate the update surfaces

**What:** Move the Claude Code update toast and chip (`CliUpdateNotice.tsx`), the app-update toast and badge, and the quit dialog's closing-time wording into en/zh-CN/ar.

**Why:** All of them are English only today, while most screens are translated; owner chose to translate them together rather than one notice at a time.

**Effort:** M
**Priority:** P3

### Say "closing" in dev builds when reopen is skipped

**What:** In dev (`ELECTRON_RENDERER_URL` set) the app quits instead of relaunching, but the dialog still says "reopening".

**Why:** Cosmetic, dev only; the event could carry whether a relaunch will really happen.

**Effort:** S
**Priority:** P4

## Secret store (deferred from ship of fix/atomic-secret-store, 2026-09-30)

### Retry the secrets rename on Windows

**What:** Retry `renameSync` a few times with a short backoff on EPERM/EBUSY/EACCES in `src/main/atomicFile.ts`.

**Why:** On Windows, antivirus or backup tools holding the file open make the rename fail; the save then fails (safely) and the owner sees an error.

**Effort:** S
**Priority:** P3

### Sweep leftover secrets temp files

**What:** On first secret-store access, remove `integration-secrets.json.*.tmp` older than a minute.

**Why:** A crash inside the write window leaves a 0600 ciphertext temp file that nothing reads.

**Effort:** S
**Priority:** P4

### Say when deleting a secret did nothing

**What:** `deleteSecret` stays lenient on an unreadable file (right for callers without error handling), but callers report success while the old ciphertext stays.

**Why:** A removed mailbox or key can look deleted while its encrypted secret remains in the file.

**Effort:** S
**Priority:** P3

## QuickBooks through the Claude account (deferred from ship of feat/qbo-claude-channel, 2026-09-30)

### Stop a nested Claude from reaching the account's connectors

**What:** Keep agents from starting their own `claude` (for example `claude -p`) outside the app's hooks, or turn off the Claude account's connectors for such runs.

**Why:** The QuickBooks switch and Capabilities are enforced by the app's PreToolUse hook, which reaches an agent only through `--settings` (`src/main/hive.ts`). A nested Claude started from Bash has no hook but inherits the account's QuickBooks (and email), so the switch off is not a hard guarantee. Stated in CHANGELOG 0.0.11.

**Effort:** M
**Priority:** P1

### Recognise the connector behind an opaque server name

**What:** When the connector's server has a UUID-like name, 16 of its tools (including `money_onboarding_application_submit`) are not recognised as QuickBooks and are not gated.

**Why:** Claude Code names claude.ai connectors `claude_ai_Intuit_QuickBooks`, which matches; a differently named server would not. Match on the connector URL from `claude mcp list` or on the full tool catalog.

**Effort:** S
**Priority:** P2

### Subagents keep their parent's QuickBooks access

**What:** Tag hook payloads with the harness agent id so a subagent's own `agent_id` does not replace it.

**Why:** If Claude Code sends a subagent id, the hook finds no capability and refuses Oscar's delegated QuickBooks reads (fails closed).

**Effort:** S
**Priority:** P3

### Base the QuickBooks default on the role, not the agent id

**What:** Give hired agents with a books role the on + Read only default.

**Why:** Only an agent whose id is literally `oscar` gets it (`booksReadRoleIds` in `src/main/index.ts`); a bookkeeper hired later starts off.

**Effort:** S
**Priority:** P3

### Say "couldn't reach QuickBooks" when the connector failed

**What:** Show a separate message for `✘ Failed to connect` instead of "needs you to sign in again".

**Why:** A network or server failure tells the owner to sign in.

**Effort:** S
**Priority:** P3

### Status check on Windows with the npm Claude shim

**What:** Run `claude.cmd` through the Windows shim handling the pty module uses.

**Why:** `execFile` refuses `.cmd` files, so the status is always "Couldn't check" on Windows npm installs. Windows builds are not shipped yet.

**Effort:** S
**Priority:** P3

### Status check side effects

**What:** Stop child MCP servers `claude mcp list` starts when the 30 s timeout kills it; avoid overlapping runs.

**Why:** The check starts every configured MCP server; a timeout can leave them running.

**Effort:** S
**Priority:** P3

### Show a locally added QuickBooks server in the status

**What:** Read non-`claude.ai` QuickBooks servers from `claude mcp list` too.

**Why:** A QuickBooks server added with `claude mcp add` is gated but Settings says it is not connected.

**Effort:** S
**Priority:** P3

### Validate the agent id when saving QuickBooks access

**What:** Refuse ids that are not on the roster in `quickbooks:setAccess`.

**Why:** Any string is written into `agentCapabilities` and would apply to a future agent with that id.

**Effort:** S
**Priority:** P4

## Closing time (deferred from ship of feat/closing-time-progress, 2026-09-29)

### Feed each row's latest line from the agent's transcript

**What:** Show the last thing each agent said under its row, read from its Claude transcript.

**Why:** The row's "latest line" was removed before release because `recentAssistantText` is only set by `src/renderer/src/mocks/mockEvents.ts`; real agents never fill it. The owner asked for it to tell a long process from a stuck one.

**Effort:** M
**Priority:** P2

### Rows in a second window

**What:** Give the closing-time rows names and detail in every window, not only the one that saw the hook events.

**Why:** Detail lives in the renderer store of the window that received `hive:hookEvent`; another window shows names but no detail.

**Effort:** S
**Priority:** P3

### An agent respawned mid-close

**What:** Decide what happens to a row when an agent's terminal restarts while closing time runs.

**Why:** A respawned worker becomes live again and is waited on, but its row and Michael's "terminal ended" note may already be gone.

**Effort:** S
**Priority:** P3

### Row still names a finished tool

**What:** After PostToolUse the row falls back to the action caption ("using Bash") and keeps counting minutes.

**Why:** The owner can read a finished step as still running.

**Effort:** S
**Priority:** P3

### A refused tool call still shows its detail

**What:** PreToolUse that the hook denies (paused or gated) still sends `detail`.

**Why:** The row names a step that never ran.

**Effort:** S
**Priority:** P3

### Parallel tool calls clear each other's detail

**What:** Track detail per tool call so one call's PostToolUse does not clear another's.

**Why:** With parallel calls, the row goes blank while a call is still running.

**Effort:** S
**Priority:** P3

### Visible focus when the list takes focus

**What:** The row list's focus fallback (`tabIndex={-1}`, no outline) is invisible, including after Michael's Remind.

**Why:** Keyboard users lose their place after an action.

**Effort:** S
**Priority:** P3

### Tests for the focus fallback and a post-tool row

**What:** Add tests for the listRef focus fallback and a describeRow case after PostToolUse; fix the stale `actionAt` docstring.

**Why:** Both paths are untested.

**Effort:** S
**Priority:** P3

### Replace the source-regex dialog tests with pure helpers

**What:** Move the checks in `test/closing-time-dialog.test.cjs` that grep component source into tested helpers.

**Why:** They break on harmless edits (comments, added props) and passed review cycles several times only after loosening.

**Effort:** M
**Priority:** P3

### Archiving a live agent during closing time

**What:** Archiving through voice or `hive:setArchived` drops the agent from the wait list but does not call `closingTime.refresh` or tell Michael.

**Why:** Michael can keep waiting for an ACK that never comes until the 6-minute timeout.

**Effort:** S
**Priority:** P3

### Mark the detail line as the agent's own words

**What:** The detail is agent-written text shown where the owner decides to close without someone.

**Why:** An agent can write "safe to close without me"; the owner's choice is steered by untrusted text.

**Effort:** S
**Priority:** P3

### Limit combining marks in the detail line

**What:** Collapse long runs of combining marks, or clip the line's overflow.

**Why:** A line of stacked marks can draw over the neighbouring rows' buttons (visual only).

**Effort:** S
**Priority:** P3

## Schedules

### Starter jobs in an agent's empty Schedules tab

**What:** Show up to three suggested jobs from the office pack's `starterMissions` in an agent's empty Schedules tab, each added paused with one click (design decision 5A in `docs/designs/per-agent-schedules.md`).

**Why:** An empty tab is where an owner first learns an agent can run jobs on its own. A suggestion turns that into one click instead of inventing a job.

**Context:** Deferred while building per-agent schedules (2026-09-25) because no shipped pack in `resources/packs/` has `starterMissions`, and its `schedule` field is a free string with no defined format (`src/shared/officePack.ts:76`). The empty tab ships with its copy and add button. To build: define the schedule format (reuse `parseWhen` in `src/shared/missions.ts`), write starters into the packs, map pack agent ids to hive agent ids, and add the suggestion rows.

**Effort:** S
**Priority:** P2
**Depends on:** starter jobs written into the shipped packs.

## Agents and 1:1

### Clean up a "Not for" clause when its teammate leaves

**What:** When a hire is bound to a mailbox or topic, overlapping teammates' routing lines gain "Not for <scope>; that goes to <Name>." If that teammate is later renamed or removed, rewrite or drop the clause.

**Why:** A stale clause sends Michael to a name that no longer exists, and the work bounces.

**Context:** Found by the spec review of the hire wizard redesign (2026-09-27). The clause format is `bindingLines` in `src/shared/hireTemplates.ts`; hook the rename path in `hive.ts` and agent removal in the renderer.

**Effort:** S
**Priority:** P2
**Depends on:** the hire wizard redesign.

### Show the rewritten instructions before saving a work style

**What:** When the owner edits a plain work style (hire or Edit Agent), show the instructions the app wrote from it and let them accept or undo, instead of saving straight away.

**Why:** The owner edits a summary; details the summary left out could still be lost in a rewrite. The prompt now keeps them, but the owner can't see the result.

**Context:** From the /ship pre-landing review of feat/hire-wizard (2026-09-27). `src/main/workStyleConvert.ts`, `toInstructionsPrompt` in `src/shared/workStyleText.ts`, AddAgentModal and EditAgentModal save paths.

**Effort:** S
**Priority:** P2
**Depends on:** nothing.

### End a hidden Claude call early when it can't answer

**What:** A hidden call whose session is stuck on a trust or sign-in screen now waits for its full timeout (60 to 180 seconds). Detect a known blocking screen, or no transcript at all, and give up early so the rules fallback answers quickly.

**Why:** The owner waits on "checking..." for a minute when Claude is signed out.

**Context:** From the /ship pre-landing review (2026-09-27): `captureAndFinish` in `src/main/hiddenClaude.ts` re-arms until its own answer appears.

**Effort:** S
**Priority:** P3
**Depends on:** nothing.

### Test Michael deciding schedule requests end to end

**What:** Runtime tests for `receiveScheduleRequest`, `michaelDecides`, `decideScheduleRequest` and `sweepScheduleRequests` in `src/main/index.ts` (unknown id, stale, escalated, pending list, the 12 hour escalation), which today are checked by source patterns only.

**Why:** These decide whether a request reaches Michael or the owner at all.

**Context:** From the /ship coverage audit (2026-09-27). Needs the functions moved into a module that tests can load with fake config and hive.

**Effort:** M
**Priority:** P2
**Depends on:** nothing.

### Hire through Michael

**What:** The owner tells Michael "hire another admin for catering" and Michael asks the app to open the hire wizard on Review, prefilled with a job he adjusted. The owner still presses Hire; Michael can never hire on his own.

**Why:** The owner runs the office by talking to Michael, so hiring from chat fits how the app is used.

**Context:** Deferred in /plan-ceo-review of the hire wizard redesign (2026-09-27, D5.5) because it needs the wizard first (`docs/designs/hire-redesign.md`). To build: a Michael to app message (an MCP tool, since sandboxed Bash cannot reach the app), a prefill path into the Review step that runs the same distinct job check, and a guard that no agent message can press Hire.

**Effort:** L
**Priority:** P2
**Depends on:** the hire wizard redesign.


### One rule for "stuck at a prompt" in main and the panel

**What:** Put the terminal prompt check (`isTerminalPrompt` in `src/main/hooks.ts`) in shared code
and use it in the renderer's status parsing (`src/renderer/src/hooks/useHive.ts`), passing
`notification_type` through the hook event.

**Why:** Michael is told an agent is stuck from the prompt's type; the panel decides from words
in the message. For a dialog without those words, Michael hears "stuck" while the panel shows the
agent idle, with no coral bar and Talk 1:1 not leading. Found by the red team in the pre-landing
review of feat/per-agent-schedules (2026-09-25); the owner chose a follow-up.

**Priority:** P2

### Block mouse and focus reports in a watch-only terminal

**What:** While a team member's terminal is locked (outside 1:1), drop mouse report and focus
report sequences in `term.onData` (`src/renderer/src/components/terminalPool.ts`), letting the
terminal's own query replies through.

**Why:** The lock covers keys, paste, drop and composition. If the agent's program turns on mouse
tracking, a click in the watch-only terminal still reaches it. Low confidence in the pre-landing
review (2026-09-25); needs a check with a mouse-aware prompt.

**Priority:** P3

### Label messages with no usable date

**What:** In the Messages tab, give conversations whose messages have no valid `created_at` a
heading ("Undated") instead of an empty one (`src/shared/messageView.ts` localDay returns '').

**Why:** Only malformed files hit it, but the section then has no heading. Found by the local
model review (2026-09-25).

**Priority:** P4

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

**Why:** Closing the window ends the day for the whole office; there is no way to keep it running in the background.

**Context:** Since the Studio redesign, closing the main window with terminals running starts closing time on the floor (`ClosingTimeBar`, via `app:closeRequested` in `src/main/index.ts`), the same as quitting. What is left is the tray, and a choice between closing the window and quitting.

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

**Context:** Found in the 2026-09-25 agent instructions audit; the owner chose to leave the heartbeat as it is for now (it ships off). `src/renderer/src/components/triggers/ScheduleList.tsx` keeps the box for `kind: 'heartbeat'` only.

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
6. The memory tidy up runs a hidden Claude session (`src/main/memoryTidy.ts`, through `hiddenClaude.ts`); without Claude it does nothing.
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

**What:** What is left of the old project's website: `docs/blog/` with its source in `blog/`, `docs/sitemap.xml`, `.github/workflows/blog.yml`, and the upstream promo media that was in `docs/media/` (removed on 2026-10-01 with the v2 redesign). (The site pages, `docs/CNAME`, `robots.txt`, the Google verification file, the research, drops, hires gallery, evidence and deck were removed on 2026-09-28. `docs/llms.txt` and `docs/llms-full.txt` went in the 0.0.1 land: GitHub Pages is off for this repo, so nothing served them.)

**Why:** They describe the other product.

**Context:** The website for this app lives in its own repo; keep only files the app reads at runtime (`docs/model-catalog.json`, `docs/hero.json`).

**Effort:** S
**Priority:** P3
**Depends on:** None

### Record demo videos of Don't Be Michael

**What:** New demo videos of this app: a short hero clip for the top of the README, and an agents-at-work clip with a poster image for the README's "Watch the office work" section, which now shows a still.

**Why:** The README shows stills only. The old project's recordings (`docs/media/hero.mp4`, `docs/media/demo/agents.mp4`) were removed on 2026-10-01 with the v2 redesign, since they showed the Munder Difflin pixel UI.

**Context:** The studio lab (`npm run lab`, `docs/demo/studio-lab.html?clean&autoplay`) plays the office on a neutral example office and is made for recording. Keep files small (under 5 MB), commit an mp4 plus a jpg poster under `docs/media/`, and point the README at them. Delete whatever of `landing-remotion/` is no longer used. The website repo may want the same clips.

**Effort:** S
**Priority:** P2
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
