/**
 * R&D channel structured-viewport capture (structured kinds + default-apply parity).
 *
 * Boots `next dev` on a dedicated port (3132), seeds the admin session cookie,
 * reads the CURRENT `rnd` group defaults from `/api/admin/registry`, then:
 *
 *   1. marker captures (existing coverage, now on the new kinds):
 *      - rnd.patents patentSections: a marker section title + marker first-item
 *        caption render on `/rnd/patents`;
 *      - rnd.facilities facilityTabs: a valid 1-tab marker payload renders;
 *      - the ONE unified v2 `techFeatures` def: marker headings on block 2 (§5)
 *        and block 3 (§6) render on `/rnd/technology`.
 *   2. DEFAULT-APPLY PARITY (the strongest check): for each structured def, PUT
 *      its EXACT registry default payload (the effective value read from the
 *      registry, i.e. `DEFAULT_VALUES[key].ko`), capture the affected route at
 *      1440x900 and 390x844, and assert the page height equals the pre-apply
 *      baseline within ±2px (exact dels recorded). The reverts then assert ±1px
 *      restoration. For the unified `techFeatures` def the parity is asserted
 *      PER SECTION (§4/§5/§6) by hashing each target section's `outerHTML` and
 *      comparing it to the baseline, proving the applier reproduces all three
 *      sections byte-identically. (patentSections drops the authored empty 14th
 *      gallery placeholder, which renders identically.)
 *   3. malformed `techFeatures` payloads (`blocks.length !== 3` and an
 *      empty-items block) → HTTP 400 and no persisted change.
 *
 * Full-page screenshots and horizontal-overflow checks use the same ignore rules
 * as the company/home captures. Finally captures `/rnd` vs `/rnd/technology`
 * (the alias) and asserts same-height / same-section-count rendering.
 *
 * Usage: node scripts/audit/capture-rnd-viewports.mjs [--port=3132]
 *        [--base=http://127.0.0.1:3132]
 * `design/` is gitignored; screenshots/report are local evidence only.
 */
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { sealData } from "iron-session";
import { config as dotenvConfig } from "dotenv";

dotenvConfig({ path: [".env.local"], quiet: true });

const args = process.argv.slice(2);
const getArg = (name, dflt) => {
  const a = args.find((x) => x.startsWith("--" + name + "="));
  return a ? a.split("=")[1] : dflt;
};
const PORT = Number(getArg("port", "3132"));
const BASE = getArg("base", `http://127.0.0.1:${PORT}`);
const MANAGED = !args.some((x) => x.startsWith("--base="));
const OUT = path.resolve("design", "audit", "rnd-capture");

const STAMP = Date.now();
const PATENT_SECTIONS_KEY =
  "rnd.patents#s202508114d9bc90ceb876/patentSections/patentSections";
const FACILITY_KEY = "rnd.facilities#facilityTabs/facilityTabs";
const TECH_TITLE_KEY =
  "rnd.technology#s2025090979d4f02da9a4c/w202509098378a31a7319e/html";

/** The ONE unified v2 techFeatures def (blocks map to §4/§5/§6). */
const TECH_FEATURES_KEY =
  "rnd.technology#s202509091799d895b62ea/techFeatures/techFeatures";
/** Image-widget anchors that identify each target section in the rendered DOM. */
const TECH_SECTION_ANCHORS = [
  "w202509092bb83d593e678", // §4 block 1
  "w20250909743cf5b3c0201", // §5 block 2
  "w20250909dbdd88bc19258", // §6 block 3
];
const FACILITIES_TABLE_KEYS = [
  "rnd.facilities#s20250829c25afe324e195/w20250829bb21466f4e0f1/facilitiesTable",
  "rnd.facilities#s20250829c25afe324e195/w20250829370d74ba50fab/facilitiesTable",
  "rnd.facilities#s20250829c25afe324e195/w202508298781405b23d22/facilitiesTable",
  "rnd.facilities#s20250829c25afe324e195/w202508293b8acaf6df97a/facilitiesTable",
];

