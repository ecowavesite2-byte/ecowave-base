/** Measures EVERY section's rows/cols/widgets of the home page on both the
 * original and the rebuild, at 1440px, for precise diffing. */
import { chromium } from "playwright-core";
import fs from "node:fs/promises";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

async function measure(url, name) {
  await page.goto(url, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
  // scroll through to trigger lazy loads + reveal animations
  await page.evaluate(async () => {
    await new Promise((res) => {
      let y = 0;
      const step = () => {
        y += 500;
        window.scrollTo(0, y);
        if (y < document.body.scrollHeight + 1200) setTimeout(step, 60);
        else { window.scrollTo(0, 0); res(); }
      };
      step();
    });
  });
  await page.waitForTimeout(1800);
  const data = await page.evaluate(() => {
    const secs = Array.from(
      document.querySelectorAll("body > div.section_wrap, main > section, main > div > section"),
    );
    return secs.map((sec, si) => {
      const r = sec.getBoundingClientRect();
      const widgets = [];
      sec.querySelectorAll("[data-widget-type]").forEach((w) => {
        const t = w.getAttribute("data-widget-type");
        if (["sub_menu", "inline_logo", "inline_menu", "inline_button", "inline_menu_btn"].includes(t)) return;
        const holder = w.closest('[doz_type="widget"]') || w;
        const wr = holder.getBoundingClientRect();
        const fr = w.querySelector(".fr-view");
        const img = w.querySelector("img");
        widgets.push({
          t,
          x: Math.round(wr.x), y: Math.round(wr.y), w: Math.round(wr.width), h: Math.round(wr.height),
          text: fr
            ? fr.textContent.replace(/\s+/g, " ").trim().slice(0, 36)
            : img
              ? (img.getAttribute("src") || "").split("/").pop().slice(0, 30)
              : "",
        });
      });
      const imgs = Array.from(sec.querySelectorAll("img"))
        .filter((im) => im.complete)
        .map((im) => ({
          src: (im.getAttribute("src") || "").split("/").pop().slice(0, 30),
          w: Math.round(im.getBoundingClientRect().width),
          h: Math.round(im.getBoundingClientRect().height),
        }));
      return { si, h: Math.round(r.height), y: Math.round(r.y), widgetCount: widgets.length, widgets: widgets.slice(0, 8), imgs: imgs.slice(0, 4) };
    });
  });
  console.log("\n########## " + name + " (" + data.length + " sections)");
  data.forEach((s) => {
    console.log(`SEC[${s.si}] h=${s.h} y=${s.y}`);
    s.widgets.forEach((w) => console.log(`   ${w.t} @${w.x},${w.y} ${w.w}x${w.h} | ${w.text}`));
    if (s.imgs.length) console.log("   imgs:", JSON.stringify(s.imgs.slice(0, 4)));
  });
  return data;
}

const orig = await measure("https://imweb8701032505.imweb.me/", "ORIGINAL");
const mine = await measure("http://localhost:3000/", "REBUILT");
await ctx.close();
await browser.close();
await fs.writeFile("design/diff-home.json", JSON.stringify({ orig, mine }, null, 1));
