# claude-dial-launcher

> Turn an Ulanzi dial into a **Claude Code session launcher**: **rotate** to scroll your recent
> Claude CLI sessions, **press** to resume the highlighted one in a terminal, and assign **keys**
> to launch (or resume) a specific project.

It's an [Ulanzi Studio](https://www.ulanzi.com/pages/downloads) plugin built on the same skeleton
as [`ulanzi-camera-switcher`](https://github.com/brendanwelsh/ulanzi-camera-switcher) — a thin
Node service driving a shared engine.

## How it works
Claude Code already stores every session as a transcript under `~/.claude/projects/`. This plugin
reads the **head** of each transcript to learn its project directory and title (it prefers the
session's `ai-title`, falling back to your first prompt), sorts them newest-first, and exposes them
on the dial. Resuming runs `claude --resume <session-id>` in a terminal opened to that project.

```
~/.claude/projects/<encoded-project-path>/<session-uuid>.jsonl   <-- read-only, head only
```

## Controls
- **Session Scroller** (drop on the **dial**)
  - **Rotate** → scroll your recent sessions (the dial shows each session's title).
  - **Press** → resume the highlighted session in a new terminal.
- **Project Launcher** (drop on a **key**)
  - Pick a project in the key's settings. **Press** → start a fresh `claude` there (or resume that
    project's latest session, your choice).

## Requirements
- **Windows 10/11**
- **[Claude Code CLI](https://claude.com/claude-code)** on your `PATH` (so `claude` runs from a terminal)
- **Ulanzi Studio** + a compatible Ulanzi device (the dial)
- Optional but nicer: **Windows Terminal** (`wt`) — used automatically if present; otherwise a
  PowerShell window is opened

## Install
```powershell
npm run setup:plugin     # installs the plugin's one dep (ws)
npm run build            # bundles the shared engine into the plugin
npm run install:plugin   # copies it into %APPDATA%\Ulanzi\UlanziDeck\Plugins\
#   then fully quit + reopen Ulanzi Studio
```
Then in Ulanzi Studio, under **Claude Launcher**: drop **Session Scroller** on the dial and
**Project Launcher** on any keys.

## Settings
The **Session Scroller**'s settings panel covers everything (no file editing needed):
- **Claude command** — defaults to `claude`; change it if your CLI is invoked differently.
- **Terminal** — Auto / Windows Terminal / PowerShell.
- **Max sessions on the dial** — how many recent sessions to surface (default 30).

A `config.json` in the plugin folder can override the same values (see `config.example.json`), but
it's entirely optional.

## Share it
```powershell
npm run pack             # -> dist/...zip
```
A recipient unzips into `%APPDATA%\Ulanzi\UlanziDeck\Plugins\`, restarts Ulanzi Studio, and drops
the actions on their dial/keys. Nothing personal ships in the zip — the session list is read live
from *their* `~/.claude/projects` at runtime.

## Privacy
This plugin **reads** your transcript files locally to build the menu (project path + title only)
and **launches a terminal**. It never sends anything anywhere, and it never writes to your
transcripts. No session content, paths, or titles are committed to this repo.

`npm test` runs a hardware-free self-check (discovery logic against a throwaway projects dir, the
plugin manifest, vendored SDK, and the engine-sync copy) — it never touches your real `~/.claude`.

## Repo layout
- `shared/claude-launcher.js` — the engine: session discovery + terminal launching (source of truth).
- `plugin/com.ulanzi.claudelauncher.ulanziPlugin/` — the Ulanzi Deck plugin (`manifest.json`,
  `plugin/app.js` main service, `property-inspector/` settings + project picker, vendored SDK, icons).
- `scripts/` — `sync-engine.mjs` (build), `install-plugin.ps1`, `pack-plugin.ps1`.
- `test/smoke.mjs` — the self-check.

## Related
- **[`ulanzi-camera-switcher`](https://github.com/brendanwelsh/ulanzi-camera-switcher)** — the sibling
  plugin this forks its skeleton from (dial → security-camera viewer).
- **[`ulanzi-d100h-homebrew`](https://github.com/brendanwelsh/ulanzi-d100h-homebrew)** — the dial's
  HID protocol + Ulanzi Studio internals (reference).

## License
MIT
