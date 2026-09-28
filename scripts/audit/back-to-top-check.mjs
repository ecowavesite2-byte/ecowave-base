/**
 * Back-to-top button check (independent verification).
 *
 * Scrolls to the bottom, finds the scroll-to-top control(s), clicks them with
 * real pointer events and asserts the page scrolls back to the top.
 *
 * Usage:
 *   node scripts/audit/back-to-top-check.mjs [--tag=run] [--pages=/,/notices]
 *
 * Writes design/audit/mobile-spacing/back-to-top-check-<tag>.json and prints a table.
 */
import { chromium } from "playwright-core";
import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_LOCAL_BASE } from "./pages.mjs";

const args = process.argv.slice(2);
const getArg = (n, d) => {
  const a = args.find((x) => x.startsWith("--" + n + "="));
  return a ? a.slice(n.length + 3) : d;
};
const TAG = getArg("tag", "run");
const BASE = getArg("base", DEFAULT_LOCAL_BASE);
const ROUTES = getArg("pages", "/,/notices").split(",").filter(Boolean);
const OUT = path.resolve("design/audit/mobile-spacing");

const VIEWPORTS = [
  ["mobile", { width: 390, height: 844 }],
  ["desktop", { width: 1440, height: 900 }],
];

const HIDE_DEV_STYLE =
  "nextjs-portal, [data-nextjs-toast], [data-nextjs-dialog], [data-nextjs-dev-tools-button] { display: none !important; }";

const FIND_CANDIDATES = () => {
  const out = [];
  const seen = new Set();
  const push = (el, why) => {
    if (!el || seen.has(el)) return;
    seen.add(el);
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    out.push({
      why,
      tag: el.tagName.toLowerCase(),
      cls: (typeof el.className === "string" ? el.className : "").slice(0, 120),
      href: el.getAttribute("href") || "",
      text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40),
      x: r.x,
      y: r.y,
      w: r.width,
      h: r.height,
      display: cs.display,
      visibility: cs.visibility,
      position: cs.position,
      pointerEvents: cs.pointerEvents,
      zIndex: cs.zIndex,
    });
  };
  for (const a of document.querySelectorAll('a[href*="doz_header"], a[href*="btn_top"]')) push(a, "anchor");
  for (const a of document.querySelectorAll('[class*="btn_top"], [class*="back-to-top"], [class*="backToTop"]')) {
    push(a.tagName === "A" || a.tagName === "BUTTON" ? a : a.querySelector("a,button") || a, "class");
  }
  // fixed overlays in the lower-right quadrant that contain an image or button
  for (const el of document.querySelectorAll("section, div")) {
    const cs = getComputedStyle(el);
    if (cs.position !== "fixed") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 20 || r.height < 20) continue;
    if (r.x < window.innerWidth * 0.7 || r.y < window.innerHeight * 0.5) continue;
    push(el.querySelector("a,button") || el, "fixed-overlay");
  }
  return out;
};

async function checkRoute(browser, vpName, vp, label, url) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, colorScheme: "light" });
  try {
    const page = await ctx.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(BASE + url, { waitUntil: "load", timeout: 60000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.addStyleTag({ content: HIDE_DEV_STYLE });
    await page.waitForTimeout(600);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(700);

    const candidates = await page.evaluate(FIND_CANDIDATES);
    const results = [];
    for (const c of candidates) {
      const visible = c.display !== "none" && c.visibility !== "hidden" && c.w > 0 && c.h > 0;
      const record = { ...c, visible, clicked: false, scrollBefore: null, scrollAfter: null, pass: null };
      if (visible) {
        record.scrollBefore = await page.evaluate(() => Math.round(window.scrollY));
        if (record.scrollBefore > 200) {
          await page.mouse.click(c.x + c.w / 2, c.y + c.h / 2);
          record.clicked = true;
          await page.waitForTimeout(1000);
          record.scrollAfter = await page.evaluate(() => Math.round(window.scrollY));
          record.pass = record.scrollAfter < 100;
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await page.waitForTimeout(500);
        }
      }
      results.push(record);
    }
    return { label, vp: vpName, url, ok: true, candidates: results };
  } catch (e) {
    return { label, vp: vpName, url, ok: false, error: e.message.split("\n")[0] };
  } finally {
    await ctx.close();
  }
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const out = [];
  try {
    for (const [vpName, vp] of VIEWPORTS) {
      for (const route of ROUTES) {
        for (const [loc, prefix] of [["ko", ""], ["en", "/en"]]) {
          const url = loc === "en" ? (route === "/" ? "/en" : "/en" + route) : route;
          const label = `${vpName} ${loc} ${route}`;
          const r = await checkRoute(browser, vpName, vp, label, url);
          out.push(r);
          const vis = (r.candidates || []).filter((c) => c.visible);
          const clicked = vis.filter((c) => c.clicked);
          const pass = clicked.filter((c) => c.pass);
          console.log(
            `${label.padEnd(28)} visible=${vis.length} clicked=${clicked.length} pass=${pass.length}` +
              (vis.length && !pass.length ? "  <-- NO WORKING CONTROL" : ""),
          );
          for (const c of vis) {
            console.log(
              `    [${c.why}] ${c.tag}.${c.cls.slice(0, 40)} href='${c.href}' pos=${c.position} ` +
                `before=${c.scrollBefore} after=${c.scrollAfter} pass=${c.pass}`,
            );
          }
        }
      }
    }
  } finally {
    await browser.close();
  }
  await fs.mkdir(OUT, { recursive: true });
  const file = path.join(OUT, `back-to-top-check-${TAG}.json`);
  await fs.writeFile(file, JSON.stringify(out, null, 2));
  console.log(`\nwrote ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
