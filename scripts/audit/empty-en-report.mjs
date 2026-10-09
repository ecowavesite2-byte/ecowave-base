/**
 * Report EN content fields that are empty while the KO counterpart is not (the
 * client asked to mirror the KO value until the admins translate). Read-only.
 *
 * Usage: node scripts/audit/empty-en-report.mjs [--json]
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CONTENT = path.join(ROOT, "content");

const TEXT_KEYS = new Set([
  "html",
  "text",
  "title",
  "desc",
  "alt",
  "name",
  "subtitle",
  "tagline",
  "range",
  "year",
]);

function stripTags(s) {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const out = [];

function walk(ko, en, p) {
  if (typeof ko === "string") {
    const key = p
      .split(".")
      .pop()
      .replace(/\[\d+\]$/, "");
    if (!TEXT_KEYS.has(key)) return;
    if (ko.trim() === "") return;
    if (en === undefined) {
      out.push({ p, kind: "path-missing-in-en", ko, en: "" });
      return;
    }
    const enStr = typeof en === "string" ? en : "";
    if (enStr.trim() === "") {
      out.push({ p, kind: "empty", ko, en: enStr });
      return;
    }
    // html-ish: no visible text left after stripping tags
    if (/[<&]/.test(ko) && stripTags(ko) !== "" && stripTags(enStr) === "") {
      out.push({ p, kind: "no-visible-text", ko, en: enStr });
    }
    return;
  }
  if (Array.isArray(ko)) {
    const e = Array.isArray(en) ? en : [];
    ko.forEach((v, i) => walk(v, e[i], `${p}[${i}]`));
    if (Array.isArray(en) && en.length > ko.length) {
      out.push({
        p,
        kind: "extra-en-items",
        ko: "",
        en: `ko=${ko.length} en=${en.length}`,
      });
    }
    return;
  }
  if (ko && typeof ko === "object") {
    const e = en && typeof en === "object" && !Array.isArray(en) ? en : {};
    for (const k of Object.keys(ko))
      walk(ko[k], e[k], p === "" ? k : `${p}.${k}`);
  }
}

function pairDir(sub) {
  const koDir = path.join(CONTENT, "ko", sub);
  const enDir = path.join(CONTENT, "en", sub);
  if (!fs.existsSync(koDir)) return;
  for (const f of fs.readdirSync(koDir)) {
    if (!f.endsWith(".json")) continue;
    const enPath = path.join(enDir, f);
    if (!fs.existsSync(enPath)) {
      out.push({ p: `${sub}/${f}`, kind: "missing-en-file", ko: "", en: "" });
      continue;
    }
    walk(readJson(path.join(koDir, f)), readJson(enPath), `${sub}/${f}`);
  }
}

pairDir("pages");
pairDir("boards");
walk(
  readJson(path.join(CONTENT, "ko", "site.json")),
  readJson(path.join(CONTENT, "en", "site.json")),
  "site.json",
);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(out, null, 2));
} else {
  const byFile = new Map();
  for (const r of out) {
    const file = r.p.split(".").slice(0, 2).join(".");
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push(r);
  }
  for (const [file, rows] of byFile) {
    console.log(`\n=== ${file} (${rows.length}) ===`);
    for (const r of rows) {
      console.log(`  [${r.kind}] ${r.p}`);
      console.log(`      ko: ${JSON.stringify(r.ko).slice(0, 160)}`);
      console.log(`      en: ${JSON.stringify(r.en).slice(0, 160)}`);
    }
  }
  console.log(`\nTOTAL: ${out.length}`);
}
