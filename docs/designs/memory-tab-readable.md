# The Memory tab reads like notes, not a raw file

Status: built (2026-09-25).

## Proposal (owner, 2026-09-25)

"The memory tab contents look raw text. It is useful to take a look, so it will be useful
if it is formatted or styled in a way it is easy to read."

## What exists today (from the code)

- `MemoryTab` in `CommandCenterPanel.tsx` shows, top to bottom: Text search, Semantic
  search, then "Memory file" with an agent picker and the file in a 12px mono `<pre>`.
- The file is the memory index MemoryTidy keeps (`src/main/memoryTidy.ts`), one line per
  entry: `- [m3] reference | text | task | 2026-09-25[ | expires YYYY-MM-DD]`, under a
  heading, an `<!-- memory index v1 -->` marker and a "The app keeps this file" note.
  `parseIndex` in `src/shared/memoryIndex.ts` already turns it into
  `{ id, kind, text, source, date, expires? }`. Lines it can't parse (Michael has a
  hand-written `- LESSON: ...`) are dropped by the parser today.
- Kinds: preference, fact, reference, procedure. Sources: owner, michael, task, tool.
- A procedure entry points to `agents/<id>/memory/procedures/<slug>.md`, a short markdown
  numbered list. Waiting notes sit in `agents/<id>/memory/inbox.md` (`parseInbox`).
- `MarkdownPreview` (`variant="card"`) is the app's safe renderer for agent markdown
  (no rehype-raw).

