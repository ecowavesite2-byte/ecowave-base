/**
 * hot-probe.mjs — LIVE DOM evidence for the hottest diff sections (T1..T5).
 *
 * Collects, per side (orig imweb site vs local rebuild), the concrete evidence
 * requested by the hot-section audit:
 *   T1 mobile home pillar cards (회사소개/연구개발/제품소개/홍보센터)
 *   T2 mobile home hero "우리의 비전은 자연과 조화롭게 번성하고"
 *   T3 mobile home slider "정수 소재 & 스마트 부품"
 *   T4 mobile back-to-top widget (#doz_header)
 *   T5 desktop home #2/#3 background palette stack
 *
 * INVESTIGATION ONLY — reads DOM/computed styles, writes JSON artifacts. Never
 * edits app/component/content sources.
 *
 * Usage: node scripts/audit/hot-probe.mjs
 * Output: design/audit/hot-probe.json
 *         design/audit/hot-probe-pixels.json   (average RGB samples)
 */
import { chromium } from "playwright-core";
import fs from "node:fs/promises";
import path from "node:path";
import { PNG } from "pngjs";
import { ORIG_BASE, DEFAULT_LOCAL_BASE, VIEWPORTS } from "./pages.mjs";

const OUT = path.resolve("design/audit");
const HIDE_DEV_STYLE =
  "nextjs-portal, [data-nextjs-toast], [data-nextjs-dialog], [data-nextjs-dev-tools-button] { display: none !important; }";
const FORCE_REVEAL_STYLE = `
  .wg_animated { visibility: visible !important; opacity: 1 !important; transition: none !important; }
`;

const FORCE_REVEAL = { side: "orig" };

async function scrollThrough(page) {
  await page.evaluate(async () => {
    await new Promise((res) => {
      let y = 0;
      const step = () => {
        y += 600;
        window.scrollTo(0, y);
        if (y < document.body.scrollHeight + 1200) setTimeout(step, 50);
        else {
          window.scrollTo(0, 0);
          res();
        }
      };
      step();
    });
  });
  await page.waitForTimeout(300);
}

