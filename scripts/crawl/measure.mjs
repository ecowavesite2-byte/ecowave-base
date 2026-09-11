/**
 * Measures desktop (1440px) design metrics of key pages from the source site:
 * section heights, backgrounds, and computed typography — design reference for rebuild.
 * Output: design/metrics.json
 */
import { chromium } from "playwright-core";
import fs from "node:fs/promises";

const BASE = "https://imweb8701032505.imweb.me";
const PAGES = [
  { key: "home", url: BASE + "/" },
  { key: "company/about", url: BASE + "/17" },
  { key: "company/history", url: BASE + "/19" },
  { key: "products/eco-wave", url: BASE + "/37" },
  { key: "news", url: BASE + "/29" },
  { key: "support", url: BASE + "/28" },
];

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const out = {};
for (const p of PAGES) {
  await page.goto(p.url, { waitUntil: "load", timeout: 30000 }).catch(() => {});
  try { await page.waitForSelector("div.section_wrap", { timeout: 8000 }); } catch {}
  await page.waitForTimeout(1200);
  const m = await page.evaluate(() => {
    const secs = Array.from(document.querySelectorAll("body > div.section_wrap"));
    const sections = secs
      .map((s, i) => {
        const r = s.getBoundingClientRect();
        if (r.height < 2) return null; // hidden (other breakpoint variant)
        const bgEl = s.querySelector(":scope > .section_bg");
        const bg = bgEl && bgEl.style.backgroundImage ? bgEl.style.backgroundImage.slice(5, 110) : null;
        const bgc = bgEl && bgEl.style.backgroundColor !== "rgba(0, 0, 0, 0)" ? bgEl.style.backgroundColor : null;
        const overlay = (s.getAttribute("style") || "").match(/background-color:\s*([^;]+)/);
        const texts = Array.from(s.querySelectorAll("h1,h2,h3,h4,h5,h6,p,strong,span,em"))
          .slice(0, 10)
          .map((t) => {
            if (t.children.length > 2) return null;
            const c = getComputedStyle(t);
            const txt = t.textContent.replace(/\s+/g, " ").trim();
            if (!txt) return null;
            return { tag: t.tagName, size: c.fontSize, weight: c.fontWeight, color: c.color, lh: c.lineHeight, ls: c.letterSpacing, align: c.textAlign, text: txt.slice(0, 44) };
          })
          .filter(Boolean)
          .slice(0, 8);
        // first big widget boxes for layout hints
        const boxes = Array.from(s.querySelectorAll(".col-dz")).slice(0, 6).map((c) => {
          const cr = c.getBoundingClientRect();
          return { grid: (c.className.match(/col-dz-(\d+)/) || [])[1], w: Math.round(cr.width), h: Math.round(cr.height) };
        });
        return { i, cls: s.className.replace(/\s+/g, " ").trim(), h: Math.round(r.height), bg, bgc, overlay: overlay ? overlay[1] : null, texts, boxes };
      })
      .filter(Boolean);
    const header = document.querySelector("#doz_header_wrap");
    const cs = (el) => (el ? getComputedStyle(el) : null);
    const menuA = document.querySelector(".viewport-nav.desktop._main_menu > li.dropdown > a");
    const hero = sections[0];
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      header: {
        h: Math.round(header.getBoundingClientRect().height),
        pos: cs(header).position,
        bg: cs(header).backgroundColor,
        menuFont: menuA ? { size: cs(menuA).fontSize, weight: cs(menuA).fontWeight, color: cs(menuA).color, pad: cs(menuA).padding, lh: cs(menuA).lineHeight } : null,
      },
      sections,
    };
  });
  out[p.key] = m;
  console.log("measured", p.key, "-", m.sections.length, "visible sections");
}
await ctx.close();
await browser.close();
await fs.writeFile("design/metrics.json", JSON.stringify(out, null, 1));
console.log("done -> design/metrics.json");
