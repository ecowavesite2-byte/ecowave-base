#!/usr/bin/env node
/**
 * content:restore — replace content/ (+ data/media/) from an archive.
 *
 * DESTRUCTIVE. Requires an explicit `--yes` and refuses to run without it.
 * Flow: extract to a staging dir → validate the staged content → safety backup
 * of the current state → swap (keeping the replaced state under
 * `data/restore-staging/replaced-<ISO>/` for rollback).
 *
 * Usage:  npm run content:restore -- data/backups/<ISO>.tar --yes
 * Stop the server before restoring (Windows file locks).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const yes = args.includes("--yes");
const archiveArg = args.find((arg) => !arg.startsWith("--"));

function fail(message) {
  console.error(`content:restore failed — ${message}`);
  process.exit(1);
}

if (!yes) fail("refusing to restore without --yes (this overwrites content/)");
if (!archiveArg) fail("usage: npm run content:restore -- <archive.tar> --yes");

const archive = path.resolve(archiveArg);
if (!fs.existsSync(archive)) fail(`archive not found: ${archive}`);

const tarCheck = spawnSync("tar", ["--version"], { encoding: "utf8" });
if (tarCheck.error || tarCheck.status !== 0) fail("`tar` is not available on PATH");

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const staging = path.join(ROOT, "data", "restore-staging", stamp);
fs.mkdirSync(staging, { recursive: true });

// 1) extract into staging
const extract = spawnSync("tar", ["-xf", archive, "-C", staging], { stdio: "inherit" });
if (extract.status !== 0) fail(`extract failed (status ${extract.status})`);

const stagedContent = path.join(staging, "content");
if (!fs.existsSync(stagedContent)) fail("archive does not contain a content/ directory");

// 2) validate the staged content before touching the live tree
const validate = spawnSync(process.execPath, [path.join(ROOT, "scripts", "content-validate.mjs")], {
  cwd: ROOT,
  stdio: "inherit",
  env: { ...process.env, CONTENT_ROOT: stagedContent },
});
if (validate.status !== 0) fail("staged content failed validation; nothing was changed");

// 3) safety backup of the current state
const backup = spawnSync(process.execPath, [path.join(ROOT, "scripts", "content-backup.mjs")], {
  cwd: ROOT,
  stdio: "inherit",
});
if (backup.status !== 0) fail("safety backup failed; refusing to swap");

// 4) swap, keeping the replaced state for rollback
const retired = path.join(ROOT, "data", "restore-staging", `replaced-${stamp}`);
fs.mkdirSync(retired, { recursive: true });

const currentContent = path.join(ROOT, "content");
if (fs.existsSync(currentContent)) fs.renameSync(currentContent, path.join(retired, "content"));
fs.renameSync(stagedContent, currentContent);

const stagedMedia = path.join(staging, "data", "media");
const currentMedia = path.join(ROOT, "data", "media");
if (fs.existsSync(stagedMedia)) {
  if (fs.existsSync(currentMedia)) fs.renameSync(currentMedia, path.join(retired, "media"));
  fs.renameSync(stagedMedia, currentMedia);
}

console.log(
  `content:restore ok — swapped in content/; previous state kept at ${path.relative(ROOT, retired)}`,
);
