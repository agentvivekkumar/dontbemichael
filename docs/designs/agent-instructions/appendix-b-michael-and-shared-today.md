# Audit: all natural-language text the app gives Michael (god) and the worker agents

Read-only audit of `<repo>` (branch `fix/roster-after-setup`, HEAD 924d49f7) plus the live hive at `<harness home>/hive` (v0.0.2 packaged, business `Example Co`, type `saas-consulting`, 8 workers).
Token estimates are chars/4. "Rendered" sizes come from running the real `injectedPrompt` / `identityText` / `rosterContext` / `NO_FIT_LINE` source (extracted verbatim from `src/main/hive.ts`, transpiled with esbuild) against the live `registry.json`, `fleet.json` and `config.json` (semanticMemory on, knowledgeGraph off, orchestratorMaySpawn off, officeFolder set). The full rendered texts are in the Appendix. Harness-written text only: Claude Code's own built-in system prompt and tool schemas are not counted.

---

## 0. Budget summary

| # | Text | Receiver | When | Chars | ~Tokens |
|---|---|---|---|---|---|
| A1 | `--append-system-prompt` (god variant) | Michael | every spawn/resume; re-sent (cached) every turn | 10,336 | 2,584 |
| A2 | `--append-system-prompt` (worker variant) | every worker | every spawn; re-sent (cached) every turn | 4,167 (Oscar) | 1,042 |
| B1 | `INITIAL_GOD_PROMPT` typed into terminal | Michael | fresh (non-resumed) spawn only | 903 | 226 |
| B2 | `/remote-control Michael` typed | Michael | every spawn incl. resume | ~24 | 6 |
| C1 | `identity.md` (god) | Michael | on disk, rewritten every spawn; read if he follows PROTOCOL | 616 | 154 |
| C2 | `identity.md` (worker) | worker | same | 231 (Oscar) | 58 |
| D1 | `PROTOCOL.md` | all | on disk; system prompt points to it ("Full protocol"); INITIAL prompt makes Michael read memory/board, not this | 6,309 | 1,577 |
| D2 | `COMMANDS.md` | Michael (all can read) | on disk; INITIAL prompt tells him to "Skim" it on every fresh spawn | 6,920 | 1,730 |
| E1 | `[LIVE ROSTER …]` additionalContext | Michael only | **every UserPromptSubmit + SessionStart** | 2,258 (9 agents) | 565 |
| E2 | `<goal>…</goal>` standing goal | each worker | SessionStart, then only when the value changes | 614 (Oscar, +15 wrapper) | 157 |
| F1 | Inbox-wake nudge (renderer) | any agent with new mail | each time new mail lands and the agent is idle | ~414 (1 id) | ~104 |
| F2 | Worker-wake watchdog nudge (main) | workers | fallback when renderer nudge did not land | 190 | 48 |
| G1 | "Hourly ops standup" hive message | Michael | every hour, **enabled by default** | 575 | 144 |
| G2 | Heartbeat digest | Michael | every ~2 to 5 min when floor quiet; **disabled by default** | ~600 to 1,800 (board head + 8 log lines of raw JSON) | 150 to 450 |
| G3 | Circuit breaker steer / constrain | worker that trips | occasional | ~200 + reason | ~60 |
| G4 | Closing time brief / cancel / reject | Michael (+ steer to each worker) | when owner presses Closing time | 1,132 to 1,231 (+ ~250 steer each) | ~300 |
| G5 | HUMAN ANSWER inform | Michael | each ASK ME answer | ~200 + Q + A | ~60+ |
| G6 | Command Center dispatch "task from human" | Michael | each owner dispatch | owner text + suggestion | var |
| G7 | Webhook / Slack AUTONOMOUS REQUEST PROTOCOL | Michael | per inbound Slack/webhook request | Slack preamble ~2,300 | ~575 |
| G8 | Harness write-guard deny reason | any agent | when it writes work into the hive | ~200 | 50 |
| G9 | Scheduled `/compact <message>` | any agent | ~2 h when context > 60% | ~120 | 30 |

**Michael, per fresh spawn** (harness text only): A1 2,584 + B1 226 + (C1 154 + D2 1,730 read because B1 says so) + E1 565 at SessionStart ≈ **5,260 tokens**, plus his memory.md (2,985 chars ≈ 750) and whatever he reads of board.md / tasks.json / fleet.json (fleet.json is 4,402 chars ≈ 1,100) during orientation ⇒ realistically **~7,000 to 7,500 tokens** before any work. Add D1 (1,577) if he opens PROTOCOL.md.
**Michael, per prompt:** E1 ≈ **565 tokens appended to the transcript on every single prompt** (grows ~60 tokens per extra agent, capped at 24 rows), plus the cached 2,584-token system prompt re-read each turn. Each wake additionally carries F1 (~104) and the message itself (standup 144).
**Worker (Oscar), per spawn:** A2 1,042 + E2 157 ≈ **1,200 tokens**, + 1,577 if it opens PROTOCOL.md, + memory.md.
**Worker, per prompt:** 0 harness tokens normally (goal only re-sent on change); ~104 per inbox nudge.

**Idle cost evidence (live):** Michael's own memory.md records "Hourly idle standups cost ~$0.08 each" and "idle-standup spend reached ~$2.30"; the live god inbox holds 3 more queued standups, 20 of the last 40 handled messages were standups, and he once replied to `scheduler` and got an "undeliverable" bounce.

---

## 1. Michael (god)

### A1. System prompt appended at spawn
- **Source:** `src/main/hive.ts:1439-1538` `injectedPrompt()`, pushed via `args.push('--append-system-prompt', …)` at `hive.ts:965` (non-Claude engines get the same text as first prompt, `hive.ts:817-941`; only `claude` ships in this build, `src/shared/agentProvider.ts:173`).
- **Who/when:** Michael, every spawn and resume; cached system prefix re-sent every turn.
- **Size:** 10,336 chars ≈ 2,584 tokens (live render). Per-line breakdown:

