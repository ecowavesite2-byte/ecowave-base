import { chromium } from "playwright-core";
import fs from "node:fs/promises";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto("https://imweb8701032505.imweb.me/17", { waitUntil: "load", timeout: 30000 }).catch(() => {});
try { await page.waitForSelector(".owl-carousel.owl-loaded", { timeout: 8000 }); } catch {}
await page.waitForTimeout(1200);

const out = await page.evaluate(() => {
  const out2 = [];
  document.querySelectorAll("._widget_data[data-widget-type='gallery2']").forEach((w) => {
    const cont = w.querySelector('[class*="gallery2"], [class*="img_rendering"]');
    const gridMatch = cont ? cont.className.match(/grid_(\d+)/) : null;
    const slideMatch = cont ? cont.className.match(/slide_(\d+)/) : null;
    const col = cont ? cont.closest(".col-dz") : null;
    const item = w.querySelector(".owl-item:not(.cloned) .item_gallary, .owl-item:not(.cloned) ._item");
    out2.push({
      layout: /type_slide/.test(cont?.className || "") ? "slide" : "grid",
      gridN: gridMatch ? gridMatch[1] : null,
      slideN: slideMatch ? slideMatch[1] : null,
      itemW: item ? Math.round(item.getBoundingClientRect().width) : null,
      itemH: item ? Math.round(item.getBoundingClientRect().height) : null,
      colW: col ? Math.round(col.getBoundingClientRect().width) : null,
    });
  });
  return out2;
});

console.log(JSON.stringify(out, null, 1));
await fs.writeFile("E:/Projects/ecowave/design/gallery-classes.json", JSON.stringify(out, null, 1));
await ctx.close();
await browser.close();
