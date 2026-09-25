/**
 * Surfaces this build hides from the owner. The code behind each stays wired,
 * so bringing one back is flipping its switch here and nothing else.
 */

/** Git: the agents' GIT sidebar tab, and the IDE's CHANGES / HISTORY / COMPARE
 *  rail (the only git view Michael had). Business owners never use version
 *  control, and a diff view reads as something broken (owner, 2026-09-23). */
export const SHOW_GIT = false;

/** The IDE: the full window code editor with a file tree, opened from the IDE
 *  button on every agent (Michael's panel, the agent panel, focus mode) and
 *  from file links in a terminal. Owners don't edit code; a file link now shows
 *  the file in Finder instead (owner, 2026-09-23). */
export const SHOW_IDE = false;

/** Temporary helpers Michael starts on his own (spawn requests → ephemeral
 *  workers), plus the Settings toggle that allowed it and the WORKERS tab that
 *  listed them. Off in this build: starting an agent is a spend the owner never
 *  saw. When a job fits no one on the team and is too big for Michael, he puts
 *  it on the ASK ME board with suggestions instead (owner, 2026-09-24). */
export const ALLOW_TEMP_WORKERS = false;

/** ORGANISATION: an org key that would let teammates' offices message this
 *  one. Configuration only (no transport reads the key yet), so it is hidden
 *  from the Triggers tab and Settings → Connections, and a leftover key no
 *  longer surfaces the History tab (owner, 2026-09-24). */
export const SHOW_ORG_TRIGGER = false;

/** Anonymous usage stats (TELEMETRY.md): the "Share anonymous usage stats" row
 *  in onboarding, the switch in Settings → General, and sending itself. Off
 *  until the owner decides whether to collect anything at all. While off,
 *  nothing is sent even if a release is built with a PostHog key, so the app
 *  never sends without having shown the choice (owner, 2026-09-24). */
export const COLLECT_USAGE_STATS = false;

/** The "auto mode on / off" text in the header bar. It named a developer
 *  setting in words owners don't use, and it wasn't clickable. The setting
 *  itself is unchanged and stays in Settings → Autonomy & Budgets
 *  (owner, 2026-09-24). */
export const SHOW_AUTO_MODE_LABEL = false;

/** The red close button on a team member's panel and in its full screen view.
 *  It stopped the agent mid-task and archived it, with no button to bring it
 *  back and no return on relaunch, behind a confirm that spoke of a "PTY"
 *  (owner, 2026-09-24). Michael never had it. */
export const SHOW_CLOSE_AGENT = false;

/** "Open a Terminal window here": the open button next to edit on each agent,
 *  the same button in the full screen view, and the terminal icon beside each
 *  folder in Michael's Command Center. A developer tool owners don't use
 *  (owner, 2026-09-24). */
export const SHOW_OPEN_TERMINAL = false;

/** The Auto / Pause switch in Michael's Command Center header, which holds
 *  every queued message for every agent. A power-user control owners had no
 *  use for (owner, 2026-09-24). While it is hidden, a pause saved earlier is
 *  cleared at launch, so no one is left with messages held and no switch to
 *  release them. */
export const SHOW_DELIVERY_SWITCH = false;

/** Hiring by voice: voice Michael's spawn_agent tool, the hiring lines in his
 *  instructions, and the main process accepting a spawn request from him. Off
 *  for now (owner, 2026-09-24); the rest of voice Michael is unchanged. */
export const ALLOW_VOICE_HIRE = false;