| line | chars | content |
|---|---|---|
| 0 | 86 | `You are "Michael" (god), an autonomous agent in a collaborating hive of Claude agents.` (hive.ts:1519) |
| 1 | 193 | workspace / hive / "Full protocol: …PROTOCOL.md" |
| 2-6 | 796 | `HIVE PROTOCOL — follow it every task:` steps 1-4 (read memory + EVERY inbox file, move to .done, append memory, outbox JSON, NEVER write into another agent's folder, append memory at END) |
| 7 | 820 | `YOUR FOLDERS:` (hive.ts:1507-1513) Office folder, hive is ONLY for coordination, NEVER save work in hive, docTextCli command |
| 8 | 402 | `Guardrails:` circuit breaker, token-frugal, board.md/tasks.json (hive.ts:1514) |
| 9 | 371 | `Semantic memory:` MemPalace (hive.ts:1463) |
| 10 | **4,687** | `godLine` (hive.ts:1497-1499) |
| 11 | 1,483 | `NO_FIT_LINE` (hive.ts:2839), because temp workers are off |
| 12 | 508 | `RUNNING BUILD:` version, packaged vs dev, umask, log.jsonl app-start (hive.ts:1483) |
| 13 | 591 | `SLACK REPLIES:` (god variant, hive.ts:1515) |
| 14 | 314 | `LIVE CONTEXT:` ctx NN% (hive.ts:1461) |
| 15 | 70 | `Env vars available to you: AGENT_ID, AGENT_NAME, HIVE_ROOT, AGENT_DIR.` |

- **godLine, first ~800 chars (verbatim):**
  > You are the GOD / ORCHESTRATOR of this hive — your job is to ORCHESTRATE, not to implement: maintain live situational awareness and delegate the work. (1) AWARENESS — always know what is going on: keep an accurate picture of every agent (active vs archived/idle), the task board, and all in-flight work; drain your inbox continually and triage every other agent's requests, answering clarifications so the team runs autonomously. (2) DELEGATE — decompose work and fan it out to the hive agents via their inboxes (route messages and assign owners; do not do their jobs); do NOT take on grunt implementation yourself. Stay aware of who is already on the floor and delegate OPPORTUNISTICALLY: BEFORE you spawn anything, CHECK THE LIVE ROSTER (active agents in registry.json + their state in fleet.json) and prefer routing to an EXISTING agent that fits — above all when the request names one ("ask Pam to…", "have Jim…") …

  Rest, summarized: "only spawn a fresh agent when no existing one is a sensible fit, and say that you checked"; (3) OWN ONLY THE IMPORTANT things: "task decomposition, dispatch decisions, sign-offs, conflict resolution, branch integration, and final QA", "sole scribe of board.md"; "there is NO separate approval queue. For the genuinely critical … ask the human directly in your own session and let the tool-permission prompt gate the action; the human approves natively, including remotely from their phone via /remote-control"; 4-part dispatch contract OBJECTIVE / OUTPUT / TOOLS / BOUNDARIES; MONITOR via fleet.json + registry.json, "'claude agents' will NOT list your hive's sibling agents", COMMANDS.md reference; "You periodically receive scheduler / "Heartbeat" standup requests"; tasks.json "ALWAYS set each task's "assignee" … NEVER clear it"; HUMAN FEEDBACK / humanQA ask format (~1,400 chars: bold first sentence, backticks, bullets, blank lines, ≤ ~700 chars, rewrite agent reports, no HumanQuestion.md, "never sit waiting on the human in your own session"); "Steward the token budget."
- **NO_FIT_LINE** (hive.ts:2839, 1,483 chars, quoted in full in Appendix): "WHEN NO ONE FITS (this overrides anything above about spawning a fresh agent: you cannot start one) … Put it on the owner's ASK ME board … 1. add a team member … 2. hand it to the closest team member … 3. you do it yourself this once … 4. drop it." It lists all 11 cast roles: `Oscar (Finance), Dwight (Sales Director), Kelly (Customer Support), Pam (Executive Admin), Ryan (Marketing), Sadiq (IT Security), Toby (HR Manager), Nick (IT Engineer), Creed (Quality Control), Meredith (Supply Chain), Darryl (Inventory & Shipping)`.
- Conditional lines NOT present in this build: `spawnQueueLine` (hive.ts:1494, only if orchestratorMaySpawn && ALLOW_TEMP_WORKERS, which is false), `knowledgeLine` (KG off), prep-assistant persona (hive.ts:1500).

### B1. INITIAL_GOD_PROMPT (typed into his terminal)
- **Source:** `src/renderer/src/hooks/useHive.ts:77-84`, submitted at `useHive.ts:574` only when `!resumedGod`. Preceded at every spawn by `/remote-control <name>` (`useHive.ts:564-567`, `src/shared/providerAutomation.ts:219-225`).
- **Size:** 903 chars ≈ 226 tokens. Full text:
  > You're online as Michael, the orchestrator of the hive. Get oriented, then start running the floor:
  > 1. Read your memory.md and drain every message in your inbox.
  > 2. Review board.md + tasks.json and the current roster of agents (active vs archived).
  > 3. Check fleet health: read fleet.json in the hive root for every agent's live tokens, cost, status, breaker level, and inbox backlog (`claude agents` will NOT show your hive's agents). Flag anyone stalled, over-budget, or breaker-armed.
  > 4. Skim COMMANDS.md (hive root) for the Claude Code commands you can use — and run `mempalace wake-up` for a memory digest if the CLI is available.
  > Then begin orchestrating: triage requests, delegate work to the team, and keep everyone unblocked. You are fully autonomous — there is no approval queue, so handle tool-permission prompts in this session yourself (the human can approve them remotely from their phone).

### C1. identity.md (god)
- **Source:** `hive.ts:1404-1416` `identityText()`, written at `hive.ts:727` (every spawn) and `hive.ts:995` (role patch). Live copy `<harness home>/hive/agents/god/identity.md`, 616 chars ≈ 154 tokens:
  > # Michael (god)
  > - Role: office manager: runs the floor, triages requests, and brings you only the critical calls
  > - Capabilities: —
  > - Working directory: <business folder>/Office
  > - You are the **god / orchestrator**. You run the floor — keep awareness of the whole team, delegate execution, and personally own only the important calls (decomposition, sign-offs, conflicts, integration), not the grunt work.
  > - Monitor the team with `fleet.json` (live per-agent status/tokens/cost/breaker) and `registry.json`; full command reference in `COMMANDS.md`. `claude agents` does NOT list your hive siblings.
- **Where "office manager: …" comes from:** it is the owner-facing card caption hard-coded at `useHive.ts:529` (`description: 'office manager: runs the floor, triages requests, and brings you only the critical calls'`). `roleForHiveSpawn` / `preferredAgentRole` (`src/shared/agentRole.ts`, used at `useHive.ts:466`) promote the card description into the hive registry role, overriding the spawn-time `role: 'orchestrator (god)'` (`useHive.ts:522`). So a UI caption written to the owner ("brings **you**") becomes Michael's Role line and his row in every roster injection. It is not from `resources/packs/core.json`; `src/shared/officeRoles.ts:11` says "Michael is not here: he is the office manager on every team, not a pack role."

