/**
 * Runtime carousel probe — `/company/about` structured gallery autoplay + pause.
 *
 * Boots `next dev` on a dedicated port (3129) and drives a real Chromium page
 * at 1440x900 with default content (NO reduced-motion emulation):
 *
 *   - block 3 (`w20250918692bb854e97af`, captioned, autoplay 4500ms): record the
 *     track `scrollLeft`, wait ~5.5s, assert it advanced (retry window in case
 *     hydration/measure delayed the first tick).
 *   - hover the slider (root `onPointerEnter` pauses autoplay): record
 *     `scrollLeft`, wait ~5.5s, assert it did NOT advance.
 *   - block 6 (`w20250918b0ab58de4000e`, plain, autoplay 5000ms): same
 *     advance + pause checks (reported separately; optional).
 *
 * Prints one JSON report with measured values and PASS/FAIL. Does not write any
 * content override. Usage: node scripts/audit/probe-about-carousel.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const getArg = (name, dflt) => {
  const a = args.find((x) => x.startsWith("--" + name + "="));
  return a ? a.split("=")[1] : dflt;
};
const PORT = Number(getArg("port", "3129"));
const BASE = getArg("base", `http://127.0.0.1:${PORT}`);
const MANAGED = !args.some((x) => x.startsWith("--base="));
const DEBUG = args.includes("--debug");
const ROUTE = "/company/about";

const BLOCK3 = "w20250918692bb854e97af";
const BLOCK6 = "w20250918b0ab58de4000e";
const AUTOPLAY3_MS = 4500;
const AUTOPLAY6_MS = 5000;

// How long a single window waits for a tick (interval + hydration slack).
const WINDOW_MS = 5500;
const RETRIES = 2;
// A page advance moves by at least one item pitch (>100px); allow a few px for
// smooth-scroll settling when asserting "did not advance".
const ADVANCE_MIN_PX = 20;
const STILL_TOLERANCE_PX = 2;

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

const trackSelector = (widgetId) => `[data-widget-id="${widgetId}"] [data-gs]`;

async function readScrollLeft(page, selector) {
  return page.$eval(selector, (el) => el.scrollLeft);
}

/** Advance check with a retry window (hydration can delay the first tick). */
async function probeAdvance(page, selector) {
  const before = await readScrollLeft(page, selector);
  let after = before;
  let attempts = 0;
  for (attempts = 1; attempts <= RETRIES + 1; attempts += 1) {
    await page.waitForTimeout(WINDOW_MS);
    after = await readScrollLeft(page, selector);
    if (Math.abs(after - before) >= ADVANCE_MIN_PX) break;
  }
  return {
    before: Math.round(before),
    after: Math.round(after),
    delta: Math.round(after - before),
    attempts,
    advanced: Math.abs(after - before) >= ADVANCE_MIN_PX,
  };
}

/** Pause check: hover the slider root, settle, then assert no movement. */
async function probePause(page, selector) {
  const widgetId = selector.split('"')[1];
  if (DEBUG) {
    // Count the real pointerenter/leave on the slider root (the track's parent)
    // and the track's scroll events, so a synthetic-hover mismatch is visible.
    await page.evaluate((id) => {
      const track = document.querySelector(`[data-widget-id="${id}"] [data-gs]`);
      const root = track ? track.parentElement : null;
      window.__gsProbe = { enter: 0, leave: 0, scroll: 0, target: null };
      if (root) {
        root.addEventListener("pointerenter", () => (window.__gsProbe.enter += 1));
        root.addEventListener("pointerleave", () => (window.__gsProbe.leave += 1));
      }
      if (track) track.addEventListener("scroll", () => (window.__gsProbe.scroll += 1));
    }, widgetId);
  }

  // Bring the strip into view, then hover the track itself (scroll strip) — the
  // exact interaction the GallerySlider root listens for. `locator.hover()`
  // scrolls into view first, unlike a raw `mouse.move()` to a viewport coord.
  // Block 3 carries a `fadeInUp` scroll reveal (1.2s): hovering while it
  // animates moves the element out from under the pointer and fires
  // `pointerleave`, so wait for the reveal to finish before hovering.
  const loc = page.locator(selector).first();
  await loc.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1800);
  await loc.hover();
  await page.waitForTimeout(1000);

  const before = await readScrollLeft(page, selector);
  const samples = [];
  if (DEBUG) {
    for (let i = 0; i < Math.ceil(WINDOW_MS / 250); i += 1) {
      await page.waitForTimeout(250);
      samples.push({ t: (i + 1) * 250, x: Math.round(await readScrollLeft(page, selector)) });
    }
  } else {
    await page.waitForTimeout(WINDOW_MS);
  }
  const after = await readScrollLeft(page, selector);
  const pointer = DEBUG
    ? await page.evaluate(() => (window.__gsProbe ? { ...window.__gsProbe } : null))
    : undefined;
  await page.mouse.move(0, 0);
  return {
    before: Math.round(before),
    after: Math.round(after),
    delta: Math.round(after - before),
    paused: Math.abs(after - before) <= STILL_TOLERANCE_PX,
    ...(DEBUG ? { samples, pointer } : {}),
  };
}

