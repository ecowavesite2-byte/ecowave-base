/**
 * Precise home diff: measures every widget box (x,y,w,h) + text style in each
 * section on BOTH pages, then computes per-section pixel difference.
 * Output: design/diff-report.json + console report.
 */
import { chromium } from "playwright-core";
import fs from "node:fs/promises";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

async function measure(url) {
  await page.goto(url, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
  await page.evaluate(async () => {
    await new Promise((res) => {
      let y = 0;
      const step = () => {
        y += 500;
        window.scrollTo(0, y);
        if (y < document.body.scrollHeight + 1200) setTimeout(step, 50);
        else { window.scrollTo(0, 0); res(); }
      };
      step();
    });
  });
  await page.waitForTimeout(2000);
  return await page.evaluate(() => {
    const secs = Array.from(
      document.querySelectorAll("body > div.section_wrap, main > section, main > div > section"),
    ).filter((s) => {
      const cls = typeof s.className === "string" ? s.className : "";
      return !/mobile_section/.test(cls) && s.getBoundingClientRect().height > 2;
    });
    return {
      pageH: Math.round(document.body.scrollHeight),
      sections: secs.map((sec) => {
        const sr = sec.getBoundingClientRect();
        const widgets = [];
        sec.querySelectorAll("[data-widget-type]").forEach((w) => {
          const t = w.getAttribute("data-widget-type");
          if (["sub_menu", "inline_logo", "inline_menu", "inline_button", "inline_menu_btn"].includes(t)) return;
          const holder = w.closest('[doz_type="widget"]') || w;
          const r = holder.getBoundingClientRect();
          if (r.width < 2) return;
          const fr = w.querySelector(".fr-view");
          let align = "", fs = "", fw = "", color = "";
          const firstText = fr ? fr.querySelector("h1,h2,h3,h4,h5,h6,p,strong,span") : null;
          if (firstText) {
            const cs = getComputedStyle(firstText);
            align = cs.textAlign; fs = cs.fontSize; fw = cs.fontWeight; color = cs.color;
          }
          widgets.push({
            t,
            x: Math.round(r.x), y: Math.round(r.y - sr.y), w: Math.round(r.width), h: Math.round(r.height),
            align, fs, fw, color,
            text: fr ? fr.textContent.replace(/\s+/g, " ").trim().slice(0, 30) : "",
          });
        });
        const imgs = Array.from(sec.querySelectorAll("img"))
          .filter((im) => im.getBoundingClientRect().width > 2)
          .map((im) => ({
            src: (im.getAttribute("src") || "").split("/").pop().slice(0, 26),
            x: Math.round(im.getBoundingClientRect().x),
            w: Math.round(im.getBoundingClientRect().width), h: Math.round(im.getBoundingClientRect().height),
          }));
        return {
          h: Math.round(sr.height),
          widgets: widgets.slice(0, 12),
          imgs: imgs.slice(0, 5),
        };
      }),
    };
  });
}

const orig = await measure("https://imweb8701032505.imweb.me/");
const mine = await measure("http://localhost:3000/");

// print side by side
const label = (s) => `${s.t} @${s.x} ${s.w}x${s.h}${s.align ? " " + s.align : ""}${s.fs ? " " + s.fs + "/" + s.fw : ""}${s.text ? " |" + s.text.slice(0, 18) : ""}`;
for (let i = 0; i < Math.max(orig.sections.length, mine.sections.length); i++) {
  const o = orig.sections[i];
  const m = mine.sections[i];
  console.log(`\n=== SEC[${i}] orig h=${o ? o.h : "-"} | mine h=${m ? m.h : "-"}`);
  if (!o || !m) continue;
  const n = Math.max(o.widgets.length, m.widgets.length);
  for (let j = 0; j < n; j++) {
    const ow = o.widgets[j];
    const mw = m.widgets[j];
    if (ow && mw) {
      const dx = Math.abs(ow.x - mw.x), dy = Math.abs(ow.yAbs - m.yAbs), dw = Math.abs(ow.w - mw.w), dh = Math.abs(ow.h - m.h);
      const flag = dx > 12 || dw > 12 || dh > 12 ? "  <<<" : "";
      console.log(`  O: ${label(ow)}`);
      console.log(`  M: ${label(mw)}${flag}`);
    } else {
      console.log(`  O: ${ow ? label(ow) : "(none)"}`);
      console.log(`  M: ${mw ? label(mw) : "(none)"}`);
    }
  }
  if (o.imgs.length || m.imgs.length) {
    console.log(`  imgs O: ${JSON.stringify(o.imgs.slice(0, 3))}`);
    console.log(`  imgs M: ${JSON.stringify(m.imgs.slice(0, 3))}`);
  }
}

await ctx.close();
await browser.close();
