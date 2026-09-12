/** Paging dot visuals + slide transition duration on the original hero. */
import { chromium } from "playwright-core";
import fs from "node:fs/promises";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto("https://imweb8701032505.imweb.me/", { waitUntil: "load", timeout: 30000 }).catch(() => {});
try { await page.waitForSelector(".owl-carousel.owl-loaded", { timeout: 8000 }); } catch {}
await page.waitForTimeout(1500);

// dot visuals (active + inactive) incl pseudo-elements
const dots = await page.evaluate(() => {
  const pag = document.querySelector("#s20250811b5ffbb4730f67 .owl-dots");
  const list = Array.from(pag.querySelectorAll(".owl-dot")).map((d, i) => {
    const cs = getComputedStyle(d);
    const inner = d.querySelector("span, i, div");
    const ics = inner ? getComputedStyle(inner) : null;
    return {
      i,
      cls: d.className,
      active: /active/.test(d.className),
      w: Math.round(d.getBoundingClientRect().width),
      h: Math.round(d.getBoundingClientRect().height),
      border: cs.borderTopWidth + " " + cs.borderTopColor + " " + cs.borderTopStyle,
      borderRadius: cs.borderRadius,
      bg: cs.backgroundColor,
      inner: inner ? { cls: inner.className, w: Math.round(inner.getBoundingClientRect().width), h: Math.round(inner.getBoundingClientRect().height), bg: ics.backgroundColor, border: ics.borderTopWidth + " " + ics.borderTopColor } : null,
    };
  });
  const pagCS = getComputedStyle(pag);
  return { dots: list, pagPos: { bottom: pagCS.bottom, left: pagCS.left, transform: pagCS.transform, justify: pagCS.textAlign } };
});

// transition duration: sample the stage transform every 100ms for 12s
const samples = [];
for (let i = 0; i < 120; i++) {
  const s = await page.evaluate(() => {
    const stage = document.querySelector("#s20250811b5ffbb4730f67 .owl-stage");
    const st = getComputedStyle(stage);
    return { x: stage.style.transform || getComputedStyle(stage).transform, trans: st.transitionDuration };
  });
  samples.push({ t: +(i * 0.1).toFixed(1), x: s.x.replace("translate3d(", "").split(",")[0], dur: s.trans });
  await page.waitForTimeout(100);
}
// detect transition windows
const moves = [];
for (let i = 1; i < samples.length; i++) {
  if (samples[i].x !== samples[i - 1].x) moves.push({ from: samples[i - 1].x, to: samples[i].x, t: samples[i].t });
}
console.log(JSON.stringify({ dots, moves, sampleTail: samples.filter((s, i) => i > 30 && i < 55) }, null, 1));
await fs.writeFile("design/orig-paging.json", JSON.stringify({ dots, samples }, null, 1));
await ctx.close();
await browser.close();
