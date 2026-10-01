# Don't Be Michael: features and changes

Everything the app does today, and every release that got it here (0.0.1 to 0.0.13). Part 1 is
written to be lifted onto the GitHub page and the website as it is; Part 2 is the full list, release
by release.

## Part 1: Feature highlights

**One line:** An AI office for your small business. Talk to Michael, your office manager, and a
team of AI employees does the work on your Mac.

**Short pitch:** Pick your kind of business and your team. Every team member is an AI agent with a
job, its own folder, its own mailbox and its own memory. Michael hands out the work, keeps the team
moving, and brings you only the decisions that need you.

### 1. Michael runs the office
- You talk to one person. Michael sends each job to whoever's job it is, runs an hourly standup,
  keeps the task board right and brings you only what needs you.
- Only Michael assigns work. When one team member needs another to do something, it goes through
  Michael, so work never bounces between two agents. Teammates can still ask each other questions.
- Michael decides the team's day to day requests himself, such as a new schedule, and asks you only
  when the facts can't settle it, sources disagree, or it is sensitive.
- Only Michael sends you desktop notifications. Talk 1:1 with any team member when you want to.

### 2. Hire the right person in four steps
- Who, Job, Role, Finalize. Pick a character from The Office and they bring a real job: the one a
  teammate already does, the one written for your kind of business, or any job from another
  business. Or write a new one.
- No two teammates do the same work. The app checks every new job against the team by what each
  one handles; an overlap has to be tied to its own mailbox or topic before you can hire.
- The work style is in plain words you can edit. The app turns it into the agent's instructions.
- Every hire gets its own private folder and starts working.

### 3. A mailbox for every job
- Connect as many mailboxes as your business runs on: Gmail, Google Workspace, iCloud, Yahoo, Zoho
  or any IMAP mailbox. Passwords stay in your Mac's keychain.
- Give each team member the one mailbox that fits its job: the Admin watches the CEO's inbox,
  Support answers support@, Sales follows up from sales@. One team member per mailbox.
- Choose Can send or Draft only for each one. A team member can't reach a mailbox you didn't give it.

### 4. Jobs on a clock
- Each team member's schedules sit on its Access tab. Name the job ("Check the support
  inbox") and when, and it does the job the way its work style says.
- One job can run at several times: every 2 hours on weekdays between 8 and 6, plus 2 pm at weekends.
- Closing time pauses the office; opening it runs a missed job once, never a backlog.

### 5. Memory that gets better
- Each team member keeps a short list of lasting notes: your preferences and corrections, facts it
  looked up, where things live, and the steps for jobs it repeats. A background tidy up merges and
  updates them instead of letting them pile up.
- Your answers to its questions go straight into its memory, so it doesn't ask again.
- Company profile and company knowledge (Word, Excel, PowerPoint, PDF, scans) are shared with the
  whole team, searchable by meaning.

### 6. You stay in charge
- Spending money, deleting things and anything public come to you first, on the Needs you board.
- Private folders: each team member opens only its own; Michael can read the team's work but not
  change it. Enforced by Claude Code's sandbox and checked again by the app.
- House rules for every agent: say where a fact came from, say when it doesn't know, never make up
  people, customers or quotes. A looping agent is steered, then held, then stopped.

### 7. An office you can watch
- A pod for each department around Michael's glass office. Desks light up as team members clock
  in and go dark at closing time, envelopes fly between pods as work moves, and idle teammates
  trade lines across the office.
- Every team member has a Profile, Access, Messages, Memory and Work tab written for owners, not
  developers. Views for the task board and for who talks to whom.

### 8. Built for small business owners
- Setup by kind of business: restaurant and food, retail, professional services, home services,
  SaaS and consulting, or anything else. Each comes with a suggested team.
- Runs on your Mac with the Claude plan you already have. Plain words, no developer settings.
- English, Simplified Chinese and Arabic (right to left).

## Part 2: Every change, release by release

### 0.0.13 (2026-09-30)
- Claude Code updates itself, but team members already running keep the old version until they
  restart. The app notices within ten minutes and shows a "team upgrade ready" chip in the title
  bar and a note in the corner.
- One click closes the office the safe way (every agent saves and confirms), then the app reopens
  on the new version; the closing time dialog says "reopening". Nothing restarts on its own, and
  "later" hides the note until a newer version arrives.

### 0.0.12 (2026-09-30)
- Saved passwords and keys (mailboxes, engines, integrations) can't be lost to a crash mid-save:
  the secrets file is swapped in whole, so a crash, power cut or full disk leaves the old file or
  the new one, never a torn one.
