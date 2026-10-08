# Onboarding: center the setup card

Owner ask, 2026-10-07: "the onboarding setup should be center aligned". Screenshot: step 1
(Your business) with the card pinned to the left and the rest of the window empty.

Mockup: [onboarding-centered.html](onboarding-centered.html) (HTML/CSS with the app's tokens;
step through 1, 2, 3, switch Slide and Snap, switch English and Arabic).

## Why it happens

- The body is one flex row, up to 1440 px wide, with a fixed 560 px card first
  (`OnboardingWizard.tsx` around line 533).
- The studio fills the rest of the row, but only on Meet, Team, Home, Manager and
  Permissions, and only once a team exists (`OnboardingWizard.tsx` around line 1283).
- Business, Details and the Resume screen never have it, so the card hugs the start edge
  while the step indicator above sits in the middle.
- DESIGN.md §7.25 specifies "a 560 px left card", and the reference shot
  `branding/reference/studio/onboarding-business.png` shows the same, so this is a spec
  gap, not a code slip.

## Decisions

| # | Decision | Choice |
|---|----------|--------|
| D1 | Review scope | Layout only: centering, the step 3 move, glow, narrow windows, Arabic |
| D2 | How the card reaches its column when the studio appears | Slide over 320 ms while the studio fades in; instant with reduced motion |
| D3 | The background glow | Follows the main thing: behind the card while it is alone, behind the studio after, moving with the slide |

## Spec

**Layout rule.** One rule for every step: the card is centered whenever the studio is
not showing, and sits in its column when it is.

- **Centered:** Business, Details and Resume always. Any other step also centers while no
  team exists yet (for example, packs still loading).
- **Body grid.** The body becomes a three-track grid: start track, card track, end track.
  - The card is 560 px, in track 2.
  - The studio sits in track 3, with a 32 px gap on its inline start side.
  - Use `column-gap: 0` so a closed start track leaves no gap.
  - Without the studio: `minmax(0,1fr) 560px minmax(0,1fr)`, so the side tracks are
    equal and the card is centered.
  - With the studio: `minmax(0,0fr) 560px minmax(0,1fr)`. The start track closes and the
    card sits at the start edge, as today.
- **Vertical position.** Keep the existing `margin: auto 0` (Team keeps `0`). It centers
  while the card fits and scrolls normally once it doesn't.
- **Card and indicator line up.** The card's center is the window's center, the same axis
  as the step indicator.

**Motion (D2).**
- **Body:** `transition: grid-template-columns var(--cth-dur-slow) var(--cth-ease)`
  (320 ms). Electron 32 is Chromium 128, which interpolates grid tracks when the track
  count matches.
- **Studio:** fades in over the same 320 ms as it mounts.
- **Back** from step 3 to step 2 reverses the move: the studio unmounts and the card
  glides back to the center.
- **Reduced motion:** with `prefers-reduced-motion: reduce`, there is no transition or
  fade, and the card jumps.

**Glow (D3).**
- The radial glow moves out of the page background into its own decorative layer
  (`aria-hidden`, `pointer-events: none`).
- **Position:** horizontal center at 50% while the card is alone, 72% with the studio
  (28% in right to left), vertical at 55% as today.
- **Animation:** it moves with the same 320 ms ease through a registered custom property
  (`@property --glow-x`), and reduced motion turns that off.

**Right to left.** The grid mirrors on its own: in Arabic the card goes to the right and
the studio fills the left. Logical properties only (`marginInlineStart`).

**Accessibility.** The card's position does not change focus or reading order. Next keeps
focus across the move, and the studio stays `aria-hidden` decoration as today.

**Window size.** The app's minimum window is 1280 x 800 (`MIN_WIN`, `src/main/index.ts`).
At 1280 px, the 28 px padding on each side, the 560 px card and the 32 px gap leave about
632 px for the studio. No narrow-window variant is needed.

## Review passes (layout scope)

| Pass | Before | After | Why it changed |
|------|--------|-------|----------------|
| 1 Information architecture | 4 | 9 | The card sits on the same axis as the step indicator; on studio steps the order is card first, office second, as today |
| 2 States | 5 | 9 | Every studio and no-studio case is named: Business, Details, Resume, no team yet, Back to step 2 |
| 3 Journey | 6 | 9 | Step 3 no longer jumps sideways: the card makes room as the office appears (D2) |
| 4 AI slop | 7 | 9 | Only the container is centered, the text stays start-aligned; the glow frames real content instead of empty space (D3) |
| 5 Design system | 4 | 9 | DESIGN.md §7.25 and the reference shot get updated to match; motion uses `--cth-dur-slow` and `--cth-ease` |
| 6 Responsive and accessibility | 7 | 9 | Minimum window checked, right to left mirrors, reduced motion specified, focus unchanged |
| 7 Unresolved decisions | | | 3 resolved, 0 deferred |

None of the rated passes reaches 10 because the reference screen has to be re-shot and the
motion checked by eye after implementation (T3, T4).

## NOT in scope

- The rest of the wizard (copy, fields, states inside each step): you chose layout only
  (D1), and the wizard had a full v2 pass on 2026-10-01.
- The step indicator's own position: it is already centered between the lockup and
  "Step N of 7".
- Hire wizard and Settings dialogs: different surfaces, not raised.

## What already exists

