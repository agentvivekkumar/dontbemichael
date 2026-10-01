# Don't Be Michael: Design System (v2, Studio)

This is the single design spec for everything that carries the Don't Be Michael name:
the desktop app (this repo) and the marketing site, dontbemichael.com
(`agentvivekkumar/dontbemichael_website`). It is canonical. It lives in `branding/`
with every logo, icon, color file and font, so the folder can be handed to anyone,
with or without the code. The repo-root `DESIGN.md` and the site's `DESIGN.md` only
point here.

**How to use it**

1. Every rule is tagged with the surface it binds: **[Both]**, **[App]** or **[Web]**.
   An untagged rule inside a tagged chapter inherits the chapter's tag.
2. Change the spec first, then the code. A design change that lands in code without
   a matching edit here is drift, and drift is a bug.
3. Where the code and this doc disagree and nobody has decided which is right, the
   gap goes in the §17 register instead of being quietly "fixed" in either direction.
4. Tokens are the contract. If a value you need is not a token, add the token here
   and in the token files (§14). Do not paste a hex value into a component.

**Version.** v2 "Studio", adopted 2026-09-30. It replaces the v1 pixel system
(`archive/DESIGN-v1-pixel.md`). As of adoption, **neither the app nor the site has been
migrated**: both still render v1. The migration is tracked in §17. Until an item there is
closed, the code is behind the spec, not the other way round.

**Reference screens.** The v2 screens are in [`reference/studio/`](./reference/studio/)
(§20), shot from the app's own components. When this text and a reference screen disagree,
this text wins.

---

## 1. Brand [Both]

### 1.1 The idea

Michael is the boss who kept every job on his own desk and called it leadership.
Don't Be Michael is the office he should have run: a team of AI agents that does the
work, while the owner signs off on it. Every design decision reinforces one of two
things. Either **the work is delegated**, or **you stay in control**.

v2 makes the first one visible. The home screen is an office you can watch: work comes in
through mailboxes, goes to Michael, and he hands it to whoever's job it is. Only what
Michael can't settle comes to you.

### 1.2 Why v2

The app was forked from Munder Difflin, and v1 kept its shape: a pixel office floor in
the middle, a strip of agent cards along the bottom, a Command Center on the right, and
pixel type and arcade color throughout. People read the fork as a copy. v2 keeps what is
ours (the name, the Struck M, Michael, the cast, the delegation idea, the business
features) and replaces everything that was shared: the floor, the layout, the pixel UI
and the arcade palette.

### 1.3 One system, two scales

The app and the site use **the same tokens**: the same colors, fonts, radii and studio
illustration. The difference is scale, not volume.

| | App | Web |
|---|---|---|
| Job | A workspace people sit in all day | A page that has to earn attention in seconds |
| Scale | Dense: 12 to 13 px UI text, compact cards | Large: 18 px body, 56 to 64 px headlines, full width studio art |
| Attention comes from | The coral Needs you signal and live motion on the stage | Headline size and the studio illustration |

There is no louder web palette. A hue means the same thing everywhere: coral means
"needs you", green means "done" or "on", blue means "working".

### 1.4 The mark: Struck M

The mark is unchanged from v1. It is the one pixel element in the brand, kept on
purpose as a signature.

A pixel capital M with a coral slash through it. Read it as "don't be M".

**Construction.** 16 × 16 cell grid. Origin top-left, `x` right, `y` down.

- Stems: columns 2, 3, 12 and 13, rows 3 to 13.
- Diagonals, each two cells thick: (4,3) (4,4) (5,4) (5,5) (6,5) (6,6) (7,6) (7,7),
  mirrored across x = 7.5 for the right side.
- Slash: every cell with `x + y ∈ {15, 16}` for `1 ≤ x ≤ 14`, drawn over the M with no
  knockout gap.

**Colors.** The mark does not follow the theme.

| Use | M | Slash | Ground |
|---|---|---|---|
| On light | `#1A1320` | `#FF6B6B` | transparent or `#F7F7FB` |
| On dark | `#ECEAF4` | `#FF6B6B` | transparent or `#14131C` |

The slash is always `#FF6B6B`, which is the logo coral, not the UI coral (§3.2). The mark
is a logo, not UI.

**Size and space**

- Render only at integer multiples of 16 px, or as SVG with `shape-rendering:
  crispEdges`. Never blur, anti-alias or resample it at a fraction. Minimum 16 px.
- Clear space is 2 cells (1/8 of the mark's width) on every side.
- In the app top bar the mark is 26 px, drawn as SVG (the one allowed non-multiple,
  because it is vector and crisp-edged).

**Don't**

- Don't rotate, outline, add a shadow to, or recolor the mark.
- Don't redraw the slash as a smooth line. It is pixels.
- Don't put the mark on coral or on a busy image.
- Don't use pixel art anywhere else in the brand. The mark is the only one.

### 1.5 Wordmark

`Don't Be Michael` in **Sora SemiBold (600)**, sentence case with the apostrophe,
letter-spacing `-0.02em`, all in ink. Coral appears only in the mark's slash.

- Beside the mark, the wordmark's cap height is 55 to 60% of the mark's height, and the
  gap is 10 px at 26 px mark size (scale proportionally).
- In the app the lockup sits at the left of the top bar (§7.1). On the web it is the nav
  logo.
- The lockup files in `logo/lockup/` are outlined, so no font is needed.

### 1.6 App icon [App]

Unchanged: the Struck M on a tile. Canvas 1024 × 1024, tile inset 100 px (824 × 824),
macOS continuous corner radius 185 px, tile fill `#FFFDF5` with a 2 px inner line
`#1A1320` at 12% opacity, mark at 512 × 512 centered. Windows `.ico` and Linux PNGs use
the square tile with no radius. Favicons and the Apple touch icon use the same `#FFFDF5`
ground.

### 1.7 Name, cast, parody and legal lines

- The product name is **Don't Be Michael**. Always with the apostrophe.
- The team members use *The Office* character names (Michael, Pam, Kelly, Dwight, Oscar
  and the rest). Names only: never NBC or show logos, title lettering, cast photos,
  likenesses or show quotes presented as official material.
- Office humor lives in words (names, empty states, the idle quote bubbles in §8.8),
  never in chrome, and never on anything the owner has to act on.

---

## 2. Principles [Both]

1. **Delegation is the picture.** The main view shows work arriving, going through
   Michael, and landing with the right person. If a screen hides who is doing what, it
   is wrong.
2. **Calm by default. Coral only for you.** Everything is quiet pastel except the things
   that need the owner. If coral appears, the owner has something to do.
3. **Every state has words.** Status is never color or motion alone. A pod that glows
   also has a pill that says "Working".
4. **Only what's real.** The UI shows what the app actually does. No switch, chip or
   button for a capability that isn't enforced. (The mockup era learned this: web
   switches and "spending asks you" chips were removed because nothing enforced them.)
5. **Art carries information.** The studio illustration is a status display, not
   decoration. Lit screens, glows, beacons and tokens all mean something (§8).
6. **Fields first.** Screens show fields, values and actions. Explanations go behind a
   small (i) info icon, in short text.
7. **Modern and flat, with depth only where it explains.** Soft shadows lift cards off
   the stage; the isometric studio gives the office a place. No skeuomorphism beyond that.

**Not:** pixel UI or pixel type (the mark excepted), arcade saturation, hard offset
shadows, chunky frames, glassmorphism as a style (Michael's glass pod is illustration,
not UI), gradients as decoration (the exceptions are listed in §3.8), dense tables as a
home screen, an email client look.

---

## 3. Color

All values below are the contract. Each token has a light and a dark value; the site is
light only (§15).

### 3.1 Neutrals [Both]

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | `#F7F7FB` | `#14131C` | App and page ground, stage ground |
| `floor` | `#E9E7F7` | `#26223B` | Studio platform floor, subtle fills |
| `card` | `#FFFFFF` | `#1F1E2B` | Cards, panels, inputs, popovers |
| `card-2` | `#FAFAFD` | `#24233A` | Inset rows inside a card (stats strip, input fill) |
| `rail` | `#F8F7FC` | `#181722` | Right column ground (§3.8 allows a 2 stop gradient `#FBFBFE` to `#F6F5FB` in light) |
| `chrome` | `#F1F0F8` | `#1B1A26` | macOS title bar strip, top bar ground under 70% white |
| `ink` | `#1E1B2E` | `#ECEAF4` | Primary text, primary buttons (light), icons |
| `ink-2` | `#4A4660` | `#CFCCDD` | Secondary text, captions, tab labels |
| `ink-3` | `#6C6884` | `#A5A2B8` | Tertiary text: meta, placeholders, hints, legends |
| `ink-4` | `#B4B1C6` | `#8C89A0` | **Non-text only**: disabled icons, info icon ring, decorative dots |
| `line` | `#E8E6F2` | `rgba(255,255,255,.09)` | Card borders, dividers (decorative) |
| `line-2` | `#DAD7EA` | `rgba(255,255,255,.14)` | Stronger dividers, secondary button border |
| `line-input` | `#8F8AA6` | `#76728C` | Boundaries that identify a control (input, textarea, select, switch track off). 3:1 or better |
| `neutral-soft` | `#F0EFF5` | `#2A2938` | Idle pill fill, quiet chips |

