// Window Control — Ulanzi Deck plugin main service (Node.js).
//
// Drives the shared engine (./window-control.js, a synced copy of ../../../shared/window-control.js).
// Four actions, dispatched by message.uuid (the action-type UUID the SDK puts on every event):
//
//   Window Switcher  (Encoder) .switcher  — rotate = scroll windows, press = focus selected.
//   komorebi Focus   (Encoder) .komofocus — rotate = cycle-focus, press = toggle-monocle (big/out).
//   Window Filter    (Keypad)  .filter    — press = toggle terminals <-> all windows.
//   komorebi Command (Keypad)  .komocmd   — press = run the komorebic command chosen in its PI.

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import UlanziApi from "../ulanzi-api/index.js";
import { WindowControl } from "./window-control.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.join(__dirname, "..");
const CONFIG_PATH = path.join(PLUGIN_ROOT, "config.json");

const PLUGIN_UUID = "com.ulanzi.ulanzistudio.windowcontrol";
const A_SWITCHER = PLUGIN_UUID + ".switcher";
const A_KOMOFOCUS = PLUGIN_UUID + ".komofocus";
const A_FILTER = PLUGIN_UUID + ".filter";
const A_KOMOCMD = PLUGIN_UUID + ".komocmd";

function baseConfig() {
  let file = {};
  try {
    file = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) || {};
  } catch (e) {}
  return {
    komorebicPath: file.komorebicPath || "komorebic",
    terminalRegex: file.terminalRegex || undefined, // undefined => engine's built-in default
    filter: file.filter || "terminals",
  };
}

const $UD = new UlanziApi();
const LOGFILE = path.join(PLUGIN_ROOT, "window-control.log");
const log = (m) => {
  try {
    $UD.logMessage("[window-control] " + m);
  } catch (e) {}
  try {
    fs.appendFileSync(LOGFILE, new Date().toISOString() + " " + m + "\n");
  } catch (e) {}
};

const wc = new WindowControl(baseConfig(), log);
const paramOf = (m) => m.param || m.payload || m.settings || {};
const filterLabel = () => (wc.cfg.filter === "all" ? "ALL WINDOWS" : "TERMINALS");

// contexts we relabel live, and each komorebi-command key's chosen command
const filterCtx = new Set();
const komoByCtx = new Map(); // context -> { args, label }

// short, dial-friendly labels for the common komorebic commands
const KOMO_LABELS = {
  retile: "RETILE",
  "toggle-float": "FLOAT",
  "toggle-pause": "PAUSE",
  "toggle-monocle": "MONOCLE",
  promote: "PROMOTE",
  close: "CLOSE",
  minimize: "MINIMIZE",
  "reload-configuration": "RELOAD",
  "flip-layout horizontal": "FLIP H",
  "flip-layout vertical": "FLIP V",
  "focus left": "FOCUS <",
  "focus right": "FOCUS >",
  "focus up": "FOCUS ^",
  "focus down": "FOCUS v",
  "change-layout bsp": "BSP",
  "change-layout columns": "COLUMNS",
  "change-layout rows": "ROWS",
  "change-layout grid": "GRID",
  "change-layout vertical-stack": "V-STACK",
  "change-layout horizontal-stack": "H-STACK",
};
const komoLabel = (args) =>
  KOMO_LABELS[args] || String(args).toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").trim().slice(0, 12) || "KOMO";

// strip leading nerd-font / private-use glyphs apps prepend to titles, trim for the dial
function cleanTitle(t) {
  const s = String(t || "")
    .replace(/^[\s—▶•--]+/, "")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > 26 ? s.slice(0, 25) + "…" : s || "—";
}

const argsFromParam = (p) => (p.komoCmd === "custom" ? p.komoCustom : p.komoCmd) || "";

function rememberKomo(message) {
  if (message.uuid !== A_KOMOCMD) return;
  const args = argsFromParam(paramOf(message));
  if (args) {
    const label = komoLabel(args);
    komoByCtx.set(message.context, { args, label });
    $UD.setStateIcon(message.context, 0, label);
  }
}

function relabelFilters() {
  for (const c of filterCtx) $UD.setStateIcon(c, 0, filterLabel());
}

$UD.connect(PLUGIN_UUID);

$UD.onConnected(async () => {
  try {
    $UD.getGlobalSettings();
  } catch (e) {}
  await wc.refresh();
  log(`connected; ${wc.windows.length} windows (${wc.cfg.filter})`);
});