- The `margin: auto` centering that keeps tall steps scrollable (`OnboardingWizard.tsx`
  line 531 comment).
- Motion tokens `--cth-dur-slow` (320 ms) and `--cth-ease` (`design/tokens.css`), and the
  reduced-motion pattern in `design/global.css`.
- The studio condition at line 1283. Pull it into one `hasStudio` constant that both the
  grid and the glow read.

## TODOS.md updates

None. Every approved item is in the tasks below; nothing was deferred.

## Implementation Tasks

Synthesized from this review's findings. Each task derives from a specific finding above.

- [x] **T1 (P1, human: ~1h / CC: ~10min): OnboardingWizard: center the card when the studio is not showing**
  - Surfaced by: Pass 1 and Pass 2 (the card hugs the start edge on Business, Details and Resume).
  - Do:
    - Add a `hasStudio` constant.
    - Turn the body into the three-track grid from the Spec.
    - Put the card in track 2 and the studio in track 3 with a 32 px inline start margin.
    - Add a `cth-onb-body` class with the grid transition and a `cth-onb-studio-in` fade,
      both off under reduced motion.
  - Files: `src/renderer/src/components/OnboardingWizard.tsx`, `src/renderer/src/design/global.css`
  - Verify:
    - `npm run typecheck`.
    - Steps 1 and 2 are centered under the indicator.
    - Step 3 slides; Back slides back.
    - Reduced motion jumps.
- [x] **T2 (P2, human: ~30min / CC: ~5min): OnboardingWizard: glow layer follows the card**
  - Surfaced by: Pass 4 (the 72% glow lights empty space once the card is centered), D3.
  - Do:
    - Move the radial gradient from the page background into an `aria-hidden` layer.
    - Drive `--glow-x` from `hasStudio`: 50%, or 72% (28% in right to left), registered
      with `@property` and transitioned 320 ms.
  - Files: `src/renderer/src/components/OnboardingWizard.tsx`, `src/renderer/src/design/global.css`
  - Verify: in light, dark and Arabic, the glow sits behind the card on steps 1 and 2 and
    behind the studio from step 3.
- [x] **T3 (P2, human: ~30min / CC: ~10min): DESIGN.md and reference shot match the new layout**
  - Surfaced by: Pass 5 (§7.25 says "a 560 px left card").
  - Do:
    - Rewrite the §7.25 Body line to the layout rule above.
    - Add a §7.25 line for the slide and the glow.
    - Re-shoot `branding/reference/studio/onboarding-business.png`.
    - Add a dated row to the DESIGN.md change log.
  - Files: `branding/DESIGN.md`, `branding/reference/studio/onboarding-business.png`
  - Verify: `npm run check:links`; the new shot shows the card centered.
- [x] **T4 (P2, human: ~20min / CC: ~5min): Pin the layout rule in a test**
  - Surfaced by: Pass 2 (which steps center must not drift back).
  - Do: a source test that `hasStudio` gates both the grid columns and the glow, and that
    the transitions sit inside a reduced-motion override.
  - Files: `test/onboarding-layout.test.cjs` (new)
  - Verify: `npm run test:focused`.

## Completion Summary

```
  +====================================================================+
  |         DESIGN PLAN REVIEW: COMPLETION SUMMARY                     |
  +====================================================================+
  | System Audit         | DESIGN.md §7.25 exists; UI scope: wizard body |
  | Step 0               | 3/10; focus: layout only (D1)               |
  | Pass 1  (Info Arch)  | 4/10 -> 9/10 after fixes                    |
  | Pass 2  (States)     | 5/10 -> 9/10 after fixes                    |
  | Pass 3  (Journey)    | 6/10 -> 9/10 after fixes                    |
  | Pass 4  (AI Slop)    | 7/10 -> 9/10 after fixes                    |
  | Pass 5  (Design Sys) | 4/10 -> 9/10 after fixes                    |
  | Pass 6  (Responsive) | 7/10 -> 9/10 after fixes                    |
  | Pass 7  (Decisions)  | 3 resolved, 0 deferred                      |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (3 items)                           |
  | What already exists  | written                                     |
  | TODOS.md updates     | 0 items proposed                            |
  | Approved Mockups     | 1 HTML mockup, approved (D2, D3)            |
  | Decisions made       | 2 added to plan (D2, D3; D1 was scope)      |
  | Decisions deferred   | 0                                           |
  | Overall design score | 4/10 -> 9/10                                |
  +====================================================================+
```

## Unresolved Decisions

None.

## Approved Mockups

| Screen/Section | Mockup Path | Direction | Notes |
|----------------|-------------|-----------|-------|
| Onboarding body, steps 1 to 3 | /Users/moblizeit/Documents/GitHub/personal/dontbemichael/docs/designs/onboarding-centered.html | Card centered alone, slides to its column as the studio fades in, glow follows | HTML/CSS mockup per the owner's rule (no image designer); proportions scaled down, real card is 560 px |

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Outside Review | — | Independent 2nd opinion | 0 | skipped | not offered: layout-only scope (D1) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | clean | score: 4/10 → 9/10, 2 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**OUTSIDE COVERAGE:** design outside voices not run; this was a scoped layout review (D1), and per the owner's rule Codex is used only for adversarial passes.

**VERDICT:** DESIGN CLEARED (layout scope); eng review required.

NO UNRESOLVED DECISIONS
