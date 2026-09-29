/**
 * Component-type probe — what KIND of component each page section renders at a viewport.
 *
 * Usage:
 *   node type-probe.mjs --side=orig|local --vp=390|768|1440 [--only=home,news] [--out=dir]
 *
 * Output: <out>/types-<side>-<vp>.json
 * Per top-level section:
 *   - carousel markers (local `[data-gs]`, orig owl classes), dots/arrows visible
 *   - horizontal scrollers (overflow-x with hidden content)
 *   - item groups: repeated sibling signature -> total, per-row count, item width
 *   - tables, tabs, images
 */
import { chromium } from "playwright-core";
import fs from "node:fs/promises";
import path from "node:path";
import { PAGES, ORIG_BASE, DEFAULT_LOCAL_BASE } from "./pages.mjs";

const args = process.argv.slice(2);
const getArg = (n, d) => { const a = args.find((x) => x.startsWith("--" + n + "=")); return a ? a.split("=")[1] : d; };
const SIDE = getArg("side");
const VP = Number.parseInt(getArg("vp", "390"), 10);
const ONLY = getArg("only", "").split(",").filter(Boolean);
const OUT = path.resolve(getArg("out", "design/audit/mobile-compare/types"));
const BASE = SIDE === "orig" ? ORIG_BASE : getArg("base", DEFAULT_LOCAL_BASE);
if (!["orig", "local"].includes(SIDE)) { console.error("--side=orig|local required"); process.exit(1); }

const HIDE_DEV_STYLE = "nextjs-portal, [data-nextjs-toast], [data-nextjs-dialog], [data-nextjs-dev-tools-button] { display: none !important; }";
const FOOTER_SECTION_ID = "s20250811f489e3443bdbe";

async function scrollThrough(page) {
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
  await page.waitForTimeout(250);
}

