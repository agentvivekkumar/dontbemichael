# Scheduled jobs carry a focus area, kept in the agent's Work style

Status: built (2026-10-02, FA1 to FA4). Replaces D5 of
`card-lifecycle.md` (Michael's standup gets its how as a focus area).

## Problem

Owner, 2026-10-02:

> The original repo had an optional work style but a prompt with each schedule
> job that can be pointed towards an agent. The major drawback of this system
> was two sets of prompts for the same agent where each prompt added at the time
> of creating a schedule can significantly contradict with existing work style
> or other schedules for the same agent. I decided to simplify this by making
> work style mandatory to define core identity and duty of an agent and removing
> the prompt from the schedule jobs.
>
> The problem in my design is that now there is no linkage between the scheduled
> task and the job done by the agent. Here is my proposal: the schedule job
> should require a field called "focus area" and this should become part of the
> agent's work style. The focus area for each scheduled job should add a new
> section to the work style of the agent with needed instructions so that the
> agent uses those only when invoked based on the triggered event. In other
> situations, like when Michael asks or delegates a task or another agent seeks
> info, this scheduled job focused instruction should be ignored. Overall the
> agent stays true to their identity and work style, but the schedule event can
> augment a specific task to focus on within the abilities of the agent.

## How it works today

- A job (`ScheduledMission`, `src/shared/missions.ts:20-49`) has a label, timing
  and target; `body` is legacy, empty on new jobs (`:34-36`). Created from the
  Access tab's schedule list (`ScheduleList.tsx:366-426`), by voice
  (`realtimeActions.ts:706-734`), or by an agent's request that Michael approves
  (`missions.ts:513-542`; `ScheduleDraft` has no instructions field, `:217-224`).
- When it fires, the agent gets an `inform` from `scheduler`: "Scheduled run:
  <label>. Do it the way your Work style and your saved procedures say."
  (`scheduleMessage.ts:11-19`, `index.ts:856-859`). Nothing ties the label to
  any part of the Work style.
- The Work style is `Agent.goal`, one document, delivered whole as a `<goal>`
  block at session start and on change (`hooks.ts:566-590`). There is no way to
  make part of it apply only to one kind of message.
- It is edited as plain words and rewritten into instructions with three fixed
  parts, The job / How to work / Needs the owner's approval
  (`workStyleText.ts:42-80`, `workStyleConvert.ts:60-86`).
- Michael has no Work style (`useHive.ts:540-558`); his standup's how is one
  built-in sentence (`hive.ts:289`).

## Proposal

### Defined with the job, visible in the Work style (FA1)

The focus area is written where the job is defined: the schedule editor has a
required "Focus area" field, stored on the job (`ScheduledMission.focus`, plain
words). The agent's Work style shows a **Scheduled jobs** section listing each
of its jobs as "<job>: Focus: <focus area>", read only there; each entry is
edited from its job. Renaming or deleting a job updates the section with it.

### Applied only when the job runs (FA2)

The Work style delivered at session start carries the three core parts and one
line per job ("Scheduled jobs: Check emails, weekdays 8am. Its focus comes with
the run.") but not the focus texts. When a job fires, its message carries that
job's focus:

```
Scheduled run: Check emails.
Focus for this run, within your Work style: <focus area>
It applies to this run only.
```

So a request from Michael or a question from a teammate is answered from the
core Work style alone, and the focus is in front of the agent exactly when its
trigger runs.

### No contradictions: checked on save (FA3)

When a focus area is saved, the same writer that turns plain words into
instructions checks it against the core Work style and the agent's other focus
areas. A focus that asks for something the Work style rules out (for example
"send replies" when the Work style says "draft only") is shown back to the owner
with the conflict named, instead of being saved silently. A focus may narrow or
direct the work; it may not widen the agent's duties or approvals.

### Every way a job is created asks for it

- The schedule editor: Focus area is required to save a new job.
- An agent's schedule request carries a focus area (`ScheduleDraft.focus`);
  Michael sees it with the request and approves both together.
- Voice: `create_schedule` asks for the focus before creating the job.

### Existing jobs (FA4)

A job with no focus area keeps running as today, and shows "Add a focus area"
on its row until the owner writes one. A legacy `body` is offered as the
starting text of its focus area (it replaces today's "move to Work style").

### Michael

Michael gets a Work style like everyone else, shipped as a default the owner can
edit: his core part (orchestrate, keep every card alive until it is Done) and a
focus area for each of his jobs. The hourly standup's focus: close the open requests from
the owner, then check the floor. This is how `card-lifecycle.md`
step 6 is done.

## Decisions (owner, 2026-10-02)

- **FA1:** The focus area is specified where the schedule is defined, stored
  with the job, and visible in the agent's Work style as a "Scheduled jobs"
  section ("<job>: Focus: <focus area>").
- **FA2:** The agent sees a job's focus only in that job's run message; the
  session Work style lists the jobs without their focus.
- **FA3:** A focus area is checked against the agent's Work style and its
  other focus areas on save; a conflict is named and must be fixed or
  confirmed. A focus may narrow or direct the work, never widen duties or
  approvals.
- **FA4:** Existing jobs without a focus keep running as today and show "Add a
  focus area"; a legacy prompt is offered as the starting focus text.

## Build tasks

- [x] **F1** `ScheduledMission.focus` (and `ScheduleDraft.focus` for agent
  requests); `missions:upsert` keeps it; voice `create_schedule` asks for it.
- [x] **F2** The run message: `scheduledRunBody(label, focus)` adds "Focus for
  this run, within your Work style: ..." and "It applies to this run only."
- [x] **F3** The session Work style: the `<goal>` block appends "Scheduled
  jobs:" with each job's name and times, no focus text; Profile and Edit agent
  show the section with each job's focus, read only.
- [x] **F4** Schedule editor: required Focus area on new jobs; "Add a focus
  area" on old ones; legacy body offered as starting text.
- [x] **F5** Conflict check on save through the Work style writer
  (`workStyleConvert`), naming what the focus contradicts.
- [x] **F6** Michael's default Work style and his standup's focus area (close
  the open requests from the owner, then check the floor), for every install.
- [x] Tests: run message text, goal block listing, required field, conflict
  path, legacy fallback.