/** The structured defs, each with its affected route + slug. */
const NEW_DEFS = [
  { kind: "techFeatures", key: TECH_FEATURES_KEY, route: "/rnd/technology", slug: "technology-techfeatures" },
  { kind: "patentSections", key: PATENT_SECTIONS_KEY, route: "/rnd/patents", slug: "patents-sections" },
  { kind: "facilitiesTable", key: FACILITIES_TABLE_KEYS[0], route: "/rnd/facilities", slug: "facilities-table-1" },
  { kind: "facilitiesTable", key: FACILITIES_TABLE_KEYS[1], route: "/rnd/facilities", slug: "facilities-table-2" },
  { kind: "facilitiesTable", key: FACILITIES_TABLE_KEYS[2], route: "/rnd/facilities", slug: "facilities-table-3" },
  { kind: "facilitiesTable", key: FACILITIES_TABLE_KEYS[3], route: "/rnd/facilities", slug: "facilities-table-4" },
];

const TECH_B2_HEAD_MARK = `E2E-RND-TECHB2H-${STAMP}`;
const TECH_B3_HEAD_MARK = `E2E-RND-TECHB3H-${STAMP}`;
const PATSEC_TITLE_MARK = `E2E-RND-PSTITLE-${STAMP}`;
const PATSEC_CAP_MARK = `E2E-RND-PSCAP-${STAMP}`;
const FACILITY_MARK = `E2E-RND-FAC-${STAMP}`;

const ROUTES = [
  { route: "/rnd/technology", slug: "rnd-technology", kind: "technology" },
  { route: "/rnd/patents", slug: "rnd-patents", kind: "patents" },
  { route: "/rnd/facilities", slug: "rnd-facilities", kind: "facilities" },
];
const VIEWPORTS = [
  { vp: "1440x900", width: 1440, height: 900 },
  { vp: "390x844", width: 390, height: 844 },
];

let dev = null;
let devLog = "";
if (MANAGED) {
  dev = spawn("npx", ["next", "dev", "--port", String(PORT)], {
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  dev.stdout.on("data", (d) => (devLog += d));
  dev.stderr.on("data", (d) => (devLog += d));
}
const killDev = () => {
  if (dev) {
    try { spawnSync("taskkill", ["/pid", String(dev.pid), "/T", "/F"], { stdio: "ignore" }); } catch {}
  }
};

async function waitReady() {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) return true; } catch {}
    await sleep(2500);
  }
  return false;
}

const HIDE_DEV =
  "nextjs-portal, [data-nextjs-toast], [data-nextjs-dialog], [data-nextjs-dev-tools-button] { display: none !important; }";
const FREEZE =
  "*, *::before, *::after { animation: none !important; transition: none !important; }";

/** Scroll the whole page (triggers lazy images/reveals), then settle. */
async function revealAndSettle(page) {
  await page.evaluate(async () => {
    const step = Math.max(300, Math.floor(window.innerHeight * 0.7));
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 100));
    }
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((r) => setTimeout(r, 400));
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 400));
  });
  await page
    .waitForFunction(
      () =>
        [...document.images].every((i) => {
          const r = i.getBoundingClientRect();
          return i.complete || r.width === 0;
        }),
      null,
      { timeout: 10000 },
    )
    .catch(() => {});
  await page.waitForTimeout(500);
}

/** Page metrics: height, markers, sections, overflow, matching images, section hashes. */
async function measure(page, { markers, cardSrcs, sectionAnchors }) {
  return page.evaluate(
    ({ markers, cardSrcs, sectionAnchors }) => {
      const doc = document.scrollingElement || document.documentElement;
      const html = document.documentElement.outerHTML;
      const markerHit = {};
      for (const m of markers) markerHit[m] = html.includes(m);

      const vw = window.innerWidth;
      const scrollWidth = doc.scrollWidth;
      const docOverflow = scrollWidth - vw;

      const offenders = [];
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        if (r.right > vw + 3) {
          if (el.closest('[aria-hidden="true"]')) continue;
          let fixedOrClipped = false;
          for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
            const cs = getComputedStyle(a);
            if (cs.position === "fixed") { fixedOrClipped = true; break; }
            if (a !== el && /^(hidden|clip|auto|scroll)$/.test(cs.overflowX)) {
              fixedOrClipped = true;
              break;
            }
          }
          if (fixedOrClipped) continue;
          offenders.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className || "").toString().slice(0, 80),
            left: Math.round(r.left),
            right: Math.round(r.right),
          });
        }
        if (offenders.length >= 12) break;
      }

      const set = new Set(cardSrcs);
      let cardCount = 0;
      for (const img of document.images) if (set.has(img.getAttribute("src"))) cardCount += 1;

      // Per-section fingerprint: locate the section hosting each anchor widget and
      // hash its outerHTML so default-apply parity is asserted per section.
      const hash = (s) => {
        let h = 5381;
        for (let i = 0; i < s.length; i += 1) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
        return h;
      };
      const sectionHashes = {};
      for (const anchor of sectionAnchors) {
        const widget = document.querySelector(`[data-widget-id="${anchor}"]`);
        const sec = widget ? widget.closest("section") : null;
        if (!sec) {
          sectionHashes[anchor] = { found: false };
          continue;
        }
        const outer = sec.outerHTML;
        sectionHashes[anchor] = {
          found: true,
          height: Math.round(sec.getBoundingClientRect().height),
          htmlLen: outer.length,
          hash: hash(outer),
        };
      }

      return {
        pageHeight: doc.scrollHeight,
        markerHit,
        sectionCount: document.querySelectorAll("section").length,
        scrollWidth,
        innerWidth: vw,
        docOverflow,
        offenders,
        cardCount,
        sectionHashes,
      };
    },
    { markers, cardSrcs, sectionAnchors },
  );
}

