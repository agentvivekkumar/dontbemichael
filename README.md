<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./branding/logo/lockup/dbm-lockup-horizontal-dark.svg">
  <img src="./branding/logo/lockup/dbm-lockup-horizontal-light.svg" alt="Don't Be Michael" width="420">
</picture>

### An AI office for your small business

**[dontbemichael.com](https://dontbemichael.com)**

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./branding/reference/studio/home-dark.png">
  <img src="./branding/reference/studio/home-light.png" alt="The office: a pod for each department around Michael's glass office, and the Needs you board on the right with what waits on you" width="1240">
</picture>

Pick your kind of business, pick your team, and Michael, your office manager, runs the office
while you run the business. Every team member is an AI agent with a job, its own folder and its
own memory, working on your Mac.

<p>
  <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-FF6B6B.svg?style=flat-square&labelColor=1A1320"></a>
  <img alt="Status: early release" src="https://img.shields.io/badge/status-early%20release-FFFDF5.svg?style=flat-square&labelColor=1A1320">
  <img alt="Platform: macOS" src="https://img.shields.io/badge/platform-macOS-FFFDF5.svg?style=flat-square&labelColor=1A1320">
  <a href="https://dontbemichael.com"><img alt="Website: dontbemichael.com" src="https://img.shields.io/badge/web-dontbemichael.com-FF6B6B.svg?style=flat-square&labelColor=1A1320"></a>
</p>

<br>

**[Download for Mac](https://github.com/agentvivekkumar/dontbemichael/releases/latest)**

</div>

---

> [!NOTE]
> **Talk to Michael. Let the office do the rest.**
> Tell Michael what you need. He hands the work to whoever's job it is, keeps the team moving, and
> brings you only the calls that need you.

> [!TIP]
> **New in 0.1.0: first task cards, a Waiting column, and a floor with character.**
> A new hire's first job is a card Michael hands out. The Tasks view shows who a waiting card
> waits on. Every team member has a signature prop, and Who talks to whom reads by time, from the
> last hour to the last month.
> [Every feature, release by release](./docs/FEATURES.md).

## Contents

- [What it is](#what-it-is)
- [How it differs from Munder Difflin](#how-it-differs-from-munder-difflin)
- [Your team](#your-team)
- [A mailbox for every job](#a-mailbox-for-every-job)
- [What the office does](#what-the-office-does)
- [Getting started](#getting-started)
- [Your data](#your-data)
- [For developers](#for-developers)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgements](#acknowledgements)

## What it is

Don't Be Michael is a desktop app that runs a small office of AI team members for your business.
Each team member is a [Claude Code](https://claude.com/claude-code) agent with a role: finance,
customer support, sales, marketing and so on. Michael is the office manager. You talk to him; he
routes the work, answers the team's questions, and asks you only when something needs your
decision.

Everything runs on your Mac, on the Claude plan you already have. Each team member has a desk in
an office you can watch, a pod for each department around Michael's glass office, so you can see
who is working on what.

## How it differs from Munder Difflin

Don't Be Michael started as a fork of [Munder Difflin](https://github.com/chaitanyagiri/munder-difflin),
and it keeps that project's core: every team member is a real Claude Code process in its own
terminal, and the team coordinates through the hive, a folder of plain files. What was built on
top is a different product for a different person.

Munder Difflin is an agent harness for developers: it turns the coding CLIs you already run into
clones of you. Don't Be Michael is an office for a small business owner who never opens a
terminal. That changes almost every decision:

| | Munder Difflin | Don't Be Michael |
|---|---|---|
| **Made for** | Developers running coding agents | Small business owners in any line of work, with no technical background needed |
| **Michael** | Your clone, routing work between your agents | Your office manager: the only one who assigns work, decides the team's day to day requests, and brings you only the calls that need you |
| **Setting up** | Start agents in terminals and give them work | Pick your kind of business, get a suggested team, and hire in four steps with a real job and a work style for each; no two teammates do the same work |
| **Email** | The one Gmail account on your Claude account, shared by every agent | As many mailboxes as the business runs on, one per team member, each set to Can send or Draft only; passwords stay in your Mac's keychain |
| **Access control** | None: every agent can reach every app connected to your Claude account and every tool you set up in Claude Code | You decide exactly which apps the office can use and which team member uses each one; the app enforces it on every call |
| **Files and data** | Hard to give an agent a workspace of its own: agents work in code project folders, with no way to give each one its own set of files and data | Your business folder becomes the office's filing cabinet, with access that follows its hierarchy. Each team member works in its own folder with the files its job needs, such as product documentation and client lists for Sales, or survey results and user interviews for Marketing, and opens only that folder. Michael, above them, reads every folder and changes none. You organize your own work in the same folders the team uses |
| **User experience** | Lots of low level details and out of place screens, which make the system hard to use and hard to focus on the right things | A modern office workspace, redesigned from the ground up for business users. Unneeded details and repetition are gone, and there is one clear way to talk to the office, instead of every option piled into an orchestrator panel |
| **Cost and data** | Free, with a paid Pro plan; anonymous usage stats | Free, no paid plan, no usage data sent |

If you write code and want a team of coding agents, Munder Difflin is the better fit. If you run a
business and want the work done without watching terminals, this is.

## Your team

Setup asks for your business and your kind of business, then suggests a team from that business's
Office Pack. You pick who joins, and you can hire more later.

| Kind of business | Suggested team |
|---|---|
| Restaurant & Food | Finance, Executive Admin, Customer Support, Marketing, Quality Control, Supply Chain, HR Manager |
| Retail Shop | Finance, Executive Admin, Customer Support, Inventory & Shipping, Marketing, Supply Chain, Sales Director |
| Pro Services | Finance, Executive Admin, Customer Support, Sales Director, Marketing, IT Security |
| Home Services | Finance, Executive Admin, Customer Support, Sales Director, Inventory & Shipping, Supply Chain, Marketing |
| SaaS/Consulting | Finance, Executive Admin, HR Manager, Customer Support, Sales Director, Marketing, IT Engineer, IT Security |
| Something else | Pick from the core roles |

Each role comes with a Role description, which tells Michael what work to send there, and a Work
style, which tells the team member how to do its job at your business. You can change both in
Edit Agent.

## A mailbox for every job

Most AI assistants read one inbox: yours. Don't Be Michael connects as many mailboxes as your
business runs on, and each team member works from the one that matches its job.

| Team member | Watches | Can it send? |
|---|---|---|
| Pam, Executive Admin | ceo@yourbusiness.com | Draft only: replies wait in Drafts for you |
| Kelly, Customer Support | support@yourbusiness.com | Can send |
| Dwight, Sales Director | sales@yourbusiness.com | Can send |

- **Connect once.** In Settings, Connections, Mailboxes, add Gmail, Google Workspace, iCloud,
  Yahoo, Zoho or any other IMAP mailbox with an app password. The login is tested before it is
  saved, and the password stays in your Mac's keychain, never in a file an agent can read.
- **Hand it out per team member.** On a team member's Access tab, turn email on, pick its
  mailbox, and choose **Can send** or **Draft only**. Nobody gets a mailbox until you give it one,
  and each mailbox is watched by one team member: moving it to another asks you first.
- **Each one stays in its lane.** A team member can only read, search, draft and file mail (archive,
  mark read, mark junk) in the mailbox you gave it, and cannot forward or attach mail from another
  one. Nothing it does deletes mail.
- **Put it on a clock.** Add a schedule like "Check the support inbox" every hour in the same tab,
  with a focus area for each run, and the team member sorts new mail, drafts replies and tells
  Michael what needs you. A new Executive Admin arrives with an Inbox to zero job already set.
- **You hear when it breaks.** If a provider stops accepting the password, the mailbox shows
  "needs you" and Michael asks you to fix it once, on the Needs you board.

Outlook and Microsoft 365 are not supported yet. The Gmail and Calendar connected to your Claude
account are separate: they are listed under Claude connectors in Settings, off until you turn them
on and give them to a team member.

## What the office does

<table>
<tr>
<td width="50%" valign="middle">

### Talk to Michael, not the whole team

Michael is the one you talk to. He sends each job to the team member whose role fits, keeps an eye
on the task board, and brings you only what needs you. He is the only one who hands out work: when
one team member needs another to do something, the request goes to Michael and he decides who
does it. Team members can still ask each other questions directly. When you answer a question, the
answer becomes his work until he routes it and closes it. Once an hour he runs a standup with the
team. He is the only one who sends you desktop notifications. To speak with one team member
directly, open it and choose **Talk 1:1**; Michael sends it no work until you end the 1:1.

</td>
<td width="50%">
  <img src="./branding/reference/studio/michael-office-schedule.png" alt="Michael selected: his card in the office and his Office schedule, every job on a clock across the team" width="100%">
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Hire a team member

The hire wizard has four steps: Who, Job, Role and Finalize. Pick a character and it brings a
job: one a teammate does today, one from your Office Pack, one from any other kind of business, or
a new one you write. Before you hire, the app checks the new job against every teammate's so no
two do the same work; an overlap has to be tied to its own mailbox or topic first. The work style
is plain words you can edit. Each hire gets its own folder inside your business folder and starts
working.

</td>
<td width="50%">
  <img src="./branding/reference/studio/hire.png" alt="The hire wizard: pick a character, then their job, role and work style" width="100%">
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Memory that improves

Each team member keeps a short list of lasting notes: your preferences and corrections, facts it
looked up, where things live, and the steps for tasks it does again. A tidy up in the background
merges and updates them, so memory gets better instead of piling up.

</td>
<td width="50%">
  <img src="./branding/reference/studio/kelly-memory.png" alt="Kelly's Memory tab: her preferences, facts, where things live and the steps she knows" width="100%">
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### You stay in charge

Spending money, deleting things and changes of scope come to you. A team member that loops or
keeps failing is steered, then held, then stopped. Each one works under house rules: state only
what it can trace to a source, say when it doesn't know, and never make up people, customers or
quotes.

</td>
<td width="50%">
  <img src="./branding/reference/studio/settings-autonomy.png" alt="Settings, Agents: the default model, approvals and the circuit breaker" width="100%">
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Watch the office work

Desks light up as team members clock in and go dark at closing time. Envelopes fly between pods
as work moves, Michael points before he hands a job out, scheduled jobs ring his wall clock, and
idle teammates trade lines across the office. Click any pod to see that team member's work live.

</td>
<td width="50%">
  <img src="./branding/reference/studio/kelly-work.png" alt="Kelly selected: her pod in the office and her Work tab, her session live" width="100%">
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Set up once

Setup asks for your business name, your kind of business, the owner and your headquarters
address. Contact details, hours and prices are optional and can wait for Settings. Michael then
shows you around the office and suggests a starter team: you pick who joins and where each one
works. Setup checks what your Mac already has and offers to install anything missing.

</td>
<td width="50%">
  <img src="./branding/reference/studio/onboarding-business.png" alt="Setup step 1: your business name, kind of business, owner and headquarters address" width="100%">
</td>
</tr>
<tr>
<td width="50%">
  <img src="./branding/reference/studio/onboarding-meet.png" alt="Setup step 3: Michael explains the starter team, how he runs the office, memory and approvals" width="100%">
</td>
<td width="50%">
  <img src="./branding/reference/studio/onboarding-team.png" alt="Setup step 4: pick your starter team; the office fills with a pod for each person picked" width="100%">
</td>
</tr>
</table>

**Running the office**
- **Needs you.** When the team needs a decision, Michael puts it on the Needs you board. Your answer goes back to whoever asked, and they remember it. Michael gets it too, as work he routes and then closes.
- **Schedules.** Each team member's jobs on a clock live in the On a schedule section of its Access tab. Say when and which job ("Follow up on unpaid invoices", every weekday at 9), and the team member does it the way its Work style says. One job can have several "when" lines, like every 2 hours on weekdays plus 2 pm on weekends. A team member can ask for a schedule change; Michael decides it, and asks you on Needs you only when he can't settle it. Michael's Office schedule tab lists every job that is on.
- **A mailbox for each team member.** Connect Gmail, Google Workspace, iCloud, Yahoo, Zoho or any other IMAP mailbox with an app password in Settings, Connections, Mailboxes. The password is tested before it is saved and stays in your Mac's keychain. Then turn email on in a team member's Access tab, pick its one mailbox, and choose Can send or Draft only. Each mailbox has one team member watching it. Outlook is not supported yet.
- **Claude connectors.** Settings, Connections, Claude connectors lists every connector on your Claude account (HubSpot, Google Drive, Gmail, QuickBooks and the rest), read from Claude by itself. Each is off until you turn it on; then give it to the team members who need it on their Access tab. QuickBooks keeps Read only or Can make changes, and Oscar starts on and Read only. Your own Claude Code servers, plugin servers included, never reach the team.
- **Every team member's panel.** Profile first (the job, its folder and the instructions it works from), then Access (email, Claude connectors, and schedules), Messages as a day by day history, Memory as readable notes, and Work, its session live.
- **Office, Tasks, Who talks to whom.** Tabs in the top bar switch between the office, the whole task board, and who talks to whom.
- **Slack and webhooks.** Message a Slack channel or send a webhook, and Michael picks it up and replies in the thread.
- **A fresh start without losing work.** A team member that has sat idle with a long conversation writes a handoff of anything unfinished, then starts fresh. You can bring the old conversation back.

**Your business, known to everyone**
- **Company profile.** Your business name, owner, address, hours, time zone, currency and more, given to every team member. Change it in Settings.
- **Company knowledge.** Add your documents and policies in Memory & Knowledge: Word, Excel, PowerPoint, PDF, and scans or photos. Every team member can search them by words, and by meaning when MemPalace is installed, so "money back" finds your refund policy.

**Private folders**
- Michael works in your business folder, and each team member works in its own folder inside it.
- A team member opens only its own folder. Michael can read his team's folders but not change them. Claude Code's sandbox and the app both enforce this.

**Also**
- **Updates.** The app tells you when a new version is out and links to the download.
- **Claude Code updates.** When Claude Code updates itself, team members already running stay on the old version until they restart. A "team upgrade ready" chip and note offer to close the office the safe way (everyone saves first) and reopen on the new version. Nothing restarts until you click.

<div align="right">(<a href="#what-it-is">↑ back to top</a>)</div>

## Getting started

### What you need

- A Mac with Apple Silicon or Intel.
- [Claude Code](https://claude.com/claude-code), signed in to your Claude plan. A Claude Max plan
  keeps the office running all day; smaller plans reach their usage limit during the day, and the
  office waits until it resets. The app can install Claude Code for you from
  **Settings → Prerequisites**.

### Install

1. Download the `.dmg` from the [latest release](https://github.com/agentvivekkumar/dontbemichael/releases/latest).
2. Open it and drag **Don't Be Michael** into your Applications folder.
3. Open it from Applications. The first time, macOS says it could not verify the app. Click
   **Done**, then open **System Settings → Privacy & Security**, scroll to the message about Don't
   Be Michael and click **Open Anyway**.

You only do step 3 once. macOS asks because this early build is not yet signed with an Apple
Developer ID. Setup takes it from there.

A Windows 11 beta is in testing on release candidates; Linux will follow.

## Your data

- **It stays on your Mac.** Your team's work, memory and files live in folders on your Mac. The
  team members themselves run through your own Claude Code and Claude plan.
- **No usage data.** The app sends nothing about how you use it. See [`TELEMETRY.md`](./TELEMETRY.md).

## For developers

Don't Be Michael is an Electron app (React, TypeScript, xterm.js, node-pty). Each team
member is a real Claude Code process in its own terminal. The team coordinates through the hive,
a folder of plain files with a mailbox, memory and a task board per agent; only the app commits to
it.

### Build from source

You need Node.js 18 or newer, npm, and a C/C++ toolchain for `node-pty` (on a Mac:
`xcode-select --install`).

```bash
git clone https://github.com/agentvivekkumar/dontbemichael.git
cd dontbemichael
npm install        # also rebuilds node-pty for Electron
npm run dev        # the app with hot reload
```

```bash
npm run typecheck     # main, preload and renderer
npm run test:focused  # the node:test suite in test/
npm run build         # production build
npm run dist:mac      # the Mac installer, in dist/
```

If `node-pty` fails to load after an Electron upgrade, run `npm install` again.

### Where to read next

- [`docs/FEATURES.md`](./docs/FEATURES.md): every feature, and every change release by release.
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md): diagrams and the module map.
- [`HIVE.md`](./HIVE.md): how agents coordinate.
- [`SPEC.md`](./SPEC.md): the original spec. Its terminal and event planes still hold; the pixel canvas and command bar it describes were replaced by the Studio.
- [`branding/DESIGN.md`](./branding/DESIGN.md): the design system, for any new UI.

### What this build leaves out

Setup offers only Claude Code. The code still carries presets for other agent CLIs (Codex, Gemini,
Grok, Kimi, Qwen, OpenCode, Crush, pi, Copilot and Cursor), your own API keys and local models,
but this build doesn't offer them. Some developer features are switched off because business
owners don't use them: git views, the built in code editor, temporary helper agents, voice, and
opening a Terminal in an agent's folder. Each one has a switch in
[`src/shared/buildFeatures.ts`](./src/shared/buildFeatures.ts).

## Contributing

Contributions are welcome. Start with [`CONTRIBUTING.md`](./CONTRIBUTING.md). Found a bug or have an
idea? [Open an issue](https://github.com/agentvivekkumar/dontbemichael/issues).
[`CONTRIBUTORS.md`](./CONTRIBUTORS.md) lists everyone with a merged pull request. Changes are in
[`CHANGELOG.md`](./CHANGELOG.md).

## License

The **source code** is licensed under the **MIT License**. See [`LICENSE`](./LICENSE). The original
copyright notice of the project this is forked from is kept in `LICENSE`, as the MIT license
requires.

*Don't Be Michael* is not affiliated with NBC, *The Office*, or Dunder Mifflin.

## Acknowledgements

- [Munder Difflin](https://github.com/chaitanyagiri/munder-difflin) by Chaitanya Giri and its contributors, the open-source project this product is forked from.
- [xterm.js](https://xtermjs.org/) · [node-pty](https://github.com/microsoft/node-pty) · [electron-vite](https://electron-vite.org/) · [CodeMirror](https://codemirror.net/) for the libraries this is built on.
