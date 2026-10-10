# Windows 11 installable

Owner, 2026-10-04: "we have users asking for windows 11 installable."

## Where things stand (audit, 2026-10-04)

- Releases are Mac only by the owner's call of 2026-09-24 (`.github/workflows/release.yml`:
  "Mac only for now ... restore their matrix rows below to ship them again"). The
  `windows-2022` / `--win` matrix row is commented out; no Windows build has shipped
  since 0.0.1.
- `electron-builder.yml` still configures Windows: `nsis` installer and a `portable`
  exe, `build/icon.ico`, the `dontbemichael://` protocol registered through NSIS, and
  electron-updater (`latest.yml`) on GitHub releases.
- 19 source files already branch for Windows, inherited from the cross-platform base:
  named pipes for the hook socket (`src/main/hive.ts:664`), `hive-node.cmd`, Windows
  hook commands (`hive.ts:2762`, `:2813`, `:2915`), junctions instead of symlinks,
  `.cmd` shim handling (`src/main/pty.ts`), Node and CLI installers (`nodeInstall.ts`,
  `cliInstall.ts`), shell env (`shellEnv.ts`). Tests: `hive-windows-prompt`,
  `win-cmd-shim`, junction rows in fs tests.
- Platform seams, corrected by the spec review (2026-10-04) against the code:
  - already Windows aware: `procKill.ts` (`ensureKilled` uses `taskkill` on win32,
    :98, so `ps` never runs there), `memory.ts:158` (`where mempalace`), `docText.ts:342`
    (.doc/.rtf say "can only be read on a Mac for now" off macOS; .docx, .xlsx and PDF
    read everywhere), `macOcr.ts:72` (returns "unsupported" off macOS), hook commands
    (`node <shim>` form on win32, `hive.ts:2762`, `:2813`)
  - no Windows branch: `index.ts:3683` `open -a Terminal` (open a terminal at a folder)
- CI (`ci.yml`) runs typecheck and build only; no job runs the test suite on any OS.
  The suite is `node --test test/*.test.cjs` (`test:focused`), on Node 20.
- RELEASE.md says "This release is for Mac only. Windows and Linux will follow."
- Settings already has "Report a problem" (`SettingsHeroCard.tsx:109`, `/issues/new`).
- TODOS.md already lists two Windows items: retry the secrets rename (antivirus holds
  the file) and the `claude.cmd` status check (`execFile` refuses `.cmd`).
- Owner memory said "no outside users yet" on 2026-10-03; this request is the first
  outside demand.

## Field findings on a Windows office (2026-10-09)

Seen on a Windows 11 PC without Git for Windows, checked against Claude Code
2.1.296, and fixed in code:

- **Hooks run in PowerShell there.** Claude Code runs hook and status line
  commands in bash when it finds Git Bash (`CLAUDE_CODE_GIT_BASH_PATH`, the
  Program Files Git folders, or `git` on PATH), and otherwise in PowerShell. It
  does not use cmd.exe. The app wrote `"<launcher>" "<cth-hook.cjs>"`, which
  PowerShell refuses ("Unexpected token"), so every hook failed. `hookShell.ts`
  now finds Git Bash the same way. Each hook names its shell, and its command is
  written for that shell: `& '<launcher>' '<cth-hook.cjs>'` under PowerShell.
  The status line takes no `shell` and no `args`, so it runs in Claude Code's
  default shell. A Git Bash the app found is passed to the agent as
  `CLAUDE_CODE_GIT_BASH_PATH`, so both pick the same one. This settles E3:
  current Claude Code runs without Git Bash, so no Git for Windows step is needed.
