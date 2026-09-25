# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Don't Be Michael keeps its own version line, starting at 0.0.1.

## [Unreleased]

### Changed

- **Each team member's folder is private.** Only that team member, anyone sharing the folder
  (agents in the same role do by default), and Michael can open it. Michael can read his team's
  files but not change them. Held by Claude Code's own sandbox and permission rules, and checked
  again by the app on every file an agent opens.
- **Michael works in the business folder.** He moves up from the Office folder to the folder that
  holds it and everyone's folders, so he can read his team's work. His conversation carries over.
  Setup now asks for this one folder, and the Office and team folders go inside it.
- **The Office folder is company knowledge.** The whole team reads it; only Michael and you change
  it. Team members send anything meant for everyone to Michael.

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
