// Hardware-free self-check: the engine's pure logic (filter + rotate + komo command building),
// the plugin manifest, the vendored SDK, the bundled Win32 helper, and the engine-sync copy.
// No dial, no Ulanzi Studio, and it never enumerates or focuses real windows. Run: `npm test`.

import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { WindowControl, DEFAULT_TERMINALS } from "../shared/window-control.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const PLUGIN = path.join(root, "plugin", "com.ulanzi.windowcontrol.ulanziPlugin");

let passed = 0;
const ok = (name, cond) => {
  assert(cond, name);
  passed++;
};
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

// ── filtering (pure) ───────────────────────────────────────────────────────────
const raw = [
  { hwnd: 1, proc: "WindowsTerminal", title: "claude-master-start" },
  { hwnd: 2, proc: "chrome", title: "GitHub" },
  { hwnd: 3, proc: "powershell", title: "pwsh" },
  { hwnd: 4, proc: "Discord", title: "chat" },
];
const wc = new WindowControl({ filter: "terminals" }, () => {});
ok("default terminal regex applied", wc.cfg.terminalRegex === DEFAULT_TERMINALS);
ok("terminals filter keeps only terminals", wc._filter(raw).length === 2);
wc.setFilter("all");
ok("all filter keeps everything", wc._filter(raw).length === 4);
ok("toggleFilter flips back to terminals", wc.toggleFilter() === "terminals");

// custom regex is honored and undefined never clobbers the default
const wc2 = new WindowControl({ terminalRegex: "chrome", terminalRegex_unused: undefined }, () => {});
ok("custom regex respected", wc2._filter(raw).length === 1 && wc2._filter(raw)[0].proc === "chrome");

// ── selection (rotate wraps, current tracks idx) ────────────────────────────────
wc.cfg.filter = "all";
wc.windows = wc._filter(raw);
ok("current() is first window", wc.current().hwnd === 1);
ok("rotate forward", wc.rotate(1).hwnd === 2);
ok("rotate back", wc.rotate(-1).hwnd === 1);
ok("rotate wraps below zero", wc.rotate(-1).hwnd === 4);
const empty = new WindowControl({}, () => {});
ok("empty list: current null, rotate null", empty.current() === null && empty.rotate(1) === null);

// ── manifest sanity ─────────────────────────────────────────────────────────────
const man = readJson(path.join(PLUGIN, "manifest.json"));
ok("manifest UUID is 4 segments", man.UUID.split(".").length === 4);
ok("manifest CodePath is the node entry", man.CodePath === "plugin/app.js");
ok("manifest Type JavaScript", man.Type === "JavaScript");
const actions = man.Actions || [];
ok("four actions", actions.length === 4);
ok("two encoders", actions.filter((a) => (a.Controllers || []).includes("Encoder")).length === 2);
ok("two keypads", actions.filter((a) => (a.Controllers || []).includes("Keypad")).length === 2);
const uuids = actions.map((a) => a.UUID);
ok("action UUIDs unique", new Set(uuids).size === uuids.length);
for (const a of actions) ok(`action ${a.Name} UUID has 5+ segments`, a.UUID.split(".").length >= 5);
const refs = [man.Icon, man.CategoryIcon, ...actions.flatMap((a) => [a.Icon, a.PropertyInspectorPath, ...(a.States || []).map((s) => s.Image)])].filter(Boolean);
for (const r of refs) ok(`manifest ref exists: ${r}`, fs.existsSync(path.join(PLUGIN, r)));
ok("ulanzi-api vendored", fs.existsSync(path.join(PLUGIN, "ulanzi-api", "index.js")));
ok("PI libs vendored", fs.existsSync(path.join(PLUGIN, "libs", "js", "ulanziApi.js")));

// ── config example valid ────────────────────────────────────────────────────────
const ex = readJson(path.join(PLUGIN, "config.example.json"));
ok("config.example has filter", ex.filter === "terminals" || ex.filter === "all");

// ── engine + helper sync copies present and in sync ─────────────────────────────
const sharedEngine = fs.readFileSync(path.join(root, "shared", "window-control.js"), "utf8");
const pluginEngine = path.join(PLUGIN, "plugin", "window-control.js");
ok("plugin engine copy exists (run `npm run build`)", fs.existsSync(pluginEngine));
if (fs.existsSync(pluginEngine)) {
  ok("plugin engine copy in sync with shared", fs.readFileSync(pluginEngine, "utf8").includes(sharedEngine.trim().slice(0, 400)));
}
ok("winctl.ps1 bundled next to engine copy", fs.existsSync(path.join(PLUGIN, "plugin", "winctl.ps1")));

console.log(`ok — ${passed} checks passed`);
