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
> **New in 0.0.8: Michael runs the office, and hiring makes sense.**
> A four step hire wizard where each character brings a real job, a check that no two teammates do
> the same work, and work styles in plain words. Only Michael assigns work and decides the team's
> schedule requests, asking you only when he can't settle one. One job can now run at several
> times. [Every feature, release by release](./docs/FEATURES.md).

## Contents

- [What it is](#what-it-is)
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
- **Each one stays in its lane.** A team member can only read, search and draft in the mailbox you
  gave it, and cannot forward or attach mail from another one.
- **Put it on a clock.** Add a schedule like "Check the support inbox" every hour in the same tab,
  and the team member sorts new mail, drafts replies and tells Michael what needs you.
- **You hear when it breaks.** If a provider stops accepting the password, the mailbox shows
  "needs you" and Michael asks you to fix it once, on the Needs you board.

Outlook and Microsoft 365 are not supported yet. The Gmail and Calendar connected to your Claude
account are separate: one switch in Mailboxes allows or blocks them for the whole team.

## What the office does

<table>
<tr>
<td width="50%" valign="middle">

### Talk to Michael, not the whole team

Michael is the one you talk to. He sends each job to the team member whose role fits, keeps an eye
on the task board, and brings you only what needs you. He is the only one who hands out work: when
one team member needs another to do something, the request goes to Michael and he decides who
does it. Team members can still ask each other questions directly. Once an hour he runs a standup
with the team. He is the only one who sends you desktop notifications. To speak with one team member
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
  <img src="./branding/reference/studio/settings-autonomy.png" alt="Settings, Autonomy and Budgets: approvals and the circuit breaker" width="100%">
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
- **Needs you.** When the team needs a decision, Michael puts it on the Needs you board. Your answer goes back to whoever asked, and they remember it.
- **Schedules.** Each team member's jobs on a clock live in the On a schedule section of its Access tab. Say when and which job ("Follow up on unpaid invoices", every weekday at 9), and the team member does it the way its Work style says. One job can have several "when" lines, like every 2 hours on weekdays plus 2 pm on weekends. A team member can ask for a schedule change; Michael decides it, and asks you on Needs you only when he can't settle it. Michael's Office schedule tab lists every job that is on.
- **A mailbox for each team member.** Connect Gmail, Google Workspace, iCloud, Yahoo, Zoho or any other IMAP mailbox with an app password in Settings, Connections, Mailboxes. The password is tested before it is saved and stays in your Mac's keychain. Then turn email on in a team member's Access tab, pick its one mailbox, and choose Can send or Draft only. Each mailbox has one team member watching it. Outlook is not supported yet.
- **QuickBooks through your Claude account.** The app does not connect to Intuit itself. Turn QuickBooks on in Settings, Connections, QuickBooks (it is off by default); the app then shows whether your Claude account has QuickBooks connected, or the steps to connect it. On each team member's Access tab, choose Can use QuickBooks, then Read only or Can make changes. Oscar starts on and Read only; everyone else starts off.
- **Every team member's panel.** Profile first (the job, its folder and the instructions it works from), then Access (email, QuickBooks when you turn it on, and schedules), Messages as a day by day history, Memory as readable notes, and Work, its session live.
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
- **Your language.** English, Simplified Chinese and Arabic, with right to left layout for Arabic.

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

Windows and Linux will follow.

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
