# Contributing to Don't Be Michael

Thanks for your interest! This is an early prototype, so there's a lot of surface
area and plenty of room to help. This guide covers setup, the gotchas, and the
conventions that keep the codebase coherent.

## Code of Conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md). By
participating, you agree to uphold it.

## Before you start

These are the constraints most pull requests trip over. Reading them first is
much cheaper than finding out in review.

- **Keep the change scoped to one clear improvement, fix, or refactor.** A fix
  plus a rename plus a refactor is three pull requests, and all three merge
  faster than the one.
- **Releases are Mac only for now, but the code runs on macOS, Windows and
  Linux.** Every change has to keep working on all three unless it sits behind an
  explicit runtime platform check, so the other two can ship later. Most
  of our cross-platform bugs are paths: use `path.join` and the Node path
  helpers, never a hand-built `"a/b"` string.
- **Paths with spaces are real.** Several shipped bugs came from a hive folder
  living under a directory with a space in its name. Quote, and test one.
- **The code carries twelve agent CLIs; this build offers one.** Setup offers
  only the engines in `BUILD_ENGINES` (`src/shared/agentProvider.ts`), which is
  Claude Code today, but every other preset stays wired so it can come back by
  adding its id there. Keep shared behaviour provider neutral and put provider
  specific logic behind an explicit check. Anything that assumes Claude Code
  specifically will break the other eleven when they return.
- **Hidden surfaces have one switch each.** Git views, the IDE, temporary
  workers, voice and the organisation trigger are off in this build through
  `src/shared/buildFeatures.ts`. Gate new code for those surfaces on the same
  constant instead of deleting or forking it.
- **Owner facing text is plain words with no dashes.** The product is for small
  business owners. No em dash, en dash, or hyphen used as punctuation in UI
  strings, Office Packs, or reasons shown in the app; `test/no-dashes.test.cjs`
  enforces it. Strings that name the manager use `{{godName}}`, never a literal
  "Michael" (`test/i18n-god-name.test.cjs`), because an office may have given
  him another name before renaming him was removed.
- **Nothing points at the upstream project.** Updates, fetched content, links
  and the URL scheme all belong to this repo; `test/no-upstream.test.cjs`
  scans `src/`, `resources/`, `scripts/`, `tools/`, `.github/`, this file and
  `SECURITY.md`. Credit for the upstream project stays in the
  Acknowledgements section of `README.md`.
- **Do not assume the local machine.** Agents run against their own working
  directories and their own environments; a process, file, credential or shell
  that exists on yours may not exist on theirs.
- **New UI derives from the design tokens.** [`branding/DESIGN.md`](./branding/DESIGN.md) is
  canonical. No ad-hoc colors, spacing or fonts.

## Development setup

### Prerequisites