Never `#000` or `#FFF` for text in dark mode. White text on dark fills is `#FFFFFF`
only on `ink` buttons in light mode.

### 3.2 Semantic accents [Both]

Each accent has three roles: the **base** (dots, strokes, icons, fills without text),
**soft** (a tinted fill behind text), and **text** (text on white or on its own soft).

| Hue | Meaning | Base light | Soft light | Text light | Base dark | Soft dark | Text dark |
|---|---|---|---|---|---|---|---|
| `coral` | Needs you. Only the owner's to-dos | `#FF5A5F` | `#FFECEC` | `#C8303A` | `#FF5A5F` | `rgba(255,90,95,.16)` | `#FF8C90` |
| `green` | Done, on, live, good | `#1FB872` | `#E3F7EC` | `#157D4D` | `#34CD8A` | `rgba(52,205,138,.14)` | `#34CD8A` |
| `blue` | Working | `#4C6FFF` | `#E8EDFF` | `#3553E8` | `#8FA3FF` | `rgba(124,147,255,.16)` | `#8FA3FF` |
| `violet` | Thinking, a question between teammates | `#8B5CF6` | `#F0EAFE` | `#7043E6` | `#B69CFF` | `rgba(167,139,250,.17)` | `#B69CFF` |
| `amber` | Sticky notes, a proposal, a loop warning | `#F2A93B` | `#FFF4DF` | `#8F5C07` | `#F2B45A` | `rgba(242,180,90,.15)` | `#F2B45A` |
| `indigo` | Michael, links, focus, requests | `#6C5CE7` | `#EEEBFD` | `#4338CA` | `#9D90FF` | `rgba(157,144,255,.16)` | `#A99FFF` |

**Coral fills that carry text** (the Needs you button, count badges, a coral primary
button) use `coral-strong` `#D4363D` in light mode (4.78:1 with white). In dark mode they
keep `#FF5A5F` and use `ink-on-coral` `#14131C` text (6.0:1). Plain `#FF5A5F` with white
text measures 3.05:1 and is not allowed for text under 18.66 px bold.

Rules:

- Coral is reserved. No decorative coral, no coral CTA on the website, no coral for
  errors that the owner doesn't have to act on (use `ink-2` with an icon).
- A new accent needs all six columns at once, or none.
- The logo coral `#FF6B6B` (§1.4) is not a UI token.

### 3.3 Message acts [Both]

Work moving between people is drawn as tokens on paths (§8.6). Their color comes from the
hive message act:

| Act | Token | Color | Glyph |
|---|---|---|---|
| `request` | `act-request` | light `#5B55C9`, dark `#8F89F2` | envelope |
| `query` | `act-question` | `violet` base | `?` |
| `propose` | `act-propose` | `amber` base | envelope with a dot |
| `inform` | `act-inform` | `ink-4` | envelope, outline only |
| `agree`, `done` | `act-done` | `green` base | check |
| `refuse` | `act-refuse` | `ink-2` | envelope with a slash |
| `needsHuman` (escalated to the owner) | `act-you` | `coral` base | `!` |

Only `act-you` tokens travel from Michael to the right column. A team member never sends
one directly: they go to Michael first (§8.6).

### 3.4 Departments [Both]

Pods, avatars and illustration faces use a pastel family per department. Each family has
`l` (lit screen, lightest face), `m` (main face), `d` (shaded face) and `acc` (glow,
avatar letter, tag rule).

| Department | Roles today | `l` | `m` | `d` | `acc` |
|---|---|---|---|---|---|
| `front-desk` | Executive Admin | `#FFE4EC` | `#F7C3D2` | `#EBA6BA` | `#E25A83` |
| `support` | Customer Support | `#DDEEFF` | `#B4D5F8` | `#93BEEE` | `#3D8BE6` |
| `sales` | Sales Director | `#FFF3CC` | `#F8DF95` | `#EDCB6E` | `#D29B0B` |
| `finance` | Finance | `#D8F5E8` | `#AEE6CD` | `#8DD5B5` | `#1FA872` |
| `marketing` | Marketing | `#FFE6D8` | `#F9C8AE` | `#EEB090` | `#E57B45` |
| `people` | HR Manager | `#EFE6FC` | `#D6C5F4` | `#C1AAEA` | `#8A63E0` |
| `it` | IT Engineer, IT Security | `#E0E6F7` | `#BAC5E8` | `#9DABDA` | `#5468C4` |
| `operations` | Supply Chain, Inventory & Shipping, Quality Control | `#D5F3F4` | `#A9E3E5` | `#86D2D5` | `#169BA3` |
| `team` | A new job written in the hire wizard | `#EDEBF6` | `#D8D5EA` | `#C4C0DE` | `#6C6884` |
| `manager` | Michael | glass (§8.4) | | | `#6C5CE7` |

**Dark derivation.** In dark mode each family is derived from its `m` value in HLS:
`l` = L .36 S .34, `m` = L .28 S .30, `d` = L .22 S .28, `acc` = L .70 S .80 of `acc`.
Lit screens keep the light `l` value in both themes, so a working screen glows in the dark.

The role to department mapping is data, not art: it lives next to `OFFICE_ROLES`
(`src/shared/officeRoles.ts`) when the app migrates (§17).

### 3.5 Status [App]

Status reads from the owner's side. Every status has a pill with a word (§7.13) and a pod
treatment (§8.5).

| Status (store) | Pill label | Pill colors | Pod treatment |
|---|---|---|---|
| `working` | Working | `blue` text on `blue` soft | Screen lit (`l`), floor glow in `acc` |
| `thinking` | Thinking | `violet` text on soft | Three dot bubble over the monitor |
| `waiting` (at a prompt, not busy) | Waiting | `ink-3` on `neutral-soft` | Screen on, no glow |
| `blocked` on the owner | Needs you | white on `coral-strong` | Coral beacon above the pod, pulsing |
| `compacting` | Tidying up | `violet` text on soft | Small box glyph on the desk |
| `looping` | Stuck | `amber` text on soft | Amber ring around the chair, rotating |
| `success` | Done | `green` text on soft | Check burst, then back to idle |
| `idle` | Idle | `ink-3` on `neutral-soft` | Pod desaturated (saturate .25, opacity .82) |
| on hold (1:1 with the owner) | 1:1 with you | `indigo` text on soft | Headset glyph; no tokens arrive from Michael |
| draft in the terminal | typing dot | `indigo` base dot | none |

Separate from status: a **for you** badge (§7.15) counts the Ask me cards tagged to that
person. A person can be Working and still have "1 for you".

### 3.6 Logo colors

`#1A1320` (M on light), `#ECEAF4` (M on dark), `#FF6B6B` (slash). Fixed. See §1.4.

### 3.7 Shadows as color

| Token | Light | Dark |
|---|---|---|
| `shadow-sm` | `0 1px 2px rgba(30,27,46,.05)` | `0 1px 2px rgba(0,0,0,.35)` |
| `shadow-md` | `shadow-sm, 0 6px 18px rgba(62,52,140,.08)` | `shadow-sm, 0 8px 22px rgba(0,0,0,.32)` |
| `shadow-lg` | `shadow-sm, 0 10px 30px rgba(62,52,140,.10)` | `shadow-sm, 0 12px 32px rgba(0,0,0,.40)` |
| `shadow-hub` | `shadow-sm, 0 10px 26px rgba(92,76,220,.14)` | `shadow-sm, 0 10px 26px rgba(0,0,0,.45)` |
| `shadow-coral` | `0 4px 14px rgba(212,54,61,.30)` | `0 4px 14px rgba(255,90,95,.25)` |
| `ring-select` | `0 0 0 3px rgba(30,27,46,.08)` | `0 0 0 3px rgba(236,234,244,.12)` |

### 3.8 Gradients [Both]

Allowed only here: the stage's radial light (white at 0 to transparent at 70%, 900 × 520
ellipse at the stage center), the rail's two stop vertical gradient, the context meter
fill (`#8E83F5` to `#6C5CE7`), glass and glow in the studio illustration (§8), and the
web hero's backdrop (the same radial light). Nowhere else.

---

## 4. Typography

### 4.1 Faces [Both]

| Face | Role | Source |
|---|---|---|
| **Sora** (400, 500, 600, 700) | All UI and display text, the wordmark | Google Fonts, OFL. `fonts/sora/` |
| **IBM Plex Mono** (400, 500, 600) | Numbers, times, counts, ids, email addresses, file paths, schedule "when" lines | Google Fonts, OFL. `fonts/ibmplexmono/` |
| **JetBrains Mono** | The live terminal only (xterm), for its box drawing and ligature-free metrics | Bundled today. `fonts/jetbrainsmono/` |

Fallbacks: Sora → `system-ui, -apple-system, "Segoe UI", sans-serif`; for Simplified
Chinese add `"PingFang SC", "Noto Sans SC"`; for Arabic add `"SF Arabic", "Noto Sans
Arabic"` (Sora has Latin only). Mono → `ui-monospace, "SF Mono", monospace`.

Retired: Press Start 2P, VT323, Pixelify Sans, Inter. They stay in `fonts/` only until
the app and site have migrated (§17), then leave the kit.