- A secrets file that is there but can't be read is never saved over; saving a new secret fails
  with a message instead of erasing the others. The file is always owner-only.

### 0.0.11 (2026-09-30)
- QuickBooks through your Claude account; the app does not connect to Intuit itself. One switch
  in Settings > Connections > QuickBooks, off by default. On, it shows whether your Claude account
  has QuickBooks connected, or the steps to connect it.
- Each Capabilities tab: Can use QuickBooks, then Read only or Can make changes. Oscar starts on
  and Read only; everyone else starts off. A change applies on the next step, with no restart.
- Read only is a fixed list of reads; anything else, loan shopping and peer loan offers included,
  is refused. Known limit: a separate Claude started from a team member's terminal is outside
  the check; a fix is planned.

### 0.0.10 (2026-09-29)
- Closing time shows who is still working: every team member and Michael, confirmed, still
  working, waiting at a prompt or nothing to do, with what each is doing and for how long.
- Remind sends one agent the closing steps again; Close without them stops waiting for one team
  member. Nothing is stopped, and a row goes when that agent's terminal ends.

### 0.0.9 (2026-09-28)
- No app changes. The old project's website files, promo media and 42 of its blog posts left the
  repo; the release drops, message queue and company knowledge docs match the app again.

### 0.0.8 (2026-09-27)
- New hire wizard: Who, Job, Role, Finalize. Jobs come from a teammate, your business pack, any
  other business, or a new one; lists open on the character's own kind of job.
- Distinct job check against every teammate (by what they handle, never the title); an overlap
  must be bound to its own mailbox or topic, and the teammate's line hands that work over.
- Work style in plain words, turned into instructions when you hire or save (Edit Agent too).
- Own folder per hire (Admin_Erin when Admin is taken); model picked from a list that starts on
  your default; developer options hidden; explanations behind info icons.
- Only Michael assigns work; the asker is told; a runaway message tells Michael.
- Michael decides schedule requests and escalates only what he can't settle, or anything left
  undecided for 12 hours. Each request says why; two about the same job become one.
- One agent per mailbox, with a confirm before moving one.
- Several "when" lines per schedule; a day an "every" line runs on belongs to it alone; 4h added.
- Erin joins the cast; character tiles grouped by job; Sadiq and Darryl redrawn; break room lines
  for every character; "clocking in…" and "nothing to do" in the office; the memory graph shows
  each agent's character.
- Fixed: one agent's memory tidy could read another agent's answer; the hire dialog closing by
  accident.

### 0.0.7 (2026-09-26)
- A mailbox for each agent (Gmail, Google Workspace, iCloud, Yahoo, Zoho, IMAP), tested and kept
  in the keychain; Can send or Draft only.
- Capabilities tab on every agent: email and schedules in one place.
- The office opens again after closing time; a missed job runs once, not once per missed hour.
- Michael's Office schedule lists every job that is on. Sections start closed. Settings simpler.
- The Email and Calendar switch now really blocks those tools.

### 0.0.6 (2026-09-26)
- Setup fills in your legal name and marks every required field.
- Reset and Restart fixes.

### 0.0.5 (2026-09-25)
- Every agent has its own schedules; agents ask for changes instead of making them.
- Profile tab first on every agent: the job, what it does, what it asks first, its folder and
  instructions. Memory tab that reads like notes.
- You talk to team members through Michael, or 1:1. Only Michael notifies you.
- Messages tab as a day by day history.

### 0.0.4 (2026-09-25)
- Names change only in Edit Agent and reach the whole team; duplicates refused.
- The new brand: Don't Be Michael lockup and the Struck M icon.

### 0.0.3 (2026-09-25)
- Private folders, enforced by the sandbox and the app. Michael works in the business folder.
- Company profile and company knowledge (searchable by meaning with MemPalace).
- Memory that improves: short notes, a background tidy up, procedures for repeated jobs.
- A fresh start for idle team members after a written handoff; the old conversation can come back.
- Schedules name the job, not a prompt. Ask me answers go back to whoever asked and are remembered.
- House rules for every agent. New instructions for Michael and the team from each business pack.
- Plainer app messages; notifications name the person; developer surfaces removed.

### 0.0.2 (2026-09-24)
- The app keeps its settings in its own folder and carries its own name and copyright.

### 0.0.1 (2026-09-24)
- First release: set up by kind of business with Office Packs, a folder for every team member,
  real documents in Memory & Knowledge, Office, Tasks and Graph views, Michael asking when no one
  fits, and a floor built for owners in English, Chinese and Arabic.
