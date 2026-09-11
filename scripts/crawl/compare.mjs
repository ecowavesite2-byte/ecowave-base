/**
 * Compares the rebuilt local site against design/metrics.json (original).
 * Measures section count/heights and key typography at 1440px.
 */
import { chromium } from "playwright-core";

const orig = (await import("node:fs/promises")).default;
const fs = orig;

const metrics = JSON.parse(await fs.readFile("design/metrics.json", "utf8"));
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const page = await ctx.newPage();

const LOCAL = {
  home: "http://localhost:3000/",
  "company/about": "http://localhost:3000/company/about",
  "company/history": "http://localhost:3000/company/history",
  "products/eco-wave": "http://localhost:3000/products/eco-wave",
  news: "http://localhost:3000/news",
  support: "http://localhost:3000/support",
};

for (const [key, url] of Object.entries(LOCAL)) {
  await page.goto(url, { waitUntil: "load", timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(800);
  const m = await page.evaluate(() => {
    const secs = Array.from(document.querySelectorAll("main section"));
    return {
      sections: secs.map((s) => {
        const r = s.getBoundingClientRect();
        const texts = Array.from(
          s.querySelectorAll("h1,h2,h3,h5,h6,p,strong,span"),
        )
          .filter((t) => !t.children.length && t.textContent.trim())
          .slice(0, 4)
          .map((t) => {
            const c = getComputedStyle(t);
            return {
              size: c.fontSize,
              weight: c.fontWeight,
              color: c.color,
              text: t.textContent.trim().slice(0, 30),
            };
          });
        return { h: Math.round(r.height), texts };
      }),
      header: (() => {
        const h = document.querySelector("header");
        return h ? Math.round(h.getBoundingClientRect().height) : 0;
      })(),
    };
  });
  const o = metrics[key];
  console.log("\n=== " + key);
  console.log(
    "  original sections:",
    o.sections.length,
    "| rebuilt:",
    m.sections.length,
    "| header h:",
    m.header,
  );
  for (let i = 0; i < Math.max(o.sections.length, m.sections.length); i++) {
    const os = o.sections[i];
    const ms = m.sections[i];
    const oh = os ? os.h : "-";
    const mh = ms ? ms.h : "-";
    const ot = os?.texts?.[0]
      ? `${os.texts[0].size} ${os.texts[0].text.slice(0, 22)}`
      : "";
    const mt = ms?.texts?.[0]
      ? `${ms.texts[0].size} ${ms.texts[0].text.slice(0, 22)}`
      : "";
    console.log(`  [#${i}] orig h=${oh} "${ot}" | rebuilt h=${mh} "${mt}"`);
  }
}
await ctx.close();
await browser.close();
