/**
 * Structured-clone visual capture (WS2 eras/locations).
 *
 * Boots `next dev` on a dedicated port (3128), seeds the admin session cookie,
 * reads the CURRENT `eras` / `locations` defaults from `/api/admin/registry`,
 * then PUTs temporary `ko` payloads:
 *   - company.history eras   : the base eras + a 4th marked era (unique
 *     range/tagline/year/item) whose image is a valid authored path, so the
 *     applier sets `mobileSrc:false` and the photo renders authored at 390.
 *   - company.global locations: the base locations + a 3rd marked one with an
 *     empty `mapSrc`, which keeps the cloned template map iframe.
 *
 * Captures full-page screenshots at 1440x900 and 390x844 for `/company/history`
 * and `/company/global`, then reverts both writes and asserts no marker residue,
 * restored effective values and baseline page metrics. Robust teardown.
 *
 * Usage: node scripts/audit/capture-structured-viewports.mjs [--port=3128]
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
const PORT = Number(getArg("port", "3128"));
const BASE = getArg("base", `http://127.0.0.1:${PORT}`);
const MANAGED = !args.some((x) => x.startsWith("--base="));
const OUT = path.resolve("design", "audit", "company-structured");

const STAMP = Date.now();
const ERAS_KEY = "company.history#s20250811d0a0980d730fb/eras/eras";
const LOCATIONS_KEY = "company.global#s202508286e01c87027ecf/locations/locations";
const ERA_IMG = "/images/thumbnail/20250828/a183e714076fb.jpg";

const ERA = {
  RANGE: `E2E-ERA-RANGE-${STAMP}`,
  TAGLINE: `E2E-ERA-TAGLINE-${STAMP}`,
  YEAR: `E2E-ERA-YEAR-${STAMP}`,
  ITEM: `E2E-ERA-ITEM-${STAMP}`,
};
const LOC = {
  BADGE: `E2E-LOC-BADGE-${STAMP}`,
  CITY: `E2E-LOC-CITY-${STAMP}`,
  ADDRESS: `E2E-LOC-ADDRESS-${STAMP}`,
};

const ROUTES = [
  { route: "/company/history", slug: "company-history", kind: "eras" },
  { route: "/company/global", slug: "company-global", kind: "locations" },
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

/** Page metrics: full-page height, marker presence, map-embed iframes, image boxes. */
async function measure(page, { markers, images }) {
  return page.evaluate(
    ({ markers, images }) => {
      const doc = document.scrollingElement || document.documentElement;
      const html = document.documentElement.outerHTML;
      const markerHit = {};
      for (const m of markers) markerHit[m] = html.includes(m);
      const mapIframes = [...document.querySelectorAll("iframe")].filter((f) =>
        (f.getAttribute("src") || "").includes("maps/embed"),
      ).length;
      const imgState = {};
      for (const src of images) {
        const list = [...document.images].filter((i) => (i.getAttribute("src") || "") === src);
        imgState[src] = list.map((i) => {
          const cs = getComputedStyle(i);
          const r = i.getBoundingClientRect();
          return {
            display: cs.display,
            width: Math.round(r.width),
            height: Math.round(r.height),
            visible: cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0,
          };
        });
      }
      return { pageHeight: doc.scrollHeight, markerHit, mapIframes, imgState };
    },
    { markers, images },
  );
}

const report = {
  base: BASE,
  out: path.relative(process.cwd(), OUT),
  pass: false,
  keys: { eras: ERAS_KEY, locations: LOCATIONS_KEY },
  markers: { eras: ERA, locations: LOC },
  steps: {},
  failures: [],
};

