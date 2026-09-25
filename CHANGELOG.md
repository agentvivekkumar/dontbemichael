# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Don't Be Michael keeps its own version line, starting at 0.0.1.

## [Unreleased]

### Changed

- **Every agent's folder is private.** A team member's folder opens only for that team member,
  anyone sharing the folder (agents in the same role do by default), and Michael, who can read his
  team's files but not change them. Michael's own folder opens only for him and you. Held by Claude
  Code's own sandbox and permission rules, and checked again by the app on every file an agent opens.
- **Michael works in the business folder,** the one holding everyone's folders, so he can read his
  team's work. His conversation carries over. Setup now asks for this one folder, and the team's
  folders go inside it.
- **Company knowledge lives in Memory & Knowledge.** Company wide information, policies and rules
  are shared through the knowledge feature, which is now on for every office and which every agent,
  Michael included, is told to search. There is no shared Office folder any more: an existing one
  stays on disk as an ordinary folder inside Michael's. Turning it on or off in Settings now reaches
  agents that are already running on their next message, instead of at their next start.
- **A fresh start for idle team members, without losing work.** When a team member's conversation
  is large (50k tokens or more) and has sat idle for 30 minutes with nothing open (no open task
  card, empty inbox, no reply it is waiting on, no unanswered Ask me question), the app first asks
  it to write a handoff of anything unfinished, then clears its conversation. The new conversation
  starts with that handoff, its memory, Work style and the company profile. If new work arrives
  before the clear, it is cancelled. The earlier conversation is kept: the team member's panel says
  when it was cleared and offers to bring it back. Michael is never cleared. The clock based auto
  clear in Settings is gone.
- **A schedule says when and which job, not how.** Schedules no longer have a Prompt: the label
  names the job (for example "Follow up on unpaid invoices"), and the agent does it the way its Work style
  says. Every run sends the same short message, including a way to stop quietly when there is
  nothing to do. The hourly standup's instructions moved into Michael's own. A schedule that already
  had its own instructions keeps sending them, and its card offers to move them into that team
  member's Work style or remove them.
- **Ask me answers go back to whoever asked, and are remembered.** Each question on an Ask me
  card now records the team member whose work needs the answer (or Michael, for his own). Your
  answer goes straight to that agent, into its memory notes as your words, and Michael is told so he
  can unblock the card. The memory tidy-up keeps the lasting part, like a rule or a preference, so
  the same question isn't asked again.
- **Agents' memory improves instead of piling up.** Each agent's memory is now a short index of
  one line notes (at most about 2,000 tokens) that the app keeps and gives the agent once per
  session. Agents add at most three notes after a task, and your instructions and corrections at
  once, to their memory inbox; they no longer append session logs. In the background, a small model
  (Haiku) sorts the notes in with itemised changes, never rewriting the whole file: it merges
  duplicates, updates facts that changed (the old version goes to an archive), and turns steps that
  worked for a recurring task into a procedure file. It runs after about 10 notes, once a day, or
  when the office is idle. Closing time no longer writes session logs to memory; where work stands
  goes on the task board. Existing memory is sorted once, with the original backed up. This
  replaces the old condenser, which rewrote the whole file.
- **A company profile every agent works from.** Setup asks for the essentials (business name,
  industry, CEO or owner, headquarters address, website), then an optional Company details step:
  legal name and business type, main phone, public email, social links, business hours, time zone,
  where you serve, languages, currency and when your financial year starts. Time zone and currency
  start from your Mac. Every agent, Michael included, gets these facts at the start of each session
  and again when you change them in the new Settings, Company profile page. Anything longer (product
  lists, ideal customers, how you sell, policies) goes in Memory & Knowledge, which the page points to.
- **Company knowledge can be searched by meaning.** When MemPalace is installed, every document you
  add is indexed into it, so a search for "money back" finds your refund policy. Removed documents
  leave the index too. Without MemPalace, agents search by exact words as before.