- **No sandbox.** Claude Code has no sandbox on Windows. Team members'
  `allowUnsandboxedCommands: false` made it refuse every shell command ("Shell
  command execution is blocked by policy"). The app now leaves that setting off
  on Windows (owner, 2026-10-09). The file tool deny rules still keep each team
  member to its own folder; shell commands are not limited there yet.

## Draft scope (from the request)

- A Windows 11 installer people can download and run, and an office that works on it.
- Everything else pending review.

## Step 0 (CEO review, 2026-10-04)

### 0A. Premise
The real problem: people who want the office run Windows 11 and cannot install it.
The pain is direct (no installer at all), not a proxy. Do nothing: every Windows
prospect is lost at the download step, and the Windows code paths keep rotting
untested while the office grows on macOS only.

### 0B. What already exists
| Sub-problem | Existing code | Gap |
|---|---|---|
| Installer | electron-builder `win` (nsis, portable), icon.ico | release matrix row off |
| Updates | electron-updater, `latest*.yml` uploaded by release.yml | never exercised on Windows |
| Agent plumbing | named pipe hooks, hive-node.cmd, junctions, .cmd shims | untested since 0.0.1 on newer features |
| Platform seams | Windows branches in procKill, memory, docText, macOcr, hook commands | `open -a Terminal` only; the rest need Windows tests |
| Trust | Apple signing and notarization | no Windows signing: SmartScreen warns on an unsigned installer |

### 0C. Twelve months
```
  CURRENT                         THIS PLAN                          12-MONTH IDEAL
  Mac DMG only; Windows code  ->  a Windows 11 installer that    ->  Mac and Windows are both
  dormant and untested            installs, updates and runs the     first class: every release
                                  office, proven on a real machine   builds, tests and signs both
```

## Decision ledger

| ID and owner | Contract and evidence | Current | Proposed | Status | Exact approval and scope |
|---|---|---|---|---|---|
| A1 approach (owner) | request 2026-10-04; release.yml Mac only 2026-09-24 | A: Windows beta every release | none | approved | D1 answer A (2026-10-04): Windows build on every v* tag, windows-latest CI test job, the 6 Mac only seams fixed with tests, one real Windows 11 install before the first release, labeled "Windows (beta)"; signing left to its own decision. Corrected by spec review: the seams are 1 fix plus 5 Windows tests (item 3) |
| E1 code signing (owner) | SmartScreen warns on unsigned installers; release.yml signs Mac only | Add | none | approved | D3 answer A (2026-10-04, after clarifying that wiring never blocks installs): release.yml signs Windows builds only when signing secrets exist, unsigned otherwise; owner sets up the signing account when they choose. Wiring deferred by R5 (TODOS.md) |
| E2 known Windows TODOs (owner) | TODOS.md: secrets rename retry, claude.cmd status check | Add | none | approved | D4 answer A (2026-10-04): fix the secrets rename retry and the claude.cmd status check, each with a test; close both TODOS.md entries |
| E3 Git for Windows in onboarding (owner) | no Git Bash handling in src (grep); Claude Code on Windows needed Git Bash (verify) | Add | none | approved | D5 answer A (2026-10-04): Windows onboarding checks for Git for Windows with a download link and Check again, only if the Windows test machine confirms current Claude Code needs it; dropped otherwise |
| E4 beta label and feedback (owner) | A1 says labeled beta; no in-app label exists | Add, all builds | none | approved | D6 answer (2026-10-04): "i would like this beta pill with report a problem for mac build as well": a Beta pill by the version with an InfoTip and a Report a problem link that opens a prefilled GitHub issue (app version, OS and OS version), on Mac and Windows builds |
| E5 Windows download on the website (owner) | website is a separate repo; push there is a production deploy | Add | none | approved | D7 answer A (2026-10-04): a Windows (beta) download on the website, made in the website repo and published the day the first Windows beta ships; the production push is confirmed with the owner at that time |
| R1 Windows never blocks Mac (owner) | spec review: publish `needs: build` | Mac ships even if Windows fails | none | approved | D8 answer A: the Windows leg may fail on its own; publish goes ahead with the Mac assets and the run shows Windows red |
| R2 installer only (owner) | electron-builder.yml win: nsis + portable | NSIS only | none | approved | D9 answer A: drop the portable target |
| R3 x64 only (owner) | electron-builder.yml builds x64 | x64 only | none | approved | D10 answer A: x64; release notes say ARM Windows PCs are not supported in the beta |
| R4 test machine (owner) | x64 needed; Apple Silicon VMs run ARM Windows | physical x64 Windows 11 PC | none | approved | D11 answer B: a physical x64 Windows 11 PC the owner or someone they trust has |
| R5 signing provider (owner) | new keys must be in hardware or a cloud vault | decide at sign up | none | approved | D12 answer C: no signing wiring now; E1 waits in TODOS.md until a service is chosen; Windows beta ships unsigned |
| R6 Mac test job in CI (owner) | spec review: ci.yml runs no tests | Windows only | none | approved | D13 answer B: add only the windows-latest test job. Superseded 2026-10-09 (owner): ci.yml runs a macOS test job too |
| R7 rc builds update (owner) | updateState.ts:86 isNewer ignores -rc.N; check-release-links.cjs:37,:49 | prerelease aware | none | approved | D14 answer A: isNewer orders X.Y.Z-rc.1 < X.Y.Z-rc.2 < X.Y.Z, other callers (updateState.ts:58, updater.ts:232) checked, tests pin each case and a refused downgrade; check-release-links learns -rc.N |
| R8 red Windows leg on a clean tag (owner) | R1; updater.ts:430/445 installerUrl for win32 | ship without Windows | none | approved | D15 answer B: release notes drop the Windows row for that version, the website keeps the last good Windows link, and a missing latest.yml is treated as no update |
| R9 Windows CI job gate (owner) | ci.yml build job is continue-on-error | required after clean up | none | approved | D16 answer A: advisory during the first POSIX triage, then required to merge, within this plan |
| R10 Windows go-live switch (owner) | spec review pass 3: a clean tag before the PC check would ship Windows | repository variable | none | approved | D17 answer A: Windows builds on every tag; publish attaches Windows files to a clean release only when the repository variable WINDOWS_RELEASE=on, which the owner sets after the rc check passes |
| S1 hook pipe squatting (Section 3) | hive.ts:664 pipe name = sha1(hive root), guessable; hooks.ts:201 server has no auth | secret pipe name per launch | none | approved | D19 answer A: a random pipe name per app launch, written to the user's hive folder for the shims; the app refuses to start the office if the name is taken; tests for both |
| S2 hostile Windows environments (Section 4) | checklist covers a clean simple account only | three rows added | none | approved | D20 answer A: the PC checklist adds a Windows account named with a space and an accent, an office folder inside OneDrive, and a task creating a deep folder path, each with an expected result |
| S3 copy diagnostics (Section 8) | E4 report link carries versions only | deferred | none | deferred | D21 answer B: TODOS.md entry "Copy diagnostics for problem reports" |

Mode: SELECTIVE EXPANSION (D2 answer A, 2026-10-04). Approved: A1, E1 to E5, R1 to R10.

## Accepted scope (working plan)

0. **Claude Code smoke test on the Windows PC first (R4, E3 sequencing).** Install
   Claude Code on the clean PC and start one session. Whether it needs Git for
   Windows decides E3 before any E3 code is written.
1. **Windows build on every release (A1, R1, R2, R3).** Restore the Windows row in
   `release.yml` on `windows-latest` (one image for CI and release), x64 NSIS installer
   only (drop `portable`). Add `shell: bash` to "Package installers" (the default shell
   on Windows runners is pwsh). The Windows leg alone is allowed to fail
   (`continue-on-error: ${{ matrix.os == 'windows-latest' }}`, so a Mac failure still
   stops the release); publish runs with the Mac assets and the run shows Windows red.
   Clean releases attach Windows files only when the repository variable
   `WINDOWS_RELEASE` is `on` (R10); prerelease (`-rc.N`) tags always attach them.
   RELEASE.md marks its Windows block between `<!-- windows -->` comments; publish
   strips that block from the body when `release/*.exe` is missing or the switch is
   off (R8). Windows download links are tag pinned (`/releases/download/vA.B.C/...`),
   on the website and in RELEASE.md, so a release without Windows never breaks them.
   In the app (R8): the updater's error handler (`updater.ts:526`) maps a missing
   `latest.yml` to `not-available`, and `fallbackCheck` (`updater.ts:430/445`) offers a
   release only when its assets include the platform installer; a test for each. Upload the
   `.exe`, `.exe.blockmap`, `latest.yml` and SHA256 sums. RELEASE.md gets a Windows
   (beta) row and section: x64 only, ARM not supported, and the unsigned "Windows
   protected your PC: More info, Run anyway" steps. `tools/check-release-links.cjs`
   learns the Windows asset name. `docs/FEATURES.md` entry on land.
2. **Windows tests in CI (A1, R6).** A `windows-latest` job runs `npm ci` (with install
   scripts; never `--ignore-scripts`) and the test suite through a small cross-platform
   runner (`tools/run-tests.cjs` lists `test/*.test.cjs`; Node 20 has no `--test` glob
   and cmd.exe does not expand `*`). The first run's POSIX-only failures are triaged:
   fix, or skip on win32 with a one-line reason. No Mac test job (R6, superseded 2026-10-09: ci.yml now runs one); `test:focused` switches to the same runner on every platform.
   The Windows job (`test-windows`) is advisory during the first triage; once it is
   green, the owner adds it as a required check in branch protection (a repository
   setting, owner approved), per R9.
3. **Platform seams (A1, corrected).** One fix: open a terminal at a folder on Windows
   (`wt.exe -d <cwd>`; when spawning it fails with ENOENT, spawn `cmd.exe` with
   `windowsVerbatimArguments: true` and `/c start "" /D "<cwd>" cmd`; the test covers a
   folder path with spaces); the button label stays
   neutral ("Open in terminal"). Windows behavior tests for the five already branched
   seams. .doc/.rtf keep their accurate "Mac for now" message.
4. **Real install check on prerelease tags (A1, R4).** On the physical x64 Windows 11
   PC, made clean each time (uninstall, delete `%APPDATA%\Don't Be Michael`, the hive home
   chosen at onboarding (`HarnessAgents` by default) and the test office folder, then
   install): set package.json and the RELEASE.md asset names to
   `X.Y.Z-rc.1`, tag `vX.Y.Z-rc.1` (a prerelease, which `/releases/latest` skips),
   install it and run the checklist; repeat with `rc.2` and confirm the app updates
   itself to it (R7). Set them back to `X.Y.Z` for the clean tag.
   The rc commits land on a `release/X.Y.Z` branch; the commit that sets `X.Y.Z` back is
   the one the clean tag points at, merged to main as usual; only tags are pushed for
   releases. After the check passes the owner sets `WINDOWS_RELEASE=on` (R10). Only after both pass does the clean `vX.Y.Z` tag carry Windows to
   users. Checklist, each with its expected result:
   - install: SmartScreen warning, More info, Run anyway; app opens, no error
   - onboard: office folder chosen, Michael starts and answers in his terminal
   - hire: a hire's pod appears and its terminal starts
   - task: a request to Michael reaches a team member and the card moves
   - mail: a mailbox connects and search in folder "archive" returns ids
   - schedule: a scheduled run fires and shows on the floor
   - update: rc.1 offers rc.2, restarts into it, the office reopens
   If any step fails, nothing ships to Windows users: fix and repeat from rc.N+1.
   Owner, 2026-10-05: `WINDOWS_RELEASE` is on before this check, so every clean release
   carries Windows (v0.1.1 got its installer after release). The check still runs to
   confirm it works (TODOS.md).
5. **Signing (E1, R5):** deferred. TODOS.md entry: pick Microsoft Trusted Signing or a
   vendor cloud HSM (DigiCert KeyLocker, SSL.com eSigner), then wire release.yml so
   absent secrets mean an unsigned build and no failure.
6. **Two known Windows bugs (E2):** secrets rename retry, `claude.cmd` status check.
7. **Git for Windows check in onboarding (E3),** only if step 0 shows it is required.
8. **Beta pill and Report a problem, every build (E4):** extend the existing Settings
   "Report a problem" link to `/issues/new?template=bug_report.yml&app-version=..&os=..&os-version=..`
   (the form's field ids; nothing else in the URL), and verify GitHub prefills the `os`
   dropdown the OS labeler reads. Add a Beta pill beside the version in Settings with an
   InfoTip of one line. Strings in en, zh-CN and ar, no dashes. No second link.
10. **Secret hook pipe name on Windows (S1):** a random pipe name per app launch, written
   to the user's hive folder; the shims read it; the app refuses to start the office if
   the name is already taken. Tests for both.
11. **Real PC setups on the checklist (S2):** a Windows account named with a space and an
   accent; an office folder inside OneDrive; a task that creates a deep folder path. Each
   expects the office to run with no path or lock error.
9. **Windows (beta) download on the website (E5),** website repo, published the day the
   first clean Windows release ships; the production push is confirmed with the owner.

## A1 answer (history)
D1 answer A: Windows beta every release.

Documents approved: D18 answer A (2026-10-05).

## 0I. Build sequence

```
  HOUR 1 (foundations):  smoke test Claude Code on the Windows PC (item 0) to settle E3;
                         tools/run-tests.cjs; isNewer prerelease order (R7) with tests
  HOUR 2-3 (core):       release.yml Windows leg (shell: bash, per leg continue-on-error,
                         WINDOWS_RELEASE gate, <!-- windows --> strip); check-release-links
                         -rc.N; updater 404 -> not-available and installer-asset check (R8)
  HOUR 4-5 (integration): ci.yml test-windows job and the first POSIX triage; terminal at
                         folder (wt.exe, cmd.exe verbatim); secrets rename retry; claude.cmd
                         status (E2); Beta pill and prefilled report link (E4)
  HOUR 6+ (proof):       rc.1 and rc.2 on the Windows PC with the checklist; owner sets
                         WINDOWS_RELEASE=on and the required check; website link (E5)
```
Effort: human team about 1 to 2 weeks; CC + gstack about 3 to 4 hours of code plus the
owner's Windows PC session. Feasibility blockers: none known; the Windows PC and the
owner's switch flip are the external dependencies.

Approval readiness: PASS (A1 D1, E1 D3, E2 D4, E3 D5, E4 D6, E5 D7, R1 D8, R2 D9, R3 D10,
R4 D11, R5 D12, R6 D13, R7 D14, R8 D15, R9 D16, R10 D17, S1 D19, S2 D20, S3 D21; documents D18)

## Review sections (CEO review, 2026-10-04 to 05)

| Section | Findings | Disposition |
|---|---|---|
| 1 Architecture | rollback is the WINDOWS_RELEASE switch plus R8; no new coupling | OK |
| 2 Errors | covered by approved items (wt.exe ENOENT fallback, E2 retry, R8 updater) | OK |
| 3 Security | **S1** guessable Windows hook pipe, unauthenticated server | fixed (D19) |
| 4 Data and edge cases | **S2** real PC setups untested | checklist rows added (D20) |
| 5 Code quality | follows the existing `process.platform === 'win32'` branching | OK |
| 6 Tests | approved tests carried; Windows `npm ci` native rebuild time noted | OK |
| 7 Performance | Defender scanning may slow agent start; the PC check records start time | WARNING, measured in item 4 |
| 8 Observability | **S3** reports carry versions only | deferred to TODOS.md (D21) |
| 9 Deploy | gated by R10, rollback by switch | OK |
| 10 Long term | reversibility 4/5; debt: signing, diagnostics, no Mac CI tests | recorded |
| 11 Design | UI scope: Beta pill, prefilled report link, Git check step, terminal label | /plan-design-review recommended |

## NOT in scope

- Deferred: Windows signing wiring (R5, TODOS.md "Sign the Windows installer"); Copy
  diagnostics (S3, TODOS.md "Copy diagnostics for problem reports").
- Rejected: portable exe (R2); native ARM build (R3); Mac test job in CI (R6); a Windows
  reader for .doc/.rtf (keeps the accurate "Mac for now" message).

## Dream state delta

After this plan Windows is a tested beta on every release with a go-live switch, CI tests
and a real PC check. Left for the 12-month ideal: signing, Mac CI tests, a native ARM
build, and an automated install test on a Windows runner.

## Error and rescue registry

| Codepath | Failure | Rescue | User sees |
|---|---|---|---|
| open terminal at folder (index.ts:3683) | wt.exe missing (ENOENT) | cmd.exe fallback, verbatim args | a terminal at the folder |
| same | cmd.exe fails | return { ok: false, error } | the existing error toast |
| secrets save (atomicFile.ts) | rename EPERM/EBUSY/EACCES | 3 retries at 100, 300, 900 ms (E2) | saved, or the existing error |
| claude status (claude.cmd) | execFile refuses .cmd | run through the pty .cmd shim handling (E2) | the real status |
| hook pipe listen (S1) | name taken | refuse to start the office | a clear error, office not started |
| updater native check (updater.ts:526) | latest.yml 404 | map to not-available (R8) | "Up to date" |
| updater fallback (updater.ts:430/445) | release lacks the platform installer | offer nothing (R8) | "Up to date" |
| release publish | Windows leg red or switch off | strip the windows block, Mac only (R8, R10) | release notes without Windows |

## Failure modes registry

```
  CODEPATH            | FAILURE MODE            | RESCUED? | TEST? | USER SEES?        | LOGGED?
  --------------------|-------------------------|----------|-------|-------------------|--------
  release Windows leg | build fails             | Y (R1)   | Y CI  | Mac only release  | Y run log
  publish             | missing exe, switch off | Y (R8)   | Y     | no Windows row    | Y run log
  updater             | no latest.yml           | Y (R8)   | Y     | Up to date        | Y
  hook pipe           | squatted name           | Y (S1)   | Y     | clear error       | Y
  terminal at folder  | no wt.exe               | Y        | Y     | cmd window        | N
  secrets save        | file held by antivirus  | Y (E2)   | Y     | saved             | Y
```
Critical gaps: 0.

## Diagrams

```
  RELEASE (R1, R8, R10)
  tag v* -> build matrix [mac (must pass)] [windows-latest (may fail)]
         -> publish: mac assets always
                     windows assets if leg green AND (rc tag OR WINDOWS_RELEASE=on)
                     else strip <!-- windows --> block from the notes

  GO-LIVE STATE
  [off: rc tags only] --rc.1 + rc.2 checklist pass--> owner sets WINDOWS_RELEASE=on
  [on: every clean tag] --problem--> owner sets off --> next release ships without Windows

  ROLLBACK
  Windows problem in the field -> WINDOWS_RELEASE=off -> next release Mac only;
  installed Windows users stay on their version (no latest.yml = no update)
```

Stale diagram audit: none of the touched files (release.yml, ci.yml, updater.ts,
updateState.ts, hive.ts, hooks.ts, index.ts) has an ASCII diagram made stale by this plan.

## Implementation Tasks
Synthesized from this review's findings. Effort ratios: features ~30x, tests ~50x.

- [x] **T1 (P1, human: ~2h / CC: ~10min)** — tests — `tools/run-tests.cjs`, `test:focused` uses it
  - Surfaced by: spec review, Node 20 has no `--test` glob; Verify: suite passes on Mac via the runner
- [x] **T2 (P1, human: ~4h / CC: ~15min)** — updater — `isNewerRelease` for update paths only (R7, G1), link check `-rc.N`
  - Files: `src/shared/updateState.ts`, `tools/check-release-links.cjs`; Verify: table tests incl. a refused downgrade
- [x] **T3 (P1, human: ~4h / CC: ~15min)** — updater — 404 latest.yml to not-available, fallback needs the platform asset (R8)
  - Files: `src/main/updater.ts`; Verify: a test for each path
- [x] **T4 (P1, human: ~1d / CC: ~30min)** — release — Windows leg, `shell: bash`, per leg continue-on-error, WINDOWS_RELEASE gate via `tools/release-assets.cjs` (drops only `*.exe`, `*.exe.blockmap`, `latest.yml`; never `latest-mac.yml`), windows block strip, NSIS only (R1, R2, R8, R10)
  - Files: `.github/workflows/release.yml`, `tools/release-assets.cjs` + table test, `electron-builder.yml`, `RELEASE.md`; Verify: an rc tag publishes both, a clean tag with the switch off publishes Mac only
- [x] **T5 (P1, human: ~1d / CC: ~30min)** — CI — `test-windows` job and the first POSIX triage (A1, R9)
  - Files: `.github/workflows/ci.yml`, tests; Verify: green on windows-latest
- [x] **T6 (P1, human: ~4h / CC: ~20min)** — security — random hook pipe name per launch, kept in memory and passed by `HIVE_SOCK` as today; listen errors stop the office with a clear message (S1, eng findings 1 and 2)
  - Files: `src/main/hive.ts`, `src/main/hooks.ts`; Verify: tests that the name is random per instance on win32 and that a taken name surfaces an office start error
- [x] **T7 (P1, human: ~4h / CC: ~15min)** — seams — terminal at folder on Windows; tests for the five branched seams (A1)
  - Files: `src/main/index.ts`, tests; Verify: a folder path with spaces
- [x] **T8 (P1, human: ~4h / CC: ~20min)** — bugs — secrets rename retry, claude.cmd status (E2)
  - Files: `src/main/atomicFile.ts`, status check; close both TODOS.md entries
- [x] **T9 (P2, human: ~4h / CC: ~20min)** — UI — Beta pill with InfoTip, prefilled Report a problem (E4)
  - Files: `SettingsHeroCard.tsx`, locales; Verify: URL carries only the three fields
- [ ] **T10 (P1, owner + CC)** — proof — Claude Code smoke (item 0), then E3 if needed; rc.1 and rc.2 checklist with S2 rows on the physical PC
- [ ] **T11 (P2, owner)** — go live — set WINDOWS_RELEASE=on, add `test-windows` as a required check, website link (E5, push confirmed)

## Completion Summary

```
  +====================================================================+
  |            MEGA PLAN REVIEW — COMPLETION SUMMARY                   |
  +====================================================================+
  | Mode selected        | SELECTIVE EXPANSION                         |
  | System Audit         | Windows dormant since 0.0.1; plumbing exists |
  | Step 0               | A1 beta; E1 to E5; R1 to R10 via spec review|
  | Section 1  (Arch)    | 0 issues found                              |
  | Section 2  (Errors)  | 8 error paths mapped, 0 GAPS                |
  | Section 3  (Security)| 1 issue found, 1 High severity (fixed, S1)  |
  | Section 4  (Data/UX) | 3 edge cases mapped, 0 unhandled (S2)       |
  | Section 5  (Quality) | 0 issues found                              |
  | Section 6  (Tests)   | Diagram produced, 0 gaps                    |
  | Section 7  (Perf)    | 1 issue found (measured in the PC check)    |
  | Section 8  (Observ)  | 1 gap found (deferred, S3)                  |
  | Section 9  (Deploy)  | 0 risks flagged                             |
  | Section 10 (Future)  | Reversibility: 4/5, debt items: 3           |
  | Section 11 (Design)  | 4 UI items; design review recommended       |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (6 items)                           |
  | What already exists  | written                                     |
  | Dream state delta    | written                                     |
  | Error/rescue registry| 8 rows, 0 CRITICAL GAPS                     |
  | Failure modes        | 6 total, 0 CRITICAL GAPS                    |
  | TODOS.md updates     | 2 items added                               |
  | Scope proposals      | 5 proposed, 5 accepted (EXP + SEL)          |
  | CEO plan             | written                                     |
  | Outside voice        | codex skipped (owner rule)                  |
  | Lake Score           | 1/2 recommendations chose complete option   |
  | Diagrams produced    | 3 (release, go-live state, rollback)        |
  | Stale diagrams found | 0                                           |
  | Unresolved decisions | 0                                           |
  +====================================================================+
```

## Eng review (2026-10-05)

Target: `docs/designs/windows-11-installer.md`. Focus: release.yml gating, the rc-aware
update check, the S1 hook pipe fix.

Scope record: feature answers: none proposed; structure: original arrangement (owner
rule: no file or module layout questions); accepted scope: the plan as CEO cleared;
pending remedies: G1.

Scope Challenge findings:

1. [P2] (confidence: 9/10) src/main/hive.ts:1088, :1226 `env.HIVE_SOCK = sock`: the pipe
   name already reaches every agent through its environment at spawn. S1 needs no file
   in the hive folder: a random name generated once per app launch, kept in memory and
   returned by `sockPath()`, gives the approved guarantee. Factual correction to S1's
   mechanism; behavior unchanged.
2. [P1] (confidence: 9/10) src/main/hooks.ts:237 `this.server.on('error', (e) =>
   console.error(...))`: a failed listen is only logged and the office runs with no hook
   reports. S1's "refuse to start the office if the name is taken" needs this error
   surfaced as an office start failure. Implementation of approved S1.
3. [P1] (confidence: 9/10) .github/workflows/release.yml "Flatten" step copies
   `latest*.yml`, which matches both `latest-mac.yml` and Windows' `latest.yml`. The R10
   gate must drop only `*.exe`, `*.exe.blockmap` and `latest.yml`; a `latest*.yml`
   filter would stop every Mac auto update. Put the selection in a small script
   (`tools/release-assets.cjs`) with a table test. Implementation of approved R8/R10.
4. [P2] (confidence: 9/10) `isNewer` has 9 callers, not 2: updateState.ts:58, :123,
   :167; updater.ts:232, :295; cliUpdate.ts:41, :43; modelCliFloor.ts:42;
   config.ts:382, :383. Decision G1.

## Eng decision ledger

| ID and owner | Contract and evidence | Current | Proposed | Status | Exact approval and scope |
|---|---|---|---|---|---|
| G1 rc order mechanism (owner) | R7 approved isNewer prerelease order; 9 callers incl. CLI floors and model app version gates | isNewerRelease for app update paths only | none | approved | eng D1 answer A (2026-10-05): add isNewerRelease (prerelease aware) used by updater.ts:232, :295 and updateState.ts:58, :167; isNewer and its other callers (incl. the deliberate updateState.ts:123) unchanged; table test. History: R7 text said isNewer itself |

Approval readiness: PASS (G1 eng D1; findings 1 to 3 implement approved S1, R8, R10)

### Eng sections

1. Architecture: no new issues; publish runs with Mac files when the Windows leg fails because a `continue-on-error` matrix leg reports success to `needs`.
2. Code quality: no issues; `isNewerRelease` beside `isNewer` with a comment naming why both exist.
3. Tests: diagram below; 0 gaps beyond the planned tests.
4. Performance: no issues.

```
CODE PATHS                                            USER FLOWS
[+] src/shared/updateState.ts isNewerRelease          [+] rc update on the Windows PC
  ├── [GAP→T2] rc.1 < rc.2 < release; downgrade refused   └── [GAP→T10] rc.1 offers rc.2, restarts into it
[+] src/main/updater.ts                               [+] Windows user after a red clean tag
  ├── [GAP→T3] 404 latest.yml -> not-available           └── [GAP→T3] "Up to date", no error loop
  └── [GAP→T3] fallback needs the platform asset
[+] tools/release-assets.cjs                          [+] Mac user after any release
  ├── [GAP→T4] switch off: drop exe, blockmap, latest.yml └── [GAP→T4] latest-mac.yml always kept
  └── [GAP→T4] rc tag: keep all
[+] src/main/hive.ts sockPath / hooks.ts listen       [+] shared Windows PC
  ├── [GAP→T6] random per launch on win32                └── [GAP→T6] taken pipe stops the office, clear error
  └── [GAP→T6] listen error surfaces
[+] tools/run-tests.cjs [GAP→T1]  terminal at folder [GAP→T7]  secrets retry, claude.cmd [GAP→T8]
COVERAGE: 0/16 today (new code), all planned ★★★
```

Outside voice: skipped (owner rule: Codex adversarial only; no subagent fallback).
NOT in scope (eng): changing `isNewer` for CLI and model checks (G1).
Failure modes: 0 critical gaps (every new path has a planned test and visible handling).
Parallelization: Lane A T1 → T5; Lane B T2 → T3; Lane C T4; Lane D T6, T7, T8; then T9; T10 and T11 after merge. Conflict: `src/main/index.ts` (T7) and `hive.ts` (T6) are separate files; none shared across lanes.

### Eng completion summary
- Step 0: Scope Challenge, scope accepted as-is
- Architecture Review: 0 issues found; Code Quality Review: 0; Test Review: diagram produced, 0 extra gaps; Performance Review: 0
- Scope Challenge findings: 4 (1 reopened decision, 3 implementation corrections)
- TODOS.md updates: 0; Failure modes: 0 critical gaps; Unresolved decisions: 0
- Outside voice: codex, skipped; Parallelization: 4 lanes
- Lake Score: N/A (G1 offered no 10/10 option)

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 3 | clean | 5 proposals, 5 accepted, 0 deferred (plus R1 to R10, S1 to S3) |
| Outside Review | codex plan review | Independent 2nd opinion | 10 | skipped | owner rule: Codex adversarial only; no completed external review |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 7 | clean | 0 issues, 0 critical gaps (4 scope findings resolved: G1 decided, 3 corrections) |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | not run for this plan | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** codex, plan-review phase, skipped by the owner's standing rule.
- **VERDICT:** CEO + ENG CLEARED — ready to implement.

NO UNRESOLVED DECISIONS
