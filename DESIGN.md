# Design — ulanzi-window-control

## Goal
Use the Ulanzi dial for what a keypad can't: scroll a live, on-screen list of windows and focus
one; and control the komorebi tiling WM. Sibling to `ulanzi-camera-switcher` — same plugin
skeleton, different engine.

## Architecture
```
Ulanzi Studio ──WebSocket──> plugin/app.js (Node main service)
                                   │  uses
                                   ▼
                         shared/window-control.js (engine)
                          │  spawns                  │  spawns
                          ▼                          ▼
                  winctl.ps1 (EnumWindows /     komorebic <cmd>
                  SetForegroundWindow)
```

- **Engine (`shared/window-control.js`)** — UI-agnostic. Holds the window list + selection, the
  terminals/all filter, and the komorebi command runner.
- **Helper (`shared/winctl.ps1`)** — all the Win32 P/Invoke. `-List` emits visible top-level
  windows as JSON `[{hwnd,pid,proc,title}]`; `-Focus -Hwnd N` raises a window. Bundled into the
  plugin by the build so there are **no native Node deps** (only `ws`).
- **Main service (`plugin/app.js`)** — four actions, dispatched by `message.uuid` (the SDK puts
  the action-type UUID on every event, so multiple encoder/keypad actions coexist cleanly).

## Actions
| UUID suffix | Control | Behavior |
|---|---|---|
| `.switcher` | Encoder | rotate → `rotate()` + label; press → `focus()` |
| `.komofocus` | Encoder | rotate → `komorebic cycle-focus`; press → `komorebic toggle-monocle` |
| `.filter` | Keypad | `toggleFilter()`, persist to global settings, relabel |
| `.komocmd` | Keypad | run the PI-chosen `komorebic <args>` |

## Key decisions
- **Win32 via a bundled PS helper, not a native module.** `node-window-manager` would add a
  native build that may not match Studio's bundled Node. Shelling out to PowerShell P/Invoke is
  dependency-free and runs anywhere.
- **Async, cached listing.** Listing spawns a process (~150ms); doing it per-rotate would be
  janky. The service refreshes in the background (timer + on demand) and `rotate()` walks the
  cache, so the dial is instant. Selection is preserved across refreshes by `hwnd`.
- **Focus reliability.** `SetForegroundWindow` is blocked for background processes unless you
  `AttachThreadInput` to the current foreground thread first (and `ShowWindow` if minimized).
  The helper does the full dance; the plugin spawns it detached so nothing races focus back.
- **One filter, shared in memory.** Both `.switcher` and `.filter` run in the same service with
  one engine instance, so the terminals/all state is just a field — persisted to global settings
  for restart survival.
- **Route by UUID, not heuristics.** Because every event carries `message.uuid`, the four actions
  dispatch by exact action type (no "does it have setting X?" guessing).

## komorebi command vocabulary
Mirrors the user's whkd binds: `retile` (reset), `toggle-float`, `toggle-pause`,
`toggle-monocle`, `promote`, `close`, `minimize`, `flip-layout h/v`, `focus <dir>`,
`change-layout <bsp|columns|rows|grid>`, `reload-configuration`, plus a Custom field for any
other `komorebic` args.

## Possible extensions
- Filter the switcher to a single app/class, or sort by most-recently-used.
- Per-monitor komorebi layout presets as one-press keys.
- A live preview thumbnail on the dial screen (would need image push, not just text).
- macOS/Linux window backends behind the same engine interface (today Windows-only).