- **House rules for every agent, Michael included.** Every agent now starts with five short rules:
  state only facts it can trace to a source and name the source, say so when it doesn't know,
  mark estimates as estimates, report outcomes as they are, and never make up people, customers or
  quotes.
- **Compaction is left to Claude Code.** The app no longer types `/compact` into idle agents every
  two hours, and its Settings control is gone. Each Claude agent now starts with Claude Code set to
  compact at about 300k tokens (models with a smaller window keep their usual point), instead of
  waiting until about 967k on 1M token models.
- **The standup no longer talks about compaction.** Keeping each agent's context small is the
  app's job, not something agents are told to do. An office still using the original standup text
  gets the new one; text you edited yourself is left as it is.
- **The standup runs every time the office opens.** Michael gets the hourly standup as soon as he's
  up, including a brand new office right after setup, then every hour from there. Before, the first
  one on a new office was lost, and a reopened office only got one when it was overdue.
- **Hiring asks for Role, Role description and Work style,** the same fields as Edit Agent. A new
  team member's folder goes inside Michael's, named after the role, so people in the same role
  share one. Michael's folder can't be picked as a team member's own folder.
- **New instructions for Michael and the team.** In an office with a business folder, Michael
  starts as the office manager of your business: he runs the team, sends work to whoever's role
  fits, and brings you only what needs you. Each team member starts knowing its job, who it reports
  to, and how to hand work back. Replies meant for you or for Michael reach Michael, whatever name
  an agent uses for him.
- **Each role in a business pack comes with its Role description and Work style,** written for
  that business, with your business name and city filled in. A new hire from a pack gets them.
- **Your existing team gets the new text too, once.** Each team member that came from a pack gets
  today's Role description and Work style when the app next opens. The team list is backed up to
  `roster-backups` first; if the backup fails, nothing changes. Team members you hired yourself are
  left as they are.
- **Michael gets the team list only when it changes,** instead of on every message, and a short
  status line when someone's status changes.
- **Plainer messages from the app.** The inbox nudge, the pause and stop notes, closing time, Slack
  requests and the message format reference are rewritten in plain words, and scheduled runs arrive
  as information rather than as tasks. Michael's role is "office manager".
- **Nothing is typed into Michael's terminal when he starts.** He no longer gets a remote control
  command or an orientation prompt; his instructions and the standup when the office opens cover it.

### Fixed

- **Setting up again no longer loses your team.** When setup finished on an office that already
  had a team, the floor could save Michael alone over the team's list. Setup now reads the
  office's team first, and any team member the office knows but the floor lost comes back.
- **Your office is found by its folder, not its name.** When setup finds an office on this Mac, it
  offers to continue with it: the same team, in the same folders, whatever business name you type.
  Setting up a new office gives it a folder of its own. The office keeps its own record in
  `office.json` in its folder.

- **Notifications name the person.** A desktop notification now reads "Michael: Waiting for you."
  instead of "god: Claude is waiting for your input", and each team member's notifications carry
  their own name.

- **"Close Office" and "Hide Office" in the menu.** They replace "Quit Don't Be Michael" and "Hide
  Don't Be Michael", which put the action and "Don't" side by side. Cmd+Q and Cmd+H work as before.

- **Edit a team member's engine from two short lists.** Provider and model are now dropdowns
  instead of rows of buttons, and the provider list shows the engines this app offers.

- **Only Claude Code can be picked, everywhere.** The hire dialog and Michael's engine and model
  pickers now offer the same engines as setup. The others are not ready to run
  an office member yet.

- **Role, Role description and Work style when editing a team member.** The old Description is
  split into a role and what the role covers, which Michael reads to decide who gets which work, and
  a save reaches him straight away. Goal is now Work style: how the team member does its work,
  which Michael doesn't see.

### Removed

- **No voice, for now.** Talking to Michael and dictating messages are switched off, along with
  the Voice tab in Settings.

- **No usage stats choice in setup or Settings.** The app sends no usage data, so it no longer
  asks about it.
- **No Auto / Pause switch in Michael's Command Center.** It held back every message queued for
  the team. Queued messages are always delivered now, and a pause saved earlier is cleared.
