# Windows Shell Isolation - Design Draft

**Status:** Draft for maintainer review

**Issue:** #187 - Windows shell commands are not confined to each agent's folder

## 1. Problem and goals

On Windows, Claude Code's native shell sandbox is unavailable. The application therefore allows team members to run shell commands without OS-enforced filesystem confinement. Existing Claude file-tool deny rules do not confine shell commands or their child processes.

The goal is to enforce filesystem access boundaries at the Windows operating-system level while preserving normal office workflows.

The design must not claim isolation unless the operating system actually enforces it.

## 2. Candidate mechanism

**Proposal: prototype a Windows AppContainer-based launch boundary before committing to an implementation.**

An AppContainer can provide OS-enforced access restrictions that apply to filesystem operations performed by the confined process, rather than relying on checks of individual shell commands. The prototype must verify that the boundary also applies to child processes launched through PowerShell, `cmd.exe`, Git Bash, and Node.js.

AppContainer compatibility with Claude Code, node-pty, Git, user-profile files, authentication, networking, and the office's inter-process communication is not yet established.

A Job Object alone is not a filesystem security boundary. A restricted token alone should not be treated as sufficient without a verified access-control design. A separate low-privilege Windows account with carefully configured NTFS permissions is an alternative if AppContainer proves incompatible.

**Decision gate:** do not select a production mechanism until a Windows 11 prototype demonstrates both the required denials and the required office workflows.

## 3. Required access

The final Windows access policy must explicitly preserve these capabilities:

- Each team member can read and write its own folder.

- Each team member can clear and use its own inbox and outbox.

- Each team member retains the required write access to shared office folders.

- Michael can read team members' folders without being able to modify their contents.

- One team member cannot read or modify another team member's private folder through shell commands or any child process.

Before implementation, map these requirements to the actual paths and permissions in `sandboxWritableDirs` and the existing folder policy. Do not grant recursive write access to a shared parent if that would also grant write access to sibling agents' private folders.

The current `sandboxWritableDirs` helper returns the agent's own directory, the shared hive root, and any extra writable directories. These are application-level sandbox configuration paths, not a ready-made Windows ACL policy. The Windows design must translate them into explicit per-agent access rules: access to the shared root must not implicitly grant access to another agent's private directory. The prototype must verify the effective Windows permissions on the actual filesystem paths before this mechanism can be considered safe.

## 4. Launch path and fallback

The current PTY launch path in `src/main/pty.ts` uses `pty.spawn` with a working directory and environment. A working directory is not a security boundary. The Claude settings assembled in `src/main/hive.ts` configure Claude's existing permissions, but Windows currently has no native shell sandbox enforcement through that configuration.

The prototype must identify how to create the confined process and ensure child processes inherit the same effective restrictions. The launch boundary must not depend on recognizing or rewriting individual shell commands.

If the required Windows mechanism is unavailable or initialization fails, the office should still start, consistent with the existing unsandboxed fallback behavior on macOS. However, the application must not describe shell isolation as enforced in that state. The failure should be logged and surfaced clearly so the security limitation is visible.

## 5. Windows 11 validation plan

Run the tests on a real Windows 11 PC.

1. Start two team members, A and B, with separate private folders.

2. From A's shell, attempt to read a file in B's folder. Access must be denied.

3. From A's shell, attempt to create, modify, and delete files in B's folder. Each operation must be denied.

4. Repeat representative attempts through PowerShell, `cmd.exe`, Git Bash, and a Node.js child process.

5. Verify A can still read and write its own folder and clear its own inbox.

6. Verify required outbox and shared-office-folder workflows still work.

7. Verify Michael can read team folders but cannot modify them.

8. Verify the office still starts if the confinement mechanism is unavailable, and that the resulting unsandboxed state is clearly reported.

Tests that are Windows-specific must skip on other platforms, following the pattern in `test/claude-permissions-config.test.cjs`.

Automated configuration tests alone do not prove OS-level isolation. The security claim must be based on observed Windows access-control behavior.

## 6. Scope and next step

This document proposes a prototype and validation criteria, not a completed security fix. The immediate next step is maintainer review of the mechanism choice, access policy, and fallback behavior. Implementation and regression tests should follow once the design is agreed.
