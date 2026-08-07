#!/usr/bin/env node
// Публикация публичного зеркала dungeonslab-file-manager (репозиторий, из которого
// ставят модуль): один коммит без истории разработки, как описано в процессе релиза.
// Берёт дерево master, подменяет README.md на собственный README зеркала, собирает
// tree/commit через git plumbing (рабочая копия не трогается) и обновляет ветку main.
// Требует настроенный remote "public" -> https://github.com/Vladimir-inc/dungeonslab-file-manager
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const idx = path.join(root, ".git", "tmp-release-index");
const git = (args, extraEnv = {}) =>
  execFileSync("git", args, {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    encoding: "utf8",
  }).trim();

const manifest = JSON.parse(git(["show", "master:module.json"]));
git(["fetch", "public", "main"]);
const readmeBlob = git(["rev-parse", "public/main:README.md"]);

rmSync(idx, { force: true });
const env = { GIT_INDEX_FILE: idx };
git(["read-tree", "master^{tree}"], env);
git(["update-index", "--cacheinfo", `100644,${readmeBlob},README.md`], env);
const tree = git(["write-tree"], env);
rmSync(idx, { force: true });

const commit = git(["commit-tree", tree, "-m", `File Manager Dungeons Lab v${manifest.version}`]);
git(["push", "public", `+${commit}:refs/heads/main`]);
console.log(`mirror updated: v${manifest.version} -> ${commit}`);
