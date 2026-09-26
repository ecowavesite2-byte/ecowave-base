/**
 * One-shot runtime verification for the R&D channel registry + structured editors.
 *
 *   A) registry shape (group `rnd`, from `/api/admin/registry`):
 *      - group `rnd` holds 18 defs: zero for the aliased root pageKey `rnd`, five
 *        for `rnd.technology`, one for `rnd.patents`, twelve for `rnd.facilities`;
 *      - ONE unified v2 `techFeatures` def anchored at §4
 *        (`rnd.technology#s202509091799d895b62ea/techFeatures/techFeatures`) whose
 *        `techBlocks.sections` maps blocks 1..3 to §4/§5/§6; the old §5/§6
 *        per-section keys are GONE. Plus one `patentSections` (rnd.patents §4) and
 *        four `facilitiesTable` (rnd.facilities §5);
 *      - the SUPERSEDED defs are gone: no image/lines def for a covered
 *        rnd.technology §4/§5/§6 widget, no heading `lines`/`gallery` def for the
 *        rnd.patents §4 section, no `lines` def for a covered facilities table;
 *      - the SHARED R&D sub-hero band is now canonical on rnd.technology
 *        (`.../s20250909caaa8544e0e70/w20250909b16e1f0580760/html`, `shared:true`);
 *        the superseded rnd.patents / rnd.facilities banner defs no longer exist;
 *      - the surviving `gallery` (rnd.technology USP) and `facilityTabs` defs keep
 *        their shape; NO legacy `items[n]` keys exist under any `rnd*` pageKey.
 *   B) runtime round-trips (require DATABASE_URL; a missing DB is reported as a
 *      blocker and fails the run, never a silent pass):
 *      - techFeatures (one def): a marker block-2 heading + marker row + an added
 *        block-2 item and a marker block-3 heading render on `/rnd/technology`
 *        (ko) and never on `/en/rnd/technology` → revert → residue gone;
 *      - shared band: a marker PUT on the canonical key renders on
 *        `/rnd/technology`, `/rnd/patents` AND `/rnd/facilities` (ko) and never
 *        on `/en/rnd/patents` → revert → residue gone;
 *      - patentSections: a marker section title + marker first-item caption
 *        render on `/rnd/patents` (ko), absent on the EN route → revert →
 *        residue gone;
 *      - facilitiesTable: a marker header cell + an added marker row render on
 *        `/rnd/facilities` → revert → residue gone;
 *      - malformed payloads → HTTP 400 and nothing persisted: techFeatures with
 *        `blocks.length !== 3` (2 and 4) and an empty-items block and 13 items in
 *        a block; patentSections with 0 sections; facilitiesTable with a
 *        1-element header and with a 3-element row;
 *      - USP gallery (image-only) and facilityTabs round-trips still pass.
 *   C) alias parity: `/rnd` and `/rnd/technology` both HTTP 200 (no redirect)
 *      and render the same distinguishing section title with equal `<section>`
 *      counts (ko + en).
 *   D) admin UI smoke: the R&D group renders the unified `techFeatures` editor as
 *      three fixed `tech-feature-block` groups (item testids nested inside each),
 *      the `patent-section-*` / `facilities-table-*` editors, and the add/remove
 *      controls honour their caps (draft-only). A facilities PREVIEW smoke opens
 *      the facilities editor(s) and asserts the live pane renders the real
 *      `[data-fac-tabs]` UI (3 `aria-pressed` tabs, no raw `tab-content` markup)
 *      for both the section-less facilityTabs def and a `lines` def on the tab
 *      section.
 *   E) no residue at the end (effective values back to baseline, pages clean).
 *
 * Uses dev port 3131 (siblings use other ports; 4517 is the standing server) so
 * it cannot clash. Cleans up every override it writes. Writes a machine-readable
 * report to design/audit/rnd-verify/report.json (`design/` is gitignored).
 * Non-zero exit on any failure or blocker.
 *
 * Usage: node scripts/audit/verify-rnd-editor.mjs [--port=3131]
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
const PORT = Number(getArg("port", "3131"));
const BASE = `http://127.0.0.1:${PORT}`;
const STAMP = Date.now();
const OUT = path.resolve("design", "audit", "rnd-verify");

/* --------------------------------------------------------------- keys */
const CANONICAL_BANNER_KEY =
  "rnd.technology#s20250909caaa8544e0e70/w20250909b16e1f0580760/html";
const USP_KEY =
  "rnd.technology#s2025090979d4f02da9a4c/w20250909f44806a14d131/gallery";
const FACILITY_KEY = "rnd.facilities#facilityTabs/facilityTabs";
const TECH_TITLE_KEY =
  "rnd.technology#s2025090979d4f02da9a4c/w202509098378a31a7319e/html";

/** The ONE unified v2 techFeatures def (§4 anchor; blocks map to §4/§5/§6). */
const TECH_FEATURES_KEY =
  "rnd.technology#s202509091799d895b62ea/techFeatures/techFeatures";
const TECH_BLOCKS_SECTIONS = [
  "s202509091799d895b62ea", // §4 block 1
  "s2025090972e449f7846e1", // §5 block 2
  "s20250909b12fa8000068e", // §6 block 3
];
/** The three section ids once covered by per-section techFeatures defs / old lines. */
const TECH_SECTION_IDS = TECH_BLOCKS_SECTIONS;

const PATENT_SECTIONS_KEY =
  "rnd.patents#s202508114d9bc90ceb876/patentSections/patentSections";
const PATENT_SECTIONS_ID = "s202508114d9bc90ceb876";
const FACILITIES_TABLE_KEYS = [
  "rnd.facilities#s20250829c25afe324e195/w20250829bb21466f4e0f1/facilitiesTable",
  "rnd.facilities#s20250829c25afe324e195/w20250829370d74ba50fab/facilitiesTable",
  "rnd.facilities#s20250829c25afe324e195/w202508298781405b23d22/facilitiesTable",
  "rnd.facilities#s20250829c25afe324e195/w202508293b8acaf6df97a/facilitiesTable",
];
const FACILITIES_TABLE_WIDGETS = [
  "w20250829bb21466f4e0f1",
  "w20250829370d74ba50fab",
  "w202508298781405b23d22",
  "w202508293b8acaf6df97a",
];

/** Superseded banner defs that must no longer exist (rnd.patents / rnd.facilities copies). */
const SUPERSEDED_BANNER_KEYS = [
  "rnd.patents#s2025082027290aa48803c/w20250820f45ae1e9a7239/html",
  "rnd.facilities#s202508207ea6e772a48a0/w20250820e4cafbac3320e/html",
];

const TECH_B2_HEAD_MARK = `E2E-RND-TECHB2H-${STAMP}`;
const TECH_B2_ROW_MARK = `E2E-RND-TECHB2R-${STAMP}`;
const TECH_B2_ITEM_MARK = `E2E-RND-TECHB2I-${STAMP}`;
const TECH_B3_HEAD_MARK = `E2E-RND-TECHB3H-${STAMP}`;
const BANNER_MARK = `E2E-RND-BANNER-${STAMP}`;
const PATSEC_TITLE_MARK = `E2E-RND-PSTITLE-${STAMP}`;
const PATSEC_CAP_MARK = `E2E-RND-PSCAP-${STAMP}`;
const TABLE_HEAD_MARK = `E2E-RND-TABHEAD-${STAMP}`;
const TABLE_ROW_MARK = `E2E-RND-TABROW-${STAMP}`;
const BAD_TECH_MARK = `E2E-RND-BADTECH-${STAMP}`;
const BAD_BLOCKS_MARK = `E2E-RND-BADBLOCKS-${STAMP}`;
const BAD_PAT_MARK = `E2E-RND-BADPAT-${STAMP}`;
const BAD_TAB_MARK = `E2E-RND-BADTAB-${STAMP}`;