- **No "open" button next to edit.** It opened a Terminal window in the agent's folder, a developer
  tool. The terminal icons beside folders in Michael's Command Center are gone too.
- **No close button on team members.** It stopped a team member mid-task and took it off the floor,
  with no button to bring it back.
- **No "auto mode" text in the header bar.** It named a setting in words owners don't use. The
  setting itself is unchanged, in Settings under Autonomy & Budgets.

## [0.0.2] (2026-09-24)

### Changed

- **Setup runs again after updating from 0.0.1.** The app now keeps its settings in its own
  folder, `~/Library/Application Support/dontbemichael`. Settings, connected accounts and history
  from 0.0.1 are not carried over. Your team's folders in Documents are not touched, so using the
  same business name in setup finds them again. The old settings stay in
  `~/Library/Application Support/munder-difflin` until you delete that folder.
- **This app's own name and copyright.** The About panel, the installer and the project metadata
  name Don't Be Michael and its owner.

## [0.0.1] (2026-09-24)

The first release of Don't Be Michael: an AI office for small business owners.

### Added

- **Set up by business.** Setup asks for your business name and City, State, then your kind of
  business: restaurant, retail, professional services, home services, or SaaS and consulting. It
  explains that Michael is your office manager, then suggests a team for that business, and you pick
  who joins.
- **Office Packs.** Each business type is a pack that decides who is on the team and how each job
  reads for that trade. Every character keeps the job they had in the show, in every pack.
- **A folder for every team member.** Each works in their own folder under Documents, next to a
  shared Office folder where Michael works. The app's own working folder is kept for coordination,
  and agents are stopped from saving work there.
- **Real documents in Memory & Knowledge.** Word, Excel, PowerPoint, PDF and scanned documents are
  read (scans and photos through the Mac's own text recognition), with plain reasons when a file
  can't be read. Agents can read the same files in their folders.
- **OFFICE, TASKS and GRAPH views.** A switch in the corner of the floor shows the animated office,
  the whole task board (who is doing what, what is blocked, what is done), or who talks to whom.
  Each view opens with a short explanation.
- **Michael asks when no one fits.** A big job outside everyone's role goes on the Ask me board
  with suggestions, instead of Michael starting a new agent on his own.
- **"We can't find your office."** If the office folder is moved or deleted, launch asks where it
  went, instead of quietly starting an empty office in its place.

### Changed

- **Named Don't Be Michael.** The menu, window, installers and macOS permission prompts use the new
  name. Your data folder keeps its old name, so nothing is lost.
- **Claude Code only, Opus 5.5 recommended.** Setup offers Claude Code with a choice of Claude
  model, says a Claude Max plan keeps the office running all day, and falls back to Opus 5 on an
  older Claude Code. The model list, updates and links all come from this app's own repository.
- **A floor for owners.** Every launch opens on Michael, on his Ask me tab. Skills, webhooks, memory
  settings and agent upkeep moved to Settings, where they apply to the whole office. Monitor and
  Activity sit under an Advanced tab. Owner facing text is 14px or larger, in plain words, with no
  dashes, in English, Chinese and Arabic.

### Removed

- Git views, the code editor, temporary helper agents and the organisation trigger are hidden in
  this build. The floating memory panel on the office floor is gone; its settings are in Settings.
- The original project's promotions, community links and update source.
- Windows and Linux builds. This release ships a Mac installer only; the other platforms stay
  configured for later.

### Security

- The Mac app is sealed ad hoc until it can be signed with an Apple Developer ID, so a downloaded
  copy opens through Privacy & Security > Open Anyway instead of being reported as damaged. Updates
  arrive as a download link rather than installing in place until the app is signed.

### Fixed

- Document reading no longer freezes the app while it converts older Word and RTF files.
- Setup no longer hangs on "Saving" when something fails; it says what went wrong in plain words.
- Switching offices keeps your team on screen if the switch fails.
- Opening a team member's memory from the graph no longer sticks to that person later.
