# ulanzi-window-control

[![Available on Ulanzi Community Store](https://raw.githubusercontent.com/narlei/ulanzicommunitystore/main/docs/badges/ulanzi-community-store.svg)](https://ulanzicommunitystore.narlei.com)

> Drive your windows from an Ulanzi dial: **rotate** to scroll windows (terminals or all),
> **press** to focus — plus **komorebi** tiling controls (focus/monocle on the knob;
> retile/float/pause/layout on keys).

An [Ulanzi Studio](https://www.ulanzi.com/pages/downloads) plugin. The dial does what your
keypad can't: a continuous, on-screen list you scroll through. Pairs nicely with a Stream Deck
that *launches* apps — this *navigates* the ones already open.

## Actions
| Action | Control | What it does |
|---|---|---|
| **Window Switcher** | dial | rotate = scroll windows, press = focus the selected one |
| **Window Filter** | key | toggle the switcher between **terminals only** ↔ **all windows** |
| **komorebi Focus** | dial | rotate = `cycle-focus`, press = `toggle-monocle` (focus big / out) |
| **komorebi Command** | key | run a chosen `komorebic` command — retile, float, pause, layout, … |

Put **Window Switcher** on the knob and one **Window Filter** key next to it; drop a cluster of
**komorebi Command** keys (retile / float / pause / grid presets) for a tiling control pad. Or
swap the knob to **komorebi Focus** when you want the rotary to cycle tiled focus.

## How it works
- **Window switching** is pure Win32 — a bundled `winctl.ps1` enumerates visible top-level
  windows (`EnumWindows`) and focuses one by handle (`SetForegroundWindow` with the
  foreground-unlock dance). No native Node modules; the only npm dep is `ws`.
- **Filtering** to "terminals" matches process names against a configurable regex
  (WindowsTerminal, pwsh, powershell, cmd, wezterm, …).
- **komorebi** actions just shell out to `komorebic`.

The window list refreshes in the background (every ~2.5s and on demand), so a rotate is instant.

## Requirements
- **Windows 10/11**
- For the komorebi actions: **[komorebi](https://github.com/LGUG2Z/komorebi)** running, with
  `komorebic` on your `PATH` (or set its path in settings).

## Install
```powershell
npm run setup:plugin     # installs the plugin's one dep (ws)
npm run build            # bundles the engine + winctl.ps1 into the plugin
npm run install:plugin   # copies it into %APPDATA%\Ulanzi\UlanziDeck\Plugins\
#   then fully quit + reopen Ulanzi Studio
```

## Settings
The **Window Switcher**'s panel holds everything (all optional):
- **Scroll which windows?** — terminals only / all windows (default terminals).
- **Terminal processes (regex)** — what counts as a terminal.
- **komorebic path** — defaults to `komorebic`.

A `config.json` in the plugin folder can override the same values (see `config.example.json`).

## Notes
- It switches **windows**, not tabs. If you run several sessions as Windows Terminal *tabs* in one
  window, the switcher sees one window — launch them as separate windows to scroll between them.
- Focusing a background window uses the standard `AttachThreadInput` + `SetForegroundWindow`
  trick; it's reliable from the detached helper the plugin spawns.

`npm test` runs a hardware-free self-check (filter/rotate logic, manifest, vendored SDK, bundled
helper, engine-sync) — it never enumerates or focuses real windows.

## Repo layout
- `shared/window-control.js` — the engine (window list/focus + komorebi). **Source of truth.**
- `shared/winctl.ps1` — the Win32 helper (list + focus). Bundled into the plugin by `npm run build`.
- `plugin/com.ulanzi.windowcontrol.ulanziPlugin/` — the Ulanzi Deck plugin (`manifest.json`,
  `plugin/app.js` main service, `property-inspector/` settings + komorebi picker, vendored SDK, icons).
- `scripts/` — `sync-engine.mjs` (build), `install-plugin.ps1`, `pack-plugin.ps1`.
- `test/smoke.mjs` — the self-check.

## Related
- **[`ulanzi-camera-switcher`](https://github.com/brendanwelsh/ulanzi-camera-switcher)** — sibling
  plugin (dial → security-camera viewer); same skeleton.
- **[`ulanzi-d100h-homebrew`](https://github.com/brendanwelsh/ulanzi-d100h-homebrew)** — the dial's
  HID protocol + Ulanzi Studio internals.

## License
MIT
