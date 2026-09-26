# The fresh-start note is a stacked note

Status: built (2026-09-25).

## Proposal (owner, 2026-09-25)

"Looks ugly in appearance" (screenshot: Pam's panel, the note after a safe clear).

## What exists today (from the code)

`ClearedBanner.tsx`, above the agent panel's tabs for 24 hours after the app gave an agent a
fresh start (`safeClearer.ts`). A sky box with the sentence (`flex: 1`) and a hand-styled
button "Bring back the earlier conversation" (padding `3px 10px 1px`). The label never wraps,
so it takes most of the width and squeezes the sentence into a 5 line column; the box grows
to about 110px and the button floats in the middle. It can't be hidden. A failed restore
(`restoreConversation` returns `ok: false` or throws) shows nothing.

Mockup: `~/.gstack/projects/agentvivekkumar-dontbemichael/designs/cleared-banner-20260925/banner.html`, variant B.

## Design decisions (all owner, 2026-09-25)

### D1. Stacked note (B; owner changed from A after seeing the mockup, 2026-09-25)

The same shape as the 1:1 line and the "takes work from {{godName}}" bar
(`OwnerViaMichaelBar`): margin 8px, padding 10px 12px, `sky-light` ground with a 1px `sky`
inset hairline, a column with 8px gap. First the sentence in Inter 14/20 `ink-900`; under it
a row: "Bring back earlier chat" as a `PixelButton` secondary `sm`, and "Hide" (D3) at the
far end of the row. `role="status"` on the note. About 80px tall.

### D2. Short copy (A)

"{{name}} got a fresh start {{ago}}. Nothing was lost." and "Bring back earlier chat".

### D3. Hide (A)

A "Hide" text button (13px `ink-500`, at the end of the button row) hides the note until that
agent's next fresh start: the clear's timestamp is stored per agent in localStorage
(`cth.clearedBanner.hidden.<id>`), and the note shows again only for a newer clear.
Storage failures are ignored (the note just shows).

### D4. Working and failure (A)

While restoring, the action reads "Bringing back…" and is disabled. On failure the sentence
is replaced by "! Couldn't bring it back. Try again." in `coral`, and the action stays so
the owner can retry.

## Implementation tasks

- [x] **C1**: rebuild `ClearedBanner` as the stacked note (D1), with D3 and D4 states.
- [x] **C2**: strings in en, zh-CN, ar (`text`, `bringBack` shortened; `hide`, `bringingBack`, `restoreFailed` new); no dashes.
- [x] **C3**: tests: short copy, stacked layout (sentence above the button row, PixelButton), hide keyed to the clear time, failure message on `ok: false`.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Outside Review | ollama (design outside voice) | Independent 2nd opinion | 0 | — | not run |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | clean | score: 3/10 → 9/10, 4 decisions (D1 revised to B) |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

Pass scores (before → after): hierarchy 3 → 9; states 4 → 9 (working, failure, hidden);
journey 5 → 9; AI slop 6 → 9 (no box, no hand-rolled button); design system 4 → 9;
accessibility 5 → 9 (role status, labeled close, real buttons). Held back from 10: not seen live.

- **OUTSIDE COVERAGE:** none run (Ollama only by standing rule; not requested).
- **VERDICT:** DESIGN CLEARED. eng review required.

NO UNRESOLVED DECISIONS
