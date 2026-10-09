/**
 * Container geometry around specific widgets on the original imweb site vs the
 * local rebuild, across viewports. Grounds the "fluid layout / cover larger
 * screens" change.
 *
 * Usage: node scripts/audit/measure-container.mjs
 */
import { chromium } from "playwright-core";

const WIDTHS = [1280, 1440, 1920, 2560];

/** each target: { label, orig url, local url, widgetId } */
const TARGETS = [
  {
    label: "home nav-card 1",
    orig: "https://imweb8701032505.imweb.me/",
    local: "http://localhost:4517/",
    selOrig: "#w20250811c8b38b2e2cde9",
    selLocal: '[data-widget-id="w20250811c8b38b2e2cde9"]',
  },
  {
    label: "home vision section",
    orig: "https://imweb8701032505.imweb.me/",
    local: "http://localhost:4517/",
    selOrig: "#s20250811004ea868d7376",
    selLocal: 'section:has([data-widget-id="w20250811c8b38b2e2cde9"])',
  },
  {
    label: "philosophy 3-step card IDE",
    orig: "https://imweb8701032505.imweb.me/18",
    local: "http://localhost:4517/company/philosophy",
    selOrig: "#w2025082996725d2a2d20e",
    selLocal: '[data-widget-id="w2025082996725d2a2d20e"]',
  },
];

const browser = await chromium.launch({ channel: "chrome", headless: true });

async function measure(url, sel, width) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: "load", timeout: 45000 }).catch(() => {});
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForTimeout(600);
    return await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return { found: false, vw: window.innerWidth };
      const box = (e) =>
        e
          ? {
              x: Math.round(e.getBoundingClientRect().x),
              w: Math.round(e.getBoundingClientRect().width),
              h: Math.round(e.getBoundingClientRect().height),
            }
          : null;
      const row = el.closest(".imweb-row") || el.closest(".doz_row");
      const col = el.closest(".imweb-col") || el.closest("[class*=col-dz]");
      const inside = el.closest(".inside");
      return {
        found: true,
        vw: window.innerWidth,
        widget: box(el),
        col: box(col),
        row: box(row),
        inside: box(inside),
      };
    }, sel);
  } finally {
    await ctx.close();
  }
}

for (const t of TARGETS) {
  console.log(`\n=== ${t.label} ===`);
  for (const w of WIDTHS) {
    const o = await measure(t.orig, t.selOrig, w);
    const l = await measure(t.local, t.selLocal, w);
    console.log(
      `  ${String(w).padStart(4)} | orig ${JSON.stringify(o)} | local ${JSON.stringify(l)}`,
    );
  }
}

await browser.close();
