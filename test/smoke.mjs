// Hardware-free self-check: the launcher engine's discovery/selection logic, the plugin
// manifest, the vendored SDK, and the engine-sync copy. No dial, no Ulanzi Studio, and it
// never touches your real ~/.claude (it builds a throwaway projects dir). Run: `npm test`.

import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { ClaudeLauncher } from "../shared/claude-launcher.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const PLUGIN = path.join(root, "plugin", "com.ulanzi.claudelauncher.ulanziPlugin");

let passed = 0;
const ok = (name, cond) => {
  assert(cond, name);
  passed++;
};
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

// ── discovery against a synthetic projects dir ────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "claunch-"));
const proj = path.join(tmp, "C--Users-test-Projects-demo");
fs.mkdirSync(proj, { recursive: true });
const sessionId = "11111111-2222-3333-4444-555555555555";
const transcript = [
  JSON.stringify({ type: "mode", mode: "normal", sessionId }),
  JSON.stringify({ type: "user", cwd: "C:\\Users\\test\\Projects\\demo", message: { role: "user", content: "first prompt here" } }),
  JSON.stringify({ type: "ai-title", aiTitle: "Build the demo widget", sessionId }),
  JSON.stringify({ type: "assistant", cwd: "C:\\Users\\test\\Projects\\demo", message: { role: "assistant", content: "ok" } }),
].join("\n");
fs.writeFileSync(path.join(proj, sessionId + ".jsonl"), transcript);
// an empty transcript that must be ignored
fs.writeFileSync(path.join(proj, "empty.jsonl"), "");

const launcher = new ClaudeLauncher({ projectsDir: tmp }, () => {});
launcher.refresh();
ok("indexes one non-empty session", launcher.sessions.length === 1);
ok("reads cwd from transcript", launcher.sessions[0].cwd === "C:\\Users\\test\\Projects\\demo");
ok("project basename derived", launcher.sessions[0].project === "demo");
ok("prefers ai-title as label", launcher.sessions[0].title === "Build the demo widget");
ok("session id from filename", launcher.sessions[0].id === sessionId);
ok("rolls up unique projects", launcher.projects.length === 1 && launcher.projects[0].project === "demo");
ok("latestForProject matches", launcher.latestForProject("C:\\Users\\test\\Projects\\demo").id === sessionId);

// selection wraps around
ok("current() is first", launcher.current().id === sessionId);
ok("rotate wraps to same single item", launcher.rotate(1).id === sessionId);
ok("rotate back wraps too", launcher.rotate(-1).id === sessionId);

// folder decode fallback
ok("_decodeFolder reconstructs a path", launcher._decodeFolder("C--Users-test-Projects-demo") === "C:\\Users\\test\\Projects\\demo");

// empty projects dir -> no crash, empty lists
const empty = new ClaudeLauncher({ projectsDir: path.join(tmp, "does-not-exist") }, () => {});
empty.refresh();
ok("missing dir -> empty, no throw", empty.sessions.length === 0 && empty.current() === null && empty.rotate(1) === null);

fs.rmSync(tmp, { recursive: true, force: true });

// ── plugin manifest sanity ────────────────────────────────────────────────────
const man = readJson(path.join(PLUGIN, "manifest.json"));
ok("manifest UUID is 4 segments", man.UUID.split(".").length === 4);
ok("manifest CodePath is the node entry", man.CodePath === "plugin/app.js");
ok("manifest Type JavaScript", man.Type === "JavaScript");
const actions = man.Actions || [];
ok("two actions (Encoder + Keypad)", actions.length === 2);
ok("has an Encoder action", actions.some((a) => (a.Controllers || []).includes("Encoder")));
ok("has a Keypad action", actions.some((a) => (a.Controllers || []).includes("Keypad")));
for (const a of actions) ok(`action ${a.Name} UUID has 5+ segments`, a.UUID.split(".").length >= 5);
const refs = [man.Icon, man.CategoryIcon, ...actions.flatMap((a) => [a.Icon, a.PropertyInspectorPath, ...(a.States || []).map((s) => s.Image)])].filter(Boolean);
for (const r of refs) ok(`manifest ref exists: ${r}`, fs.existsSync(path.join(PLUGIN, r)));
ok("ulanzi-api vendored", fs.existsSync(path.join(PLUGIN, "ulanzi-api", "index.js")));
ok("PI libs vendored", fs.existsSync(path.join(PLUGIN, "libs", "js", "ulanziApi.js")));

// ── config example is valid + side-effect free ────────────────────────────────
const ex = readJson(path.join(PLUGIN, "config.example.json"));
ok("config.example has claudeCmd", typeof ex.claudeCmd === "string");

// ── engine sync copy matches source ───────────────────────────────────────────
const sharedEngine = fs.readFileSync(path.join(root, "shared", "claude-launcher.js"), "utf8");
const pluginEnginePath = path.join(PLUGIN, "plugin", "claude-launcher.js");
ok("plugin engine copy exists (run `npm run build`)", fs.existsSync(pluginEnginePath));
if (fs.existsSync(pluginEnginePath)) {
  ok("plugin engine copy in sync with shared", fs.readFileSync(pluginEnginePath, "utf8").includes(sharedEngine.trim().slice(0, 400)));
}

console.log(`ok — ${passed} checks passed`);
