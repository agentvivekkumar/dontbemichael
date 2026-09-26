# The Messages tab reads like a history

Status: built (2026-09-25).

## Request (owner, 2026-09-25)

"The design is not very good with thick accordions. Try a bit less dense headers or other
ideas. Also that routine 2, routine 3 makes no sense to a business user looking at it."
(Screenshot: Kelly's Messages tab, seven banded "Closing time" accordions.)

## Decisions (owner, 2026-09-25)

Mockup: `~/.gstack/projects/agentvivekkumar-dontbemichael/designs/messages-tab-20260925/messages.html`, "A + B".

- **D1. A mix of a quiet list and a day log.** Conversations grouped under Today, Yesterday,
  then dates (13 px semibold `ink-700` headings), newest first by last activity. Each
  conversation is one light row, no band or box, one `ink-100` hairline between rows:
  "**Dwight asked Pam**: <subject>", then when there is a reply
  "↳ **Pam let Dwight know**: <first line of the reply>", then a 13 px `ink-500` line with
  the time and "Read all 2 messages". Opening shows every message with who and when.
- **D2. Office notices on one line.** Closing time and scheduled runs are never rows. One
  13 px line at the bottom: "Office notices: 6 scheduled runs, 3 closing times" with Show,
  which lists them by day and time. "routine" and bare counts are gone.
- **D3. Plain verbs.** asked, let know, suggested, agreed, turned down, finished, wrote to;
  never the message type (request, inform, propose, query).

## States

Empty: "No messages yet. What {{name}} receives and sends shows up here." Only notices:
"No handoffs yet. Only office notices so far." above the notices line. Long subjects are
cut at 160 characters in a row; the open view shows the full text.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Outside Review | ollama (design outside voice) | Independent 2nd opinion | 0 | — | not run |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | clean | score: 3/10 → 9/10, 3 decisions (D1 revised to A + B) |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** none run (Ollama only by standing rule; not requested).
- **VERDICT:** DESIGN CLEARED.

NO UNRESOLVED DECISIONS
