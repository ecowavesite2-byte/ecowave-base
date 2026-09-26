/**
 * One-shot runtime verification for the company registry + nested-media editor.
 *
 *   A) registry shape: `company.global` keeps exactly one `iframe[0].src`
 *      (`embed`) def — the HQ map; the two branch maps are superseded by the
 *      structured `locations` def, which (with the `eras` def) is asserted by
 *      key/kind. `company.about` s8 text widgets expose `img[0].src` (`image`)
 *      defs. The company group lists exactly the six real subpages in nav order
 *      and never the aliased root `company` pageKey. Cross-checked against the
 *      crawled content (widget ids) and `lib/content/registry.ts` (keys), never
 *      a hard-coded def count.
 *   B) map iframe round-trip: PUT the first global iframe src for `ko` → the KO
 *      route renders it and the EN route does NOT (per-locale kind) → revert
 *   C) nested image round-trip: PUT the first `company.about` s8 `img[0].src`
 *      for `ko` → `/company/about` renders it → revert → the crawled src is back
 *   D) EN pairing fix: PUT `company.about#…/w20250918684332dc780e7/html` for
 *      `en` → `/en/company/about` renders it → revert
 *   G) shared intro propagation: PUT `company.ceo#…/w20250820e1c08ac226481/html`
 *      (`lines`) → the marker renders on all 7 `/company*` routes for that locale
 *      but not the other locale → the EN marker likewise on all 7 `/en/company*`
 *      → revert both → baseline copy is back
 *   H) structured `eras`: append a 4th era (unique marker) → `/company/history`
 *      renders the marker and one more year head → revert → baseline restored
 *   I) structured `locations`: append a 3rd branch (unique marker) →
 *      `/company/global` renders the marker → revert → baseline restored
 *   J) malformed `eras`/`locations` payloads (`not json`, `[]`) → HTTP 400 and
 *      nothing persisted
 *   K) structured editor smoke: the history accordion renders `era-add`, the
 *      global accordion renders `location-add`
 *   E) admin UI smoke: open the company group, expand the map section, assert
 *      the embed field renders ("임베드"/"Embed") and a light UI save lands on
 *      the public page
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
const IFRAME_MARK = `https://www.google.com/maps/embed?pb=__E2E__${STAMP}`;
const IMG_MARK = `/.e2e/company-${STAMP}.png`;
const EN_MARK = `E2E-EN-PAIR-${STAMP}`;
// `embed`/`image` saves are validated as http(s) or `/…`, so the UI marker must
// be a valid URL — the `E2E-EMBED-UI-<stamp>` substring keeps it detectable.
const UI_MARK = `https://www.google.com/maps/embed?pb=E2E-EMBED-UI-${STAMP}`;
// Shared intro markers (plain text injected into the `lines` def, per locale).
const SHARED_KO_MARK = `E2E-SHARED-KO-${STAMP}`;
const SHARED_EN_MARK = `E2E-SHARED-EN-${STAMP}`;

const GLOBAL_PAGE = "company.global";
const ABOUT_PAGE = "company.about";
const ABOUT_S8 = "s20250918c5a18b62c8acd";
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
  const aboutImgWidgets = widgetsWithTag(aboutKo, "img").filter((w) => w.sectionId === ABOUT_S8);

  const firstIframe = iframeKo[0] ?? null;
  const firstImg = aboutImgWidgets[0] ?? null;
  const IFRAME_KEY = firstIframe
    ? `${GLOBAL_PAGE}#${firstIframe.sectionId}/${firstIframe.widgetId}/iframe[0].src`
    : null;
  const IMG_KEY = firstImg ? `${ABOUT_PAGE}#${ABOUT_S8}/${firstImg.widgetId}/img[0].src` : null;
  const baselineIframeSrc = firstIframe ? firstTagSrc(firstIframe.html, "iframe") : "";
  const baselineImgSrc = firstImg ? firstTagSrc(firstImg.html, "img") : "";

  // The registry group is a coarse bucket ("company"); company.global is a
  // pageKey within it, not a group — derive the real group from the API.
  const companyKo = await getJson("/api/admin/registry?group=company&locale=ko");
  const companyEn = await getJson("/api/admin/registry?group=company&locale=en");
  const companyDefs = companyKo.defs ?? [];
  const adminGroup = companyDefs.find((d) => d.pageKey === GLOBAL_PAGE)?.group ?? "company";

  const iframeDefs = companyDefs.filter(
    (d) => d.pageKey === GLOBAL_PAGE && /^iframe\[\d+\]\.src$/.test(d.field),
  );
  const imgDefs = companyDefs.filter(
    (d) => d.pageKey === ABOUT_PAGE && /^img\[\d+\]\.src$/.test(d.field),
  );
  const registrySrc = fs.readFileSync("lib/content/registry.ts", "utf8");

  // Baseline effective values, captured before any write (an absent key is "").
  const baselineIframe = IFRAME_KEY ? companyKo.values?.[IFRAME_KEY] ?? "" : "";
  const baselineImg = IMG_KEY ? companyKo.values?.[IMG_KEY] ?? "" : "";
  const baselineEn = companyEn.values?.[EN_PAIR_KEY] ?? "";
  // Shared intro baseline (the canonical KO text; absent key is "").
  const baselineSharedKo = companyKo.values?.[SHARED_KEY] ?? "";
  // Structured baselines (effective values = override or code default).
  const baselineEras = companyKo.values?.[ERAS_KEY] ?? "";
  const baselineLocations = companyKo.values?.[LOCATIONS_KEY] ?? "";

  /* --------------------------------------------------- A) registry shape */

  const hqIframe = firstIframe;
  const branchIframes = iframeKo.slice(1);
  const iframeKeyOf = (w) => `${GLOBAL_PAGE}#${w.sectionId}/${w.widgetId}/iframe[0].src`;
  const hqIframeHasDef =
    hqIframe !== null &&
    iframeDefs.length === 1 &&
    iframeDefs.some(
      (d) =>
        d.sectionId === hqIframe.sectionId &&
        d.widgetId === hqIframe.widgetId &&
        d.field === "iframe[0].src",
    );
  const branchIframesHaveNoDef = branchIframes.every(
    (w) => !iframeDefs.some((d) => d.sectionId === w.sectionId && d.widgetId === w.widgetId),
  );
  const oneDefPerIframeWidget = hqIframeHasDef && branchIframesHaveNoDef;
  const iframeKindEmbed = iframeDefs.length === 1 && iframeDefs.every((d) => d.kind === "embed");
  const iframeNoLinesDef = !companyDefs.some(
    (d) =>
      d.pageKey === GLOBAL_PAGE &&
      d.field === "html" &&
      iframeKo.some((w) => d.sectionId === w.sectionId && d.widgetId === w.widgetId),
  );
  const imgDefPerWidget =
    aboutImgWidgets.length > 0 &&
    aboutImgWidgets.every((w) =>
      imgDefs.some((d) => d.sectionId === w.sectionId && d.widgetId === w.widgetId && d.field === "img[0].src"),
    );
  const imgKindIsImage = imgDefs.length > 0 && imgDefs.every((d) => d.kind === "image");
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
  // Runtime grep of the generated registry source (not a hard-coded count): the
  // HQ map + about images are present; the two superseded branch map keys are
  // absent; the two structured keys are present.
  const registrySourceKeys =
    (hqIframe ? registrySrc.includes(iframeKeyOf(hqIframe)) : false) &&
    aboutImgWidgets.every((w) =>
      registrySrc.includes(`${ABOUT_PAGE}#${ABOUT_S8}/${w.widgetId}/img[0].src`),
    ) &&
    branchIframes.every((w) => !registrySrc.includes(iframeKeyOf(w))) &&
    registrySrc.includes(ERAS_KEY) &&
    registrySrc.includes(LOCATIONS_KEY);
  const branchIframeDefCount = iframeDefs.filter((d) =>
    branchIframes.some((w) => d.sectionId === w.sectionId && d.widgetId === w.widgetId),
  ).length;
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
    branchIframeDefCount,
    oneDefPerIframeWidget,
    iframeKindEmbed,
    iframeNoLinesDef,
    aboutS8ImgWidgets: aboutImgWidgets.length,
    imgDefPerWidget,
    imgKindIsImage,
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

  /* ------------------------------------------------- B) iframe round-trip */

  const iframeWrite = IFRAME_KEY ? await put(IFRAME_KEY, "ko", IFRAME_MARK) : { status: 0 };
  const globalHtml = iframeWrite.status === 200 ? await pageText("/company/global") : "";
  const globalEnHtml = iframeWrite.status === 200 ? await pageText("/en/company/global") : "";
  const iframeApplied = iframeWrite.status === 200 && globalHtml.includes(IFRAME_MARK);
  const iframeNotInEn = iframeWrite.status === 200 && !globalEnHtml.includes(IFRAME_MARK);
  if (IFRAME_KEY) await revert(IFRAME_KEY, "ko");
  const iframeReverted = !(await pageText("/company/global")).includes(IFRAME_MARK);

  section("iframeApply", {
    keyFound: Boolean(IFRAME_KEY),
    writeOk: iframeWrite.status === 200,
    iframeApplied,
    iframeNotInEn,
    iframeReverted,
  });

  /* --------------------------------------------- C) nested image round-trip */

  const imgWrite = IMG_KEY ? await put(IMG_KEY, "ko", IMG_MARK) : { status: 0 };
  const aboutHtml = imgWrite.status === 200 ? await pageText("/company/about") : "";
  const imgApplied = imgWrite.status === 200 && aboutHtml.includes(IMG_MARK);
  if (IMG_KEY) await revert(IMG_KEY, "ko");
  const aboutAfter = await pageText("/company/about");
  const imgRevertedToCrawled =
    !aboutAfter.includes(IMG_MARK) && Boolean(baselineImgSrc) && aboutAfter.includes(baselineImgSrc);

  section("nestedImageApply", {
    keyFound: Boolean(IMG_KEY),
    writeOk: imgWrite.status === 200,
    imgApplied,
    imgRevertedToCrawled,
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

  const locationsBase = parseArrayPayload(baselineLocations);
  let locationsWriteOk = false;
  let locationsMarkerApplied = false;
  let locationsReverted = false;
  if (locationsBase) {
    const nextLocations = [
      ...locationsBase,
      {
        badge: LOCATIONS_MARK,
        city: LOCATIONS_MARK,
        address: LOCATIONS_MARK,
        mapSrc: `/images/e2e/${STAMP}.png`,
      },
    ];
    const locationsWrite = await put(LOCATIONS_KEY, "ko", JSON.stringify(nextLocations));
    locationsWriteOk = locationsWrite.status === 200;
    const globalAfter = locationsWriteOk ? await pageText("/company/global") : "";
    locationsMarkerApplied = locationsWriteOk && globalAfter.includes(LOCATIONS_MARK);
    await revert(LOCATIONS_KEY, "ko");
    locationsReverted = !(await pageText("/company/global")).includes(LOCATIONS_MARK);
  }

  section("locationsApply", {
    keyFound: Boolean(locationsDef),
    baseFound: Boolean(locationsBase),
    baseLocations: locationsBase ? locationsBase.length : 0,
    writeOk: locationsWriteOk,
    markerApplied: locationsMarkerApplied,
    reverted: locationsReverted,
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

  section("malformedPayloads", {
    eras400,
    locations400,
    malformedNoPersist,
  });

  /* --------------------------------------------------------- E) admin UI */

  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.context().addCookies([{ name: "ecowave_admin", value: sealed, url: BASE }]);
  await page.goto(`${BASE}/admin/content?group=${encodeURIComponent(adminGroup)}`);
  await page.waitForSelector("button[aria-expanded]", { timeout: 60000 });
  await page.waitForTimeout(1500);

  // Expand the map section by its (locale-independent) truncated section id.
  const sectionHint = firstIframe ? truncateSectionId(firstIframe.sectionId) : "";
  const mapHeader = sectionHint
    ? page.locator("button[aria-expanded]", { hasText: sectionHint }).first()
    : page.locator("button[aria-expanded]").first();
  const mapHeaderFound = (await mapHeader.count()) > 0;
  if (mapHeaderFound && (await mapHeader.getAttribute("aria-expanded")) !== "true") {
    await mapHeader.click();
    await page.waitForTimeout(800);
  }

  const embedLabelShown = (await page.getByText(/임베드|Embed/).count()) > 0;
  const embedKeyShown = (await page.getByText("iframe[0].src", { exact: false }).count()) > 0;

  // Light UI round-trip, mirroring the home script: fill the ko input in the
  // embed field card, save, and assert the marker lands on the public page.
  let embedUiSaveApplied = null;
  let embedUiSaveReverted = null;
  if (IFRAME_KEY && embedKeyShown) {
    let card = page.locator('div:has(input[type="text"]):has-text("iframe[0].src")').last();
    if ((await card.count()) === 0) {
      card = page.locator('div:has(textarea):has-text("iframe[0].src")').last();
    }
    const control = card.locator('input[type="text"], textarea').first();
    if ((await control.count()) > 0) {
      await control.fill(UI_MARK);
      await page.waitForTimeout(300);
      await Promise.all([
        page
          .waitForResponse(
            (r) => r.url().includes("/api/admin/registry") && r.request().method() === "PUT",
            { timeout: 20000 },
          )
          .catch(() => null),
        card.locator("button", { hasText: /저장|Save/ }).first().click(),
      ]);
      // Track the UI write too, so a later throw still reverts it in `finally`.
      dirty.add(token(IFRAME_KEY, "ko"));
      embedUiSaveApplied = false;
      for (let i = 0; i < 20 && !embedUiSaveApplied; i++) {
        await page.waitForTimeout(800);
        embedUiSaveApplied = (await pageText("/company/global")).includes(UI_MARK);
      }
      await revert(IFRAME_KEY, "ko");
      embedUiSaveReverted = !(await pageText("/company/global")).includes(UI_MARK);
    }
  }

  // K) structured editor smoke: the history accordion renders the eras editor's
  // add control; the global accordion renders the locations add control.
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

  section("structuredUi", {
    eraHeaderFound,
    eraAddShown,
    locationHeaderFound,
    locationAddShown,
  });

  if (browser) await browser.close();

  section("adminUi", {
    group: adminGroup,
    mapHeaderFound,
    embedLabelShown,
    embedKeyShown,
    embedUiSaveApplied,
    embedUiSaveReverted,
  });

  /* ----------------------------------------- F) no residue / back to baseline */

  const finalKo = await getJson("/api/admin/registry?group=company&locale=ko");
  const finalEn = await getJson("/api/admin/registry?group=company&locale=en");
  const finalGlobalHtml = await pageText("/company/global");
  const finalHistoryHtml = await pageText("/company/history");
  const finalAboutHtml = await pageText("/company/about");
  const finalEnAboutHtml = await pageText("/en/company/about");

  const noMarkers =
    !finalGlobalHtml.includes(IFRAME_MARK) &&
    !finalGlobalHtml.includes(UI_MARK) &&
    !finalGlobalHtml.includes(LOCATIONS_MARK) &&
    !finalGlobalHtml.includes("not json") &&
    !finalHistoryHtml.includes(ERAS_MARK) &&
    !finalHistoryHtml.includes("not json") &&
    !finalAboutHtml.includes(IMG_MARK) &&
    !finalEnAboutHtml.includes(EN_MARK);
  const iframeValueRestored = IFRAME_KEY ? (finalKo.values?.[IFRAME_KEY] ?? "") === baselineIframe : false;
  const imgValueRestored = IMG_KEY ? (finalKo.values?.[IMG_KEY] ?? "") === baselineImg : false;
  const enValueRestored = (finalEn.values?.[EN_PAIR_KEY] ?? "") === baselineEn;
  const erasValueRestored = (finalKo.values?.[ERAS_KEY] ?? "") === baselineEras;
  const locationsValueRestored = (finalKo.values?.[LOCATIONS_KEY] ?? "") === baselineLocations;
  const globalMatchesBaseline =
    Boolean(baselineIframeSrc) && finalGlobalHtml.includes(baselineIframeSrc);
  const aboutMatchesBaseline = Boolean(baselineImgSrc) && finalAboutHtml.includes(baselineImgSrc);

  section("residue", {
    noMarkers,
    iframeValueRestored,
    imgValueRestored,
    enValueRestored,
    erasValueRestored,
    locationsValueRestored,
    globalMatchesBaseline,
    aboutMatchesBaseline,
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