/* ------------------------- in-page probe ------------------------- */
/* Serialized into the page: must be self-contained (no outer refs). */
function PROBE({ side, group }) {
  const NORM = (s) => (s || "").replace(/\s+/g, " ").trim();
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
      topDoc: Math.round(r.top + window.scrollY),
    };
  };
  const SP = [
    "position", "display", "visibility", "opacity", "zIndex",
    "top", "right", "bottom", "left", "width", "height",
    "backgroundColor", "backgroundImage", "backgroundAttachment", "backgroundPosition", "backgroundSize",
    "filter", "mixBlendMode", "color", "fontSize", "lineHeight", "fontWeight", "fontFamily", "letterSpacing",
    "textAlign", "marginTop", "marginBottom", "marginLeft", "marginRight",
    "paddingTop", "paddingBottom", "overflow", "overflowX", "transform", "pointerEvents",
  ];
  const snap = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const o = {};
    for (const p of SP) o[p] = cs[p];
    o.tag = el.tagName.toLowerCase();
    o.cls = (typeof el.className === "string" ? el.className : "").slice(0, 160);
    o.id = el.id || "";
    o.box = box(el);
    o.text = NORM(el.textContent).slice(0, 100);
    return o;
  };
  const isVisible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const chain = (el, max) => {
    const out = [];
    let n = el;
    let d = 0;
    while (n && n.nodeType === 1 && d < max) {
      const cs = getComputedStyle(n);
      out.push({
        tag: n.tagName.toLowerCase(),
        cls: (typeof n.className === "string" ? n.className : "").slice(0, 120),
        id: n.id || "",
        box: box(n),
        position: cs.position,
        display: cs.display,
        marginTop: cs.marginTop,
        marginBottom: cs.marginBottom,
        paddingTop: cs.paddingTop,
        paddingBottom: cs.paddingBottom,
      });
      n = n.parentElement;
      d++;
    }
    return out;
  };
  const bgLayers = (root, cap) => {
    const out = [];
    for (const el of root.querySelectorAll("*")) {
      if (out.length >= cap) break;
      const cs = getComputedStyle(el);
      const hasImg = cs.backgroundImage && cs.backgroundImage !== "none";
      const hasCol =
        cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent";
      const hasFilter = cs.filter && cs.filter !== "none";
      if (!hasImg && !hasCol && !hasFilter) continue;
      out.push({
        tag: el.tagName.toLowerCase(),
        cls: (typeof el.className === "string" ? el.className : "").slice(0, 120),
        box: box(el),
        display: cs.display,
        position: cs.position,
        visibility: cs.visibility,
        opacity: cs.opacity,
        zIndex: cs.zIndex,
        backgroundColor: cs.backgroundColor,
        backgroundImage: cs.backgroundImage.slice(0, 220),
        backgroundAttachment: cs.backgroundAttachment,
        backgroundPosition: cs.backgroundPosition,
        backgroundSize: cs.backgroundSize,
        filter: cs.filter,
        mixBlendMode: cs.mixBlendMode,
        isVisible: isVisible(el),
      });
    }
    return out;
  };

  const main = document.querySelector("main");
  let secs;
  if (side === "orig") {
    secs = [...document.querySelectorAll("#doz_body > .section_wrap")];
  } else {
    secs = [...document.querySelectorAll("main section")].filter(
      (el) => el.closest("main") === main && !(el.parentElement && el.parentElement.closest("section")),
    );
  }
  secs = secs.filter((el, i) => el.id !== "s20250811f489e3443bdbe").filter(isVisible).filter(
    (el) => getComputedStyle(el).position !== "fixed",
  );

  const sections = secs.map((el, i) => ({ i, ...snap(el) }));
  const findSec = (pred) => secs.find(pred);

  /* ---------------- T1: mobile pillar cards ---------------- */
  function T1() {
    const defs = [
      ["회사소개", "Company", "55a9cffce4f94", "/17", "w202509119ecb84eb6e940"],
      ["연구개발", "R&D", "aabafe51067b6", "/21", "w2025091149bbbec8e797d"],
      ["제품소개", "Products", "84fff7d77ffff", "/32", "w20250911cb710bccd6323"],
      ["홍보센터", "PR Center", "41c848eb0d74e", "/27", "w20250911edd80efa0562b"],
    ];
    const sec = findSec((s) => s.querySelector('img[src*="55a9cffce4f94"]')) || findSec((s) => /회사소개/.test(s.textContent));
    if (!sec) return { error: "T1 section not found" };
    const cards = defs.map(([ko, en, frag, href, widgetId]) => {
      const img = sec.querySelector(`img[src*="${frag}"]`);
      if (!img) return { ko, en, widgetId, href, missing: true };
      const a = img.closest("a") || img.parentElement;
      const overlay = a.querySelector(".img-title") || a.querySelector('[class*="img-title"]');
      const leaf = [...a.querySelectorAll("h5, h3, p, span, div")].filter(
        (e) => e.children.length === 0 && (NORM(e.textContent) === ko || NORM(e.textContent) === en),
      );
      return {
        ko,
        en,
        widgetId,
        href,
        imgSrc: img.currentSrc || img.src,
        imgAlt: img.getAttribute("alt") || "",
        imgBox: box(img),
        imgNatural: { w: img.naturalWidth, h: img.naturalHeight },
        cardBox: box(a),
        cardChain: chain(img, 6),
        overlayEl: overlay ? snap(overlay) : null,
        overlayLabelEls: leaf.map(snap),
        overlayPresent: !!overlay,
      };
    });
    return {
      sectionIdHint: "local s20250911281117781b494 / orig matching section",
      section: snap(sec),
      cardCount: cards.filter((c) => !c.missing).length,
      cards,
    };
  }

  /* ---------------- T2: mobile home hero ---------------- */
  function T2() {
    const sec = findSec((s) => /우리의 비전은 자연과 조화롭게 번성하고/.test(s.textContent));
    if (!sec) return { error: "T2 section not found" };
    return {
      section: snap(sec),
      layers: bgLayers(sec, 25),
      texts: [...sec.querySelectorAll("span,h6,p,strong")]
        .filter((e) => e.children.length === 0 && /우리의 비전|더 나은|에코웨이브의 가치/.test(e.textContent))
        .slice(0, 10)
        .map(snap),
    };
  }

  /* ---------------- T3: mobile home slider ---------------- */
  function T3() {
    const sec = findSec((s) => /정수 소재/.test(s.textContent) && /스마트 부품/.test(s.textContent));
    if (!sec) return { error: "T3 section not found" };
    const imgs = [...sec.querySelectorAll("img")].slice(0, 8).map((im) => ({
      src: im.currentSrc || im.src,
      alt: im.getAttribute("alt") || "",
      box: box(im),
      natural: { w: im.naturalWidth, h: im.naturalHeight },
      cls: (typeof im.className === "string" ? im.className : "").slice(0, 100),
    }));
    const texts = [...sec.querySelectorAll("p,h6,strong,span")]
      .filter((e) => e.children.length === 0 && /정수 소재|스마트 부품|정수기 필터|지속 가능한 수처리|생활환경|헬스/.test(e.textContent))
      .slice(0, 14)
      .map(snap);
    const tracks = [...sec.querySelectorAll("*")]
      .filter((e) => {
        const cs = getComputedStyle(e);
        return cs.overflowX !== "visible" || cs.transform !== "none" || /snap|owl|slider|slide|flex/.test(typeof e.className === "string" ? e.className : "");
      })
      .slice(0, 12)
      .map(snap);
    return { section: snap(sec), imgs, texts, tracks };
  }

  /* ---------------- T4: back-to-top widget ---------------- */
  function T4() {
    const hits = [...document.querySelectorAll('a[href="#doz_header"]')];
    const out = hits.slice(0, 6).map((a) => ({
      href: a.getAttribute("href"),
      snap: snap(a),
      chain: chain(a, 8),
    }));
    const btnTop = document.querySelector(".btn_top, .btn_top a, [class*='btn_top']");
    const header = document.querySelector("#doz_header_wrap, #doz_header");
    return {
      hitCount: hits.length,
      hits: out,
      btnTop: btnTop ? { snap: snap(btnTop), chain: chain(btnTop, 6) } : null,
      header: header ? snap(header) : null,
    };
  }

  /* ---------------- T5: desktop home #2 / #3 background ---------------- */
  function T5() {
    const sec3 = findSec((s) => /에코웨이브는 깨끗한 물을 위한 기술 혁신/.test(s.textContent));
    const sec2 = findSec((s) => /건강하고 깨끗한 물, 에코웨이브가/.test(s.textContent));
    const pack = (sec) =>
      sec
        ? { section: snap(sec), layers: bgLayers(sec, 20), imgs: [...sec.querySelectorAll("img")].slice(0, 6).map((im) => ({ src: im.currentSrc || im.src, box: box(im) })) }
        : { error: "not found" };
    return { "sec3_ecowave": pack(sec3), "sec2_pillars": pack(sec2) };
  }

  const groupOut = {};
  if (group === "mobile") {
    groupOut.T1 = T1();
    groupOut.T2 = T2();
    groupOut.T3 = T3();
    groupOut.T4 = T4();
  } else {
    groupOut.T5 = T5();
  }
  return { side, group, url: location.href, sections, targets: groupOut };
}