Rules:

- Numbers that the owner scans or compares (counts, times, money, ids) are mono.
- Sora tracking: `-0.03em` at 20 px and up, `-0.02em` at 15 to 19 px, `-0.01em` at 12 to
  14 px, `0` below 12 px. Mono is always `0`.
- Uppercase is only for micro labels (department tabs, field labels, eyebrows) with
  `+0.05em` to `+0.08em` tracking. Never uppercase a sentence.
- Weights: 400 body, 500 labels and tabs, 600 names, titles and buttons, 700 only for
  avatar initials.

### 4.2 App scale [App]

| Token | Size / line | Weight | Use |
|---|---|---|---|
| `t-view` | 20 / 26 | 600 | View title on the stage ("Office", "Tasks") |
| `t-panel` | 15 / 20 | 600 | Right column heading, person name in the panel header |
| `t-ui` | 13 / 18 | 400 to 600 | Base UI: tabs, buttons, inputs, body |
| `t-body` | 12 / 16.5 | 400 | Card body text, Michael's questions, descriptions |
| `t-meta` | 11 / 15 | 400 to 600 | Captions, chips, meta lines, hints |
| `t-micro` | 10 / 13 | 600 | Uppercase micro labels, status pills, badges |

Floor: nothing below 10 px, and 10 px only for uppercase micro labels, pills and
badges.

### 4.3 Web scale [Web]

| Token | Desktop | Phone (≤ 480 px) | Weight | Use |
|---|---|---|---|---|
| `w-display` | 64 / 68 | 40 / 44 | 600 | Hero headline |
| `w-h2` | 40 / 46 | 30 / 36 | 600 | Section headline |
| `w-h3` | 22 / 30 | 20 / 28 | 600 | Feature titles, card titles |
| `w-lead` | 20 / 30 | 18 / 28 | 400 | Hero and section sublines |
| `w-body` | 17 / 27 | 16 / 25 | 400 | Body text |
| `w-small` | 14 / 20 | 14 / 20 | 400 to 500 | Captions, footer |
| `w-eyebrow` | 12 / 16 mono | 12 / 16 | 600 | Uppercase eyebrow, `+0.08em` |

---

## 5. Spacing and layout

### 5.1 Grid [Both]

4 px base. Spacing tokens: `s-1` 4, `s-2` 8, `s-3` 12, `s-4` 16, `s-5` 20, `s-6` 24,
`s-8` 32, `s-10` 40, `s-12` 48, `s-16` 64, `s-24` 96. Odd values in the reference
screens (7, 9, 11, 13 px) snap to the nearest token in the build.

### 5.2 App shell [App]

One window, four regions. Nothing else is permanent.

```
+---------------------------------------------------------------+
| macOS title bar (28, hiddenInset)                             |
| Top bar (56): lockup, view tabs, clock, version, icons, Needs  |
+---------------------------------------------+-----------------+
| Stage (fills)                               | Right column    |
|   Office / Tasks / Who talks to whom        | (380, resizable)|
|                                             |                 |
| Bottom bar (50, floats 24 above the edge)   |                 |
+---------------------------------------------+-----------------+
```

| Region | Size | Holds |
|---|---|---|
| Top bar | 56 px, ground `chrome` under `card` at 70% | §7.1 |
| Stage | Fills | The current view (§7.2): Office (studio, §8), Tasks (§7.20), Who talks to whom (§7.22) |
| Right column | 380 px default, 340 min, 520 max, drag to resize (SidebarSplitter, double click resets; its grip shows only on hover) | Needs you board by default; the selected person's panel; Michael's panel. Work tab widens it to 480. It has no ground of its own (owner, 2026-09-30: a panel behind cards is a layer too many): the Needs you heading and cards, and the person and Michael panels (cards themselves), sit straight on the stage, which runs on underneath (`StudioStage` `bleed`); the scene still fits the space left of it |
| Bottom bar | 50 px tall, floats 24 px left, 22 px right and 26 px above the stage's bottom edge | Talk to Michael composer, next job chip, pack and Hire (§7.19) |

Rules:

- **No bottom strip of agent cards, no left floor, no permanent Command Center.** People
  live on the stage.
- Minimum window 1280 × 800: the studio scales down to fit the stage beside a 340 px
  right column. Below 1100 px of stage width the platform scales, never crops.
- Focus mode (full screen terminal) keeps its v1 behavior with v2 styling. Hidden in this
  build (`SHOW_FOCUS_MODE`, owner, 2026-10-01): no button opens it and a saved preference
  does not reopen it.
- RTL: the right column moves to the left, bars mirror, the studio art does not (§8.10).

### 5.3 Web layout [Web]

- Container 1200 px max, 24 px gutters, 16 px under 480 px.
- Section rhythm: 96 px between sections on desktop, 64 px on phone.
- Check at 1440, 1040, 980, 480, 390 and 320 px.
- The hero is two columns on desktop (text left, studio right, studio bleeds to the
  container edge) and stacked on phone (text, then studio at full width).

---

## 6. Surfaces, borders, shadow, radius [Both]

### 6.1 Surfaces

