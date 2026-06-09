// Claude Launcher — Ulanzi Deck plugin main service (Node.js).
//
// Receives dial/key events from Ulanzi Studio over WebSocket and drives the shared
// launcher engine (./claude-launcher.js, a synced copy of ../../../shared/claude-launcher.js).
//
//   Session Scroller action (Encoder): rotate = scroll recent Claude sessions,
//                                      push   = resume the highlighted one in a terminal.
//   Project Launcher  action (Keypad):  press = start (or resume the latest) Claude
//                                      session in the project chosen in its Property Inspector.
//
// Optional config.json in the plugin folder overrides defaults (claude command, terminal, …);
// the Property Inspector edits the same values as global settings.

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import UlanziApi from "../ulanzi-api/index.js";
import { ClaudeLauncher } from "./claude-launcher.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.join(__dirname, "..");
const CONFIG_PATH = path.join(PLUGIN_ROOT, "config.json");

const PLUGIN_UUID = "com.ulanzi.ulanzistudio.claudelauncher";

function baseConfig() {
  let file = {};
  try {
    file = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) || {};
  } catch (e) {}
  return {
    projectsDir: file.projectsDir || undefined,
    claudeCmd: file.claudeCmd || "claude",
    terminal: file.terminal || "auto",
    maxSessions: file.maxSessions || 30,
  };
}

const $UD = new UlanziApi();
const LOGFILE = path.join(PLUGIN_ROOT, "claude-launcher.log");
const log = (m) => {
  try {
    $UD.logMessage("[claude-launcher] " + m);
  } catch (e) {}
  try {
    fs.appendFileSync(LOGFILE, new Date().toISOString() + " " + m + "\n");
  } catch (e) {}
};

const launcher = new ClaudeLauncher(baseConfig(), log);
launcher.refresh();

// keep the session index fresh as you work (cheap: re-reads only the top-N file heads)
setInterval(() => launcher.refresh(), 60000);

const paramOf = (m) => m.param || m.payload || m.settings || {};
// PI selects/checkboxes arrive as strings ("0"/"1"); treat only real truths as true
const truthy = (v) => v === true || v === 1 || v === "1" || v === "true";
const basename = (p) =>
  String(p || "")
    .replace(/[\\/]+$/, "")
    .split(/[\\/]/)
    .pop() || "CLAUDE";

// merge GUI/global settings (claude command, terminal, max sessions, projects dir)
function applyGlobal(g) {
  if (!g || typeof g !== "object") return;
  if (typeof g.claudeCmd === "string" && g.claudeCmd) launcher.cfg.claudeCmd = g.claudeCmd;
  if (typeof g.terminal === "string" && g.terminal) launcher.cfg.terminal = g.terminal;
  if (typeof g.projectsDir === "string" && g.projectsDir) launcher.cfg.projectsDir = g.projectsDir;
  if (g.maxSessions) launcher.cfg.maxSessions = Number(g.maxSessions) || launcher.cfg.maxSessions;
  launcher.refresh();
  log(`config: claude="${launcher.cfg.claudeCmd}" terminal=${launcher.cfg.terminal} max=${launcher.cfg.maxSessions}`);
}

// per-button (Project Launcher) memory: context -> { projectPath, resumeLatest }
const buttonCfg = new Map();
function rememberButton(message) {
  const p = paramOf(message);
  if (p && p.projectPath) {
    buttonCfg.set(message.context, { projectPath: p.projectPath, resumeLatest: truthy(p.resumeLatest) });
    $UD.setStateIcon(message.context, 0, basename(p.projectPath));
  }
}

$UD.connect(PLUGIN_UUID);

$UD.onConnected(() => {
  log(`connected; ${launcher.sessions.length} sessions, ${launcher.projects.length} projects`);
  try {
    $UD.getGlobalSettings();
  } catch (e) {}
});

$UD.onDidReceiveGlobalSettings((m) => applyGlobal(paramOf(m)));

$UD.onAdd((message) => {
  const p = paramOf(message);
  if (p.projectPath) rememberButton(message);
  else {
    // a fresh dial or an unconfigured button — give it a label, ask for its settings back
    $UD.setStateIcon(message.context, 0, "CLAUDE");
    try {
      $UD.getSettings(message.context);
    } catch (e) {}
  }
});

// settings changed in a PI, or returned from our getSettings() after a restart
$UD.onParamFromApp(rememberButton);
$UD.onParamFromPlugin(rememberButton);
$UD.onDidReceiveSettings(rememberButton);

$UD.onClear((message) => {
  if (Array.isArray(message.param)) for (const it of message.param) buttonCfg.delete(it.context);
});

// ── dial (Session Scroller) ──────────────────────────────────────────────────
$UD.onDialRotate((message) => {
  if (!launcher.sessions.length) launcher.refresh();
  if (!launcher.sessions.length) return $UD.showAlert(message.context);
  const dir = String(message.rotateEvent || "").includes("left") ? -1 : 1;
  const s = launcher.rotate(dir);
  if (s) $UD.setStateIcon(message.context, 0, s.displayLabel);
});

$UD.onDialDown((message) => {
  const s = launcher.current();
  if (!s) {
    launcher.refresh();
    return $UD.showAlert(message.context);
  }
  const ok = launcher.resume(s);
  log(`resume "${s.title}" (${s.id}) in ${s.cwd} -> ${ok}`);
  $UD.setStateIcon(message.context, 0, ok ? "▶ " + s.displayLabel : s.displayLabel);
  if (!ok) $UD.showAlert(message.context);
});

// ── keypad (Project Launcher) ────────────────────────────────────────────────
$UD.onRun((message) => {
  const cfg = buttonCfg.get(message.context) || {
    projectPath: paramOf(message).projectPath,
    resumeLatest: truthy(paramOf(message).resumeLatest),
  };
  log(`launch key -> ${cfg.projectPath || "(latest session)"} resumeLatest=${!!cfg.resumeLatest}`);

  // no project chosen yet: resume the single most-recent session
  if (!cfg.projectPath) {
    launcher.refresh();
    const latest = launcher.sessions[0];
    if (latest && launcher.resume(latest)) return;
    try {
      $UD.getSettings(message.context);
    } catch (e) {}
    return $UD.showAlert(message.context);
  }

  if (cfg.resumeLatest) {
    launcher.refresh();
    const s = launcher.latestForProject(cfg.projectPath);
    if (s && launcher.resume(s)) return;
    // fall through to a new session if no prior session exists in that project
  }
  if (!launcher.newSession(cfg.projectPath)) $UD.showAlert(message.context);
});

// ── Property Inspector data feed ─────────────────────────────────────────────
$UD.onSendToPlugin((message) => {
  const data = paramOf(message);
  if (!data) return;
  if (data.type === "getProjects") {
    launcher.refresh();
    $UD.sendToPropertyInspector(
      { type: "projects", projects: launcher.projects.map((p) => ({ path: p.path, name: p.project })) },
      message.context
    );
  } else if (data.type === "getConfig") {
    $UD.sendToPropertyInspector(
      {
        type: "config",
        claudeCmd: launcher.cfg.claudeCmd,
        terminal: launcher.cfg.terminal,
        maxSessions: launcher.cfg.maxSessions,
        sessions: launcher.sessions.length,
        projects: launcher.projects.length,
      },
      message.context
    );
  }
});
