// AUTO-GENERATED COPY of shared/claude-launcher.js — DO NOT EDIT HERE.
// Edit shared/claude-launcher.js, then run `npm run build` to refresh this copy.

// claude-launcher.js — the engine shared by the Ulanzi plugin (and any future front-end).
//
// Discovers your Claude Code CLI sessions from ~/.claude/projects/, lets you scroll them,
// and launches a terminal running `claude --resume <id>` (or a fresh `claude`) in the right
// project directory.
//
// Layout it reads (created by Claude Code itself):
//   ~/.claude/projects/<encoded-project-path>/<session-uuid>.jsonl
// Each .jsonl is a transcript; near the top it carries the real `cwd` and (usually) an
// `ai-title`. We read only the HEAD of each file, so indexing stays cheap.

import fs from "fs";
import os from "os";
import path from "path";
import { spawn, execSync } from "child_process";

const HOME = os.homedir();

export class ClaudeLauncher {
  constructor(cfg = {}, log = () => {}) {
    this.log = log;
    this.cfg = {
      projectsDir: cfg.projectsDir || path.join(HOME, ".claude", "projects"),
      claudeCmd: cfg.claudeCmd || "claude", // the CLI command/shim on PATH
      terminal: cfg.terminal || "auto", // auto | wt | powershell
      maxSessions: cfg.maxSessions || 30, // how many recent sessions to surface on the dial
      headBytes: cfg.headBytes || 65536, // how much of each transcript head to scan
      ...cfg,
    };
    this.sessions = []; // [{id, file, cwd, project, title, displayLabel, mtime}], newest first
    this.projects = []; // [{path, project, mtime}], unique by cwd, newest first
    this.idx = 0;
    this._hasWt = null;
  }

  // ── discovery ────────────────────────────────────────────────────────────────
  refresh() {
    const dir = this.cfg.projectsDir;
    let folders = [];
    try {
      folders = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory());
    } catch (e) {
      this.log("cannot read projects dir " + dir + ": " + e.message);
      this.sessions = [];
      this.projects = [];
      return this.sessions;
    }

    const all = [];
    for (const folder of folders) {
      const fdir = path.join(dir, folder.name);
      let files = [];
      try {
        files = fs.readdirSync(fdir).filter((f) => f.toLowerCase().endsWith(".jsonl"));
      } catch (e) {
        continue;
      }
      for (const f of files) {
        const full = path.join(fdir, f);
        let st;
        try {
          st = fs.statSync(full);
        } catch (e) {
          continue;
        }
        if (!st.size) continue; // skip empty transcripts
        all.push({ id: f.replace(/\.jsonl$/i, ""), file: full, folder: folder.name, mtime: st.mtimeMs });
      }
    }
    all.sort((a, b) => b.mtime - a.mtime);
    const top = all.slice(0, this.cfg.maxSessions);

    // enrich only the top N — reading file heads is the expensive part
    for (const s of top) {
      const m = this._meta(s.file);
      s.cwd = m.cwd || this._decodeFolder(s.folder);
      s.project = s.cwd ? path.basename(s.cwd) : s.folder;
      s.title = m.title || trimSnippet(m.firstUser) || s.project;
      s.displayLabel = trimSnippet(s.title, 26);
    }
    this.sessions = top;

    const seen = new Set();
    const projects = [];
    for (const s of top) {
      const key = String(s.cwd || s.folder).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      projects.push({ path: s.cwd, project: s.project, mtime: s.mtime });
    }
    this.projects = projects;

