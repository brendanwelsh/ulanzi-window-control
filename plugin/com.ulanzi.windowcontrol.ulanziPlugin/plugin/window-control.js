// AUTO-GENERATED COPY of shared/window-control.js — DO NOT EDIT HERE.
// Edit shared/window-control.js, then run `npm run build` to refresh this copy.

// window-control.js — the engine shared by the Ulanzi plugin.
//
// Two capabilities, both UI-agnostic:
//   1) Window switching — list visible top-level windows (optionally filtered to terminals),
//      scroll a selection, and focus the chosen one. Backed by a bundled PowerShell helper
//      (winctl.ps1) that does the Win32 EnumWindows / SetForegroundWindow work — no native deps.
//   2) komorebi control — fire komorebic commands (focus, monocle, retile, float, …).
//
// Listing spawns the helper ASYNC so a rotate is never blocked; rotate walks a cached list.

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// processes we treat as "terminals" for the default filter
const DEFAULT_TERMINALS = "WindowsTerminal|pwsh|powershell|cmd|conhost|alacritty|wezterm|kitty|mintty|wsl|ConEmu|Hyper|Tabby";

export class WindowControl {
  constructor(cfg = {}, log = () => {}) {
    this.log = log;
    this.cfg = {
      komorebicPath: cfg.komorebicPath || "komorebic",
      terminalRegex: cfg.terminalRegex || DEFAULT_TERMINALS,
      filter: cfg.filter === "all" ? "all" : "terminals", // terminals | all
    };
    // carry any extra keys without letting undefined clobber the resolved defaults
    for (const k of Object.keys(cfg)) if (this.cfg[k] === undefined && cfg[k] !== undefined) this.cfg[k] = cfg[k];
    this.windows = []; // filtered list: [{hwnd, pid, proc, title}]
    this.idx = 0;
    this.helper = path.join(__dirname, "winctl.ps1"); // sits next to this module (and in the synced copy)
  }

  // ── window list ───────────────────────────────────────────────────────────────
  // apply the terminals/all filter to a raw window list (pure — used by refresh + tests)
  _filter(raw) {
    if (!Array.isArray(raw)) return [];
    if (this.cfg.filter === "all") return raw;
    let re;
    try {
      re = new RegExp(this.cfg.terminalRegex, "i");
    } catch (e) {
      re = new RegExp(DEFAULT_TERMINALS, "i");
    }
    return raw.filter((w) => re.test(w.proc || ""));
  }

  // async, non-blocking: spawn the helper, parse JSON, re-filter, preserve selection by hwnd
  refresh() {
    return new Promise((resolve) => {
      let out = "";
      let proc;
      try {
        proc = spawn("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", this.helper, "-List"], { windowsHide: true });
      } catch (e) {
        this.log("list spawn failed: " + e.message);
        return resolve(this.windows);
      }
      proc.stdout.on("data", (d) => (out += d));
      proc.on("error", (e) => {
        this.log("list error: " + e.message);
        resolve(this.windows);
      });
      proc.on("close", () => {
        let raw = [];
        try {
          raw = JSON.parse((out || "").trim() || "[]");
          if (!Array.isArray(raw)) raw = [raw];
        } catch (e) {
          this.log("list parse failed: " + e.message);
          return resolve(this.windows);
        }
        const prev = this.current() && this.current().hwnd;
        this.windows = this._filter(raw);
        const at = this.windows.findIndex((w) => w.hwnd === prev);
        this.idx = at >= 0 ? at : 0;
        resolve(this.windows);
      });
    });
  }

  current() {
    return this.windows[this.idx] || null;
  }

  rotate(dir) {
    if (!this.windows.length) return null;
    this.idx = (this.idx + (dir < 0 ? -1 : 1) + this.windows.length) % this.windows.length;
    return this.current();
  }

  setFilter(mode) {
    this.cfg.filter = mode === "all" ? "all" : "terminals";
    return this.cfg.filter;
  }
  toggleFilter() {
    return this.setFilter(this.cfg.filter === "all" ? "terminals" : "all");
  }

  focus(win) {
    const w = win || this.current();
    if (!w) return false;
    return this._spawnHelper(["-Focus", "-Hwnd", String(w.hwnd)]);
  }

  _spawnHelper(extraArgs) {
    try {
      const child = spawn(
        "powershell",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", this.helper, ...extraArgs],
        { detached: true, stdio: "ignore", windowsHide: true }
      );
      child.unref();
      return true;
    } catch (e) {
      this.log("helper spawn failed: " + e.message);
      return false;
    }
  }

  // ── komorebi ──────────────────────────────────────────────────────────────────
  // run one or more komorebic subcommands, ';'-separated, IN ORDER. Sequencing matters for
  // multi-monitor: e.g. "focus-monitor 1; change-layout grid" targets a specific screen.
  komo(args) {
    const cmds = String(args || "")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!cmds.length) return false;
    this._komoSeq(cmds, 0);
    return true;
  }

  _komoSeq(cmds, i) {
    if (i >= cmds.length) return;
    const parts = cmds[i].split(/\s+/).filter(Boolean);
    const next = () => this._komoSeq(cmds, i + 1);
    try {
      const child = spawn(this.cfg.komorebicPath, parts, { stdio: "ignore", windowsHide: true });
      this.log("komorebic " + parts.join(" "));
      child.on("close", next);
      child.on("error", (e) => {
        this.log("komorebic failed (" + parts.join(" ") + "): " + e.message);
        next();
      });
    } catch (e) {
      this.log("komorebic spawn failed: " + e.message);
      next();
    }
  }
  komoFocus(dir) {
    return this.komo(dir < 0 ? "cycle-focus previous" : "cycle-focus next");
  }
  komoMonocle() {
    return this.komo("toggle-monocle");
  }
}

export { DEFAULT_TERMINALS };
