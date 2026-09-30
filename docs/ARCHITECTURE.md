# Architecture, project structure and design system

_Moved out of the README so that document can do its job of explaining the product._
_This is the contributor's map. Start here before your first pull request._

## Architecture

Two data planes feed one renderer:

```
┌───────────────────────────────────────────────────────────────┐
│                     Electron Renderer (React)                  │
│   ┌──────────────────┐    ┌──────────────────────────────┐    │
│   │ Office Floor      │    │ Terminal + Command Bar       │    │
│   │ (Pixi.js)        │    │ Files + Git tabs (xterm.js)  │    │
│   └─────────▲────────┘    └────────────▲─────────────────┘    │
│             │ avatar state             │ pty bytes / fs / git  │
└─────────────┼──────────────────────────┼───────────────────────┘
              │ IPC (contextBridge: window.cth)
       ┌──────┴──────────┐        ┌──────┴─────────────┐
       │  Event Plane    │        │  Terminal Plane    │
       │  hooks / hive   │        │  node-pty PTYs     │
       │  router + GOD   │        │  + fs + git        │
       └────────▲────────┘        └──────▲─────────────┘
                │ hook payloads          │ stdin / stdout
                └─────────┬──────────────┘
                   ┌──────┴──────────────┐
                   │ claude / agy / codex│
                   └─────────────────────┘
```

- **Terminal plane.** The main process owns a `PtyManager` that spawns each agent as a `node-pty`
  process and streams output over per-id IPC (`pty:data:<id>`). The renderer talks only through a
  typed `window.cth` bridge ([`src/preload/index.ts`](../src/preload/index.ts)), which also exposes
  sandboxed filesystem and git helpers.
- **Hive / event plane.** `hive.ts` is the on-disk multi-agent layer; `hooks.ts` runs the hook
  server that provider bridges POST lifecycle payloads to (`cth-hook` for Claude Code, `agy-hook`
  for Antigravity). `memory.ts` wraps the semantic memory CLI. The router delivers messages, drains
  provider outboxes, the GOD agent adjudicates, and idle/inbox wakeups keep workers draining mail.

## Project structure