- Cards: `card` fill, 1 px `line` border, `shadow-md`. Nested rows use `card-2`.
- Elevated cards (Michael's hub card, the Talk to Michael composer, overlays): `shadow-lg`
  or `shadow-hub`.
- Selected card: 1 px `ink` border plus `ring-select`.
- Overlay backdrop: `bg` at 60% with no blur (light), `#000` at 45% (dark).
- Label cards on the stage use `card` at 96% opacity with a 6 px backdrop blur, so the
  studio reads through slightly. Idle ones at 86%.

### 6.2 Radius

| Token | Value | Use |
|---|---|---|
| `r-xs` | 3 px | Sticky note corner accents, tiny marks |
| `r-sm` | 6 px | Department tabs, tags, small icon buttons |
| `r-md` | 9 px | Buttons, inputs, view tabs, textareas |
| `r-lg` | 12 px | Chips, bottom bar chips, menus |
| `r-xl` | 14 px | Cards, Ask me cards, label cards |
| `r-2xl` | 16 px | Composer, hub card, overlays |
| `r-pill` | 999 px | Pills, badges, clock, Needs you button |

The v1 "no radius" rule is retired.

### 6.3 Borders

Hairlines only: 1 px. The one exception is the 2.5 px top rule on mailbox tags (§7.18)
and the 3 px coral left rule on Ask me cards (§7.8).

---

## 7. App components [App]

Names in parentheses are today's components that the v2 component replaces or restyles.

### 7.1 Top bar

Left to right: lockup (§1.5, 26 px mark); view tabs (§7.2); then, pushed right: clock
pill (§7.3), version chip (§7.4), icon buttons (theme, Settings; focus mode hidden in this build, `SHOW_FOCUS_MODE`; 32 × 32,
`r-md`, `ink-2` icons, hover fills `card` with a `line` border), and the Needs you button
(§7.5). The bar is a drag region; interactive children are `no-drag`.

### 7.2 View tabs (FloorViewToggle)

Office, Tasks, Who talks to whom. Tab: `t-ui` 500, `ink-2`, padding 7 × 13, `r-md`.
Active: `ink` fill, white text (dark mode: `ink` fill `#ECEAF4`, text `#14131C`). Tasks
carries a count badge of blocked tasks: `coral-strong` pill, mono 10.5 px 600, white. The
choice persists (`cth.floorView`).

### 7.3 Clock pill

Pill, `card` fill, `line` border, padding 6 × 12. Green live dot (7 px with a 3 px
`green` soft halo), mono time in `ink` 600, "Office open" in `ink-2`, a chevron. Click
opens a menu: **Office schedule** (opens Michael's Office schedule tab), **Closing time**
(starts the closing time flow). Office hours are not a setting in the app (packs carry
`officeHours`, but nothing reads it), so the pill never shows a closing time; the reference
screens' "closes 6:00 PM" is sample copy (§17).

### 7.4 Version chip (UpdateBadge, CliUpdateBadge)

Mono 11 px, `card` fill, `line` border, `r-sm`, a 6 px dot: `blue` when current, `green`
with "Update ready" when a download is ready, `amber` with "Team upgrade ready" for a
Claude Code update. Click behaves as today's badges.

### 7.5 Needs you button

Pill, `coral-strong` fill, white `t-ui` 600 text, `shadow-coral`, padding 6 × 7 × 6 × 14.
A 7 px white dot that pulses (§11) and a white count bubble (mono 12 px 600, `coral-strong`
text). With zero waiting it becomes a quiet pill: `card` fill, `line` border, `ink-3`
text "Nothing needs you", no dot. Click shows the Needs you board in the right column.

### 7.6 Right column

Three states, one region:

1. **Needs you board** (default). Heading "Needs you" (`t-panel`), a count bubble, an
   info icon. Cards stack newest first (§7.8, §7.9) with 12 px gaps, straight on the
   stage (the column has no ground of its own, §5.2).
2. **Person panel** when a pod is selected (§7.10 to §7.12).
3. **Michael's panel** when Michael's pod is selected (§7.12).

In states 2 and 3 a compact coral strip sits at the top: "Needs you N" with a chevron,
`coral` soft fill, `coral` text, `r-lg`. It returns to the board. With nothing waiting
the strip is hidden.

A "Bring back last session's team" banner (restore all, dismiss one; today's restore
team control) sits at the top of the board when there is a team to restore.

### 7.7 Buttons

| Kind | Fill | Text | Border | Use |
|---|---|---|---|---|
| Primary | `ink` | white | none | The main action in a card or dialog ("Reply", "Approve", "Save", "Send") |
| Secondary | `card` | `ink` | 1 px `line-2` | Other actions ("Decline", "Open Mailboxes", "Hire", "Edit") |
| Quiet | none | `ink-2` | none | Tertiary links in a row ("Earlier answers", "change") |
| Coral | `coral-strong` | white | none | Only the Needs you button. Never a general CTA |

Height 28 px in cards, 32 px in bars, 36 px in the composer and dialogs. `t-meta` 600 at
28, `t-ui` 600 above. Radius `r-md`. Focus per §12. Disabled: 45% opacity, no shadow.

### 7.8 Ask me card (AskMeTab)

The owner's only inbox. Michael raises a card only when he could not re-delegate or
unblock the work himself.

Owner, 2026-09-30: a plain card, and a board you can scan. No side rule, no "From Michael"
(only he raises these), no "saved to memory" note (the answer is still saved to the
person's memory and routed to whoever asked), no underlined titles. The cards sit straight
on the stage, 12 px apart, each with a `line` ring and a soft two layer shadow so it
stands on its own.

- Folded (every card but one): the task title (`t-ui` 600 at 13, `ink`, `indigo` on hover),
  the person it is for as a 22 px chip in their department colors, how long ago Michael
  asked ("just now", "5h ago"), a "Draft" tag if an answer is half written, and the ask
  itself in at most two lines (`askHeadline`: his bold first sentence, as plain text, in
  `ink-2`). The whole header is one target; Enter and Space open it. On the right, a 14 px
  chevron (`ink-3`, darker on hover) that points down while folded and turns up when the
  card opens. There is no dismiss (owner, 2026-10-01): an ask is cleared only by answering
  it, including "done" when the owner handled it.
- Open (one at a time; the newest until the owner picks another, `line-2` ring and
  `shadow-md`): the same header, then Michael's full question as markdown at 12.5 / 18 in
  `ink`; one row with the answer (one line, growing to three; placeholder "Your answer, or
  done if you handled it") and a primary "Reply"; "Holding up N tasks" folded under it; and
  a footer with "See full context" (the ask's full background and history; owner,
  2026-10-01: it is context, not a task) and "N earlier answers". Cmd or Ctrl+Enter sends; Enter
  respects IME composition.
- "Holding up N tasks", when tasks wait on the answer, opens to their titles in `ink-2`
  (a status dot each, up to 6, then "+N more").
- Optional secondary actions Michael attached (for a broken mailbox: "Open Mailboxes").

### 7.9 Schedule request card (ScheduleRequestCards)

Same card frame as §7.8. Title row plain (not a link): the requester avatar plus "Dwight
asks to change a schedule". A definition list with uppercase micro labels (`t-micro`,
`ink-3`, 64 px column): ADD / CHANGE / PAUSE / DELETE, WHY, MICHAEL (his note). Actions
right aligned: secondary "Decline", primary "Approve". When the request is stale, Approve
is disabled and a `t-meta` line explains it. This is the only card type with Approve and
Decline.

### 7.10 Person panel header

- 44 px avatar (department `l` fill, `acc` letter, 700), name `t-panel`, role `t-meta`
  `ink-3`, status pill (§7.13), caption with a dot (`t-meta`, `ink-2`).
- Right: "Edit" secondary button with a pencil (opens EditAgentModal), close `x` (secondary,
  32 × 32).
- Private note row: `amber` soft fill, `r-md`, note icon, "Note:" 600 plus the first line,
  pencil to edit.
- The cleared conversation banner (ClearedBanner) sits under the note when present.

### 7.11 Panel tabs (SidebarTabs)

Underline tabs: `t-ui` 500 `ink-3`, active `ink` 600 with a 2 px `ink` underline, 16 px
gaps, a 1 px `line` rule under the row. Arrow keys, Home and End move focus; RTL mirrors.

- Person: **Profile, Access, Messages, Memory, Work**. Traces, Git and IDE stay behind
  their build flags and append after Work when on.
- Michael: **Profile, Access, Work, Office schedule, Memory, Advanced**, plus **History**
  after Office schedule only once a webhook exists. Ask me is not a tab; it is the board.
- The chosen tab is shared across people, as today.

### 7.12 Tab contents

**Access** (CapabilitiesTab). Grouped rows in cards (`card`, `line`, `r-xl`). Only what is
enforced today:

| Group | Controls |
|---|---|
| Email | Switch. When on: Mailbox select (mono value), Sending segmented control [Draft only, Can send] |
| QuickBooks | Shown only when QuickBooks is on in Settings. Switch; when on, segmented [Read only, Can make changes]. When off, one `ink-3` line |
| Files | Read only row: lock icon, "Own folder only", the folder name, "Open folder" link |
| On a schedule | "+ Add" link. Rows: switch, job name (`t-ui` 600), when line (mono 11, `ink-2`), provenance ("added by Michael, approved by you") in `t-meta` `ink-3` |

The group list is data driven: a new enforced capability adds a group. Nothing appears
before it is enforced (§2.4).

**Work** (terminal). A row: eye icon plus "Watching" and a live dot; zoom (minus, 100%,
plus) as a segmented group ("Focus" only when focus mode is on, `SHOW_FOCUS_MODE`). Then the terminal pane: `#1B1A28` fill in
both themes, `r-lg`, JetBrains Mono 12 px, padding 14. Locked input line at the bottom:
lock icon plus "Locked while Michael runs Kelly. Talk 1:1 to type." Under the pane:
secondary "Message Michael about Kelly", primary "Talk 1:1", hint "Michael sends Kelly no
work during a 1:1". In a 1:1 the input unlocks and the message queue composer (attach,
queue, send now) replaces the two buttons, with "End 1:1".

**Office schedule** (Michael, read only). No office hours line: office hours are not a
setting (§7.3). Groups by person: avatar plus name, "Edit on Access" link with a chevron. Rows:
job name, mono when line, right aligned "next" label (`t-micro`) over a mono time. Paused
jobs show a muted switch and "Paused".

**Profile, Messages, Memory, Advanced** keep today's content (§17 lists them for
restyle): Profile's does and asks first lists, key facts and Open folder; Messages'
day grouped threads; Memory's notes by kind, procedures and search; Advanced's monitor,
dispatch, model and engine, archived list and activity log.

### 7.13 Status pill

`t-micro` 600, padding 2 × 7, `r-pill`, a 5 px dot in `currentColor` before the word.
Colors per §3.5.

### 7.14 Pod label card

The card floating by each pod on the stage.

- `r-xl`, padding 12 × 10 × 0 × 9, `card` at 96%, `line` border, `shadow-md`.
- Department tab on the top edge, offset −9 px: uppercase `t-micro` in a `card` chip with
  a `line-2` border and `r-sm`. Beside it: the sticky count (§7.16) and the for you badge
  (§7.15).
- Row: 24 px avatar, name (12.5 → `t-ui` 600), role (`t-micro` 400 `ink-3`, not
  uppercase), status pill top right.
- Caption: `t-meta`, `ink-2`, one line, ellipsis. The live action, else the first words of
  the last prompt, else the next scheduled job.
- A second person in the same pod: a dashed `line-2` divider, then the same row and
  caption. Up to four people per card (§8.9).
- Idle: card at 86%, name and caption in `ink-3`.
- Selected: `ink` border plus `ring-select`. Everything else on the stage dims to 45%.
- Click selects the person. Tab and arrow keys move between cards (§12).
- Height: 66 px for one person, 78 px more for each other person (`CARD_ROW_H`). A card
  above its pod keeps its size while the stage scales, so on a short window the stage moves
  down, or shrinks, until that card's tab clears the top edge by 18 px.

### 7.14a Quiet pod chip

A pod where nobody is at work (every member idle or waiting) shows a chip on the pod
instead of its label card, so an idle office stays calm (owner, 2026-09-30).

- A 28 px pill: `card` at 92% with a 6 px blur, `line` ring, `shadow-sm`; the members'
  20 px avatars overlapping by 6 px, their names in `t-meta` 600 `ink-2`, and the For you
  badge (§7.15) when anything waits on the owner.
- Sits just above the pod (below it for the right and front slots); no stem.
- The full card (§7.14) shows while anyone in the pod is thinking, working, blocked,
  compacting or looping, while a member is selected, and while the pointer is on the
  chip or the card. Clicking the chip opens the first member's panel.
- An idle line belongs to the chip: its speech bubble's tail points at the speaker's
  avatar there (§8.8).
- Demo mode (`quietCards`, the studio lab only, §8.13): every pod shows its chip even
  while people work; a card opens on hover or for a moment when the lab spotlights someone.

### 7.15 For you badge

Pill, `coral` soft fill, 1 px `#FFC7C9` border (dark: `coral` at 35%), `coral` text
`#C8303A` (dark `#FF8C90`), `t-micro` 600, a 5 px `coral` dot, "1 for you". Shown only
when an Ask me card is tagged to this person.

### 7.16 Sticky count

17 px square, `#FFE58A` fill, `#6B5200` mono 10 px 600 text (5.9:1), rotated −5°, corner
radius 2 2 6 2, `shadow-sm` tinted amber. Count of tasks this person is doing. Click opens
the first task.

### 7.17 Michael's name plate and hub card

Michael's numbers live on his glass walls (§8.4; owner, 2026-09-30: a card always on screen
was a distraction). There is no chip: the name plate on his glass is the way in. Hovering
or focusing it opens the full hub card just under the plate and lights the plate's rim in
`indigo`; a click selects him, which keeps the card open.

