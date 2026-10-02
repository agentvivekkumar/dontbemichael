# Claude account connectors: discovered, off by default, granted per agent

Status: reviewed (CEO, eng, design) and built 2026-10-02 (T1 to T10), shipped on feat/claude-connectors for 0.0.15. See Build notes at the end.
Owner brief (2026-10-02): lean on Claude connectors as much as possible. The app has its own
connection only when (1) Claude has no connector for the system, or (2) Claude allows one account
per connector but the business needs more (email: many mailboxes). Every Claude connection is off
by default and blocked for every agent; Settings lists the possible connections for the owner to
turn on; once on, each agent's Capabilities tab grants it to that agent. Today the app does not
show all the connectors on the Claude account: discover them automatically.

## Evidence (probes, 2026-10-02, Claude Code 2.1.287)

- `claude mcp list` (no model call, no tokens) lists every Claude account connector as
  `claude.ai <Name>: <url> - ✔ Connected | ! Needs authentication`. This machine: Claude Docs,
  Intuit QuickBooks, Intuit TurboTax, Windsor.ai (needs sign in), HubSpot, Google Drive, Gmail,
  Google Calendar.
- A session's stream-json `init` lists the same servers with `source: "claudeai"` and their tools,
  prefixed `mcp__claude_ai_<Name>__` (QuickBooks 91 tools, HubSpot 34, Gmail 30, Drive 11,
  Calendar 9, Claude Docs 8, TurboTax 7).
- Agents start with `--settings` only (`src/main/hive.ts:1203`), so every agent session loads every
  connector. Only two are gated today: QuickBooks (`src/main/hooks.ts:352`) and Gmail/Calendar
  (`src/main/hooks.ts:375`). **HubSpot, Google Drive, TurboTax and Claude Docs are open to every
  agent now, with no switch.**
- Agents also inherit the owner's personal Claude Code servers and plugins (this machine: serena,
  headroom, HubSpotDev and 10 plugin servers such as Slack, Notion, Atlassian).
- `ENABLE_CLAUDEAI_MCP_SERVERS=false` at start drops every Claude account connector (0 of 8 in
  `mcp list`; a real session keeps only plugin and user servers). Child processes inherit it.