/* ------------------------- pixel sampling ------------------------- */
function avgColor(png, x0, y0, w, h) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = y0; y < Math.min(y0 + h, png.height); y++) {
    for (let x = x0; x < Math.min(x0 + w, png.width); x++) {
      const p = (y * png.width + x) * 4;
      r += png.data[p];
      g += png.data[p + 1];
      b += png.data[p + 2];
      n++;
    }
  }
  if (!n) return null;
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
}

async function sample(page, selector, label) {
  const b = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    el.scrollIntoView({ block: "start" });
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, selector);
  if (!b) return { label, selector, error: "not found" };
  const clip = {
    x: Math.max(0, Math.round(b.x + 6)),
    y: Math.max(0, Math.round(b.y + 6)),
    width: Math.max(1, Math.min(140, Math.round(b.w - 12))),
    height: Math.max(1, Math.min(40, Math.round(b.h - 12))),
  };
  const buf = await page.screenshot({ clip });
  const png = PNG.sync.read(buf);
  return { label, selector, box: b, avg: avgColor(png, 0, 0, png.width, png.height) };
}

/* ------------------------- main ------------------------- */
async function collect(browser, side, vpName, group, urls) {
  const vp = VIEWPORTS[vpName];
  const base = side === "orig" ? ORIG_BASE : DEFAULT_LOCAL_BASE;
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, colorScheme: "light" });
  const page = await ctx.newPage();
  let result = null;
  try {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(base + urls, { waitUntil: "load", timeout: 45000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(700);
    await page.addStyleTag({ content: HIDE_DEV_STYLE }).catch(() => {});
    await scrollThrough(page);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(700);
    if (side === "orig") {
      await page.addStyleTag({ content: FORCE_REVEAL_STYLE });
      await page.waitForTimeout(200);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    result = await page.evaluate(PROBE, { side, group });
    console.log(`[${side}/${vpName}] probe ok sections=${result.sections.length}`);
  } catch (e) {
    const msg = (e && e.message ? e.message : String(e)).split("\n")[0];
    console.error(`[${side}/${vpName}] FAIL ${msg}`);
    result = { side, group, error: msg };
  }
  return { page, ctx, result };
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const data = { generatedAt: new Date().toISOString(), mobile: {}, desktop: {}, pixels: [] };

  for (const side of ["orig", "local"]) {
    const { page, ctx, result } = await collect(browser, side, "mobile", "mobile", "/");
    data.mobile[side] = result;
    if (!result.error) {
      try {
        data.pixels.push(await sample(page, 'main section, #doz_body > .section_wrap', `mobile-${side}-hero`));
      } catch (e) {
        data.pixels.push({ label: `mobile-${side}-hero`, error: String(e.message || e) });
      }
    }
    await ctx.close();
  }

  for (const side of ["orig", "local"]) {
    const { page, ctx, result } = await collect(browser, side, "desktop", "desktop", "/");
    data.desktop[side] = result;
    if (!result.error) {
      const sec3sel =
        side === "orig"
          ? "#doz_body > .section_wrap"
          : "main section";
      try {
        const box = await page.evaluate((sel) => {
          const secs = [...document.querySelectorAll(sel)].filter((el) => {
            const cs = getComputedStyle(el);
            return cs.display !== "none" && el.getBoundingClientRect().height > 0 && /에코웨이브는 깨끗한 물을 위한 기술 혁신/.test(el.textContent);
          });
          const el = secs[0];
          if (!el) return null;
          el.scrollIntoView({ block: "start" });
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        }, sec3sel);
        if (box) {
          const clip = { x: Math.round(box.x + 6), y: Math.round(box.y + 6), width: 160, height: 40 };
          const buf = await page.screenshot({ clip });
          const png = PNG.sync.read(buf);
          data.pixels.push({ label: `desktop-${side}-sec3-topband`, box, avg: avgColor(png, 0, 0, png.width, png.height) });
        }
      } catch (e) {
        data.pixels.push({ label: `desktop-${side}-sec3-topband`, error: String(e.message || e) });
      }
    }
    await ctx.close();
  }

  await browser.close();
  await fs.writeFile(path.join(OUT, "hot-probe.json"), JSON.stringify(data, null, 2));
  await fs.writeFile(path.join(OUT, "hot-probe-pixels.json"), JSON.stringify(data.pixels, null, 2));
  console.log("wrote design/audit/hot-probe.json");
  console.log("wrote design/audit/hot-probe-pixels.json");
}

main().catch((e) => {
  console.error((e && e.message ? e.message : String(e)).split("\n")[0]);
  process.exit(1);
});