    if (this.idx >= this.sessions.length) this.idx = 0;
    this.log(`indexed ${this.sessions.length} sessions / ${this.projects.length} projects`);
    return this.sessions;
  }

  // pull cwd + a label out of a transcript head, parsing line-by-line (JSONL)
  _meta(file) {
    const head = this._readHead(file, this.cfg.headBytes);
    let cwd = "";
    let title = "";
    let firstUser = ""; // any first user text (last-resort label)
    let firstRealUser = ""; // first user text that isn't an injected <tag> / slash-command
    for (const line of head.split("\n")) {
      if (!line.trim()) continue;
      let o;
      try {
        o = JSON.parse(line);
      } catch (e) {
        continue; // the final line in the head slice can be truncated — skip it
      }
      if (!cwd && typeof o.cwd === "string") cwd = o.cwd;
      if (!title && o.type === "ai-title" && o.aiTitle) title = String(o.aiTitle);
      if (o.type === "user" && o.message) {
        const text = userText(o.message.content);
        if (text) {
          if (!firstUser) firstUser = text;
          if (!firstRealUser && !isNoise(text)) firstRealUser = text;
        }
      }
      if (cwd && title) break; // best possible label, stop early
    }
    return { cwd, title, firstUser: firstRealUser || firstUser };
  }

  _readHead(file, bytes) {
    let fd;
    try {
      fd = fs.openSync(file, "r");
      const buf = Buffer.alloc(bytes);
      const n = fs.readSync(fd, buf, 0, bytes, 0);
      return buf.slice(0, n).toString("utf8");
    } catch (e) {
      return "";
    } finally {
      if (fd !== undefined) {
        try {
          fs.closeSync(fd);
        } catch (e) {}
      }
    }
  }

  // best-effort decode of "C--Users-you-Projects-foo" -> "C:\Users\you\Projects\foo".
  // ambiguous when a real folder name contains "-", so it's only a fallback when the
  // transcript head had no cwd (it almost always does).
  _decodeFolder(name) {
    const s = String(name).replace(/^([A-Za-z])--/, "$1:\\");
    return s.replace(/-/g, "\\");
  }

  // ── selection ────────────────────────────────────────────────────────────────
  current() {
    return this.sessions[this.idx] || null;
  }

  rotate(dir) {
    if (!this.sessions.length) return null;
    const step = dir < 0 ? -1 : 1;
    this.idx = (this.idx + step + this.sessions.length) % this.sessions.length;
    return this.current();
  }

  latestForProject(projectPath) {
    const key = String(projectPath || "").toLowerCase();
    return this.sessions.find((s) => String(s.cwd || "").toLowerCase() === key) || null;
  }

  // ── launching ────────────────────────────────────────────────────────────────
  hasWt() {
    if (this._hasWt !== null) return this._hasWt;
    try {
      execSync("where wt", { stdio: "ignore" });
      this._hasWt = true;
    } catch (e) {
      this._hasWt = false;
    }
    return this._hasWt;
  }

  // resume a specific session (defaults to the current selection)
  resume(session) {
    const s = session || this.current();
    if (!s) return false;
    return this._spawnTerminal(s.cwd, `${this.cfg.claudeCmd} --resume ${s.id}`);
  }

  // start a brand-new claude session in a project directory
  newSession(cwd) {
    const dir = cwd || (this.current() && this.current().cwd);
    if (!dir) return false;
    return this._spawnTerminal(dir, `${this.cfg.claudeCmd}`);
  }

  // open a terminal in <dir> and run <innerCmd> inside a kept-open PowerShell.
  // we set the directory via the terminal's own flag (-d / start /D) so innerCmd
  // never needs a ";" — important because Windows Terminal treats ";" as a tab split.
  _spawnTerminal(dir, innerCmd) {
    const useWt = this.cfg.terminal === "wt" || (this.cfg.terminal !== "powershell" && this.hasWt());
    let cmd, args;
    if (useWt) {
      cmd = "wt";
      args = ["-d", dir, "powershell", "-NoExit", "-Command", innerCmd];
    } else {
      cmd = "cmd";
      args = ["/c", "start", "Claude", "/D", dir, "powershell", "-NoExit", "-Command", innerCmd];
    }
    this.log(`launch (${useWt ? "wt" : "start"}): ${innerCmd}  @  ${dir}`);
    try {
      const child = spawn(cmd, args, { detached: true, stdio: "ignore", windowsHide: false });
      child.unref();
      return true;
    } catch (e) {
      this.log("spawn failed: " + e.message);
      return false;
    }
  }
}

function trimSnippet(s, n = 48) {
  if (!s) return "";
  const clean = String(s).replace(/\s+/g, " ").trim();
  return clean.length > n ? clean.slice(0, n - 1) + "…" : clean;
}

// extract plain text from a user message's content (string or content-array)
function userText(content) {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    const t = content.find((x) => x && x.type === "text" && typeof x.text === "string" && x.text.trim());
    return t ? t.text.trim() : "";
  }
  return "";
}

// injected, non-prompt user text we don't want as a session label:
// <system-reminder>, <local-command-…>, <command-name>, tool-result echoes, bare slash-commands.
function isNoise(text) {
  const t = String(text).trim();
  return t.startsWith("<") || t.startsWith("/");
}
