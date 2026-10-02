# Mailboxes at scale: a folding section

Status: design reviewed 2026-10-01 (`/plan-design-review`), built for 0.0.15. Decision 3 and T2
are superseded (2026-10-02, `docs/designs/claude-connectors.md`): the Your Claude account line is
gone from Mailboxes, and Gmail on the Claude account is a row under Claude connectors.
Screen: Settings > Connections > Mailboxes (`src/renderer/src/components/MailboxesSettings.tsx`).
Builds on: `docs/designs/multi-mailbox.md` (D-T1, 2A rows, 8A remove confirmation). Calibrated against `branding/DESIGN.md`.

## Problem

The owner's concern (2026-10-01): with many mailboxes this section takes a lot of space and
the owner has to scroll far. Today every mailbox is always listed, about 57 px per row, with
no cap, and the Your Claude account switch sits after the last row. At 15 mailboxes that is
about 850 px before the switch and before QuickBooks and the rest of Connections.

## Decisions (owner, 2026-10-01)

| # | Issue | Decision |
|---|-------|----------|
| 1 | Row density | **1C: keep rows as they are.** Two lines, connected or needs you badge, Edit or Fix, Remove. Not changed by this plan. |
| 2 | Long list | **The whole section shows and hides** (owner's own answer). Mailboxes becomes a fold: a header line that opens and closes the list. It starts closed, like every section on the agent tabs (owner, 2026-09-26). |
| 3 | Your Claude account switch | **Revised (owner, 2026-10-01): the Claude account is a mailbox too, so it is the first line inside the fold**, above the mailboxes added here (it was 3A, always visible under the header). Its explanation moves behind an info icon on that line; the "Gmail and Google Calendar, connected in Claude" sub line is dropped because the explanation already says it. |
| 4 | When the fold opens by itself | **4A: open whenever any mailbox needs you.** Closed otherwise. Covers the stage's Fix pill, which opens Settings at Connections. |
| 5 | Order | **5A: mailboxes that need you first, then A to Z by address.** |
| 6 | No mailboxes yet | **6A: closed, summary reads "none yet"**; Add a mailbox stays in the header; the empty guidance sentence moves into the header's info icon. |
| 7 | Intro paragraph | **7A: moves into the header's info icon**, so the closed section is one line tall. |

## Layout

```
Closed (default; no mailbox needs you)
  ▸ Mailboxes  14 mailboxes (i)                         [Add a mailbox]

Closed, nothing added yet
  ▸ Mailboxes  none yet (i)                             [Add a mailbox]

Open (automatically when one needs you; the Claude account first, then the rows unchanged,
needs you first, then A to Z)
  ▾ Mailboxes  14 mailboxes  [● 1 needs you] (i)        [Add a mailbox]
    Your Claude account (i)                              blocked [ o ]
    billing@harborpine.com                  [● needs you]   Fix   Remove
    Google Workspace · used by Nick
    ! Password stopped working
    it@harborpine.com                       [■ connected]  Edit   Remove
    Google Workspace · used by Nick
    ...
```

What the owner sees first, second, third: (1) the Mailboxes header with its count and,
when something is broken, the coral "N needs you"; (2) once opened, the Claude account and
whether team email through it is allowed or blocked; (3) the mailbox rows.

- **Header line.** One button holds the `Disclosure` caret (`components/triggers/ui.tsx:202`), the
  title "Mailboxes" and the summary ("14 mailboxes", "1 mailbox", "none yet"). The existing coral
  "N needs you" badge (`MailboxesSettings.tsx:73`) stays beside it. The info icon (`InfoTip`) and
  Add a mailbox sit beside the button, not inside it, so they are separate targets.
- **Header info icon** holds the old intro (`mailboxes.intro`) and, with no mailboxes, the empty
  guidance (`mailboxes.empty`). No paragraph is shown under the title.
- **Claude account line.** The first line inside the fold: "Your Claude account", an info icon
  holding `mailboxes.claudeAccessDesc` (now "the mailboxes below"), then the existing `Toggle`
  with its allowed / blocked label. The header count counts only the mailboxes added here.
- **Rows.** Unchanged from today (decision 1C), including the 8A remove confirmation.
- **Order.** `needs-attention` first, then by address A to Z (locale compare).

## Interaction states

```
  FEATURE              | LOADING        | EMPTY                | ERROR                         | SUCCESS               | PARTIAL
  ---------------------|----------------|----------------------|-------------------------------|-----------------------|-----------------------------
  Mailboxes fold       | section hidden | closed, "none yet",  | n/a                           | closed, "N mailboxes" | one or more need you: opens
                       | until config   | Add in header        |                               |                       | by itself, coral count shown
                       | loads (today)  |                      |                               |                       | in header, broken rows first
  Claude account line  | hidden with    | first line when open | "! Couldn't save" shows       | allowed / blocked     | n/a
                       | the section    |                      | outside the fold, by the line | label beside switch   |
  Remove (8A)          | n/a            | n/a                  | "! Couldn't save" outside the | row gone, focus to    | n/a
                       |                |                      | fold; focus back to Remove    | Add a mailbox         |
```

- The open / closed state is not remembered: each visit starts closed unless a mailbox needs you.
- The auto open is decided when the section mounts. A mailbox that breaks while Settings is
  already open does not force the fold open; the coral count in the header updates.
- Removing the last broken mailbox does not close an open fold.

## Journey

```
  STEP | USER DOES                              | USER FEELS              | PLAN SPECIFIES?
  -----|----------------------------------------|-------------------------|---------------------------------------------
  1    | Opens Settings > Connections on a calm | oriented, not buried    | yes: one closed line plus the Claude switch
       | day                                    |                         |
  2    | Checks whether team Gmail is allowed   | certain                 | yes: first line once the fold is open
  3    | Adds a mailbox                         | quick                   | yes: Add in the header, works while closed
  4    | Sees a coral Fix pill on the stage and | a little anxious        | yes: section opens itself (4A), broken row
       | clicks it                              |                         | first (5A), Fix right there
  5    | Looks for support@ in 15 mailboxes     | in control              | yes: opens the fold, A to Z order
```

5 seconds: one calm line, a coral count only if something is wrong. 5 minutes: add, fix,
assign without scrolling past a wall of rows. Long term: the section stays one line however
many mailboxes the office grows to.

## Accessibility and responsive layout

- The fold button has `aria-expanded` and `aria-controls` pointing at the list, like
  `TriggerCard` (`components/triggers/ui.tsx:214`). Enter and Space toggle it.
- Add a mailbox, both info icons and the switch are separate tab stops after the fold button.
  The existing refocus targets (`data-focus="add"`, `fix-*`, `remove-*`) keep working; Add is
  outside the fold so it is always focusable.
- The coral count keeps its words ("1 needs you"), never colour alone (DESIGN.md §2.3).
- Narrow Settings widths: the summary wraps under the title; Add a mailbox stays on the right.

## NOT in scope

- Compact one line rows, hiding the green connected badge, moving Remove into Edit: declined (1C).
- Show the first 5 with a "Show all" link, an inner scroll box, a search field: replaced by the fold.
- Scrolling to a specific mailbox when arriving from its Fix pill (4B): not chosen.
- Remembering open / closed between visits: each visit starts closed by the 2026-09-26 precedent.

## What already exists

- `Disclosure` caret and the `TriggerCard` fold pattern: `src/renderer/src/components/triggers/ui.tsx:202-250`.
- `InfoTip`: `src/renderer/src/components/InfoTip.tsx`.
- `Toggle` with on / off labels: `components/triggers/ui.tsx`.
- The "N needs you" header badge, row layout, 8A confirmation and refocus logic: `MailboxesSettings.tsx`.
- Strings already in all three locales: `mailboxes.intro`, `mailboxes.empty`, `mailboxes.claudeAccountSub`, `mailboxes.claudeAccessDesc`.

## Implementation Tasks

Synthesized from this review's findings. Each task derives from a specific finding above.

- [ ] **T1 (P1, human: ~3h / CC: ~20min)**: MailboxesSettings: turn the section into a fold that starts closed and opens by itself when a mailbox needs you
  - Surfaced by: Pass 1 / decisions 2 and 4
  - Files: `src/renderer/src/components/MailboxesSettings.tsx`, `src/renderer/src/i18n/locales/{en,zh-CN,ar}.json` (summary strings: "N mailboxes", "1 mailbox", "none yet")
  - Verify: open Settings with 0, 4 and 15 mailboxes and with one needing attention; source test in `test/multi-mailbox-ui.test.cjs`
- [ ] **T2 (P1, human: ~1h / CC: ~10min)**: MailboxesSettings: the Your Claude account line leads the list inside the fold, with its text behind an info icon
  - Surfaced by: decision 3 (revised)
  - Files: `src/renderer/src/components/MailboxesSettings.tsx`, locale `claudeAccessDesc` ("below")
  - Verify: open the fold; the switch is the first line and toggles; its save error shows under the header
- [ ] **T3 (P2, human: ~30min / CC: ~5min)**: MailboxesSettings: sort mailboxes needing attention first, then A to Z
  - Surfaced by: decision 5A
  - Files: `src/renderer/src/components/MailboxesSettings.tsx`
  - Verify: unit or source test on the sort
- [ ] **T4 (P2, human: ~30min / CC: ~5min)**: MailboxesSettings: intro and empty guidance into the header info icon
  - Surfaced by: decisions 6A and 7A
  - Files: `src/renderer/src/components/MailboxesSettings.tsx`
  - Verify: closed header is one line; the info icon shows the intro, plus the empty text when there are no mailboxes
- [ ] **T5 (P2, human: ~15min / CC: ~5min)**: DESIGN.md and multi-mailbox.md: record the fold
  - Surfaced by: Pass 5
  - Files: `branding/DESIGN.md` (§7.26 Settings), `docs/designs/multi-mailbox.md` (2A note)
  - Verify: docs read back

## Completion Summary

```
  +====================================================================+
  |         DESIGN PLAN REVIEW — COMPLETION SUMMARY                    |
  +====================================================================+
  | System Audit         | branding/DESIGN.md v2 present; UI scope: one |
  |                      | Settings section                             |
  | Step 0               | 5/10; focus: space used at scale             |
  | Pass 1  (Info Arch)  | 4/10 → 7/10 (rows kept as is by choice)      |
  | Pass 2  (States)     | 6/10 → 8/10                                  |
  | Pass 3  (Journey)    | 6/10 → 8/10                                  |
  | Pass 4  (AI Slop)    | 9/10 → 9/10                                  |
  | Pass 5  (Design Sys) | 6/10 → 9/10                                  |
  | Pass 6  (Responsive) | 7/10 → 8/10                                  |
  | Pass 7  (Decisions)  | 7 resolved, 0 deferred                       |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (4 items)                            |
  | What already exists  | written                                      |
  | TODOS.md updates     | 0 items proposed                             |
  | Approved Mockups     | 0 generated (designer key returned 401)      |
  | Decisions made       | 6 added to plan, 1 declined change (1C)      |
  | Decisions deferred   | 0                                            |
  | Overall design score | 4/10 → 7/10                                  |
  +====================================================================+
```

Pass 1 stays at 7 because the open list keeps today's 57 px rows (decision 1C); the fold, not
the rows, is what keeps the section short.

## Unresolved Decisions

None.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | ISSUES OPEN (2026-09-26, multi-mailbox) | mode: SELECTIVE_EXPANSION, 1 critical gap |
| Outside Review | `/plan-design-review` outside voices | Independent 2nd opinion | 3 | skipped (owner, 2026-10-01) | none run this review |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 2 | ISSUES OPEN (2026-09-26, multi-mailbox) | 34 issues, 1 critical gap |
| Design Review | `/plan-design-review` | UI/UX gaps | 3 | ISSUES OPEN | score: 4/10 → 7/10, 6 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | none | none |

- **OUTSIDE COVERAGE:** design phase, outside voices skipped by the owner (D2); no Codex use per the owner's standing rule. Image mockups unavailable: the gstack designer's OpenAI key returned 401.
- **VERDICT:** NOT CLEARED. No review is clear for this plan; eng review required.

NO UNRESOLVED DECISIONS