The hub card: 196 px wide, `r-2xl`, `shadow-hub`.

- Top: 26 px ink avatar "M", name, "Office Manager", status pill, caption.
- Stats strip (`card-2`): three columns, mono 16 px 600 numbers: **delegated** (today's
  hive messages from Michael with act `request`), **to you** (open Ask me cards), **kept**
  (tasks assigned to Michael himself). Labels `t-micro` 400 `ink-3`. "to you" in `coral`
  text when above zero.
- Task board strip: To do, Doing, Blocked, Done with 6 px square keys (`ink-4`, `blue`,
  `coral`, `green`) and mono counts. Click opens Tasks.
- Context meter: label, 5 px bar with the indigo gradient (§3.8), mono percent.

### 7.18 Mailbox tag

Beside each mailbox post on the stage. 36 px tall, `card`, `line` border, `r-lg`,
`shadow-md`, a 2.5 px top rule in the owner's department `acc`. Mono address (11 px 600)
over the owner's name (`t-micro` 400 `ink-3`). Broken mailbox: coral soft fill, `#FFC7C9`
border, coral top rule, a second line "Password stopped working" in `coral` text 600, and
a small "Fix" coral pill that opens Settings, Connections, Mailboxes.

### 7.19 Bottom bar

- **Talk to Michael composer** (MessageQueueComposer for Michael; owner, 2026-09-30: "Brief
  Michael" was unclear): 400 px, 50 px tall,
  `card`, `line-2` border, `r-2xl`, `shadow-lg`. Attach button (34 × 34, `neutral-soft`,
  `r-md`), input with placeholder "Talk to Michael…", primary button "Send" with
  an arrow. Queued messages show as a count chip on the composer; the full queue opens
  above it.
- **Next job chip**: calendar icon, "Next:" `ink-2`, mono time 600, job and person.
  `card`, `line`, `r-lg`, 40 px tall. Click opens Office schedule.
- **Pack and Hire**, pushed right: "Team from the Pro Services pack" `t-meta` `ink-3`, then
  secondary "Hire" with a plus (opens the hire wizard).

### 7.20 Tasks view (TasksKanban)

- Header on the stage: "Tasks" `t-view`, count chips (To do, Doing, Blocked in coral soft,
  Done in green soft), right aligned lock icon plus "New work goes through Michael"
  (`t-meta`, `ink-3`). No add button; the board is read only.
- Four columns on a `floor` tinted ground, `r-xl`, 16 px gaps. Column head: key dot, name
  `t-ui` 600, mono count. Blocked column tinted `coral` soft.
- Task card: `card`, `line`, `r-lg`, padding 12. Mono id (`#112`, `ink-3`), title `t-ui` 600
  up to 2 lines, assignee avatar plus name. Waiting on the owner: a 18 px coral "?"
  circle top right. Done: a small green check, text in `ink-2`. Hover shows the dismiss
  `x`. Done shows the last 5 and "N more".

### 7.21 Task detail (TaskDetailOverlay)

Centered overlay over the stage (never over the right column), 528 px wide, `r-2xl`,
`shadow-lg`, backdrop per §6.1.

- Header: mono id chip, title `t-panel`, close `x`.
- Four fields in a row with uppercase micro labels: STATUS (select, `coral` text when
  Blocked), ASSIGNEE (person chip), PRIORITY (5 dots, filled `ink`), CREATED (mono).
- DESCRIPTION (markdown, `dir=auto`), QUESTIONS (the Q and A trail; an open question sits
  in a coral soft box with a "Waiting for you" pill; answered ones are plain), DEPENDENCIES
  (rows with a link icon, mono id, title, "waits on this").
- Footer: secondary "Assign" with the hint "Sends it to Michael to hand out"; secondary
  "Close" with an `Esc` key hint. Esc closes.

### 7.22 Who talks to whom (MemoryGraphPanel)

- Canvas on the stage: `floor` tinted, `r-2xl`, a 24 × 18 px dot grid at 55%.
- Toolbar card top left: title `t-panel`, "Last 200 messages" `t-meta` `ink-3`, a Topics
  switch, a Refresh icon button.
- Person nodes: avatar circles (Michael 72 px, others 48 px) with a 3 px department `acc`
  ring and the name under them. A pinned node shows a small pin badge.
- Topic nodes: `card` pills with a `line-2` border and a 6 px `ink-4` dot.
- Edges behind nodes: `ink-4` at 40% to 70%, 1 to 6 px wide by message count.
- Hovering an edge: the edge turns `violet` 3 px with a handle dot; non neighbors dim to
  30%; a tooltip card (`r-lg`, `shadow-lg`) shows both avatars, "Dwight and Oscar",
  "6 messages today" in `violet` text, and "Last: ..." with a mono time.
- Hovering a node shows its memory snippet instead (one card at a time). Drag pins a node.
  Click a person opens their Memory tab.
- Legend card bottom left: Person, Topic, Messages, and an info icon.
- Nodes stay clear of both cards: the layout keeps 44 px from every edge, plus 52 px under
  the toolbar and 56 px above the legend.

### 7.23 Menus, tooltips, info tips, toasts, dialogs

- Menus and popovers: `card`, `line`, `r-lg`, `shadow-lg`, 6 px padding, rows 32 px.
- Info tip: a 15 px circle, 1 px `ink-4` ring, "i" in `ink-3`. Hover or focus shows a
  tooltip: `ink` fill, white `t-meta`, `r-md`, max 260 px. (Dark: `#ECEAF4` fill, `#14131C`
  text.)
- Toasts (completion, update, Claude Code update): bottom right above the bottom bar,
  `card`, `line`, `r-xl`, `shadow-lg`, 360 px max, up to 4 stacked. Auto dismiss per today.
- Closing time is not a dialog (owner, 2026-09-30): quitting with people at work starts it
  at once, and a closing bar takes the bottom bar's place: `card`, `r-xl`, `shadow-lg`, the
  moon mark, "Closing time" and the counter strip ("5 / 8 workers confirmed"), a progress
  line, "3 still working" opening the rows (Remind, Close without them), "Cancel and go back
  to work", and "Force quit now", which asks once because unsaved work is lost.
- Dialogs (Settings, hire wizard, edit person, add mailbox; `shell/Dialog.tsx`): `card`,
  `r-2xl`, `shadow-lg`, title row with a close, an optional footer for the actions,
  backdrop per §6.1 (a drag that ends past the edge never closes it), `role=dialog`, focus
  trapped and restored, Esc closes only the top dialog and never from inside a field.
  Office folder missing is a launch screen, not a dialog: the lockup over one card.

### 7.24 Empty and starting states

- **Starting**: the office opens dark and the lights come up as people clock in (§8.12).
  Before any team member exists, a small card over the studio says Michael is clocking in,
  with a slow `indigo` pulse.
- **No team yet**: the platform with Michael's pod only, a centered card "Your office is
  empty" and a primary "Hire" button.
- **Needs you empty**: a small illustration of Michael's pod and "Nothing needs you right
  now." with one line of Office humor allowed here.
- **Office folder missing** and **GPU or render failure** keep their dedicated screens,
  restyled.

### 7.25 Onboarding (OnboardingWizard)

Full window, no app chrome.

- Header: lockup left; step indicator center: seven labelled steps (Business, Details,
  Meet, Team, Home, Manager, Permissions) in a `card` pill container, each a 22 px circle
  (done: `green` with a check; current: `ink` with the number; next: `line-2` ring with the
  number) joined by 1 px `line-2` rules; "Step 4 of 7" right, `t-meta`.
- Body: a 560 px left card with the step's fields; the right side is the studio (§8)
  reacting to the step.
- **Team step**: heading "Your team" with an info icon, one line "Suggested for Pro
  Services. You can hire more later." Rows: checkbox, 36 px avatar, name 600, role `ink-3`,
  tags ("in every pack" green soft; "always on" indigo soft for Michael, who has a lock and
  no checkbox), connection chips ("needs: Email" with an indigo dot on `card-2`, "optional:
  Calendar" with a dashed `line-2` border, "nothing to connect" `ink-3`), and a mono
  "Works in Harbor & Pine/Finance" line with a "change" link. Unchecked rows at 55%.
  Footer: "N picked, M to connect" and Back (secondary), Next (primary). The footer sticks
  to the window's bottom edge, so Next stays in reach on a long step.
- The studio on the right fills with a pod per picked person around Michael's glass pod,
  each with a small name tag and a check on its screen; an unpicked department shows as a
  dashed outline with a "Name, not picked" tag on its back corner, clear of the pods in
  front of it.

### 7.26 Settings and the hire wizard

Keep every section, control and save rule from v1 (see the functional map in
`docs/designs/studio-home.md`), restyled with §7.7 buttons, §7.12 row groups and §7.23
dialogs. The hire wizard's steps are numbered circles (done `green` with a check, current
`ink`), its character tiles and job rows use the `indigo` soft selection, and its strings
are sentence case. Closing time is the closing bar (§7.23), not a dialog.

---

## 8. The studio illustration [Both]

The studio is both the app's Office view and the website's hero. One construction, two
uses: live in the app, a curated still or light loop on the web.

### 8.1 Projection

Isometric, 2:1. With grid unit `S` (50 px at a 1060 × 816 stage) and origin `(cx, cy)`:

```
P(gx, gy, z) = ( cx + (gx - gy) * S,  cy + (gx + gy) * S / 2 - z )
```

Every shape is built from boxes (top, left and right faces) and ellipses on this grid.
Faces: top = lightest, left = `m`, right = `d` of the object's family. A 1 px white rim
at 75% (dark: 13%) runs along the top front edges. Strokes match fills; no outlines.

### 8.2 Platform

A raised floor slab in `floor` tones: top `#F1EFFB` to `#E4E1F5` (dark `#302B49` to
`#26223B`), left `#D7D3EF`, right `#C6C0E6`, a white grid at 70% (dark 5%), a soft
`#8A82C9` shadow at 22% beneath (dark black at 55%). The stage ground carries the radial
light (§3.8) and a faint dot grid masked to the edges.

### 8.3 Pods

A department pod is a desk block, a monitor on a stand, a chair, a keyboard, and a small
plant or mug, all in the department family (§3.4) on a paper pad slab. A pod holds one to
four desks (§8.9). The monitor screen is the status surface:

- Lit: `l` fill with a soft inner light and a floor glow ellipse in `acc` at 42% core,
  14% edge (dark 62% and 22%).
- Off: `#5E5A74` (dark `#23212F`).

### 8.4 Michael's glass pod

A raised platform with a glass box (back wall white at 78%, front at 42%; dark: indigo
tinted at 20% and 10%), two monitors, a ring on the floor in `indigo`, and a name plate on
the front glass just right of his door, sized to the glass: a 12 px tall ink plate, his name
in white Sora 600 at 8 px (shortened with an ellipsis past 12 letters), and a status light
that glows green while he works; it always ends before the glass's corner (owner,
2026-09-30: an "M" badge said nothing; a door plate says whose office it is). It sits at the center of the platform. The glass is taller
than a desk (72) so his walls carry his numbers:

