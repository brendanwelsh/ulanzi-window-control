// Copies the source-of-truth engine + Win32 helper (shared/) into the plugin folder so the
// plugin is self-contained when zipped for sharing. Run via `npm run build`.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const PLUGIN = path.join(root, "plugin", "com.ulanzi.windowcontrol.ulanziPlugin");

const src = path.join(root, "shared", "window-control.js");
const dest = path.join(PLUGIN, "plugin", "window-control.js");

const header =
  "// AUTO-GENERATED COPY of shared/window-control.js — DO NOT EDIT HERE.\n" +
  "// Edit shared/window-control.js, then run `npm run build` to refresh this copy.\n\n";

fs.writeFileSync(dest, header + fs.readFileSync(src, "utf8"));
console.log("synced engine -> " + path.relative(root, dest));

// the engine shells out to winctl.ps1 sitting next to it — copy it too
const ps1Dest = path.join(PLUGIN, "plugin", "winctl.ps1");
fs.copyFileSync(path.join(root, "shared", "winctl.ps1"), ps1Dest);
console.log("synced winctl.ps1 -> " + path.relative(root, ps1Dest));
