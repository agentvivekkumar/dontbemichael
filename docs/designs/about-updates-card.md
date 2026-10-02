# Settings, General: one About and Updates card

Status: design reviewed 2026-10-01 (`/plan-design-review`), built the same day.
Screen: Settings > General, top. Replaces `SettingsHeroCard` + `UpdatesSection` as two blocks.

## Problem

Two blocks said the same things (owner, 2026-10-01): the version twice ("v0.0.14" and "You're on
v0.0.14"), three ways into release notes (what's new, the bullets under Updates, full changelog),
two manual download buttons when a release is out, and a v1 2 px ink frame beside v2 rows.

## Decisions (owner, 2026-10-01)

| # | Issue | Decision |
|---|-------|----------|
| 1 | Layout | **One v2 card** (`card`, 1 px `line`, `r-xl`): name, version once, the Local pill, then the update status and its one button on the same row. Release notes bullets only when the status carries them. A quiet footer: What's new, Changelog, Star on GitHub, Report a problem. |
| 2 | "Every agent runs on your machine..." | **Behind an info icon** beside the Local pill (still from `docs/hero.json`). |

## Layout

```
┌───────────────────────────────────────────────────────────────────┐
│ Don't Be Michael  v0.0.14  [LOCAL] (i)        [Check for updates] │
│ Updates are checked automatically every 6 hours.                  │
│                                                                   │
│ (a release is out)                                                │
│ Don't Be Michael  v0.0.14  [LOCAL] (i)   [download manually] [Download v0.0.15] │
│ v0.0.15 is available  You're on v0.0.14.                          │
│ • A new look, Studio...                                           │
│───────────────────────────────────────────────────────────────────│
│ What's new   Changelog   Star on GitHub   Report a problem        │
└───────────────────────────────────────────────────────────────────┘
```

- Status line: idle, checking and up to date show only the detail ("Updates are checked
  automatically every 6 hours...", "You're already up to date..."), since the version is already in
  the top row. Every other state shows its headline (600) and detail.
- The version comes from the build (`__APP_VERSION__`), so the row never renders without it.
- Notice and sponsor slots from `hero.json` stay, restyled to v2 (`r-lg`, soft fill, no ink frame).
- The manual install steps panel stays, restyled the same way.

## States

Unchanged from `UpdatesSection`: idle, checking, available, downloading, downloaded,
available-manual, error, not-available; the busy button disables; manual download stays beside
the main button whenever a newer version is known.

## NOT in scope

- Changing update behavior, the 6 hour check, or the toolbar update chip.
- The release drop / toast that What's new opens (`UpdateToast.tsx`).

## What already exists

`describeUpdateSettings`, `reduceStatus`, `pendingVersion`, `manualDownloadUrl`,
`manualInstallSteps` (`src/shared/updateState.ts`); `summarizeReleaseNotes`; `InfoTip`;
`PixelButton`; the `cth:show-release-notes` event.

## What's new (owner, 2026-10-02)

- **One link.** The footer's Changelog link is gone; What's new shows the notes of the version you
  are on, with Full changelog and Release page inside. Notes come from the updater after an update,
  else the GitHub release for this version (`update:releaseNotes`). Loading and failure both say so.
- **Popover under the link** (owner chose it over a centered dialog): it opened in the bottom right
  corner, easy to miss. Esc, a click outside or Close shut it; Esc never closes Settings.
- **Ink fill, light text**, like the info tooltips (DESIGN.md 7.23): white on white was hard to read.

## Implementation Tasks

- [x] **T1 (P1, human: ~3h / CC: ~20min)**: SettingsHeroCard: one v2 card with the update status, button, notes and footer links
  - Files: `src/renderer/src/components/SettingsHeroCard.tsx`, `src/renderer/src/components/UpdatesSection.tsx` (now a hook), `src/renderer/src/components/SettingsModal.tsx`
- [x] **T2 (P2, human: ~15min / CC: ~5min)**: footer labels in sentence case; Local blurb into an info icon
  - Files: `src/renderer/src/i18n/locales/{en,zh-CN,ar}.json`

## Completion Summary

```
  +====================================================================+
  |         DESIGN PLAN REVIEW — COMPLETION SUMMARY                    |
  +====================================================================+
  | System Audit         | branding/DESIGN.md v2; UI scope: one card    |
  | Step 0               | 4/10; focus: redundancy and v1 styling       |
  | Pass 1  (Info Arch)  | 4/10 → 9/10                                  |
  | Pass 2  (States)     | 8/10 → 9/10                                  |
  | Pass 3  (Journey)    | 7/10 → 9/10                                  |
  | Pass 4  (AI Slop)    | 6/10 → 9/10 (emoji button, chunky frame gone)|
  | Pass 5  (Design Sys) | 4/10 → 9/10                                  |
  | Pass 6  (Responsive) | 8/10 → 8/10                                  |
  | Pass 7  (Decisions)  | 2 resolved, 0 deferred                       |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (2 items)                            |
  | What already exists  | written                                      |
  | TODOS.md updates     | 0 items proposed                             |
  | Approved Mockups     | 0 generated (designer key returned 401)      |
  | Decisions made       | 2 added to plan                              |
  | Decisions deferred   | 0                                            |
  | Overall design score | 4/10 → 8/10                                  |
  +====================================================================+
```

## Unresolved Decisions

None.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | ISSUES OPEN (2026-09-26, multi-mailbox) | mode: SELECTIVE_EXPANSION, 1 critical gap |
| Outside Review | `/plan-design-review` outside voices | Independent 2nd opinion | 4 | skipped (owner, 2026-10-01) | none run this review |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 2 | ISSUES OPEN (2026-09-26, multi-mailbox) | 34 issues, 1 critical gap |
| Design Review | `/plan-design-review` | UI/UX gaps | 4 | CLEAR | score: 4/10 → 8/10, 2 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | none | none |

- **OUTSIDE COVERAGE:** design phase, outside voices skipped by the owner (D3); no Codex use per the owner's standing rule. Image mockups unavailable: the gstack designer's OpenAI key returned 401.
- **VERDICT:** Design Review CLEAR for this card. Eng review not cleared (its open record is for multi-mailbox); not required for a renderer-only change by owner choice.

NO UNRESOLVED DECISIONS
