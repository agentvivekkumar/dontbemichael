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
  Claude without `auth status`), it never blocks.

**Ask me card.** While Michael's engine is Claude and it is missing or signed
out, Ask me holds a "Michael can't start yet" card, and the needs-you count
includes it.

- The card opens the same rows in a dialog.
- Done restarts everyone on Claude: `pendingRestart` with reason `engine`, now.
- The feed reads the status when a setup terminal ends or an agent can't start,
  and at most once a minute on the 5 s poll.

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
- Not yet run: Claude's installer and `claude auth login` on a bare Mac.
