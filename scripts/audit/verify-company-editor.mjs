/**
 * One-shot runtime verification for the company registry + structured media editor.
 *
 *   A) registry shape: `company.global` exposes exactly ONE `locations` def
 *      whose default payload is `[HQ, China, Cambodia]` (item 0 carries the HQ
 *      contacts). The HQ name/contacts/map per-widget keys are gone and there
 *      are NO `iframe[n].src`/`embed` defs at all; the branch widgets are
 *      covered by the `locations` def. `company.about` exposes the 4 structured
 *      `gallery` defs (blocks 3/4/6/7, per-block field config + caps) and the
 *      one `aboutCards` def (block 5, all fields, no cap). The old nested-image
 *      keys are gone: no `/items[n].(title|desc|org|thumb)` defs and no
 *      `img[0].src` pin defs on the about page (the 3 block-8 pins are
 *      suppressed; only the world-map `src` image remains). Cross-checked
 *      against the crawled content (widget ids) and `lib/content/registry.ts`
 *      (keys), never a hard-coded def count.
 *   C) structured gallery round-trips:
 *      - block 3: append an item (marker title) → `/company/about` renders the
 *        marker, `/en/company/about` does NOT → revert → item count + first
 *        `org` back to baseline
 *      - block 6: append an image-only item (marker path) → renders → revert
 *   D) EN pairing fix: PUT `company.about#…/w20250918684332dc780e7/html` for
 *      `en` → `/en/company/about` renders it → revert
 *   G) shared intro propagation: PUT `company.ceo#…/w20250820e1c08ac226481/html`
 *      (`lines`) → the marker renders on all 7 `/company*` routes for that locale
 *      but not the other locale → the EN marker likewise on all 7 `/en/company*`
 *      → revert both → baseline copy is back
 *   H) structured `eras`: append a 4th era (unique marker) → `/company/history`
 *      renders the marker and one more year head → revert → baseline restored
 *   I) structured `locations`: baseline is 3 (HQ, China, Cambodia); PUT a
 *      payload that sets item 0 `phone`/`fax`/`email` + `mapSrc` markers and
 *      appends a 4th branch with contact markers → all markers render on
 *      `/company/global`, none leak to `/en/company/global`; 3 branches wrap as
 *      TWO container rows ([6,6] then lone [12]) in item order → revert →
 *      baseline restored (3 items, HQ contacts, 2 branches, ONE row of 2×6, no
 *      branch contact block)
 *   J) malformed `eras`/`locations` payloads (`not json`, `[]`) → HTTP 400 and
 *      nothing persisted
 *   J2) malformed `gallery`/`aboutCards` payloads (`not json`, `[]`) → HTTP 400
 *      and the effective values are untouched
 *   K) structured editor smoke: the history accordion renders `era-add`, the
 *      global accordion renders `location-add`
 *   L) gallery editor smoke: block 3's section renders `gallery-add` +
 *      `gallery-title` (no `gallery-desc`); block 4's section renders
 *      `gallery-add` and no title input (image-only config)
 *   E) admin UI smoke: open the company group and expand the global locations
 *      section; assert `location-phone`/`location-fax`/`location-email` inputs
 *      render and the locked HQ card (item 0) has no remove control while the
 *      second card does
 *   F) after every revert: no marker residue, effective values back to baseline,
 *      pages back to the crawled defaults for the touched fields
 *
 * Uses dev port 3126 (home editor uses 3124, prod 4517) so it can never clash.
 * Cleans up every override it writes. Prints one JSON report.
 * Usage: node scripts/audit/verify-company-editor.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import fs from "node:fs";
import { chromium } from "playwright-core";
import { sealData } from "iron-session";
import { config as dotenvConfig } from "dotenv";

dotenvConfig({ path: [".env.local"], quiet: true });

const PORT = 3126;
const BASE = `http://127.0.0.1:${PORT}`;
const STAMP = Date.now();
const EN_MARK = `E2E-EN-PAIR-${STAMP}`;
// Shared intro markers (plain text injected into the `lines` def, per locale).
const SHARED_KO_MARK = `E2E-SHARED-KO-${STAMP}`;
const SHARED_EN_MARK = `E2E-SHARED-EN-${STAMP}`;

const GLOBAL_PAGE = "company.global";
const ABOUT_PAGE = "company.about";
// EN pairing regression key: before the fix this KO-keyed def is dropped for EN
// (a decorative padding widget shifts the positional KO↔EN widget alignment).
const EN_PAIR_KEY = "company.about#s20250811457daf6e58a2c/w20250918684332dc780e7/html";
// Shared company-intro def: canonical on `company.ceo`, rendered on every
// `/company*` page of the locale (the root `company` key is an alias).
const SHARED_KEY = "company.ceo#s202508206321c39177601/w20250820e1c08ac226481/html";
// Structured kinds (WS2): one `eras` def anchored at the first history era
// section; one `locations` def anchored at the global branches section.
const ERAS_KEY = "company.history#s20250811d0a0980d730fb/eras/eras";
const LOCATIONS_KEY = "company.global#s202508286e01c87027ecf/locations/locations";
const ERAS_ANCHOR_SECTION = "s20250811d0a0980d730fb";
const LOCATIONS_ANCHOR_SECTION = "s202508286e01c87027ecf";
const ERAS_MARK = `E2E-ERAS-${STAMP}`;
const LOCATIONS_MARK = `E2E-LOC-${STAMP}`;
// Upgraded `locations` payload: item 0 = HQ (contacts + map marker), plus a 4th
// branch with contacts. `LOC_MAP_MARK` is a valid media path (the applier writes
// it into the HQ map iframe via `replaceNthSrc`, so any valid value proves it).
const LOC_PHONE_MARK = `E2E-LOC-PHONE-${STAMP}`;
const LOC_FAX_MARK = `E2E-LOC-FAX-${STAMP}`;
const LOC_EMAIL_MARK = `E2E-LOC-EMAIL-${STAMP}`;
const LOC_MAP_MARK = `/.e2e/map-${STAMP}.png`;
const LOC_BRANCH_PHONE_MARK = `E2E-LOC-BPHONE-${STAMP}`;
// Structured media (WS-B): the 4 gallery blocks + the block-5 card list.
const G3 = {
  key: "company.about#s202508119a2e8fe21b47a/w20250918692bb854e97af/gallery",
  sectionId: "s202508119a2e8fe21b47a",
  widgetId: "w20250918692bb854e97af",
  fields: ["image", "title"],
  maxItems: undefined,
};
const G4 = {
  key: "company.about#s20250918c54b2950e2f1a/w2025091858b5ee5de7c2a/gallery",
  sectionId: "s20250918c54b2950e2f1a",
  widgetId: "w2025091858b5ee5de7c2a",
  fields: ["image"],
  maxItems: 5,
};
const G6 = {
  key: "company.about#s20250918ab81858502f9e/w20250918b0ab58de4000e/gallery",
  sectionId: "s20250918ab81858502f9e",
  widgetId: "w20250918b0ab58de4000e",
  fields: ["image"],
  maxItems: undefined,
};
const G7 = {
  key: "company.about#s20250918ffd77075d76ea/w202509190fd35e33e86f8/gallery",
  sectionId: "s20250918ffd77075d76ea",
  widgetId: "w202509190fd35e33e86f8",
  fields: ["image", "title", "desc"],
  maxItems: 6,
};
const GALLERY_BLOCKS = [G3, G4, G6, G7];
const CARDS = {
  key: "company.about#s20250918c5a18b62c8acd/aboutCards/aboutCards",
  sectionId: "s20250918c5a18b62c8acd",
  widgetId: "aboutCards",
};
// Block 8 (locations) keeps only the world-map `src` image; the 3 inline pin
// images are suppressed and the 3 text widgets stay editable.
const BLOCK8_SECTION = "s202509180d5f2b5ede2b3";
const BLOCK8_MAP_KEY = "company.about#s202509180d5f2b5ede2b3/w20250918c7cf1698ddcc4/src";
// The 7 company routes the shared intro propagates to (per locale).
const COMPANY_ROUTES = [
  "/company",
  "/company/ceo",
  "/company/about",
  "/company/philosophy",
  "/company/history",
  "/company/organization",
  "/company/global",
];

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

const report = {};
let pass = true;
const section = (name, data) => {
  const ok = Object.values(data).every((v) => v !== false);
  report[name] = { ...data, pass: ok };
  if (!ok) pass = false;
};

/* -------------------------------------------------- crawled content helpers */

