/**
 * Company `/company/about` structured media — visual captures for review.
 *
 * Boots `next dev` on a dedicated port (3130), seeds the admin cookie, reads the
 * CURRENT gallery/aboutCards defaults from `/api/admin/registry`, then captures
 * full-page PNGs at 1440x900 and 390x844 into `design/audit/company-about/`:
 *
 *   1. block-3 `gallery` + one appended item (real image path, marker title)
 *   2. block-5 `aboutCards` + one appended card (real image path, marker
 *      title/desc)
 *   3. default `/company/about` (block-8 world map + blocks 4/6 intact)
 *
 * Each write is reverted immediately after its captures; the report asserts no
 * marker residue, restored effective values and baseline page heights.
 *
 * Usage: node scripts/audit/capture-about-gallery.mjs [--port=3130]
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
const PORT = Number(getArg("port", "3130"));
const BASE = getArg("base", `http://127.0.0.1:${PORT}`);
const MANAGED = !args.some((x) => x.startsWith("--base="));
const OUT = path.resolve("design", "audit", "company-about");

const STAMP = Date.now();
const ROUTE = "/company/about";
const G3_KEY = "company.about#s202508119a2e8fe21b47a/w20250918692bb854e97af/gallery";
const CARDS_KEY = "company.about#s20250918c5a18b62c8acd/aboutCards/aboutCards";
const BLOCK8_MAP_SRC = "/images/thumbnail/20250828/9bc64982daf80.jpg";
// Real media path supplied for the temporary block-3 item.
const REAL_G3_IMG = "/images/thumbnail/20250811/269ab684758f0.jpg";

const G3_MARK = `E2E-ABOUT-G3-${STAMP}`;
const CARD_TITLE_MARK = `E2E-ABOUT-CARD-${STAMP}`;
const CARD_DESC_MARK = `E2E-ABOUT-CARDDESC-${STAMP}`;

const VIEWPORTS = [
  { vp: "1440x900", width: 1440, height: 900 },
  { vp: "390x844", width: 390, height: 844 },
];

const HIDE_DEV =
  "nextjs-portal, [data-nextjs-toast], [data-nextjs-dialog], [data-nextjs-dev-tools-button] { display: none !important; }";
const FREEZE =
  "*, *::before, *::after { animation: none !important; transition: none !important; }";

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

function parseItems(json) {
  try {
    const value = JSON.parse(json);
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Park a slide gallery on its LAST real item so an appended item is inside the
 * visible strip (autoplay is off under reduced-motion, so the track is already
 * parked on the first real item). The lead clones are the children before the
 * first real one; the appended item is the final real child.
 */
async function scrollGalleryToLast(page, widgetId, count) {
  const state = await page.evaluate(
    ({ id, count }) => {
      const track = document.querySelector(`[data-widget-id="${id}"] [data-gs]`);
      if (!track) return { found: false };
      // Snap would fight the manual position; freeze it for the shot.
      track.style.scrollSnapType = "none";
      const kids = [...track.children];
      const base = track.scrollLeft;
      let firstReal = kids.findIndex((k) => k.offsetLeft - track.offsetLeft >= base - 2);
      if (firstReal < 0) firstReal = 0;
      const target = kids[firstReal + Math.max(0, count - 1)];
      const targetOffset = target ? target.offsetLeft - track.offsetLeft : null;
      if (targetOffset != null) track.scrollLeft = targetOffset;
      return { found: true, firstReal, childCount: kids.length, targetOffset, scrollLeft: track.scrollLeft };
    },
    { id: widgetId, count },
  );
  await page.waitForTimeout(600);
  return state;
}

async function measure(page, { markers, images }) {
  return page.evaluate(
    ({ markers, images }) => {
      const doc = document.scrollingElement || document.documentElement;
      const html = document.documentElement.outerHTML;
      const markerHit = {};
      for (const m of markers) markerHit[m] = html.includes(m);
      const imageHit = {};
      for (const src of images) {
        imageHit[src] = [...document.images].some((i) => (i.getAttribute("src") || "") === src);
      }
      return { pageHeight: doc.scrollHeight, markerHit, imageHit };
    },
    { markers, images },
  );
}

const report = {
  base: BASE,
  out: path.relative(process.cwd(), OUT),
  route: ROUTE,
  keys: { gallery: G3_KEY, aboutCards: CARDS_KEY },
  markers: { g3: G3_MARK, cardTitle: CARD_TITLE_MARK, cardDesc: CARD_DESC_MARK },
  steps: {},
  captures: [],
  pass: false,
  failures: [],
};

