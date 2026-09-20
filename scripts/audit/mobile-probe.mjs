/**
 * Mobile structural probe — dom-level section dump for one side.
 * INVESTIGATION ONLY: reads DOM, writes JSON artifacts under design/audit/mobile-probe/.
 *
 * Usage:
 *   node scripts/audit/mobile-probe.mjs --side=orig|local [--only=home,news] [--tag=baseline]
 *
 * Reuses the capture.mjs browser setup (chrome channel, dsf 1, light, reduced motion,
 * scroll-flatten) so measurements match the audit PNGs.
 */
import { chromium } from "playwright-core";
import fs from "node:fs/promises";
import path from "node:path";
import { PAGES, VIEWPORTS, ORIG_BASE, DEFAULT_LOCAL_BASE } from "./pages.mjs";

const args = process.argv.slice(2);
const getArg = (name, dflt) => {
  const a = args.find((x) => x.startsWith("--" + name + "="));
  return a ? a.split("=")[1] : dflt;
};

const SIDE = getArg("side");
if (!["orig", "local"].includes(SIDE)) {
  console.error("usage: node scripts/audit/mobile-probe.mjs --side=orig|local [--only=...] [--tag=...]");
  process.exit(1);
}
const ONLY = getArg("only", "").split(",").filter(Boolean);
const TAG = getArg("tag", "run");
const BASE = SIDE === "orig" ? ORIG_BASE : getArg("base", DEFAULT_LOCAL_BASE);
const OUT = path.resolve("design/audit/mobile-probe");
const VP = VIEWPORTS.mobile;

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

const EXTRACT = (side) => {
  const rnd = (n) => Math.round(n);
  const info = (el) => {
    const r = el.getBoundingClientRect();
    return { top: rnd(r.top + window.scrollY), h: rnd(r.height), w: rnd(r.width), left: rnd(r.left) };
  };
  const cs = (el) => getComputedStyle(el);
  const shortText = (el, n = 90) => (el.innerText || "").replace(/\s+/g, " ").trim().slice(0, n);
  const heading = (el) => {
    const h = el.querySelector("h1,h2,h3,h4,h5,h6,.title,.cont_title,.page_title");
    const t = h ? shortText(h, 70) : "";
    return t || shortText(el, 70);
  };
  const imgs = (el) =>
    [...el.querySelectorAll("img")].slice(0, 12).map((im) => {
      const r = im.getBoundingClientRect();
      return {
        src: (im.getAttribute("src") || "").split("/").pop()?.slice(0, 46) || "",
        currentSrc: (im.currentSrc || "").split("/").pop()?.slice(0, 46) || "",
        nw: im.naturalWidth,
        nh: im.naturalHeight,
        w: rnd(r.width),
        h: rnd(r.height),
        styleW: im.style.width || "",
        srcset: (im.getAttribute("srcset") || "").slice(0, 60),
      };
    });
  const tree = (el, depth, maxDepth) => {
    const out = [];
    for (const c of el.children) {
      const r = c.getBoundingClientRect();
      const c2 = cs(c);
      out.push({
        tag: c.tagName.toLowerCase(),
        id: c.id || "",
        cls: (typeof c.className === "string" ? c.className : "").replace(/\s+/g, " ").trim().slice(0, 90),
        top: rnd(r.top + window.scrollY),
        h: rnd(r.height),
        display: c2.display,
        hidden: c2.display === "none" || c2.visibility === "hidden",
        text: shortText(c, 50),
        children: depth < maxDepth ? tree(c, depth + 1, maxDepth) : [],
      });
    }
    return out;
  };

  let sections;
  if (side === "orig") {
    const all = [...document.querySelectorAll(".section_wrap")];
    const top = all.filter((el) => !el.parentElement.closest(".section_wrap"));
    sections = top.length ? top : [...document.querySelectorAll("main section")];
  } else {
    const all = [...document.querySelectorAll("main section, main > div > section")];
    const top = all.filter((el) => !el.parentElement.closest("section"));
    sections = top.length ? top : all;
  }

  const dump = sections.map((el, i) => {
    const c = cs(el);
    const base = {
      i,
      tag: el.tagName.toLowerCase(),
      id: el.id || "",
      cls: (typeof el.className === "string" ? el.className : "").replace(/\s+/g, " ").trim().slice(0, 120),
      hasMobile: /mobile_section/.test(el.className || ""),
      hasPc: /(^|\s)pc_section/.test(el.className || ""),
      ...info(el),
      display: c.display,
      visibility: c.visibility,
      hidden: c.display === "none" || c.visibility === "hidden",
      heading: heading(el),
      rowCount: el.querySelectorAll(".imweb-row,.doz_row,.row").length,
      colCount: el.querySelectorAll(".imweb-col,.doz_col,.col").length,
      imgs: imgs(el),
      forcedH: null,
    };
    // measure how tall a mobile-hidden section would be if shown at 390 —
    // this is exactly the desktop content the local rebuild renders on mobile
    if (base.hidden && c.display === "none") {
      const prev = el.style.display;
      el.style.display = "block";
      base.forcedH = rnd(el.getBoundingClientRect().height);
      el.style.display = prev;
    }
    return base;
  });

  // all section wrappers incl. nested + hidden, to see mobile/pc toggling
  const allWraps = [...document.querySelectorAll("section.section_wrap, [class*='mobile_section'], [class*='pc_section']")]
    .slice(0, 80)
    .map((el) => {
      const c = cs(el);
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        id: el.id || "",
        cls: (typeof el.className === "string" ? el.className : "").replace(/\s+/g, " ").trim().slice(0, 100),
        top: rnd(r.top + window.scrollY),
        h: rnd(r.height),
        display: c.display,
        visibility: c.visibility,
        hidden: c.display === "none" || c.visibility === "hidden",
        heading: heading(el),
      };
    });

  return {
    scrollHeight: document.body.scrollHeight,
    docHeight: document.documentElement.scrollHeight,
    bodyWidth: document.body.getBoundingClientRect().width,
    title: document.title,
    sections: dump,
    allWraps,
    bodyTree: tree(document.body, 0, 2),
  };
};

