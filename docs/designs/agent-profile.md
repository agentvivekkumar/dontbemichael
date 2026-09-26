# Every agent's first tab is its Profile

Status: built (2026-09-25).

## Request (owner, 2026-09-25)

"Add a new tab for all the agents called Profile which should be first tab for each agent.
This tab shows agent role, job description and any other key facts. Make it prettier and
easier to read."

## What it shows

From what the app already stores: the agent's role line (`description`, the registry
`role`), its work style (`goal`), and its card in this office's business pack
(`packsList` for `config.businessType`, else the core pack).

1. **Job title** (Press Start 2P 12 px) and **what the job is** (Inter 16/24), split out of
   the role line by `parseRoleLine` (`src/shared/agentProfile.ts`).
2. **Send {{name}}**: the "Send here for ..." requests as chips, with the "Not for ...;
   that goes to ..." sentence under them in 13 px `ink-500`.
3. **What {{name}} does** (pack `does`, mint ✓) and **Asks you first** (pack `wontDo`).
4. **Key facts**: folder, what it uses (pack connections), first job, model.
5. **{{name}}'s instructions**: the work style as markdown, collapsed by default; its first
   line (addressed to the agent) is dropped.

Sections with nothing to show are left out. Section headings match the Memory tab
(Inter 13 px semibold `ink-700`); the body keeps a 72ch measure.

## Placement

First tab on every team member's panel; a first visit opens on it. In Michael's panel it
is first too, but his panel still opens on ASK ME (owner, 2026-09-23), so what the team
needs from the owner stays the first thing seen.