const dev = spawn("npx", ["next", "dev", "--port", String(PORT)], {
  shell: true,
  stdio: ["ignore", "pipe", "pipe"],
});
let devLog = "";
dev.stdout.on("data", (d) => (devLog += d));
dev.stderr.on("data", (d) => (devLog += d));
const killDev = () => {
  try { spawnSync("taskkill", ["/pid", String(dev.pid), "/T", "/F"], { stdio: "ignore" }); } catch {}
};

async function waitReady() {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) return true; } catch {}
    await sleep(2500);
  }
  return false;
}

const report = { base: BASE, port: PORT, out: path.relative(process.cwd(), OUT) };
let pass = true;
const blockers = [];
const section = (name, data) => {
  const ok = Object.values(data).every((v) => v !== false);
  report[name] = { ...data, pass: ok };
  if (!ok) pass = false;
};

/** Parse a JSON array payload; `null` when malformed/non-array. */
function parseArrayPayload(json) {
  try {
    const value = JSON.parse(json);
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/** Parse a JSON object payload; `null` when malformed/array. */
function parseObjectPayload(json) {
  try {
    const value = JSON.parse(json);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

const arraysEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

let browser;
let revertAll = async () => {};
try {
  if (!(await waitReady())) {
    console.log(JSON.stringify({ ...report, devReady: false, devLog: devLog.slice(-1500) }, null, 1));
    killDev();
    process.exit(1);
  }

  const sealed = await sealData(
    { admin: { email: process.env.ADMIN_EMAIL ?? "admin", loggedInAt: Date.now() } },
    { password: process.env.SESSION_SECRET ?? "", ttl: 60 * 60 * 24 * 30 },
  );
  const cookie = `ecowave_admin=${sealed}`;

  const getJson = async (p) => {
    const res = await fetch(`${BASE}${p}`, { headers: { Cookie: cookie } });
    if (!res.ok) throw new Error(`GET ${p} → ${res.status}`);
    return res.json();
  };
  // Cache-bust per phase: a fresh query string guarantees a fresh render even
  // when the dev server would otherwise reuse a page keyed on the path.
  const bust = (p, tag) => `${p}${p.includes("?") ? "&" : "?"}e2e=${tag}-${STAMP}`;
  const pageText = async (p, tag = "t") => {
    const res = await fetch(`${BASE}${bust(p, tag)}`);
    return { status: res.status, html: await res.text() };
  };

  // Every non-empty write is tracked so a mid-case throw still reverts it.
  const dirty = new Set();
  const token = (key, locale) => `${key}\u0000${locale}`;
  const put = async (key, locale, value) => {
    const res = await fetch(`${BASE}/api/admin/registry`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Origin: BASE, Cookie: cookie },
      body: JSON.stringify({ key, locale, value }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      if (value === "") dirty.delete(token(key, locale));
      else dirty.add(token(key, locale));
    }
    return { status: res.status, body };
  };
  const revert = (key, locale = "ko") => put(key, locale, "");
  revertAll = async () => {
    for (const t of [...dirty]) {
      const [key, locale] = t.split("\u0000");
      try { await put(key, locale, ""); } catch {}
    }
  };

  /* ------------------------------------------------- A) registry shape */

  const rndKo = await getJson("/api/admin/registry?group=rnd&locale=ko");
  const rndEn = await getJson("/api/admin/registry?group=rnd&locale=en");
  const defs = rndKo.defs ?? [];

  const rootDefs = defs.filter((d) => d.pageKey === "rnd");
  const techDefs = defs.filter((d) => d.pageKey === "rnd.technology");
  const patentsDefs = defs.filter((d) => d.pageKey === "rnd.patents");
  const facilitiesDefs = defs.filter((d) => d.pageKey === "rnd.facilities");

  const uspDef = techDefs.find((d) => d.key === USP_KEY) ?? null;
  const uspFieldsOk =
    uspDef?.kind === "gallery" &&
    JSON.stringify(uspDef.gallery?.fields ?? []) === JSON.stringify(["image"]) &&
    uspDef.gallery?.maxItems === 5;

  const facilityDef = facilitiesDefs.find((d) => d.kind === "facilityTabs") ?? null;
  const facilityBase = parseArrayPayload(rndKo.values?.[FACILITY_KEY] ?? "");
  const facilityDefault3 = Array.isArray(facilityBase) && facilityBase.length === 3;
  const uspBase = parseArrayPayload(rndKo.values?.[USP_KEY] ?? "");

  // Legacy per-item media keys must not exist under any rnd* pageKey.
  const rndDefs = defs.filter((d) => d.pageKey.startsWith("rnd"));
  const legacyItemDefs = rndDefs.filter((d) => /items\[/.test(d.field) || /items\[/.test(d.key));

  section("registryShape", {
    defCount: defs.length,
    defCount18: defs.length === 18,
    rootDefCount: rootDefs.length,
    rootEmitsNoDefs: rootDefs.length === 0,
    technologyDefCount: techDefs.length,
    technologyDefCount5: techDefs.length === 5,
    patentsDefCount: patentsDefs.length,
    patentsDefCount1: patentsDefs.length === 1,
    facilitiesDefCount: facilitiesDefs.length,
    facilitiesDefCount12: facilitiesDefs.length === 12,
    uspDefFound: Boolean(uspDef),
    uspFieldsOk,
    uspDefaultCount: Array.isArray(uspBase) ? uspBase.length : -1,
    uspDefault5: Array.isArray(uspBase) && uspBase.length === 5,
    facilityDefFound: Boolean(facilityDef),
    facilityDefKind: facilityDef?.kind ?? null,
    facilityDefaultCount: Array.isArray(facilityBase) ? facilityBase.length : -1,
    facilityDefault3,
    legacyItemDefCount: legacyItemDefs.length,
    legacyItemKeysAbsent: legacyItemDefs.length === 0,
    dbConfigured: rndKo.dbConfigured === true,
  });

  /* -------- A2) the structured defs + superseded defs gone ------------ */

  const techFeatureDefs = defs.filter((d) => d.kind === "techFeatures");
  const techDef = techFeatureDefs[0] ?? null;
  const techBlocksSections = techDef?.techBlocks?.sections ?? null;

  const NEW_DEF_KIND = {
    [PATENT_SECTIONS_KEY]: "patentSections",
    [FACILITIES_TABLE_KEYS[0]]: "facilitiesTable",
    [FACILITIES_TABLE_KEYS[1]]: "facilitiesTable",
    [FACILITIES_TABLE_KEYS[2]]: "facilitiesTable",
    [FACILITIES_TABLE_KEYS[3]]: "facilitiesTable",
  };
  const newDefChecks = {};
  for (const [key, kind] of Object.entries(NEW_DEF_KIND)) {
    const matches = defs.filter((d) => d.key === key);
    newDefChecks[`def:${kind}:${key}`] = matches.length === 1 && matches[0].kind === kind;
  }

  // Superseded defs must be gone for the covered sections/widgets.
  const superseded = defs.filter((d) => {
    if (
      d.pageKey === "rnd.technology" &&
      TECH_SECTION_IDS.includes(d.sectionId) &&
      (d.kind === "image" || d.kind === "lines")
    ) {
      return true;
    }
    if (
      d.pageKey === "rnd.patents" &&
      d.sectionId === PATENT_SECTIONS_ID &&
      (d.kind === "lines" || d.kind === "gallery")
    ) {
      return true;
    }
    if (
      d.pageKey === "rnd.facilities" &&
      FACILITIES_TABLE_WIDGETS.includes(d.widgetId) &&
      (d.kind === "lines" || d.kind === "image")
    ) {
      return true;
    }
    return false;
  });
  const techSrcHtmlKeys = defs.filter(
    (d) =>
      d.pageKey === "rnd.technology" &&
      TECH_SECTION_IDS.includes(d.sectionId) &&
      (/\/src$/.test(d.key) || /\/html$/.test(d.key)),
  );
  const patentSectionOtherDefs = defs.filter(
    (d) => d.pageKey === "rnd.patents" && d.sectionId === PATENT_SECTIONS_ID && d.kind !== "patentSections",
  );
  const tableLinesDefs = defs.filter(
    (d) =>
      d.pageKey === "rnd.facilities" &&
      FACILITIES_TABLE_WIDGETS.includes(d.widgetId) &&
      d.kind === "lines",
  );

  // The one unified def replaces the old §5/§6 keys.
  const oldTechKeys = [
    "rnd.technology#s2025090972e449f7846e1/techFeatures/techFeatures",
    "rnd.technology#s20250909b12fa8000068e/techFeatures/techFeatures",
  ];
  const oldTechKeysPresent = oldTechKeys.filter((k) => defs.some((d) => d.key === k));

  // Shared band canonical def + superseded banner defs.
  const bannerDef = defs.find((d) => d.key === CANONICAL_BANNER_KEY) ?? null;
  const supersededBannerPresent = SUPERSEDED_BANNER_KEYS.filter((k) =>
    defs.some((d) => d.key === k),
  );

  section("structuredRegistryShape", {
    techFeaturesDefFound: Boolean(techDef),
    techFeaturesKeyOk: techDef?.key === TECH_FEATURES_KEY,
    techFeaturesKindOk: techDef?.kind === "techFeatures",
    techFeaturesAnchorSection: techDef?.sectionId ?? null,
    techBlocksSections: techBlocksSections,
    techBlocksSectionsOk: arraysEqual(techBlocksSections, TECH_BLOCKS_SECTIONS),
    techFeaturesCount: techFeatureDefs.length,
    techFeaturesCount1: techFeatureDefs.length === 1,
    oldTechFeatureKeysPresent: oldTechKeysPresent.length,
    oldTechFeatureKeysAbsent: oldTechKeysPresent.length === 0,
    newDefTotal: Object.keys(NEW_DEF_KIND).length,
    newDefTotal5: Object.keys(NEW_DEF_KIND).length === 5,
    ...newDefChecks,
    patentSectionsCount: defs.filter((d) => d.kind === "patentSections").length,
    patentSectionsCount1: defs.filter((d) => d.kind === "patentSections").length === 1,
    facilitiesTableCount: defs.filter((d) => d.kind === "facilitiesTable").length,
    facilitiesTableCount4: defs.filter((d) => d.kind === "facilitiesTable").length === 4,
    superseededCount: superseded.length,
    superseededAbsent: superseded.length === 0,
    techSrcHtmlCount: techSrcHtmlKeys.length,
    techSrcHtmlAbsent: techSrcHtmlKeys.length === 0,
    patentSectionOtherCount: patentSectionOtherDefs.length,
    patentSectionOtherAbsent: patentSectionOtherDefs.length === 0,
    tableLinesCount: tableLinesDefs.length,
    tableLinesAbsent: tableLinesDefs.length === 0,
    bannerDefFound: Boolean(bannerDef),
    bannerDefKindOk: bannerDef?.kind === "lines",
    bannerDefSharedOk: bannerDef?.shared === true,
    supersededBannerPresent: supersededBannerPresent.length,
    supersededBannerAbsent: supersededBannerPresent.length === 0,
  });

  const dbConfigured = rndKo.dbConfigured === true;
  if (!dbConfigured) {
    blockers.push(
      "DATABASE_URL is not configured (registry GET reports dbConfigured=false); runtime round-trips were not run",
    );
  }

  // Baseline effective values (empty string when absent).
  const baseUspVal = rndKo.values?.[USP_KEY] ?? "";
  const baseFacilityVal = rndKo.values?.[FACILITY_KEY] ?? "";
  const baseBannerVal = rndKo.values?.[CANONICAL_BANNER_KEY] ?? "";
  const baseTechFeaturesVal = rndKo.values?.[TECH_FEATURES_KEY] ?? "";
  const basePatentSectionsVal = rndKo.values?.[PATENT_SECTIONS_KEY] ?? "";
  const baseFacilitiesTables = Object.fromEntries(
    FACILITIES_TABLE_KEYS.map((k) => [k, rndKo.values?.[k] ?? ""]),
  );

  const techDefault = parseObjectPayload(baseTechFeaturesVal);
  const techDefaultBlocks = techDefault && Array.isArray(techDefault.blocks) ? techDefault.blocks : null;
  const techDefaultItemCounts = Array.isArray(techDefaultBlocks)
    ? techDefaultBlocks.map((b) => (Array.isArray(b.items) ? b.items.length : -1))
    : null;
  const techDefaultBlocksOk =
    Array.isArray(techDefaultBlocks) && techDefaultBlocks.length === 3 &&
    techDefaultBlocks.every((b) => Array.isArray(b.items) && b.items.length >= 1 && b.items.length <= 12);

  section("techFeaturesDefaultShape", {
    baseFound: Boolean(techDefault),
    blockCount: Array.isArray(techDefaultBlocks) ? techDefaultBlocks.length : -1,
    blockCountIs3: Array.isArray(techDefaultBlocks) && techDefaultBlocks.length === 3,
    itemCounts: techDefaultItemCounts,
    itemCountsOk: arraysEqual(techDefaultItemCounts, [1, 2, 2]),
    blocksShapeOk: techDefaultBlocksOk,
  });

  /* --------------------------------------------- C) alias parity (no DB) */

  const aliasMarkers = {
    ko: rndKo.values?.[TECH_TITLE_KEY] ?? "",
    en: rndEn.values?.[TECH_TITLE_KEY] ?? "",
  };
  const aliasChecks = {};
  for (const [label, rndRoute, techRoute] of [
    ["ko", "/rnd", "/rnd/technology"],
    ["en", "/en/rnd", "/en/rnd/technology"],
  ]) {
    const rndRes = await fetch(`${BASE}${bust(rndRoute, "alias")}`, { redirect: "manual" });
    const techRes = await fetch(`${BASE}${bust(techRoute, "alias")}`, { redirect: "manual" });
    const rndHtml = await rndRes.text();
    const techHtml = await techRes.text();
    const marker = aliasMarkers[label];
    const sectionsOf = (h) => (h.match(/<section\b/gi) ?? []).length;
    aliasChecks[label] = {
      rndStatus: rndRes.status,
      techStatus: techRes.status,
      rndNotRedirect: rndRes.status === 200,
      techNotRedirect: techRes.status === 200,
      rndMarker: Boolean(marker) && rndHtml.includes(marker),
      techMarker: Boolean(marker) && techHtml.includes(marker),
      rndSectionCount: sectionsOf(rndHtml),
      techSectionCount: sectionsOf(techHtml),
      sectionCountEqual: sectionsOf(rndHtml) === sectionsOf(techHtml),
    };
  }
  section("aliasParity", {
    koMarker: aliasMarkers.ko,
    enMarker: aliasMarkers.en,
    ...Object.fromEntries(
      Object.entries(aliasChecks).flatMap(([k, v]) =>
        Object.entries(v).map(([kk, vv]) => [`${k}:${kk}`, vv]),
      ),
    ),
  });

  /* ------------------------------------------- B) runtime round-trips */

  browser = await chromium.launch();

  /** Count rendered `<img>` whose raw src is one of `srcs`. */
  const countImages = async (route, tag, srcs) => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    try {
      await page.goto(`${BASE}${bust(route, tag)}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);
      return await page.evaluate((list) => {
        const set = new Set(list);
        let n = 0;
        for (const img of document.images) if (set.has(img.getAttribute("src"))) n += 1;
        return n;
      }, srcs);
    } finally {
      await page.close();
    }
  };

  if (dbConfigured) {
    /* -- USP gallery (image-only) ----------------------------------------- */
    let uspWriteOk = false;
    let uspTwoCards = false;
    let uspDroppedOthers = false;
    let uspReverted = false;
    let uspValueRestored = false;
    let uspBaselineCards = -1;
    let uspRestoredCards = -1;
    if (uspBase && uspBase.length >= 2) {
      const allUsp = uspBase.map((it) => it.image);
      uspBaselineCards = await countImages("/rnd/technology", "usp-base", allUsp);
      const kept = uspBase.slice(0, 2).map((it) => ({ image: it.image, title: "", desc: "" }));
      const dropped = uspBase.slice(2).map((it) => it.image);
      const write = await put(USP_KEY, "ko", JSON.stringify(kept));
      uspWriteOk = write.status === 200;
      if (uspWriteOk) {
        uspTwoCards =
          (await countImages("/rnd/technology", "usp-on", kept.map((it) => it.image))) === 2;
        uspDroppedOthers = (await countImages("/rnd/technology", "usp-on2", dropped)) === 0;
      }
      await revert(USP_KEY, "ko");
      const restored = await getJson("/api/admin/registry?group=rnd&locale=ko");
      uspValueRestored = (restored.values?.[USP_KEY] ?? "") === baseUspVal;
      uspRestoredCards = await countImages("/rnd/technology", "usp-off", allUsp);
      uspReverted = uspRestoredCards === uspBaselineCards && uspRestoredCards === 5;
    }
    section("uspGalleryRoundTrip", {
      baseFound: Boolean(uspBase),
      baseCount: Array.isArray(uspBase) ? uspBase.length : -1,
      baselineCards: uspBaselineCards,
      writeOk: uspWriteOk,
      twoCardsRendered: uspTwoCards,
      droppedItemsGone: uspDroppedOthers,
      reverted: uspReverted,
      restoredCards: uspRestoredCards,
      valueRestored: uspValueRestored,
    });

    /* -- facilityTabs ----------------------------------------------------- */
    let facWriteOk = false;
    let facApplied = false;
    let facReverted = false;
    let facValueRestored = false;
    let facBaselineTabRendered = false;
    if (facilityBase && facilityBase.length > 0 && Array.isArray(facilityBase[0]?.images)) {
      const baselineHtml = await pageText("/rnd/facilities", "fac-base");
      facBaselineTabRendered = baselineHtml.html.includes(facilityBase[0].name);
      const payload = JSON.stringify([
        { name: `E2E-RND-FAC-${STAMP}`, images: [facilityBase[0].images[0]] },
      ]);
      const write = await put(FACILITY_KEY, "ko", payload);
      facWriteOk = write.status === 200;
      if (facWriteOk) {
        const on = await pageText("/rnd/facilities", "fac-on");
        facApplied = on.html.includes(`E2E-RND-FAC-${STAMP}`);
      }
      await revert(FACILITY_KEY, "ko");
      const off = await pageText("/rnd/facilities", "fac-off");
      facReverted = !off.html.includes(`E2E-RND-FAC-${STAMP}`);
      const restored = await getJson("/api/admin/registry?group=rnd&locale=ko");
      facValueRestored = (restored.values?.[FACILITY_KEY] ?? "") === baseFacilityVal;
    }
    section("facilityTabsRoundTrip", {
      baseFound: Boolean(facilityBase),
      baseCount: Array.isArray(facilityBase) ? facilityBase.length : -1,
      baselineTabRendered: facBaselineTabRendered,
      writeOk: facWriteOk,
      markerApplied: facApplied,
      reverted: facReverted,
      valueRestored: facValueRestored,
    });

    /* -- techFeatures (one def): block 2 + block 3 markers ---------------- */
    let techWriteOk = false;
    let techAppliedKo = false;
    let techEnOk = false;
    let techNotInEn = false;
    let techReverted = false;
    let techValueRestored = false;
    if (techDefaultBlocksOk) {
      const markedBlocks = techDefaultBlocks.map((b, i) => {
        if (i === 1) {
          const items = b.items.map((it, j) =>
            j === 0
              ? {
                  ...it,
                  heading: TECH_B2_HEAD_MARK,
                  rows: it.rows.map((r, k) => (k === 0 ? { ...r, label: TECH_B2_ROW_MARK } : r)),
                }
              : it,
          );
          return {
            items: [
              ...items,
              { image: b.items[0].image, heading: TECH_B2_ITEM_MARK, rows: [{ label: TECH_B2_ITEM_MARK, body: "e2e" }] },
            ],
          };
        }
        if (i === 2) {
          return {
            items: b.items.map((it, j) => (j === 0 ? { ...it, heading: TECH_B3_HEAD_MARK } : it)),
          };
        }
        return b;
      });
      const write = await put(TECH_FEATURES_KEY, "ko", JSON.stringify({ blocks: markedBlocks }));
      techWriteOk = write.status === 200;
      if (techWriteOk) {
        const ko = await pageText("/rnd/technology", "tech-on");
        techAppliedKo =
          ko.html.includes(TECH_B2_HEAD_MARK) &&
          ko.html.includes(TECH_B2_ROW_MARK) &&
          ko.html.includes(TECH_B2_ITEM_MARK) &&
          ko.html.includes(TECH_B3_HEAD_MARK);
        const en = await pageText("/en/rnd/technology", "tech-on-en");
        techEnOk = en.status === 200;
        techNotInEn =
          en.status === 200 &&
          !en.html.includes(TECH_B2_HEAD_MARK) &&
          !en.html.includes(TECH_B2_ROW_MARK) &&
          !en.html.includes(TECH_B2_ITEM_MARK) &&
          !en.html.includes(TECH_B3_HEAD_MARK);
      }
      await revert(TECH_FEATURES_KEY, "ko");
      const off = await pageText("/rnd/technology", "tech-off");
      techReverted =
        !off.html.includes(TECH_B2_HEAD_MARK) &&
        !off.html.includes(TECH_B2_ROW_MARK) &&
        !off.html.includes(TECH_B2_ITEM_MARK) &&
        !off.html.includes(TECH_B3_HEAD_MARK);
      const restored = await getJson("/api/admin/registry?group=rnd&locale=ko");
      techValueRestored = (restored.values?.[TECH_FEATURES_KEY] ?? "") === baseTechFeaturesVal;
    }
    section("techFeaturesRoundTrip", {
      baseFound: techDefaultBlocksOk,
      baseBlockCount: Array.isArray(techDefaultBlocks) ? techDefaultBlocks.length : -1,
      baseItemCounts: techDefaultItemCounts,
      writeOk: techWriteOk,
      markersAppliedKo: techAppliedKo,
      enRouteOk: techEnOk,
      markersNotInEn: techNotInEn,
      reverted: techReverted,
      valueRestored: techValueRestored,
    });

    /* -- shared R&D sub-hero band ----------------------------------------- */
    let bannerWriteOk = false;
    let bannerKoAll = false;
    let bannerEnClean = false;
    let bannerReverted = false;
    let bannerValueRestored = false;
    let bannerBaseFound = baseBannerVal.trim().length > 0;
    if (bannerBaseFound) {
      const write = await put(CANONICAL_BANNER_KEY, "ko", BANNER_MARK);
      bannerWriteOk = write.status === 200;
      if (bannerWriteOk) {
        const [tech, patents, facilities] = await Promise.all([
          pageText("/rnd/technology", "band-tech"),
          pageText("/rnd/patents", "band-pat"),
          pageText("/rnd/facilities", "band-fac"),
        ]);
        bannerKoAll =
          tech.status === 200 && tech.html.includes(BANNER_MARK) &&
          patents.status === 200 && patents.html.includes(BANNER_MARK) &&
          facilities.status === 200 && facilities.html.includes(BANNER_MARK);
        const [patEn, techEn, facEn] = await Promise.all([
          pageText("/en/rnd/patents", "band-pat-en"),
          pageText("/en/rnd/technology", "band-tech-en"),
          pageText("/en/rnd/facilities", "band-fac-en"),
        ]);
        bannerEnClean =
          patEn.status === 200 && !patEn.html.includes(BANNER_MARK) &&
          techEn.status === 200 && !techEn.html.includes(BANNER_MARK) &&
          facEn.status === 200 && !facEn.html.includes(BANNER_MARK);
      }
      await revert(CANONICAL_BANNER_KEY, "ko");
      const [techOff, patOff, facOff] = await Promise.all([
        pageText("/rnd/technology", "band-tech-off"),
        pageText("/rnd/patents", "band-pat-off"),
        pageText("/rnd/facilities", "band-fac-off"),
      ]);
      bannerReverted =
        !techOff.html.includes(BANNER_MARK) &&
        !patOff.html.includes(BANNER_MARK) &&
        !facOff.html.includes(BANNER_MARK);
      const restored = await getJson("/api/admin/registry?group=rnd&locale=ko");
      bannerValueRestored = (restored.values?.[CANONICAL_BANNER_KEY] ?? "") === baseBannerVal;
    }
    section("sharedBandRoundTrip", {
      baseFound: bannerBaseFound,
      writeOk: bannerWriteOk,
      markerOnTechnology: bannerWriteOk ? bannerKoAll : false,
      markerOnPatentsAndFacilities: bannerWriteOk ? bannerKoAll : false,
      enNotLeaked: bannerEnClean,
      reverted: bannerReverted,
      valueRestored: bannerValueRestored,
    });

    /* -- patentSections: marker title + marker caption -------------------- */
    const psBase = parseObjectPayload(basePatentSectionsVal);
    const psSections = psBase && Array.isArray(psBase.sections) ? psBase.sections : null;
    let psWriteOk = false;
    let psAppliedKo = false;
    let psEnOk = false;
    let psNotInEn = false;
    let psReverted = false;
    let psValueRestored = false;
    if (psSections && psSections.length > 0 && Array.isArray(psSections[0]?.items)) {
      const marked = psSections.map((s, i) =>
        i === 0
          ? {
              ...s,
              title: PATSEC_TITLE_MARK,
              items: s.items.map((it, j) => (j === 0 ? { ...it, caption: PATSEC_CAP_MARK } : it)),
            }
          : s,
      );
      const write = await put(PATENT_SECTIONS_KEY, "ko", JSON.stringify({ sections: marked }));
      psWriteOk = write.status === 200;
      if (psWriteOk) {
        const ko = await pageText("/rnd/patents", "ps-on");
        psAppliedKo = ko.html.includes(PATSEC_TITLE_MARK) && ko.html.includes(PATSEC_CAP_MARK);
        const en = await pageText("/en/rnd/patents", "ps-on-en");
        psEnOk = en.status === 200;
        psNotInEn =
          en.status === 200 &&
          !en.html.includes(PATSEC_TITLE_MARK) &&
          !en.html.includes(PATSEC_CAP_MARK);
      }
      await revert(PATENT_SECTIONS_KEY, "ko");
      const off = await pageText("/rnd/patents", "ps-off");
      psReverted = !off.html.includes(PATSEC_TITLE_MARK) && !off.html.includes(PATSEC_CAP_MARK);
      const restored = await getJson("/api/admin/registry?group=rnd&locale=ko");
      psValueRestored = (restored.values?.[PATENT_SECTIONS_KEY] ?? "") === basePatentSectionsVal;
    }
    section("patentSectionsRoundTrip", {
      baseFound: Boolean(psSections),
      baseSectionCount: Array.isArray(psSections) ? psSections.length : -1,
      writeOk: psWriteOk,
      markersAppliedKo: psAppliedKo,
      enRouteOk: psEnOk,
      markersNotInEn: psNotInEn,
      reverted: psReverted,
      valueRestored: psValueRestored,
    });

    /* -- facilitiesTable: marker header + added marker row ---------------- */
    const FT_KEY = FACILITIES_TABLE_KEYS[0];
    const ftBase = parseObjectPayload(baseFacilitiesTables[FT_KEY]);
    let ftWriteOk = false;
    let ftApplied = false;
    let ftReverted = false;
    let ftValueRestored = false;
    if (ftBase && Array.isArray(ftBase.header) && Array.isArray(ftBase.rows)) {
      const payload = JSON.stringify({
        header: [TABLE_HEAD_MARK, ftBase.header[1]],
        rows: [...ftBase.rows, [TABLE_ROW_MARK, "1"]],
      });
      const write = await put(FT_KEY, "ko", payload);
      ftWriteOk = write.status === 200;
      if (ftWriteOk) {
        const on = await pageText("/rnd/facilities", "ft-on");
        ftApplied = on.html.includes(TABLE_HEAD_MARK) && on.html.includes(TABLE_ROW_MARK);
      }
      await revert(FT_KEY, "ko");
      const off = await pageText("/rnd/facilities", "ft-off");
      ftReverted = !off.html.includes(TABLE_HEAD_MARK) && !off.html.includes(TABLE_ROW_MARK);
      const restored = await getJson("/api/admin/registry?group=rnd&locale=ko");
      ftValueRestored = (restored.values?.[FT_KEY] ?? "") === baseFacilitiesTables[FT_KEY];
    }
    section("facilitiesTableRoundTrip", {
      baseFound: Boolean(ftBase),
      baseRowCount: Array.isArray(ftBase?.rows) ? ftBase.rows.length : -1,
      writeOk: ftWriteOk,
      markersApplied: ftApplied,
      reverted: ftReverted,
      valueRestored: ftValueRestored,
    });

    /* -- malformed payloads → 400, nothing persisted ---------------------- */
    let twoBlocks = null;
    let fourBlocks = null;
    let emptyItemsBlock = null;
    let overCapBlock = null;
    if (techDefaultBlocksOk) {
      const markedFor = (blocks, mark) =>
        JSON.stringify({
          blocks: blocks.map((b, i) => (i === 0 ? { ...b, items: b.items.map((it, j) => (j === 0 ? { ...it, heading: mark } : it)) } : b)),
        });
      twoBlocks = markedFor(techDefaultBlocks.slice(0, 2), BAD_BLOCKS_MARK);
      fourBlocks = JSON.stringify({ blocks: [...techDefaultBlocks, techDefaultBlocks[0]] });
      emptyItemsBlock = JSON.stringify({
        blocks: techDefaultBlocks.map((b, i) => (i === 1 ? { ...b, items: [] } : b)),
      });
      overCapBlock = JSON.stringify({
        blocks: techDefaultBlocks.map((b, i) =>
          i === 1
            ? {
                ...b,
                items: Array.from({ length: 13 }, (_, k) => ({
                  ...b.items[k % b.items.length],
                  heading: `${BAD_TECH_MARK}-${k}`,
                })),
              }
            : b,
        ),
      });
    }
    const zeroSections = JSON.stringify({ sections: [] });
    const shortHeader =
      ftBase && ftBase.rows
        ? JSON.stringify({ header: [BAD_TAB_MARK], rows: ftBase.rows })
        : null;
    const longRow =
      ftBase && ftBase.rows && ftBase.rows[0]
        ? JSON.stringify({ header: ftBase.header, rows: [[...ftBase.rows[0], "extra"]] })
        : null;

    const badTwoBlocks = twoBlocks ? await put(TECH_FEATURES_KEY, "ko", twoBlocks) : { status: 0 };
    const badFourBlocks = fourBlocks ? await put(TECH_FEATURES_KEY, "ko", fourBlocks) : { status: 0 };
    const badEmptyBlock = emptyItemsBlock
      ? await put(TECH_FEATURES_KEY, "ko", emptyItemsBlock)
      : { status: 0 };
    const badOverCap = overCapBlock
      ? await put(TECH_FEATURES_KEY, "ko", overCapBlock)
      : { status: 0 };
    const badZeroSections = await put(PATENT_SECTIONS_KEY, "ko", zeroSections);
    const badShortHeader = shortHeader
      ? await put(FT_KEY, "ko", shortHeader)
      : { status: 0 };
    const badLongRow = longRow ? await put(FT_KEY, "ko", longRow) : { status: 0 };

    const afterMalformed = await getJson("/api/admin/registry?group=rnd&locale=ko");
    const malformedTechPage = await pageText("/rnd/technology", "tech-bad");
    const malformedPatentsPage = await pageText("/rnd/patents", "pat-bad");
    const malformedFacilitiesPage = await pageText("/rnd/facilities", "fac-bad");

    section("structuredMalformedPayloads", {
      twoBlocks400: badTwoBlocks.status === 400,
      fourBlocks400: badFourBlocks.status === 400,
      emptyItemsBlock400: badEmptyBlock.status === 400,
      overCap13Items400: badOverCap.status === 400,
      zeroSections400: badZeroSections.status === 400,
      shortHeader400: badShortHeader.status === 400,
      longRow400: badLongRow.status === 400,
      techValueUnchanged: (afterMalformed.values?.[TECH_FEATURES_KEY] ?? "") === baseTechFeaturesVal,
      patentsValueUnchanged: (afterMalformed.values?.[PATENT_SECTIONS_KEY] ?? "") === basePatentSectionsVal,
      facilitiesTableValueUnchanged: (afterMalformed.values?.[FT_KEY] ?? "") === baseFacilitiesTables[FT_KEY],
      bannerValueUnchanged: (afterMalformed.values?.[CANONICAL_BANNER_KEY] ?? "") === baseBannerVal,
      badTechMarkerNotRendered:
        !malformedTechPage.html.includes(BAD_TECH_MARK) &&
        !malformedTechPage.html.includes(BAD_BLOCKS_MARK),
      badTabMarkerNotRendered: !malformedFacilitiesPage.html.includes(BAD_TAB_MARK),
      badPatMarkerNotRendered: !malformedPatentsPage.html.includes(BAD_PAT_MARK),
      uspValueUnchanged: (afterMalformed.values?.[USP_KEY] ?? "") === baseUspVal,
      facilityValueUnchanged: (afterMalformed.values?.[FACILITY_KEY] ?? "") === baseFacilityVal,
    });
  } else {
    report.runtimeSkipped = true;
  }

  /* ------------------------------------------------ D) admin UI smoke */

  const uiPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await uiPage.context().addCookies([{ name: "ecowave_admin", value: sealed, url: BASE }]);
  await uiPage.goto(`${BASE}/admin/content?group=rnd`);
  await uiPage.waitForSelector("button[aria-expanded]", { timeout: 60000 });
  await uiPage.waitForTimeout(1500);

  /** RegistryEditor truncates a section id to `first8…last5` in the accordion subtitle. */
  const truncateSectionId = (id) => (id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-5)}` : id);
  const expandBySection = async (sectionId) => {
    const token = truncateSectionId(sectionId);
    const header = uiPage.locator("button[aria-expanded]", { hasText: token }).first();
    if ((await header.count()) === 0) return false;
    if ((await header.getAttribute("aria-expanded")) !== "true") {
      await header.scrollIntoViewIfNeeded();
      await header.click();
      await uiPage.waitForTimeout(900);
    }
    return true;
  };
  const pause = () => uiPage.waitForTimeout(120);

  /** Live preview pane: `aside` hosting `[data-fac-tabs]`. */
  const previewAside = () => uiPage.locator("aside").first();
  const countPreviewTabs = async () =>
    previewAside().locator("[data-fac-tabs] [aria-pressed]").count();

  /* -- facilities PREVIEW smoke (bug-fix coverage) ----------------------- */
  const previewChecks = {};
  let previewCanDrive = false;
  {
    // 1) section-less facilityTabs def → full-page draft preview.
    const openedTabs = await expandBySection("facilityTabs");
    const asideCount = await previewAside().count();
    previewCanDrive = openedTabs && asideCount > 0;
    if (previewCanDrive) {
      const hasRegion = (await previewAside().locator("[data-fac-tabs]").count()) > 0;
      const tabButtons = await countPreviewTabs();
      const asideHtml = await previewAside().innerHTML();
      previewChecks.facilityTabsDef = {
        dataFacTabs: hasRegion,
        tabButtons,
        tabButtons3: tabButtons === 3,
        noRawTabContent: !asideHtml.includes("tab-content"),
        noRawTabMenu: !asideHtml.includes("tab-menu"),
      };
    } else {
      previewChecks.facilityTabsDef = { skipped: true, openedTabs, asideCount };
    }

    // 2) a `lines` def on the tab section → single-section draft preview.
    const openedTabSection = await expandBySection("s2025081165e9bc78b81eb");
    if (previewCanDrive && openedTabSection) {
      const hasRegion = (await previewAside().locator("[data-fac-tabs]").count()) > 0;
      const tabButtons = await countPreviewTabs();
      const asideHtml = await previewAside().innerHTML();
      previewChecks.tabSectionLinesDef = {
        dataFacTabs: hasRegion,
        tabButtons,
        tabButtons3: tabButtons === 3,
        noRawTabContent: !asideHtml.includes("tab-content"),
        noRawTabMenu: !asideHtml.includes("tab-menu"),
      };
    } else {
      previewChecks.tabSectionLinesDef = { skipped: true, openedTabSection, previewCanDrive };
    }
  }
  if (!previewCanDrive) {
    blockers.push(
      "facilities preview pane could not be driven (no aside / accordion did not expand); preview smoke skipped",
    );
  }
  section("adminFacilitiesPreview", previewChecks);

  /* -- facilityTabs (pre-existing editor coverage) ----------------------- */
  await expandBySection("facilityTabs");
  const editor = uiPage.locator('[data-testid="facility-tabs-editor"]').first();
  const editorCount = await uiPage.locator('[data-testid="facility-tabs-editor"]').count();
  const has = async (testid, scope = editor) => (await scope.locator(`[data-testid="${testid}"]`).count()) > 0;

  const nameShown = await has("facility-tab-name");
  const addBtn = editor.locator('[data-testid="facility-tab-add"]').first();
  const addShown = (await addBtn.count()) > 0;
  const removeShown = await has("facility-tab-remove");
  const moveUpShown = await has("facility-tab-move-up");
  const moveDownShown = await has("facility-tab-move-down");
  const imageShown = await has("facility-tab-image");
  const imageAddShown = await has("facility-tab-image-add");
  const imageRemoveShown = await has("facility-tab-image-remove");
  const imageMoveUpShown = await has("facility-tab-image-move-up");
  const imageMoveDownShown = await has("facility-tab-image-move-down");

  const tabCount = async () => editor.locator('[data-testid="facility-tab"]').count();
  const addDisabled = async () => addBtn.isDisabled();
  const firstRemoveDisabled = async () =>
    editor.locator('[data-testid="facility-tab-remove"]').first().isDisabled();

  const startCount = await tabCount();
  const addDisabledAt3 = await addDisabled();
  const removeEnabledAt3 = !(await firstRemoveDisabled());

  await editor.locator('[data-testid="facility-tab-remove"]').first().click();
  await uiPage.waitForTimeout(250);
  const afterRemove2 = await tabCount();
  await editor.locator('[data-testid="facility-tab-remove"]').first().click();
  await uiPage.waitForTimeout(250);
  const afterRemove1 = await tabCount();
  const removeDisabledAt1 = await firstRemoveDisabled();
  await addBtn.click();
  await uiPage.waitForTimeout(250);
  const afterAdd2 = await tabCount();
  await addBtn.click();
  await uiPage.waitForTimeout(250);
  const afterAdd3 = await tabCount();
  const addDisabledAt3Again = await addDisabled();

  section("adminUi", {
    editorCount,
    editorShown: editorCount > 0,
    nameShown,
    addShown,
    removeShown,
    moveUpShown,
    moveDownShown,
    imageShown,
    imageAddShown,
    imageRemoveShown,
    imageMoveUpShown,
    imageMoveDownShown,
    startCount,
    startCount3: startCount === 3,
    addDisabledAt3,
    removeEnabledAt3,
    afterRemove2,
    afterRemove2Is2: afterRemove2 === 2,
    afterRemove1,
    afterRemove1Is1: afterRemove1 === 1,
    removeDisabledAt1,
    afterAdd2,
    afterAdd2Is2: afterAdd2 === 2,
    afterAdd3,
    afterAdd3Is3: afterAdd3 === 3,
    addDisabledAt3Again,
  });

  /* -- techFeatures editor: THREE fixed groups per locale, item testids nested -- */
  const techHeaderFound = await expandBySection("s202509091799d895b62ea");
  const blockLoc = uiPage.locator('[data-testid="tech-feature-block"]');
  const blockCount = await blockLoc.count();
  const techEditorCount = await uiPage.locator('[data-testid="tech-features-editor"]').count();
  // The editor renders once per content locale (ko + en), so 6 blocks total.
  const block0 = blockLoc.nth(0);
  const block1 = blockLoc.nth(1);
  const block2 = blockLoc.nth(2);
  const block3 = blockLoc.nth(3);
  const block4 = blockLoc.nth(4);
  const block5 = blockLoc.nth(5);

  const blockHas = async (scope, tid) =>
    (await scope.locator(`[data-testid="${tid}"]`).count()) > 0;
  const techTestids = {
    editor: await blockHas(block0, "tech-features-editor"),
    card: await blockHas(block0, "tech-feature-card"),
    moveUp: await blockHas(block0, "tech-feature-move-up"),
    moveDown: await blockHas(block0, "tech-feature-move-down"),
    remove: await blockHas(block0, "tech-feature-remove"),
    image: await blockHas(block0, "tech-feature-image"),
    heading: await blockHas(block0, "tech-feature-heading"),
    row: await blockHas(block0, "tech-feature-row"),
    rowMoveUp: await blockHas(block0, "tech-feature-row-move-up"),
    rowMoveDown: await blockHas(block0, "tech-feature-row-move-down"),
    rowRemove: await blockHas(block0, "tech-feature-row-remove"),
    rowLabel: await blockHas(block0, "tech-feature-row-label"),
    rowBody: await blockHas(block0, "tech-feature-row-body"),
    rowAdd: await blockHas(block0, "tech-feature-row-add"),
    add: await blockHas(block0, "tech-feature-add"),
  };

  const cardsIn = (scope) => scope.locator('[data-testid="tech-feature-card"]');
  const koCounts = [await cardsIn(block0).count(), await cardsIn(block1).count(), await cardsIn(block2).count()];
  const enCounts = [await cardsIn(block3).count(), await cardsIn(block4).count(), await cardsIn(block5).count()];
  const defaultCardsOk = arraysEqual(koCounts, [1, 2, 2]) && arraysEqual(enCounts, [1, 2, 2]);

  const techAdd0 = block0.locator('[data-testid="tech-feature-add"]').first();
  const techAddEnabled = (await techAdd0.count()) > 0 && !(await techAdd0.isDisabled());
  const totalCardsBefore =
    koCounts[0] + koCounts[1] + koCounts[2] + enCounts[0] + enCounts[1] + enCounts[2];

  // Payload round-trip: one add must survive the editor's own re-serialization.
  // (The v2 contract is `{ blocks: [{ items: [...] }] }`; a block written as a
  // bare item array parses back to zero items and vanishes.)
  let editRetainsItems = false;
  let afterAddKo0 = koCounts[0];
  let afterAddTotal = totalCardsBefore;
  if (techAddEnabled) {
    await techAdd0.click();
    await pause();
    afterAddKo0 = await cardsIn(block0).count();
    afterAddTotal = await uiPage.locator('[data-testid="tech-feature-card"]').count();
    editRetainsItems = afterAddKo0 === koCounts[0] + 1 && afterAddTotal === totalCardsBefore + 1;
  }

  const techUi = {
    techHeaderFound,
    blockCount,
    blockCountIs6: blockCount === 6,
    techEditorCount,
    techEditorCountIs6: techEditorCount === 6,
    koItemCounts: koCounts,
    enItemCounts: enCounts,
    defaultCardsOk,
    ...Object.fromEntries(Object.entries(techTestids).map(([k, v]) => [`has:${k}`, v])),
    techAddEnabled,
    editRetainsItems,
    afterAddKo0,
    afterAddTotal,
  };

  if (editRetainsItems) {
    // Cap the §4 group at 12 items.
    let techCapped = afterAddKo0;
    for (let i = 0; i < 12 - afterAddKo0; i += 1) {
      if (await techAdd0.isDisabled()) break;
      await techAdd0.click();
      await pause();
      techCapped = await cardsIn(block0).count();
    }
    techUi.techCapped = techCapped;
    techUi.techCappedIs12 = techCapped === 12;
    techUi.techAddDisabledAt12 = await techAdd0.isDisabled();
    // Other blocks are untouched by adding to block 0.
    techUi.otherBlocksUnchanged =
      (await cardsIn(block1).count()) === koCounts[1] && (await cardsIn(block2).count()) === koCounts[2];
    // Remove one item → 11, remove still enabled.
    const techRemove0 = block0.locator('[data-testid="tech-feature-remove"]').first();
    await techRemove0.click();
    await pause();
    techUi.techAfterRemove11 = await cardsIn(block0).count();
    techUi.techAfterRemove11Is11 = techUi.techAfterRemove11 === 11;
    techUi.techRemoveEnabledAt11 = !(await techRemove0.isDisabled());
    // Row floor: remove rows down to 1, remove disables.
    const rowRemove0 = block0.locator('[data-testid="tech-feature-row-remove"]').first();
    let techRowsNow = await block0.locator('[data-testid="tech-feature-row"]').count();
    let guard = 0;
    while (techRowsNow > 1 && guard < 40) {
      if (await rowRemove0.isDisabled()) break;
      await rowRemove0.click();
      await pause();
      techRowsNow = await block0.locator('[data-testid="tech-feature-row"]').count();
      guard += 1;
    }
    techUi.techRowsNow = techRowsNow;
    techUi.techRowRemoveDisabledAt1 = await rowRemove0.isDisabled();
    techUi.techRowAddEnabled = !(await block0
      .locator('[data-testid="tech-feature-row-add"]')
      .first()
      .isDisabled());
  } else {
    // DEFECT: the first edit does not round-trip, so the cap/floor controls
    // cannot be exercised (every block re-renders empty).
    techUi.capsExercised = false;
    techUi.serializationDefect =
      `first add did not survive re-serialization: KO §4 cards ${koCounts[0]}→${afterAddKo0}, ` +
      `page total ${totalCardsBefore}→${afterAddTotal}`;
  }

  section("adminTechFeaturesUi", techUi);

  /* -- patentSections editor --------------------------------------------- */
  const psHeaderFound = await expandBySection("s202508114d9bc90ceb876");
  const psEditor = uiPage.locator('[data-testid="patent-sections-editor"]').first();
  const psEditorCount = await uiPage.locator('[data-testid="patent-sections-editor"]').count();
  const psHas = async (tid) =>
    (await psEditor.locator(`[data-testid="${tid}"]`).count()) > 0;
  const psCardCount = () => psEditor.locator('[data-testid="patent-section-card"]').count();
  const psRemoveBtn = () => psEditor.locator('[data-testid="patent-section-remove"]').first();
  const psAddBtn = psEditor.locator('[data-testid="patent-section-add"]').first();

  const psTestids = {
    editor: psEditorCount > 0,
    card: await psHas("patent-section-card"),
    moveUp: await psHas("patent-section-move-up"),
    moveDown: await psHas("patent-section-move-down"),
    remove: await psHas("patent-section-remove"),
    title: await psHas("patent-section-title"),
    item: await psHas("patent-section-item"),
    itemMoveUp: await psHas("patent-section-item-move-up"),
    itemMoveDown: await psHas("patent-section-item-move-down"),
    itemRemove: await psHas("patent-section-item-remove"),
    itemImage: await psHas("patent-section-item-image"),
    itemCaption: await psHas("patent-section-item-caption"),
    itemAdd: await psHas("patent-section-item-add"),
    add: await psHas("patent-section-add"),
  };
  const psStartSections = await psCardCount();
  const psAddEnabled = !(await psAddBtn.isDisabled());
  let psCapped = psStartSections;
  for (let i = 0; i < 12 - psStartSections; i += 1) {
    if (await psAddBtn.isDisabled()) break;
    await psAddBtn.click();
    await pause();
    psCapped = await psCardCount();
  }
  const psAddDisabledAt12 = await psAddBtn.isDisabled();
  const psCappedIs12 = psCapped === 12;
  await psRemoveBtn().click();
  await pause();
  const psAfterRemove11 = await psCardCount();
  const psRemoveEnabledAt11 = !(await psRemoveBtn().isDisabled());
  const psItemAddEnabled = !(await psEditor.locator('[data-testid="patent-section-item-add"]').first().isDisabled());

  section("adminPatentSectionsUi", {
    psHeaderFound,
    psEditorCount,
    psEditorShown: psEditorCount > 0,
    ...Object.fromEntries(Object.entries(psTestids).map(([k, v]) => [`has:${k}`, v])),
    psStartSections,
    psStartSections3: psStartSections === 3,
    psAddEnabled,
    psCapped,
    psCappedIs12,
    psAddDisabledAt12,
    psAfterRemove11,
    psAfterRemove11Is11: psAfterRemove11 === 11,
    psRemoveEnabledAt11,
    psItemAddEnabled,
  });

  /* -- facilitiesTable editor -------------------------------------------- */
  const ftHeaderFound = await expandBySection("s20250829c25afe324e195");
  const ftEditor = uiPage.locator('[data-testid="facilities-table-editor"]').first();
  const ftEditorCount = await uiPage.locator('[data-testid="facilities-table-editor"]').count();
  const ftHas = async (tid) =>
    (await ftEditor.locator(`[data-testid="${tid}"]`).count()) > 0;
  const ftRowCount = () => ftEditor.locator('[data-testid="facilities-table-row"]').count();
  const ftRemoveBtn = () => ftEditor.locator('[data-testid="facilities-table-row-remove"]').first();
  const ftAddBtn = () => ftEditor.locator('[data-testid="facilities-table-row-add"]').first();

  const ftTestids = {
    editor: ftEditorCount > 0,
    header1: await ftHas("facilities-table-header-1"),
    header2: await ftHas("facilities-table-header-2"),
    row: await ftHas("facilities-table-row"),
    rowMoveUp: await ftHas("facilities-table-row-move-up"),
    rowMoveDown: await ftHas("facilities-table-row-move-down"),
    rowRemove: await ftHas("facilities-table-row-remove"),
    cell1: await ftHas("facilities-table-cell-1"),
    cell2: await ftHas("facilities-table-cell-2"),
    rowAdd: await ftHas("facilities-table-row-add"),
  };
  const ftStartRows = await ftRowCount();
  const ftAddEnabled = !(await ftAddBtn().isDisabled());
  await ftAddBtn().click();
  await pause();
  const ftAfterAdd = await ftRowCount();
  await ftRemoveBtn().click();
  await pause();
  const ftAfterRemoveBack = await ftRowCount();
  let ftRowsNow = ftAfterRemoveBack;
  let ftGuard = 0;
  while (ftRowsNow > 1 && ftGuard < 110) {
    if (await ftRemoveBtn().isDisabled()) break;
    await ftRemoveBtn().click();
    await pause();
    ftRowsNow = await ftRowCount();
    ftGuard += 1;
  }
  const ftRowRemoveDisabledAt1 = await ftRemoveBtn().isDisabled();
  await ftAddBtn().click();
  await pause();
  const ftAfterAddBack = await ftRowCount();

  section("adminFacilitiesTableUi", {
    ftHeaderFound,
    ftEditorCount,
    ftEditorShown: ftEditorCount > 0,
    ...Object.fromEntries(Object.entries(ftTestids).map(([k, v]) => [`has:${k}`, v])),
    ftStartRows,
    ftStartRowsIs6: ftStartRows === 6,
    ftAddEnabled,
    ftAfterAdd,
    ftAfterAddIs7: ftAfterAdd === 7,
    ftAfterRemoveBack,
    ftAfterRemoveBackIs6: ftAfterRemoveBack === 6,
    ftRowsNow,
    ftRowRemoveDisabledAt1,
    ftAfterAddBack,
    ftAfterAddBackIs2: ftAfterAddBack === 2,
  });
  await uiPage.close();

  /* --------------------------------------------------- E) no residue */

  const finalKo = await getJson("/api/admin/registry?group=rnd&locale=ko");
  const finalTech = await pageText("/rnd/technology", "final-tech");
  const finalPatents = await pageText("/rnd/patents", "final-pat");
  const finalFacilities = await pageText("/rnd/facilities", "final-fac");

  const allMarks = [
    TECH_B2_HEAD_MARK,
    TECH_B2_ROW_MARK,
    TECH_B2_ITEM_MARK,
    TECH_B3_HEAD_MARK,
    BANNER_MARK,
    PATSEC_TITLE_MARK,
    PATSEC_CAP_MARK,
    TABLE_HEAD_MARK,
    TABLE_ROW_MARK,
    BAD_TECH_MARK,
    BAD_BLOCKS_MARK,
    BAD_TAB_MARK,
    `E2E-RND-FAC-${STAMP}`,
  ];
  const noMarkers = [finalTech, finalPatents, finalFacilities].every(
    (p) => !allMarks.some((m) => p.html.includes(m)),
  );
  section("residue", {
    noMarkers,
    uspValueRestored: (finalKo.values?.[USP_KEY] ?? "") === baseUspVal,
    facilityValueRestored: (finalKo.values?.[FACILITY_KEY] ?? "") === baseFacilityVal,
    bannerValueRestored: (finalKo.values?.[CANONICAL_BANNER_KEY] ?? "") === baseBannerVal,
    techFeaturesValueRestored: (finalKo.values?.[TECH_FEATURES_KEY] ?? "") === baseTechFeaturesVal,
    patentsValueRestored: (finalKo.values?.[PATENT_SECTIONS_KEY] ?? "") === basePatentSectionsVal,
    facilitiesTablesRestored: FACILITIES_TABLE_KEYS.every(
      (k) => (finalKo.values?.[k] ?? "") === baseFacilitiesTables[k],
    ),
    dbConfiguredStill: finalKo.dbConfigured === true,
    uspDefaultImagesPresent: uspBase
      ? uspBase.every((it) => finalTech.html.includes(it.image))
      : false,
  });
} catch (e) {
  report.error = String((e && e.stack) || e).slice(0, 900);
  pass = false;
} finally {
  try { await revertAll(); } catch {}
  try { if (browser) await browser.close(); } catch {}
  killDev();
  if (blockers.length > 0) {
    report.blockers = blockers;
    pass = false;
  }
  report.pass = pass;
  report.devLogTail = pass ? undefined : devLog.slice(-1200);
  try {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 1));
  } catch (e) {
    report.reportWriteError = String(e).slice(0, 200);
  }
  console.log(JSON.stringify({ pass, blockers, report }, null, 1));
}
process.exit(pass ? 0 : 1);
