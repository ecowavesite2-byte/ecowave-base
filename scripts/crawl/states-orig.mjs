/** Captures card hover state + hero autoplay timing on the original. */
import { chromium } from "playwright-core";
import fs from "node:fs/promises";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto("https://imweb8701032505.imweb.me/", { waitUntil: "load", timeout: 30000 }).catch(() => {});
try { await page.waitForSelector(".owl-carousel.owl-loaded", { timeout: 8000 }); } catch {}
await page.waitForTimeout(1200);

// ---- card hover state ----
await page.evaluate(() => {
  const card = document.querySelector('#s20250811004ea868d7376 [data-widget-type="image"] a');
  card.scrollIntoView({ block: "center" });
});
await page.waitForTimeout(800);
const hoverBefore = await page.evaluate(() => {
  const imgWidget = document.querySelector('#s20250811004ea868d7376 [data-widget-type="image"]');
  const hoverImg = imgWidget.querySelector("._hover_image");
  const overlay = imgWidget.querySelector(".hover_txt");
  return {
    hoverImgOpacity: getComputedStyle(hoverImg).opacity,
    hoverImgTransform: getComputedStyle(hoverImg).transform,
    overlayOpacity: getComputedStyle(overlay).opacity,
    overlayTransform: getComputedStyle(overlay).transform,
    overlayTransition: getComputedStyle(overlay).transition,
    titleColor: overlay.querySelector("h5") ? getComputedStyle(overlay.querySelector("h5")).color : null,
  };
});
await page.hover('#s20250811004ea868d7376 [data-widget-type="image"] a');
await page.waitForTimeout(900);
const hoverAfter = await page.evaluate(() => {
  const imgWidget = document.querySelector('#s20250811004ea868d7376 [data-widget-type="image"]');
  const hoverImg = imgWidget.querySelector("._hover_image");
  const overlay = imgWidget.querySelector(".hover_txt");
  return {
    hoverImgOpacity: getComputedStyle(hoverImg).opacity,
    hoverImgTransform: getComputedStyle(hoverImg).transform,
    overlayOpacity: getComputedStyle(overlay).opacity,
    overlayTransform: getComputedStyle(overlay).transform,
    overlayTransition: getComputedStyle(overlay).transition,
    mainImgOpacity: getComputedStyle(imgWidget.querySelector("._img_box img")).opacity,
    titleColor: overlay.querySelector("h5") ? getComputedStyle(overlay.querySelector("h5")).color : null,
    addIconColor: overlay.querySelector(".material-symbols-outlined, span[class*=icon]") ? getComputedStyle(overlay.querySelector(".material-symbols-outlined, span[class*=icon]")).color : null,
  };
});

// ---- hero autoplay timing: watch the active dot ----
const dotTimes = [];
for (let i = 0; i < 24; i++) {
  const state = await page.evaluate(() => {
    const dots = document.querySelectorAll("#s20250811b5ffbb4730f67 .owl-dot");
    const active = Array.from(dots).findIndex((d) => d.className.includes("active"));
    // also read owl stage transform to detect slide changes
    const stage = document.querySelector("#s20250811b5ffbb4730f67 .owl-stage");
    return { active, transform: stage ? stage.style.transform : "" };
  });
  dotTimes.push({ t: i * 0.5, ...state });
  await page.waitForTimeout(500);
}
// find transitions
const flips = [];
for (let i = 1; i < dotTimes.length; i++) {
  if (dotTimes[i].active !== dotTimes[i - 1].active) flips.push({ from: dotTimes[i - 1].active, to: dotTimes[i].active, t: dotTimes[i].t });
}

const out = { hoverBefore, hoverAfter, dotTimes, flips };
console.log(JSON.stringify(out, null, 1));
await fs.writeFile("design/orig-states.json", JSON.stringify(out, null, 1));
await ctx.close();
await browser.close();
