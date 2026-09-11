/** Hunts for bg images in the vision section + hero slides + full widget boxes. */
import { chromium } from "playwright-core";
import fs from "node:fs/promises";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto("https://imweb8701032505.imweb.me/", { waitUntil: "load", timeout: 30000 }).catch(() => {});
try { await page.waitForSelector("#s20250811004ea868d7376", { timeout: 10000 }); } catch {}
// scroll through to trigger lazy loads
await page.evaluate(async () => {
  await new Promise((res) => {
    let y = 0;
    const step = () => {
      y += 600;
      window.scrollTo(0, y);
      if (y < document.body.scrollHeight + 1200) setTimeout(step, 80);
      else { window.scrollTo(0, 0); res(); }
    };
    step();
  });
});
await page.waitForTimeout(1500);

const out = await page.evaluate(() => {
  function bgHunt(selector) {
    const sec = document.querySelector(selector);
    if (!sec) return null;
    const found = [];
    sec.querySelectorAll("*").forEach((el) => {
      const st = getComputedStyle(el);
      const bi = st.backgroundImage;
      if (bi && bi !== "none") {
        found.push({
          cls: (el.className || "").toString().slice(0, 60),
          bg: bi.slice(5, 110),
          size: st.backgroundSize,
        });
      }
      const img = el.tagName === "IMG" ? el : null;
      if (img) {
        found.push({ cls: "IMG." + (img.className || "").toString().slice(0, 30), src: (img.getAttribute("data-src") || img.src).slice(0, 90), loaded: img.complete && img.naturalWidth > 0, w: Math.round(img.getBoundingClientRect().width), h: Math.round(img.getBoundingClientRect().height) });
      }
    });
    return found;
  }

  const vision = bgHunt("#s20250811004ea868d7376");
  const strip = bgHunt("#s20250811ba4c7cabd299e");
  const heroSlides = bgHunt("#s20250811b5ffbb4730f67");
  const banner = bgHunt("#s202508116d15f8202cd82");
  return { vision, strip, heroSlides: heroSlidesSafe(), banner };
  function heroSlidesSafe() {
    const slides = [];
    document.querySelectorAll("#s20250811b5ffbb4730f67 .owl-item:not(.cloned) .item").forEach((it) => {
      const st = getComputedStyle(it);
      slides.push({ bg: st.backgroundImage.slice(5, 90), bgc: st.backgroundColor, loaded: !!it.querySelector("img") });
    });
    return slides;
  }
});

console.log(JSON.stringify(out, null, 1).slice(0, 5000));
const fsMod = await import("node:fs/promises");
await fsMod.writeFile("design/bg-hunt.json", JSON.stringify(out, null, 1));
await ctx.close();
await browser.close();
