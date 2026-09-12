import { chromium } from "playwright-core";
import fs from "node:fs/promises";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto("https://imweb8701032505.imweb.me/", { waitUntil: "load", timeout: 30000 }).catch(() => {});
try { await page.waitForSelector(".owl-carousel.owl-loaded", { timeout: 8000 }); } catch {}
await page.waitForTimeout(1200);

const r = await page.evaluate(() => {
  const hero = document.querySelector("#s20250811b5ffbb4730f67");
  // owl animated-out/in animation rules from stylesheets
  const animRules = [];
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        const txt = rule.cssText || "";
        if (/owl-animated|fadeOut|fadeIn/.test(txt) && /animation/.test(txt)) animRules.push(txt.slice(0, 160));
        if (rule.cssRules) {
          for (const r2 of rule.cssRules) {
            const t2 = r2.cssText || "";
            if (/owl-animated|fadeOut|fadeIn/.test(t2) && /animation/.test(t2)) animRules.push(t2.slice(0, 160));
          }
        }
      }
    } catch {}
  }
  // dot opacity comparison
  const pag = hero.querySelector(".owl-dots");
  const dots = Array.from(pag.querySelectorAll(".owl-dot")).map((d) => {
    const inner = d.querySelector("span, i, div");
    return { active: /active/.test(d.className), innerOpacity: inner ? getComputedStyle(inner).opacity : null, dOpacity: getComputedStyle(d).opacity };
  });
  // outgoing slide style during transition
  const animated = hero.querySelectorAll(".owl-animated-out, .owl-animated-in");
  return { animRules: animRules.slice(0, 6), dots, animatedOut: animated.length };
});

console.log(JSON.stringify(r, null, 1));
await fs.writeFile("design/orig-anim-detail.json", JSON.stringify(r, null, 1));
await ctx.close();
await browser.close();
