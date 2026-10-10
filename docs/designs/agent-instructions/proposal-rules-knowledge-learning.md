# Proposal: what is still open

Date: 2026-09-24, last updated 2026-09-25. This file holds only what is still open. When the owner settles an item it comes out of this file, and decisions that change an open item are written into its text. What has been built is recorded in CHANGELOG.md (Unreleased).

This is a follow-up to the agent instructions audit (README.md in this folder).

## 1. Read the measures after a day of use

`node tools/agent-metrics.cjs --days 1` reports compactions, clears and cancels, memory tidy ups, and tokens and dollars per agent per day. Run it after a working day on this build and compare with the baseline below, then decide whether the 300k compaction point and the 50k and 30 minute clear points should move.

Baseline, 2026-09-24, before this build: each team member used about 0.5 to 0.66 million tokens and about $2 a day; Michael used about 6.3 million tokens and $4.11. No compactions or clears were logged yet (compaction is logged from this build on).

## 2. Confirm a memory tidy up in the app

All 117 tidy ups before 2026-09-25 failed because the Claude Code sign in had expired. After signing in again, the same model call on Toby's memory worked (4 changes, all accepted by the app's checks). Still to see: a `memory-tidy` line in log.jsonl from the app itself, after it is restarted on this build.

## 3. Live check of the folder rules

Confirm in a real run that Claude Code's deny rules hold in auto mode. The unit tests pass. The Claude Code sign in is fixed, so this can run now. Also check two things added on 2026-09-25: a team member's shell command can't run with the sandbox off (`allowUnsandboxedCommands: false`, Mac and Linux only: Windows has no Claude Code sandbox, so since 2026-10-09 the app leaves it off there and only the file tool deny rules apply), and nothing an agent needs (web or network tools) broke because of it; and a link inside a team member's folder can't open Michael's files.

## 4. Memory notes that pretend to be from the owner

Ask me answers are written into the agent's memory inbox as "From the owner ...", and agents write to that same inbox. An agent, or an email that tricks one, can add a line starting "From the owner", and the tidy up keeps it as the owner's instruction. The owner chose to ship first and fix this next (2026-09-25). The proposed fix: owner answers go to a file only the app writes, and the tidy up marks a note as the owner's only from there.
