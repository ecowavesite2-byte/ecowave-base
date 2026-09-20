/**
 * Style diff — compares style-probe JSON for orig vs local on one viewport.
 * Reads  design/audit/style-probe/orig-<vp>.json  +  local-<vp>.json
 *
 * Usage:
 *   node scripts/audit/style-diff.mjs [desktop|mobile] [pageKey ...]
 *
 * Output is compact: only mismatched elements, one line each (cap 60/page),
 * then a per-page differing-element count and font families unique to a side.
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const first = args[0];
const VP = first === "desktop" || first === "mobile" ? first : "desktop";
const pageFilter = (VP === first ? args.slice(1) : args).filter(Boolean);

const DIR = path.resolve("design/audit/style-probe");
const origPath = path.join(DIR, `orig-${VP}.json`);
const localPath = path.join(DIR, `local-${VP}.json`);

const missing = [];
if (!fs.existsSync(origPath)) missing.push(origPath);
if (!fs.existsSync(localPath)) missing.push(localPath);
if (missing.length) {
  console.error(`style-diff: missing probe file(s) for vp=${VP}:`);
  if (!fs.existsSync(origPath)) {
    console.error(`  ${origPath}`);
    console.error(`    run: node scripts/audit/style-probe.mjs --side=orig --vp=${VP}`);
  }
  if (!fs.existsSync(localPath)) {
    console.error(`  ${localPath}`);
    console.error(`    run: node scripts/audit/style-probe.mjs --side=local --vp=${VP}`);
  }
  process.exit(1);
}

const orig = JSON.parse(fs.readFileSync(origPath, "utf8"));
const local = JSON.parse(fs.readFileSync(localPath, "utf8"));

const FIELDS = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
  "color",
  "textAlign",
  "textTransform",
];
const LINE_CAP = 60;

const normText = (s) => (s || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 30);

/** selector -> Map(textKey -> first sample) */
function group(samples) {
  const bySel = new Map();
  for (const s of samples || []) {
    if (!bySel.has(s.sel)) bySel.set(s.sel, new Map());
    const m = bySel.get(s.sel);
    const t = normText(s.text);
    if (!m.has(t)) m.set(t, s);
  }
  return bySel;
}

function familySet(rec) {
  return new Set((rec.fonts || []).map((f) => f.family));
}

const keys = Object.keys(orig).filter(
  (k) => local[k] && (!pageFilter.length || pageFilter.includes(k)),
);

console.log(`style-diff vp=${VP}  pages=${keys.length}`);

const summary = [];
const fontLines = [];

for (const key of keys) {
  const oRec = orig[key] || {};
  const lRec = local[key] || {};
  const oGroups = group(oRec.samples);
  const lGroups = group(lRec.samples);

  const lines = [];
  let diffs = 0;

  for (const [sel, oMap] of oGroups) {
    const lMap = lGroups.get(sel);
    if (!lMap) continue;
    for (const [t, oS] of oMap) {
      if (!lMap.has(t)) continue;
      const lS = lMap.get(t);
      const oFields = [];
      const lFields = [];
      for (const f of FIELDS) {
        if ((oS[f] ?? "") !== (lS[f] ?? "")) {
          oFields.push(`${f}=${oS[f]}`);
          lFields.push(`${f}=${lS[f]}`);
        }
      }
      if (!oFields.length) continue;
      diffs++;
      lines.push(`${key} [${sel}] "${oS.text}" :: ORIG ${oFields.join(", ")} || LOCAL ${lFields.join(", ")}`);
    }
  }

  if (lines.length) {
    console.log(`\n=== ${key} ===`);
    for (const line of lines.slice(0, LINE_CAP)) console.log(line);
    if (lines.length > LINE_CAP) console.log(`  +${lines.length - LINE_CAP} more`);
  }

  summary.push(`${key}: ${diffs} differing elements`);

  const oFams = familySet(oRec);
  const lFams = familySet(lRec);
  const origOnly = [...oFams].filter((f) => !lFams.has(f));
  const localOnly = [...lFams].filter((f) => !oFams.has(f));
  if (origOnly.length || localOnly.length) {
    const parts = [];
    if (origOnly.length) parts.push(`orig-only: ${origOnly.join(", ")}`);
    if (localOnly.length) parts.push(`local-only: ${localOnly.join(", ")}`);
    fontLines.push(`${key}: ${parts.join(" | ")}`);
  }
}

console.log("\n=== SUMMARY ===");
for (const s of summary) console.log(s);

console.log("\n=== FONTS (present on one side only) ===");
if (!fontLines.length) console.log("(none)");
else for (const s of fontLines) console.log(s);
