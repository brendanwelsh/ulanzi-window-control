# Design — claude-dial-launcher

## Goal
Use an Ulanzi dial to pick and resume **Claude Code CLI sessions**: rotate to scroll recent
sessions, press to resume one in a terminal; keys launch specific projects. A sibling to
`ulanzi-camera-switcher` — same plugin skeleton, different engine.

## Architecture
```
Ulanzi Studio ──WebSocket──> plugin/app.js (Node main service)
                                   │  uses
                                   ▼
                         shared/claude-launcher.js (engine)
                                   │  reads (head only)        │  spawns
                                   ▼                           ▼
                    ~/.claude/projects/**/<uuid>.jsonl     wt / powershell -> `claude --resume <id>`
```

- **Engine (`shared/claude-launcher.js`)** — UI-agnostic. Discovers sessions, ranks them
  newest-first, resolves each one's project dir + label, and launches terminals. No Ulanzi
  dependency, so it could back a standalone/HID front-end later (see below).
- **Main service (`plugin/app.js`)** — translates Ulanzi events (`onDialRotate`, `onDialDown`,
  `onRun`) into engine calls, and feeds the Property Inspector its project list.
- **Property Inspectors** — the dial's panel edits global settings (claude command, terminal,
  max sessions); the key's panel picks a project + new-vs-resume mode (per-action settings).

## Session discovery
Claude Code writes a transcript per session at
`~/.claude/projects/<encoded-project-path>/<session-uuid>.jsonl`. Rather than parse whole
transcripts (they get large), the engine reads only the first ~64 KB of each and extracts:

| field | source line | use |
|---|---|---|
| `cwd` | first line carrying `cwd` (usually the first `user` line) | the project dir to launch in |
| `title` | the `ai-title` line if present, else the first user prompt | the dial label |
| `id` | the `.jsonl` filename | `claude --resume <id>` |
| `mtime` | file stat | recency sort |

Only the top-N (default 30) most-recent transcripts are enriched, so a re-index is cheap; the
service re-indexes on connect, every 60 s, and whenever the PI asks.

## Launching
`claude --resume <id>` (or a bare `claude`) is run inside a kept-open PowerShell in a terminal
opened to the project directory. The directory is set via the terminal's own flag — Windows
Terminal `wt -d <dir>` or `start /D <dir>` — **not** via `Set-Location;…`, because Windows
Terminal treats `;` as a tab separator and would split the command. `wt` is used automatically
when present; otherwise a PowerShell window is opened. Both are detached + `unref`'d so the
plugin process isn't tied to them.

## Decisions
- **Plugin-first, no HID.** Unlike `ulanzi-camera-switcher`, there's no standalone HID front-end
  here — picking a session needs an on-screen label per item, which the dial's screen (driven by
  Studio) provides. A headless HID version would be "blind." Left as a possible future add-on.
- **Read-only.** The engine never writes transcripts; it only reads heads and spawns terminals.
- **No bundled secrets.** The menu is built live from the running machine's `~/.claude`; the repo
  and the share zip contain no session data.

## Possible extensions
- A "new session in a picked project" flow straight from the dial (currently dial = sessions,
  keys = projects).
- Filter sessions to a single project on the dial.
- Cross-platform terminals (macOS `Terminal`/`iTerm`, Linux) — today it's Windows-only.
- Standalone HID front-end for dials with their own screen/firmware.
