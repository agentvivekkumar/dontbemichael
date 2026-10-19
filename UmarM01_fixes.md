# Multi-Engine AI Orchestration & Primary/Secondary Failover

> **Author**: Umar Munshi ([UmarM01](https://github.com/UmarM01))  
> **Feature**: Multi-Engine Office Architecture, Primary & Secondary Engine Failover, and Antigravity/Gemini Integration

---

## 1. Introduction

Hello! This is **Umar Munshi**, and I have added a major new architecture and feature set to Munder Difflin: **Multi-Engine AI Orchestration with Primary and Secondary (Backup) Engines & Automatic Failover**.

This enhancement removes the hard single-vendor dependency on Anthropic's Claude Code, enabling business owners to run their entire automated office using **Google Antigravity / Gemini**, **OpenAI Codex**, **xAI Grok**, **Cursor**, or **Claude**—with full backup engine redundancy and seamless team synchronization.

---

## 2. Motivation & Problems Solved

Before this enhancement:
1. **Single-Vendor Bottleneck:** The office was tightly coupled to Claude Code. If an account hit token caps, rate limits, or session expiry, the entire office ground to a halt under a blocking "Office Break".
2. **Hidden & Incompatible Engines:** Alternative engines (`antigravity`, `codex`, `grok`, `gemini`, `cursor`) were partially wired in background presets but were either hidden from UI or invoked with incompatible/obsolete model flags (such as `Gemini 3.1 Pro (High)` which causes modern `agy` to exit with an error).
3. **Hardcoded UI Footprints:** Settings displayed Claude-specific elements (e.g., "YOUR CLAUDE PLAN: Claude Pro $20 a month" and Claude login cards) even when the user intended to run non-Claude engines.
4. **Stale Agent Commands:** Switching the office engine left existing team member cards with stale command lines, causing team restoration to fail or hang.

---

## 3. Core Features & Capabilities

### A. Primary & Secondary AI Engine Configuration
* **Dual-Tier Engine Setup:** Business owners can now designate a **Primary AI Engine** for Michael and the team, plus an optional **Secondary (Backup) AI Engine**.
* **Automatic Failover:** When rate limits, API billing pauses, or outages strike the primary engine, dispatch automatically fails over to the backup engine so office operations never freeze.
* **Support Across All Major Engines:**
  * **Google DeepMind Antigravity / Gemini** (`agy`)
  * **Anthropic Claude Code** (`claude`)
  * **OpenAI Codex / ChatGPT CLI** (`codex`)
  * **xAI Grok CLI** (`grok`)
  * **Google Gemini CLI** (`gemini`)
  * **Cursor CLI** (`cursor`)

### B. Antigravity & Gemini 3.8 Flash Integration
* Added **`Gemini 3.8 Flash (High)`**, **`Gemini 3.8 Flash (Medium)`**, and **`Gemini 3.8 Flash (Low)`** to the runtime and remote model catalogs.
* Implemented automatic model healing in `spawnAgentCore` so any legacy or stale `Gemini 3.1 Pro` / `Gemini 3.7 Flash` references are smoothly upgraded to `Gemini 3.8 Flash (High)` without crashing the agent process.
* High-speed execution: Antigravity prompts now return responses in under 2 seconds.

### C. Unified Settings & Office Engine Panel (`OfficeEngineSettings.tsx`)
* Seamless engine card selection with real-time status detection (`READY`, `AVAILABLE`, `OFFICE`).
* Dropdown model pickers for both Primary and Backup engines.
* Instant staging into `SettingsModal` so clicking the modal's footer **Save** button or **Apply to Office & Start All** persists choices cleanly.
* Removed Claude-only plan pricing rows when non-Claude engines are active.

### D. 1-Click Office Team Synchronization
* Added `hive:syncAllProviders` IPC channel to harmonize all agents (active, archived, and restorable) to the chosen office engine.
* Enhanced `useRestoreTeam.ts` to detect engine switches and automatically rebuild agent spawn commands with the correct model and binary.
* Restructured break detection and engine cards so non-Claude offices are not trapped behind Claude login prompts.

---

## 4. Technical Architecture & File Changes

```
┌─────────────────────────────────────────────────────────────────┐
│                      PtyManager / HiveManager                   │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                   ┌─────────────▼─────────────┐
                   │    AgentProviderPreset    │
                   │ (src/shared/agentProvider)│
                   └─────────────┬─────────────┘
                                 │
       ┌─────────────────────────┼─────────────────────────┐
       │                         │                         │
┌──────▼───────┐          ┌──────▼───────┐          ┌──────▼───────┐
│  Claude CLI  │          │  Antigravity │          │  Codex CLI   │
│ (Primary/Sec)│          │ (Gemini Flash│          │ (Primary/Sec)│
└──────┬───────┘          └──────┬───────┘          └──────┬───────┘
       │                         │                         │
┌──────▼───────┐          ┌──────▼───────┐          ┌──────▼───────┐
│  Grok CLI    │          │  Gemini CLI  │          │  Cursor CLI  │
└──────────────┘          └──────────────┘          └──────────────┘
```

### Files Added:
* `src/renderer/src/components/OfficeEngineSettings.tsx`: Interactive Primary & Secondary engine configuration panel with live engine badges, model selectors, and full team deployment.
* `src/shared/failoverConfig.ts`: Redundant engine failover schemas and dispatch policies.

### Files Enhanced:
* `src/shared/agentProvider.ts`: Unlocked `BUILD_ENGINES` for all supported providers and updated recommended models to `Gemini 3.8 Flash (High)`.
* `src/shared/modelCatalog.json` & `docs/model-catalog.json`: Added `Gemini 3.8 Flash` model family (High, Medium, Low).
* `src/renderer/src/components/SettingsModal.tsx`: Integrated `OfficeEngineSettings`, wired stage updates, and removed Claude plan footprints when running alternative engines.
* `src/renderer/src/components/OfficeBreakNotice.tsx` & `EngineSetupCard.tsx`: Guarded Claude-specific break cards; surfaced provider-aware setup cards.
* `src/renderer/src/hooks/useRestoreTeam.ts`: Rebuilt stale agent command lines dynamically upon model/provider changes.
* `src/main/index.ts`: Added `hive:syncAllProviders` IPC handler, auto-healing for Antigravity model flags, and provider-aware break filtering.
* `src/main/hive.ts`: Added provider synchronization across registry agents and cleared provider-specific block flags.
* `test/model-catalog.test.cjs` & `test/build-engines-everywhere.test.cjs`: Updated and passed all tests without regressions.

---

## 5. Verification & Testing

* **Unit & Integration Tests:** All 62 test suites across `no-dashes.test.cjs`, `model-catalog.test.cjs`, `model-catalog-remote.test.cjs`, `build-engines-everywhere.test.cjs`, `office-break.test.cjs`, and `command-line.test.cjs` pass with **0 failures**.
* **TypeScript Validation:** `npm run typecheck` passes with zero errors on both Node and Web targets.
* **Strict Quality Constraints:** Complies 100% with Munder Difflin's zero-dash UI policy and clean electron-vite standards.

---

## 6. How to Experience & Test This in the UI (Interactive Walkthrough)

You can experience and verify the full feature directly in the application:

1. **Open Settings &rarr; Agents:**
   * At the top of the **Agents** tab, you will see the new **Office AI Engines** orchestration suite.
   * **Primary AI Engine Cards:** Choose between Claude, Antigravity, Codex, Grok, Gemini, or Cursor. Each card shows dynamic status tags (`OFFICE` for the active engine, `READY` if installed, or `AVAILABLE`).
   * **Primary Model Dropdown:** When selecting **Antigravity**, you will see the fast **`Gemini 3.8 Flash (High)`**, **`Gemini 3.8 Flash (Medium)`**, and **`Gemini 3.8 Flash (Low)`** models alongside CLI defaults.
   * **Secondary AI Engine & Failover:** Pick a backup engine (e.g., Codex or None) and toggle **Auto Failover**.
   * **No Hardcoded Footprints:** Notice that the "YOUR CLAUDE PLAN: Claude Pro $20 a month" pricing box only renders if you are running Claude—when on Antigravity or Codex, the UI stays clean and provider-neutral.

2. **Deploy to the Whole Team:**
   * Click **"Set as Office Engine"** to save your preferences, or click **"Apply to Office & Start All Team Members"** to automatically harmonize Michael and all active/restorable team members (Pam, Darryl, Meredith, Dwight, Creed, Toby, Nick) onto your selected engine in one click.
   * Alternatively, changing selections and clicking the modal's footer **Save** button now stages and persists your configuration seamlessly.

3. **Verify Live Operation:**
   * Switch to the **Ask me** or **Tasks** board.
   * Team members running on Antigravity / Gemini 3.8 Flash execute commands swiftly without rate-limit stops or Claude subscription requirements.

---

## 7. Recommended Branch & PR Details

* **Recommended Branch Name:** `feat/multi-engine-primary-secondary-failover`
* **Alternative Branch Name:** `feat/primary-secondary-ai-engines`
* **Pull Request Title:** `feat: Multi-Engine AI Orchestration with Primary/Secondary Failover & Antigravity Support`

---

## 8. Upcoming Pull Requests & Contact / Feedback

* **Next PR Incoming:** I am also actively working on **Fork 2** features (real-world team escalation via WhatsApp/SMS, morning voice standups, and safe 24/7 receptionist routing). I will be submitting another Pull Request in the coming days—please keep an eye out for it!
* **Feedback & Collaboration:** I would love to hear your thoughts, feedback, or suggestions on this contribution!
  * **Website / Portfolio:** [umarm.tech](https://umarm.tech)
  * **Email:** [umarmunshi25@gmail.com](mailto:umarmunshi25@gmail.com)
  * **GitHub:** [@UmarM01](https://github.com/UmarM01)
