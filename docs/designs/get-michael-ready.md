# Get Michael ready

Owner report, 2026-10-07: a business owner installed the app on a brand new Mac,
finished setup, and landed on the office. Nothing happened after that: no error,
no next step. Michael's Work tab showed "Engine CLI not found: claude", an
install attempt, then "process exited".

Mockup: [get-michael-ready.html](get-michael-ready.html). Reference shot:
`branding/reference/studio/onboarding-ready.png`.

## Root cause

1. **The install ran where nobody looks.** When Claude Code was missing at
   Michael's start, `spawnAgentCore` ran an installer inside Michael's own
   terminal (`index.ts`, the missing-CLI ladder). On a bare Mac with internet,
   the ladder picks `node-then-npm`: it runs `sudo installer -pkg` for Node
   (`nodeInstall.ts`). The password prompt waited in a terminal the owner never
   sees, then failed. Even with the password typed, `npm install -g` after a
   fresh Node install commonly fails on folder permissions.
2. **The failure was silent.** A non-zero installer exit only reached
   analytics. The install terminal is not registered as Michael's process, so
   even the abnormal-exit record never fired. The owner's question sat at
   "Waiting for Michael: 1".
3. **Sign in was hidden too.** A freshly installed Claude asks the owner to
   sign in on first run, again inside the hidden terminal.

Onboarding marked Claude "installs on first run" and let the owner through.

## Decisions

| # | Decision | Choice |
|---|----------|--------|
| D1 | Where Claude gets installed and signed in | A Ready step at the end of setup; Ask me keeps a card when skipped. Supersedes the 2026-08-07 rule that installs Node first, for Claude |
| D2 | The step's design | Built as the mockup |
| D3 | Owner, 2026-10-07: offer an Anthropic API key as well as a Claude account | Use an API key beside Sign in |

## Behavior

**Ready step (step 8, Claude only).** Two rows in one card.

- **Claude Code**
  - Checks on open.
  - When Claude is missing, installs it at once with Claude's standalone
    installer. The script downloads `install.sh` to a file, then runs it, with
    no Node, no npm and no password. It runs in the `engine-setup-install`
    terminal.
  - Shows a moving bar while installing.
  - A failure shows plain words, Try again, and Show details (the live terminal).
- **Your Claude account**
  - Sign in runs `claude auth login` in the `engine-setup-signin` terminal,
    which opens the browser.
  - The step reads `claude auth status --json` every 2 s until signed in.
  - Open the browser again restarts the sign in.
  - Show what Claude says reveals the live terminal, for the rare code paste.
- **Footer:** Back, Set up later (opens the office anyway), and Open the office
  (off until both rows are green).
- **Unreadable sign in state:** when the sign in state can't be read (an old
  Claude without `auth status`), it never blocks, and it never shows a green
  check either: the row reads "Could not check sign in" with Sign in and Use an
  API key.

**API key instead of a Claude account (D3).** Beside Sign in, Use an API key
opens one password field (an info icon says where to create a key).

- **Save:** sends the key to main once.
  - Main checks it with Anthropic (`GET /v1/models`, 10 s); a 401 or 403 reads
    as not accepted, anything else as unreachable.
  - Only a valid key is kept, write only, in the secret store as
    `apikey:anthropic` (the same Anthropic key as Settings, AI engines), and
    `claudeAuth` becomes `apiKey`. The key never comes back over IPC.
- **Every Claude start** (agents, and the hidden hire, focus and standing
  checks) gets `ANTHROPIC_API_KEY`. The key is approved first in
  `~/.claude.json` (`customApiKeyResponses.approved`, the key's last 20
  characters), so Claude never stops to ask about it.
- **The row then reads** "Using your Anthropic API key". Signing in with an
  account later switches `claudeAuth` back.

**Finding Claude.** The status, the install check and a Claude start look for
`claude` on the owner's PATH (captured once) and where Claude's installers put
it, including `%USERPROFILE%\.local\bin\claude.exe` on Windows, without
launching a login shell: a miss there froze the app for about a second.

**The key and the team's tools (D3).** Claude Code reads the key from its
environment, so the tools an agent runs can read it too. The key's info icon
says so and suggests a key with a spending limit. The key check goes through
Electron's network stack, which follows the system proxy.

**Writing Claude's settings file.** `~/.claude.json` is Claude Code's own file:
the app writes a copy beside it and swaps it in, and starts again when Claude
changed it in between. A key whose approval cannot be written is not saved
(fail closed), and the first account start of a session reads sign in once
before starting Claude.

**Claude's welcome screen.** A fresh Claude Code opens on a text style and sign
in screen that would also wait in the hidden terminal. `hasCompletedOnboarding`
is now set in `~/.claude.json` with the folder trust the app already writes.

**Ask me card.** While Michael's engine is Claude and it is missing or signed
out, Ask me holds a "Michael can't start yet" card, and the needs-you count
includes it.

- The card opens the same rows in a dialog.
- When Michael runs on another engine but a team member on Claude could not
  start, the card reads "Some of your team can't start yet".
- Claude turning ready restarts the members whose terminals could not start
  (`pendingRestart`, reason `engine`, now), however it turned ready: the card,
  setup, the browser, or an install outside the app. Main names them in the
  status (`restart`) until each starts; agents already at work are left alone.
- A slow or failed `claude auth status` keeps the last known sign in, so one
  bad read never shows a signed out owner as ready.
- The feed reads the status when a setup terminal ends, an agent can't start or
  a key is saved, and otherwise on the 5 s poll at most once a minute while
  Michael can't start, every 10 minutes once he can.

**At start.** A missing Claude no longer runs an installer in the agent's
terminal: it prints where to go (Ask me, Get Michael ready). Other engines keep
the install ladder unchanged.

## Not in scope

- Other engines (Codex, Gemini and the rest) keep their current ladder and the
  setup check for engines with no installer.
- A restart-proof record of an install interrupted by quitting the app: the
  step re-checks on open, and the installer is safe to rerun.

## Verification

- Typecheck clean; full suite green, including `test/get-michael-ready.test.cjs`.
- Reference shot of the Sign in state rendered from the real component.
- An invalid key against Anthropic's API returns 401 (probed 2026-10-07).
- Not yet run: Claude's installer, `claude auth login` and a real API key start on a bare Mac.