- Left wall: the task board. To do, Doing, Blocked, Done read left to right, each column's
  count in mono inside the board's top (never on its edge) in the column color, up to four
  stickies under it. Stickies pop
  on; Doing breathes; his marker writes under the columns while he works.
- Right wall, above the monitors: a lit sign (ink, indigo rim) with three mono numbers and
  glyphs: handed out today, waiting on you (coral when above zero), kept; his context gauge
  along its bottom (indigo, amber at 65%, coral at 85%). Numbers tick when they change.
- The clock (real time, rings for scheduled jobs) at the front end of the left wall, with
  clear space between it and the board.

### 8.5 States on the stage

As §3.5. In addition:

- **Selection**: a dashed `ink` ellipse (6 4 dash) on the floor around the selected pod;
  everything else at 45% opacity.
- **Needs you beacon**: a coral sphere on a thin pole above the pod with a ring that scales
  from .6 to 1.5 and fades, every 1.8 s. Only for status `blocked` on the owner.
- **Thinking**: a white bubble with three `violet` dots over the monitor.
- **Idle**: the pod desaturated; screen off.

### 8.6 Paths and tokens

- No standing paths (owner, 2026-09-30: permanent lines made the office look busy). A path
  is drawn only while something moves along it: a token's own faint trail as it flies,
  Michael's wire to a pod for 3.2 s when someone there starts working, a mailbox's wire
  while mail moves, and a conversation arc while two people talk (§8.12). A broken mailbox
  shows its warning on the post and its tag, not a line.
- Tokens are small isometric cards or glyph circles in the act color (§3.3), white ring,
  traveling along paths, 2.2 s each with ease in out. At most 16 in flight; past that the
  oldest leave first.
- Flow rules, which mirror the product: each mailbox post feeds the person who watches it
  (a team member reads its own mailbox; mail does not pass through Michael); Michael feeds everyone; teammates exchange `query` tokens directly;
  a teammate who is stuck sends a `query` to Michael; only Michael sends `act-you` tokens,
  which leave the stage toward the right column.
- A `done` message travels as a green check token; a task reaching Done bursts a check over
  its owner's pod and pops a sticky onto Michael's board (§8.12).

### 8.7 Mailbox posts

Small isometric posts at the platform's front left edge, one per mailbox, in white and
lavender with a slot and a flag, each with a mailbox tag (§7.18). A broken mailbox's post
is coral tinted with a blinking red "!" above it (there is no path to carry it, §8.6).

### 8.8 Idle quote bubble

