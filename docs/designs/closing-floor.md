# Closing time: a person who has gone home is gone from the floor

Status: built (2026-10-03).

## Problem

Owner, 2026-10-03: "during the office close as the agents are done, remove the
name chip and other options to interact with closed agents as that is what
closing really means."

Today (`src/renderer/src/scene/studio/StudioStage.tsx`) a pod's desks go dark
only once everyone in it has confirmed or been excused (`:440`), and its name
chip, hover card, "1 for you" badge and click to open the person all stay live
(`:483-575`). A person's open panel keeps its live terminal, and every other
view can still open them.

## Decisions (owner, 2026-10-03)

1. **1A** A person who has gone home leaves the floor. When everyone in a pod
   has, the pod is dark desks only: no chip, no hover card, no badge, nothing
   on hover or click.
2. **2A** Per person. In a shared pod, a person's desk light goes out and they
   leave the chip and card as they go home ("Pam, Erin" reads "Erin"); the
   chip goes with the last person.
3. **3A** Michael stays usable until the office is closed: plate, card and
   terminal work as normal; his office goes dark when closing completes.
4. **4A** A panel open on someone who goes home closes itself: the right side
   shows Needs you if anything waits, else nothing. Focus goes to the closing
   bar.
5. **5A** One rule everywhere: during closing time a person who has gone home
   cannot be opened from any view (floor, Tasks, Who talks to whom, Needs you).
   Questions on Needs you stay answerable; answers wait in their inbox for the
   next opening.
6. **6A** A mailbox tag and post whose watcher has gone home dim to 45%, the
   stage's dim; the owner's name stays.
7. **7A** Cancel brings everything back at once: lights, chips, cards, badges,
   tags, and opening people. No panel reopens by itself.
8. **8A** A person's chip and card fade out over the same time as their desk
   light dims, with the existing motion tokens; with reduced motion they
   simply disappear.

## What the floor shows

```
before closing        Pam confirms             Erin confirms           all confirmed
[P][E] Pam, Erin  ->  [E] Erin    (Pam's   ->  (no chip, desks   ->   Michael's office
two lit desks         desk dark, Erin's lit)   dark, no hover)         dark, app quits
Michael: plate and card usable the whole time, until closing completes.
```

| Element | Working | Gone home (closing) | After Cancel |
|---|---|---|---|
| Desk light | lit | dims (per person) | lit |
| Name chip, hover card, badge | shown | person removed; gone with last person, fading with the light | shown |
| Click or keyboard to open | opens panel | nothing, in every view | opens panel |
| Open panel on that person | open | closes; Needs you or nothing; focus to the closing bar | stays closed |
| Mailbox tag and post | full | 45% | full |
| Needs you question raised by them | answerable | answerable | answerable |
| Michael | usable | usable until complete | usable |

## Journey

| Step | Owner does | Owner feels | Supported by |
|---|---|---|---|
| 1 | Starts closing time | "the day is ending" | closing bar, lights start going out |
| 2 | Watches people confirm | calm, things are wrapping up | each person's light and chip go out together (8A) |
| 3 | Tries to open someone who left | nothing to do there, by design | no hover, no click, in any view (1A, 5A) |
| 4 | Needs Michael | he is still at his desk | his plate and card work until closed (3A) |
| 5 | Cancels, or closing completes | back to work, or lights out | everything back at once (7A), or Michael's office dark |

## What already exists

- `useClosingLights()` (`StudioStage.tsx:979`): who has gone home (confirmed or
  excused) and whether closing is complete. Source for every rule here.
- `dimStyle` and the 45% stage dim (DESIGN.md §7.14), the closing lights
  (§7.23, §8.12, §13 row "Closing time").
- Per desk `away` state in `Pod` desks, used at opening; the same per desk
  dark serves 2A.
- The closing bar's `role="status"` counter announces progress to screen
  readers; it already takes focus when closing starts.

## NOT in scope

- Ending a gone-home agent's process early: they keep running until the app
  quits, as today; this is what the owner sees and can do.
- Changing Needs you or the Tasks view beyond the open-person rule (5A).

## Implementation Tasks

- [x] **T1 (P1, human: ~3h / CC: ~20min)** StudioStage: per person gone home.
  Chip and card list only members still in; a pod with nobody in renders no
  chip or card; desks dark per person; chip and card fade with the light
  (existing tokens; none with reduced motion). Mailbox tag and post at 45%
  when its watcher is gone. Michael unchanged until complete.
  - Files: `src/renderer/src/scene/studio/StudioStage.tsx`, `src/renderer/src/design/global.css`
- [x] **T2 (P1, human: ~2h / CC: ~15min)** One gate: the closing state lives in
  the store (who has gone home); `select` ignores a gone-home person during
  closing, so the floor, Tasks, Who talks to whom and Needs you all follow it.
  A selected person who goes home closes the panel (Needs you if locked, else
  closed) and focus moves to the closing bar. Cancel clears the state.
  - Files: `src/renderer/src/store/store.ts`, `src/renderer/src/App.tsx`, `src/renderer/src/scene/studio/StudioStage.tsx`
- [x] **T3 (P2, human: ~1h / CC: ~10min)** Tests: gone-home rules (chip members,
  select gate, panel close, Cancel restores, Michael exempt); DESIGN.md §7.23
  and §8.12 updated with the table above.
  - Files: `test/closing-floor.test.cjs`, `branding/DESIGN.md`

## Completion Summary

```
+====================================================================+
|         DESIGN PLAN REVIEW — COMPLETION SUMMARY                    |
+====================================================================+
| System Audit         | DESIGN.md present (§7.23, §8.12); floor scope |
| Step 0               | 3/10; all gaps reviewed                      |
| Pass 1  (Info Arch)  | 4/10 → 9/10 after fixes                      |
| Pass 2  (States)     | 3/10 → 9/10 after fixes                      |
| Pass 3  (Journey)    | 5/10 → 9/10 after fixes                      |
| Pass 4  (AI Slop)    | 9/10 → 9/10 (removal only, nothing new drawn) |
| Pass 5  (Design Sys) | 9/10 → 9/10 (existing dim and motion tokens)  |
| Pass 6  (Responsive) | 8/10 → 9/10 (focus to bar recorded)           |
| Pass 7  (Decisions)  | 8 resolved, 0 deferred                       |
+--------------------------------------------------------------------+
| NOT in scope         | written (2 items)                            |
| What already exists  | written                                      |
| TODOS.md updates     | 0 items proposed                             |
| Approved Mockups     | 0 generated (designer key rejected)          |
| Decisions made       | 8 added to plan                              |
| Decisions deferred   | 0                                            |
| Overall design score | 3/10 → 9/10                                  |
+====================================================================+
```

Unresolved Decisions: none.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Outside Review | codex via `/plan-design-review` | Independent 2nd opinion | 0 | skipped | not offered: designer and outside voices unavailable this run |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 5 | issues_open | last run 2026-10-02 on other plans, not this one |
| Design Review | `/plan-design-review` | UI/UX gaps | 9 | clean | score: 3/10 → 9/10, 8 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** codex, design phase, skipped this run; no outside findings.
- **VERDICT:** DESIGN CLEARED for this plan; eng review required.

NO UNRESOLVED DECISIONS