let browser;
let dirty = null;
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
  const group = await getJson("/api/admin/registry?group=company&locale=ko");
  const baselineErasValue = group.values?.[ERAS_KEY] ?? "";
  const baselineLocationsValue = group.values?.[LOCATIONS_KEY] ?? "";
  let baseEras = [];
  let baseLocations = [];
  try { baseEras = JSON.parse(baselineErasValue); } catch {}
  try { baseLocations = JSON.parse(baselineLocationsValue); } catch {}
  report.steps.readDefaults = {
    ok: Array.isArray(baseEras) && baseEras.length > 0 && Array.isArray(baseLocations) && baseLocations.length > 0,
    erasBaseCount: Array.isArray(baseEras) ? baseEras.length : 0,
    locationsBaseCount: Array.isArray(baseLocations) ? baseLocations.length : 0,
    erasValueBytes: baselineErasValue.length,
    locationsValueBytes: baselineLocationsValue.length,
  };
  if (!report.steps.readDefaults.ok) report.failures.push("readDefaults: could not parse eras/locations defaults");

  /* ------------------------------------------- build temporary payloads */
  const erasPayload = JSON.stringify([
    ...baseEras,
    {
      range: ERA.RANGE,
      tagline: ERA.TAGLINE,
      image: ERA_IMG,
      years: [{ year: ERA.YEAR, items: [ERA.ITEM] }],
    },
  ]);
  const locationsPayload = JSON.stringify([
    ...baseLocations,
    { badge: LOC.BADGE, city: LOC.CITY, address: LOC.ADDRESS, mapSrc: "" },
  ]);

  const markersFor = (kind) =>
    kind === "eras" ? [ERA.RANGE, ERA.TAGLINE, ERA.YEAR, ERA.ITEM] : [LOC.BADGE, LOC.CITY, LOC.ADDRESS];

  /** Load every route x viewport; optionally screenshot. Fresh URL per phase. */
  const sweep = async (phase) => {
    const out = [];
    for (const vp of VIEWPORTS) {
      for (const r of ROUTES) {
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.addStyleTag({ content: HIDE_DEV });
        await page.goto(`${BASE}${r.route}?e2e=${phase}-${STAMP}`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2500);
        await revealAndSettle(page);
        await page.addStyleTag({ content: FREEZE });
        await page.waitForTimeout(300);
        const data = await measure(page, {
          markers: markersFor(r.kind),
          images: r.kind === "eras" ? [ERA_IMG] : [],
        });
        let file = null;
        if (phase === "override") {
          file = path.join(OUT, `${vp.vp}-${r.slug}.png`);
          await page.screenshot({ path: file, fullPage: true });
        }
        await page.close();
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

  /* ------------------------------------------------------- baseline sweep */
  const baseline = await sweep("baseline");
  const baselineByKey = new Map(baseline.map((r) => [`${r.viewport}|${r.route}`, r]));
  report.steps.baseline = baseline;
  for (const r of baseline) {
    if (Object.values(r.markerHit).some(Boolean)) {
      report.failures.push(`baseline ${r.viewport} ${r.route}: unexpected marker present`);
    }
  }

  /* --------------------------------------------------------- apply writes */
  dirty = new Set();
  const erasPut = await put(ERAS_KEY, "ko", erasPayload);
  const locPut = await put(LOCATIONS_KEY, "ko", locationsPayload);
  report.steps.put = {
    eras: { status: erasPut.status, error: erasPut.body?.error },
    locations: { status: locPut.status, error: locPut.body?.error },
    ok: erasPut.status === 200 && locPut.status === 200,
  };
  if (!report.steps.put.ok) report.failures.push("PUT eras/locations failed");

  /* -------------------------------------------------------- override sweep */
  const override = await sweep("override");
  report.steps.override = [];
  for (const r of override) {
    const hits = Object.values(r.markerHit);
    const markersPresent = hits.length > 0 && hits.every(Boolean);
    const base = baselineByKey.get(`${r.viewport}|${r.route}`);
    const mapAdded = r.kind === "locations" ? r.mapIframes === (base?.mapIframes ?? -1) + 1 : true;
    // At 390 the marked era's authored image (a183e714076fb) must be VISIBLE
    // (the applier set `mobileSrc:false`, opting out of the portrait swap).
    const imgVisible = r.kind !== "eras" || r.viewport !== "390x844"
      ? true
      : (r.imgState[ERA_IMG] ?? []).some((i) => i.visible);
    const ok = markersPresent && mapAdded && imgVisible;
    report.steps.override.push({
      viewport: r.viewport,
      route: r.route,
      file: r.file,
      pageHeight: r.pageHeight,
      markersPresent,
      markerHit: r.markerHit,
      mapIframes: r.mapIframes,
      baselineMapIframes: base?.mapIframes ?? null,
      mapAdded,
      eraImageVisible390: r.kind === "eras" ? imgVisible : null,
      eraImageBoxes: r.kind === "eras" ? r.imgState[ERA_IMG] : null,
      ok,
    });
    if (!ok) {
      report.failures.push(
        `override ${r.viewport} ${r.route}: markers=${markersPresent} mapAdded=${mapAdded} ` +
          `mapIframes=${r.mapIframes} eraImageVisible390=${imgVisible}`,
      );
    }
  }

  /* ------------------------------------------------------------- revert */
  const erasRevert = await put(ERAS_KEY, "ko", "");
  const locRevert = await put(LOCATIONS_KEY, "ko", "");
  report.steps.revert = {
    eras: { status: erasRevert.status, error: erasRevert.body?.error },
    locations: { status: locRevert.status, error: locRevert.body?.error },
    ok: erasRevert.status === 200 && locRevert.status === 200,
  };
  if (!report.steps.revert.ok) report.failures.push("revert eras/locations failed");

  /* -------------------------------------------- residue / baseline check */
  const finalGroup = await getJson("/api/admin/registry?group=company&locale=ko");
  const finalEras = finalGroup.values?.[ERAS_KEY] ?? "";
  const finalLocations = finalGroup.values?.[LOCATIONS_KEY] ?? "";
  report.steps.valuesRestored = {
    eras: finalEras === baselineErasValue,
    locations: finalLocations === baselineLocationsValue,
    ok: finalEras === baselineErasValue && finalLocations === baselineLocationsValue,
  };
  if (!report.steps.valuesRestored.ok) report.failures.push("valuesRestored: effective values differ from baseline");

  const residue = await sweep("residue");
  report.steps.residue = [];
  for (const r of residue) {
    const base = baselineByKey.get(`${r.viewport}|${r.route}`);
    const markersGone = Object.values(r.markerHit).every((v) => v === false);
    const pageHeightDelta = base ? r.pageHeight - base.pageHeight : null;
    const heightOk = pageHeightDelta !== null && Math.abs(pageHeightDelta) <= 1;
    const mapOk = base ? r.mapIframes === base.mapIframes : false;
    const ok = markersGone && heightOk && mapOk;
    report.steps.residue.push({
      viewport: r.viewport,
      route: r.route,
      markersGone,
      pageHeight: r.pageHeight,
      baselinePageHeight: base?.pageHeight ?? null,
      pageHeightDelta,
      mapIframes: r.mapIframes,
      baselineMapIframes: base?.mapIframes ?? null,
      ok,
    });
    if (!ok) {
      report.failures.push(
        `residue ${r.viewport} ${r.route}: markersGone=${markersGone} ` +
          `pageHeightDelta=${pageHeightDelta} mapIframes=${r.mapIframes}/${base?.mapIframes}`,
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
