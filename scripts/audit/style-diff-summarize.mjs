/**
 * style-diff-summarize — condense the readable style-diff reports into compact,
 * interpretable per-viewport summaries.
 *
 * Reads   design/audit/style-probe/diff-<vp>.txt   (produced by style-diff.mjs)
 * Writes  design/audit/style-probe/summary-<vp>.md
 *         design/audit/style-probe/summary-<vp>.json
 *
 * The diff report has a deterministic shape:
 *   header lines (vp / orig / local)
 *   === <page> ===
 *   -- TYPE (n) --            n = declared differing element count
 *     <page> [<sel>] "<text>" :: f=v, f=v || f=v, f=v
 *     ...
 *     +<k> more               (emitted lines are capped at 60 per block)
 *   -- MOTION (n) --
 *     <page> [<sel>] "<text>" :: ORIG f=o || LOCAL f=l
 *   (n benign motion diffs suppressed: ...)
 *   === SUMMARY ===
 *   <page>: n typography, m motion differing elements
 *   TOTAL: T typography, M motion, S benign motion suppressed
 *
 * Per-property counts and signature counts are computed from the element lines
 * that were *emitted*; blocks are capped at 60 lines, so those figures are a
 * floor. The per-page table and the headline totals use the declared counts
 * from the `-- TYPE (n) --` headers / TOTAL line so they reconcile exactly.
 *
 * Usage:
 *   node scripts/audit/style-diff-summarize.mjs [desktop|mobile ...]
 */
import fs from "node:fs";
import path from "node:path";

const DIR = path.resolve("design/audit/style-probe");
const ALL_VPS = ["desktop", "mobile"];
const argVps = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const VPS = argVps.length ? argVps.filter((v) => ALL_VPS.includes(v)) : ALL_VPS;
const TOP_N = 30;

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
const FIELD_NAMES = new Set(ALL_FIELDS);
const FIELD_SPLIT_RE = new RegExp(",\\s+(?=(?:" + ALL_FIELDS.join("|") + ")=)");
const kebab = (f) => f.replace(/([A-Z])/g, "-$1").toLowerCase();

/* --------------------------------------------------------------- parsing */

/** Split a `f=v, f=v` fragment into [name, value] pairs. Values may contain
 *  commas (font-family lists, rgb(), matrix(), transition lists), so we only
 *  split at a comma followed by a known field name + `=`. */
function parseFieldList(fragment) {
  const out = [];
  const s = (fragment || "").trim();
  if (!s) return out;
  for (const part of s.split(FIELD_SPLIT_RE)) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (!FIELD_NAMES.has(name)) continue;
    out.push([name, part.slice(eq + 1)]);
  }
  return out;
}

const ELEMENT_RE = /^([A-Za-z0-9_.-]+)\s+\[(.*)\] "([\s\S]*)" :: ([\s\S]*)$/;

function parseElementLine(line) {
  const m = line.match(ELEMENT_RE);
  if (!m) return null;
  const [, page, sel, text, rest] = m;
  let group = "TYPE";
  let body = rest;
  if (body.startsWith("ORIG ")) {
    group = "MOTION";
    body = body.slice("ORIG ".length);
  }
  let origRaw;
  let localRaw;
  if (group === "MOTION") {
    const idx = body.indexOf(" || LOCAL ");
    if (idx < 0) return null;
    origRaw = body.slice(0, idx);
    localRaw = body.slice(idx + " || LOCAL ".length);
  } else {
    const idx = body.indexOf(" || ");
    if (idx < 0) return null;
    origRaw = body.slice(0, idx);
    localRaw = body.slice(idx + " || ".length);
  }
  return {
    page,
    sel,
    text,
    group,
    orig: parseFieldList(origRaw),
    local: parseFieldList(localRaw),
  };
}

/* --------------------------------------------------------- noise rules */

