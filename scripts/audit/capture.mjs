/**
 * Visual audit — screenshot capture
 * Captures full-page PNGs for one side (orig | local) using an identical
 * procedure so the two shoots are directly comparable pixel-by-pixel.
 *
 * Usage:
 *   node scripts/audit/capture.mjs --side=orig|local [--viewport=desktop|mobile|both]
 *        [--only=home,support] [--base=http://localhost:4517] [--out=design/audit]
 */
import { chromium } from "playwright-core";
import fs from "node:fs/promises";
import path from "node:path";
import { PAGES, VIEWPORTS, ORIG_BASE, DEFAULT_LOCAL_BASE } from "./pages.mjs";

const args = process.argv.slice(2);
const getArg = (name, dflt) => {
  const a = args.find((x) => x.startsWith("--" + name + "="));
  return a ? a.split("=")[1] : dflt;
};

const SIDE = getArg("side");
if (!["orig", "local"].includes(SIDE)) {
  console.error("usage: node scripts/audit/capture.mjs --side=orig|local [--viewport=...] [--only=...] [--base=...] [--out=...]");
  process.exit(1);
}
const VP_ARG = getArg("viewport", "both");
const VPS = VP_ARG === "both" ? ["desktop", "mobile"] : [VP_ARG];
for (const v of VPS) {
  if (!VIEWPORTS[v]) {
    console.error(`unknown viewport: ${v} (expected desktop|mobile|both)`);
    process.exit(1);
  }
}
const ONLY = getArg("only", "").split(",").filter(Boolean);
const BASE = SIDE === "orig" ? ORIG_BASE : getArg("base", DEFAULT_LOCAL_BASE);
const OUT = path.resolve(getArg("out", "design/audit"));
const META_PATH = path.join(OUT, "capture-meta.json");

const pages = PAGES.filter((p) => !ONLY.length || ONLY.includes(p.key));

/** harmless on production/original; hides local dev-tool overlays on the rebuild */
const HIDE_DEV_STYLE =
  "nextjs-portal, [data-nextjs-toast], [data-nextjs-dialog], [data-nextjs-dev-tools-button] { display: none !important; }";

/**
 * Original site only (imweb).
 * Its entrance animations live on `_widget_data ... wg_animated ... fadeInUp`
 * widgets, which start at `visibility:hidden; opacity:0` and are only revealed
 * by site_animation.js as they scroll into view. A fast programmatic
 * scroll-through can skip some of them, leaving whole sections blank in the
 * capture. Forcing the known animation end-state makes them render (the exact
 * state a user sees once the animation has finished).
 *
 * Only the widget element is targeted: `visibility` is inherited, so revealing
 * the widget reveals its content, while nested carousel internals (which hide
 * their inactive slides with opacity) are deliberately left hidden.
 */
const FORCE_REVEAL_STYLE = `
  .wg_animated {
    visibility: visible !important;
    opacity: 1 !important;
    transition: none !important;
  }
`;

/**
 * Full-page screenshot.
 * On the original site, Chromium's beyond-viewport (`fullPage`) capture emulates
 * a resize with innerHeight=1. site_animation.js reacts to that resize and
 * re-hides the hero + already-revealed sections, producing large pure-white
 * bands. Freezing page JS for the duration of the capture stops those resize
 * handlers from running, so the laid-out page is captured as-is. The local
 * (Next.js) side does not need this and keeps the plain capture path.
 */
async function fullPageShot(ctx, page, dest) {
  if (SIDE !== "orig") {
    await page.screenshot({
      path: dest,
      fullPage: true,
      type: "png",
      animations: "disabled",
    });
    return;
  }
  const client = await ctx.newCDPSession(page);
  await client.send("Emulation.setScriptExecutionDisabled", { value: true });
  try {
    await page.screenshot({
      path: dest,
      fullPage: true,
      type: "png",
      animations: "disabled",
    });
  } finally {
    await client
      .send("Emulation.setScriptExecutionDisabled", { value: false })
      .catch(() => {});
    await client.detach().catch(() => {});
  }
}

