<div align="center">

<img src="./docs/logo.png" alt="Dont Be Michael" width="180">

# Dont Be Michael

### Run an office of AI agents on your own machine

**[dontbemichael.com](https://dontbemichael.com)**

<img src="./docs/media/floor.png" alt="The office floor: agents at desks working in parallel, with the Command Center and a live agent terminal on the right" width="1240">

**Local-first multi-agent harness** that works with the coding-agent subscriptions you already
pay for, on their hourly limits. It turns the terminal CLI you already run into a clone of you.
Your clone keeps working while you're away and coordinates a whole office of agents on your
machine.

Wraps [Claude Code](https://claude.com/claude-code), Antigravity (Gemini), OpenAI Codex,
**xAI Grok**, **Kimi Code**, **Gemini CLI**, **Qwen**, **OpenCode**, **Crush**,
**pi.dev**, **GitHub Copilot CLI**, and **Cursor**. You can also bring your own keys and local
LLMs. Agents message each other, route work, and remember what they learn. **Your clone**
(Michael) coordinates them, and each agent shows up as an avatar on a shared office floor.

<p>
  <em>Electron · React · TypeScript · Pixi.js · xterm.js · node-pty</em>
</p>

<p>
  <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-F4D35E.svg?style=flat-square&labelColor=6E1423"></a>
  <img alt="Status: pre-release" src="https://img.shields.io/badge/status-pre--release-F4F1EA.svg?style=flat-square&labelColor=6E1423">
  <img alt="Platform: macOS | Windows | Linux" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-F4F1EA.svg?style=flat-square&labelColor=6E1423">
  <a href="https://dontbemichael.com"><img alt="Website: dontbemichael.com" src="https://img.shields.io/badge/web-dontbemichael.com-F4D35E.svg?style=flat-square&labelColor=6E1423"></a>
  <a href="./CONTRIBUTING.md"><img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-F4D35E.svg?style=flat-square&labelColor=6E1423"></a>
</p>

<br>

<!-- Inline player renders on github.com (raw URL required; relative paths only link). -->
<video src="https://github.com/agentvivekkumar/dontbemichael/raw/main/docs/media/hero.mp4" controls muted loop playsinline width="820">
  <a href="https://github.com/agentvivekkumar/dontbemichael/raw/main/docs/media/hero.mp4">▶ Watch the floor: a hive of Claude Code agents at work</a>
</video>

<br><br>

**[Get Dont Be Michael at dontbemichael.com](https://dontbemichael.com)**

</div>

---

> [!NOTE]
> **Brief one agent. Let the office do the rest.**
> Dont Be Michael takes the terminal-agent CLIs you already run (`claude`, `agy`, `codex`, `grok`,
> `kimi`, `qwen`, `opencode`, `crush`, `pi`, and `copilot`) and turns them into a
> self-coordinating team. Each agent gets long-term memory, a mailbox, and a desk on a 2D office
> floor. **Your clone** (Michael) routes work between them while you watch. He runs the floor,
> and you still run him.

## Contents

- [Supported agents](#supported-agents)
- [What it is](#what-it-is)
- [How it works](#how-it-works)
- [Features](#features)
- [Getting started](#getting-started)
- [Architecture](#architecture)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Telemetry](#telemetry)
- [License](#license)
- [Acknowledgements](#acknowledgements)

## Supported agents

**Bring the CLI you already pay for.** Each one runs as a real process in its own terminal, using
your existing subscription and its hourly limits. If it runs in a terminal, it can run here.

<p>
  <a href="https://docs.claude.com/en/docs/claude-code"><kbd>Claude Code</kbd></a>
  <a href="https://github.com/openai/codex"><kbd>Codex · GPT</kbd></a>
  <a href="https://x.ai/cli"><kbd>Grok · xAI</kbd></a>
  <a href="https://www.kimi.com/code"><kbd>Kimi Code</kbd></a>
  <a href="https://github.com/google-gemini/gemini-cli"><kbd>Gemini CLI</kbd></a>
  <a href="https://antigravity.google/docs/cli-overview"><kbd>Antigravity · Gemini</kbd></a>
  <a href="https://github.com/QwenLM/qwen-code"><kbd>Qwen</kbd></a>
  <a href="https://opencode.ai/docs"><kbd>OpenCode</kbd></a>
  <a href="https://github.com/charmbracelet/crush"><kbd>Crush · Charm</kbd></a>
  <a href="https://pi.dev/docs/latest"><kbd>Pi</kbd></a>
  <a href="https://docs.github.com/copilot/concepts/agents/about-copilot-cli"><kbd>GitHub Copilot</kbd></a>
  <a href="https://cursor.com/docs/cli/install"><kbd>Cursor</kbd></a>
  <kbd>+ any custom command</kbd>
</p>

You can also **bring your own keys** or run **local models** through Ollama, LM Studio, or vLLM.

## What it is

Dont Be Michael is a desktop app that wraps **real terminal-agent CLIs** as fully capable agents.
It connects them through a shared **hive** and puts **your clone** in charge. That clone is
Michael, the one agent *you* talk to in order to get things done. A fast memory layer lets every
agent remember what it learns and recall it almost instantly.

- **Every terminal is an agent.** Each `claude`, `agy`, `codex`, `grok`, `kimi`, `qwen`, `opencode`,
  `crush`, `pi`, `copilot`, or custom session runs as a real process in a pseudo-terminal
  (`node-pty`). Its output is rendered byte for byte with xterm.js.
- **Every agent is an avatar.** Sessions appear as characters on a Pixi.js office floor. They walk
  to stations as they work, and envelopes fly between desks when they message each other.
- **The hive coordinates them.** Agents read their memory and work through a mailbox. The router
  moves messages between inboxes. The GOD agent makes decisions, assigns work, and escalates to
  you only when it needs to.
- **Fast memory.** Memory is stored as markdown with a semantic recall index, so agents remember
  across sessions and recall in milliseconds.

## How it works

```
            you ── talk to ──►  ┌─────────────┐
                                │  GOD agent  │  orchestrator / supervisor
                                │ (Michael's  │  roster · routing · adjudication
                                │   office)   │  blackboard · task ledger
                                └──────┬──────┘
                                       │ assigns · routes · escalates
              ┌────────────────────────┼────────────────────────┐
              ▼                         ▼                         ▼
        ┌───────────┐            ┌───────────┐            ┌───────────┐
        │  agent A  │  message   │  agent B  │  message   │  agent C  │
        │ provider  │ ─────────► │ provider  │ ─────────► │ provider  │
        │  + memory │            │  + memory │            │  + memory │
        └───────────┘            └───────────┘            └───────────┘
              └──────── shared hive: memory · mailbox · blackboard · log ───────┘
```

1. **You spawn agents.** Each one is a normal terminal process (`claude`, `agy`, `codex`, or a
   custom command) with its own working directory, identity, and provider-specific lifecycle.
2. **Agents collaborate through the hive.** The hive is a local git repo of plain files. Agents
   write to their own `outbox/`, and the harness's router delivers messages into each recipient's
   `inbox/`. Agents never run git themselves. Only the harness commits, which prevents
   `index.lock` corruption.
3. **The GOD agent runs the floor.** It reads every request and handles routine ones itself, so
   the office keeps running on its own. Only *critical* items (spend, destructive operations,
   scope changes) go to an approvals queue for you.
4. **Everything is visible.** You can watch avatars move, envelopes fly, and terminal output
   stream live. You can type into any session, browse its files, and read its git history.

See [`HIVE.md`](./HIVE.md) for the full multi-agent design, [`SPEC.md`](./SPEC.md) for the
terminal and event plane, and [`DESIGN.md`](./DESIGN.md) for the visual system.

## Features

<table>
<tr>
<td width="50%" valign="middle">

### Talk to one agent, not twelve

Michael is your clone and the only agent you brief. He assigns the work, routes messages between
agents, and escalates the few things that actually need you.

</td>
<td width="50%">
  <a href="https://github.com/agentvivekkumar/dontbemichael/raw/main/docs/media/demo/orchestrator.mp4"><img src="./docs/media/demo/orchestrator-poster.jpg" alt="Briefing Michael, the orchestrator agent, from the Command Center" width="100%"></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Hire an agent in a few clicks

Pick the CLI, the model, and the autonomy level, then give the agent a desk and it starts working.
You can also import a ready-made role instead of starting from scratch.

</td>
<td width="50%">
  <img src="./docs/screenshots/add-agent.png" alt="The add agent dialog: choosing a provider, model and role" width="100%">
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Memory that survives the session

Every agent keeps markdown memory, which is indexed into a shared, searchable memory palace. Close
the app, come back tomorrow, and your agents still know what they learned.

</td>
<td width="50%">
  <img src="./docs/screenshots/memory.png" alt="Searching the shared memory palace across every agent" width="100%">
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Autonomy with a leash

Set how far each agent may go on its own. Decisions about spend, scope, and destructive operations
come back to you. A circuit breaker steers, then constrains, then stops any agent that loops or
runs away.

</td>
<td width="50%">
  <img src="./docs/screenshots/autonomy.png" alt="Per agent autonomy and approval settings" width="100%">
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Watch the whole floor work

Agents walk to stations as they work, and envelopes fly between desks when they message each
other. Click any desk to watch that terminal live and type into it.

</td>
<td width="50%">
  <a href="https://github.com/agentvivekkumar/dontbemichael/raw/main/docs/media/demo/agents.mp4"><img src="./docs/media/demo/agents-poster.jpg" alt="Agents working in parallel on the office floor" width="100%"></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Set up once

The onboarding wizard checks what you already have installed and offers to install anything
missing, so you don't have to follow a docs page.

</td>
<td width="50%">
  <a href="https://github.com/agentvivekkumar/dontbemichael/raw/main/docs/media/demo/setup.mp4"><img src="./docs/media/demo/setup-poster.jpg" alt="The first run setup wizard" width="100%"></a>
</td>
</tr>
</table>

**The floor**
- **Every terminal is a real agent.** Claude Code, Antigravity (Gemini), OpenAI Codex, xAI Grok, Kimi Code, Gemini CLI, Qwen, OpenCode, Crush, pi.dev, GitHub Copilot CLI, Cursor, or a custom command. Each runs in its own `node-pty` PTY, rendered with xterm.js.
- **Every agent is an avatar.** On a Pixi.js office floor, agents walk to stations, envelopes fly between desks, and each avatar's state reflects its real work.
- **A GOD orchestrator you talk to.** It routes tasks, decides between competing requests, and escalates only what needs a human. You can also press **Talk** and run the floor by voice.
- **Per-agent git worktrees.** Optional isolation, so parallel agents never collide on branches.

**Memory & coordination**
- **The hive:** per-agent memory, atomic-file mailboxes, a shared blackboard, an append-only event log, and a single git committer.
- **Semantic recall:** markdown memory indexed into a shared palace that you can search from the UI. Condensation keeps it from growing forever.
- **Enterprise Knowledge Graph:** your own documents and policies, which any agent can query.

**Control & safety**
- **Human gates:** spend, scope, and destructive operations escalate to you. You can steer an agent mid-run or stop it gracefully.
- **Circuit breaker:** a steer → constrain → stop ladder for agents that loop, hit repeated errors, or exceed their budget.
- **Budgets & telemetry:** per-agent token budgets, real cost read from transcripts, a durable ledger, OTel spans, and a tool waterfall.

**Command Center**
- Kanban tasks with dependencies, scheduled missions with a heartbeat, live fleet monitoring, memory search, an activity log, and a CI watcher.
- **Skills:** see what every agent can already do across Claude Code, OpenCode, and Codex, and browse a catalog of 227 more skills with search, filters, and one-click install and uninstall.
- **Built-in Monaco IDE:** file tree, editor tabs, and save, plus CHANGES · HISTORY · COMPARE git panels with a commit graph, diffs, branch compare, and guarded checkout. All filesystem and git access goes through the main process.

**Getting work in and out**
- **Slack & webhooks:** message a channel or POST to a webhook. Michael can spawn a temporary worker, reply in the thread, and shut the worker down afterwards.
- **Shareable hires:** import a role from a hire link. Importing only pre-fills the form, and a human still spawns the agent.
- **BYOK keys + local LLMs:** per-provider keys kept in a write-only secret broker, plus base URLs for Ollama, LM Studio, and vLLM.
- **One-click updates:** the title-bar badge downloads the build for your machine, then restarts and installs it.
- **Your language:** English, Simplified Chinese, and Arabic, with right-to-left layout for Arabic. English is the default, and you pick another language in Settings. All app fonts ship inside the bundle, so nothing is fetched at startup.
- **Prerequisites:** a Settings page showing which supporting tools you have (uv, git, Node, MemPalace, and each agent CLI) and what each one is for. A button asks Michael to install anything missing.

<div align="right">(<a href="#dont-be-michael">↑ back to top</a>)</div>

## Getting started

### Download the app

Downloads and release notes are at **[dontbemichael.com](https://dontbemichael.com)**. Builds are
also published on the
[releases page](https://github.com/agentvivekkumar/dontbemichael/releases). Install the app, open
it, and the setup wizard walks you through the rest. You don't need Node, a toolchain, or this
repository.

You do need at least one agent CLI on your machine. The app can install missing CLIs for you from
**Settings → Prerequisites**.

### Build from source

The rest of this section is for contributors and anyone who wants to run an unreleased build.

#### Prerequisites

- **macOS, Windows, or Linux**.
- **Node.js 18+** and npm.
- A **C/C++ toolchain** for `node-pty`'s native addon. On macOS, install the Xcode Command Line Tools:
  ```bash
  xcode-select --install
  ```
- At least one supported agent CLI on your `PATH`: **[Claude Code](https://claude.com/claude-code)**
  (`claude`, the default), **Antigravity** (`agy`), **OpenAI Codex** (`codex`), **xAI Grok** (`grok`),
  **Kimi Code** (`kimi`), **Gemini CLI** (`gemini`), **Qwen** (`qwen`), **OpenCode** (`opencode`),
  **Crush** (`crush`), **pi.dev** (`pi`), **GitHub Copilot** (`copilot`), or **Cursor** (`cursor-agent`).
  If a CLI is missing, the harness can usually install it in the terminal and then start it.
- *Optional:* **your own API keys and local LLMs** in **Settings → AI Engines** (Ollama / LM Studio / vLLM).
- *Optional:* the semantic memory index for fast cross-session recall. Markdown memory works without it.

#### Install & run

```bash
git clone https://github.com/agentvivekkumar/dontbemichael.git
cd dontbemichael
npm install        # postinstall rebuilds node-pty against Electron's ABI
npm run dev        # launches the Electron app with hot reload
```

On first launch you'll go through the onboarding wizard, then land on the office floor. Use
**Add agent** to spawn your first session. The GOD agent takes its seat in Michael's office
automatically.

#### Other scripts

```bash
npm run build      # production build via electron-vite
npm run preview    # preview the production build
npm run typecheck  # type-check the node (main/preload) and web (renderer) projects
```

> If `node-pty` fails to load after an Electron upgrade, re-run `npm install`. The `postinstall`
> hook runs `electron-rebuild` against the current Electron ABI.

## Architecture

Two data planes feed one renderer. The **terminal plane** owns the PTYs, the filesystem, and git.
The **event plane** runs the hive, the hook server, and the router. The renderer reaches both only
through a typed bridge.

Full diagrams, the module-by-module project structure, and the design system are in
[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md). See also [`HIVE.md`](./HIVE.md) for the
multi-agent design, [`SPEC.md`](./SPEC.md) for the terminal and event plane, and
[`DESIGN.md`](./DESIGN.md) for the visual system.

<div align="right">(<a href="#dont-be-michael">↑ back to top</a>)</div>

## Roadmap

Already shipped: twelve agent engines with BYOK keys and local LLMs, voice orchestration, and the
hive (memory · mailboxes · blackboard · event log). The Command Center includes kanban and weekday
schedules, and there's a built-in Monaco IDE with git panels. Also shipped: an integrations
registry with a secret broker, Slack-spawned workers, shareable hires, observability and the
circuit breaker, durable persistence, session resume, multi-window floors, one-click updates, a
Skills browser, a live Prerequisites check, cost reporting from the ledger, and a Simplified
Chinese and Arabic interface. Full history is in [`CHANGELOG.md`](./CHANGELOG.md).

Next up:

- [ ] **More chat integrations:** Telegram and richer chat bridges that send a channel's messages into Michael's queue and route replies back out.
- [ ] **More engines & integration templates:** keep growing the engine roster and the integrations registry.
- [ ] **Fuller avatar coverage:** drive the remaining station visits and tool bubbles entirely from real hook events.
- [ ] **Durable layout & command history:** extend persistence to agent layout and per-session history.

<div align="right">(<a href="#dont-be-michael">↑ back to top</a>)</div>

## Contributing

Contributions are welcome. This is pre-release software with a lot of surface area, so start with
[`CONTRIBUTING.md`](./CONTRIBUTING.md). The short version: fork the repo, run
`npm install && npm run dev`, keep `npm run typecheck` passing, and **base any new UI on the
[`DESIGN.md`](./DESIGN.md) tokens**.

> [!IMPORTANT]
> **Every pull request must include a before and an after.** Use screenshots, or a recording if
> the change involves motion, under the `### Before` and `### After` headings in the PR template.
> A check enforces this, and a PR without them cannot merge. Changes with no UI still need
> evidence, just in a different form. See
> [Evidence is mandatory](./CONTRIBUTING.md#evidence-is-mandatory).

Found a bug or have an idea? [Open an issue](https://github.com/agentvivekkumar/dontbemichael/issues).

[`CONTRIBUTORS.md`](./CONTRIBUTORS.md) lists everyone whose code is in this project, including the
upstream Munder Difflin contributors whose work it builds on.

## Telemetry

Official release builds send a **small set of anonymous usage events** (app opened, agent spawned,
feature used). They never send prompts, code, file paths, or agent output.
[`TELEMETRY.md`](./TELEMETRY.md) documents the complete event list, the anonymity guarantees, and
three ways to opt out: the Settings toggle, `DO_NOT_TRACK`, or building from source. Local builds
compile without an analytics key and send nothing.

## License

The **source code** is licensed under the **MIT License**. See [`LICENSE`](./LICENSE). Dont Be
Michael is based on [Munder Difflin](https://github.com/chaitanyagiri/munder-difflin), which is
also MIT-licensed. The original copyright notice is kept in `LICENSE`, as that license requires.

> [!IMPORTANT]
> **Asset licensing.** The bundled pixel art (tilesets and maps) is **Modern Interiors - RPG Tileset
> [16X16]** by [LimeZu](https://limezu.itch.io/moderninteriors), used under the **Complete Version
> licence**, which permits editing and use in commercial and non-commercial projects. **That licence
> requires credit to LimeZu**, and the credit must stay in place. The office cast is not LimeZu art.
> It is drawn procedurally in `portraitArt.ts`. See
> [`src/renderer/src/assets/ATTRIBUTION.md`](./src/renderer/src/assets/ATTRIBUTION.md).

The MIT license covers only the code. The bundled pixel art is licensed separately by LimeZu and is
excluded in [`LICENSE-ASSETS`](./LICENSE-ASSETS). *Dont Be Michael* is not affiliated with NBC,
*The Office*, or Dunder Mifflin.

## Acknowledgements

- [Munder Difflin](https://github.com/chaitanyagiri/munder-difflin) by Chaitanya Giri and its contributors, the open-source project this product is forked from.
- [LimeZu](https://limezu.itch.io/) for the *Modern Interiors* pixel-art tilesets (Complete Version licence).
- [`shahar061/the-office`](https://github.com/shahar061/the-office) for the office tileset and map vendoring.
- [Pixi.js](https://pixijs.com/) · [xterm.js](https://xtermjs.org/) · [node-pty](https://github.com/microsoft/node-pty) · [electron-vite](https://electron-vite.org/) · [CodeMirror](https://codemirror.net/) for the libraries this is built on.
- [Remotion](https://www.remotion.dev/) for the landing page's animated "how it works" clips (`landing-remotion/`).