const report = {
  base: BASE,
  port: PORT,
  out: path.relative(process.cwd(), OUT),
  pass: false,
  keys: {
    patentSections: PATENT_SECTIONS_KEY,
    facilityTabs: FACILITY_KEY,
    techFeatures: TECH_FEATURES_KEY,
    facilitiesTables: FACILITIES_TABLE_KEYS,
  },
  markers: {
    technology: [TECH_B2_HEAD_MARK, TECH_B3_HEAD_MARK],
    patents: [PATSEC_TITLE_MARK, PATSEC_CAP_MARK],
    facility: FACILITY_MARK,
  },
  steps: {},
  failures: [],
};

let browser;
let dirty = new Set();
let authCookie = "";
try {
  if (!(await waitReady())) {
    console.log(JSON.stringify({ ...report, devReady: false, devLog: devLog.slice(-1200) }, null, 1));
    killDev();
    process.exit(1);
  }

  const sealed = await sealData(
    { admin: { email: process.env.ADMIN_EMAIL ?? "admin", loggedInAt: Date.now() } },
    { password: process.env.SESSION_SECRET ?? "", ttl: 60 * 60 * 24 * 30 },
  );
  const cookie = `ecowave_admin=${sealed}`;
  authCookie = cookie;

  const getJson = async (p) => {
    const res = await fetch(`${BASE}${p}`, { headers: { Cookie: cookie } });
    if (!res.ok) throw new Error(`GET ${p} → ${res.status}`);
    return res.json();
  };
  const put = async (key, locale, value) => {
    const res = await fetch(`${BASE}/api/admin/registry`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Origin: BASE, Cookie: cookie },
      body: JSON.stringify({ key, locale, value }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      if (value === "") dirty.delete(key);
      else dirty.add(key);
    }
    return { status: res.status, body };
  };

  fs.mkdirSync(OUT, { recursive: true });
  browser = await chromium.launch();

  /* ------------------------------------------------ read current defaults */
  const group = await getJson("/api/admin/registry?group=rnd&locale=ko");
  const parse = (v) => { try { return JSON.parse(v); } catch { return null; } };

  // The effective value equals DEFAULT_VALUES[key].ko while unset, so this is
  // the EXACT registry default payload we later PUT back verbatim.
  const defaultPayloads = Object.fromEntries(
    NEW_DEFS.map((d) => [d.key, group.values?.[d.key] ?? ""]),
  );
  const facilityValue = group.values?.[FACILITY_KEY] ?? "";
  const aliasMarker = group.values?.[TECH_TITLE_KEY] ?? "";
  const facilityItems = parse(facilityValue) ?? [];
  const techFeaturesDefault = parse(defaultPayloads[TECH_FEATURES_KEY]) ?? {};
  const techBlocks = Array.isArray(techFeaturesDefault.blocks) ? techFeaturesDefault.blocks : null;
  const patentSectionsDefault = parse(defaultPayloads[PATENT_SECTIONS_KEY]) ?? {};
  const patentsCardSrcs = (patentSectionsDefault.sections?.[0]?.items ?? [])
    .map((it) => it.image)
    .filter(Boolean);

  const defaultChecks = {};
  for (const def of NEW_DEFS) {
    const payload = defaultPayloads[def.key];
    const parsed = parse(payload);
    const shapeOk =
      def.kind === "techFeatures"
        ? Array.isArray(parsed?.blocks) &&
          parsed.blocks.length === 3 &&
          parsed.blocks.every(
            (b) => Array.isArray(b.items) && b.items.length >= 1 && b.items.length <= 12,
          )
        : def.kind === "patentSections"
          ? Array.isArray(parsed?.sections) && parsed.sections.length > 0
          : Array.isArray(parsed?.header) && parsed.header.length === 2 && Array.isArray(parsed?.rows);
    defaultChecks[`${def.kind}:${def.slug}`] = Boolean(payload) && shapeOk;
  }

  report.steps.readDefaults = {
    ...defaultChecks,
    techBlockCount: Array.isArray(techBlocks) ? techBlocks.length : -1,
    techBlockCountIs3: Array.isArray(techBlocks) && techBlocks.length === 3,
    techItemCounts: Array.isArray(techBlocks) ? techBlocks.map((b) => b.items.length) : null,
    ok: Object.values(defaultChecks).every(Boolean) && facilityItems.length > 0 && Boolean(aliasMarker),
    patentsCardSrcs: patentsCardSrcs.length,
    patentsCardSrcsIs13: patentsCardSrcs.length === 13,
    facilityCount: facilityItems.length,
    dbConfigured: group.dbConfigured === true,
  };
  if (!report.steps.readDefaults.ok) {
    report.failures.push(
      "readDefaults: could not read the expected structured / facilityTabs / alias defaults",
    );
  }
  if (group.dbConfigured !== true) {
    report.failures.push("dbConfigured=false: DATABASE_URL is not configured; cannot apply/revert overrides");
  }

  /* --------------------------------------------------- measurement helper */

  /** Load one route x viewport; return metrics (+ optional screenshot). */
  const loadOne = async (
    phase,
    route,
    vp,
    { markers = [], cardSrcs = [], sectionAnchors = [], screenshotFile = null } = {},
  ) => {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    try {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.addStyleTag({ content: HIDE_DEV });
      await page.goto(`${BASE}${route}?e2e=${phase}-${STAMP}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2500);
      await revealAndSettle(page);
      await page.addStyleTag({ content: FREEZE });
      await page.waitForTimeout(300);
      const data = await measure(page, { markers, cardSrcs, sectionAnchors });
      if (screenshotFile) {
        fs.mkdirSync(path.dirname(screenshotFile), { recursive: true });
        await page.screenshot({ path: screenshotFile, fullPage: true });
      }
      return data;
    } finally {
      await page.close();
    }
  };

  const markersFor = (kind) =>
    kind === "technology"
      ? [TECH_B2_HEAD_MARK, TECH_B3_HEAD_MARK]
      : kind === "patents"
        ? [PATSEC_TITLE_MARK, PATSEC_CAP_MARK]
        : kind === "facilities"
          ? [FACILITY_MARK]
          : [];
  const cardsFor = (kind) => (kind === "patents" ? patentsCardSrcs : []);

  /** Sweep every route x viewport; optionally screenshot each. */
  const sweep = async (phase, { screenshot = false } = {}) => {
    const out = [];
    for (const vp of VIEWPORTS) {
      for (const r of ROUTES) {
        const file = screenshot
          ? path.join(OUT, `${vp.vp}-${r.slug}.png`)
          : null;
        const data = await loadOne(phase, r.route, vp, {
          markers: markersFor(r.kind),
          cardSrcs: cardsFor(r.kind),
          sectionAnchors: TECH_SECTION_ANCHORS,
          screenshotFile: file,
        });
        out.push({
          phase,
          viewport: vp.vp,
          route: r.route,
          kind: r.kind,
          file: file ? path.relative(process.cwd(), file) : null,
          ...data,
        });
      }
    }
    return out;
  };

  /** `/rnd` vs `/rnd/technology` alias parity at both viewports. */
  const aliasSweep = async () => {
    const out = [];
    for (const vp of VIEWPORTS) {
      for (const route of ["/rnd", "/rnd/technology"]) {
        const slug = route === "/rnd" ? "alias-rnd" : "alias-rnd-technology";
        const file = path.join(OUT, `${vp.vp}-${slug}.png`);
        const data = await loadOne("alias", route, vp, {
          markers: [aliasMarker],
          cardSrcs: [],
          screenshotFile: file,
        });
        out.push({ viewport: vp.vp, route, file: path.relative(process.cwd(), file), ...data });
      }
    }
    return out;
  };

  /* ------------------------------------------------------- baseline sweep */
  const baseline = await sweep("baseline");
  const baselineByKey = new Map(baseline.map((r) => [`${r.viewport}|${r.route}`, r]));
  report.steps.baseline = baseline;
  for (const r of baseline) {
    if (Object.values(r.markerHit).some(Boolean)) {
      report.failures.push(`baseline ${r.viewport} ${r.route}: unexpected marker present`);
    }
    if (r.docOverflow > 2) {
      report.failures.push(
        `baseline overflow ${r.viewport} ${r.route}: ${r.docOverflow}px (${JSON.stringify(r.offenders)})`,
      );
    }
    if (r.kind === "patents" && r.cardCount !== 13) {
      report.failures.push(
        `baseline ${r.viewport} ${r.route}: patentSections first group rendered ${r.cardCount}/13 cards`,
      );
    }
    if (r.kind === "technology") {
      for (const anchor of TECH_SECTION_ANCHORS) {
        if (!r.sectionHashes?.[anchor]?.found) {
          report.failures.push(`baseline ${r.viewport} ${r.route}: section anchor ${anchor} not found`);
        }
      }
    }
  }

  /* ------------------------- DEFAULT-APPLY PARITY (structured kinds) */

  report.steps.defaultApply = [];
  const defaultApplyValuesRestored = {};
  for (const def of NEW_DEFS) {
    const payload = defaultPayloads[def.key];
    const entry = { kind: def.kind, key: def.key, route: def.route, perViewport: [] };
    if (!payload) {
      entry.ok = false;
      report.failures.push(`defaultApply ${def.slug}: missing default payload`);
      report.steps.defaultApply.push(entry);
      continue;
    }
    const w = await put(def.key, "ko", payload);
    entry.putStatus = w.status;
    let ok = w.status === 200;
    if (!ok) report.failures.push(`defaultApply ${def.slug}: PUT default failed (${w.status})`);

    for (const vp of VIEWPORTS) {
      const base = baselineByKey.get(`${vp.vp}|${def.route}`);
      const file = path.join(OUT, `default-${def.slug}-${vp.vp}.png`);
      const data = await loadOne(`default-${def.slug}`, def.route, vp, {
        markers: [],
        cardSrcs: def.kind === "patentSections" ? patentsCardSrcs : [],
        sectionAnchors: def.kind === "techFeatures" ? TECH_SECTION_ANCHORS : [],
        screenshotFile: file,
      });
      const delta = base ? data.pageHeight - base.pageHeight : null;
      const deltaOk = delta !== null && Math.abs(delta) <= 2;
      const cardsOk = def.kind !== "patentSections" || data.cardCount === 13;
      const overflowOk = data.docOverflow <= 2;
      const vpEntry = {
        viewport: vp.vp,
        pageHeight: data.pageHeight,
        baselinePageHeight: base?.pageHeight ?? null,
        delta,
        deltaOk,
        docOverflow: data.docOverflow,
        overflowOk,
        cardCount: def.kind === "patentSections" ? data.cardCount : null,
        cardsOk,
        file: path.relative(process.cwd(), file),
      };
      if (def.kind === "techFeatures") {
        const parity = {};
        for (const anchor of TECH_SECTION_ANCHORS) {
          const b = base?.sectionHashes?.[anchor] ?? null;
          const a = data.sectionHashes?.[anchor] ?? null;
          const found = Boolean(a?.found && b?.found);
          const hashOk = found && a.hash === b.hash;
          const sectionHeightOk = found && a.height === b.height;
          parity[anchor] = {
            found,
            hashOk,
            sectionHeightOk,
            baseHash: b?.hash ?? null,
            applyHash: a?.hash ?? null,
            baseHeight: b?.height ?? null,
            applyHeight: a?.height ?? null,
          };
          if (!hashOk || !sectionHeightOk) {
            ok = false;
            report.failures.push(
              `defaultApply techFeatures ${vp.vp} section ${anchor}: hashOk=${hashOk} ` +
                `height ${b?.height}->${a?.height}`,
            );
          }
        }
        vpEntry.sectionParity = parity;
      }
      entry.perViewport.push(vpEntry);
      if (!deltaOk || !cardsOk || !overflowOk) {
        ok = false;
        report.failures.push(
          `defaultApply ${def.slug} ${vp.vp} ${def.route}: delta=${delta} cards=${data.cardCount} overflow=${data.docOverflow}`,
        );
      }
    }

    const r = await put(def.key, "ko", "");
    entry.revertStatus = r.status;
    if (r.status !== 200) {
      ok = false;
      report.failures.push(`defaultApply ${def.slug}: revert failed (${r.status})`);
    }
    entry.ok = ok;
    report.steps.defaultApply.push(entry);
  }

  /* ------------------- default-apply values restored + ±1px residue sweep */

  const afterDefaults = await getJson("/api/admin/registry?group=rnd&locale=ko");
  for (const def of NEW_DEFS) {
    const restored = (afterDefaults.values?.[def.key] ?? "") === defaultPayloads[def.key];
    defaultApplyValuesRestored[def.slug] = restored;
    if (!restored) report.failures.push(`defaultApplyValuesRestored ${def.slug}: value differs`);
  }
  report.steps.defaultApplyValuesRestored = {
    ...defaultApplyValuesRestored,
    ok: Object.values(defaultApplyValuesRestored).every(Boolean),
  };

  const defaultResidue = await sweep("default-residue");
  report.steps.defaultResidue = [];
  for (const r of defaultResidue) {
    const base = baselineByKey.get(`${r.viewport}|${r.route}`);
    const markersGone = Object.values(r.markerHit).every((v) => v === false);
    const pageHeightDelta = base ? r.pageHeight - base.pageHeight : null;
    const heightOk = pageHeightDelta !== null && Math.abs(pageHeightDelta) <= 1;
    const overflowOk = r.docOverflow <= 2;
    const cardsOk = r.kind !== "patents" || r.cardCount === 13;
    let sectionsOk = true;
    if (r.kind === "technology") {
      for (const anchor of TECH_SECTION_ANCHORS) {
        const b = base?.sectionHashes?.[anchor] ?? null;
        const a = r.sectionHashes?.[anchor] ?? null;
        if (!(b?.found && a?.found && b.hash === a.hash && b.height === a.height)) sectionsOk = false;
      }
    }
    const ok = markersGone && heightOk && overflowOk && cardsOk && sectionsOk;
    report.steps.defaultResidue.push({
      viewport: r.viewport,
      route: r.route,
      markersGone,
      pageHeight: r.pageHeight,
      baselinePageHeight: base?.pageHeight ?? null,
      pageHeightDelta,
      docOverflow: r.docOverflow,
      cardCount: r.kind === "patents" ? r.cardCount : null,
      sectionsOk,
      ok,
    });
    if (!ok) {
      report.failures.push(
        `defaultResidue ${r.viewport} ${r.route}: markersGone=${markersGone} ` +
          `heightDelta=${pageHeightDelta} overflow=${r.docOverflow} cards=${r.cardCount} sectionsOk=${sectionsOk}`,
      );
    }
  }

  /* --------------------------------------- marker override (existing cov) */
  const psPayload = JSON.stringify({
    sections: (patentSectionsDefault.sections ?? []).map((s, i) =>
      i === 0
        ? {
            ...s,
            title: PATSEC_TITLE_MARK,
            items: s.items.map((it, j) => (j === 0 ? { ...it, caption: PATSEC_CAP_MARK } : it)),
          }
        : s,
    ),
  });
  const facilityPayload = JSON.stringify([
    { name: FACILITY_MARK, images: [facilityItems[0].images[0]] },
  ]);
  const techMarkerPayload = techBlocks
    ? JSON.stringify({
        blocks: techBlocks.map((b, i) => {
          if (i === 1) {
            return { items: b.items.map((it, j) => (j === 0 ? { ...it, heading: TECH_B2_HEAD_MARK } : it)) };
          }
          if (i === 2) {
            return { items: b.items.map((it, j) => (j === 0 ? { ...it, heading: TECH_B3_HEAD_MARK } : it)) };
          }
          return b;
        }),
      })
    : null;

  const psPut = await put(PATENT_SECTIONS_KEY, "ko", psPayload);
  const facPut = await put(FACILITY_KEY, "ko", facilityPayload);
  const techPut = techMarkerPayload
    ? await put(TECH_FEATURES_KEY, "ko", techMarkerPayload)
    : { status: 0, body: { error: "no techFeatures default blocks" } };
  report.steps.put = {
    patentSections: { status: psPut.status, error: psPut.body?.error },
    facilityTabs: { status: facPut.status, error: facPut.body?.error },
    techFeatures: { status: techPut.status, error: techPut.body?.error },
    ok: psPut.status === 200 && facPut.status === 200 && techPut.status === 200,
  };
  if (!report.steps.put.ok) report.failures.push("PUT structured marker overrides failed");

  const override = await sweep("override", { screenshot: true });
  report.steps.override = [];
  for (const r of override) {
    const hits = Object.values(r.markerHit);
    const markersPresent = hits.length === 0 ? true : hits.every(Boolean);
    const overflowOk = r.docOverflow <= 2;
    const cardsOk = r.kind !== "patents" || r.cardCount === 13;
    const ok = markersPresent && overflowOk && cardsOk;
    report.steps.override.push({
      viewport: r.viewport,
      route: r.route,
      file: r.file,
      pageHeight: r.pageHeight,
      markersPresent,
      markerHit: r.markerHit,
      docOverflow: r.docOverflow,
      offenders: r.offenders,
      cardCount: r.kind === "patents" ? r.cardCount : null,
      ok,
    });
    if (!ok) {
      report.failures.push(
        `override ${r.viewport} ${r.route}: markers=${markersPresent} cards=${r.cardCount} ` +
          `overflow=${r.docOverflow} offenders=${JSON.stringify(r.offenders)}`,
      );
    }
  }

  const psRevert = await put(PATENT_SECTIONS_KEY, "ko", "");
  const facRevert = await put(FACILITY_KEY, "ko", "");
  const techRevert = await put(TECH_FEATURES_KEY, "ko", "");
  report.steps.revert = {
    patentSections: { status: psRevert.status, error: psRevert.body?.error },
    facilityTabs: { status: facRevert.status, error: facRevert.body?.error },
    techFeatures: { status: techRevert.status, error: techRevert.body?.error },
    ok: psRevert.status === 200 && facRevert.status === 200 && techRevert.status === 200,
  };
  if (!report.steps.revert.ok) report.failures.push("revert structured marker overrides failed");

  /* ------------------------- malformed techFeatures → 400, nothing persisted */
  const badTwoBlocks =
    techBlocks && techBlocks.length === 3
      ? await put(TECH_FEATURES_KEY, "ko", JSON.stringify({ blocks: techBlocks.slice(0, 2) }))
      : { status: 0 };
  const badEmptyBlock =
    techBlocks && techBlocks.length === 3
      ? await put(
          TECH_FEATURES_KEY,
          "ko",
          JSON.stringify({ blocks: techBlocks.map((b, i) => (i === 1 ? { ...b, items: [] } : b)) }),
        )
      : { status: 0 };
  report.steps.malformed = {
    blocksNotThree: badTwoBlocks.status,
    blocksNotThree400: badTwoBlocks.status === 400,
    emptyItemsBlock: badEmptyBlock.status,
    emptyItemsBlock400: badEmptyBlock.status === 400,
  };

  const finalGroup = await getJson("/api/admin/registry?group=rnd&locale=ko");
  const techValueUnchanged =
    (finalGroup.values?.[TECH_FEATURES_KEY] ?? "") === defaultPayloads[TECH_FEATURES_KEY];
  report.steps.malformed.techValueUnchanged = techValueUnchanged;
  if (!report.steps.malformed.blocksNotThree400 || !report.steps.malformed.emptyItemsBlock400 || !techValueUnchanged) {
    report.failures.push(
      `malformed techFeatures: blocksNotThree=${badTwoBlocks.status} emptyItems=${badEmptyBlock.status} valueUnchanged=${techValueUnchanged}`,
    );
  }

  const valuesRestored =
    (finalGroup.values?.[PATENT_SECTIONS_KEY] ?? "") === defaultPayloads[PATENT_SECTIONS_KEY] &&
    (finalGroup.values?.[FACILITY_KEY] ?? "") === facilityValue &&
    techValueUnchanged;
  report.steps.valuesRestored = {
    patentSections:
      (finalGroup.values?.[PATENT_SECTIONS_KEY] ?? "") === defaultPayloads[PATENT_SECTIONS_KEY],
    facilityTabs: (finalGroup.values?.[FACILITY_KEY] ?? "") === facilityValue,
    techFeatures: techValueUnchanged,
    ok: valuesRestored,
  };
  if (!valuesRestored) {
    report.failures.push("valuesRestored: effective values differ from baseline");
  }

  const residue = await sweep("residue");
  report.steps.residue = [];
  for (const r of residue) {
    const base = baselineByKey.get(`${r.viewport}|${r.route}`);
    const markersGone = Object.values(r.markerHit).every((v) => v === false);
    const pageHeightDelta = base ? r.pageHeight - base.pageHeight : null;
    const heightOk = pageHeightDelta !== null && Math.abs(pageHeightDelta) <= 1;
    const overflowOk = r.docOverflow <= 2;
    const cardsOk = r.kind !== "patents" || r.cardCount === 13;
    let sectionsOk = true;
    if (r.kind === "technology") {
      for (const anchor of TECH_SECTION_ANCHORS) {
        const b = base?.sectionHashes?.[anchor] ?? null;
        const a = r.sectionHashes?.[anchor] ?? null;
        if (!(b?.found && a?.found && b.hash === a.hash && b.height === a.height)) sectionsOk = false;
      }
    }
    const ok = markersGone && heightOk && overflowOk && cardsOk && sectionsOk;
    report.steps.residue.push({
      viewport: r.viewport,
      route: r.route,
      markersGone,
      pageHeight: r.pageHeight,
      baselinePageHeight: base?.pageHeight ?? null,
      pageHeightDelta,
      docOverflow: r.docOverflow,
      cardCount: r.kind === "patents" ? r.cardCount : null,
      sectionsOk,
      ok,
    });
    if (!ok) {
      report.failures.push(
        `residue ${r.viewport} ${r.route}: markersGone=${markersGone} ` +
          `heightDelta=${pageHeightDelta} overflow=${r.docOverflow} cards=${r.cardCount} sectionsOk=${sectionsOk}`,
      );
    }
  }

  /* ------------------------------------------------------- alias parity */
  const alias = await aliasSweep();
  report.steps.alias = [];
  for (const vp of VIEWPORTS) {
    const rnd = alias.find((r) => r.viewport === vp.vp && r.route === "/rnd");
    const tech = alias.find((r) => r.viewport === vp.vp && r.route === "/rnd/technology");
    const heightDelta = rnd && tech ? rnd.pageHeight - tech.pageHeight : null;
    const heightOk = heightDelta !== null && Math.abs(heightDelta) <= 1;
    const sectionOk = Boolean(rnd && tech) && rnd.sectionCount === tech.sectionCount;
    const markerOk =
      Boolean(rnd && tech) && rnd.markerHit[aliasMarker] === true && tech.markerHit[aliasMarker] === true;
    const ok = heightOk && sectionOk && markerOk;
    report.steps.alias.push({
      viewport: vp.vp,
      rndHeight: rnd?.pageHeight ?? null,
      techHeight: tech?.pageHeight ?? null,
      heightDelta,
      rndSections: rnd?.sectionCount ?? null,
      techSections: tech?.sectionCount ?? null,
      sectionOk,
      marker: aliasMarker,
      markerOk,
      ok,
    });
    if (!ok) {
      report.failures.push(
        `alias ${vp.vp}: height ${rnd?.pageHeight}/${tech?.pageHeight} (Δ${heightDelta}) ` +
          `sections ${rnd?.sectionCount}/${tech?.sectionCount} markerOk=${markerOk}`,
      );
    }
  }

  report.pass = report.failures.length === 0;
} catch (e) {
  report.error = String((e && e.stack) || e).slice(0, 900);
  report.pass = false;
  report.failures.push(`script error: ${report.error}`);
} finally {
  // Best-effort revert of anything still written.
  if (dirty) {
    for (const key of [...dirty]) {
      try {
        await fetch(`${BASE}/api/admin/registry`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Origin: BASE, Cookie: authCookie },
          body: JSON.stringify({ key, locale: "ko", value: "" }),
        });
      } catch {}
    }
  }
  try { if (browser) await browser.close(); } catch {}
  killDev();
  report.devLogTail = report.pass ? undefined : devLog.slice(-1200);
  try {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 1));
  } catch (e) {
    report.reportWriteError = String(e).slice(0, 200);
  }
  console.log(JSON.stringify(report, null, 1));
}
process.exit(report.pass ? 0 : 1);
