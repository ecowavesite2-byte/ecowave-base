/** Captures full-page screenshots of the rebuilt site for visual review. */
import { chromium } from "playwright-core";
import fs from "node:fs/promises";

const PAGES = [
  "home",
  "company/about",
  "company/history",
  "rnd",
  "products",
  "products/eco-wave",
  "news",
  "notices",
  "support",
];

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

for (const key of PAGES) {
  const url = key === "home" ? "http://localhost:3000/" : `http://localhost:3000/${key}`;
  await page.goto(url, { waitUntil: "load", timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.evaluate(async () => {
    await new Promise((res) => {
      let y = 0;
      const step = () => {
        y += 700;
        window.scrollTo(0, y);
        if (y < document.body.scrollHeight + 1400) setTimeout(step, 40);
        else { window.scrollTo(0, 0); res(); }
      };
      step();
    });
  });
  await page.waitForTimeout(500);
  const dir = "design/rebuilt";
  await fs.mkdir(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${key.replace(/\//g, ".")}.jpg`, fullPage: true, type: "jpeg", quality: 72 });
  console.log("shot", key);
}
await ctx.close();
await browser.close();
