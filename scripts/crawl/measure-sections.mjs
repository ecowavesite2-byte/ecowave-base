/** Detailed layout boxes of home sections (vision + banner) at 1440px. */
import { chromium } from "playwright-core";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto("https://imweb8701032505.imweb.me/", { waitUntil: "load", timeout: 30000 }).catch(() => {});
try { await page.waitForSelector("#s20250811004ea868d7376", { timeout: 10000 }); } catch {}
await page.waitForTimeout(1500);

const out = await page.evaluate(() => {
  function dump(secId) {
    const sec = document.querySelector("#" + secId);
    if (!sec) return null;
    const r = sec.getBoundingClientRect();
    const inside = sec.querySelector(".inside");
    const rows = [];
    inside && inside.querySelectorAll(":scope > .doz_row").forEach((row, ri) => {
      const rr = row.getBoundingClientRect();
      const cols = Array.from(row.children).map((col) => {
        const cr = col.getBoundingClientRect();
        const w = col.querySelector("[data-widget-type]");
        const colInfo = {
          grid: col.className.match(/col-dz-(\d+)/)?.[1],
          x: Math.round(cr.x), w: Math.round(cr.width), h: Math.round(cr.height),
          widgets: Array.from(col.querySelectorAll(":scope [data-widget-type]")).slice(0, 4).map((wd) => {
            const t = wd.getAttribute("data-widget-type");
            const wr = wd.closest('[doz_type="widget"]').getBoundingClientRect();
            const img = wd.querySelector("img");
            const box = wd.querySelector("._img_box");
            const fr = wd.querySelector(".fr-view");
            return {
              t,
              x: Math.round(wr.x), y: Math.round(wr.y), w: Math.round(wr.width), h: Math.round(wr.height),
              anim: wd.getAttribute("data-widget-anim"),
              src: wd.querySelector("img") ? (wd.querySelector("img").getAttribute("data-src") || wd.querySelector("img").src) : null,
              boxStyle: wd.querySelector("._img_box") ? wd.querySelector("._img_box").getAttribute("style") : null,
              imgStyle: wd.querySelector("img") ? wd.querySelector("img").getAttribute("style") : null,
              text: fr ? fr.textContent.replace(/\s+/g, " ").trim().slice(0, 60) : null,
            };
          }),
        };
        return colInfo;
      });
      rows.push({ ri, x: Math.round(rr.x), y: Math.round(rr.y), w: Math.round(rr.width), h: Math.round(rr.height), cols });
    });
    return { secH: Math.round(r.height), secY: Math.round(r.y), rows };
  }

  return {
    vision: dump("s20250811004ea868d7376"),
    banner: dump("s202508116d15f8202cd82"),
    pillarsHeading: dump("s20250811611f0c372c57a"),
  };
});

console.log(JSON.stringify(out, null, 1));
const fs = await import("node:fs/promises");
await fs.writeFile("design/section-layouts.json", JSON.stringify(out, null, 1));
await ctx.close();
await browser.close();
