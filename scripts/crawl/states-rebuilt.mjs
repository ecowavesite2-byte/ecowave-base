/** Verifies MY rebuild's section 1 + 2 states: card hover (default/hover),
 * hero autoplay timing, paging dots, reveal animations. */
import { chromium } from "playwright-core";
import fs from "node:fs/promises";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

// ---- card hover ----
await page.evaluate(() => {
  document.querySelectorAll(".group.relative.block, a.group.block").forEach((el) => {
    if (/회사소개|Company/.test(el.textContent) && el.querySelector("img, [style*=background-image]")) el.scrollIntoView({ block: "center" });
  });
});
await page.waitForTimeout(800);
const cardSel = 'a[href*="/company"]';
const hoverBefore = await page.evaluate((sel) => {
  const card = document.querySelector(sel);
  const overlay = card ? card.querySelector(".group-hover\\:opacity-100") || card.querySelector(".absolute.inset-0.flex") : null;
  const hoverBg = card ? Array.from(card.children).find((c) => (c.getAttribute("style") || "").includes("hoverBg") || (c.style.backgroundImage || "").includes("074daf0")) : null;
  return {
    cardFound: !!card,
    cardW: card ? Math.round(card.getBoundingClientRect().width) : 0,
    overlayOpacity: overlay ? getComputedStyle(overlay).opacity : null,
    overlayTitle: overlay ? (overlay.querySelector("h3") || {}).textContent : null,
    titleFS: overlay && overlay.querySelector("h3") ? getComputedStyle(overlay.querySelector("h3")).fontSize + "/" + getComputedStyle(overlay.querySelector("h3")).fontWeight : null,
    titleColor: overlay && overlay.querySelector("h3") ? getComputedStyle(overlay.querySelector("h3")).color : null,
    labelFS: overlay && overlay.querySelector("p") ? getComputedStyle(overlay.querySelector("p")).fontSize : null,
    hoverBgFound: !!hoverBg,
  };
}, cardSel);
await page.hover(cardSel);
await page.waitForTimeout(500);
const hoverAfter = await page.evaluate((sel) => {
  const card = document.querySelector(sel);
  const overlay = card ? card.querySelector(".absolute.inset-0.flex") : null;
  const bgs = card ? Array.from(card.children).filter((c) => c.style.backgroundImage).map((c) => ({ bg: (c.style.backgroundImage || "").slice(5, 60), op: getComputedStyle(c).opacity })) : [];
  return {
    overlayOpacity: overlay ? getComputedStyle(overlay).opacity : null,
    bgs,
  };
}, cardSel);

// ---- hero autoplay: watch active dot index over 14s ----
await page.evaluate(() => window.scrollTo(0, 0));
const samples = [];
for (let i = 0; i < 28; i++) {
  const s = await page.evaluate(() => {
    const dots = document.querySelectorAll("main section button[aria-label*='슬라이드'] span");
    let active = -1;
    dots.forEach((d, i) => {
      if (getComputedStyle(d).opacity === "1") active = i;
    });
    return active;
  });
  samples.push({ t: +(i * 0.5).toFixed(1), active: s });
  await page.waitForTimeout(500);
}
const flips = [];
for (let i = 1; i < samples.length; i++) {
  if (samples[i].active !== samples[i - 1].active) flips.push({ from: samples[i - 1].active, to: samples[i].active, t: samples[i].t });
}

// ---- paging dot box ----
const dot = await page.evaluate(() => {
  const d = document.querySelector("main section button[aria-label*='슬라이드']");
  const inner = d ? d.querySelector("span") : null;
  return d ? { w: Math.round(d.getBoundingClientRect().width), h: Math.round(d.getBoundingClientRect().height), x: Math.round(d.getBoundingClientRect().x), y: Math.round(d.getBoundingClientRect().y), innerW: inner ? Math.round(inner.getBoundingClientRect().width) : 0, innerH: inner ? Math.round(inner.getBoundingClientRect().height) : 0 } : null;
});

// ---- reveal animation presence: vision text opacity right after scroll-in ----
await page.evaluate(() => {
  const el = Array.from(document.querySelectorAll(".rich-text")).find((r) => /건강하고 깨끗한 물/.test(r.textContent));
  el && el.scrollIntoView({ block: "center" });
});
const revealEarly = await page.evaluate(() => {
  const rev = Array.from(document.querySelectorAll("main .opacity-0, main [style*='opacity']")).find((r) => /친환경|건강하고/.test(r.textContent || ""));
  return rev ? { opacity: getComputedStyle(rev).opacity, transform: getComputedStyle(rev).transform.slice(0, 30) } : "settled-instantly";
});
await page.waitForTimeout(1600);
const revealLate = await page.evaluate(() => {
  const rev = Array.from(document.querySelectorAll("main [style*='opacity']")).find((r) => /친환경|건강하고/.test(r.textContent || ""));
  return rev ? { opacity: getComputedStyle(rev).opacity } : "none";
});

const out = { hoverBefore, hoverAfter, autoplaySamples: samples, autoplayFlips: flips, dot };
console.log(JSON.stringify(out, null, 1));
console.log("reveal early:", JSON.stringify(revealEarly), "late:", JSON.stringify(revealLate));
await fs.writeFile("design/rebuilt-states.json", JSON.stringify(out, null, 1));
await ctx.close();
await browser.close();
