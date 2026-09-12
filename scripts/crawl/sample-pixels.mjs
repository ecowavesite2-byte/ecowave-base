/** Samples pixel rows from original vs rebuilt home screenshots to spot bg differences. */
import { chromium } from "playwright-core";
import fs from "node:fs/promises";
import path from "node:path";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 900, height: 600 } });
const page = await ctx.newPage();

async function sample(file) {
  const abs = path.resolve(file);
  const b64 = (await fs.readFile(abs)).toString("base64");
  return await page.evaluate(async (data) => {
    const img = new Image();
    img.src = "data:image/jpeg;base64," + data.b64;
    await new Promise((res) => (img.onload = res));
    const W = img.width, H = img.height;
    const canvas = new OffscreenCanvas(W, H);
    const ctx2 = canvas.getContext("2d");
    ctx2.drawImage(img, 0, 0);
    // sample horizontal strips every 100px of height: average RGB + stddev
    const out = { w: W, h: H, rows: [] };
    for (let y = 0; y < H; y += Math.round(H / 40)) {
      let r = 0, g = 0, b = 0, n = 0, min = 255, max = 0;
      for (let x = 0; x < W; x += Math.max(1, Math.round(W / 60))) {
        const d = ctx2.getImageData(x, y, 1, 1).data;
        r += d[0]; g += d[1]; b += d[2]; n++;
        const lum = 0.299 * d[0] + 0.587 * d[1] + 0.114 * d[2];
        if (lum < min) min = lum;
        if (lum > max) max = lum;
      }
      out.rows.push({ y, avg: [Math.round(r / n), Math.round(g / n), Math.round(b / n)], spread: Math.round(max - min) });
    }
    return out;
  }, { b64 });
}

const orig = await sample("design/orig-home-fresh.jpg");
const rebuilt = await sample("design/rebuilt-home.jpg");
console.log("ORIGINAL (h=" + orig.h + "): rows with high spread = imagery");
orig.rows.forEach((r) => console.log(` y=${r.y} avg=${r.avg} spread=${r.spread}${r.spread > 60 ? "  <-- imagery" : ""}`));
console.log("\nREBUILT (h=" + rebuilt.h + "):");
rebuilt.rows.forEach((r) => console.log(` y=${r.y} avg=${r.avg} spread=${r.spread}${r.spread > 60 ? "  <-- imagery" : ""}`));

await browser.close();
