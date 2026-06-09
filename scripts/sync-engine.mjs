// Copies the single source-of-truth engine (shared/claude-launcher.js) into the plugin
// folder so the plugin is self-contained when zipped for sharing. Run via `npm run build`.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const PLUGIN = path.join(root, "plugin", "com.ulanzi.claudelauncher.ulanziPlugin");

const src = path.join(root, "shared", "claude-launcher.js");
const dest = path.join(PLUGIN, "plugin", "claude-launcher.js");

const header =
  "// AUTO-GENERATED COPY of shared/claude-launcher.js — DO NOT EDIT HERE.\n" +
  "// Edit shared/claude-launcher.js, then run `npm run build` to refresh this copy.\n\n";

fs.writeFileSync(dest, header + fs.readFileSync(src, "utf8"));
console.log("synced engine -> " + path.relative(root, dest));
