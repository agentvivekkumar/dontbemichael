# Running Don't Be Michael on Linux

Linux is not yet a release target, but the app builds and runs on most mainstream
distributions. This page collects what is known to work, the setup steps, and the
gaps that make a Linux release not yet ready.

---

## What works

| Feature                            | Status                                      |
| ---------------------------------- | ------------------------------------------- |
| Build from source                  | ✅ Works on Ubuntu 22.04+, Fedora 38+, Arch  |
| `npm run dev` (hot reload)         | ✅                                           |
| Agent sessions (Claude Code)       | ✅                                           |
| Hive coordination                  | ✅                                           |
| Email (IMAP mailboxes)             | ✅                                           |
| Office floor animations            | ✅                                           |
| Production build (`npm run build`) | ✅                                           |
| `.deb` / `.AppImage` packaging     | ✅ via `electron-builder`; not yet released  |
| File sandbox (per-agent folder)    | ⚠️ App-level only — no OS-level enforcement yet (macOS uses sandbox; Windows has partial checks) |
| Scan / photo reading               | ❌ macOS only for now                        |
| Auto-update                        | ❌ Not yet wired for Linux                   |

---

## Prerequisites

### Node.js 18 or newer

Use your distro's package manager or [nvm](https://github.com/nvm-sh/nvm):

```bash
# Ubuntu / Debian
sudo apt install nodejs npm

# Fedora
sudo dnf install nodejs npm

# Arch
sudo pacman -S nodejs npm

# Or via nvm (any distro)
nvm install --lts
```

### C/C++ toolchain (required for node-pty)

node-pty builds a native addon. You need make, g++, and Python 3.

```bash
# Ubuntu / Debian
sudo apt install build-essential python3

# Fedora
sudo dnf groupinstall "Development Tools"
sudo dnf install python3

# Arch
sudo pacman -S base-devel python
```

### Electron system libraries

Electron needs several shared libraries that headless or minimal installs may be
missing. On Ubuntu / Debian:

```bash
sudo apt install \
  libgtk-3-0 libgbm1 libasound2 \
  libx11-xcb1 libxss1 libxtst6 \
  libxrandr2 libxi6 libgconf-2-4 \
  libnss3 libatk-bridge2.0-0
```

On Fedora / RHEL:

```bash
sudo dnf install \
  gtk3 mesa-libgbm alsa-lib \
  libX11 libXScrnSaver libXtst \
  libXrandr libXi GConf2 \
  nss at-spi2-atk
```

### Claude Code

Install Claude Code and make sure claude is on your PATH:

```bash
npm install -g @anthropic-ai/claude-code
claude --version
```

---

## Build and run

```bash
git clone https://github.com/agentvivekkumar/dontbemichael.git
cd dontbemichael
npm install
npm run dev
```

If node-pty fails to load after the install, re-run npm install. The most
common cause is a missing C++ toolchain; confirm g++ --version works first.

### Headless / WSL2

Electron requires a display. Under WSL2, set DISPLAY before running:

```bash
export DISPLAY=:0
npm run dev
```

Running without any display server is not supported.

---

## Packaging a local build

```bash
npm run build
npm run dist:linux
```

The resulting packages are unsigned. On most distros you can run the AppImage
directly:

```bash
chmod +x dist/Dont-Be-Michael-*.AppImage
./dist/Dont-Be-Michael-*.AppImage
```

---

## Known Linux-specific issues

- Shell detection. The app spawns agent terminals with the user's default
  shell. fish and nushell are known to cause prompt-detection failures with
  some Claude Code versions. bash and zsh are the most tested.
- File sandbox enforcement. On macOS, Claude Code sandbox and the app
  both prevent an agent from writing outside its folder. On Linux, only the
  app-level check is in place; shell commands are not restricted yet.
- Wayland. The app runs under XWayland. Native Wayland support is not
  tested.
- Tray icon. The system tray icon requires libappindicator3. Install it
  if the tray does not appear: sudo apt install libappindicator3-1 (Ubuntu).

---

## Reporting a Linux issue

Before opening an issue, include:

- Distro and version (lsb_release -a or cat /etc/os-release)
- Desktop environment and display server (X11 or Wayland)
- Node.js version (node --version)
- Claude Code version (claude --version)
- The full error output from the terminal where you ran npm run dev

Open the issue at https://github.com/agentvivekkumar/dontbemichael/issues
Cross-platform fixes and test reports are very welcome.