- `--strict-mcp-config` keeps only `--mcp-config` servers (the app's md-mail) and drops user
  servers, plugins and Claude account connectors alike.

## Problem (0A)

The app has no control over which Claude account connectors agents use. Missing UI is the
symptom. Doing nothing leaves any agent able to edit the CRM, read Drive or tax data, and use the
owner's personal plugins, with no consent anywhere.

## What already exists (0B)

| Need | Reuse |
|---|---|
| Per-call gate | PreToolUse hook in `src/main/hooks.ts` (QuickBooks and Gmail/Calendar branches) |
| Owner switch plus per-agent grant | QuickBooks pattern: `src/shared/quickbooks.ts`, `QuickBooksSettings`, Capabilities group |
| Resource calls through a connector | `isQuickBooksResourceCall` (ListMcpResources / ReadMcpResource) |
| Per-agent restart that keeps the thread | respawn with `--resume` (`src/main/hive.ts:1381`) |
| Data-driven Capabilities groups | `src/renderer/src/components/CapabilitiesTab.tsx` |
| Hidden headless claude runs | `src/main/hiddenClaude.ts` |

## Dream state (0C)

```
  CURRENT                         THIS PLAN                          12-MONTH IDEAL
  2 hand-built gates; every   ->  every Claude connector found   ->  connectors are a dial per agent,
  other connector and the         automatically, off by default,     with an activity record, and new
  owner's dev tools open to       granted per agent, blocked at      connectors on the account appear
  all agents, invisible           start and on every call            already safe
```

## Decisions (ledger)

| ID and owner | Contract and evidence | Current | Proposed | Status | Exact approval and scope |
|---|---|---|---|---|---|
| MODE (0E) | added capability, about 16 files (E4 included) | SELECTIVE EXPANSION | | approved | D1, owner 2026-10-02 |
| CORE (owner brief) | connectors discovered, off by default, owner on in Settings, per agent on Capabilities | in scope | | approved | owner brief 2026-10-02 |
| ROW-1 enforcement (S1/S3) | probes above | both layers: an agent with no grants starts with connectors removed; any agent's tool calls are default deny except granted connectors and the app's own servers | | approved with condition | D2: granting or revoking never needs an app restart; an agent restart is automatic or one click. Plan: the app restarts only that agent, automatically when idle, resuming its thread with `--resume`; the tool check enforces the change until then |
| E1 personal tools (S3) | 13 servers inherited today | agents never use the owner's personal Claude Code servers or plugins; not listed in Settings | | approved (Add) | D3 |
| E2 upgrade notice (S9) | connectors in use switch off on update | one Ask me card after the update naming connectors now off, opening Settings > Connections; once | | approved (Add) | D4 |
| E3 sign-in rows (S11) | Windsor.ai needs authentication | rows that need sign in show greyed with "Sign in at claude.ai" | | approved (Add) | D5 |
| E4 unify (S1/S11) | Gmail/Calendar row in Mailboxes; QuickBooks section | one list for every Claude connector; Gmail/Calendar and QuickBooks become rows keeping their extra options (QuickBooks read only or can change) | | approved (Add) | D6 |
| E5 activity log | | | per-connector record of calls | deferred | D7: TODOS.md |
| ROW-2 fail closed (S3) | `harnessGuard.ts:13`: the hook fails open; probe: a `permissions.deny` rule such as `mcp__claude_ai_Claude_Docs` in an agent's `--settings` removes all that connector's tools (0 loaded) | each agent's start-up settings deny every known connector and personal server it was not granted (Claude Code enforces it); the tool check refuses connector and MCP resource calls it cannot decide | | approved | D8 |
| ROW-3 migration (S9) | explicit consent today: `quickbooksClaude` + per-agent QuickBooks caps; `mcpDefaults['email-calendar']` (team-wide) | the owner's existing yes carries over: QuickBooks keeps its switch and each agent's access; Gmail/Calendar on becomes on and granted to every agent that could use it before; every other connector starts off | | approved | D9 |
| ROW-4 QuickBooks role default (S1) | `src/shared/quickbooks.ts:91` | kept: when QuickBooks is on, roles that read the books get read access without a grant; the one exception to "nothing until granted" | | approved (owner chose B) | D10 |
| ROW-5 discovery cadence (S1/S7) | `mcp list` ~5 s, starts personal stdio servers | background at app start, on opening Settings > Connections, and on Refresh; agents use the last good list | | approved | D11 |
| OUTSIDE voice (closing) | owner rule: Codex only for adversarial review | skipped | | settled | owner answer 2026-10-02 |
| TODO-1 plugins (S3) | plugin skills/hooks/agents load in sessions | | add to TODOS.md | approved (Add) | owner answer 2026-10-02 |
| TODO-2 nested claude (S3) | existing P1 TODO | | narrow to agents with grants | approved (Update) | owner answer 2026-10-02 |

Approval readiness: PASS (MODE D1, CORE brief, ROW-1 D2, E1 D3, E2 D4, E3 D5, E4 D6, E5 D7, ROW-2 D8, ROW-3 D9, ROW-4 D10, ROW-5 D11, OUTSIDE, TODO-1, TODO-2).

## Clarifications from the spec review (2026-10-02, no behavior change)

- **What the default-deny check covers.** Only MCP tools (`mcp__*`) and the MCP resource tools
  (`ListMcpResourcesTool`, `ReadMcpResourceTool`, generalizing `isQuickBooksResourceCall`). Built-in
  tools (Bash, Read, Edit...) are untouched. Allowed through: tools of connectors granted to that
  agent, and the app's own servers passed with `--mcp-config` (today only `md-mail`). The catalog
  `munder-*` servers never load (Claude Code ignores `mcpServers` in `--settings`, re-probed
  2026-10-01), so strict mode removes nothing the app relies on.
- **Every spawn path gets the same rule:** team agents, Michael, temp workers (off in this build,
  `ALLOW_TEMP_WORKERS`), and `hiddenClaude` runs that have tools. A Task subagent runs inside its
  parent's session, so it has the same tools and deny rules. Non-Claude engines are not offered in
  this build (`BUILD_ENGINES`).
- **Michael** follows the same rule. The owner grants connectors on Michael's Capabilities tab like
  anyone's.
- **Gmail/Calendar becomes per agent.** The 2026-09-26 rule (one Settings switch, every agent
  alike) is superseded by the owner brief of 2026-10-02 and D6. D9 carries today's access over as a
  grant to every agent, Michael included. After that one migration `mcpDefaults['email-calendar']`
  is no longer read. `isEmailCalendarTool`'s name matching retires with it: Gmail and Google
  Calendar are rows like any connector, an Outlook connector on the account would be its own row,
  and `munder-email-calendar` never loads.
- **"Switched off by the update" (E2)** means connectors agents could reach before the update that
  have no carried-over yes under D9: on this machine HubSpot, Google Drive, TurboTax, Claude Docs.
  No card when that list is empty.
- **E1 covers MCP servers only:** personal servers and plugin MCP servers. Plugin skills, hooks and
  agents still load in agent sessions; that is a separate risk (see TODO candidates).
- **A busy agent.** The automatic restart waits for idle. While it waits, the agent's card offers
  one click, "Restart <name> to apply", which resumes its thread. The tool check enforces the new
  grants in the meantime.
- **Fail closed means unreachable too (D8).** When the hook shim cannot reach the app socket
  (`harnessGuard.ts:13` lets calls through today), it refuses `mcp__*` and MCP resource calls.
  Built-in tools keep today's behavior.
- **Discovery failure (D8).** A failed run (offline, signed out, timeout) keeps using the last
  good list, so deny rules and grants (including D10's role default) carry on; the check still
  refuses any connector it cannot match. Only when discovery has never succeeded does every agent
  start with `ENABLE_CLAUDEAI_MCP_SERVERS=false` and `--strict-mcp-config`. The Settings list
  shows "Couldn't read your Claude connectors" with Try again and the time of the last good read.
- **No settings file, no connectors (D8).** If an agent's `--settings` cannot be written
  (`hive.ts:1197-1204` skips it when the socket or shim path is missing), that agent has no hook and
  no deny rules, so it starts with `ENABLE_CLAUDEAI_MCP_SERVERS=false` and `--strict-mcp-config`
  whatever its grants.
- **Grants need the restart; revokes don't (D2).** A newly granted connector is removed by that
  agent's start-up deny rule (or start-up removal) until the agent restarts, so a grant takes
  effect at the automatic idle restart or the one-click "Restart <name> to apply". A revoke is
  enforced at once by the tool check and made permanent at the restart.
- **"No grants" (D10)** means no explicit grant and no role default: an agent that reads the books
  holds QuickBooks while it is on, so it starts with connectors and deny rules, not stripped.
- **hiddenClaude runs** have no hook (`bypassPermissions`, no `--settings`). Every caller today
  (`workStyleConvert.ts:68`, `memoryTidy.ts:246`, `hireCheck.ts:62`) passes `noTools`, which already
  adds `--strict-mcp-config`; also set `ENABLE_CLAUDEAI_MCP_SERVERS=false`, and any future run with
  tools must do the same.
- **Connector identity.** Key: the name after `claude.ai ` (for example `Intuit QuickBooks`), with
  the URL stored to spot a rename. Tool prefix: `mcp__` + the server name with every character
  outside `[A-Za-z0-9_-]` turned into `_` (verified: `claude.ai Intuit QuickBooks` ->
  `claude_ai_Intuit_QuickBooks`, `claude.ai Google Drive` -> `claude_ai_Google_Drive`). Personal
  and plugin servers (E1) take their names from the same `claude mcp list` output and the same
  rule (`serena` -> `mcp__serena`, `plugin:enterprise-search:slack` -> `mcp__plugin_enterprise-search_slack`);
  verify each against a session `init` in tests. A
  mismatch only loses the deny-rule layer: the check denies every `mcp__claude_ai_*` it cannot
  match to a grant.
- **Lifecycle.** Turning a connector off keeps its per-agent grants but blocks them; turning it on
  again restores them. A connector that disappears from the account shows "Removed from your
  Claude account" until the owner clears it, and its grants stop working; a renamed connector
  (same URL) keeps its grants. Agents hired after the update start with no grants (D9 is a
  one-time carry-over), except the D10 role default.
- **E2 baseline.** Computed once, at the first successful discovery after the update: every
  connected connector without a D9 carry-over. Shown once; a `connectorsUpgradeNoticeShown` flag in
  config stops it repeating. If discovery fails at first, the card waits for the first success.
- **Size.** E4 merges the Mailboxes Claude account row and the QuickBooks section into the list:
  about 16 files, not 10.

- **Discovery cost.** `claude mcp list` health-checks every server, starting the owner's personal
  stdio servers each run; measure it in Section 7 before settling how often it runs.

## NOT in scope

- Per-connector activity log: deferred (D7), in TODOS.md.
- Disabling plugin skills, hooks and agents in agent sessions: deferred to TODOS.md (TODO-1).
- Closing the nested `claude` hole for agents with grants: tracked in the narrowed P1 TODO (TODO-2).
- A switch to let an agent use one of the owner's personal Claude Code servers or plugins: rejected
  by design (E1, D3 blocks them all).
- Codex outside review of this plan: skipped by the owner's Codex rule.

## Review sections

### Section 1: Architecture

```
                         Claude Code CLI (owner's login)
                          |  claude mcp list (~5 s)          agent session (claude ... --settings S --mcp-config md-mail)
                          v                                    |  PreToolUse hook (shim -> app socket)
  +-------------------- main process ---------------------+   v
  | connectorDiscovery.ts  (NEW)                         |  hooks.ts  ---- connectorAccess(cfg, agent, tool)  (NEW, shared)
  |   run at app start, Settings > Connections open,      |     |            mcp__* / MCP resource calls only
  |   Refresh (D11); parse; keep last good list in config |     |            allow: granted connectors (+D10 role default), md-mail
  |        |                                              |     |            deny: everything else; undecided or unreachable -> deny (D8)
  |        v                                              |     |
  |   config.claudeConnectors {list, readAt}  (NEW)       |  hive.ts spawn (CHANGED)
  |   config.connectorsOn {key: bool}         (NEW)       |     agent with no grants (explicit or role) OR no settings file:
  |   agentCapabilities[a].connectors [key]   (NEW)       |        ENABLE_CLAUDEAI_MCP_SERVERS=false + --strict-mcp-config
  |        |                                              |     otherwise: settings.permissions.deny = every known ungranted
  |        +--> grant change -> restartWhenIdle(agent)    |        connector + personal/plugin server (D8)
  |              (resume thread, D2; one click if busy)   |
  +-------------------------------------------------------+
           | IPC: connectors:list / connectors:refresh / connectors:setOn / capabilities save (existing)
           v
  renderer: Settings > Connections > "Claude connectors" list (NEW, replaces QuickBooksSettings
            section and the Mailboxes Claude account row, E4); CapabilitiesTab "Connectors" group (NEW)
```

Data flow, discovery (four paths):
- **Happy:** `mcp list` prints `claude.ai <Name>: <url> - <status>` lines; parse into
  `{key: Name, url, status: connected | needs-sign-in}`; save with `readAt`; push to the renderer.
- **Nil:** CLI missing or not signed in: no lines; keep the last good list, mark the read failed.
  Never written before means `list: null`, and every agent is stripped (D8 clarification).
- **Empty:** signed in, no connectors: save `list: []` (a successful read). Agents with no grants are
  stripped anyway; the Settings list says "No connectors on your Claude account" with a link to add one.
- **Error:** timeout (15 s cap) or a non-zero exit: keep the last good list; Settings shows the
  failure with Try again.

Connector state (per key):
```
  unknown --discovered--> listed(off) --owner on--> on --owner off--> listed(off, grants kept)
     listed --missing from a successful read--> removed (grants inert; owner clears)
     needs-sign-in rows can be switched on but stay inert until connected (E3 hint)
  invalid: a grant on a connector that is off or removed -> the hook denies; the deny rule is written
```

Coupling: hooks.ts gains one shared module (`src/shared/claudeConnectors.ts`: key/prefix rule,
`connectorAccess`) that replaces `isEmailCalendarTool` for Gmail/Calendar and wraps the QuickBooks
rules (read only vs can change stays in `quickbooks.ts`). Justified: one rule for every connector (E4).
Single points of failure: the app socket (mitigated by D8 fail closed plus deny rules) and the
`mcp list` text format (mitigated by last good list; a parse failure is a failed read, logged).
Rollback: revert the release; the old build reopens every connector to every agent (today's behavior).

**Findings:** (1) **WARNING** `mcp list` is text, not JSON: parse with a strict line regex and treat
an unparseable run as a failed read (covered by the Error path). (2) **OK** discovery and the gate are
independent: enforcement never waits on discovery. No new decision needed.

### Section 2: Error & Rescue Map

```
  CODEPATH                         | WHAT CAN GO WRONG               | CLASS
  ---------------------------------|---------------------------------|------------------------
  connectorDiscovery.run           | CLI missing / not on PATH       | spawn ENOENT
                                   | not signed in / no output       | EmptyDiscovery
                                   | hangs (health checks)           | timeout (15 s)
                                   | format changed                  | ParseError
  hooks connectorAccess            | app socket unreachable (shim)   | fail closed (D8)
                                   | tool name not matchable         | unknown connector
  hive spawn deny rules            | settings file cannot be written | write error / no sock path
  restartWhenIdle                  | agent never idle                | stays pending
                                   | resume id missing               | fresh thread
  migration (D9) / upgrade card    | discovery not yet succeeded     | deferred

  CLASS               | RESCUED | ACTION                                         | USER SEES
  --------------------|---------|------------------------------------------------|---------------------------
  spawn ENOENT        | Y       | keep last good list; log                       | "Couldn't read your Claude connectors" + Try again
  EmptyDiscovery      | Y       | as above; never-read means strip agents        | same, and agents work without connectors
  timeout             | Y       | kill process group; keep last good; log        | same
  ParseError          | Y       | treat as failed read; log first bad line       | same
  socket unreachable  | Y       | shim denies mcp__* and resource calls          | agent sees "Connector blocked: the app could not confirm access"
  unknown connector   | Y       | deny                                           | agent sees a refusal naming the connector
  settings write fail | Y       | strip all connectors at spawn; log             | agent runs without connectors
  never idle          | Y       | one click "Restart <name> to apply" on its card | the card
  resume id missing   | Y       | restart fresh; log                             | normal start
  discovery pending   | Y       | migration and card wait for first success      | card later
```
No catch-alls: the discovery wrapper names each class. **No CRITICAL GAPS.**

### Section 3: Security & Threat Model

| Threat | Likelihood | Impact | Mitigated by |
|---|---|---|---|
| Agent uses an ungranted connector (today: HubSpot, Drive, TurboTax, Docs open) | High (today) | High | D2 + D8: start-up strip or deny rules, default-deny hook |
| Nested `claude` from an agent's Bash bypasses the hook | Med | High | Agents with no grants: env inherited (connectors gone). Agents with grants: still reachable; see TODO candidate |
| Hook unreachable lets calls through | Med | High | D8 fail closed + Claude Code deny rules |
| Owner's personal servers/plugins used by agents | High (today) | Med | E1: strict at spawn, deny rules, hook default deny |
| Plugin skills/hooks/agents still load in sessions | Med | Med | Not covered (E1 is MCP only): TODO candidate |
| Opaque connector server name (existing TODO) | Low | Med | Default deny: an unmatched `mcp__*` is refused, so this TODO is resolved |
| MCP resource tools read across servers | Med | Med | `connectorAccess` gates `ListMcpResourcesTool`/`ReadMcpResourceTool` by their `server` input |
| Discovery output injected into UI | Low | Low | rendered as text nodes; key and URL length-capped; URL shown, never opened except the fixed claude.ai settings link |
No new secrets; no new dependencies. Audit trail: deferred (E5).

### Section 4: Data Flow & Interaction Edge Cases

Grant flow: `owner grants on Capabilities -> config save -> hook allows at once? no: the start-up
deny rule still removes it -> restartWhenIdle -> respawn with new deny list -> tools present`.
Revoke flow: `config save -> hook denies at once -> restartWhenIdle -> deny rule written`.
Async ordering (invariant: an agent never runs with a connector the config does not grant):
- Revoke while the agent is mid-call: the call already allowed completes; the next call is
  refused (hook reads config per call). Restart waits for idle. Holds.
- Two grant changes before idle: one restart reads the latest config at spawn. Holds.
- Discovery finishes during a spawn: spawn reads the list once; the next restart picks up the new
  one; the hook default-denies any connector missing from the agent's grants either way. Holds.
Interaction edges: double-click a switch (idempotent save); Settings closed mid-discovery (result
still saved); 0 connectors (empty state); 30 connectors (list folds like Mailboxes); a connector
removed while granted (row shows Removed, grants inert).

### Section 5: Code Quality

- DRY: replace `isEmailCalendarTool` (mcpCatalog.ts:169) and the Gmail branch at hooks.ts:375 with
  `connectorAccess`; keep `quickbooksAccess` for read only vs can change, called from it.
- One normalization function for key -> tool prefix, used by spawn deny rules, the hook and the UI.
- Retire `mcpDefaults['email-calendar']` reads after the D9 migration; keep the field readable for
  old config files.
No over-engineering found.

### Section 6: Tests

| New behavior | Test |
|---|---|
| parse `mcp list` lines (connected, needs sign in, plugin/user ignored for the list, garbage) | unit |
| key -> prefix rule (`Intuit QuickBooks`, `Google Drive`, `Windsor.ai`, `plugin:enterprise-search:slack`, `serena`) | unit, fixtures from real `init` |
| connectorAccess: granted / not granted / off / removed / unknown / role default (D10) / md-mail / resource tools | unit table |
| shim unreachable denies `mcp__*`, allows built-ins | unit on harnessGuard |
| spawn: no grants -> env + strict; grants -> deny list; no settings file -> strip | unit on hive args |
| restartWhenIdle: idle now, busy then idle, never idle -> card button | unit with fake clock |
| migration D9: QuickBooks on + caps carried; email-calendar on -> granted to every agent incl. Michael; others off | unit |
| upgrade card E2: lists the off ones once; none when empty; waits for first success | unit |
| discovery failure keeps last good list | unit |
| live probe (manual, before ship): an agent with no grants has 0 `claude_ai` tools in `init`; a HubSpot-only agent has HubSpot and no Drive | manual check on 2.1.287+ |
Friday-2am test: the live probe above. Hostile QA: an agent asks Bash to run `claude -p` with Drive
(no grants: refused; with grants: see TODO). Chaos: kill the app socket mid-session (calls refused).

### Section 7: Performance

Discovery ~5 s (measured 5.4 s, 4.5 s), background only, about 3 runs a session (D11); hard 15 s
cap. Spawn adds no wait (cached list). Hook adds one map lookup per MCP call. Deny lists are at most
tens of entries. No issues.

### Section 8: Observability

Log lines (main log): discovery start/end with counts and duration, each failure class; every
connector refusal (agent, connector, tool, reason) at info; restart-to-apply scheduled/done. These
lines are the seed for E5's activity log. Debuggable after 3 weeks from logs alone: yes for refusals
and discovery; per-call allows are not logged (E5).

### Section 9: Deployment & Rollout

One release. Order inside the build: discovery + config -> hook default deny -> spawn layer ->
UI -> migration. On first launch: discovery runs; D9 migration runs once (`connectorsMigrated` flag);
E2 card after first success. Old/new mix: none (single app). Rollback: install the previous release
(connectors reopen to every agent; the new config keys are ignored by it). Post-update check: the
live probe in Section 6 on the release build. No feature flag for the gate: off by default is the fix.

### Section 10: Long-Term Trajectory

Reversibility 4/5 (config keys additive; the old build ignores them). Debt: `mcp list` text parsing
(watch Claude Code releases; the init-based fallback is documented). Platform: per-agent connector
grants are the base for E5 and for future read-only modes per connector. Cherry-pick retrospective:
E4 is load-bearing for the one-rule promise; E1 stops the same leak class; right calls.

### Section 11: Design & UX (UI scope)

First, second, third: the Claude connectors list (name, status, on/off), then per-agent grants on
Capabilities, then the restart-to-apply state on the agent card.

| Feature | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| Connectors list | "Reading your Claude connectors" | "No connectors on your Claude account" + link | failure line + Try again + last read time | rows with switches | needs-sign-in rows greyed with "Sign in at claude.ai" (E3) |
| Capabilities "Connectors" group | from cache, no wait | "Turn connectors on in Settings" link | n/a | one switch per on connector | Gmail/QuickBooks rows keep their extra options (E4) |
| Restart to apply | "Restarting to apply" | n/a | "Couldn't restart" + Try again | normal card | waiting for idle |

User flow:
```
Settings > Connections > Claude connectors --switch on HubSpot--> Pam's Capabilities > Connectors
  --grant HubSpot--> Pam's card: "Restart to apply" (auto when idle) --> Pam uses HubSpot
```
Layout, wording and the merged Mailboxes/QuickBooks placement need `/plan-design-review` before
build (pending, owner: design review). Follow DESIGN.md fields-first: one line per connector,
explanations behind an info icon.

## Dream state delta

After this plan: every Claude connector is discovered, off by default, per agent, and locked by
Claude Code's own deny rules plus a fail-closed check. Still short of the 12-month ideal: no activity
record (E5), plugin skills/hooks still load (TODO-1), and an agent with grants can start a nested
`claude` that skips the gate (TODO-2).

## Failure Modes Registry

```
  CODEPATH              | FAILURE MODE                  | RESCUED? | TEST? | USER SEES?                    | LOGGED?
  ----------------------|-------------------------------|----------|-------|-------------------------------|--------
  discovery             | CLI missing / signed out      | Y        | Y     | failure line + Try again      | Y
  discovery             | timeout / parse error         | Y        | Y     | same                          | Y
  discovery             | never succeeded               | Y        | Y     | agents run without connectors | Y
  hook                  | socket unreachable            | Y        | Y     | agent sees blocked message    | Y
  hook                  | unknown connector             | Y        | Y     | agent sees refusal            | Y
  spawn                 | settings file not written     | Y        | Y     | agent runs without connectors | Y
  restart to apply      | agent never idle              | Y        | Y     | one-click on the card         | Y
  migration / card      | discovery pending             | Y        | Y     | card later                    | Y
```
0 CRITICAL GAPS.

## Scope Expansion Decisions

CEO archive: ~/.gstack/projects/agentvivekkumar-dontbemichael/ceo-plans/2026-10-02-claude-connectors.md
- Accepted: two-layer enforcement (D2), E1 (D3), E2 (D4), E3 (D5), E4 (D6), fail closed (D8), carry-over (D9), role default kept (D10), discovery cadence (D11).
- Deferred: E5 activity log (D7); plugin skills/hooks (TODO-1).
- Skipped: none.

## Stale Diagram Audit

Files touched with ASCII diagrams: none found in hooks.ts, hive.ts, quickbooks.ts, mcpCatalog.ts,
MailboxesSettings.tsx or CapabilitiesTab.tsx. DESIGN.md §7.12 (Access groups) and §7.26 (Mailboxes
note) describe the Claude account row and QuickBooks section and must be updated with E4.

## Implementation Tasks

Synthesized from this review's findings. Each task derives from a specific finding above. Run with
Claude Code or Codex; checkbox as you ship.

- [x] **T1 (P1, human: ~4h / CC: ~20min)** — shared — `src/shared/claudeConnectors.ts`: `mcp list` parser, key and prefix rule, `connectorAccess` (grants in `agentCapabilities[a].connectors`, D10 role default, md-mail, resource tools); md-mail stays under `.email`
  - Surfaced by: Section 1 / Section 5 — one rule for every connector (E4, D8)
  - Files: src/shared/claudeConnectors.ts, src/shared/quickbooks.ts, src/shared/mcpCatalog.ts
  - Verify: unit table in Section 6
- [x] **T2 (P1, human: ~4h / CC: ~20min)** — main — generalize `claudeQuickBooks.ts` into connector discovery (D11, eng D1): one `mcp list` run (30 s timeout, output read even on a non-zero exit), the general parser in `claudeConnectors.ts`, `parseClaudeQuickBooksStatus` kept as a wrapper, last good list in config, failure classes, logs
  - Surfaced by: Section 1 data flow, Section 2; eng Scope Challenge (reuse), eng Section 1 finding 4
  - Files: src/main/claudeQuickBooks.ts (generalized), src/shared/quickbooks.ts, src/main/config.ts, src/main/index.ts, src/preload/index.ts
  - Verify: parser table tests; quickbooks-capability.test.cjs unchanged and green
- [x] **T3 (P1, human: ~1d / CC: ~45min)** — main — hook default deny for `mcp__*` and resource tools, also when the payload has no agent id; `HOOK_SHIM` (`hive.ts:3660`) prints a deny for those tools when the socket is missing, errors or times out (D8)
  - Surfaced by: Section 3; eng Section 1 findings 1 and 2
  - Files: src/main/hooks.ts, src/main/hive.ts (HOOK_SHIM), src/main/harnessGuard.ts (comment)
  - Verify: connectorAccess table; shim run with no socket returns deny for mcp__ and nothing for Bash
- [x] **T4 (P1, human: ~1d / CC: ~45min)** — main — spawn layer: strip (env + strict) for agents with no grants or no settings file; per-agent `permissions.deny` otherwise; hiddenClaude env (D2, D8, E1)
  - Surfaced by: Section 1, Section 3
  - Files: src/main/hive.ts, src/main/hiddenClaude.ts
  - Verify: spawn-args unit tests; live probe
- [x] **T5 (P1, human: ~4h / CC: ~30min)** — renderer — generalize `pendingEmailRestart` into one restart queue with a reason (eng D1): wait for idle, force after 10 minutes, "Restart now" on the waiting agent's card (eng D2); email and connector grants both use it
  - Surfaced by: Section 4; eng Section 1 finding 3
  - Files: src/renderer/src/hooks/useHive.ts, src/renderer/src/store/store.ts, src/renderer/src/components/CapabilitiesTab.tsx, agent card component
  - Verify: fake-clock unit test (idle now, busy then idle, busy 10 min); existing email restart behavior unchanged
- [x] **T6 (P1, human: ~1d / CC: ~1h)** — renderer — Claude connectors fold first in Connections (design D2, D3); one "Claude connectors" card on Capabilities (design D4); per the T6 layout spec below. Replaces QuickBooksSettings and the Mailboxes Claude account row (E4)
  - Surfaced by: Section 11; design review 2026-10-02
  - Files: src/renderer/src/components/ClaudeConnectorsSettings.tsx (new), SettingsModal.tsx, MailboxesSettings.tsx, QuickBooksSettings.tsx (removed), CapabilitiesTab.tsx, locales x3
  - Verify: source tests for order, fold, auto-open and the card; manual check in the running app
- [x] **T7 (P1, human: ~3h / CC: ~15min)** — main — D9 migration (once) and E2 upgrade card after first successful discovery
  - Surfaced by: Section 9
  - Files: src/main/index.ts, src/main/config.ts
  - Verify: migration and card unit tests
- [x] **T8 (P2, human: ~1h / CC: ~10min)** — docs — DESIGN.md §7.12 / §7.26, docs/designs/multi-mailbox.md note, FEATURES.md
  - Surfaced by: Stale Diagram Audit
  - Files: branding/DESIGN.md, docs/designs/multi-mailbox.md, docs/FEATURES.md
  - Verify: docs read back
- [x] **T10 (P1, human: ~1d / CC: ~40min)** — tests — regression contract (eng D3, refined by design D5): keep the mail-* tests and the 12 QuickBooks rule tests unchanged; rewrite only quickbooks-capability.test.cjs:138-144 (placement) to the connector list and card; rewrite email-calendar-switch.test.cjs to per-agent Gmail/Calendar grants (D6, D9) and the multi-mailbox-ui Claude row test to the connector list (E4); add the Section 6 table
  - Surfaced by: eng Section 3
  - Files: test/email-calendar-switch.test.cjs, test/multi-mailbox-ui.test.cjs, new test/claude-connectors.test.cjs
  - Verify: full suite green
- [x] **T9 (P1, human: ~1h / CC: ~15min)** — verification — live probe on a built app: no-grant agent has 0 `claude_ai` tools; HubSpot-only agent has HubSpot and no Drive; socket killed refuses
  - Surfaced by: Section 6
  - Files: none
  - Verify: stream-json `init` and a refused call

## Completion Summary

```
  +====================================================================+
  |            MEGA PLAN REVIEW — COMPLETION SUMMARY                   |
  +====================================================================+
  | Mode selected        | SELECTIVE EXPANSION                          |
  | System Audit         | every agent reaches HubSpot, Drive, TurboTax, |
  |                      | Docs and 13 personal servers today; only     |
  |                      | QuickBooks and Gmail/Calendar gated          |
  | Step 0               | mode D1; enforcement D2; E1-E4 added, E5     |
  |                      | deferred; D8-D11 from spec review/sections   |
  | Section 1  (Arch)    | 2 issues found (both handled)                |
  | Section 2  (Errors)  | 10 error paths mapped, 0 GAPS                |
  | Section 3  (Security)| 8 threats, 2 High (both mitigated), 2 TODOs  |
  | Section 4  (Data/UX) | 8 edge cases mapped, 0 unhandled             |
  | Section 5  (Quality) | 3 issues found (DRY, handled)                |
  | Section 6  (Tests)   | Diagram produced, 0 gaps                     |
  | Section 7  (Perf)    | 0 issues found                               |
  | Section 8  (Observ)  | 1 gap (per-call allows unlogged, E5)         |
  | Section 9  (Deploy)  | 2 risks flagged (rollback reopens; migration)|
  | Section 10 (Future)  | Reversibility: 4/5, debt items: 1            |
  | Section 11 (Design)  | 1 issue (needs /plan-design-review)          |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (5 items)                            |
  | What already exists  | written                                      |
  | Dream state delta    | written                                      |
  | Error/rescue registry| 10 rows, 0 CRITICAL GAPS                     |
  | Failure modes        | 8 total, 0 CRITICAL GAPS                     |
  | TODOS.md updates     | 3 items (2 added, 1 updated)                 |
  | Scope proposals      | 5 proposed, 4 accepted (EXP + SEL)           |
  | CEO plan             | written                                      |
  | Outside voice        | codex: skipped (owner rule)                  |
  | Lake Score           | 6/6 recommendations chose complete option    |
  | Diagrams produced    | 5 (architecture, data flow, state, error,    |
  |                      | user flow)                                   |
  | Stale diagrams found | 0 (2 DESIGN.md sections to update)           |
  | Unresolved decisions | 0                                            |
  +====================================================================+
```

## Unresolved Decisions

None. Layout and wording of the new Settings list are left to `/plan-design-review` (T6), by design.

## Engineering review (/plan-eng-review, 2026-10-02)

Target: docs/designs/claude-connectors.md (this file). Report file: this file.

### Scope Challenge

- Feature answers: no cuts proposed (scope settled by the CEO review).
- Structure: **B, smaller arrangement** (eng D1, owner 2026-10-02). Generalize
  `src/main/claudeQuickBooks.ts` (already runs `claude mcp list`, `src/main/claudeQuickBooks.ts:25`)
  into the connector discovery runner and `parseClaudeQuickBooksStatus` into a general parser;
  generalize `pendingEmailRestart` (`src/renderer/src/hooks/useHive.ts:1227-1273`) into one restart
  queue with a reason. New files: `src/shared/claudeConnectors.ts`, `ClaudeConnectorsSettings.tsx`.
- Accepted scope: the CEO plan as written, in arrangement B. Pending remedies: none at this point.
- Result: scope accepted as-is.

### Section 1: Architecture (eng)

1. [P1] (9/10) `src/main/hive.ts:3697` `if (!sock) { process.exit(0); }` and `c.on('error', () => process.exit(0))` under a 5 s timeout: the shim allows on every failure. Covered by D8: deny `mcp__*` and MCP resource tools on those paths (T3).
2. [P1] (9/10) `src/main/hooks.ts:352`, `:375`: gates run only `if (event === 'PreToolUse' && agentId && ...)`. Covered by D8: refuse MCP calls with no agent id (T3).
3. [P2] (8/10) `src/renderer/src/hooks/useHive.ts:1234-1245`: the email queue forces a restart after `CEILING_MS = 10 * 60_000`. Resolved by eng D2: one rule for both (idle, force at 10 minutes, Restart now meanwhile).
4. [P2] (8/10) Correction: discovery keeps `claudeQuickBooks.ts`'s 30 s timeout and reads output even on a non-zero exit (`:27-30`), replacing the plan's 15 s cap and "non-zero exit is a failed read".
5. [P3] (7/10) Servers in an agent's working folder (`.mcp.json`) are not in the home-folder discovery, so not in deny rules; the default-deny check and strict mode cover them. Noted.

### Section 2: Code quality (eng)

1. [P2] (9/10) `src/shared/quickbooks.ts:120` `parseClaudeQuickBooksStatus` becomes a wrapper over the general parser (eng D1); its tests (`test/quickbooks-capability.test.cjs:176-193`) stay unchanged (eng D3).
2. [P2] (9/10) `src/renderer/src/components/MailboxesSettings.tsx:57` `emailCalendarAllowed(config.mcpDefaults)` goes with the row (D6); `hooks.ts:383` is its only other caller.
3. [P2] (8/10) Grants live in `agentCapabilities[a].connectors`; the app's mailboxes stay in `.email`. Never store Claude Gmail under `.email`.
4. [P3] (7/10) Keep the shim's new branch to one tool-name check (`hive.ts:3660` is a string template).

### Section 3: Tests (eng)

```
CODE PATHS                                              USER FLOWS
[+] src/shared/claudeConnectors.ts (new)                [+] Owner turns a connector on, grants one agent
  ├── parse mcp list   [GAP] connected / needs sign-in    ├── [GAP] [→E2E] grant -> restart at idle -> tools present
  │                    / plugin+user lines / garbage      └── [GAP] revoke -> next call refused at once
  ├── key -> prefix    [GAP] Intuit QuickBooks, Windsor.ai [+] Update day
  └── connectorAccess  [GAP] grant / off / removed /       ├── [GAP] D9 carry-over (QuickBooks, Gmail incl. Michael)
                        unknown / role default / md-mail / └── [GAP] E2 card once, none when empty
                        resource tools / no agent id      [+] Error states
[+] hooks.ts gate                                         ├── [GAP] discovery fails: last good list + Try again
  ├── QuickBooks rules [★★★ TESTED] quickbooks-capability  └── [GAP] socket down: MCP refused, Bash fine
  ├── md-mail rules    [★★★ TESTED] mail-* tests
  └── Gmail team-wide  [★★ TESTED -> REWRITE, eng D3]
[+] HOOK_SHIM          [GAP] no socket / error / timeout -> deny for mcp__ only
[+] hive.ts spawn      [GAP] no grants -> env+strict; grants -> deny list; no settings -> strip
[+] restart queue      [★★ TESTED email path] [GAP] connector reason, Restart now
[+] UI                 [GAP] list states (loading/empty/error/sign-in/removed), Capabilities group

COVERAGE: 3/22 paths tested today (the regression suite)  |  GAPS: 19, all in T10/T9
Legend: ★★★ behavior + edge + error | ★★ happy path | [→E2E] needs the live probe (T9)
```
Test plan artifact: ~/.gstack/projects/agentvivekkumar-dontbemichael/moblizeit-main-eng-review-test-plan-20261002-010522.md

### Section 4: Performance (eng)

1. [P3] (8/10) `src/main/config.ts:600-602` reads and parses `config.json` per gate call, as QuickBooks does today; MCP calls are rare and a corrupt file falls back to defaults (no grants: deny). No change.
Discovery: about 5 s in the background, about 3 runs a session (D11). No issues.

### Eng decision ledger

| ID | Choice | Answer |
|---|---|---|
| eng D1 | file arrangement | B smaller: generalize claudeQuickBooks.ts and pendingEmailRestart; 2 new files |
| eng D2 (R1) | busy-agent restart | A: idle, force at 10 minutes, Restart now meanwhile (email and connectors alike) |
| eng D3 (R2) | regression contract | A: QuickBooks and md-mail tests unchanged; rewrite only Gmail/Calendar and the Mailboxes row tests; add new tests |
| outside voice | Codex | skipped by the owner's Codex rule |

Approval readiness: PASS (eng D1, eng D2, eng D3, outside voice; CEO rows carried forward unchanged).

### Failure modes (eng)

| New path | Realistic failure | Test | Handling | User sees |
|---|---|---|---|---|
| discovery | Claude Code changes `mcp list` wording | parser table | failed read, last good list | failure line |
| shim | app busy > 5 s | shim test | deny MCP only | agent's call refused, retry later |
| spawn | deny rule name mismatch | prefix table + live probe | hook default deny still refuses | refusal |
| restart queue | agent busy 10 minutes | fake-clock test | forced restart, same conversation | floor note "restarted to apply" |
| migration | runs before first discovery | unit | waits for first success | card later |
0 critical gaps.

### Worktree parallelization

| Step | Modules touched | Depends on |
|------|----------------|------------|
| T1 shared module | src/shared | — |
| T2 discovery | src/main, src/shared | T1 |
| T3 hook + shim | src/main | T1 |
| T4 spawn layer | src/main | T1, T2 |
| T5 restart queue | src/renderer | — |
| T6 UI | src/renderer | T1, T2 |
| T7 migration + card | src/main | T2 |
| T10 tests | test | T1-T7 |

Lane A: T1 → T2 → T3 → T4 → T7 (src/main, sequential). Lane B: T5, then T6 after T1/T2 merge (src/renderer).
Launch A and B (T5). Merge. Then T6, T10, T8, T9. Conflict flag: src/preload and locales touched by both T2 and T6; land T2 first.

### Eng completion summary

- Step 0: Scope Challenge: scope accepted as-is (arrangement B)
- Architecture Review: 5 issues found
- Code Quality Review: 4 issues found
- Test Review: diagram produced, 19 gaps identified (all assigned to T10/T9)
- Performance Review: 1 issue found
- NOT in scope: written (CEO section, unchanged)
- What already exists: written (plus claudeQuickBooks.ts and the email restart queue)
- TODOS.md updates: 0 items proposed
- Failure modes: 0 critical gaps flagged
- Unresolved decisions: 0 in this review
- Outside voice: codex, skipped (owner rule)
- Parallelization: 2 lanes, 1 parallel / 1 sequential
- Lake Score: 1/1

## Design review of T6 (/plan-design-review, 2026-10-02)

Mockups: not generated (the gstack designer's OpenAI key returns 401). Outside voices: skipped by the owner.

| ID | Choice | Answer |
|---|---|---|
| design D2 | order in Connections | A: Claude connectors first, then Mailboxes, then the rest |
| design D3 | fold | A: fold like Mailboxes; starts closed; opens by itself for a connector new since the last visit or a failed read |
| design D4 | Capabilities structure | A: one "Claude connectors" card, a row and switch per connector that is on; QuickBooks' Read only / Can make changes under its row |
| design D5 | reopened eng D3 | A: 12 QuickBooks rule tests frozen; only the 3 placement assertions (`quickbooks-capability.test.cjs:138-144`) follow E4/D4 |

### T6 layout spec

Settings > Connections (D2: first):
```
▸ CLAUDE CONNECTORS  8 connectors, 3 on (i)                         [Refresh]
  (open)
  HubSpot                       connected                            [  o]
  Google Drive                  connected                            [  o]
  Intuit QuickBooks             connected                            [on ]
  Gmail                         connected                            [on ]
  Windsor.ai                    Sign in at claude.ai ↗               [  o] (inert until connected, E3)
  Old Tool                      Removed from your Claude account     [Clear]
  ! Couldn't read your Claude connectors. Last read 2 hr ago.  [Try again]   (only on failure)
▸ MAILBOXES  4 mailboxes (i)                                  [Add a mailbox]
```
- Header like Mailboxes: `Disclosure` caret, title, summary ("8 connectors, 3 on", "none yet", "Reading…"), info icon,
  Refresh. Info icon text: connectors on your Claude account; turned on, you can grant one to team
  members on their Access tab; off ones are blocked for everyone.
- Rows: name (14px), status as words (DESIGN §2.3: connected / Sign in at claude.ai / Removed), owner
  switch labelled "Allow <name> to be granted". Sorted: needs attention (removed) first, then A to Z.
- Auto-open (D3): when discovery finds a key not seen at the last Settings visit (`connectorsSeen`
  in config) or the last read failed.
- Mailboxes' "Your Claude account" row and its info text go away (E4); the Mailboxes info icon gains
  one line: "Gmail on your Claude account is under Claude connectors."

Agent panel > Access (Capabilities), D4:
```
Claude connectors                                   2 of 4   (fold, TriggerCard)
  HubSpot                                                    [on ]
  Google Drive                                               [  o]
  Intuit QuickBooks          on for bookkeeping roles (D10)  [on ]
      ( ) Read only   (•) Can make changes
  Gmail                                                      [  o]
  Restarts when Pam is idle to apply.            [Restart now]   (eng D2, only while pending)
  -- none on in Settings --> "Turn connectors on in Settings" link (cth:open-settings Connections)
```
- Rows only for connectors the owner turned on; switch label "<agent> can use <connector>".
- The app's own Email card (mailboxes) stays separate, above.

### Passes (scores before → after)

| Pass | Score | Notes |
|---|---|---|
| 1 Information architecture | 4 → 9 | order, fold, card structure decided |
| 2 States | 8 → 9 | loading/empty/error/sign-in/removed/pending restart each specified |
| 3 Journey | 7 → 9 | Settings on → Access grant → restart at idle → in use |
| 4 AI slop | 9 → 9 | flat rows, no card grid, words for status |
| 5 Design system | 8 → 9 | reuses the Mailboxes fold, TriggerCard, Toggle, InfoTip, RadioRows |
| 6 Accessibility | 7 → 8 | fold button aria-expanded; switches role=switch with named labels; Refresh and Clear are buttons; status not colour alone |
| 7 Decisions | 4 resolved, 0 deferred | |

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 2 | CLEAR | 5 proposals, 4 accepted, 1 deferred |
| Outside Review | `/plan-*-review` outside voice (codex) | Independent 2nd opinion | 2 | skipped | skipped by the owner's Codex rule; no completed external review |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 3 | ISSUES OPEN | 10 issues, 0 critical gaps (all mapped to tasks) |
| Design Review | `/plan-design-review` | UI/UX gaps | 6 | CLEAR | score: 4/10 → 8/10, 4 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | none | none |

- **OUTSIDE COVERAGE:** codex skipped in the CEO and eng reviews by the owner's standing rule; design outside voices skipped by the owner. No completed external review.
- **VERDICT:** CEO + DESIGN CLEARED. Eng review ISSUES OPEN only as mapped work (T1 to T10), 0 unresolved decisions, 0 critical gaps: ready to implement.

NO UNRESOLVED DECISIONS

## Build notes (2026-10-02)

What the build settled that the plan left open, and where it differs:

- **QuickBooks keeps `quickbooksClaude` as its switch** in the connector list (`connectorOn`), and its
  grant stays `agentCapabilities[a].quickbooks`, so D9 needs no QuickBooks migration. Its hook branch
  is unchanged; the connector gate defers to it.
- **One restart trigger for every cause.** Main records each running agent's start plan (strip, or
  its deny list). After any config write it compares the plan the agent would get now and sends
  `connectors:restartNeeded`; the renderer's one queue (`pendingRestart`, reason email or
  connectors) restarts it at idle, at 10 minutes, or at Restart now. Grants, revokes, the owner's
  switch, a new read and the D9 carry-over all reach running agents this way.
- **`ListMcpResourcesTool` with no server stays allowed**: it lists only what the session loaded,
  which the start-up rules already narrowed. With a server named, it follows that server.
- **Tests outside the plan's list:** two QuickBooks floor assertions encoded "other connectors stay
  open" (`the QuickBooks gate leaves every other tool alone`, and the TurboTax resource line); both
  now assert the connector rule refuses them, not the QuickBooks rule. The 12 QuickBooks rule tests
  are otherwise unchanged. `multi-mailbox-ui`'s restart checks follow the renamed queue.
- **Retired:** `QuickBooksSettings.tsx`, the `quickbooks:claudeStatus` IPC, `isEmailCalendarTool`,
  the Mailboxes "Your Claude account" row and their strings. `claudeQuickBooksStatus` and
  `parseClaudeQuickBooksStatus` (now a wrapper over `parseMcpList`) stay, with their tests.
- **Live probe (T9), Claude Code 2.1.287**, run with the exact args, env and settings file
  `ensureAgent` writes, reading the session `init` line (before any model call):
  no grants: 0 MCP tools, 0 servers; HubSpot only: 34 tools, all `mcp__claude_ai_HubSpot__*`;
  before this change: 215 tools from 9 servers. The deny rules remove tools, not processes: in a
  granted agent's session the owner's stdio servers (headroom, serena) still start, with no tools.
  The socket-down case is covered by running the real shim with no socket and a dead socket
  (`test/claude-connectors.test.cjs`); it was not repeated with a model call.

### Ship review fixes (2026-10-02, /ship)

- **Task subagents are checked as their team member.** Claude Code 2.1.287 puts the
  subagent's id in a hook payload's `agent_id`. The shim now always sends `AGENT_ID` and keeps
  Claude's id as `subagent_id`; a subagent's SubagentStop, transcript and session are not the
  agent's. Before, granted connectors were refused inside subagents and folder privacy was
  skipped there (owner chose to fix, D1 of the ship review).
- **Big MCP calls.** A call over the 256 KB hook frame is sent with only its short input fields,
  so the gates still decide on tool, server and mailbox (owner, D2).
- **A resource list must name its server** (owner, D3): deny rules hide a server's tools, not
  its resources.
- **Dead code removed** (owner, D4): `claudeQuickBooksStatus`, `parseClaudeQuickBooksStatus`
  and their tests (the parser cases moved to `parseMcpList`), the do-nothing automatic updates
  switch, and `connectorsUpgradeNoticeShown` (the carry-over flag already makes the card once).
- **Fail closed at spawn:** a Claude agent whose hive injection failed or is off starts
  stripped. The start plan is computed once and recorded, and includes each usable
  connector's sign-in status, so signing in later restarts the agent.
- **Discovery:** a run killed at the time limit, one that throws, or one that lists no
  connector after a read that had some, is a failed read; the carry-over waits for an open
  office and a read with connectors. `connectors:seen` writes only a change (the Settings list
  looped on its own echo).
- `src/main/claudeQuickBooks.ts` is now `src/main/claudeMcpList.ts`: nothing in it is about
  QuickBooks any more. Subagent hooks no longer feed the agent's loop detector or take its
  queued steer. Opening Connections reads again only when the last read is a minute old.
- Known and left: local-scope and project `.mcp.json` servers are not in the deny list (the
  hook still refuses them, eng review finding 5); grants follow the agent id, so re-hiring a
  role id inherits them, as Email does; D9 runs for the office open at the first good read.

### Codex adversarial review fixes (2026-10-02, gpt-5.4)

- After the first good read, only the discovered QuickBooks connector goes to QuickBooks' own
  gate: a server merely named like QuickBooks (a project `.mcp.json` "claude.ai QuickBooks
  Backdoor") is refused, and QuickBooks that left the account is refused like any connector.
- A `claude mcp list` run that exited non-zero may add connectors or servers but never remove
  them: it is merged into the last good read, and the one-time carry-over waits for a complete
  read (2.1.287 exits 0 even when a server fails its check).
- `claudeBinFor` keeps a quoted path with spaces whole and skips `VAR=value` prefixes.
- Second pass: only the exact `Intuit QuickBooks` connector keeps QuickBooks' own switch (a
  "QuickBooks Payroll" would get its own switch and grants); only two successful empty reads in
  a row replace the list (a failed read resets the count); a window that missed a restart push
  asks main for the pending list (`connectors:pendingRestarts`).
- Third pass: a resource call naming md-mail is refused (it has no resources; the mail gate
  checks tool names); two connector names that become the same tool prefix are both refused;
  an agent stripped by a failed hive injection is asked to restart once, then only on a real
  change.
- Accepted from the third pass: a server of the owner's named `claude.ai <Name>` reads as an
  account connector (only the owner names their own servers, and discovery runs in the home
  folder, never an agent's); the first successful empty read keeps the old list until a second
  one (a connector gone from the account cannot be reached anyway).
- Open (investigate): a timed-out read kills only `claude mcp list`, not any server it started.
- Open (known limit, both Codex passes): an agent holding a connector starts without
  `--strict-mcp-config`, so the owner's own stdio servers still start in its session with
  their tools denied. Claude Code has no way to load account connectors while skipping user
  servers; closing it needs a separate Claude profile for agents.

