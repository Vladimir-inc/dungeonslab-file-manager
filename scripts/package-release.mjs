#!/usr/bin/env node
// Builds dist/, stages the files Foundry actually needs at runtime (not just
// the vite build output), zips them, then re-reads the zip listing and fails
// loudly if anything required is missing. Fixes the v0.4.3 incident where the
// release zip was hand-built and silently missing templates/lang, which broke
// the module on load for real users.
//
// ponytail: shells out to the system zip/unzip binaries (same ones already
// used to hand-build past releases) instead of pulling in a JS zip library.
// If this ever needs to run somewhere without zip/unzip on PATH, swap in a
// package like `archiver`.
import { execFileSync, execSync } from "node:child_process";
import { existsSync, rmSync, mkdirSync, cpSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const stage = path.join(root, ".release-stage");
const zipPath = path.join(root, "module.zip");

const REQUIRED_FILES = [
  "module.json",
  "LICENSE",
  "README.md",
  "dist/module.mjs",
  "dist/styles/module.css",
  "lang/en.json",
  "lang/ru.json",
  "templates/parts/item.hbs",
  "templates/parts/main.hbs",
  "templates/parts/overlays.hbs",
  "templates/parts/preview.hbs",
  "templates/parts/sidebar.hbs",
  "templates/parts/statusbar.hbs",
  "templates/parts/tabs.hbs",
  "templates/parts/toolbar.hbs",
];

console.log("Building dist/ ...");
// static command, no interpolated input: execSync is safe here, execFileSync
// can't launch npm's .cmd shim on Windows without a shell.
execSync("npm run build", { cwd: root, stdio: "inherit" });

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

for (const rel of REQUIRED_FILES) {
  const src = path.join(root, rel);
  if (!existsSync(src)) {
    console.error(`Missing required file before packaging: ${rel}`);
    process.exit(1);
  }
  const dest = path.join(stage, rel);
  mkdirSync(path.dirname(dest), { recursive: true });
  cpSync(src, dest);
}

rmSync(zipPath, { force: true });
execFileSync("zip", ["-r", "-X", zipPath, "."], { cwd: stage, stdio: "inherit" });
rmSync(stage, { recursive: true, force: true });

const listing = execFileSync("unzip", ["-l", zipPath]).toString();
const missing = REQUIRED_FILES.filter((f) => !listing.includes(f));
if (missing.length) {
  console.error("module.zip is missing required files after packaging:\n" + missing.join("\n"));
  process.exit(1);
}

console.log(`module.zip built and verified at ${zipPath} (${REQUIRED_FILES.length} required files present).`);