const clean = (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim();
const stripQuotes = (s) => s.replace(/^["']|["']$/g, "").trim();

function families(v) {
  return clean(v)
    .split(",")
    .map((x) => stripQuotes(clean(x)))
    .filter(Boolean);
}
const isFallbackFamily = (f) => /fallback/i.test(f);
const eqFam = (a, b) => a.map((x) => x.toLowerCase()).join(",") === b.map((x) => x.toLowerCase()).join(",");

/** font-family lists are equivalent once generated `<X> Fallback` families
 *  are removed and quote/whitespace differences are normalised. */
function fontEquiv(orig, local) {
  const a = families(orig);
  const b = families(local);
  const a2 = a.filter((f) => !isFallbackFamily(f));
  const b2 = b.filter((f) => !isFallbackFamily(f));
  return eqFam(a2, b2);
}

/** all original families are still present in the local list, in the same
 *  relative order (so no reachable font was dropped; only later fallbacks were
 *  added/replaced). */
function fontSuperset(orig, local) {
  const a = families(orig);
  const b = families(local).filter((f) => !isFallbackFamily(f));
  let i = 0;
  for (const f of b) {
    if (i < a.length && f.toLowerCase() === a[i].toLowerCase()) i++;
  }
  return i === a.length;
}

/** same family set, different order only. */
function fontMultisetEqual(orig, local) {
  const a = families(orig).map((x) => x.toLowerCase()).sort();
  const b = families(local).map((x) => x.toLowerCase()).sort();
  return a.join("|") === b.join("|") && a.length > 0;
}

function numericEquivalent(a, b) {
  const na = Number(clean(a));
  const nb = Number(clean(b));
  return Number.isFinite(na) && Number.isFinite(nb) && na === nb;
}

/** comma lists compared ignoring order (white-space normalised). */
function multisetEqual(a, b) {
  const pa = clean(a)
    .split(",")
    .map((x) => clean(x).toLowerCase())
    .filter(Boolean)
    .sort();
  const pb = clean(b)
    .split(",")
    .map((x) => clean(x).toLowerCase())
    .filter(Boolean)
    .sort();
  return pa.length === pb.length && pa.every((x, i) => x === pb[i]);
}

const LTR_PAIRS = new Set(["left|start", "start|left", "right|end", "end|right"]);

/** Classify one (property, orig, local) signature.
 *  level: "benign" (semantically equivalent) | "likely-benign" (inert
 *  build-artifact but not strictly equivalent) | "substantive". */
function classify(property, orig, local) {
  if (property === "opacity" && numericEquivalent(orig, local)) {
    return { level: "benign", rule: "opacity numeric formatting only" };
  }
  if (/^(transition|animation)/.test(property)) {
    if (multisetEqual(orig, local)) {
      return { level: "benign", rule: "transition/animation list order only" };
    }
  }
  if (property === "fontFamily") {
    const hadFallback =
      families(orig).some(isFallbackFamily) || families(local).some(isFallbackFamily);
    if (fontEquiv(orig, local) && hadFallback) {
      return { level: "benign", rule: "fontFamily: differs only by generated Fallback family / quoting" };
    }
    if (fontEquiv(orig, local)) {
      return { level: "benign", rule: "fontFamily: quoting / whitespace only" };
    }
    if (fontMultisetEqual(orig, local)) {
      return { level: "benign", rule: "fontFamily: list order only" };
    }
    if (fontSuperset(orig, local)) {
      return {
        level: "likely-benign",
        rule: "fontFamily: fallback chain extended; all original families retained in order",
      };
    }
    return { level: "substantive", rule: "" };
  }
  if (property === "textAlign") {
    const k = `${clean(orig).toLowerCase()}|${clean(local).toLowerCase()}`;
    if (LTR_PAIRS.has(k)) return { level: "benign", rule: "textAlign: LTR-equivalent (left≡start / right≡end)" };
  }
  return { level: "substantive", rule: "" };
}

/* ---------------------------------------------------------- diff parsing */

function parseDiff(vp) {
  const file = path.join(DIR, `diff-${vp}.txt`);
  if (!fs.existsSync(file)) {
    return { vp, file, missing: true };
  }
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);

  const pages = [];
  const pageByKey = new Map();
  const signatures = new Map();
  const motionElements = [];
  const noiseCounts = { benign: 0, "likely-benign": 0, substantive: 0 };
  const noiseOccurrences = { benign: 0, "likely-benign": 0, substantive: 0 };

  let cur = null; // current page record
  let block = null; // "TYPE" | "MOTION" | null
  let observedType = 0;
  let observedMotion = 0;
  let droppedType = 0;
  let droppedMotion = 0;
  let reportedSuppressed = 0;
  let totalTypeDeclared = null;
  let totalMotionDeclared = null;
  let totalSuppressedDeclared = null;
  let inSummary = false;

  const fields = {};

  const ensurePage = (key) => {
    if (!pageByKey.has(key)) {
      const rec = { page: key, typeDeclared: 0, motionDeclared: 0, typeObserved: 0, motionObserved: 0, suppressed: 0 };
      pageByKey.set(key, rec);
      pages.push(rec);
    }
    return pageByKey.get(key);
  };

  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    if (!line) continue;

    const totalM = line.match(/^TOTAL: (\d+) typography, (\d+) motion, (\d+) benign motion suppressed/);
    if (totalM) {
      totalTypeDeclared = Number(totalM[1]);
      totalMotionDeclared = Number(totalM[2]);
      totalSuppressedDeclared = Number(totalM[3]);
      block = null;
      continue;
    }
    if (/^=== SUMMARY ===/.test(line)) {
      inSummary = true;
      block = null;
      continue;
    }
    const pageHead = line.match(/^=== (.+) ===$/);
    if (pageHead) {
      if (inSummary) continue;
      cur = ensurePage(pageHead[1]);
      block = null;
      continue;
    }
    const blockHead = line.match(/^-- (TYPE|MOTION) \((\d+)\) --$/);
    if (blockHead) {
      block = blockHead[1];
      const n = Number(blockHead[2]);
      if (cur) {
        if (block === "TYPE") cur.typeDeclared += n;
        else cur.motionDeclared += n;
      }
      continue;
    }
    const moreM = line.match(/^ {2}\+(\d+) more$/);
    if (moreM) {
      const n = Number(moreM[1]);
      if (block === "TYPE") droppedType += n;
      else if (block === "MOTION") droppedMotion += n;
      continue;
    }
    const supM = line.match(/^ {2}\((\d+) benign motion diffs suppressed/);
    if (supM) {
      const n = Number(supM[1]);
      reportedSuppressed += n;
      if (cur) cur.suppressed += n;
      continue;
    }

    const el = parseElementLine(line);
    if (!el) continue;

    const rec = ensurePage(el.page);
    if (el.group === "TYPE") {
      rec.typeObserved++;
      observedType++;
    } else {
      rec.motionObserved++;
      observedMotion++;
    }

    const localMap = new Map(el.local);
    const lineChanges = [];
    for (const [f, o] of el.orig) {
      if (!localMap.has(f)) continue;
      const l = localMap.get(f);
      if (l === o) continue;

      fields[f] = fields[f] || { type: 0, motion: 0, property: kebab(f) };
      if (el.group === "TYPE") fields[f].type++;
      else fields[f].motion++;

      lineChanges.push({ property: f, orig: o, local: l });

      const key = `${el.group}|${f}|${o} -> ${l}`;
      let sig = signatures.get(key);
      if (!sig) {
        const cls = classify(f, o, l);
        sig = {
          key,
          group: el.group,
          property: f,
          propertyKebab: kebab(f),
          orig: o,
          local: l,
          count: 0,
          examples: [],
          level: cls.level,
          rule: cls.rule,
        };
        signatures.set(key, sig);
      }
      sig.count++;
      if (sig.examples.length < 3) {
        const ex = `${el.page} [${el.sel}]`;
        if (!sig.examples.includes(ex)) sig.examples.push(ex);
      }
    }

    if (el.group === "MOTION" && lineChanges.length) {
      motionElements.push({ page: el.page, sel: el.sel, text: el.text, changes: lineChanges });
    }
  }

  // classify counts + occurrences
  const sigList = [...signatures.values()].sort(
    (a, b) => b.count - a.count || a.property.localeCompare(b.property) || a.orig.localeCompare(b.orig),
  );
  for (const s of sigList) {
    noiseCounts[s.level]++;
    noiseOccurrences[s.level] += s.count;
  }

  const declaredType = pages.reduce((n, p) => n + p.typeDeclared, 0);
  const declaredMotion = pages.reduce((n, p) => n + p.motionDeclared, 0);

  return {
    vp,
    file,
    pages,
    signatures: sigList,
    motionElements,
    fields,
    totals: {
      pages: pages.length,
      declaredType: totalTypeDeclared != null ? totalTypeDeclared : declaredType,
      declaredMotion: totalMotionDeclared != null ? totalMotionDeclared : declaredMotion,
      headerType: declaredType,
      headerMotion: declaredMotion,
      observedType,
      observedMotion,
      droppedType,
      droppedMotion,
      reportedSuppressed,
      declaredSuppressed: totalSuppressedDeclared,
      uniqueSignatures: sigList.length,
    },
    noise: { counts: noiseCounts, occurrences: noiseOccurrences },
  };
}

/* ------------------------------------------------------------- rendering */

function renderMd(res) {
  const { vp, totals, fields, signatures, motionElements, noise, pages } = res;
  const L = [];
  const say = (s = "") => L.push(s);

  say(`# Style-diff summary — ${vp}`);
  say();
  say(`Source: \`design/audit/style-probe/diff-${vp}.txt\``);
  say(`Generated: ${new Date().toISOString()}`);
  say();

  say(`## Headline`);
  say();
  say(`- **Pages covered:** ${totals.pages}`);
  say(`- **TYPE mismatching elements (declared):** ${totals.declaredType}`);
  say(`- **MOTION mismatching elements (declared):** ${totals.declaredMotion}`);
  say(`- **Unique mismatch signatures:** ${totals.uniqueSignatures}`);
  say(`- **Benign motion diffs suppressed by style-diff:** ${totals.declaredSuppressed != null ? totals.declaredSuppressed : totals.reportedSuppressed}`);
  say(
    `- **Emitted element lines parsed:** ${totals.observedType} TYPE / ${totals.observedMotion} MOTION` +
      (totals.droppedType || totals.droppedMotion
        ? `  _(blocks are capped at 60 lines; ${totals.droppedType} TYPE + ${totals.droppedMotion} MOTION lines were dropped from the report)_`
        : ""),
  );
  say();
  say(
    `> Reconciliation: declared TYPE ${totals.declaredType} == header sum ${totals.headerType}; ` +
      `declared MOTION ${totals.declaredMotion} == header sum ${totals.headerMotion}. ` +
      `Per-property and signature counts below use emitted lines only and are therefore a floor when blocks were truncated.`,
  );
  say();

  say(`## Counts per CSS property`);
  say();
  say(`| property | TYPE | MOTION | total |`);
  say(`| --- | ---: | ---: | ---: |`);
  const fieldRows = Object.entries(fields).sort(
    (a, b) => b[1].type + b[1].motion - (a[1].type + a[1].motion) || a[1].property.localeCompare(b[1].property),
  );
  for (const [, f] of fieldRows) {
    say(`| ${f.property} | ${f.type} | ${f.motion} | ${f.type + f.motion} |`);
  }
  say();

  say(`## Top ${Math.min(TOP_N, signatures.length)} mismatch signatures`);
  say();
  say(`| # | property | orig → local | count | group | class | examples |`);
  say(`| ---: | --- | --- | ---: | --- | --- | --- |`);
  signatures.slice(0, TOP_N).forEach((s, i) => {
    const ex = s.examples.map((e) => `\`${e}\``).join("<br>");
    const arrow = `${s.orig} → ${s.local}`.replace(/\|/g, "\\|");
    say(`| ${i + 1} | ${s.propertyKebab} | ${arrow} | ${s.count} | ${s.group} | ${s.level} | ${ex} |`);
  });
  say();

  say(`## MOTION mismatches (full list)`);
  say();
  const motionPropRows = motionElements.reduce((n, m) => n + m.changes.length, 0);
  say(`MOTION mismatching elements: **${motionElements.length}**; property-level rows: **${motionPropRows}**.`);
  if (!motionElements.length) {
    say();
    say(`(none)`);
  } else {
    say();
    say(`| page | selector | properties (orig → local) |`);
    say(`| --- | --- | --- |`);
    for (const m of motionElements) {
      const props = m.changes
        .map((c) => `${kebab(c.property)}: \`${c.orig}\` → \`${c.local}\``)
        .join("<br>");
      say(`| ${m.page} | \`${m.sel}\` | ${props} |`);
    }
  }
  say();

  say(`## Noise assessment`);
  say();
  say(
    `Conservative classification over the **${signatures.length}** signatures. ` +
      `"benign" = values semantically equivalent; "likely-benign" = inert fallback-chain difference ` +
      `(not strictly equivalent); "substantive" = real difference.`,
  );
  say();
  say(`| class | signatures | occurrences |`);
  say(`| --- | ---: | ---: |`);
  for (const level of ["benign", "likely-benign", "substantive"]) {
    say(`| ${level} | ${noise.counts[level]} | ${noise.occurrences[level]} |`);
  }
  say();

  const benignish = signatures.filter((s) => s.level !== "substantive");
  say(`### Benign / likely-benign signatures`);
  say();
  if (!benignish.length) {
    say(`(none)`);
  } else {
    say(`| property | orig → local | count | class | reason |`);
    say(`| --- | --- | ---: | --- | --- |`);
    for (const s of benignish) {
      const arrow = `${s.orig} → ${s.local}`.replace(/\|/g, "\\|");
      say(`| ${s.propertyKebab} | ${arrow} | ${s.count} | ${s.level} | ${s.rule} |`);
    }
  }
  say();

  say(`## Per-page totals`);
  say();
  say(`| page | TYPE | MOTION | suppressed |`);
  say(`| --- | ---: | ---: | ---: |`);
  for (const p of pages) {
    say(`| ${p.page} | ${p.typeDeclared} | ${p.motionDeclared} | ${p.suppressed} |`);
  }
  say(`| **TOTAL** | **${totals.declaredType}** | **${totals.declaredMotion}** | **${totals.declaredSuppressed != null ? totals.declaredSuppressed : totals.reportedSuppressed}** |`);
  say();

  return L.join("\n") + "\n";
}

function renderJson(res) {
  const { vp, file: srcFile, totals, fields, signatures, motionElements, noise, pages } = res;
  return {
    vp,
    generatedAt: new Date().toISOString(),
    source: path.relative(process.cwd(), srcFile).replace(/\\/g, "/"),
    totals,
    propertyCounts: Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k, { property: v.property, type: v.type, motion: v.motion, total: v.type + v.motion }]),
    ),
    signatures: signatures.map((s) => ({
      property: s.property,
      propertyKebab: s.propertyKebab,
      group: s.group,
      orig: s.orig,
      local: s.local,
      count: s.count,
      examples: s.examples,
      noise: { level: s.level, rule: s.rule },
    })),
    motionMismatches: {
      elementCount: motionElements.length,
      propertyRows: motionElements.reduce((n, m) => n + m.changes.length, 0),
      elements: motionElements.map((m) => ({
        page: m.page,
        sel: m.sel,
        text: m.text,
        changes: m.changes.map((c) => ({ property: c.property, propertyKebab: kebab(c.property), orig: c.orig, local: c.local })),
      })),
    },
    noise: {
      signatureCounts: noise.counts,
      occurrenceCounts: noise.occurrences,
      benign: signatures.filter((s) => s.level === "benign").map((s) => ({ property: s.propertyKebab, orig: s.orig, local: s.local, count: s.count, rule: s.rule })),
      likelyBenign: signatures.filter((s) => s.level === "likely-benign").map((s) => ({ property: s.propertyKebab, orig: s.orig, local: s.local, count: s.count, rule: s.rule })),
    },
    pages: pages.map((p) => ({ page: p.page, type: p.typeDeclared, motion: p.motionDeclared, suppressed: p.suppressed })),
  };
}

/* -------------------------------------------------------------------- main */

let failures = 0;
for (const vp of VPS) {
  const res = parseDiff(vp);
  if (res.missing) {
    console.error(`style-diff-summarize: missing ${res.file}`);
    failures++;
    continue;
  }
  const md = renderMd(res);
  const json = renderJson(res);
  const mdPath = path.join(DIR, `summary-${vp}.md`);
  const jsonPath = path.join(DIR, `summary-${vp}.json`);
  fs.writeFileSync(mdPath, md);
  fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2) + "\n");
  const t = res.totals;
  console.log(
    `wrote ${path.basename(mdPath)} + ${path.basename(jsonPath)}  ` +
      `[${vp}] TYPE ${t.declaredType} (observed ${t.observedType}), MOTION ${t.declaredMotion} (observed ${t.observedMotion}), ` +
      `sigs ${t.uniqueSignatures}, noise benign ${res.noise.counts.benign}/likely ${res.noise.counts["likely-benign"]}/subst ${res.noise.counts.substantive}`,
  );
}
if (failures) process.exit(1);
