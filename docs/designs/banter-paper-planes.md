# Office banter flies as paper planes only

Owner, 2026-10-04: "during idle time chit chat only use paper plane animation to
exchange messages. Reserve the mail icon for actual messages."

## The design

- Banter (DESIGN.md 8.8): each beat of an idle exchange flies pod to pod as a paper
  plane in the sender's department color, never an envelope. Today the look is a coin
  flip per exchange (`StudioStage.tsx` `useIdleQuote`, `Math.random() < 0.5 ? 'plane' : 'mail'`).
- Envelopes on the floor then always mean a real message: a hive message between people
  (request, propose, inform, refuse), a mail tool call on the mail wire, or the owner
  writing to Michael from the composer.
- **D1 (owner):** the coral paper plane from Michael's office to the Needs you button
  stays as it is. Its color, its fixed path to the top bar and the button's bump set it
  apart from banter.
- Code: `throwNote` takes no look and always draws `note-plane`; the `note-mail` flight
  kind goes. DESIGN.md 8.8 and the 8.12 life table say planes only.

## Review passes

| Pass | Before | After | Note |
|---|---|---|---|
| 1 Information architecture | 6 | 9 | one shape, one meaning: envelope = real message |
| 2 States | 8 | 9 | reduced motion and paused stage unchanged (`throwNote` returns false) |
| 3 Journey | 6 | 9 | a glance at the floor tells work from chatter |
| 4 AI slop | 9 | 9 | no new art; the existing plane |
| 5 Design system | 6 | 9 | DESIGN.md 8.8, 8.12 row and changelog updated |
| 6 Responsive and accessibility | 9 | 9 | decorative motion, `aria-hidden` SVG as today |
| 7 Decisions | | | 1 resolved (D1), 0 deferred |

NOT in scope: changing the Needs you plane (D1 kept it).

## Implementation Tasks

- [x] **T1 (P1, human: ~30min / CC: ~5min)** — studio — banter always throws a plane
  - Files: `src/renderer/src/scene/studio/StudioStage.tsx`, `life.tsx`, `branding/DESIGN.md`
  - Verify: source pin in `test/studio-home.test.cjs`: no `'mail'` look and no `note-mail` kind

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | not run for this plan | — |
| Outside Review | codex design voice | Independent 2nd opinion | 0 | skipped (owner rule: Codex adversarial only) | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | not run (5 line animation change) | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 11 | clean | score: 6/10 → 9/10, 1 decision |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** codex, design phase, skipped by the owner's standing rule.
- **VERDICT:** DESIGN CLEARED. Eng review required by default; this is a cosmetic change covered by a source test.

NO UNRESOLVED DECISIONS