const readPage = (locale, pageKey) =>
  JSON.parse(fs.readFileSync(`content/${locale}/pages/${pageKey}.json`, "utf8"));

/** Rows → cols → children, then aside (mirrors `sectionWidgets` in lib). */
function collectWidgets(nodes, out) {
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    if (node.kind === "widget") out.push(node);
    else if (node.kind === "col") collectWidgets(node.children, out);
    else if (node.kind === "row") for (const col of node.cols ?? []) collectWidgets(col.children, out);
  }
}
function sectionWidgets(section) {
  const out = [];
  collectWidgets(section.rows, out);
  if (section.aside) collectWidgets(section.aside.items, out);
  return out;
}

/** Text widgets whose authored html holds `<tag …>` (iframe/img), page-wide. */
function widgetsWithTag(page, tag) {
  const re = new RegExp(`<${tag}\\b`, "i");
  const out = [];
  for (const section of page.sections ?? []) {
    for (const widget of sectionWidgets(section)) {
      if (widget.type === "text" && typeof widget.html === "string" && re.test(widget.html)) {
        out.push({ sectionId: section.id, widgetId: widget.id, html: widget.html });
      }
    }
  }
  return out;
}

/** Raw `src` of the first `<tag>` in a widget's html ("" when absent). */
function firstTagSrc(html, tag) {
  const m = new RegExp(`<${tag}\\b[^>]*?\\bsrc\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(html);
  return m ? (m[2] ?? m[3] ?? "") : "";
}

/** `s20250828182272ec01906` → `s20250828…1906` (mirrors the editor header). */
function truncateSectionId(id) {
  return id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-5)}` : id;
}

/** Parse a JSON array payload; `null` when malformed/non-array. */
function parseArrayPayload(json) {
  try {
    const value = JSON.parse(json);
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/** Balanced `<div>` slice starting at `start` ("" when unbalanced). */
function sliceDiv(html, start) {
  if (!html.startsWith("<div", start)) return "";
  const re = /<\/?div\b[^>]*>/gi;
  re.lastIndex = start;
  let depth = 0;
  let m;
  while ((m = re.exec(html))) {
    if (m[0][1] === "/") {
      depth -= 1;
      if (depth === 0) return html.slice(start, m.index + m[0].length);
    } else {
      depth += 1;
    }
  }
  return "";
}

/**
 * The company.global branch container rows rendered in `html`, in order: each
 * carries the authored `--row-h:658px` (clones keep it) and direct
 * `imweb-col` children. Returns `[{ spans: number[], html }]` where `spans` are
 * the direct children's `lg:col-span-*` values (2 cols → [6,6]; lone → [12]).
 */
function containerRowShapes(html) {
  const out = [];
  // Order-independent attribute match: a row div carrying imweb-row + the
  // authored container height.
  const openRe = /<div(?=[^>]*class="imweb-row)(?=[^>]*--row-h:\s*658px)[^>]*>/gi;
  let m;
  while ((m = openRe.exec(html))) {
    const outer = sliceDiv(html, m.index);
    if (!outer) continue;
    const spans = [];
    const tagRe = /<\/?div\b[^>]*>/gi;
    tagRe.lastIndex = m[0].length; // skip the row's own opening tag
    let depth = 0;
    let t;
    while ((t = tagRe.exec(outer))) {
      const tag = t[0];
      if (tag[1] === "/") {
        depth -= 1;
        if (depth < 0) break;
      } else {
        if (depth === 0) {
          const cls = /class="([^"]*)"/i.exec(tag);
          if (cls && /(?:^|\s)imweb-col(?:\s|$)/.test(cls[1])) {
            const span = /lg:col-span-(\d+)/i.exec(cls[1]);
            if (span) spans.push(Number(span[1]));
          }
        }
        depth += 1;
      }
    }
    out.push({ spans, html: outer });
  }
  return out;
}

let browser;
try {
  const ready = await waitReady();
  if (!ready) {
    console.log(JSON.stringify({ devReady: false, devLog: devLog.slice(-1500) }, null, 1));
    killDev();
    process.exit(1);
  }

  const sealed = await sealData(
    { admin: { email: process.env.ADMIN_EMAIL ?? "admin", loggedInAt: Date.now() } },
    { password: process.env.SESSION_SECRET ?? "", ttl: 60 * 60 * 24 * 30 },
  );
  const cookie = `ecowave_admin=${sealed}`;

  const getJson = async (path) => {
    const res = await fetch(`${BASE}${path}`, { headers: { Cookie: cookie } });
    if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
    return res.json();
  };
  const pageText = async (path) => fetch(`${BASE}${path}`).then((r) => r.text());

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
  const revertAll = async () => {
    for (const entry of [...dirty]) {
      const split = entry.indexOf("\u0000");
      try { await revert(entry.slice(0, split), entry.slice(split + 1)); } catch {}
    }
  };

  /* ------------------------------------------------------- discovered inputs */

  const globalKo = readPage("ko", GLOBAL_PAGE);
  const globalEn = readPage("en", GLOBAL_PAGE);
  const aboutKo = readPage("ko", ABOUT_PAGE);

  const iframeKo = widgetsWithTag(globalKo, "iframe");
  const iframeEn = widgetsWithTag(globalEn, "iframe");

  // The HQ map iframe: item 0 of the `locations` payload (no per-widget def).
  const hqMapWidget = iframeKo[0] ?? null;
  const baselineHqMapSrc = hqMapWidget ? firstTagSrc(hqMapWidget.html, "iframe") : "";

  // The registry group is a coarse bucket ("company"); company.global is a
  // pageKey within it, not a group — derive the real group from the API.
  const companyKo = await getJson("/api/admin/registry?group=company&locale=ko");
  const companyEn = await getJson("/api/admin/registry?group=company&locale=en");
  const companyDefs = companyKo.defs ?? [];
  const adminGroup = companyDefs.find((d) => d.pageKey === GLOBAL_PAGE)?.group ?? "company";

  const iframeDefs = companyDefs.filter(
    (d) => d.pageKey === GLOBAL_PAGE && /^iframe\[\d+\]\.src$/.test(d.field),
  );
  const embedDefs = companyDefs.filter((d) => d.kind === "embed");
  const aboutDefs = companyDefs.filter((d) => d.pageKey === ABOUT_PAGE);
  const registrySrc = fs.readFileSync("lib/content/registry.ts", "utf8");

  // Baseline effective values, captured before any write (an absent key is "").
  const baselineEn = companyEn.values?.[EN_PAIR_KEY] ?? "";
  const baselineSharedKo = companyKo.values?.[SHARED_KEY] ?? "";
  const baselineEras = companyKo.values?.[ERAS_KEY] ?? "";
  const baselineLocations = companyKo.values?.[LOCATIONS_KEY] ?? "";
  const baselineG3 = companyKo.values?.[G3.key] ?? "";
  const baselineG6 = companyKo.values?.[G6.key] ?? "";
  const baselineCards = companyKo.values?.[CARDS.key] ?? "";
  const baselineBlock8Map = companyKo.values?.[BLOCK8_MAP_KEY] ?? "";

  // Upgraded `locations` default (no override at baseline): [HQ, China, Cambodia].
  const locationsBase = parseArrayPayload(baselineLocations);
  const locationsBaseThree = locationsBase !== null && locationsBase.length === 3;
  const locationsHqContacts = Boolean(
    locationsBase?.[0]?.phone && locationsBase?.[0]?.fax && locationsBase?.[0]?.email,
  );
  const locationsBranchCount = locationsBase ? locationsBase.length - 1 : -1;
  const locationsBranchesMapped =
    locationsBase !== null &&
    locationsBase
      .slice(1)
      .every(
        (item) => typeof item?.mapSrc === "string" && item.mapSrc.includes("/maps/embed"),
      );

  /* --------------------------------------------------- A) registry shape */

  // Upgraded company.global: the HQ map/name/contacts widgets no longer emit
  // per-widget defs — they are folded into the ONE `locations` def (item 0), so
  // there are no `iframe[n].src`/`embed` defs at all.
  const branchIframes = iframeKo.slice(1);
  const hqSectionId = hqMapWidget ? hqMapWidget.sectionId : null;
  const iframeDefsAbsent = iframeDefs.length === 0;
  const embedDefsAbsent = embedDefs.length === 0;
  const hqSectionDefs = hqSectionId
    ? companyDefs.filter((d) => d.pageKey === GLOBAL_PAGE && d.sectionId === hqSectionId)
    : [];
  const hqSectionDefsAbsent = hqSectionDefs.length === 0;
  const branchSectionDefs = companyDefs.filter(
    (d) => d.pageKey === GLOBAL_PAGE && d.sectionId === LOCATIONS_ANCHOR_SECTION,
  );
  const branchesCoveredByLocations =
    branchSectionDefs.length === 1 && branchSectionDefs[0].key === LOCATIONS_KEY;
  const branchIframesStillAuthored = branchIframes.length === 2;

  // Structured kinds (WS2): `eras`/`locations` cover the superseded per-widget
  // history/branch fields, so those widgets keep no `iframe[0].src`/`html` defs.
  const erasDef = companyDefs.find((d) => d.key === ERAS_KEY) ?? null;
  const locationsDef = companyDefs.find((d) => d.key === LOCATIONS_KEY) ?? null;
  const structuredDefsOk =
    erasDef?.kind === "eras" &&
    erasDef?.widgetId === "eras" &&
    erasDef?.pageKey === "company.history" &&
    locationsDef?.kind === "locations" &&
    locationsDef?.widgetId === "locations" &&
    locationsDef?.pageKey === "company.global";

  // Structured media (WS-B): exactly the 4 gallery defs + 1 aboutCards def.
  const galleryDefs = companyDefs.filter((d) => d.kind === "gallery");
  const galleryByKey = new Map(galleryDefs.map((d) => [d.key, d]));
  const galleriesOk = GALLERY_BLOCKS.every((exp) => {
    const d = galleryByKey.get(exp.key);
    return (
      Boolean(d) &&
      d.kind === "gallery" &&
      d.pageKey === ABOUT_PAGE &&
      d.sectionId === exp.sectionId &&
      d.widgetId === exp.widgetId &&
      JSON.stringify(d.gallery?.fields ?? []) === JSON.stringify(exp.fields) &&
      (d.gallery?.maxItems ?? undefined) === exp.maxItems
    );
  });
  const galleryDefCountOk = galleryDefs.length === 4;
  const cardsDef = companyDefs.find((d) => d.kind === "aboutCards") ?? null;
  const cardsOk =
    Boolean(cardsDef) &&
    cardsDef.pageKey === ABOUT_PAGE &&
    cardsDef.sectionId === CARDS.sectionId &&
    cardsDef.widgetId === CARDS.widgetId &&
    !cardsDef.gallery;

  // Superseded keys: no per-item media defs, no nested-img pin defs on about.
  const oldItemDefs = aboutDefs.filter((d) => /^items\[\d+\]\.(title|desc|org|thumb)$/.test(d.field));
  const oldItemKeysAbsent = oldItemDefs.length === 0;
  const aboutNestedImgDefs = aboutDefs.filter((d) => /^img\[\d+\]\.src$/.test(d.field));
  const pinImgKeysAbsent = aboutNestedImgDefs.length === 0;

  // Block 8 world-map image remains (only the inline pins are suppressed).
  const block8MapDef = companyDefs.find((d) => d.key === BLOCK8_MAP_KEY) ?? null;
  const block8MapOk =
    block8MapDef?.kind === "image" &&
    block8MapDef?.pageKey === ABOUT_PAGE &&
    block8MapDef?.sectionId === BLOCK8_SECTION;

  // Runtime grep of the generated registry source (not a hard-coded count): the
  // HQ map/name/contacts keys are gone and no global `iframe[n].src` key exists.
  const registryGalleryKeys = GALLERY_BLOCKS.every((b) => registrySrc.includes(b.key));
  const registryHasCardsKey = registrySrc.includes(CARDS.key);
  const registryNoAboutOldItemKeys =
    !/company\.about#[^"]*\/items\[\d+\]\.(title|desc|org|thumb)"/.test(registrySrc);
  const registryNoAboutNestedImg = !/company\.about#[^"]*\/img\[\d+\]\.src"/.test(registrySrc);
  const registryNoGlobalIframeKeys =
    !/company\.global#[^"]*\/iframe\[\d+\]\.src"/.test(registrySrc);
  const registryNoHqKeys = hqSectionId ? !registrySrc.includes(hqSectionId) : false;
  const registrySourceKeys =
    registryNoGlobalIframeKeys &&
    registryNoHqKeys &&
    registrySrc.includes(ERAS_KEY) &&
    registrySrc.includes(LOCATIONS_KEY) &&
    registryGalleryKeys &&
    registryHasCardsKey &&
    registryNoAboutOldItemKeys &&
    registryNoAboutNestedImg;
  // The company group must show the six real subpages in nav order and never the
  // aliased root `company` pageKey (WS1). Derived from the API, not hard-coded.
  const companyPageKeys = [...new Set(companyDefs.map((d) => d.pageKey))];
  const companyPageKeysExpected = [
    "company.ceo",
    "company.about",
    "company.philosophy",
    "company.history",
    "company.organization",
    "company.global",
  ];
  const companyPageKeysSix = companyPageKeys.length === 6;
  const companyPageKeysInNavOrder =
    JSON.stringify(companyPageKeys) === JSON.stringify(companyPageKeysExpected);
  const companyNoRootPageKey = !companyPageKeys.includes("company");

  section("registryShape", {
    iframeWidgetsKo: iframeKo.length,
    iframeWidgetsEn: iframeEn.length,
    iframeDefs: iframeDefs.length,
    iframeDefsAbsent,
    embedDefCount: embedDefs.length,
    embedDefsAbsent,
    hqSectionDefCount: hqSectionDefs.length,
    hqSectionDefsAbsent,
    branchSectionDefCount: branchSectionDefs.length,
    branchesCoveredByLocations,
    branchIframesStillAuthored,
    locationsBaseThree,
    locationsHqContacts,
    locationsBranchCount,
    locationsBranchesMapped,
    galleryDefCount: galleryDefs.length,
    galleryDefCountOk,
    galleriesOk,
    cardsFound: Boolean(cardsDef),
    cardsOk,
    oldItemDefCount: oldItemDefs.length,
    oldItemKeysAbsent,
    aboutNestedImgDefCount: aboutNestedImgDefs.length,
    pinImgKeysAbsent,
    block8MapFound: Boolean(block8MapDef),
    block8MapOk,
    registrySourceKeys,
    erasDefFound: Boolean(erasDef),
    erasDefKind: erasDef?.kind ?? null,
    locationsDefFound: Boolean(locationsDef),
    locationsDefKind: locationsDef?.kind ?? null,
    structuredDefsOk,
    companyPageKeys,
    companyPageKeysSix,
    companyPageKeysInNavOrder,
    companyNoRootPageKey,
  });

  /* ------------------------------------------ C) structured gallery round-trips */

  // Block 3 (captioned, title field). Appending an item lets the title marker
  // prove the structured applier ran; the EN route must not see the KO write.
  const g3Base = parseArrayPayload(baselineG3);
  const g3Marker = `E2E-GAL3-${STAMP}`;
  const g3Img = `/.e2e/gal3-${STAMP}.png`;
  let g3WriteOk = false;
  let g3Applied = false;
  let g3NotInEn = false;
  let g3Reverted = false;
  let g3CountRestored = false;
  let g3FirstOrgRestored = false;
  let g3DomBaseline = false;
  if (g3Base) {
    const g3Payload = JSON.stringify([
      ...g3Base,
      { image: g3Img, title: g3Marker, desc: "" },
    ]);
    const g3Write = await put(G3.key, "ko", g3Payload);
    g3WriteOk = g3Write.status === 200;
    if (g3WriteOk) {
      g3Applied = (await pageText("/company/about")).includes(g3Marker);
      g3NotInEn = !(await pageText("/en/company/about")).includes(g3Marker);
    }
    await revert(G3.key, "ko");
    const dom = await pageText("/company/about");
    const firstImage = g3Base[0]?.image ?? "";
    g3Reverted = !dom.includes(g3Marker);
    g3DomBaseline =
      !dom.includes(g3Marker) &&
      !dom.includes(g3Img) &&
      (!firstImage || dom.includes(firstImage));
    const restored = await getJson("/api/admin/registry?group=company&locale=ko");
    const g3After = parseArrayPayload(restored.values?.[G3.key] ?? "");
    g3CountRestored = Boolean(g3After && g3Base && g3After.length === g3Base.length);
    g3FirstOrgRestored = Boolean(g3After && g3Base && g3After[0]?.image === g3Base[0]?.image);
  }

  // Block 6 (image-only). The appended item's marker lives in its image path.
  const g6Base = parseArrayPayload(baselineG6);
  const g6Img = `/.e2e/gal6-${STAMP}.png`;
  let g6WriteOk = false;
  let g6Applied = false;
  let g6Reverted = false;
  let g6CountRestored = false;
  if (g6Base) {
    const g6Payload = JSON.stringify([...g6Base, { image: g6Img, title: "", desc: "" }]);
    const g6Write = await put(G6.key, "ko", g6Payload);
    g6WriteOk = g6Write.status === 200;
    if (g6WriteOk) g6Applied = (await pageText("/company/about")).includes(g6Img);
    await revert(G6.key, "ko");
    g6Reverted = !(await pageText("/company/about")).includes(g6Img);
    const restored = await getJson("/api/admin/registry?group=company&locale=ko");
    const g6After = parseArrayPayload(restored.values?.[G6.key] ?? "");
    g6CountRestored = Boolean(g6After && g6Base && g6After.length === g6Base.length);
  }

  section("galleryApply", {
    block3BaseFound: Boolean(g3Base),
    block3BaseCount: g3Base ? g3Base.length : 0,
    block3WriteOk: g3WriteOk,
    block3MarkerApplied: g3Applied,
    block3NotInEn: g3NotInEn,
    block3Reverted: g3Reverted,
    block3CountRestored: g3CountRestored,
    block3FirstOrgRestored: g3FirstOrgRestored,
    block3DomBaseline: g3DomBaseline,
    block6BaseFound: Boolean(g6Base),
    block6BaseCount: g6Base ? g6Base.length : 0,
    block6WriteOk: g6WriteOk,
    block6MarkerApplied: g6Applied,
    block6Reverted: g6Reverted,
    block6CountRestored: g6CountRestored,
  });

  /* -------------------------------------------------- D) EN pairing fix */

  const enWrite = await put(EN_PAIR_KEY, "en", EN_MARK);
  const enAbout = enWrite.status === 200 ? await pageText("/en/company/about") : "";
  const enApplied = enWrite.status === 200 && enAbout.includes(EN_MARK);
  await revert(EN_PAIR_KEY, "en");
  const enReverted = !(await pageText("/en/company/about")).includes(EN_MARK);

  section("enPairingFix", {
    writeOk: enWrite.status === 200,
    enApplied,
    enReverted,
  });

  /* --------------------------------- G) shared company intro propagation */

  // The shared intro def is rendered on all 7 `/company*` routes of its locale
  // (edited once under the `company` group) and must not leak into the other.
  const koSharedWrite = await put(SHARED_KEY, "ko", SHARED_KO_MARK);
  const koRouteHits = {};
  for (const route of COMPANY_ROUTES) {
    koRouteHits[route] =
      koSharedWrite.status === 200 && (await pageText(route)).includes(SHARED_KO_MARK);
  }
  const koNotInEn =
    koSharedWrite.status === 200 && !(await pageText("/en/company")).includes(SHARED_KO_MARK);

  const enSharedWrite = await put(SHARED_KEY, "en", SHARED_EN_MARK);
  const enRouteHits = {};
  for (const route of COMPANY_ROUTES) {
    enRouteHits[`/en${route}`] =
      enSharedWrite.status === 200 && (await pageText(`/en${route}`)).includes(SHARED_EN_MARK);
  }

  await revert(SHARED_KEY, "ko");
  await revert(SHARED_KEY, "en");
  const sharedKoCanonical = await pageText("/company");
  const sharedEnCanonical = await pageText("/en/company");
  const koReverted = !sharedKoCanonical.includes(SHARED_KO_MARK);
  const enSharedReverted = !sharedEnCanonical.includes(SHARED_EN_MARK);
  // A `lines` default is stored multi-line ("line1\nline2"); the renderer injects
  // each line into its own markup node, so the raw joined value is never a
  // substring of the HTML. Match each non-empty baseline line instead.
  const baselineSharedLines = (baselineSharedKo || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const baselineRestored =
    baselineSharedLines.length > 0 &&
    baselineSharedLines.every((line) => sharedKoCanonical.includes(line));

  section("sharedIntro", {
    koWriteOk: koSharedWrite.status === 200,
    ...Object.fromEntries(COMPANY_ROUTES.map((route) => [`ko:${route}`, koRouteHits[route]])),
    koNotInEn,
    enWriteOk: enSharedWrite.status === 200,
    ...Object.fromEntries(
      COMPANY_ROUTES.map((route) => [`en:/en${route}`, enRouteHits[`/en${route}`]]),
    ),
    koReverted,
    enSharedReverted,
    baselineRestored,
  });

  /* ------------------------------------------- H) structured eras apply */

  const erasBase = parseArrayPayload(baselineEras);
  const historyBefore = await pageText("/company/history");
  const hrBefore = (historyBefore.match(/<hr/gi) ?? []).length;
  let erasWriteOk = false;
  let erasMarkerApplied = false;
  let erasHrIncreased = false;
  let erasReverted = false;
  if (erasBase) {
    const nextEras = [
      ...erasBase,
      {
        range: ERAS_MARK,
        tagline: ERAS_MARK,
        image: "",
        years: [{ year: ERAS_MARK, items: [ERAS_MARK] }],
      },
    ];
    const erasWrite = await put(ERAS_KEY, "ko", JSON.stringify(nextEras));
    erasWriteOk = erasWrite.status === 200;
    const historyAfter = erasWriteOk ? await pageText("/company/history") : "";
    erasMarkerApplied = erasWriteOk && historyAfter.includes(ERAS_MARK);
    erasHrIncreased = erasWriteOk && (historyAfter.match(/<hr/gi) ?? []).length > hrBefore;
    await revert(ERAS_KEY, "ko");
    const historyRestored = await pageText("/company/history");
    erasReverted =
      !historyRestored.includes(ERAS_MARK) &&
      (historyRestored.match(/<hr/gi) ?? []).length === hrBefore;
  }

  section("erasApply", {
    keyFound: Boolean(erasDef),
    baseFound: Boolean(erasBase),
    baseEras: erasBase ? erasBase.length : 0,
    writeOk: erasWriteOk,
    markerApplied: erasMarkerApplied,
    hrIncreased: erasHrIncreased,
    reverted: erasReverted,
  });

  /* --------------------------------------- I) structured locations apply */

  let locationsWriteOk = false;
  let locationsHqContactsApplied = false;
  let locationsMapApplied = false;
  let locationsBranchApplied = false;
  let locationsNotInEn = false;
  let locationsReverted = false;
  let locationsBaselineHqContacts = false;
  let locationsBaselineNoBranchContactBlock = false;
  let locationsAppliedRowCount = false;
  let locationsAppliedSpans = false;
  let locationsAppliedOrder = false;
  let locationsRevertedRowCount = false;
  let locationsRevertedSpans = false;
  if (locationsBase) {
    // Edit item 0 (HQ contacts + map) and append a 4th branch card.
    const nextLocations = locationsBase.map((item, index) =>
      index === 0
        ? {
            ...item,
            phone: LOC_PHONE_MARK,
            fax: LOC_FAX_MARK,
            email: LOC_EMAIL_MARK,
            mapSrc: LOC_MAP_MARK,
          }
        : item,
    );
    nextLocations.push({
      badge: LOCATIONS_MARK,
      city: LOCATIONS_MARK,
      address: LOCATIONS_MARK,
      phone: LOC_BRANCH_PHONE_MARK,
      fax: "",
      email: "",
      mapSrc: "",
    });
    const locationsWrite = await put(LOCATIONS_KEY, "ko", JSON.stringify(nextLocations));
    locationsWriteOk = locationsWrite.status === 200;
    const globalAfter = locationsWriteOk ? await pageText("/company/global") : "";
    const globalEnAfter = locationsWriteOk ? await pageText("/en/company/global") : "";
    locationsHqContactsApplied =
      locationsWriteOk &&
      globalAfter.includes(LOC_PHONE_MARK) &&
      globalAfter.includes(LOC_FAX_MARK) &&
      globalAfter.includes(LOC_EMAIL_MARK);
    locationsMapApplied = locationsWriteOk && globalAfter.includes(LOC_MAP_MARK);
    locationsBranchApplied =
      locationsWriteOk &&
      globalAfter.includes(LOCATIONS_MARK) &&
      globalAfter.includes(LOC_BRANCH_PHONE_MARK);
    locationsNotInEn =
      locationsWriteOk &&
      !globalEnAfter.includes(LOC_PHONE_MARK) &&
      !globalEnAfter.includes(LOCATIONS_MARK) &&
      !globalEnAfter.includes(LOC_MAP_MARK);

    // Layout (3 branches): 2 container rows — [6,6] then a lone [12] — in item
    // order (China, Cambodia, then the appended marker).
    const appliedShapes = locationsWriteOk ? containerRowShapes(globalAfter) : [];
    const b1 = locationsBase[1]?.badge ?? "";
    const b2 = locationsBase[2]?.badge ?? "";
    locationsAppliedRowCount = appliedShapes.length === 2;
    locationsAppliedSpans =
      JSON.stringify(appliedShapes.map((r) => r.spans)) === JSON.stringify([[6, 6], [12]]);
    locationsAppliedOrder =
      appliedShapes.length === 2 &&
      appliedShapes[0].html.includes(b1) &&
      appliedShapes[0].html.includes(b2) &&
      appliedShapes[0].html.indexOf(b1) < appliedShapes[0].html.indexOf(b2) &&
      appliedShapes[1].html.includes(LOCATIONS_MARK) &&
      !appliedShapes[0].html.includes(LOCATIONS_MARK);

    await revert(LOCATIONS_KEY, "ko");
    const revertedHtml = await pageText("/company/global");
    locationsReverted = !revertedHtml.includes(LOCATIONS_MARK);
    // Layout back to the authored single row with two 50/50 cols.
    const revertedShapes = containerRowShapes(revertedHtml);
    locationsRevertedRowCount = revertedShapes.length === 1;
    locationsRevertedSpans =
      JSON.stringify(revertedShapes.map((r) => r.spans)) === JSON.stringify([[6, 6]]);
    const hqBaseline = locationsBase[0] ?? null;
    locationsBaselineHqContacts = Boolean(
      hqBaseline?.phone &&
        hqBaseline?.fax &&
        hqBaseline?.email &&
        revertedHtml.includes(hqBaseline.phone),
    );
    // The default branch cards carry no contact block (only HQ has contacts).
    locationsBaselineNoBranchContactBlock = !revertedHtml.includes("loc-contacts");
  }

  section("locationsApply", {
    keyFound: Boolean(locationsDef),
    baseFound: Boolean(locationsBase),
    baseLocations: locationsBase ? locationsBase.length : 0,
    baseThree: locationsBaseThree,
    baseBranchCount: locationsBranchCount,
    writeOk: locationsWriteOk,
    hqContactsApplied: locationsHqContactsApplied,
    mapApplied: locationsMapApplied,
    branchApplied: locationsBranchApplied,
    notInEn: locationsNotInEn,
    layoutRowCount: locationsAppliedRowCount,
    layoutSpans: locationsAppliedSpans,
    layoutOrder: locationsAppliedOrder,
    reverted: locationsReverted,
    revertedRowCount: locationsRevertedRowCount,
    revertedSpans: locationsRevertedSpans,
    baselineHqContacts: locationsBaselineHqContacts,
    baselineNoBranchContactBlock: locationsBaselineNoBranchContactBlock,
  });

  /* --------------------------------------------- J) malformed payloads 400 */

  const erasBadJson = await put(ERAS_KEY, "ko", "not json");
  const erasBadEmpty = await put(ERAS_KEY, "ko", "[]");
  const locationsBadJson = await put(LOCATIONS_KEY, "ko", "not json");
  const locationsBadEmpty = await put(LOCATIONS_KEY, "ko", "[]");
  const eras400 = erasBadJson.status === 400 && erasBadEmpty.status === 400;
  const locations400 = locationsBadJson.status === 400 && locationsBadEmpty.status === 400;
  const malformedNoPersist =
    !(await pageText("/company/history")).includes("not json") &&
    !(await pageText("/company/global")).includes("not json");
  // A rejected write must not change the effective locations value.
  const afterLocationsMalformed = await getJson("/api/admin/registry?group=company&locale=ko");
  const locationsValueUnchanged =
    (afterLocationsMalformed.values?.[LOCATIONS_KEY] ?? "") === baselineLocations;

  section("malformedPayloads", {
    eras400,
    locations400,
    locationsValueUnchanged,
    malformedNoPersist,
  });

  /* --------------------------------------- J2) malformed media payloads 400 */

  const g3BadJson = await put(G3.key, "ko", "not json");
  const g3BadEmpty = await put(G3.key, "ko", "[]");
  const cardsBadJson = await put(CARDS.key, "ko", "not json");
  const cardsBadEmpty = await put(CARDS.key, "ko", "[]");
  const gallery400 = g3BadJson.status === 400 && g3BadEmpty.status === 400;
  const cards400 = cardsBadJson.status === 400 && cardsBadEmpty.status === 400;
  const afterMalformed = await getJson("/api/admin/registry?group=company&locale=ko");
  const galleryValueUnchanged = (afterMalformed.values?.[G3.key] ?? "") === baselineG3;
  const cardsValueUnchanged = (afterMalformed.values?.[CARDS.key] ?? "") === baselineCards;

  section("malformedMedia", {
    gallery400,
    cards400,
    galleryValueUnchanged,
    cardsValueUnchanged,
  });

  /* --------------------------------------- E) admin UI (locations editor) */

  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.context().addCookies([{ name: "ecowave_admin", value: sealed, url: BASE }]);
  await page.goto(`${BASE}/admin/content?group=${encodeURIComponent(adminGroup)}`);
  await page.waitForSelector("button[aria-expanded]", { timeout: 60000 });
  await page.waitForTimeout(1500);

  // K) structured editor smoke: the history accordion renders the eras editor's
  // add control; the global accordion renders the locations editor (contact
  // inputs, add control) with the locked HQ item first.
  const expandAccordion = async (hint) => {
    const header = page.locator("button[aria-expanded]", { hasText: hint }).first();
    if ((await header.count()) === 0) return false;
    if ((await header.getAttribute("aria-expanded")) !== "true") {
      await header.scrollIntoViewIfNeeded();
      await header.click();
      await page.waitForTimeout(600);
    }
    return true;
  };
  const eraHeaderFound = await expandAccordion(truncateSectionId(ERAS_ANCHOR_SECTION));
  const eraAddShown = (await page.locator('[data-testid="era-add"]').count()) > 0;
  const locationHeaderFound = await expandAccordion(truncateSectionId(LOCATIONS_ANCHOR_SECTION));
  const locationAddShown = (await page.locator('[data-testid="location-add"]').count()) > 0;
  const locationPhoneShown = (await page.locator('[data-testid="location-phone"]').count()) > 0;
  const locationFaxShown = (await page.locator('[data-testid="location-fax"]').count()) > 0;
  const locationEmailShown = (await page.locator('[data-testid="location-email"]').count()) > 0;
  const locationCards = page.locator('[data-testid="location-card"]');
  const locationCardCount = await locationCards.count();
  const firstCardRemoveCount = await locationCards
    .nth(0)
    .locator('[data-testid="location-remove"]')
    .count();
  const secondCardRemoveCount =
    locationCardCount > 1
      ? await locationCards.nth(1).locator('[data-testid="location-remove"]').count()
      : -1;
  const firstCardHasNoRemove = locationCardCount >= 1 && firstCardRemoveCount === 0;
  const secondCardHasRemove = locationCardCount > 1 && secondCardRemoveCount === 1;

  section("structuredUi", {
    eraHeaderFound,
    eraAddShown,
    locationHeaderFound,
    locationAddShown,
    locationPhoneShown,
    locationFaxShown,
    locationEmailShown,
    locationCardCount,
    firstCardHasNoRemove,
    secondCardHasRemove,
  });

  // L) gallery editor smoke: block 3 exposes image+title (no desc); block 4 is
  // image-only (no title input). The admin accordion opens one section at a
  // time, so each block is inspected in isolation.
  const g3HeaderFound = await expandAccordion(truncateSectionId(G3.sectionId));
  const g3AddShown = (await page.locator('[data-testid="gallery-add"]').count()) > 0;
  const g3TitleShown = (await page.locator('[data-testid="gallery-title"]').count()) > 0;
  const g3DescShown = (await page.locator('[data-testid="gallery-desc"]').count()) > 0;

  const g4HeaderFound = await expandAccordion(truncateSectionId(G4.sectionId));
  const g4AddShown = (await page.locator('[data-testid="gallery-add"]').count()) > 0;
  const g4TitleShown = (await page.locator('[data-testid="gallery-title"]').count()) > 0;

  section("galleryUi", {
    block3HeaderFound: g3HeaderFound,
    block3AddShown: g3AddShown,
    block3TitleShown: g3TitleShown,
    block3DescAbsent: !g3DescShown,
    block4HeaderFound: g4HeaderFound,
    block4AddShown: g4AddShown,
    block4TitleAbsent: !g4TitleShown,
  });

  if (browser) await browser.close();

  /* ----------------------------------------- F) no residue / back to baseline */

  const finalKo = await getJson("/api/admin/registry?group=company&locale=ko");
  const finalEn = await getJson("/api/admin/registry?group=company&locale=en");
  const finalGlobalHtml = await pageText("/company/global");
  const finalHistoryHtml = await pageText("/company/history");
  const finalAboutHtml = await pageText("/company/about");
  const finalEnAboutHtml = await pageText("/en/company/about");

  const noMarkers =
    !finalGlobalHtml.includes(LOCATIONS_MARK) &&
    !finalGlobalHtml.includes(LOC_PHONE_MARK) &&
    !finalGlobalHtml.includes(LOC_FAX_MARK) &&
    !finalGlobalHtml.includes(LOC_EMAIL_MARK) &&
    !finalGlobalHtml.includes(LOC_MAP_MARK) &&
    !finalGlobalHtml.includes(LOC_BRANCH_PHONE_MARK) &&
    !finalGlobalHtml.includes("not json") &&
    !finalHistoryHtml.includes(ERAS_MARK) &&
    !finalHistoryHtml.includes("not json") &&
    !finalAboutHtml.includes(g3Marker) &&
    !finalAboutHtml.includes(g3Img) &&
    !finalAboutHtml.includes(g6Img) &&
    !finalEnAboutHtml.includes(EN_MARK);
  const enValueRestored = (finalEn.values?.[EN_PAIR_KEY] ?? "") === baselineEn;
  const erasValueRestored = (finalKo.values?.[ERAS_KEY] ?? "") === baselineEras;
  const locationsValueRestored = (finalKo.values?.[LOCATIONS_KEY] ?? "") === baselineLocations;
  const g3ValueRestored = (finalKo.values?.[G3.key] ?? "") === baselineG3;
  const g6ValueRestored = (finalKo.values?.[G6.key] ?? "") === baselineG6;
  const cardsValueRestored = (finalKo.values?.[CARDS.key] ?? "") === baselineCards;
  const globalMatchesBaseline =
    Boolean(baselineHqMapSrc) && finalGlobalHtml.includes(baselineHqMapSrc);
  const globalHqContactsBaseline = Boolean(
    locationsBase?.[0]?.phone && finalGlobalHtml.includes(locationsBase[0].phone),
  );
  const globalBranchContactBlockAbsent = !finalGlobalHtml.includes("loc-contacts");
  const aboutMatchesBaseline =
    Boolean(baselineBlock8Map) && finalAboutHtml.includes(baselineBlock8Map);
  const g3FirstImage = g3Base?.[0]?.image ?? "";
  const aboutGalleryBaseline =
    (!g3FirstImage || finalAboutHtml.includes(g3FirstImage));

  section("residue", {
    noMarkers,
    enValueRestored,
    erasValueRestored,
    locationsValueRestored,
    g3ValueRestored,
    g6ValueRestored,
    cardsValueRestored,
    globalMatchesBaseline,
    globalHqContactsBaseline,
    globalBranchContactBlockAbsent,
    aboutMatchesBaseline,
    aboutGalleryBaseline,
  });
} catch (e) {
  report.error = String((e && e.stack) || e).slice(0, 900);
  pass = false;
} finally {
  try { await revertAll(); } catch {}
  try { if (browser) await browser.close(); } catch {}
  killDev();
  report.devLogTail = pass ? undefined : devLog.slice(-1200);
  console.log(JSON.stringify({ pass, report }, null, 1));
}
process.exit(pass ? 0 : 1);