Mockup (all variants, real data from Michael's memory):
`~/.gstack/projects/agentvivekkumar-dontbemichael/designs/memory-tab-readable-20260925/memory.html`,
variant A, with the D7 change (no boxes).

## Design decisions (all owner, 2026-09-25)

### D1. Read like notes (A)

Parse the index and show each entry as a sentence, grouped by kind. Order, and the
heading for each group (Inter 13/18 semibold, `ink-700`, with a count in `ink-500`):

1. **Your preferences** (preference)
2. **How to** (procedure)
3. **Facts** (fact)
4. **Where things live** (reference)
5. **Other notes**: lines under the marker that are not the heading, the marker, the
   "app keeps this file" note, or a parsed entry (e.g. `- LESSON: ...`), shown as text
   with the leading `- ` removed.

A group with no entries is left out, except that "Your preferences" is never shown empty
(it is simply absent). Entry: text in Inter 14/20 `ink-900`; under it a 13/18 `ink-500`
line saying where it came from and when: "from you", "from {{godName}}", "learned on a
task", "from a tool", then the date in the app locale ("Sep 25"). The `[m3]` id, kind
word and pipes are never shown in this view.

A file without the index marker (an old free-form memory not yet migrated) renders
through `MarkdownPreview` `variant="card"` instead.

### D2. Memory first, one search below (A)

- Header row: "{{name}}'s memory" (Press Start 2P 12/20) and the agent picker on the right;
  under it a 13/18 `ink-500` line: "12 things remembered".
- Then the groups, then (D4) the "Show the file" link.
- Then, after an `ink-100` hairline, "Search the office": one input and one Search button,
  with a two-way switch above it, "Exact words" (the existing text search) and "By
  meaning" (the existing semantic search). Results render as they do today, under the box.
  The switch is a `role="radiogroup"` of two buttons.
- The memory keeps filling the height (the d4ec61b6 behaviour); the tab scrolls as a whole.

### D3. Procedures open to their steps (A)

A procedure row is a button with the procedure name and a ▸/▾ marker
(`aria-expanded`). Opening it reads `memory/procedures/<slug>.md` through a new read-only
IPC and renders it with `MarkdownPreview` `variant="card"`. The IPC takes an agent id and
a procedure slug only, resolves inside `HIVE_ROOT/agents/<id>/memory/procedures/`,
rejects any slug that fails `procedureSlug` round-trip or escapes the folder, and returns
at most `MAX_PROCEDURE_CHARS`. Missing file: "The steps for this aren't saved yet." in
`ink-500`. Loading: "Loading…" in `ink-500`.

### D4. "Show the file" (A)

A quiet 13px `sky` text button under the groups toggles to the raw file in today's mono
block (`Pre fill`), and back ("Show as notes"). Not remembered across agents or restarts.

### D5. Empty memory and waiting notes (A)

- No entries and no other notes: "{{name}} hasn't remembered anything yet." in 14/20
  `ink-700`, and when notes are waiting, a second line: "3 notes are waiting to be sorted
  in. That happens in the background, usually within a day."
- With entries, when notes are waiting, the header's sub-line adds "3 notes waiting to be
  sorted in" (plural-aware, i18next count).
- The count comes from `parseInbox` on `memory/inbox.md`, read through the same confined
  IPC (it returns `{ index, waiting, procedures? }`; `hiveMemory` keeps its shape).

### D6. Expiry (A)

- Future expiry: a lemon-light chip, `lemon` inset hairline, "check again Oct 30".
- Passed expiry (before today in local time): a coral-light chip with `coral` hairline,
  "! may be out of date (Oct 30)". The `!` keeps it from being color only.

### D7. Divided list, no boxes (A)

Per DESIGN.md §7.10: entries sit on the panel background with one `ink-100` hairline
between them, 8px vertical padding; 16px above each group heading, 4px below. No card or
box around a group.

### D8. Accessibility and languages (A)

- Group headings are `<h3>`; each group is a `<ul>`; each entry an `<li>`.
- Procedure rows, "Show the file" and the search switch are real `<button>`s, keyboard
  reachable, with the app's focus ring and `aria-expanded` / `aria-pressed` as fits.
- In an RTL app language, entry text gets `dir="auto"` (the `useRtl` rule used elsewhere).
- Every string in en, zh-CN and ar; `{{godName}}` for Michael; no dashes in copy.

## States

| Feature | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| Memory view | "Loading…" `ink-500` for the first read only; later switches between agents keep the last view until the new one arrives | D5 copy | read failed: "Couldn't read {{name}}'s memory." coral with `!`, plus "Show the file" hidden | grouped notes | unparsed lines under Other notes; free-form file via markdown |
| Procedure steps | "Loading…" | "The steps for this aren't saved yet." | same as empty | markdown steps | truncated at `MAX_PROCEDURE_CHARS` with "…" |
| Search | button shows "…" | "Nothing matched." | existing failure text | results under the box | n/a |

## Journey

| Step | Owner does | Feels | Supported by |
|---|---|---|---|
| 1 | Opens Memory | curious what Michael knows | memory first, count line |
| 2 | Scans groups | oriented | kind headings, "Your preferences" first |
| 3 | Opens "Shutdown protocol" | reassured, sees the actual steps | D3 |
| 4 | Spots a stale price | alerted | D6 coral chip |
| 5 | Something looks off | wants ground truth | D4 "Show the file" |

## Implementation tasks

- [x] **R1 (P1)**: `memoryView(text)` pure helper in `src/shared/memoryIndex.ts`: `{ isIndex, groups, other }` using `parseIndex`, keeping unparsed lines (not the header, marker or note). Tests with Michael's real file shape, a legacy file, an empty index.
- [x] **R2 (P1)**: main IPC `hive:memoryDetail(agentId)` → `{ index, waiting }` and `hive:procedure(agentId, slug)` → text or null, confined to the agent's folder; preload bridge. Tests: traversal rejected, missing file, size cap.
- [x] **R3 (P1)**: `MemoryNotes` component (groups, entry row, chips, procedure disclosure, empty and error states, "Show the file").
- [x] **R4 (P1)**: `MemoryTab` reorder: header with picker, notes, one search with the Exact words / By meaning switch.
- [x] **R5 (P1)**: strings in en, zh-CN, ar; DESIGN.md §7.11 "Memory notes" entry; tests for key parity, godName, no dashes, and the source layout (memory before search).

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Outside Review | ollama (design outside voice) | Independent 2nd opinion | 0 | — | not run |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | clean | score: 2/10 → 9/10, 8 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

Pass scores (before → after): information architecture 2 → 9; states 2 → 9; journey 3 → 9;
AI slop 6 → 9 (app UI, divided list, no card mosaic); design system 5 → 9 (§7.10, tokens
named); responsive and accessibility 3 → 9. Held back from 10: no live render check yet.

- **OUTSIDE COVERAGE:** none run (Ollama only by standing rule; not requested).
- **VERDICT:** DESIGN CLEARED. eng review required.

NO UNRESOLVED DECISIONS
