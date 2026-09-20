#!/usr/bin/env node
/**
 * content:backup — archive the content store + uploaded media.
 *
 * Creates `data/backups/<ISO>.tar` (or an explicit path argument) containing
 * `content/` (includes `media-index.json`) and `data/media/` when present.
 * Uses the system `tar` (bsdtar on Windows 10+, GNU tar elsewhere); fails
 * clearly when tar is unavailable.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

function fail(message) {
  console.error(`content:backup failed — ${message}`);
  process.exit(1);
}

const archiveArg = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const archive = archiveArg
  ? path.resolve(archiveArg)
  : path.join(ROOT, "data", "backups", `${stamp}.tar`);

const tarCheck = spawnSync("tar", ["--version"], { encoding: "utf8" });
if (tarCheck.error || tarCheck.status !== 0) {
  fail("`tar` is not available on PATH (install GNU tar or use Windows 10+ bsdtar).");
}

const targets = [];
if (fs.existsSync(path.join(ROOT, "content"))) targets.push("content");
else fail("no content/ directory to archive");
if (fs.existsSync(path.join(ROOT, "data", "media"))) targets.push(path.join("data", "media"));

fs.mkdirSync(path.dirname(archive), { recursive: true });

// Explicit targets (not "data/") so the archive never nests data/backups.
const result = spawnSync("tar", ["-cf", archive, "-C", ROOT, ...targets], { stdio: "inherit" });
if (result.status !== 0) fail(`tar exited with status ${result.status}`);

const size = fs.statSync(archive).size;
console.log(
  `content:backup ok — ${path.relative(ROOT, archive)} (${(size / 1024 / 1024).toFixed(1)} MB) [${targets.join(", ")}]`,
);
