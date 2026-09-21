/**
 * Style diff — compares style-probe JSON for orig vs local on one viewport.
 *
 * Reads   design/audit/style-probe/orig-<vp>[-tag].json
 *         design/audit/style-probe/local-<vp>[-tag].json
 * and writes a readable report to
 *         design/audit/style-probe/diff-<vp>[-tag].txt
 * (same report is echoed to stdout).
 *
 * It compares BOTH the original typography fields and the motion/effect fields
 * added to style-probe (transition*, animation*, transform, opacity, willChange,
 * backgroundAttachment), grouped by page + selector, and suppresses benign
 * noise:
 *   - `transform: none` vs an identity matrix
 *   - whitespace / ordering differences in parallel transition & animation lists
 *   - numeric-only opacity formatting (0 vs 0.0)
 * When a transition/animation already matches as a reordered set, the
 * per-property string differences are dropped instead of reported.
 *
 * Usage:
 *   node scripts/audit/style-diff.mjs [desktop|mobile] [pageKey ...] [--tag=motion]
 *
 * Examples:
 *   node scripts/audit/style-diff.mjs desktop
 *   node scripts/audit/style-diff.mjs desktop home news --tag=motion
 *
 * Backward compatible: if the probe files predate the motion fields, motion
 * diffs simply do not appear (typography report is unchanged).
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const getArg = (name, dflt) => {
  const a = args.find((x) => x.startsWith("--" + name + "="));
  return a ? a.split("=").slice(1).join("=") : dflt;
};
const positional = args.filter((a) => !a.startsWith("--"));
const VP = positional[0] === "desktop" || positional[0] === "mobile" ? positional[0] : "desktop";
const pageFilter = (VP === positional[0] ? positional.slice(1) : positional).filter(Boolean);

const TAG_RAW = getArg("tag", "");
const TAG = TAG_RAW ? (/^[-_]/.test(TAG_RAW) ? TAG_RAW : "-" + TAG_RAW) : "";

const DIR = path.resolve("design/audit/style-probe");
const origPath = path.join(DIR, `orig-${VP}${TAG}.json`);
const localPath = path.join(DIR, `local-${VP}${TAG}.json`);
const reportPath = path.join(DIR, `diff-${VP}${TAG}.txt`);

const missing = [];
if (!fs.existsSync(origPath)) missing.push(origPath);
if (!fs.existsSync(localPath)) missing.push(localPath);
if (missing.length) {
  console.error(`style-diff: missing probe file(s) for vp=${VP}${TAG}:`);
  if (!fs.existsSync(origPath)) {
    console.error(`  ${origPath}`);
    console.error(`    run: node scripts/audit/style-probe.mjs --side=orig --vp=${VP}${TAG ? " --tag=" + TAG.replace(/^[-_]/, "") : ""}`);
  }
  if (!fs.existsSync(localPath)) {
    console.error(`  ${localPath}`);
    console.error(`    run: node scripts/audit/style-probe.mjs --side=local --vp=${VP}${TAG ? " --tag=" + TAG.replace(/^[-_]/, "") : ""}`);
  }
  process.exit(1);
}

const orig = JSON.parse(fs.readFileSync(origPath, "utf8"));
const local = JSON.parse(fs.readFileSync(localPath, "utf8"));

/* ------------------------------------------------------------------ fields */

const TYPE_FIELDS = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
  "color",
  "textAlign",
  "textTransform",
];

const MOTION_FIELDS = [
  "transitionProperty",
  "transitionDuration",
  "transitionTimingFunction",
  "transitionDelay",
  "animationName",
  "animationDuration",
  "animationTimingFunction",
  "animationDelay",
  "animationIterationCount",
  "animationFillMode",
  "transform",
  "opacity",
  "willChange",
  "backgroundAttachment",
];

const ALL_FIELDS = [...TYPE_FIELDS, ...MOTION_FIELDS];
const MOTION_SET = new Set(MOTION_FIELDS);

const LINE_CAP = 60;
const lerp = (s) => s || "";

/* ------------------------------------------------------- benign-noise norms */