- **macOS, Windows, or Linux** to build and run from source. Releases on the
  [releases page](https://github.com/agentvivekkumar/dontbemichael/releases/latest)
  are Mac only for now, and not yet signed with an Apple Developer ID.
  Cross-platform smoke-testing and fixes are very welcome (see
  [Good first areas](#good-first-areas)).
- **Node.js 18+** and npm.
- A **C/C++ toolchain** to build `node-pty`'s native addon. On macOS:
  ```bash
  xcode-select --install
  ```
  On Windows/Linux, follow [`node-pty`'s own prerequisites](https://github.com/microsoft/node-pty#dependencies).
- **[Claude Code](https://claude.com/claude-code)** on your `PATH` if you want
  agents to actually run `claude` (the default command). Any other command works.

### Install & run

```bash
git clone <your-fork-url> dontbemichael
cd dontbemichael
npm install        # postinstall rebuilds node-pty against Electron's ABI
npm run dev        # live-reloading Electron build
```

> [!IMPORTANT]
> **The most common setup failure is the native `node-pty` rebuild.** The
> `postinstall` script runs `electron-rebuild` so `node-pty` matches Electron's
> ABI. If you see a "wrong ELF/Mach-O" or "NODE_MODULE_VERSION" error at launch,
> re-run `npm install` (which re-triggers `postinstall`) after confirming your
> C/C++ toolchain is installed.

## Screenshots help

A before and an after make a change quick to review: screenshots, or a short
recording when the thing moves, in the PR description. They are welcome, not
required.

## Before you open a PR

1. **Keep the type-checker green:** `npm run typecheck` (runs both the node and
   web TS projects).
2. **Run the tests:** `npm run test:focused`. If you changed behaviour, add a
   test for it — a bug fix with no test is a bug fix that comes back.
3. **Confirm a production build works:** `npm run build`.
4. **Match the aesthetic.** Any new UI **must** derive from the design tokens in
   [`branding/DESIGN.md`](./branding/DESIGN.md) / `src/renderer/src/design/tokens.ts` — no ad-hoc
   colors, spacing, or fonts. `tokens.ts` and `tokens.css` are mirrored; if you
   change one, change both.
5. **Read your own diff.** Every line of it. Debug logging, commented-out code,
   and reformatting of files you didn't otherwise touch all get a PR sent back.
6. **Run your coding agent over your own PR, and paste what it found.** We ship
   an agent harness; use one. Ask it to check specifically for cross-platform
   behaviour, paths with spaces, whether the change stays provider neutral
   across the supported CLIs, performance in hot paths, and obvious security
   risk. A short honest summary including what it flagged and you decided not to
   change is worth more than a clean one, and it usually saves a review round
   trip. This is asked for, not required.

## Where the bar is

We get more pull requests than we can review carefully, so the bar is high and
it is easier for everyone if it is written down. Clear the list above and you
are almost certainly fine. The items below are the ones we close rather than
negotiate, and every one of them is cheaper to avoid than to fix in review:

- **More than one change in one PR.** A fix plus a refactor plus a rename is
  three PRs. Split it and every one of them merges faster.
- **Wholesale reformatting** of files, or a diff where the real change is buried
  in whitespace and import reordering.
- **A rewrite nobody asked for.** Large architectural changes need an issue or a
  [discussion](https://github.com/agentvivekkumar/dontbemichael/discussions) with
  agreement **before** you write the code. We would rather say no to a paragraph
  than to a week of your work.
- **Generated or unattributed content** — art that isn't yours or compatibly
  licensed, or a description that doesn't match what the diff does.
- **Dependency additions** that aren't justified in the description. A new
  runtime dependency needs a reason a one-file helper wouldn't have solved.
- **No response for 14 days** on review feedback. Reopen whenever you're ready;
  nothing is lost.

None of this is aimed at first-timers. A small, focused, well-explained PR from
someone who has never contributed before gets reviewed ahead of a big one from
someone who has.

## Project layout

| Path | What lives there |
|---|---|
| `src/main/` | Electron main process — PTYs (`pty.ts`), fs/git bridges, the hive (`hive.ts`, `hooks.ts`, `memory.ts`), config. |
| `src/preload/` | Context-bridge IPC surface. |
| `src/renderer/` | React UI, Pixi.js office scene (`scene/office/`), components, design system, stores. |
| `src/shared/` | Code both processes use: engine presets, Office Pack schema (`officePack.ts`), business profile, team plan, build switches (`buildFeatures.ts`), app name and URL scheme (`appName.ts`). |
| `resources/packs/` | The bundled Office Packs, one JSON file per business type plus `core.json`. |
| `test/` | The `node:test` suite that `npm run test:focused` runs. |
| `tools/mapgen/` | Python helpers for building/rendering the Tiled office map. |

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the data-flow overview,
the module by module layout, and the design system.

## Good first areas

- **Fuller avatar coverage.** Real Claude Code hook events drive the avatars;
  the synthetic loop in `src/renderer/src/store/mockEvents.ts` runs only in demo
  mode or when no agent is live. Some station visits and tool bubbles still
  need their real events.
- The add-agent flow and config drawer.
- Cross-platform smoke-testing. Windows and Linux builds don't ship yet, and
  real-world coverage (WSL2, various distros, uncommon shells) is thin.

## Commit & PR conventions

- Branch off `main`. One change per PR — see
  [Where the bar is](#where-the-bar-is).
- Write a clear description of *what* changed and *why*. We can read the diff;
  we cannot read your reasoning.
- Say how you tested it, and on which OS. "Tested locally" tells us nothing.
- Link the issue you're fixing: `Closes #123`.
- Don't commit `node_modules/`, `out/`, or built artifacts (already gitignored).
- Don't force-push after a review has started. It throws away the comparison the
  reviewer was working from.
- **Never put credentials, tokens, internal metrics, or customer data in a
  commit message.** A pushed commit message is public and permanent, and no
  later rewrite retracts it once it has been fetched.

## A note on assets

The bundled tilesets are LimeZu's *Modern Interiors*, used under the **Complete
Version licence**. See [`ATTRIBUTION.md`](./src/renderer/src/assets/ATTRIBUTION.md).
That licence requires credit to LimeZu, so don't remove the acknowledgement from
the README, the app, or the website. The Office cast is drawn procedurally in
`portraitArt.ts` and carries no third-party licence.
If you contribute new art, it must be either your own work or compatibly
licensed, and you must add it to `ATTRIBUTION.md`. Don't add unlicensed assets.

## Questions

Open a [discussion or issue](../../issues) — happy to help you get oriented.