let browser;
let authCookie = "";
const dirty = new Set();
let baselineG3 = "";
let baselineCards = "";

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

  /* ------------------------------------------------- read current defaults */
  const group = await getJson("/api/admin/registry?group=company&locale=ko");
  baselineG3 = group.values?.[G3_KEY] ?? "";
  baselineCards = group.values?.[CARDS_KEY] ?? "";
  const g3Items = parseItems(baselineG3);
  const cardItems = parseItems(baselineCards);
  const cardRealImg = cardItems?.[0]?.image ?? REAL_G3_IMG;
  report.steps.readDefaults = {
    ok: Array.isArray(g3Items) && g3Items.length > 0 && Array.isArray(cardItems) && cardItems.length > 0,
    g3Count: g3Items ? g3Items.length : 0,
    cardsCount: cardItems ? cardItems.length : 0,
    cardRealImage: cardRealImg,
  };
  if (!report.steps.readDefaults.ok) report.failures.push("readDefaults: could not parse gallery/aboutCards defaults");

  // Baseline media present in the default page (blocks 4/6 + block-8 map).
  const baselineImages = [
    BLOCK8_MAP_SRC,
    g3Items?.[0]?.image,
    group.values?.["company.about#s20250918c54b2950e2f1a/w2025091858b5ee5de7c2a/gallery"]
      ? parseItems(group.values?.["company.about#s20250918c54b2950e2f1a/w2025091858b5ee5de7c2a/gallery"])?.[0]?.image
      : undefined,
    parseItems(group.values?.["company.about#s20250918ab81858502f9e/w20250918b0ab58de4000e/gallery"] ?? "")?.[0]?.image,
  ].filter(Boolean);

  /** Load the route at one viewport; optionally screenshot. */
  const capture = async (phase, vp, { shot, markers, images, galleryScroll }) => {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addStyleTag({ content: HIDE_DEV });
    await page.goto(`${BASE}${ROUTE}?e2e=${phase}-${STAMP}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    await revealAndSettle(page);
    await page.addStyleTag({ content: FREEZE });
    await page.waitForTimeout(300);
    const galleryScrollState = galleryScroll
      ? await scrollGalleryToLast(page, galleryScroll.widgetId, galleryScroll.count)
      : null;
    const data = await measure(page, { markers, images });
    let file = null;
    if (shot) {
      file = path.join(OUT, `${phase}-${vp.vp}.png`);
      await page.screenshot({ path: file, fullPage: true });
    }
    await page.close();
    return {
      phase,
      viewport: vp.vp,
      file: file ? path.relative(process.cwd(), file) : null,
      galleryScrollState: galleryScroll ? galleryScrollState : null,
      ...data,
    };
  };

  /* ------------------------------------------------------- baseline sweep */
  const baseline = [];
  for (const vp of VIEWPORTS) {
    baseline.push(
      await capture("baseline", vp, {
        shot: false,
        markers: [G3_MARK, CARD_TITLE_MARK, CARD_DESC_MARK],
        images: baselineImages,
      }),
    );
  }
  report.steps.baseline = baseline;
  for (const r of baseline) {
    const markersClean = Object.values(r.markerHit).every((v) => v === false);
    const mediaPresent = Object.values(r.imageHit).every(Boolean);
    if (!markersClean) report.failures.push(`baseline ${r.viewport}: unexpected marker present`);
    if (!mediaPresent) report.failures.push(`baseline ${r.viewport}: baseline media missing (${JSON.stringify(r.imageHit)})`);
  }

  /* --------------------------------------------- 1) block-3 gallery override */
  const g3Payload = JSON.stringify([
    ...(g3Items ?? []),
    { image: REAL_G3_IMG, title: G3_MARK, desc: "" },
  ]);
  const g3Put = await put(G3_KEY, "ko", g3Payload);
  report.steps.g3Put = { status: g3Put.status, error: g3Put.body?.error, ok: g3Put.status === 200 };
  if (g3Put.status !== 200) report.failures.push("PUT block-3 gallery failed");

  for (const vp of VIEWPORTS) {
    const shot = await capture("block3-override", vp, {
      shot: true,
      markers: [G3_MARK],
      images: [REAL_G3_IMG, ...baselineImages],
      galleryScroll: { widgetId: "w20250918692bb854e97af", count: (g3Items?.length ?? 0) + 1 },
    });
    report.captures.push(shot);
    if (!shot.markerHit[G3_MARK]) report.failures.push(`block3 override ${shot.viewport}: marker absent`);
    if (!shot.imageHit[REAL_G3_IMG]) report.failures.push(`block3 override ${shot.viewport}: real image absent`);
  }

  const g3Revert = await put(G3_KEY, "ko", "");
  report.steps.g3Revert = { status: g3Revert.status, ok: g3Revert.status === 200 };

  /* -------------------------------------------- 2) aboutCards override */
  const cardsPayload = JSON.stringify([
    ...(cardItems ?? []),
    { image: cardRealImg, title: CARD_TITLE_MARK, desc: CARD_DESC_MARK },
  ]);
  const cardsPut = await put(CARDS_KEY, "ko", cardsPayload);
  report.steps.cardsPut = { status: cardsPut.status, error: cardsPut.body?.error, ok: cardsPut.status === 200 };
  if (cardsPut.status !== 200) report.failures.push("PUT aboutCards failed");

  for (const vp of VIEWPORTS) {
    const shot = await capture("aboutcards-override", vp, {
      shot: true,
      markers: [CARD_TITLE_MARK, CARD_DESC_MARK],
      images: [cardRealImg, ...baselineImages],
    });
    report.captures.push(shot);
    if (!shot.markerHit[CARD_TITLE_MARK] || !shot.markerHit[CARD_DESC_MARK]) {
      report.failures.push(`aboutCards override ${shot.viewport}: title/desc marker absent`);
    }
  }

  const cardsRevert = await put(CARDS_KEY, "ko", "");
  report.steps.cardsRevert = { status: cardsRevert.status, ok: cardsRevert.status === 200 };

  /* ------------------------------------------------------- 3) default sweep */
  const defaults = [];
  for (const vp of VIEWPORTS) {
    const shot = await capture("default", vp, {
      shot: true,
      markers: [G3_MARK, CARD_TITLE_MARK, CARD_DESC_MARK],
      images: baselineImages,
    });
    defaults.push(shot);
    report.captures.push(shot);
  }
  report.steps.defaults = defaults;

  /* -------------------------------------------- residue / baseline check */
  const finalGroup = await getJson("/api/admin/registry?group=company&locale=ko");
  const finalG3 = finalGroup.values?.[G3_KEY] ?? "";
  const finalCards = finalGroup.values?.[CARDS_KEY] ?? "";
  report.steps.valuesRestored = {
    gallery: finalG3 === baselineG3,
    aboutCards: finalCards === baselineCards,
    ok: finalG3 === baselineG3 && finalCards === baselineCards,
  };
  if (!report.steps.valuesRestored.ok) report.failures.push("valuesRestored: effective values differ from baseline");

  const baselineByKey = new Map(baseline.map((r) => [r.viewport, r]));
  report.steps.residue = [];
  for (const r of defaults) {
    const base = baselineByKey.get(r.viewport);
    const markersGone = Object.values(r.markerHit).every((v) => v === false);
    const mediaPresent = Object.values(r.imageHit).every(Boolean);
    const pageHeightDelta = base ? r.pageHeight - base.pageHeight : null;
    const heightOk = pageHeightDelta !== null && Math.abs(pageHeightDelta) <= 2;
    const ok = markersGone && mediaPresent && heightOk;
    report.steps.residue.push({
      viewport: r.viewport,
      markersGone,
      mediaPresent,
      pageHeight: r.pageHeight,
      baselinePageHeight: base?.pageHeight ?? null,
      pageHeightDelta,
      ok,
    });
    if (!ok) {
      report.failures.push(
        `residue ${r.viewport}: markersGone=${markersGone} mediaPresent=${mediaPresent} pageHeightDelta=${pageHeightDelta}`,
      );
    }
  }

  report.pass = report.failures.length === 0;
} catch (e) {
  report.error = String((e && e.stack) || e).slice(0, 900);
  report.pass = false;
  report.failures.push(`script error: ${report.error}`);
} finally {
  for (const key of [...dirty]) {
    try {
      await fetch(`${BASE}/api/admin/registry`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Origin: BASE, Cookie: authCookie },
        body: JSON.stringify({ key, locale: "ko", value: "" }),
      });
    } catch {}
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