const safeArr = (v) => String(v == null ? "" : v).split(",").map((x) => x.trim());
const clean = (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim();

/** `none` and any identity matrix are the same thing. */
function normTransform(raw) {
  const v = clean(raw);
  if (!v || v === "none") return "none";
  if (/^matrix\(\s*1\s*,\s*0\s*,\s*0\s*,\s*1\s*,\s*0\s*,\s*0\s*\)$/.test(v)) return "none";
  if (/^matrix3d\(\s*1\s*,\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*,\s*1\s*,\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*,\s*1\s*,\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*,\s*1\s*\)$/.test(v)) return "none";
  return v;
}

/** opacity "0" == "0.0"; keeps other values as strings. */
function normOpacity(raw) {
  const v = clean(raw);
  if (v === "") return v;
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return String(+n.toFixed(4));
}

/**
 * Canonical signature of a parallel transition (or animation) list: pairs each
 * position across the sub-lists, then sorts. Shorter sub-lists are cycled (CSS
 * repeats a single value across the whole property list), so reordering /
 * whitespace / value repetition compare equal.
 * `names` are the property-name arrays in a fixed order.
 */
function listSignature(lists, names) {
  const cols = names.map((n) => safeArr(lists[n]));
  const len = Math.max(0, ...cols.map((c) => c.length));
  if (len === 0) return "";
  // nothing meaningful to compare
  if (cols.every((c) => c.length <= 1 && (c[0] || "") === "")) return "";
  const tuples = [];
  for (let i = 0; i < len; i++) {
    tuples.push(cols.map((c) => clean(c.length ? c[i % c.length] : "")).join("|"));
  }
  return tuples.filter((t) => t.replace(/\|/g, "") !== "").sort().join(" ;; ");
}

function transitionSig(s) {
  return listSignature(s, ["transitionProperty", "transitionDuration", "transitionTimingFunction", "transitionDelay"]);
}
function animationSig(s) {
  return listSignature(s, [
    "animationName",
    "animationDuration",
    "animationTimingFunction",
    "animationDelay",
    "animationIterationCount",
    "animationFillMode",
  ]);
}

/** normalize one field for comparison */
function normField(f, v) {
  if (f === "transform") return normTransform(v);
  if (f === "opacity") return normOpacity(v);
  return clean(v);
}

/**
 * Fields that differ after normalization. Drops the whole transition group
 * when its canonical signature matches (reordering) and the same for the
 * animation group. Returns the surviving changes plus the count suppressed.
 */
function changedFields(oS, lS) {
  const out = [];
  let suppressed = 0;
  const tSigO = transitionSig(oS);
  const tSigL = transitionSig(lS);
  const transitionSame = tSigO !== "" && tSigO === tSigL;
  const aSigO = animationSig(oS);
  const aSigL = animationSig(lS);
  const animSame = aSigO !== "" && aSigO === aSigL;
  for (const f of ALL_FIELDS) {
    const o = normField(f, oS[f]);
    const l = normField(f, lS[f]);
    if (o === l) continue;
    if (transitionSame && f.startsWith("transition")) {
      suppressed++;
      continue;
    }
    if (animSame && f.startsWith("animation")) {
      suppressed++;
      continue;
    }
    out.push({ f, o, l });
  }
  return { changes: out, suppressed };
}

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

const lines = [];
const say = (s = "") => {
  lines.push(s);
};

say(`style-diff vp=${VP}${TAG}  pages=${keys.length}  fields=${TYPE_FIELDS.length} typography + ${MOTION_FIELDS.length} motion`);
say(`orig : ${origPath}`);
say(`local: ${localPath}`);

const summary = [];
const fontLines = [];
let totalType = 0;
let totalMotion = 0;
let totalSuppressed = 0;
let motionFieldsSeen = 0;

for (const key of keys) {
  const oRec = orig[key] || {};
  const lRec = local[key] || {};
  const oGroups = group(oRec.samples);
  const lGroups = group(lRec.samples);

  const typeLines = [];
  const motionLines = [];
  let typeDiffs = 0;
  let motionDiffs = 0;
  let suppressed = 0;

  for (const [sel, oMap] of oGroups) {
    const lMap = lGroups.get(sel);
    if (!lMap) continue;
    for (const [t, oS] of oMap) {
      if (!lMap.has(t)) continue;
      const lS = lMap.get(t);
      const { changes, suppressed: supCount } = changedFields(oS, lS);
      // count how many samples actually carry any motion key (proof the probe ran)
      if (motionFieldsSeen === 0 && MOTION_FIELDS.some((f) => f in oS || f in lS)) motionFieldsSeen = 1;
      suppressed += supCount;
      if (!changes.length) continue;
      const typ = changes.filter((c) => !MOTION_SET.has(c.f));
      const mot = changes.filter((c) => MOTION_SET.has(c.f));
      if (typ.length) {
        typeDiffs++;
        typeLines.push(
          `${key} [${sel}] "${oS.text}" :: ${typ.map((c) => `${c.f}=${c.o}`).join(", ")} || ${typ.map((c) => `${c.f}=${c.l}`).join(", ")}`,
        );
      }
      if (mot.length) {
        motionDiffs++;
        motionLines.push(
          `${key} [${sel}] "${oS.text}" :: ORIG ${mot.map((c) => `${c.f}=${c.o}`).join(", ")} || LOCAL ${mot.map((c) => `${c.f}=${c.l}`).join(", ")}`,
        );
      }
    }
  }

  if (typeLines.length || motionLines.length) {
    say(`\n=== ${key} ===`);
    if (typeLines.length) {
      say(`-- TYPE (${typeDiffs}) --`);
      for (const line of typeLines.slice(0, LINE_CAP)) say(line);
      if (typeLines.length > LINE_CAP) say(`  +${typeLines.length - LINE_CAP} more`);
    }
    if (motionLines.length) {
      say(`-- MOTION (${motionDiffs}) --`);
      for (const line of motionLines.slice(0, LINE_CAP)) say(line);
      if (motionLines.length > LINE_CAP) say(`  +${motionLines.length - LINE_CAP} more`);
    }
    if (suppressed) say(`  (${suppressed} benign motion diffs suppressed: reordered/identical transition or animation lists)`);
  }

  totalType += typeDiffs;
  totalMotion += motionDiffs;
  totalSuppressed += suppressed;
  summary.push(`${key}: ${typeDiffs} typography, ${motionDiffs} motion differing elements${suppressed ? ` (${suppressed} suppressed)` : ""}`);

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

say("\n=== SUMMARY ===");
for (const s of summary) say(s);
say(`TOTAL: ${totalType} typography, ${totalMotion} motion, ${totalSuppressed} benign motion suppressed`);

say("\n=== FONTS (present on one side only) ===");
if (!fontLines.length) say("(none)");
else for (const s of fontLines) say(s);

if (!motionFieldsSeen) {
  say("\nNOTE: neither probe file carried motion fields — re-run style-probe to populate them.");
}

const report = lines.join("\n") + "\n";
fs.writeFileSync(reportPath, report);
process.stdout.write(report);
console.error(`wrote ${reportPath}`);