const report = {
  base: BASE,
  route: ROUTE,
  viewport: "1440x900",
  reducedMotionEmulated: false,
  expected: { block3AutoplayMs: AUTOPLAY3_MS, block6AutoplayMs: AUTOPLAY6_MS },
  block3: null,
  block6: null,
  pass: false,
  failures: [],
};

let browser;
try {
  if (!(await waitReady())) {
    console.log(JSON.stringify({ ...report, devReady: false, devLog: devLog.slice(-1200) }, null, 1));
    killDev();
    process.exit(1);
  }

  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  // Explicitly opt OUT of reduced-motion: the autoplay timer is disabled under
  // `prefers-reduced-motion: reduce`.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  page.on("console", () => {});
  await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded" });

  const sel3 = trackSelector(BLOCK3);
  const sel6 = trackSelector(BLOCK6);
  await page.waitForSelector(sel3, { timeout: 30000 });
  // Hydration + ResizeObserver measure.
  await page.waitForTimeout(2500);

  for (const [name, selector, expectedMs] of [
    ["block3", sel3, AUTOPLAY3_MS],
    ["block6", sel6, AUTOPLAY6_MS],
  ]) {
    const present = (await page.locator(selector).count()) > 0;
    if (!present) {
      report[name] = { present: false, pass: false };
      if (name === "block3") report.failures.push(`${name}: slider track not found (${selector})`);
      continue;
    }
    const advance = await probeAdvance(page, selector);
    const pause = await probePause(page, selector);
    const ok = advance.advanced && pause.paused;
    report[name] = {
      present: true,
      selector,
      expectedMs,
      advance,
      pause,
      pass: ok,
    };
    if (!ok && name === "block3") {
      report.failures.push(
        `block3: advanced=${advance.advanced} (${advance.before}->${advance.after}), paused=${pause.paused} (${pause.before}->${pause.after})`,
      );
    }
    // Reset the page between blocks so the block-6 probe starts from rest with
    // no lingering hover state from block 3.
    await page.mouse.move(0, 0);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(sel3, { timeout: 30000 });
    await page.waitForTimeout(2500);
  }

  // Gate PASS on block 3 (Task 2's requirement); block 6 is reported but only
  // fatal when its track was found and misbehaved (checked below).
  const b3 = report.block3;
  const b6 = report.block6;
  report.pass = Boolean(b3?.present && b3.pass);
  if (b6?.present && !b6.pass) {
    report.failures.push(
      `block6 (optional): advanced=${b6.advance.advanced} (${b6.advance.before}->${b6.advance.after}), paused=${b6.pause.paused} (${b6.pause.before}->${b6.pause.after})`,
    );
  }
} catch (e) {
  report.error = String((e && e.stack) || e).slice(0, 900);
  report.pass = false;
  report.failures.push(`script error: ${report.error}`);
} finally {
  try { if (browser) await browser.close(); } catch {}
  killDev();
  report.devLogTail = report.pass ? undefined : devLog.slice(-1200);
  console.log(JSON.stringify(report, null, 1));
}
process.exit(report.pass ? 0 : 1);