/** step down the page to trigger lazy loads / reveal animations, then return to top */
async function scrollThrough(page) {
  await page.evaluate(async () => {
    await new Promise((res) => {
      let y = 0;
      const step = () => {
        y += 600;
        window.scrollTo(0, y);
        if (y < document.body.scrollHeight + 1200) setTimeout(step, 50);
        else {
          window.scrollTo(0, 0);
          res();
        }
      };
      step();
    });
  });
  await page.waitForTimeout(300);
}

async function loadMeta() {
  try {
    return JSON.parse(await fs.readFile(META_PATH, "utf8"));
  } catch {
    return {};
  }
}

/** capture a single page; returns the metadata record (throws on failure) */
async function captureOne(browser, viewport, key, url) {
  const vp = VIEWPORTS[viewport];
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    colorScheme: "light",
  });
  try {
    const page = await ctx.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(url, { waitUntil: "load", timeout: 45000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(600);
    await page.addStyleTag({ content: HIDE_DEV_STYLE });
    await scrollThrough(page);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(900);
    if (SIDE === "orig") {
      await page.addStyleTag({ content: FORCE_REVEAL_STYLE });
      await page.waitForTimeout(200);
    }

    const destDir = path.join(OUT, SIDE, viewport);
    await fs.mkdir(destDir, { recursive: true });
    const dest = path.join(destDir, `${key}.png`);

    // The original side freezes page JS for the capture; resuming it can reflow
    // the page, so record the height *before* the shot. Use the document content
    // height (what Playwright captures) rather than body.scrollHeight, which can
    // under-report when a page (e.g. /28) has content outside the body flow.
    const infoBefore =
      SIDE === "orig"
        ? await page.evaluate(() => ({
            pageHeight: Math.max(
              document.body.scrollHeight,
              document.documentElement.scrollHeight,
            ),
            title: document.title,
          }))
        : null;

    await fullPageShot(ctx, page, dest);

    const info =
      infoBefore ??
      (await page.evaluate(() => ({
        pageHeight: document.body.scrollHeight,
        title: document.title,
      })));
    return {
      url,
      finalUrl: page.url(),
      title: info.title,
      pageHeight: info.pageHeight,
      capturedAt: new Date().toISOString(),
      ok: true,
    };
  } finally {
    await ctx.close();
  }
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  console.log(
    `capture side=${SIDE} viewports=${VPS.join(",")} pages=${pages.length} base=${BASE}`,
  );
  const meta = await loadMeta();
  const failures = [];

  for (const viewport of VPS) {
    for (const p of pages) {
      const url = BASE + (SIDE === "orig" ? p.orig : p.local);
      let record = null;
      let lastErr = null;
      // one retry per page, then continue past failures
      for (let attempt = 1; attempt <= 2 && !record; attempt++) {
        try {
          record = await captureOne(browser, viewport, p.key, url);
        } catch (e) {
          lastErr = e;
          console.error(
            `  [${SIDE}/${viewport}] ${p.key} attempt ${attempt} failed: ${e.message.split("\n")[0]}`,
          );
        }
      }
      if (!record) {
        record = {
          url,
          finalUrl: null,
          title: null,
          pageHeight: null,
          capturedAt: new Date().toISOString(),
          ok: false,
          error: lastErr ? lastErr.message.split("\n")[0] : "unknown error",
        };
        failures.push(`${viewport}/${p.key}`);
      }
      meta[SIDE] = meta[SIDE] || {};
      meta[SIDE][viewport] = meta[SIDE][viewport] || {};
      meta[SIDE][viewport][p.key] = record;
      console.log(
        `  [${SIDE}/${viewport}] ${p.key} ${record.ok ? "ok h=" + record.pageHeight : "FAIL"}`,
      );
    }
  }

  await browser.close();
  await fs.mkdir(OUT, { recursive: true });
  await fs.writeFile(META_PATH, JSON.stringify(meta, null, 2));

  const captured = pages.length * VPS.length - failures.length;
  const total = pages.length * VPS.length;
  console.log(`\ncaptured ${captured}/${total}; failed: ${failures.length}`);
  if (failures.length) {
    console.error("failed pages: " + failures.join(", "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
