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

### 2.1 Child-process inheritance and validation

Microsoft documents that an unpackaged process running inside an AppContainer typically passes its AppContainer token to child processes created with `CreateProcess`. The inherited token includes the integrity level and AppContainer identity. This provides a basis for testing whether shell descendants remain subject to the same OS-enforced restrictions.

References:

- [Microsoft: AppContainer for legacy apps](https://learn.microsoft.com/en-us/windows/win32/secauthz/appcontainer-for-legacy-applications-)
- [Microsoft: Launch an AppContainer](https://learn.microsoft.com/en-us/windows/win32/secauthz/implementing-an-appcontainer)

This documented behavior is not, by itself, proof that the application's actual launch chain is confined. The implementation must verify the effective security context and access restrictions of the processes it launches. Any process creation path that changes the security token or escapes the intended boundary must be investigated.

**Grandchild-process test:** On Windows 11, launch PowerShell inside the proposed AppContainer, start `cmd.exe` from PowerShell, and start Node.js from `cmd.exe`. From the Node.js grandchild, attempt to read and modify a file in another member's private folder. The operations must be denied. Also verify that the processes have the expected AppContainer identity; a denied file operation alone does not establish that every descendant inherited the intended security context.

Repeat the test with representative Git Bash and Node.js child-process workflows. Record the results and any compatibility failures before claiming that the boundary is effective.

## 3. Required access

The final Windows access policy must explicitly preserve these capabilities:

- Each team member can read and write its own folder.

- Each team member can clear and use its own inbox and outbox.

- Each team member retains the required write access to shared office folders.

- Michael can read team members' folders without being able to modify their contents.

- One team member cannot read or modify another team member's private folder through shell commands or any child process.

Before implementation, map these requirements to the actual paths and permissions in `sandboxWritableDirs` and the existing folder policy. Do not grant recursive write access to a shared parent if that would also grant write access to sibling agents' private folders.

The current `sandboxWritableDirs` helper returns the agent's own directory, the shared hive root, and any extra writable directories. These are application-level sandbox configuration paths, not a ready-made Windows ACL policy. The Windows design must translate them into explicit per-agent access rules: access to the shared root must not implicitly grant access to another agent's private directory. The prototype must verify the effective Windows permissions on the actual filesystem paths before this mechanism can be considered safe.

### 3.1 Mapping to existing application policy

The existing application policy is defined in `src/shared/folderAccess.ts` and is applied through the Claude settings assembled in `src/main/hive.ts` (`hookSettings`). These rules describe application-level file-tool and Claude permission behavior; they do not establish Windows OS-level access control for shell processes.

The Windows prototype must translate the policy into explicit per-member OS access grants:

- **Own agent folder:** allow the member the required read/write access, including inbox, outbox, and memory.
- **Other members' private folders:** deny read, write, modify, and delete access.
- **Michael's office folder:** preserve the existing policy distinction between team members and Michael. Team members must not gain broader access merely because a shared parent is writable.
- **Shared office folders:** grant only the specific read/write access required by the current policy. Do not apply a recursive grant to the hive root that exposes sibling private folders.
- **Application-private and locked paths:** preserve the existing `appPrivate` and `appLocked` policy intent when translating to Windows permissions. The exact paths and effective ACLs must be validated on Windows before implementation.

The existing `sandboxWritableDirs()` helper in `src/main/hive.ts` returns application sandbox configuration paths. It must not be used directly as a Windows ACL allow-list without reviewing each path and its parent/child relationships.

### 3.2 Member lifecycle and access-grant cleanup

Windows access grants must follow the worker/member lifecycle. Creating a private agent folder must also establish the intended access policy; removing or reclaiming that folder must revoke any associated grants.

The current worker scratch directory is `HIVE_ROOT/agents/<workerId>`. `removeWorkerScratch()` checks that the worker is not live and that the resolved path is directly under the agents root before recursively removing it. This is path-safety protection, not an OS permission boundary.

The prototype must define and test:

- When access grants are created for a new member.
- How grants are updated if a member's folder or role changes.
- How grants are revoked when a member is removed or its scratch folder is reclaimed.
- How stale grants are detected and cleaned up after crashes or interrupted teardown.
- How the application avoids revoking access while a worker is still live.

Access-grant lifecycle behavior must be idempotent and must not broaden permissions during recovery or cleanup.

## 4. Launch path and fallback

The current PTY launch path in `src/main/pty.ts` uses `pty.spawn` with a working directory and environment. A working directory is not a security boundary. The Claude settings assembled in `src/main/hive.ts` configure Claude's existing permissions, but Windows currently has no native shell sandbox enforcement through that configuration.

The prototype must identify how to create the confined process and ensure child processes inherit the same effective restrictions. The launch boundary must not depend on recognizing or rewriting individual shell commands.

If the required Windows mechanism is unavailable or initialization fails, the office should still start, consistent with the existing unsandboxed fallback behavior on macOS. However, the application must not describe shell isolation as enforced in that state. The failure should be logged and surfaced clearly so the security limitation is visible.

### 4.1 Proposed launcher and installer integration

The current launch path calls `pty.spawn(file, spawnArgs, options)` in `src/main/pty.ts`. It does not currently create an AppContainer process. The `cwd` and environment options configure process startup but do not establish an OS-enforced filesystem boundary.

**Proposed approach, subject to prototype validation:** investigate a small native Windows launcher that creates the target process with the required AppContainer security capabilities and attaches it to the pseudoconsole used by node-pty. The launcher must preserve terminal input/output, process exit reporting, environment variables, and the existing `HIVE_SOCK` hook connection.

The launcher must not be treated as a security boundary merely because node-pty starts it. The target shell and its descendants must run with the intended restricted security context. If the launcher remains outside the AppContainer, it must not execute agent-controlled commands outside the boundary.

**Packaging:** if a native launcher is required, define its source, build process, architecture, output location, and installer inclusion in `electron-builder.yml`. The Windows NSIS installer is the existing packaging target described in `docs/designs/windows-11-installer.md`. The launcher must be built reproducibly and included in packaged Windows builds; development and packaged paths must both be tested.

**Prototype acceptance criteria:**

- Launch the target process inside the intended AppContainer.
- Verify that the process is attached to the node-pty pseudoconsole and that interactive input/output works.
- Verify `HIVE_SOCK` communication and normal process shutdown.
- Verify that child and grandchild processes retain the intended restrictions.
- Confirm that missing launcher binaries and launch failures are reported clearly and never silently presented as a successfully confined session.

The exact Windows process-creation APIs and console-attachment strategy remain implementation questions until a working Windows 11 prototype demonstrates compatibility.

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

## 6. Windows and macOS security parity

The existing macOS shell sandbox configuration and Windows' proposed AppContainer boundary may enforce different levels of restriction. The v1 goal is to preserve the application's intended folder-access boundaries, not to claim identical operating-system behavior across platforms.

On macOS, `hookSettings` and the existing sandbox configuration define the current behavior. On Windows, Claude permission rules alone do not confine shell commands; the proposed AppContainer mechanism must provide the OS-enforced boundary.

For v1, Windows must at minimum prevent a team member from reading or modifying another member's private folder through shell commands and descendant processes. Required own-folder, inbox/outbox, and shared-office workflows must continue to work.

The prototype must compare the effective access behavior of the two platforms against the same folder-policy requirements. Any intentional difference must be documented, including whether Windows is stricter than macOS for particular paths.

Do not weaken the existing macOS policy to make the platforms appear equivalent. Do not claim parity until the Windows 11 tests demonstrate the required access denials and permitted workflows.

## 7. Scope and next step

This document proposes a prototype and validation criteria, not a completed security fix. The immediate next step is maintainer review of the mechanism choice, access policy, and fallback behavior. Implementation and regression tests should follow once the design is agreed.