One at a time, from someone in a quiet pod (owner, 2026-09-30: the first version was easy to
miss, and a bubble floating apart from the person's tag looked wrong). The bubble belongs to
the pod chip (§7.14a): a `card` speech bubble, max 250 px, ring and tail in the speaker's
department color, the line in quotes at 12.5 / 17 `ink`, with the speaker's name on top only
when the chip holds more than one person. Its tail points at the speaker's avatar on the
chip, which gets a 3 px ring in the same color and a small hop. It opens up from the chip,
or up and leftward, or down under it, whichever first covers no open card or Michael's.
It pops in from the tail, holds, and fades. Lines come from the in-character list
(`cafeteriaLines.ts`). The first comes 8 to 15 s after the office opens, then every 25 to
50 s, visible 8 s. Never from a pod with someone at work, and never from someone still
clocking in.

### 8.9 Scaling rule

- Departments, not seats. Each department has one pod holding up to 4 desks (1: single
  desk; 2: side by side; 3 and 4: a 2 × 2 cluster). A fifth person in a department opens a
  second pod for it.
- Up to 7 department pods sit on a ring around Michael's pod, each department in the same
  slot every day (front desk, marketing, support, sales, finance, IT, people; operations
  and team take any free slot).
- More pods than slots, or more than 28 people, switches the Office view to a compact grid
  of label cards grouped by department, with the same states and badges.
- A department is read from the job card a person was hired with, then their character's
  usual job, then the start of their role line; anything else sits in the team pod.
- One person (Michael only): the platform with the glass pod alone.

### 8.10 Themes and direction

- Dark mode: every face value has a dark twin (§3.4 derivation, platform per §8.2).
- RTL: the art never mirrors (it is a picture of a room). Labels keep their positions.
- Reduced motion: §11.3.

### 8.11 Web use [Web]

- Hero: a curated still of the studio at hero size (the reference home screen's stage,
  without the Needs you column), exported as SVG. Optional light loop: record the studio lab
  (§8.13, `?clean&autoplay`). No live data.
- Feature vignettes: crop to one idea: the mailbox posts feeding pods (mailboxes), the
  onboarding studio filling (packs), one pod with its Access card (limits), Michael's pod
  sending a token to a Needs you card (Ask me).
- Screenshots of the app go in a macOS window frame: `r-2xl`, `shadow-lg`, the title bar
  with traffic lights.

### 8.12 Life on the stage

The office moves when the work moves (owner, 2026-09-30: the first build felt static).
Every effect starts from a real event or state; nothing is decorative noise.
`scene/studio/life.tsx` holds the event layer.

| Trigger (real) | What moves |
|---|---|
| Hive message between people | The token travels its wire with a bright trail, a puff where it leaves and a ping where it lands (2.2 s, eased) |
| Message from the scheduler (a scheduled run) | The clock on Michael's left wall (real time) rings, then an amber clock token travels to the pod; the job's name shows in front of the pod for 4.5 s |
| Mail tool call (`md-mail` search or read, draft or send) | The watcher's mailbox hops and raises its flag, its wire flows, and an envelope travels in (read) or out (draft, send) |
| Any other tool call | A 26 px glyph rises off the desk: web, terminal, file, search, books, or a spark (one per person per 1.4 s) |
| A task reaches Done | A green check bursts over its owner's pod; a new sticky pops onto Michael's board |
| Counts change | Michael's numbers tick up into place |
| Someone starts working | Michael's wire to the pod appears, flows toward it and fades (3.2 s) |
| Someone working | Their screen scrolls, their mug steams |
| Michael working | His screens scroll, his marker writes on the board, his name plate's light glows; Doing stickies breathe |
| Thinking | The three dots bounce in turn |
| Always | Plants sway slightly (5.5 s) |
| Michael hands work out (`request` from Michael) | He points first: a soft beam from his office lights the pod's floor, then the envelope leaves |
| A question for the owner (a message to the owner, or a new Needs you item) | A paper plane flies from Michael's office toward Needs you, and the Needs you button bumps as it lands |
| Two people message back and forth | A dashed violet arc joins their pods with a count bubble; it fades a minute after their last message |
| The owner messages Michael (from `human`) | The envelope rises from the composer under the stage |
| A new team member appears on the roster after launch | Their pod drops in, confetti in the department colors, and "Welcome, Jim" in front of the pod |
| The office opens (each person's action is the clocking in marker) | Every light starts off. Michael's office comes on when he is in, a pod's when the first of its people is in, each desk when its person is; a light that comes on flickers like a strip light. A desk stays dark at most one minute, so a quiet engine never leaves it off |
| Closing time (`onClosingTime`) | Each pod's lights go out as everyone in it confirms or is excused; Michael's office goes dark when it completes; cancelling turns them back on |
| Local time | Morning sun from the left (6 to 10), plain daylight, a golden evening (16 to 19), and a darker night (19 to 6) where working desks and Michael keep warm lamps on |

All of it pauses with the stage (§11.2). With reduced motion the loops stop and a token
appears at its destination for one second.

### 8.13 Studio lab [Both]

`tools/studio-lab` (owner, 2026-10-01): the real studio on a fictional office (Harbor &
Pine), with a button for every effect in §8.12, each firing the event the app listens to.
`npm run lab` writes `docs/demo/studio-lab.html`, one self-contained file (script, styles,
fonts, images inlined) for demos, screenshots and videos. Its sibling page
`reference.tsx` composes the app's shell for the reference screens (§20).

- Every pod shows its chip (`quietCards`); a card opens on hover, or for a moment when a
  button involves someone (`cth:demo-spotlight`), one at a time.
- "Autoplay the day": the office closed (every light off from the first frame), the
  opening, then everyday events in random order every 2.6 s, never the same twice running.
- H hides the controls. URL: `#dark`, `?hour=22`, `?play=<label>`, `?autoplay`, `?clean`.
- A test keeps it building, self-contained, and free of any real office's data.

---

## 9. Web components [Web]

### 9.1 Nav

72 px, `bg` at 85% with a 1 px `line` rule on scroll. Lockup left; four links center
right (`w-small` 500, `ink-2`, active `ink`); "Download for Mac" primary button (ink).
Phone: lockup plus a menu button; the sheet lists the links and the button.

### 9.2 Buttons

Primary `ink` fill, white `w-small` 600 text, 44 px tall, `r-md`, padding 0 × 20.
Secondary `card` with `line-2`. Never coral (§3.2).

### 9.3 Hero

Eyebrow (mono, `ink-3`), `w-display` headline, `w-lead` subline in `ink-2`, primary and
secondary buttons, then the studio (§8.11). The radial light sits behind the studio.

### 9.4 Feature rows

Alternating text and vignette, 96 px apart. Title `w-h3` or `w-h2`, one or two short
paragraphs, an optional mono eyebrow. Vignettes sit on `card` with `r-2xl` and
`shadow-md`, or bleed without a card when they are studio art.

### 9.5 Cards, chips, pills

Same as the app (§6, §7.13): `card`, `line`, `r-xl`, `shadow-md`.

### 9.6 Footer

`chrome` ground, lockup, link columns (`w-small`), Discord, GitHub, FAQ, legal line.

### 9.7 Social card

1200 × 630, `bg` ground, lockup at left top, `w-h2` headline in `ink`, a line in
`ink-2`, and the studio crop on the right. Generated by `source/build.py` (§14).

---

## 10. Iconography [Both]

- Outline icons, 1.75 px stroke at 16 px (1.5 at 14, 2 at 20), round caps and joins,
  `currentColor`. The Lucide set (ISC license) is the reference style; custom icons match
  it.
- Sizes: 14 (inline in meta), 16 (buttons, rows), 18 (top bar), 20 (empty states).
- Every icon only button has an `aria-label` and a tooltip.
- `components/Icon.tsx` draws these outline icons; the v1 pixel set is retired (§17, row 6).

---

## 11. Motion

### 11.1 Tokens [Both]

| Token | Value | Use |
|---|---|---|
| `dur-fast` | 120 ms | Hover, press |
| `dur-base` | 200 ms | Panel swaps, menus, tab underline |
| `dur-slow` | 320 ms | Overlays, the right column changing state |
| `ease` | `cubic-bezier(.2,.7,.2,1)` | Everything that moves in or out |
| `pulse` | 1.6 s, opacity 1 to .35 | The Needs you dot, the live dot |
| `breathe` | 2.4 s, opacity 1 to .55 | Lit screens while working |
| `ring` | 1.8 s, scale .6 to 1.5, fade out | Needs you beacon |
| `burst` | 900 ms | Done check burst |

### 11.2 App [App]

Motion carries information or it doesn't happen: token travel, beacons, screens breathing,
the check burst, the quote bubble fade, and the rest of the stage's life (§8.12). UI chrome does not move on its own. The stage
pauses all animation when the window is hidden, in focus mode, or when another view is
showing (as today's floor does).

### 11.3 Reduced motion [Both]

With `prefers-reduced-motion: reduce`: no token travel (a token appears at its
destination for 1 s), no pulses or rings (static dot and static beacon), no breathing, no
quote bubbles, instant panel swaps. The web hero shows the still.

---

## 12. Accessibility [Both]

- Contrast: text 4.5:1 or better on every surface it can appear on; 3:1 for text 18.66 px
  bold and up; 3:1 for control boundaries (`line-input`) and focus indicators. The values in
  §3 are measured; keep them measured. Decorative lines (`line`, `line-2`) are not control
  boundaries.
- Focus: 2 px `indigo` (`#6C5CE7`, 4.9:1 on `card`) outline with 2 px offset on every
  interactive element, including pod label cards and graph nodes. Web: 3 px, 3 px offset.
- Keyboard: Tab reaches everything. On the stage, Tab enters the pods, arrow keys move
  between label cards in reading order, Enter selects, Esc returns focus to the board.
  Every overlay closes on Esc. Enter and Esc respect IME composition (`isComposingKey`).
- Never color alone (§2.3). Pills carry words; badges carry counts and words.
- Touch targets 44 px on the web's phone layout. In the desktop app, 28 px minimum.
- Dialogs: `role=dialog`, `aria-modal`, labelled, focus trapped and restored.
- `dir=auto` on user and agent authored text; bidi isolates around paths and addresses.

---

## 13. Voice and copy [Both]

### 13.1 Shared rules

- Activity captions are office words, never engine words (owner, 2026-09-30). `actionText`
  turns tool calls and engine states into plain phrases on every card, panel header and
  closing time row: Bash is "Running a task on the computer", Read "Reading a file",
  WebSearch "Searching the web", mail tools "Checking email" or "Sending an email", a
  connected app "Working in HubSpot", anything unknown "Working"; "compacting context" is
  "Organizing their notes". The stored action does not change.

- Name the actor. "Oscar is matching September payments", never "the agent is processing".
- Keep system feedback under 12 words. Second person to the owner.
- Fields first; explanations behind an info icon, short.
- No emoji in UI copy.
- Exclamation marks only for completions.
- Real punctuation: "don't", never "dont".
- **No em dashes, en dashes, or hyphens used as dashes in user-facing copy.** Use a period,
  a comma, a colon or parentheses.

### 13.2 App tone

Plain and factual, owner words, not developer words (no "MCP", "PTY", "tokens",
"runtime"). Michael speaks in the first person on his cards ("I can't approve money").
Office humor only where nothing needs doing: idle quotes, empty states, the booting
caption.

| Don't | Do |
|---|---|
| "An error has occurred" | "Oscar hit a snag" |
| "Permission denied" | "Oscar needs your OK" |
| "Task blocked on human input" | "Waiting for you" |
| "Loading..." | "One sec..." |

### 13.3 Web tone

Dry and confident. The joke is on Michael, never the customer. Headlines are sentence case
statements that land on one line when they can. Claims stay honest: a download button only
points at a real release.

---

## 14. Token files

| Surface | File | Holds |
|---|---|---|
| Kit | `branding/colors/colors.{css,json}`, `dont-be-michael.ase`, `palette.png` | Every §3 token, light and dark, generated by `source/build.py`. Do not hand edit |
| App | `src/renderer/src/design/tokens.css` | `--cth-*` custom properties with the same names after the prefix as the kit (`--cth-ink-3` = kit `--dbm-ink-3`); light in `:root`, dark under `:root[data-cth-theme='dark']` |
| App | `src/renderer/src/design/tokens.ts` | TS mirror for the SVG stage and inline styles. Changes with `tokens.css` in the same commit |
| Web | `public/assets/site.css` `:root` | `--dbm-*` copied from the kit's `colors.css` (light values only) |

Rules:

- Change §3 here, then `source/build.py`, then run it; then the app and site files.
- A token that exists on one surface only says so in a comment.
- **[Web]** Any edit to `site.css` bumps the `?v=` query in `index.html` and `404.html`.

---

## 15. Themes

- **[App]** Light and dark, one token swap. The terminal follows the switch as today.
  Dark is lifted: the ground is `#14131C`, never `#000`; text is `#ECEAF4`, never `#FFF`.
- **[App]** The TV show office themes (`OfficeThemePicker`) are retired with the floor.
- **[Web]** Light only. The brand's first impression is the light studio.

---

## 16. Making changes

1. Decide at the right level. If it changes what a color, face or shape *means*, it is a
   brand change (§1 to §4, §8) and is decided for both surfaces at once.
2. Edit this file, then `source/build.py` and the token files, then components.
3. Before merging a visual change, check the app at 1280 × 800 and 1440 × 900 in both
   themes and in Arabic, and the web at the §5.3 widths.
4. Record deliberate deviations in §17 with a reason, or remove them.
5. Add a line to §18.

---

## 17. Migration and debt register

v2 is adopted in the spec, the kit and the app (phases 1 to 6, the studio life work and the
Needs you rework on `design/studio-v2`, through 2026-10-01). Each row is **Fix**
(the spec wins), **Accepted** (with a reason) or **Done**.

| # | Surface | Gap | Where | Status |
|---|---|---|---|---|
| 1 | App | Pixel office floor (Pixi.js) is the main view | `src/renderer/src/scene/office/` | Done: `scene/studio/`; the Pixi files, tilesets and maps are deleted (only `cast.ts` and `cafeteriaLines.ts` remain, as data) |
| 2 | App | Bottom agent strip and right Command Center layout | `AgentStrip`, `AgentCard`, `CommandCenterPanel`, `App.tsx` | Done: `shell/`; strip and card deleted |
| 3 | App | Pixel primitives and pixel fonts | `PixelPanel`, `PixelButton`, `PixelBadge`, `fonts.css`, `tokens.css` | Done; Press Start 2P removed with the floor |
| 4 | App | Tokens are the v1 cream and ink palette | `design/tokens.css`, `tokens.ts` | Done |
| 5 | App | Ask me is a tab in Michael's panel | `AskMeTab`, `CommandCenterPanel` | Done |
| 6 | App | Pixel icon set | `components/Icon.tsx` | Done: outline icons behind the same component |
| 7 | App | Settings and onboarding dialogs lack `role=dialog`, focus trap and Esc | `SettingsModal`, `OnboardingWizard` | Done: `shell/Dialog.tsx` and `useDialog` for Settings, hire, edit, quit and closing time; Esc reaches only the top dialog |
| 8 | App | Task detail has no Esc handler | `TaskDetailOverlay` | Done |
| 9 | App | Role to department mapping does not exist | `src/shared/officeRoles.ts` | Done: `departmentOf` in `scene/studio/layout.ts` |
| 10 | App | No counters for delegated and kept | hive | Done: counted from the hive log and tasks, shown on Michael's wall sign and hub card |
| 11 | App | UI strings not audited for dashes | `src/renderer/src/i18n` | Done: `test/no-dashes.test.cjs`; ALL CAPS strings moved to sentence case (§4) |
| 12 | App | Reference screens use 9 to 9.5 px text and off-grid spacing | `reference/studio/` | Done: re-shot from the build (#25) |
| 13 | App | Reference screens predate the contrast fixes (`ink-3`, pill text, coral fills) | `reference/studio/` | Done: re-shot from the build (#25) |
| 14 | Kit | Retired fonts still in `fonts/` | `branding/fonts/` | Fix: remove once #3 and #15 are done |
| 15 | Web | Whole site is v1 (arcade palette, pixel type, hard shadows, chunky frames) | site repo `public/` | Fix: §9 |
| 16 | Web | Hero shows the pixel office video | site repo, `docs/media/hero.mp4` here | Fix: §8.11 still |
| 17 | Both | README and screenshots show the pixel floor | `README.md`, `docs/media/`, `docs/screenshots/` | Fix after #1 and #2 |
| 18 | App | Release notes modal paints its own palette | `ReleaseDrop.tsx`, `shared/releaseDrop.ts` | Chrome done; the frame keeps the website tokens until the site moves to v2 (#15) |
| 20 | App | Agent strip removed (phase 2); its per-card functions move with later phases: context gauge, sticky task count and typing dot to the pod label card (§7.14), private note to the person panel header (§7.10), drag to reorder to Michael's Advanced roster | `AgentStrip.tsx` | Done: gauge and task count on the pod card, note in the panel header. Reorder lives in the focus mode roster, which is hidden (#24) |
| 21 | Both | Reference screens show "closes 6:00 PM"; the app has no office hours | `reference/studio/` | Done: re-shot from the build (#25) |
| 19 | App | The title bar imports the kit lockup, so it already shows the v2 Sora wordmark inside the v1 app | `App.tsx` (`@brandkit/logo/lockup`) | Accepted: it is v2 and needs no change; the rest of the top bar follows with #2 |
| 22 | App | `pixi.js` stays in `package.json` though nothing imports it | `package.json` | Fix: remove on the next dependency change (reinstalling reruns electron-rebuild) |
| 23 | Both | README still credits LimeZu art the app no longer ships | `README.md` | Fix with #17 |
| 24 | App | Focus mode is hidden (`SHOW_FOCUS_MODE`), so drag to reorder people has no visible home | `FullscreenTerminal` | Accepted: the order is kept; give reorder a home if it is missed |
| 25 | Both | Reference screens (§20) predate 2026-09-30 and 10-01: cards on every pod, the hub card and M badge, the old Ask me cards, the solid right column, Brief Michael | `reference/studio/`, the brand guide | Done: re-shot 2026-10-01 with `npm run shoot` (§20); brand guide, PDF and social card rebuilt |
| 26 | App | Ask me can no longer be dismissed; older dismissed entries still read as closed | `AskMeTab`, `shared/askMeRouting.ts` | Done (owner, 2026-10-01: an ask is handled with a response) |

---

## 18. Change log

| Date | Change |
|---|---|
| 2026-10-01 | Reference screens re-shot from the app's components (`npm run shoot`, §20); brand guide, PDF and social card rebuilt. Found while shooting: pod cards above their pod no longer run under the top bar on a short window (§7.14); graph nodes stay clear of the toolbar and legend (§7.22); the setup footer sticks to the window and its buttons read Back and Next (§7.25); the not picked tag moves to its outline's back corner. |
| 2026-10-01 | Needs you: no dismiss (an ask is cleared only by answering), "See full context" replaces "Open task", a chevron shows each card opens. Focus mode hidden (`SHOW_FOCUS_MODE`). The studio lab (§8.13) for demos and videos. |
| 2026-09-30 | Studio refinements after the first build: quiet pods show a chip (§7.14a); the office's life (§8.12) with no standing wires (§8.6); lights come up as people clock in and go out at closing time, which is a bar on the floor, not a dialog (§7.23); Michael's numbers on his walls, a name plate on his door that opens his card (§7.17, §8.4); idle quotes belong to the chip (§8.8); captions in office words (§13.1); Ask me cards fold, one open at a time, straight on the stage (§7.8, §5.2); "Talk to Michael" (§7.19); one dialog frame (§7.23); outline icons (§10). |
| 2026-09-30 | **v2 Studio adopted.** Pixel floor, bottom strip, Command Center layout, pixel UI, pixel type and the arcade web palette retired. One token set for app and web (§1.3). Sora and IBM Plex Mono replace Inter, VT323, Press Start 2P and Pixelify Sans. Wordmark in Sora; the Struck M mark kept. Studio illustration system (§8). Contrast corrected against the mockups: `ink-3` `#6C6884`, accent text colors, `coral-strong` for coral fills with text, `line-input` for control boundaries. v1 archived at `archive/DESIGN-v1-pixel.md`. Decisions and the functional map: `docs/designs/studio-home.md`. |
| 2026-09-28 | (v1) Web: Pro offering removed; nav cut to four links plus Download. |
| 2026-09-24 | (v1) One spec for app and web, moved into `branding/` with the brand kit. |

---

## 19. Open decisions

1. **Today timeline** (Day Lanes). Designed as a later view; not in the first v2 release.
2. **Operations and team colors** (§3.4) have no reference screen yet. Confirm when a pack
   with Supply Chain or Quality is shown.
3. **Web hero loop.** Still image first; a loop can be recorded from the studio lab (§8.13).
4. **Settings and hire wizard screens** have no v2 reference screens; they follow the
   components. Design them if the restyle raises questions.

---

## 20. Reference screens

In `reference/studio/` (PNG, 1440 × 900). First approved as mockups 2026-09-30; re-shot
2026-10-01 from the app's own components on the fictional Harbor & Pine office, so they show
the build as it is. `npm run shoot` re-shoots them all (or `npm run shoot -- home-dark` for
one) from `tools/studio-lab/reference.tsx`, with the clock fixed at 10:42 and a seeded
random, so a re-shoot changes only what the app changed. Then
`python3 branding/source/build.py social guide` rebuilds the social card and the brand
guide PDF, which use them. Re-shoot after any visible change to these screens.

| File | Shows |
|---|---|
| `home-light.png` | Office view, Needs you board, light |
| `home-dark.png` | The same, dark |
| `kelly-access.png` | A person selected, Access tab |
| `kelly-work.png` | A person selected, Work tab (her session, Talk 1:1) |
| `michael-office-schedule.png` | Michael selected, Office schedule tab |
| `tasks-detail.png` | Tasks view with a task detail open |
| `who-talks-to-whom.png` | Who talks to whom |
| `onboarding-team.png` | Onboarding step 4, Your team, Pro Services pack |

The original mockups (HTML and generators) live with the design session in
`~/.gstack/projects/agentvivekkumar-dontbemichael/designs/business-first-redesign-20260930/`.