// keep the window list fresh as windows open/close (async, never blocks a rotate)
setInterval(() => {
  wc.refresh();
}, 2500);

$UD.onDidReceiveGlobalSettings((m) => {
  const g = paramOf(m);
  if (!g || typeof g !== "object") return;
  if (g.filter) wc.setFilter(g.filter);
  if (typeof g.terminalRegex === "string" && g.terminalRegex) wc.cfg.terminalRegex = g.terminalRegex;
  if (typeof g.komorebicPath === "string" && g.komorebicPath) wc.cfg.komorebicPath = g.komorebicPath;
  wc.refresh();
  relabelFilters();
  log(`config: filter=${wc.cfg.filter} komorebic="${wc.cfg.komorebicPath}"`);
});

$UD.onAdd((message) => {
  switch (message.uuid) {
    case A_SWITCHER:
      $UD.setStateIcon(message.context, 0, "WINDOWS");
      break;
    case A_KOMOFOCUS:
      $UD.setStateIcon(message.context, 0, "KOMOREBI");
      break;
    case A_FILTER:
      filterCtx.add(message.context);
      $UD.setStateIcon(message.context, 0, filterLabel());
      break;
    case A_KOMOCMD:
      if (paramOf(message).komoCmd) rememberKomo(message);
      else {
        $UD.setStateIcon(message.context, 0, "KOMO");
        try {
          $UD.getSettings(message.context);
        } catch (e) {}
      }
      break;
  }
});

// settings arriving from a PI, or returned by our getSettings() after a restart
$UD.onParamFromApp(rememberKomo);
$UD.onParamFromPlugin(rememberKomo);
$UD.onDidReceiveSettings(rememberKomo);

$UD.onClear((message) => {
  if (Array.isArray(message.param))
    for (const it of message.param) {
      filterCtx.delete(it.context);
      komoByCtx.delete(it.context);
    }
});

// ── encoders ──────────────────────────────────────────────────────────────────
$UD.onDialRotate((message) => {
  const dir = String(message.rotateEvent || "").includes("left") ? -1 : 1;
  if (message.uuid === A_KOMOFOCUS) return void wc.komoFocus(dir);
  if (message.uuid === A_SWITCHER) {
    if (!wc.windows.length) {
      wc.refresh();
      return $UD.showAlert(message.context);
    }
    const w = wc.rotate(dir);
    if (w) $UD.setStateIcon(message.context, 0, cleanTitle(w.title));
  }
});

$UD.onDialDown((message) => {
  if (message.uuid === A_KOMOFOCUS) return void wc.komoMonocle();
  if (message.uuid === A_SWITCHER) {
    const w = wc.current();
    if (!w) {
      wc.refresh();
      return $UD.showAlert(message.context);
    }
    const ok = wc.focus(w);
    log(`focus "${w.title}" (${w.hwnd}) -> ${ok}`);
    $UD.setStateIcon(message.context, 0, cleanTitle(w.title));
    if (!ok) $UD.showAlert(message.context);
  }
});

// ── keypads ─────────────────────────────────────────────────────────────────────
$UD.onRun((message) => {
  if (message.uuid === A_FILTER) {
    const mode = wc.toggleFilter();
    wc.refresh();
    relabelFilters();
    try {
      $UD.setGlobalSettings({ filter: mode, terminalRegex: wc.cfg.terminalRegex, komorebicPath: wc.cfg.komorebicPath });
    } catch (e) {}
    log("filter -> " + mode);
    return;
  }
  if (message.uuid === A_KOMOCMD) {
    let cmd = komoByCtx.get(message.context);
    if (!cmd) {
      const args = argsFromParam(paramOf(message));
      cmd = args ? { args } : null;
    }
    if (!cmd || !cmd.args) {
      try {
        $UD.getSettings(message.context);
      } catch (e) {}
      return $UD.showAlert(message.context);
    }
    if (!wc.komo(cmd.args)) $UD.showAlert(message.context);
  }
});

// ── Property Inspector data feed ──────────────────────────────────────────────
$UD.onSendToPlugin((message) => {
  const d = paramOf(message);
  if (!d) return;
  if (d.type === "getConfig") {
    $UD.sendToPropertyInspector(
      {
        type: "config",
        filter: wc.cfg.filter,
        terminalRegex: wc.cfg.terminalRegex,
        komorebicPath: wc.cfg.komorebicPath,
        windows: wc.windows.length,
      },
      message.context
    );
  }
});