```
src/
  main/                      Electron main process (Node)
    index.ts                 window, IPC handlers, quit guard
    pty.ts                   node-pty manager (spawn/write/resize/kill/stream)
    hive.ts                  on-disk multi-agent layer (memory, mailboxes, router)
    hooks.ts                 hook server + provider hook shims (`cth-hook`, `agy-hook`)
    memory.ts                semantic memory layer (CLI wrapper, degrade-to-noop)
    config.ts                harness config persistence + home setup
    transcript.ts            reads ~/.claude/projects/ JSONL transcripts for real token/cost telemetry
    telemetry.ts             live OTel collector + usage/cost feed for observability
    usage.ts / pricing.ts    UsageProvider seam + per-model cost attribution
    breaker.ts / control.ts  cost/runaway circuit breaker (steer/constrain/stop) + HITL gate / steer / stop
    reflect.ts               MemoryReflector — memory condensation
    db.ts                    SQLite durable store (window bounds + history) + durable cost ledger
    github.ts                GitHub issue + CI run ingestion via the gh CLI
    shellEnv.ts              resolve PATH and shell env for child processes
    mail.ts                  IMAP/SMTP client for connected mailboxes; the broker calls it for md-mail tool calls
    integrationBroker.ts     loopback secret broker; answers md-mail calls, holds mailbox passwords, enforces Capabilities
    closingTime.ts           Closing Time shutdown protocol (the office reopens on next launch, shared/officeOpen.ts)
                             The quit dialog lists who is still working (hook `detail` from hooks.ts toolDetail),
                             with Remind and Close without them (never pty:kill: that archives the agent)
    fs.ts / git.ts           sandboxed filesystem + git bridges
    packs.ts                 loads and validates the bundled Office Packs (resources/packs/)
    agentFolders.ts          each agent's folder under ~/Documents/<Business> (Michael's), plus the Office folder
    homeFolder.ts            office (harness home) folder checks behind the "can't find your office" screen
    harnessGuard.ts          PreToolUse guard that keeps agents from saving work in the harness folder
    docText.ts / docTextCli.ts / macOcr.ts   Word, Excel, PowerPoint, PDF and scan reading (OCR via macOS Vision)
    claudeCliVersion.ts      installed Claude Code version, for the Opus 5.5 / Opus 5 model floor
    hireCheck.ts             the hire wizard's distinct job check (hidden Claude call, rules as fallback)
    workStyleConvert.ts      turns a plain work style into an agent's instructions and back
    transcriptText.ts        reads a hidden Claude call's answer from its own session transcript
  shared/                    code both processes use
    buildFeatures.ts         switches for surfaces hidden in this build (git, IDE, temp workers, org trigger)
    agentProvider.ts         engine presets; BUILD_ENGINES is what setup offers (Claude Code today)
    officePack.ts / officeRoles.ts / businessProfile.ts / teamPlan.ts   Office Pack schema, show roles, business profile, team plan
    agentDefinition.ts       each agent's levels and outward capabilities
    mailboxes.ts             mailbox and Capabilities types, providers, and mailAccess (the one mail rule)
    officeOpen.ts            the Office open message each agent gets after closing time
    folderAccess.ts          who may open and change which folder: sandbox, permission rules, hook checks
    appName.ts               app name, data folder name, dontbemichael:// URL scheme
    missions.ts              schedules: ownership, next run, the scheduler's arm plan, one-schedule edits,
                             and agent schedule requests: Michael decides them, the owner only those he passes on
    scheduleTimes.ts         a schedule's "when" lines (every N or at a time, per day) and the next due slot
    hireTemplates.ts         the jobs the hire wizard offers, a hire's own folder, the instant distinct job rules
    workStyleText.ts         work style as plain words and as instructions: the prompts and plain fallbacks
    handoffRule.ts           only Michael assigns: the router sends a teammate's request to another teammate to him
    agentProfile.ts          splits an agent's role line into the parts its Profile tab shows
    messageView.ts           the Messages tab as a day-grouped history, office notices counted on one line
    askMeRouting.ts          where an owner's Ask me answer goes: the agent that raised the question
  preload/                   contextBridge → typed window.cth API
  renderer/src/
    App.tsx                  top-level layout + wiring
    design/                  tokens.css / tokens.ts / global.css (design source of truth)
    components/              PixelPanel, AgentDetailPanel, CommandBar, ApprovalsPanel, OnboardingWizard, …
    CommandCenterPanel,      Michael's control surface (Profile/Ask me/Capabilities/Terminal/Office schedule/History/
                             Memory/Advanced tabs; Advanced holds Monitor and Activity). Office schedule is a read-only
                             list of every enabled job; Ask me also shows agents' schedule requests
    CapabilitiesTab,         every agent's Capabilities tab (Michael included): the Email section (on/off switch,
                             one mailbox, Can send / Draft only) and the On a schedule section
    MailboxesSettings,       Settings > Connections > Mailboxes, AddMailboxDialog, and the Claude account email switch
    triggers/ScheduleList,   per-agent schedules: the On a schedule section of Capabilities (agent mode) and
                             Michael's Office schedule tab (office mode); rules live in shared/missions.ts
    triggers/WhenLines,      the several "when" lines one schedule can have
    ScheduleRequestCards,    Ask me cards for schedule requests Michael passed to the owner (Approve / Decline)
    AddAgentModal,           the hire wizard (Who, Job, Role, Finalize); EditAgentModal edits the plain work style
    ProfileTab,              the first tab on every agent: job, folder (Open folder), full instructions
    MemoryNotes,             an agent's Memory tab as grouped notes; "Show the file" keeps the raw text
    OwnerViaMichaelBar,      replaces a team member's message box outside 1:1 (Message Michael / Talk 1:1)
    FloorViewToggle,         the floor's OFFICE / TASKS / GRAPH switch
    OfficeFolderMissing,     launch screen shown only when the office folder is missing
    ToolWaterfall,           per-agent tool-span waterfall for the observability view
    TasksKanban,             dependency-aware kanban board (the floor's TASKS view)
    ThreadsPanel,            hive message conversation viewer (Messages tab)
    MessageQueueComposer,    park messages for a busy agent
    scene/office/            Pixi office floor: OfficeFloor, Character, Camera, cast, pathfinding, …
    store/ · hooks/          zustand store, event loop, PTY parser, typewriter
    assets/                  tilesets, maps, character sheets (see ATTRIBUTION.md)
resources/packs/             bundled Office Packs (core + one per business type)
resources/md-mail-mcp.cjs    md-mail MCP server: an agent's mail tools, forwarded to the broker
docs/                        `model-catalog.json` and `hero.json` (fetched by the app at runtime)
docs/designs/                design docs, including business-mode-office-packs.md (the business mode design and its decisions)
                             (the old project's website files still here are tracked for removal in TODOS.md)
docs/media/                  media the README embeds (see docs/media/README.md)
landing-remotion/            Remotion project that renders the landing page's "how it works" clips
HIVE.md · SPEC.md · DESIGN.md   multi-agent · terminal/event · visual design
docs/message-queue.md        who may type into an agent's terminal, and when
```

<div align="right">(<a href="#architecture-project-structure-and-design-system">↑ back to top</a>)</div>

## Design system

The aesthetic is **Animal Crossing × Earthbound × SNES menu UI** — pixel-snapped, chunky, friendly.
[`DESIGN.md`](../DESIGN.md) is canonical; every component derives from its tokens. The Don't Be Michael
brand layers a **Dunder-Mifflin maroon** (`#6E1423`) and **gold** (`#F4D35E`) on top for logo and
chrome. The 20 avatars are the cast of *The Office*, differentiated by hair/skin/shirt recipes.

