# Don't Be Michael v0.0.12

**An AI office for your small business.** Pick your kind of business, pick your team, and Michael, your office manager, runs the floor while you run the business.

## What's new since 0.0.9

- **Closing time shows who is still working.** Every team member and Michael, with what each is doing and for how long. **Remind** one agent, or **close without them** without stopping their work.
- **QuickBooks through your Claude account.** One switch in Settings, off by default, and on each team member's Capabilities: Can use, then Read only or Can make changes. Oscar starts on, Read only. Read only is a fixed list of reads, so nothing new can change your books until it is known to be safe.
  - Known limitation: a team member that starts its own separate Claude from its terminal is outside the switch; a fix is planned.
- **Your saved passwords and keys are safe from a crash mid-save,** and a secrets file that can't be read is never saved over, so one bad moment can't erase the others.

Every feature, release by release: [docs/FEATURES.md](https://github.com/agentvivekkumar/dontbemichael/blob/main/docs/FEATURES.md)

## Download

| Platform | Download |
|---|---|
| Mac (Apple Silicon and Intel) | [`Dont-Be-Michael-0.0.12-mac-universal.dmg`](https://github.com/agentvivekkumar/dontbemichael/releases/latest/download/Dont-Be-Michael-0.0.12-mac-universal.dmg) |

This release is for Mac only. Windows and Linux will follow.

[Source code (zip)](https://github.com/agentvivekkumar/dontbemichael/archive/refs/tags/v0.0.12.zip) · [Source code (tar.gz)](https://github.com/agentvivekkumar/dontbemichael/archive/refs/tags/v0.0.12.tar.gz)

## Installing on your Mac

1. Open the downloaded `.dmg` and drag **Don't Be Michael** into your Applications folder.
2. Open it from Applications. The first time, macOS says it could not verify the app. Click **Done**.
3. Open **System Settings**, then **Privacy & Security**. Scroll down to the message about Don't Be Michael and click **Open Anyway**, then confirm.

You only do this once. macOS asks because this early build is not yet signed with an Apple Developer ID. A signed build is on the way.

You also need [Claude Code](https://docs.claude.com/en/docs/claude-code) installed and signed in.

When a new version comes out, the app tells you and links to the download. Install it the same way.