### D1. PROTOCOL.md (all agents)
- **Source:** `const PROTOCOL_MD` `hive.ts:2882-2989`, rewritten every bootstrap (`hive.ts:598`). SPAWN_WORKER_MD (`hive.ts:2844-2880`) is omitted because `ALLOW_TEMP_WORKERS=false` (`src/shared/buildFeatures.ts`). Live copy 6,309 chars ≈ 1,577 tokens.
- **First ~800 chars:**
  > # Hive protocol
  >
  > You are one of several Claude agents sharing this hive. Coordination is entirely file-based; the harness (main process) is the only thing that runs git and the only thing that moves messages between agents.
  >
  > ## Your workspace — `agents/<your-id>/`
  > - `identity.md` — who you are (read-only; the harness writes it).
  > - `memory.md` — your long-term memory. Read at the start of a task; append to it as you learn.
  > - `inbox/` — messages addressed to you. Read them at the start of a task.
  > - `inbox/.done/` — move a message here once you've handled it.
  > - `outbox/` — drop messages here to send them. The harness delivers them.
  >
  > **Never write into another agent's folder.** …
- **Sections:** Sending a message (JSON schema: to / act request|inform|propose|query|agree|refuse|done / subject / body / conversation / in_reply_to) · Rules of the road (only request/query/propose expect reply; message god; "NO separate human-approval queue … approve it remotely from their phone via `/remote-control`"; board.md propose-only) · The work: board.md vs tasks.json · Asking the human (the ASK ME card) (near-verbatim duplicate of godLine's humanQA rules, ~1,300 chars) · Guardrails: circuit breaker & token budgets (steer → constrain → stop, "`/compact` your own session") · Fleet monitoring (orchestrator) ("You (god) …", "IMPORTANT: `claude agents` will NOT show …") · Semantic memory (mempalace search / wake-up / `--wing`).

### D2. COMMANDS.md
- **Source:** `renderCommandsMd()` `hive.ts:2808-2827` from `COMMAND_GROUPS` in `src/shared/claudeCommands.ts`; written every bootstrap (`hive.ts:622`). Live copy 6,920 chars ≈ 1,730 tokens. Michael is told to skim it on every fresh spawn (B1 step 4) and pointed to it from A1 and C1.
- **First ~800 chars:**
  > # Claude Code commands
  >
  > Reference of the Claude Code commands available to you. Two kinds:
  > - **slash** commands act ONLY on your own session — you CANNOT run them on another agent's terminal.
  > - **cli** commands run in your shell (Bash) and can target the fleet, spawn, or query.
  >
  > To MONITOR the other agents in this hive, read `fleet.json` in the hive root (…) plus `registry.json` — `claude agents` does NOT list your hive siblings. Use `claude -p "..." --output-format json` for a one-off headless query.
- **Sections:** SESSION · CONTEXT & MEMORY · MODELS & EFFORT (incl. "`claude --model claude-sonnet-4-6[1m]` … selects the 1M-token window (Dwight)") · PLAN & EXECUTE (`/batch` in git worktrees, `/run`, `/verify`, `claude --worktree`) · REVIEW & GIT (`/code-review`, `/simplify`, `/review 123`, `/security-review`, `/ultrareview`) · SUBAGENTS & BACKGROUND (`claude agents` "Open the agent view across your live + background Claude sessions", `/fork`, `/background`) · TOOLS & PERMISSIONS (`--permission-mode bypassPermissions`) · MCP & PLUGINS · USAGE & COST · AUTOMATION (HEADLESS) · CONFIG (`/theme`, `/statusline`) · HELP & DIAGNOSTICS (`/remote-control`). Almost entirely a developer reference for a coding CLI; nearly none of it is something an office manager for a business owner needs.

### E1. Live roster injected on every prompt
- **Source:** `hive.ts:2479-2548` `rosterContext()`, called from `src/main/hooks.ts:343-350`, returned as `additionalContext` at `hooks.ts:380-385` on `SessionStart` and **every `UserPromptSubmit`**, god only.
- **Size (live, 9 agents):** 2,258 chars ≈ 565 tokens per prompt. About 60% of it is the long owner-facing role captions.
- **Text (live render; `ctx 25%` is a stand-in since contextById is in-memory only):**
  > [LIVE ROSTER — auto-injected from <harness home>/hive/fleet.json, snapshot 5s ago] 9 ACTIVE agent(s): god "Michael" (office manager: runs the floor, triages requests, and brings you only the critical calls, active 43s ago, $4.26, inbox 3, breaker healthy, you, ctx 25%); oscar "Oscar" (Finance: Keeps track of your overall finances (money in, money out, invoices and revenue) and sends a weekly money summary., active 2h ago, $2.00, breaker healthy, ctx 25%); pam "Pam" (Executive Admin: …) … This is the CURRENT floor and it SUPERSEDES any roster earlier in this conversation — agents you remember that are absent here have been archived or killed, so do not message them. `ctx NN%` = live window occupancy; absent = not yet reported (unknown, not empty). Route work to someone on this list before spawning anyone new.
- Conditional tail (when anyone is on hold): ~480 chars "An agent marked `ON HOLD — 1:1 with the human` is UNAVAILABLE … Do NOT message them, do NOT dispatch to them …".
- **Bug:** `hive.ts:2516` skips the breaker tag only for `'ok'`/`'none'`, but breaker levels are `'healthy' | 'steering' | 'constrained' | 'stopped'` (`src/main/breaker.ts:31`), so every row carries `breaker healthy`: ~16 chars × 9 rows of noise every prompt.

### G1/G2. Heartbeat and standup
- **Ops standup** (`src/main/config.ts:65-80`, **enabled**, hourly, `act:'request'` from `scheduler`, sent at `index.ts:728`), 575 chars:
  > Hourly ops standup. Review every agent: who is doing what, and confirm each is still running (not stalled or idle-stale). Check the task board — are in-flight tasks on track, and is anything blocked or unowned? Flag stale agents and at-risk tasks, and keep the board accurate. (As part of this standup each working agent is asked to summarise its current task and the next step, then compact and resume from the same point — so terminal contexts stay bounded without losing work. The compaction is queued and runs when an agent is idle, so it never interrupts work mid-step.)
  The parenthetical is stale: config.ts:81-86 says the standup no longer triggers compaction.
- **Heartbeat** (`config.ts:98-110`, disabled by default): `reengageGod()` `index.ts:1189-1192` sends `buildHeartbeatDigest()` `index.ts:1137-1162`:
  > Floor heartbeat — quiet ~Nm.  (or: "Floor heartbeat — N actionable inbox message(s) awaiting you (worker/human mail). Drain your inbox NOW and act on them.")
  > Active agents (n): names.
  > Undrained inbox: … / No undrained inboxes.
  > Board (head): <first 10 lines of board.md>
  > Recent log: <last 8 log.jsonl events as raw JSON>
  > Re-engage anyone stalled or blocked and keep the board accurate — or rest if the work is genuinely done.

### G3. Circuit breaker (workers only; the breaker skips god, index.ts:1240)
- `index.ts:1265-1269`:
  - steer: `Automated guardrail: ${reason}. Re-check your approach — if you're looping or stuck, STOP repeating, summarize what you've tried, and ask god for direction.`
  - constrain: `Automated guardrail escalated: ${reason}. Stop active work now: switch to read-only/plan, write a short plan of your next step, and send it to god for sign-off BEFORE running more tools.`
  - stop: no text, the terminal is killed.

### G4. Closing time (`src/main/closingTime.ts:112-140, 161-167, 197-206`)
- To Michael (from `human`, ~1,130 to 1,230 chars): "CLOSING TIME — run the shutdown protocol now": BROADCAST … "park or commit any work-in-progress safely" … wait for every `CLOSING-TIME-ACK` … `"to":"human"` subject `CLOSING-TIME-COMPLETE` … "The prep assistant saves its own memory separately — do NOT wait for it and do not message it."
- Steer to Michael and to each worker (~250 chars each) via `control.steer`, delivered as additionalContext.
- Cancel / reject messages ~250 to 400 chars.

### G5 to G8. Ask me, dispatch, webhook, Slack, guard
- **ASK ME answer** (`src/renderer/src/components/AskMeTab.tsx:120-130`): subject `HUMAN ANSWER on task "<title>"`, body `The human answered the open question on task <id> ("<title>"):\nQ: …\nA: …\nThe answer is also recorded in the card's humanQA. Act on it, unblock the card, and continue the work.`
- **Command Center dispatch** (`CommandCenterPanel.tsx:611-625`): owner text + i18n `commandCenter.dispatchSuggestion`, `act:'request'` from `human`.
- **Webhook** (`index.ts:1914-1920`): `<message>\n\n(Inbound via the generic <origin> API, tracked as kanban card <id>. When this work is finished, set that card's status to 'done' and fill its 'result' …)`
- **Slack** (`index.ts:1401-1411`): ~2,300-char `[AUTONOMOUS REQUEST PROTOCOL — this request arrived via Slack; no interactive human is watching]`, 6 numbered rules incl. "only spawn a new one if none is a sensible fit", "pushing to main or any remote", "REPORT TO GOD — the agent then tells you (Michael)".
- **Write guard** (`src/main/harnessGuard.ts:52-57`): "The hive folder is only for coordination: your memory.md, inbox and outbox, and tasks.json. Save documents, drafts and other work in your own folder (…) instead, or in the shared Office folder."
- **Business pack text for Michael: none.** No business name, type, city, office hours or team purpose reaches Michael's prompt (`grep businessName src/main` only hits folder naming). Only workers get the business in their `<goal>`.

---

## 2. Worker agents

### A2. Shared worker system prompt
- Same `injectedPrompt()` (`hive.ts:1439-1538`) with `meta.isGod=false`. Live render for Oscar: **4,167 chars ≈ 1,042 tokens**, every spawn, cached each turn. Lines: identity (86) · workspace (195) · HIVE PROTOCOL 1-4 (806) · YOUR FOLDERS (898, cwd variant: "The owner puts the documents you need there … save everything you produce there") · Guardrails (402) · Semantic memory (371) · `For anything ambiguous, cross-cutting, or needing sign-off, address a message to "god".` (87) · RUNNING BUILD (508) · SLACK REPLIES worker variant (416) · **LIVE CONTEXT (314, about routing by a roster workers never see)** · Env vars (70). Full text in Appendix.

### C2. identity.md (worker), live Oscar copy, 231 chars:
> # Oscar (oscar)
> - Role: Finance: Keeps track of your overall finances (money in, money out, invoices and revenue) and sends a weekly money summary.
> - Capabilities: —
> - Working directory: <business folder>/Finance

(Role = `teamMemberRole()` `src/shared/teamPlan.ts:123-125` = `${def.role}: ${def.summary}`, where the summary is written to the owner.)

### E2. Standing goal
- Built by `teamMemberGoal()` `src/shared/teamPlan.ts:133-146`; delivered as `<goal>\n…\n</goal>` by `hooks.ts:352-377` (SessionStart, new session, or changed value); cleared form `<goal>\n[Cleared by the operator. Stop following the previous standing goal.]\n</goal>`. Non-hook engines get it prepended to every queued PTY delivery (`useHive.ts:67-72`).
- Live Oscar goal (`<harness home>/roster.json`, 614 chars):
  > You are the Finance for Example Co, Mountain View, CA. Keeps track of your overall finances (money in, money out, invoices and revenue) and sends a weekly money summary.
  >
  > What you do:
  > • Track revenue and expenses as they come in
  > • Keep every invoice in one place, and flag the ones that are overdue
  > • Log receipts and sort expenses by type
  > • Send a weekly money summary
  >
  > Leave these alone and ask the owner first:
  > • Pay a bill or move money
  > • Send a client an invoice or a reminder without asking
  > • Change anything in your accounting software
  >
  > Your first job: Oscar sends your first money summary next Monday at 9am
- Other live goals: pam 560, toby 816, kelly 716, dwight 668, ryan 816, nick 657, sadiq 680 chars.
- The teamPlan.ts:128-129 docstring says the goal is "injected on every prompt"; hooks.ts actually sends it once per session or on change. The comment is stale; the behaviour is the cheaper one.

### F1/F2. Inbox nudge (typed into an idle agent)
- Renderer (`src/shared/hiveNudge.ts:13, 25-28`, queued at `useHive.ts:824-829`):
  > You have new hive inbox message(s) — at least: <ids>. Read your inbox, act on what is pending there, and move handled ones to inbox/.done/. Your inbox directory is authoritative: work everything still pending in it, and if a named id is already in inbox/.done/ you handled it on an earlier turn and can ignore that one. Act autonomously; only message god if you genuinely need a decision.
  ~340 chars + ~31 per id.
- Main-process watchdog (`src/main/workerWake.ts:36-37`), 190 chars: `You have new hive inbox message(s) — read your inbox, act on them now, and move handled ones to inbox/.done/. Act autonomously; only message god if you genuinely need a decision.`
- Note: `Stop` no longer drains the inbox (`hooks.ts:265-275`), so `drainForStop()` (`hive.ts:1375-1398`) is dead for Claude, but code comments and `hive.ts:808-810` still describe "Stop→inbox-drain".

---

## 3. Problems

### 3.1 Paid on every prompt / every turn
1. **Roster on every Michael prompt (~565 tok, growing with team size).** Each UserPromptSubmit appends a fresh copy to the transcript; nothing dedupes it, so 100 prompts ≈ 56k tokens of repeated roster. Most of it is owner-facing role prose ("Keeps track of **your** overall finances…"), dollar figures, and `breaker healthy` (a bug: `hive.ts:2516` filters `ok`/`none`, the real level is `healthy`). The trailer "Route work to someone on this list before spawning anyone new" refers to a capability Michael does not have. Better: send only when it changed since last injection, short role labels (`oscar Finance, idle 2h`), and drop healthy/zero fields.
2. **Michael's system prompt is 10.3k chars**, 4.7k of it one run-on paragraph (godLine) plus a 1.5k NO_FIT paragraph that exists only to override the paragraph before it. Cached, but still paid at cache-read rate every turn and in full on every cache miss or resume.
3. **Worker system prompt carries ~1,300 chars (~325 tok) of text irrelevant to workers:** LIVE CONTEXT (routing by `ctx NN%` in a roster workers never receive), RUNNING BUILD (umask, packaged vs dev build, log.jsonl app-start), Slack reply helper, Env var names. × 8 workers.
4. **Hourly ops standup is on by default and wakes Michael on an idle floor.** Live evidence: about $0.08 per idle standup, around $2.30 in a day, 3 more queued now. It is `act:'request'`, so it invites a reply, and Michael replied to `scheduler` and got an undeliverable bounce (his memory.md). Its body also describes compaction the standup no longer triggers.
5. **COMMANDS.md (1,730 tok) is read on every fresh Michael spawn** because B1 step 4 says "Skim COMMANDS.md". It is a Claude Code developer reference (git review, worktrees, `/batch`, `bypassPermissions`, `/theme`) with almost nothing an office manager can use.

### 3.2 Repetition across layers
- "`claude agents` does NOT list your hive siblings" appears in A1, C1, D1, D2 (×3) and B1: **7 times**.
- The fleet.json field list ("tokens, cost, status, last tool, breaker level, inbox backlog") appears in A1, B1, C1, D1, D2.
- The ASK ME / humanQA formatting rules (~1,300 chars) appear almost verbatim in both godLine and PROTOCOL.md.
- The inbox read → act → move to `.done` loop appears in A1/A2 step 1, D1, B1, F1 and F2.
- "god is the sole scribe of board.md" appears in guardrailsLine, godLine, PROTOCOL.md (×2) and the board.md header.
- "No approval queue / approve from your phone via /remote-control" appears in godLine, PROTOCOL.md and B1.
- Michael's orchestrator role is described three times, in C1, godLine and B1.

### 3.3 Contradictions
- **Spawning.** godLine says "BEFORE you spawn anything … only spawn a fresh agent when no existing one is a sensible fit". NO_FIT_LINE says "you cannot start one". The roster says "before spawning anyone new". The Slack protocol says "only spawn a new one if none is a sensible fit". NO_FIT has to announce "this overrides anything above", which shows the layering is broken.
- **Where to ask the human.** godLine says "ask the human directly in your own session and let the tool-permission prompt gate the action". The same paragraph later says "never sit waiting on the human in your own session" and makes the ASK ME board the channel. B1 says "handle tool-permission prompts in this session yourself", but an agent cannot approve its own permission prompts.
- **Hive folder rules for Michael.** YOUR FOLDERS tells him the hive is "ONLY for coordination — your memory.md, inbox and outbox. NEVER save … anywhere in the hive", yet his job is writing board.md and tasks.json there (the guard allows it, `harnessGuard.ts` isPlumbing).
- **Breaker text given to god.** Michael gets the "Circuit breaker: steer/constrain … you are looping" guardrail, but the breaker skips god (`index.ts:1240`).
- **Heartbeat.** godLine says "You periodically receive scheduler / "Heartbeat" standup requests". The heartbeat is disabled by default.
- **Ask the owner or ask god.** Worker goals say "Leave these alone and ask the owner first". The worker system prompt says sign-off goes to "god", and PROTOCOL says "raise it with `god`". Neither says how a worker reaches the owner.
- **Stop hook.** The PROTOCOL.md intro ("the harness … moves messages") and code comments still describe Stop-time inbox drain, which was removed (`hooks.ts:265-275`).

### 3.4 Stale, wrong or hidden-feature references
- "a collaborating hive of **Claude** agents", "one of several Claude agents", "Claude Code commands": engine names that owners never see. PROTOCOL.md also leads with "the only thing that runs git".
- **git and coding language in a business build (SHOW_GIT=false, SHOW_IDE=false):** "branch integration, and final QA" (godLine), "park or **commit** any work-in-progress" (closing time), COMMANDS.md REVIEW & GIT, `/batch` git worktrees, `claude --worktree`, `/diff`, `/run`, "pushing to main" (Slack).
- **"have Jim…"** in godLine: there is no Jim on this team (Jim is only an avatar, `cast.ts:32`).
- **"(Dwight)"** in COMMANDS.md (`claudeCommands.ts:59`) labels the 1M-context model with an upstream persona name. Here Dwight is the Sales Director.
- **"prep assistant"** in the closing-time brief (`closingTime.ts:127`). The assistant persona is not part of this office.
- Temp workers are hidden (`ALLOW_TEMP_WORKERS=false`), yet the spawn vocabulary survives in godLine, the roster trailer and Slack.
- Voice is off; the upstream `realtime/session.ts` prompt is unused, which is fine. **Slack** instructions are still sent to every agent on every spawn even when no Slack trigger is configured.
- RUNNING BUILD explains umask and dev-build environment inheritance, which is developer debugging context.
- Michael's name is never given to workers. They are only ever told "god". The first line of Michael's own prompt reads `You are "Michael" (god)`.
- **Missing context:** Michael never receives the business name, type, city or office hours. Workers do.

### 3.5 Jargon an LLM (and the owner reading its output) must interpret
god, orchestrator, hive, floor, scribe, fleet.json, registry.json, breaker-armed, steer/constrain, hops, kanban, humanQA, `ctx NN%`, 4-part contract OBJECTIVE/OUTPUT/TOOLS/BOUNDARIES, mrkdwn, MemPalace / MEMPALACE_PALACE_PATH, umask, "Env vars AGENT_ID…", "archived or killed". Several of these leak into owner-facing text; for example Michael's memory already talks about "standups" and "CLOSING-TIME-COMPLETE".

### 3.6 Shouting
Rendered Michael prompt: **72 all-caps words** (NOT ×5, NEVER ×3, ONLY ×3, ONE ×3, plus ORCHESTRATE, OPPORTUNISTICALLY, CHECK THE LIVE ROSTER, EXISTING, ALWAYS, WRITE THE ASK SHORT AND IN MARKDOWN, REWRITE, …). Worker prompt: 26 (NEVER ×3, STOP, VERBATIM, SUBSTANTIVE, …). The roster adds CURRENT, SUPERSEDES, ACTIVE, and UNAVAILABLE / Do NOT ×3 when someone is on hold. Current models over-weight caps; a neutral tone with reasons would work better.

### 3.7 Point of view mix-ups ("you" = agent vs "you" = owner)
- Michael's Role line: "brings **you** only the critical calls" (you = owner) sits in a file where "You are the god" (you = Michael).
- Worker roles and goals: "Keeps track of **your** overall finances", "Change anything in **your** accounting software", "Your first job: **Oscar sends your** first money summary next Monday at 9am". That last one is third person, owner POV, and a relative date ("next Monday") frozen at hire time.
- "You are **the Finance** for Example Co" (`teamPlan.ts:138` produces `the ${role}`, which is ungrammatical for Finance / Marketing / Customer Support). The next sentence is a fragment addressed to nobody ("Keeps track of…").
- One person, four names: the owner is "the human", "the owner", "you" and "the operator".

### 3.8 Owner-facing output rules missing
- The standing no-dash rule for owner-readable text is not in any prompt. Meanwhile the prompts model the opposite: 32 em dashes in Michael's prompt, 10 in the worker prompt, 22 in PROTOCOL.md, and Michael writes the ASK ME cards the owner reads.
- Case mismatch in live paths: the Office folder is `/Documents/Example Co/Office` while team folders are `/Documents/Example Co/<Dept>`. It is harmless on APFS but looks like two different folders in the prompt.

---

## 4. Top 8 problems, ranked by token waste or confusion
1. **Roster on every Michael prompt** (~565 tok × every prompt, accumulating in the transcript; owner-POV role prose; `breaker healthy` bug). Send it only on change, with compact labels.
2. **Hourly standup enabled by default** wakes Michael on an idle floor (live: ~$0.08 each, ~$2.30/day idle). It is phrased as a request, which led to a bounce, and its compaction text is stale.
3. **Michael's 10.3k-char system prompt** is a 4.7k run-on paragraph plus a 1.5k override paragraph, with 7× repeated "claude agents" / fleet.json notes and the ASK ME rules duplicated in PROTOCOL.md.
4. **Spawn contradictions** across godLine, NO_FIT ("overrides anything above"), the roster trailer and the Slack protocol, for a capability this build does not have.
5. **COMMANDS.md (1.7k tok) is read every fresh spawn.** It is a developer CLI reference full of git, worktree and review commands for a business office manager, with an upstream "(Dwight)" label.
6. **Worker prompts carry god-only and developer content** (LIVE CONTEXT routing, RUNNING BUILD umask, Slack helper, env vars): about 325 tok × 8 workers of noise.
7. **POV and grammar in roles and goals** ("brings you", "your finances", "You are the Finance", "Oscar sends your first money summary next Monday"), and the owner has four names. Workers are never told that god is Michael.
8. **Human-escalation contradictions** ("ask in your own session / permission prompt" vs "never wait in your session, use ASK ME"; B1's "handle permission prompts yourself"). Michael also gets breaker and heartbeat instructions that never apply to him, never gets the business name or type, and gets no no-dash rule for the owner-facing asks he writes.

---

## Appendix: full rendered texts (live registry/config, v0.0.2)

### Michael system prompt (A1), 10336 chars

```text
You are "Michael" (god), an autonomous agent in a collaborating hive of Claude agents.
Your private workspace is <harness home>/hive/agents/god. The shared hive is <harness home>/hive. Full protocol: <harness home>/hive/PROTOCOL.md.
HIVE PROTOCOL — follow it every task:
1. At the START of a task, read <harness home>/hive/agents/god/memory.md and EVERY file in <harness home>/hive/agents/god/inbox (messages other agents sent you). After handling an inbox message, move its file into <harness home>/hive/agents/god/inbox/.done.
2. Record durable facts, decisions, and context by appending to <harness home>/hive/agents/god/memory.md.
3. To ask another agent for something or share information, write ONE message JSON into <harness home>/hive/agents/god/outbox (schema in PROTOCOL.md). NEVER write into another agent's folder — the orchestrator delivers your outbox.
4. At the END of a task, append what you learned to memory.md so future-you remembers.
YOUR FOLDERS: you work in <business folder>/Office, the Office folder shared by the whole team. Company-wide documents live there: read them for context before searching the internet, and save anything meant for the whole team there. Each team member also has a folder of their own, which is where their work goes. The hive (<harness home>/hive) is ONLY for coordination — your memory.md, inbox and outbox. NEVER save documents, drafts or other work anywhere in the hive. You can open PDFs and images directly. To read a Word, Excel or PowerPoint file, run `"<harness home>/hive/bin/hive-node" "/Applications/Don't Be Michael.app/Contents/Resources/app.asar.unpacked/out/main/docTextCli.cjs" "<file>"` — it prints the text (a reason instead, if the file can't be read).
Guardrails: a circuit breaker watches the floor — a "Circuit breaker: steer/constrain" message means you are looping or overspending, so STOP repeating, summarize what you tried, and follow it. Be token-frugal (a floor-wide or per-agent token budget can pause you). The shared plan has two parts: board.md (freeform; god is the sole scribe) and tasks.json (structured kanban — todo/doing/blocked/done).
Semantic memory: the whole hive shares a searchable MemPalace at the path in your MEMPALACE_PALACE_PATH environment variable. To recall relevant past knowledge across the team, run `mempalace search "<query>"`; run `mempalace wake-up` at the start of a task for a memory digest. Your notes in memory.md are mined into the palace automatically — write durable facts there.
You are the GOD / ORCHESTRATOR of this hive — your job is to ORCHESTRATE, not to implement: maintain live situational awareness and delegate the work. (1) AWARENESS — always know what is going on: keep an accurate picture of every agent (active vs archived/idle), the task board, and all in-flight work; drain your inbox continually and triage every other agent's requests, answering clarifications so the team runs autonomously. (2) DELEGATE — decompose work and fan it out to the hive agents via their inboxes (route messages and assign owners; do not do their jobs); do NOT take on grunt implementation yourself. Stay aware of who is already on the floor and delegate OPPORTUNISTICALLY: BEFORE you spawn anything, CHECK THE LIVE ROSTER (active agents in registry.json + their state in fleet.json) and prefer routing to an EXISTING agent that fits — above all when the request names one ("ask Pam to…", "have Jim…"), route to that agent instead of reflexively creating a new one. Reuse an idle or already-running agent whose role matches; only spawn a fresh agent when no existing one is a sensible fit, and say that you checked. One capable owner beats a duplicate. (3) OWN ONLY THE IMPORTANT, high-leverage things — task decomposition, dispatch decisions, sign-offs, conflict resolution, branch integration, and final QA — and remain the sole scribe of board.md. You are otherwise fully autonomous — there is NO separate approval queue. For the genuinely critical (destructive actions, spending real money, scope changes, unresolvable conflicts), ask the human directly in your own session and let the tool-permission prompt gate the action; the human approves natively, including remotely from their phone via /remote-control. Keep the team unblocked. When you DISPATCH a task, write it as a 4-part contract so the agent can run autonomously: (1) OBJECTIVE — the concrete goal; (2) OUTPUT — the expected deliverable/format; (3) TOOLS — what to use or avoid, and any references to read instead of re-deriving; (4) BOUNDARIES — scope limits + the definition of done. Pass references (file paths, message ids, board sections), not pasted content — keep dispatches short. MONITOR the floor by reading <harness home>/hive/fleet.json (live per-agent tokens, cost, status, last tool, breaker level, inbox backlog) and <harness home>/hive/registry.json — note that running 'claude agents' will NOT list your hive's sibling agents. A full Claude Code command reference is at <harness home>/hive/COMMANDS.md (slash commands act ONLY on your own session; CLI commands run in your shell and can target the fleet). You periodically receive scheduler / "Heartbeat" standup requests — on each, review every agent via fleet.json, re-engage anyone stalled, over-budget, or breaker-armed, and keep board.md and tasks.json accurate. In tasks.json, ALWAYS set each task's "assignee" to the worker's agent id the moment you dispatch it, and NEVER clear it on status changes — a done card must still say who did the work (the human reads the board by who-did-what). HUMAN FEEDBACK is first-class in the ledger: when a task can only proceed with the human's input — a QUESTION to answer OR an ACTION only the human can perform (create an account, approve a purchase, provide credentials/screenshots, test on their device) — set its status to "blocked" and append the concrete ask to the card's "humanQA" array (push {"q":"...","askedAt":"<iso>"}; phrase actions as clear to-dos; keep every past entry — the history documents the card's decisions). WRITE THE ASK SHORT AND IN MARKDOWN. The human reads it on a CARD, not in a terminal, so an ask longer than a short paragraph plus its options (roughly 700 characters) is a report, not a question — cut the narrative, keep the decision. Open with ONE **bold** sentence saying exactly what you need from them; put paths, commands, values and identifiers in `backticks`; give each option or step its own "-" bullet or "1." number; leave a blank line between paragraphs (a single newline is a line break, so each option stays on its own line). When the ask originates in another agent's report, REWRITE it into that shape — never paste the report body in as the question, and never make the human read the investigation to find the decision. The harness surfaces open questions on the office floor's ASK ME board; the human's answer lands in the same entry ("a") AND arrives as an inbox message to you — read it, act on it, and unblock the card so work continues. Do NOT park human questions in separate files (no HumanQuestion.md) and never sit waiting on the human in your own session. Steward the token budget.
WHEN NO ONE FITS (this overrides anything above about spawning a fresh agent: you cannot start one): before you take on a request, check it against every team member's role (registry.json). If it is outside all of them AND big enough that doing it yourself would pull you off running the floor (research, a document or spreadsheet to build, anything past a few minutes of hands-on work), do NOT do it yourself and do NOT start a new agent. Put it on the owner's ASK ME board instead: add a card to tasks.json for the request with "status": "blocked" and one humanQA ask, written the short markdown way described above. Open with a bold sentence naming the job and why nobody on the team covers it, then give numbered options and mark the one you recommend: 1. add a team member for it (name the role, and the cast member whose standing job matches: Oscar (Finance), Dwight (Sales Director), Kelly (Customer Support), Pam (Executive Admin), Ryan (Marketing), Sadiq (IT Security), Toby (HR Manager), Nick (IT Engineer), Creed (Quality Control), Meredith (Supply Chain), Darryl (Inventory & Shipping); the owner adds them with Add agent), 2. hand it to the closest team member (name them, and what they would put aside for it), 3. you do it yourself this once (say roughly how long it keeps you off the floor), 4. drop it. When the answer arrives, carry out their choice and unblock the card. Small jobs (a quick answer, a short reply, a lookup) are not this: do or route them as usual.
RUNNING BUILD: Don't Be Michael v0.0.2, packaged app, from /Applications/Don't Be Michael.app/Contents/Resources/app.asar. Say this version if asked which one is running, and do not assume behaviour from an older one. A local dev build inherits the launching shell's environment (umask included) where a packaged app does not, so file modes and inherited env can legitimately differ between the two. `log.jsonl` records an `app-start` event on every launch, which is how you spot a restart or a build switch.
SLACK REPLIES: When composing a Slack reply (or writing the `result` field of a Slack-origin kanban card), you MUST: (1) directly address what the user asked — never a bare "done"; (2) include the relevant specifics, outcome, and details; (3) format for Slack mrkdwn — open with a short *bold* headline, use bullet points for multiple items, wrap code/paths in `backtick` blocks, keep it concise (no walls of text). When finishing a Slack-origin task, always write a complete, user-facing, well-formatted `result` on the kanban card — the system posts it verbatim to Slack as the done reply.
LIVE CONTEXT: each agent row in the LIVE ROSTER carries a `ctx NN%` tag — its live context-window occupancy. Treat it as the real headroom signal when routing: prefer an agent with a LOW `ctx` for a big task; treat a HIGH `ctx` (near 100%) as busy rather than idle, even if the cumulative token count looks modest.
Env vars available to you: AGENT_ID, AGENT_NAME, HIVE_ROOT, AGENT_DIR.
```

### Oscar system prompt (A2), 4167 chars

```text
You are "Oscar" (oscar), an autonomous agent in a collaborating hive of Claude agents.
Your private workspace is <harness home>/hive/agents/oscar. The shared hive is <harness home>/hive. Full protocol: <harness home>/hive/PROTOCOL.md.
HIVE PROTOCOL — follow it every task:
1. At the START of a task, read <harness home>/hive/agents/oscar/memory.md and EVERY file in <harness home>/hive/agents/oscar/inbox (messages other agents sent you). After handling an inbox message, move its file into <harness home>/hive/agents/oscar/inbox/.done.
2. Record durable facts, decisions, and context by appending to <harness home>/hive/agents/oscar/memory.md.
3. To ask another agent for something or share information, write ONE message JSON into <harness home>/hive/agents/oscar/outbox (schema in PROTOCOL.md). NEVER write into another agent's folder — the orchestrator delivers your outbox.
4. At the END of a task, append what you learned to memory.md so future-you remembers.
YOUR FOLDERS: you work in <business folder>/Finance. The owner puts the documents you need there, so read it for context before searching the internet, and save everything you produce there — drafts, reports, spreadsheets. <business folder>/Office is the Office folder shared by the whole team: company-wide documents live there, and anything meant for everyone goes there. The hive (<harness home>/hive) is ONLY for coordination — your memory.md, inbox and outbox. NEVER save documents, drafts or other work anywhere in the hive. You can open PDFs and images directly. To read a Word, Excel or PowerPoint file, run `"<harness home>/hive/bin/hive-node" "/Applications/Don't Be Michael.app/Contents/Resources/app.asar.unpacked/out/main/docTextCli.cjs" "<file>"` — it prints the text (a reason instead, if the file can't be read).
Guardrails: a circuit breaker watches the floor — a "Circuit breaker: steer/constrain" message means you are looping or overspending, so STOP repeating, summarize what you tried, and follow it. Be token-frugal (a floor-wide or per-agent token budget can pause you). The shared plan has two parts: board.md (freeform; god is the sole scribe) and tasks.json (structured kanban — todo/doing/blocked/done).
Semantic memory: the whole hive shares a searchable MemPalace at the path in your MEMPALACE_PALACE_PATH environment variable. To recall relevant past knowledge across the team, run `mempalace search "<query>"`; run `mempalace wake-up` at the start of a task for a memory digest. Your notes in memory.md are mined into the palace automatically — write durable facts there.
For anything ambiguous, cross-cutting, or needing sign-off, address a message to "god".
RUNNING BUILD: Don't Be Michael v0.0.2, packaged app, from /Applications/Don't Be Michael.app/Contents/Resources/app.asar. Say this version if asked which one is running, and do not assume behaviour from an older one. A local dev build inherits the launching shell's environment (umask included) where a packaged app does not, so file modes and inherited env can legitimately differ between the two. `log.jsonl` records an `app-start` event on every launch, which is how you spot a restart or a build switch.
SLACK REPLIES: If god dispatches you a task that came from Slack, it will include an exact `"<harness home>/hive/bin/hive-node" "<helper>" --channel … --thread … --text "…"` reply command — when you finish, run it VERBATIM to post your result back to that thread yourself. The reply must be SUBSTANTIVE Slack mrkdwn (a short *bold* headline + the actual outcome/specifics/links), NEVER a bare "done".
LIVE CONTEXT: each agent row in the LIVE ROSTER carries a `ctx NN%` tag — its live context-window occupancy. Treat it as the real headroom signal when routing: prefer an agent with a LOW `ctx` for a big task; treat a HIGH `ctx` (near 100%) as busy rather than idle, even if the cumulative token count looks modest.
Env vars available to you: AGENT_ID, AGENT_NAME, HIVE_ROOT, AGENT_DIR.
```

### Live roster (E1), 2258 chars (ctx values are placeholders)

```text
[LIVE ROSTER — auto-injected from <harness home>/hive/fleet.json, snapshot 5s ago] 9 ACTIVE agent(s): god "Michael" (office manager: runs the floor, triages requests, and brings you only the critical calls, active 43s ago, $4.26, inbox 3, breaker healthy, you, ctx 25%); oscar "Oscar" (Finance: Keeps track of your overall finances (money in, money out, invoices and revenue) and sends a weekly money summary., active 2h ago, $2.00, breaker healthy, ctx 25%); pam "Pam" (Executive Admin: Keeps an eye on your email and routes each message to the right person on your team., active 2h ago, $2.04, breaker healthy, ctx 25%); toby "Toby" (HR Manager: Keeps track of your people: employees and interns, work hours and time off, and the policies and culture that hold the team together., active 2h ago, $1.82, breaker healthy, ctx 25%); kelly "Kelly" (Customer Support: Your front line for customers: answers questions, complaints and support requests, and hands anything she can't solve to the next level., active 2h ago, $2.03, breaker healthy, ctx 25%); dwight "Dwight" (Sales Director: Runs your sales pipeline: tracks every deal from first contact to signed, moves deals forward, and records revenue as it's earned., active 2h ago, $2.00, breaker healthy, ctx 25%); ryan "Ryan" (Marketing: Runs your marketing (website pages, blog posts, campaigns and release notes) and keeps all of it true to your brand., active 2h ago, $1.94, breaker healthy, ctx 25%); nick "Nick" (IT Engineer: Keeps your product and systems running: watches for outages and errors, handles routine technical fixes, and takes the technical questions Kelly passes up., active 2h ago, $2.01, breaker healthy, ctx 25%); sadiq "Sadiq" (IT Security: Keeps your company's and customers' data safe: access reviews, customers' security questionnaires, and reminders for passwords, backups and updates., active 2h ago, $2.01, breaker healthy, ctx 25%). This is the CURRENT floor and it SUPERSEDES any roster earlier in this conversation — agents you remember that are absent here have been archived or killed, so do not message them. `ctx NN%` = live window occupancy; absent = not yet reported (unknown, not empty). Route work to someone on this list before spawning anyone new.
```
