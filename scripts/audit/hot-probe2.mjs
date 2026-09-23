/**
 * hot-probe2.mjs — focused follow-up for hot-probe.mjs (T4 floating container,
 * section id/label map, orig carousel active index).
 * INVESTIGATION ONLY. Usage: node scripts/audit/hot-probe2.mjs
 * Output: design/audit/hot-probe2.json
 */
import { chromium } from "playwright-core";
import fs from "node:fs/promises";
import path from "node:path";
import { ORIG_BASE, DEFAULT_LOCAL_BASE, VIEWPORTS } from "./pages.mjs";

const OUT = path.resolve("design/audit");
const HIDE_DEV_STYLE =
  "nextjs-portal, [data-nextjs-toast], [data-nextjs-dialog], [data-nextjs-dev-tools-button] { display: none !important; }";

async function scrollThrough(page) {
  await page.evaluate(async () => {
    await new Promise((res) => {
      let y = 0;
      const step = () => {
        y += 600;
        window.scrollTo(0, y);
        if (y < document.body.scrollHeight + 1200) setTimeout(step, 50);
        else { window.scrollTo(0, 0); res(); }
      };
      step();
    });
  });
  await page.waitForTimeout(300);
}

function DETAIL({ side }) {
  const NORM = (s) => (s || "").replace(/\s+/g, " ").trim();
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), topDoc: Math.round(r.top + scrollY) }; };
  const csOf = (el, props) => { const cs = getComputedStyle(el); const o = {}; for (const p of props) o[p] = cs[p]; return o; };

  // all top-level content sections (orig) / main sections (local) with id
  let secs;
  if (side === "orig") secs = [...document.querySelectorAll("#doz_body > .section_wrap")];
  else secs = [...document.querySelectorAll("main > section, main > div > section")];
  const secList = secs.map((el, i) => ({
    i,
    id: el.id || "",
    cls: (typeof el.className === "string" ? el.className : "").slice(0, 90),
    text: NORM(el.textContent).slice(0, 30),
    box: box(el),
    ...csOf(el, ["position", "display"]),
  }));

  // T4: the first visible #doz_header link and every ancestor's geometry
  const link = [...document.querySelectorAll('a[href="#doz_header"]')].find((a) => a.getBoundingClientRect().height > 0);
  let t4 = null;
  if (link) {
    const chain = [];
    let n = link;
    while (n && n.nodeType === 1) {
      chain.push({
        tag: n.tagName.toLowerCase(),
        id: n.id || "",
        cls: (typeof n.className === "string" ? n.className : "").slice(0, 90),
        box: box(n),
        ...csOf(n, ["position", "display", "top", "right", "bottom", "left", "zIndex", "transform", "width", "height", "opacity", "visibility"]),
        html: n.tagName === "MAIN" || n.tagName === "SECTION" || (n.className && /floating|btn_top/.test(String(n.className))) ? n.outerHTML.slice(0, 220) : undefined,
        offsetParent: n.offsetParent ? (n.offsetParent.id || n.offsetParent.tagName.toLowerCase()) : null,
      });
      n = n.parentElement;
    }
    t4 = { chain };
  }
  const floatingEls = [...document.querySelectorAll('[id*="floating"], [class*="floating"], .btn_top, [class*="btn_top"]')].slice(0, 8).map((el) => ({
    tag: el.tagName.toLowerCase(), id: el.id || "", cls: (typeof el.className === "string" ? el.className : "").slice(0, 90), box: box(el),
    ...csOf(el, ["position", "display", "top", "bottom", "right", "zIndex", "opacity", "visibility"]),
  }));

  // orig carousel active slide (T2/T3)
  const activeSlides = [...document.querySelectorAll(".owl-item.active, .item.active")].slice(0, 6).map((el) => ({
    cls: (typeof el.className === "string" ? el.className : "").slice(0, 60),
    box: box(el),
    text: NORM(el.textContent).slice(0, 40),
    bg: (el.querySelector('[class*="section"], .item_container') ? getComputedStyle(el.querySelector('[class*="section"], .item_container')).backgroundImage : "").slice(0, 120),
  }));

  return { side, secList, t4, floatingEls, activeSlides };
}

async function run(browser, side, vpName) {
  const vp = VIEWPORTS[vpName];
  const base = side === "orig" ? ORIG_BASE : DEFAULT_LOCAL_BASE;
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, colorScheme: "light" });
  const page = await ctx.newPage();
  let out;
  try {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(base + "/", { waitUntil: "load", timeout: 45000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(600);
    await page.addStyleTag({ content: HIDE_DEV_STYLE }).catch(() => {});
    await scrollThrough(page);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    out = await page.evaluate(DETAIL, { side });
    console.log(`[${side}/${vpName}] ok`);
  } catch (e) {
    out = { side, error: (e.message || String(e)).split("\n")[0] };
    console.error(`[${side}/${vpName}] FAIL ${out.error}`);
  }
  await ctx.close();
  return out;
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const data = { mobile: {}, desktop: {} };
  for (const side of ["orig", "local"]) data.mobile[side] = await run(browser, side, "mobile");
  for (const side of ["orig", "local"]) data.desktop[side] = await run(browser, side, "desktop");
  await browser.close();
  await fs.writeFile(path.join(OUT, "hot-probe2.json"), JSON.stringify(data, null, 2));
  console.log("wrote design/audit/hot-probe2.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