const EXTRACT = ({ side, footerId, vp }) => {
  const rnd = (n) => Math.round(n);
  const vis = (el) => { const c = getComputedStyle(el); const r = el.getBoundingClientRect(); return c.display !== "none" && c.visibility !== "hidden" && r.width > 1 && r.height > 1; };
  const heading = (el) => {
    const h = el.querySelector("h1,h2,h3,h4,h5,h6,.title,.cont_title,.page_title");
    const t = h ? (h.innerText || "").replace(/\s+/g, " ").trim().slice(0, 70) : "";
    return t || (el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 70);
  };

  let sections;
  if (side === "orig") {
    const all = [...document.querySelectorAll(".section_wrap")];
    const top = all.filter((el) => !el.parentElement.closest(".section_wrap") && el.id !== footerId);
    sections = top;
  } else {
    const all = [...document.querySelectorAll("main section")];
    sections = all.filter((el) => !el.parentElement.closest("section"));
  }

  const classify = (root) => {
    const out = {
      carousels: 0, sliderMarks: 0, dots: 0, arrows: 0,
      hscroll: 0, maxScrollX: 0,
      tables: 0, tableRows: 0, tabs: 0,
      images: 0, imgWidths: [],
      grid: null, grids: [],
    };
    // carousel / slider markers
    const carSel = side === "orig"
      ? ".owl-carousel, .owl-stage-outer, .owl-stage, [class*='swiper'], [class*='slick'], [class*='carousel']"
      : "[data-gs], [class*='swiper'], [class*='carousel']";
    for (const el of root.querySelectorAll(carSel)) if (vis(el)) out.carousels++;
    for (const el of root.querySelectorAll("[data-gs]")) if (vis(el)) out.sliderMarks++;
    const dotSeen = new Set();
    for (const el of root.querySelectorAll("*")) {
      if (!vis(el)) continue;
      const cls = typeof el.className === "string" ? el.className : "";
      const aria = el.getAttribute && (el.getAttribute("aria-label") || "");
      const isDotClass = /owl-dot|owl-dots|paging|indicator|dots/i.test(cls);
      const isNumericAriaBtn = el.tagName === "BUTTON" && (/^\d+$/.test(aria) || /슬라이드|slide/i.test(aria));
      if ((isDotClass || isNumericAriaBtn) && !dotSeen.has(el)) { dotSeen.add(el); out.dots++; }
      if (/(owl-prev|owl-next|owl-nav|prev|next)/i.test(cls) && el.getBoundingClientRect().width < 80 && el.getBoundingClientRect().height < 80) out.arrows++;
      const c = getComputedStyle(el);
      if ((c.overflowX === "auto" || c.overflowX === "scroll") && el.scrollWidth > el.clientWidth + 24 && el.clientWidth > 100) {
        out.hscroll++;
        out.maxScrollX = Math.max(out.maxScrollX, el.scrollWidth - el.clientWidth);
      }
    }
    // tables
    for (const t of root.querySelectorAll("table")) {
      if (!vis(t)) continue;
      out.tables++;
      out.tableRows += [...t.querySelectorAll("tr")].filter(vis).length;
    }
    // tabs
    for (const el of root.querySelectorAll("[role='tab'], [role='tablist'] > *, ul[class*='tab'] > li, [class*='tab'] button")) {
      if (vis(el)) out.tabs++;
    }
    // images
    const imgs = [...root.querySelectorAll("img")].filter(vis);
    out.images = imgs.length;
    out.imgWidths = imgs.slice(0, 10).map((i) => rnd(i.getBoundingClientRect().width));
    // repeated sibling groups -> grid fingerprint
    for (const el of root.querySelectorAll("*")) {
      if (el.children.length < 3) continue;
      const kids = [...el.children].filter(vis);
      if (kids.length < 3) continue;
      const bySig = new Map();
      for (const k of kids) {
        const cls = typeof k.className === "string" ? k.className.trim() : "";
        const sig = k.tagName + "|" + cls;
        if (!bySig.has(sig)) bySig.set(sig, []);
        bySig.get(sig).push(k);
      }
      for (const [sig, arr] of bySig) {
        if (arr.length < 3) continue;
        const rects = arr.map((k) => k.getBoundingClientRect());
        const w0 = rnd(rects[0].width);
        if (w0 < 20) continue;
        const mins = rects.map((r) => Math.round(r.top));
        const minTop = Math.min(...mins);
        const perRow = mins.filter((t) => t - minTop < 8).length;
        const rows = new Set(mins.map((t) => Math.round(t / 12))).size;
        out.grids.push({
          parent: (typeof el.className === "string" ? el.className : "").slice(0, 50),
          sig: sig.slice(0, 50), total: arr.length, perRow, rows: Math.round(rows),
          itemW: w0, itemH: rnd(rects[0].height), top: minTop + window.scrollY,
        });
      }
    }
    out.grids.sort((a, b) => b.total - a.total || b.itemW - a.itemW);
    out.grid = out.grids[0] || null;
    delete out.grids;
    return out;
  };

  const dump = sections.map((el, i) => {
    const c = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const cls = typeof el.className === "string" ? el.className : "";
    return {
      i,
      id: el.id || "",
      hidden: c.display === "none" || c.visibility === "hidden",
      h: rnd(r.height),
      top: rnd(r.top + window.scrollY),
      cls: cls.replace(/\s+/g, " ").trim().slice(0, 90),
      heading: heading(el),
      ...classify(el),
    };
  });
  return { vp, side, bodyWidth: document.body.getBoundingClientRect().width, scrollH: document.body.scrollHeight, sections: dump };
};

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const pages = PAGES.filter((p) => !ONLY.length || ONLY.includes(p.key));
  const out = {};
  for (const p of pages) {
    const url = BASE + (SIDE === "orig" ? p.orig : p.local);
    const ctx = await browser.newContext({ viewport: { width: VP, height: VP === 390 ? 844 : 900 }, deviceScaleFactor: 1, colorScheme: "light" });
    try {
      const page = await ctx.newPage();
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(url, { waitUntil: "load", timeout: 45000 });
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(500);
      await page.addStyleTag({ content: HIDE_DEV_STYLE });
      await scrollThrough(page);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      const data = await page.evaluate(EXTRACT, { side: SIDE, footerId: FOOTER_SECTION_ID, vp: VP });
      out[p.key] = data;
      const secs = data.sections.filter((s) => !s.hidden);
      const car = secs.reduce((a, s) => a + (s.sliderMarks || s.carousels || 0), 0);
      const dots = secs.reduce((a, s) => a + s.dots, 0);
      const hs = secs.reduce((a, s) => a + s.hscroll, 0);
      console.log(`[${SIDE}/${VP}] ${p.key} h=${data.scrollH} sections=${secs.length} carouselMarks=${car} dots=${dots} hscroll=${hs}`);
    } catch (e) {
      console.error(`[${SIDE}/${VP}] ${p.key} FAILED: ${e.message.split("\n")[0]}`);
      out[p.key] = { error: e.message.split("\n")[0] };
    } finally {
      await ctx.close();
    }
  }
  await browser.close();
  const file = path.join(OUT, `types-${SIDE}-${VP}.json`);
  await fs.writeFile(file, JSON.stringify(out, null, 1));
  console.log("wrote " + file);
}
main().catch((e) => { console.error(e); process.exit(1); });