async function probeOne(browser, key, url, side) {
  const ctx = await browser.newContext({
    viewport: { width: VP.width, height: VP.height },
    deviceScaleFactor: 1,
    colorScheme: "light",
  });
  try {
    const page = await ctx.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(url, { waitUntil: "load", timeout: 45000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(600);
    await page.addStyleTag({ content: HIDE_DEV_STYLE });
    await scrollThrough(page);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(900);
    const data = await page.evaluate(EXTRACT, side);
    await page.screenshot({ path: path.join(OUT, `${side}-${key}.png`), fullPage: true, animations: "disabled" });
    return { key, side, url, finalUrl: page.url(), ...data };
  } finally {
    await ctx.close();
  }
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const pages = PAGES.filter((p) => (!ONLY.length || ONLY.includes(p.key)));
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const out = {};
  for (const p of pages) {
    const url = BASE + (SIDE === "orig" ? p.orig : p.local);
    try {
      const d = await probeOne(browser, p.key, url, SIDE);
      out[p.key] = d;
      const visSum = d.sections.filter((s) => !s.hidden).reduce((a, s) => a + s.h, 0);
      const hidForced = d.sections.filter((s) => s.hidden).reduce((a, s) => a + (s.forcedH || 0), 0);
      console.log(
        `[${SIDE}] ${p.key} h=${d.scrollHeight} sections=${d.sections.length} hidden=${d.sections.filter((s) => s.hidden).length} visibleSum=${visSum} hiddenForcedSum=${hidForced}`,
      );
      for (const s of d.sections) {
        console.log(
          `    #${s.i} ${s.tag}${s.id ? "#" + s.id : ""} h=${s.h}${s.hidden ? " HIDDEN" + (s.forcedH != null ? "(forced=" + s.forcedH + ")" : "") : ""}${s.hasMobile ? " [mobile]" : ""}${s.hasPc ? " [pc]" : ""} :: ${s.heading.slice(0, 60)}`,
        );
      }
    } catch (e) {
      console.error(`[${SIDE}] ${p.key} FAILED: ${e.message.split("\n")[0]}`);
      out[p.key] = { key: p.key, side: SIDE, url, ok: false, error: e.message.split("\n")[0] };
    }
  }
  await browser.close();
  const file = path.join(OUT, `${SIDE}-${TAG}.json`);
  await fs.writeFile(file, JSON.stringify(out, null, 2));
  console.log(`\nwrote ${file}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
