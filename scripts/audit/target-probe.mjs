/**
 * Target probe — three pixel-parity root-cause investigations.
 *
 *   A) sub-page hero vertical offset (1720-px desktop)
 *   B) home gray band background source (1720-px desktop)
 *   C) orig hero carousel interval + dot geometry
 *
 * INVESTIGATION ONLY: reads live computed styles/geometry + decoded screenshot
 * pixels and writes design/audit/target-probe/<side>-<probe>.json.
 *
 * Usage:
 *   node scripts/audit/target-probe.mjs [--side=orig|local|both] [--probe=A,B,C] [--base=http://localhost:4517]
 *
 * Reuses the style-probe.mjs browser setup (chrome channel, dsf 1, light,
 * reducedMotion reduce) and the pages.mjs URL mapping. Viewport is fixed at
 * 1440x900 for every probe.
 */
import { chromium } from "playwright-core";
import fs from "node:fs/promises";
import zlib from "node:zlib";
import path from "node:path";
import { ORIG_BASE, DEFAULT_LOCAL_BASE } from "./pages.mjs";

/* ------------------------------------------------------------------ args */

const args = process.argv.slice(2);
const getArg = (name, dflt) => {
  const a = args.find((x) => x.startsWith("--" + name + "="));
  return a ? a.split("=").slice(1).join("=") : dflt;
};

const SIDE_ARG = getArg("side", "both");
const SIDES = SIDE_ARG === "both" ? ["orig", "local"] : [SIDE_ARG];
if (!SIDES.length || !SIDES.every((s) => s === "orig" || s === "local")) {
  console.error("usage: node scripts/audit/target-probe.mjs [--side=orig|local|both] [--probe=A,B,C]");
  process.exit(1);
}
const PROBES = getArg("probe", "A,B,C")
  .split(",")
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);
for (const p of PROBES) {
  if (!["A", "B", "C"].includes(p)) {
    console.error(`unknown probe: ${p} (expected A,B,C)`);
    process.exit(1);
  }
}
const BASES = { orig: ORIG_BASE, local: getArg("base", DEFAULT_LOCAL_BASE) };
const OUT = path.resolve("design/audit/target-probe");
const VP = { width: 1440, height: 900 };

/* PROBE A page pairs (orig numeric route -> local route) */
const A_PAIRS = [
  { key: "company", orig: "/15", local: "/company" },
  { key: "company.ceo", orig: "/16", local: "/company/ceo" },
  { key: "company.philosophy", orig: "/18", local: "/company/philosophy" },
  { key: "company.global", orig: "/20", local: "/company/global" },
  { key: "notices", orig: "/27", local: "/notices" },
  { key: "news", orig: "/29", local: "/news" },
];

const HIDE_DEV_STYLE =
  "nextjs-portal, [data-nextjs-toast], [data-nextjs-dialog], [data-nextjs-dev-tools-button] { display: none !important; }";

/* ------------------------------------------------------- png pixel reader */

/**
 * Minimal 8-bit non-interlaced PNG decoder (RGB / RGBA / gray / gray+alpha).
 * Playwright screenshots satisfy this; returns {width,height,channels,data}.
 */
function decodePng(buf) {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a png");
  let off = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    off += 12 + len;
  }
  if (bitDepth !== 8) throw new Error("unsupported png bitDepth " + bitDepth);
  if (interlace !== 0) throw new Error("interlaced png unsupported");
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error("unsupported png colorType " + colorType);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const ft = raw[pos++];
    const row = raw.subarray(pos, pos + stride);
    pos += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= channels ? prev[x - channels] : 0;
      let v = row[x];
      if (ft === 1) v = (v + a) & 255;
      else if (ft === 2) v = (v + b) & 255;
      else if (ft === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (ft === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        v = (v + pr) & 255;
      }
      cur[x] = v;
    }
  }
  return { width, height, channels, data: out };
}

function pixelAt(img, x, y) {
  const { width, height, channels, data } = img;
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  const i = (y * width + x) * channels;
  const r = data[i];
  const g = channels >= 3 ? data[i + 1] : r;
  const b = channels >= 3 ? data[i + 2] : r;
  const a = channels === 4 ? data[i + 3] : channels === 2 ? data[i + 1] : 255;
  return [r, g, b, a];
}

function isGray([r, g, b]) {
  return Math.abs(r - g) <= 3 && Math.abs(g - b) <= 3;
}

/* -------------------------------------------------------- page evaluates */

/** Detailed hero extraction. Pass { cap } for text-element cap. */
function A_EXTRACT(opts) {
  const cap = (opts && opts.cap) || 140;
  const norm = (s, n) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, n);
  const cls = (el) => (typeof el.className === "string" ? norm(el.className, 120) : "");
  const widget = (el) => {
    const w = el.closest ? el.closest("[data-widget-type]") : null;
    return w ? w.getAttribute("data-widget-type") : null;
  };
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
  };
  const info = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName.toLowerCase(),
      cls: cls(el),
      id: el.id || "",
      widget: widget(el),
      text: norm(el.innerText, 90),
      rect: {
        x: +r.x.toFixed(2),
        y: +r.y.toFixed(2),
        w: +r.width.toFixed(2),
        h: +r.height.toFixed(2),
        bottom: +r.bottom.toFixed(2),
      },
      display: cs.display,
      position: cs.position,
      margin: [cs.marginTop, cs.marginRight, cs.marginBottom, cs.marginLeft],
      padding: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft],
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight,
      letterSpacing: cs.letterSpacing,
      textTransform: cs.textTransform,
      color: cs.color,
      fontFamily: cs.fontFamily,
      textAlign: cs.textAlign,
      alignItems: cs.alignItems,
      justifyContent: cs.justifyContent,
      verticalAlign: cs.verticalAlign,
      minHeight: cs.minHeight,
      height: cs.height,
      backgroundColor: cs.backgroundColor,
      borderBottom: cs.borderBottomWidth + " " + cs.borderBottomStyle + " " + cs.borderBottomColor,
    };
  };

  const heads = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(vis);
  let title = null, best = 0;
  for (const h of heads) {
    const r = h.getBoundingClientRect();
    const fs = parseFloat(getComputedStyle(h).fontSize) || 0;
    if (r.top > -200 && r.top < 900 && fs > best) {
      best = fs;
      title = h;
    }
  }
  if (!title && heads.length) title = heads[0];

  const chain = [];
  let el = title;
  for (let i = 0; el && i < 14; i++) {
    chain.push(info(el));
    if (el === document.body) break;
    el = el.parentElement;
  }

  let root = title ? title.parentElement : null;
  let heroRoot = null;
  for (let i = 0; root && i < 12; i++) {
    const r = root.getBoundingClientRect();
    if (r.height >= 240 && r.height <= 660 && r.top > -60 && r.width >= 900) {
      heroRoot = root;
      break;
    }
    root = root.parentElement;
  }
  const section = title ? title.closest("section") : null;
  const heroRect = heroRoot ? heroRoot.getBoundingClientRect() : title ? title.getBoundingClientRect() : null;
  // comparable window on both sides: the hero band plus the first ~650px of the
  // content below it (orig has no <section> around the hero, local does — so a
  // document-wide y-window is the only fair scope).
  const yMin = (heroRect ? heroRect.top : 0) - 140;
  const yMax = (heroRect ? heroRect.bottom : 900) + 650;

  const texts = [];
  const seen = new Set();
  for (const e of document.querySelectorAll("h1,h2,h3,h4,h5,h6,p,strong,em,span,a,li,button")) {
    if (!vis(e) || seen.has(e)) continue;
    const r = e.getBoundingClientRect();
    if (r.top < yMin || r.top > yMax) continue;
    if (!norm(e.innerText, 90)) continue;
    seen.add(e);
    texts.push({ ...info(e), zone: heroRect && r.top < heroRect.bottom ? "hero" : "below" });
    if (texts.length >= cap) break;
  }

  const spacers = [];
  const spacerScope = heroRoot || document;
  for (const e of spacerScope.querySelectorAll('[data-widget-type="padding"], .padding, .spacer')) {
    if (!vis(e)) continue;
    const cs = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    spacers.push({
      tag: e.tagName.toLowerCase(),
      cls: cls(e),
      widget: widget(e),
      rect: { y: +r.y.toFixed(2), h: +r.height.toFixed(2), bottom: +r.bottom.toFixed(2) },
      height: cs.height,
      marginTop: cs.marginTop,
      marginBottom: cs.marginBottom,
      paddingTop: cs.paddingTop,
      paddingBottom: cs.paddingBottom,
    });
  }

  const navEl = (heroRoot || document).querySelector('nav, .sub-menu, [data-widget-type="sub_menu"]');
  const navInfo = navEl ? info(navEl) : null;

  // ---- first band below the hero (the hero-photo caption the observer calls
  // the "hero subtitle"): heading chain + spacers + rows, to locate the delta.
  const headsAll = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(vis);
  const belowHeads = headsAll
    .filter((h) => h.getBoundingClientRect().top > (heroRect ? heroRect.bottom : 0))
    .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  const belowHead = belowHeads[0] || null;
  const belowChain = [];
  for (let e = belowHead, i = 0; e && i < 14; i++) {
    belowChain.push(info(e));
    if (e === document.body) break;
    e = e.parentElement;
  }
  const belowSection = belowHead
    ? belowHead.closest("section") || belowHead.closest('[class*="section_wrap"]') || belowHead.parentElement
    : null;
  const belowSpacers = [];
  const belowRows = [];
  if (belowSection) {
    for (const e of belowSection.querySelectorAll('[data-widget-type="padding"], .padding, .spacer')) {
      if (!vis(e)) continue;
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      belowSpacers.push({
        tag: e.tagName.toLowerCase(),
        cls: cls(e),
        widget: widget(e),
        rect: { y: +r.y.toFixed(2), h: +r.height.toFixed(2), bottom: +r.bottom.toFixed(2) },
        height: cs.height,
        minHeight: cs.minHeight,
        margin: [cs.marginTop, cs.marginRight, cs.marginBottom, cs.marginLeft],
        padding: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft],
      });
    }
    for (const e of belowSection.querySelectorAll(".imweb-row, .doz_row")) {
      if (!vis(e)) continue;
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      belowRows.push({
        tag: e.tagName.toLowerCase(),
        cls: cls(e),
        rowH: cs.getPropertyValue("--row-h"),
        rect: { y: +r.y.toFixed(2), h: +r.height.toFixed(2), bottom: +r.bottom.toFixed(2) },
        minHeight: cs.minHeight,
        margin: [cs.marginTop, cs.marginRight, cs.marginBottom, cs.marginLeft],
        padding: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft],
        display: cs.display,
        gridTemplateRows: cs.gridTemplateRows,
      });
    }
  }
  const belowBand = {
    heroBottom: heroRect ? +heroRect.bottom.toFixed(2) : null,
    head: belowHead ? info(belowHead) : null,
    section: belowSection ? info(belowSection) : null,
    sectionTop: belowSection ? +belowSection.getBoundingClientRect().top.toFixed(2) : null,
    chain: belowChain,
    spacers: belowSpacers,
    rows: belowRows,
  };

  return {
    url: location.href,
    scrollY: window.scrollY,
    docHeight: document.documentElement.scrollHeight,
    titleInfo: title ? info(title) : null,
    heroRoot: heroRoot ? info(heroRoot) : null,
    section: section ? info(section) : null,
    navInfo,
    chain,
    texts,
    spacers,
    belowBand,
  };
}

/** PROBE B: element stack + composited-ancestor info at one viewport point. */
function B_POINT(opts) {
  const x = opts.x, docY = opts.docY, sy = opts.sy;
  const vy = Math.round(docY - sy);
  const norm = (s, n) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, n);
  const cls = (el) => (typeof el.className === "string" ? norm(el.className, 120) : "");
  const paints = (el) => {
    if (el.tagName === "IMG") return true;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return false;
    const bg = cs.backgroundColor;
    const m = /rgba?\(([^)]+)\)/.exec(bg);
    if (m) {
      const parts = m[1].split(",").map((s) => parseFloat(s));
      if (parts.length < 4 || parts[3] > 0) return true;
    }
    if (cs.backgroundImage && cs.backgroundImage !== "none") return true;
    return false;
  };
  const info = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || "",
      cls: cls(el),
      text: norm(el.innerText, 70),
      color: cs.color,
      widget: el.closest && el.closest("[data-widget-type]") ? el.closest("[data-widget-type]").getAttribute("data-widget-type") : null,
      rect: { x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2), bottom: +r.bottom.toFixed(2) },
      backgroundColor: cs.backgroundColor,
      backgroundImage: cs.backgroundImage === "none" ? "none" : norm(cs.backgroundImage, 140),
      backgroundAttachment: cs.backgroundAttachment,
      backgroundSize: cs.backgroundSize,
      backgroundPosition: cs.backgroundPosition,
      backgroundRepeat: cs.backgroundRepeat,
      opacity: cs.opacity,
      mixBlendMode: cs.mixBlendMode,
      filter: cs.filter,
      isolation: cs.isolation,
      position: cs.position,
      zIndex: cs.zIndex,
      transform: cs.transform,
      willChange: cs.willChange,
      borderRadius: cs.borderRadius,
      paint: paints(el),
    };
  };

  const stack = document.elementsFromPoint(x, vy);
  let painterIdx = -1;
  for (let i = 0; i < stack.length; i++) {
    if (paints(stack[i])) {
      painterIdx = i;
      break;
    }
  }
  const painter = painterIdx >= 0 ? stack[painterIdx] : stack[0] || null;
  const section = painter ? painter.closest("section") : null;

  const ancestors = [];
  let a = painter;
  for (let i = 0; a && i < 14; i++) {
    ancestors.push(info(a));
    if (a === document.body) break;
    a = a.parentElement;
  }

  const desc = [];
  if (section) {
    for (const e of section.querySelectorAll("*")) {
      const cs = getComputedStyle(e);
      const bg = cs.backgroundColor;
      const m = /rgba?\(([^)]+)\)/.exec(bg);
      const hasAlpha = m ? m[1].split(",").length < 4 || parseFloat(m[1].split(",")[3]) > 0 : false;
      const hasImg = cs.backgroundImage !== "none";
      const special = hasAlpha || hasImg || cs.mixBlendMode !== "normal" || cs.filter !== "none" || parseFloat(cs.opacity) < 1;
      if (!special) continue;
      desc.push(info(e));
      if (desc.length >= 80) break;
    }
  }

  return {
    docY,
    x,
    vy,
    scrollY: window.scrollY,
    stack: stack.map(info),
    painterIdx,
    painter: painter ? info(painter) : null,
    section: section ? info(section) : null,
    sectionIdAttr: section ? section.id || "" : "",
    ancestors,
    sectionDesc: desc,
  };
}

/** PROBE C: one carousel state sample (scoped to the hero carousel). */
function C_STATE() {
  const root = document.querySelector(".visual_section .owl-carousel") || document.querySelector(".owl-carousel");
  const items = root ? [...root.querySelectorAll(".owl-item")] : [];
  const dc = document.querySelector(".visual_section .owl-dots") || document.querySelector(".owl-dots");
  const owlDots = dc ? [...dc.querySelectorAll(".owl-dot")] : [];
  const localDots = [...document.querySelectorAll('button[aria-label^="슬라이드"]')];
  const activeItem = items.findIndex((e) => e.classList.contains("active"));
  let activeDot = owlDots.findIndex((e) => e.classList.contains("active"));
  if (activeDot < 0 && localDots.length) {
    activeDot = localDots.findIndex((b) => {
      const s = b.querySelector("span");
      return s ? s.className.includes("opacity-100") : false;
    });
  }
  return {
    t: Date.now(),
    perf: Math.round(performance.now()),
    owlItems: items.length,
    owlDots: owlDots.length,
    localDots: localDots.length,
    activeItem,
    activeDot,
  };
}

/** PROBE C: dot/pager geometry dump. */
function C_DOTS() {
  const norm = (s, n) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, n);
  const inf = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName.toLowerCase(),
      cls: norm(typeof el.className === "string" ? el.className : "", 100),
      rect: { x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) },
      width: cs.width,
      height: cs.height,
      margin: [cs.marginTop, cs.marginRight, cs.marginBottom, cs.marginLeft],
      padding: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft],
      backgroundColor: cs.backgroundColor,
      border: cs.border,
      borderRadius: cs.borderRadius,
      opacity: cs.opacity,
      position: cs.position,
      display: cs.display,
      transform: cs.transform,
      lineHeight: cs.lineHeight,
      cssBottom: cs.bottom,
      cssLeft: cs.left,
    };
  };
  const owlDotsRoot = document.querySelector(".visual_section .owl-dots") || document.querySelector(".owl-dots");
  let dots = owlDotsRoot ? [...owlDotsRoot.querySelectorAll(".owl-dot")] : [];
  let kind = "owl";
  if (!dots.length) {
    dots = [...document.querySelectorAll('button[aria-label^="슬라이드"]')];
    kind = "local-buttons";
  }
  const container = (kind === "owl" ? owlDotsRoot : dots[0] ? dots[0].parentElement : null) || null;
  const carousel =
    document.querySelector(".visual_section .owl-carousel") ||
    document.querySelector(".owl-carousel") ||
    (dots[0] ? dots[0].closest("section") : null);
  const childrenDetail = container
    ? [...container.children].slice(0, 4).map((c) => ({
        ...inf(c),
        inner: [...c.querySelectorAll("*")].slice(0, 2).map(inf),
        html: norm(c.outerHTML, 300),
      }))
    : [];
  return {
    kind,
    dotCount: dots.length,
    viewportH: window.innerHeight,
    container: container ? inf(container) : null,
    containerBottomOffset: container ? +(window.innerHeight - container.getBoundingClientRect().bottom).toFixed(2) : null,
    containerTopOffset: container ? +container.getBoundingClientRect().top.toFixed(2) : null,
    carousel: carousel ? inf(carousel) : null,
    dots: dots.slice(0, 12).map(inf),
    containerChildren: childrenDetail,
    owlDotsHtml: container ? norm(container.outerHTML, 700) : null,
  };
}

/* ------------------------------------------------------------- utilities */

async function goto(page, url) {
  await page.goto(url, { waitUntil: "load", timeout: 45000 });
  await page.waitForTimeout(1400);
  await page.addStyleTag({ content: HIDE_DEV_STYLE }).catch(() => {});
}

async function writeJson(side, probe, data) {
  await fs.mkdir(OUT, { recursive: true });
  const file = path.join(OUT, `${side}-${probe}.json`);
  await fs.writeFile(file, JSON.stringify(data, null, 2));
  return file;
}

async function scrollThrough(page) {
  await page.evaluate(async () => {
    await new Promise((res) => {
      let y = 0;
      const step = () => {
        y += 600;
        window.scrollTo(0, y);
        if (y < document.body.scrollHeight + 1200) setTimeout(step, 40);
        else {
          window.scrollTo(0, 0);
          res();
        }
      };
      step();
    });
  });
  await page.waitForTimeout(400);
}

/* ----------------------------------------------------------- probe A run */

async function runProbeA(page, side, base) {
  const out = { side, probe: "A", vp: VP, pages: {}, primary: {} };
  for (const pair of A_PAIRS) {
    const url = base + (side === "orig" ? pair.orig : pair.local);
    const isPrimary = pair.key === "company";
    try {
      await goto(page, url);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);
      const data = await page.evaluate(A_EXTRACT, { cap: isPrimary ? 160 : 24 });
      out.pages[pair.key] = {
        key: pair.key,
        url,
        titleInfo: data.titleInfo,
        heroRoot: data.heroRoot,
        section: data.section,
        navInfo: data.navInfo,
        spacers: data.spacers,
      };
      if (isPrimary) {
        out.primary = {
          key: pair.key,
          url,
          scrollY: data.scrollY,
          docHeight: data.docHeight,
          titleInfo: data.titleInfo,
          heroRoot: data.heroRoot,
          section: data.section,
          navInfo: data.navInfo,
          chain: data.chain,
          texts: data.texts,
          spacers: data.spacers,
          belowBand: data.belowBand,
        };
      }
      const bh = data.belowBand && data.belowBand.head;
      console.log(
        `[${side}/A] ${pair.key} hero.h=${data.heroRoot ? data.heroRoot.rect.h : "?"} title.y=${data.titleInfo ? data.titleInfo.rect.y : "?"} nav.y=${data.navInfo ? data.navInfo.rect.y : "?"} below.head.y=${bh ? bh.rect.y : "?"} (${bh ? bh.fontSize : "?"})`
      );
    } catch (e) {
      const msg = (e && e.message ? e.message : String(e)).split("\n")[0];
      console.error(`[${side}/A] ${pair.key} FAIL ${msg}`);
      out.pages[pair.key] = { key: pair.key, url, error: msg };
    }
  }
  return out;
}

/* ----------------------------------------------------------- probe B run */

async function runProbeB(page, side, base) {
  const url = base + "/";
  const out = { side, probe: "B", vp: VP, url, colorProfile: [], points: [], error: null, notes: [] };
  try {
    await goto(page, url);
    await scrollThrough(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(600);

    const docHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    out.docHeight = docHeight;
    out.notes.push("bg-attachment:fixed parallax -> colours read live after each scrollTo");

    // colour profile at x=720 across docY 700..3600 via viewport screenshots
    const fromY = 700, toY = Math.min(3650, docHeight - 5), step = 5, shotH = VP.height;
    const map = new Map();
    for (let sy = Math.max(0, fromY - 40); sy < toY; sy += shotH - 120) {
      await page.evaluate((y) => window.scrollTo(0, y), sy);
      await page.waitForTimeout(180);
      let img;
      try {
        const buf = await page.screenshot({ clip: { x: 0, y: 0, width: VP.width, height: VP.height } });
        img = decodePng(buf);
      } catch (e) {
        out.notes.push(`screenshot@${sy} failed: ${(e.message || e).split("\n")[0]}`);
        continue;
      }
      for (let vy = 0; vy < img.height; vy += step) {
        const docY = sy + vy;
        if (docY < fromY || docY > toY) continue;
        const px = pixelAt(img, 720, vy);
        if (!px) continue;
        map.set(docY, { docY, sy, rgb: [px[0], px[1], px[2]] });
      }
    }
    out.colorProfile = [...map.values()].sort((a, b) => a.docY - b.docY).filter((_, i) => i % 5 === 0);

    // explicit observer sample points: x=720 at docY 1900/2100/2300/2500 (+edges)
    const sampleYs = [1807, 1900, 2100, 2300, 2500, 2710, 2850, 3475];
    for (const docY of sampleYs) {
      const sy = Math.max(0, Math.min(docY - 450, Math.max(0, docHeight - shotH)));
      await page.evaluate((y) => window.scrollTo(0, y), sy);
      await page.waitForTimeout(180);
      let doc;
      try {
        doc = await page.evaluate(B_POINT, { x: 720, docY, sy });
      } catch (e) {
        out.notes.push(`B_POINT@${docY} failed: ${(e.message || e).split("\n")[0]}`);
        continue;
      }
      let rgb = null;
      try {
        const buf = await page.screenshot({ clip: { x: 720, y: Math.round(docY - sy), width: 1, height: 1 } });
        const px = pixelAt(decodePng(buf), 0, 0);
        rgb = px ? [px[0], px[1], px[2]] : null;
      } catch (e) {
        out.notes.push(`pixel@${docY} failed: ${(e.message || e).split("\n")[0]}`);
      }
      doc.rgb = rgb;
      doc.gray = rgb ? isGray(rgb) : null;
      out.points.push(doc);
      const painter = doc.painter;
      console.log(
        `[${side}/B] docY=${docY} rgb=${rgb ? rgb.join(",") : "?"} painter=${painter ? painter.tag + "." + (painter.cls || "").split(" ").slice(0, 2).join(".") : "?"} bg=${painter ? painter.backgroundColor : "?"} img=${painter && painter.backgroundImage !== "none" ? "yes" : "no"} attach=${painter ? painter.backgroundAttachment : "?"}`
      );
    }
  } catch (e) {
    const msg = (e && e.message ? e.message : String(e)).split("\n")[0];
    console.error(`[${side}/B] FAIL ${msg}`);
    out.error = msg;
  }
  return out;
}

/* ----------------------------------------------------------- probe C run */

async function runProbeC(page, side, base) {
  const url = base + "/";
  const out = { side, probe: "C", vp: VP, url, samples: [], transitions: [], intervals: [], summary: null, dots: null, error: null };
  try {
    await goto(page, url);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1500);
    out.dots = await page.evaluate(C_DOTS).catch(() => null);

    const t0 = Date.now();
    const samples = [];
    while (Date.now() - t0 < 15000) {
      const s = await page.evaluate(C_STATE);
      samples.push(s);
      await page.waitForTimeout(100);
    }
    out.samples = samples;

    // derive index transitions (prefer owl active item, else active dot)
    const pick = (s) => (s.activeItem >= 0 ? `i${s.activeItem}` : s.activeDot >= 0 ? `d${s.activeDot}` : "none");
    let last = null;
    for (const s of samples) {
      const k = pick(s);
      if (k === "none") continue;
      if (last === null) {
        last = { k, t: s.t };
        out.transitions.push({ at: s.t - t0, index: k, initial: true });
        continue;
      }
      if (k !== last.k) {
        out.transitions.push({ at: s.t - t0, index: k, msSincePrev: s.t - last.t });
        last = { k, t: s.t };
      }
    }
    out.intervals = out.transitions.filter((x) => !x.initial).map((x) => x.msSincePrev);
  } catch (e) {
    const msg = (e && e.message ? e.message : String(e)).split("\n")[0];
    console.error(`[${side}/C] FAIL ${msg}`);
    out.error = msg;
  }
  return out;
}

/* ------------------------------------------------------------------ main */

async function runProbe(name, page, side, base) {
  if (name === "A") return runProbeA(page, side, base);
  if (name === "B") return runProbeB(page, side, base);
  return runProbeC(page, side, base);
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const summary = {};

  for (const side of SIDES) {
    const base = BASES[side];
    const ctx = await browser.newContext({
      viewport: { width: VP.width, height: VP.height },
      deviceScaleFactor: 1,
      colorScheme: "light",
    });
    const page = await ctx.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });
    summary[side] = {};

    for (const probe of PROBES) {
      const t0 = Date.now();
      const data = await runProbe(probe, page, side, base);
      data.durationMs = Date.now() - t0;
      const file = await writeJson(side, probe, data);
      summary[side][probe] = data;
      console.log(`wrote ${file} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    }
    await ctx.close();
  }

  await browser.close();

  /* cross-side compact delta print */
  const line = (s) => console.log(s);
  line("\n================ CROSS-SIDE SUMMARY ================");

  // A
  if (PROBES.includes("A")) {
    line("\n--- PROBE A: sub-page hero (y values are viewport px, header 88) ---");
    const keys = A_PAIRS.map((p) => p.key);
    for (const k of keys) {
      const o = summary.orig && summary.orig.A && summary.orig.A.pages[k];
      const l = summary.local && summary.local.A && summary.local.A.pages[k];
      const f = (p) =>
        p && p.titleInfo
          ? `title.y=${p.titleInfo.rect.y} title.b=${p.titleInfo.rect.bottom} h=${p.titleInfo.rect.h} | nav.y=${p.navInfo ? p.navInfo.rect.y : "?"} nav.b=${p.navInfo ? p.navInfo.rect.bottom : "?"} | hero.h=${p.heroRoot ? p.heroRoot.rect.h : "?"}`
          : p && p.error
            ? `ERROR ${p.error}`
            : "n/a";
      line(`  ${k}\n     orig : ${f(o)}\n     local: ${f(l)}`);
    }
    const op = summary.orig && summary.orig.A && summary.orig.A.primary;
    const lp = summary.local && summary.local.A && summary.local.A.primary;
    if (op && lp && op.navInfo && lp.navInfo) {
      line(
        `  primary nav delta (orig-local): y=${(op.navInfo.rect.y - lp.navInfo.rect.y).toFixed(1)} bottom=${(op.navInfo.rect.bottom - lp.navInfo.rect.bottom).toFixed(1)}`
      );
    }
    if (op && lp && op.titleInfo && lp.titleInfo) {
      line(
        `  primary title delta (orig-local): y=${(op.titleInfo.rect.y - lp.titleInfo.rect.y).toFixed(1)} bottom=${(op.titleInfo.rect.bottom - lp.titleInfo.rect.bottom).toFixed(1)}`
      );
    }
    const ob = op && op.belowBand && op.belowBand.head;
    const lb = lp && lp.belowBand && lp.belowBand.head;
    if (ob && lb) {
      line(
        `  primary below-band head delta (orig-local): y=${(ob.rect.y - lb.rect.y).toFixed(1)} (orig ${ob.rect.y} vs local ${lb.rect.y}) <- the actual ~15px subtitle offset`
      );
    }
  }

  // B
  if (PROBES.includes("B")) {
    line("\n--- PROBE B: home gray band x=720 ---");
    for (const k of [1900, 2100, 2300, 2500, 2850, 3475]) {
      const o = summary.orig && summary.orig.B && (summary.orig.B.points || []).find((p) => p.docY === k);
      const l = summary.local && summary.local.B && (summary.local.B.points || []).find((p) => p.docY === k);
      const f = (p) =>
        p ? `rgb=${p.rgb ? p.rgb.join(",") : "?"} painter=${p.painter ? p.painter.tag + " " + (p.painter.cls || "").split(" ")[0] : "?"} bg=${p.painter ? p.painter.backgroundColor : "?"} img=${p.painter ? p.painter.backgroundImage !== "none" : "?"} attach=${p.painter ? p.painter.backgroundAttachment : "?"}` : "n/a";
      line(`  y=${k}\n     orig : ${f(o)}\n     local: ${f(l)}`);
    }
  }

  // C
  if (PROBES.includes("C")) {
    line("\n--- PROBE C: carousel ---");
    for (const side of SIDES) {
      const c = summary[side] && summary[side].C;
      if (!c) continue;
      if (c.error) {
        line(`  ${side}: ERROR ${c.error}`);
        continue;
      }
      const iv = c.intervals || [];
      const sorted = [...iv].sort((a, b) => a - b);
      line(
        `  ${side}: transitions=${c.transitions.length} intervals(ms)=${JSON.stringify(iv)} median=${sorted.length ? sorted[Math.floor(sorted.length / 2)] : "?"} max=${sorted.length ? sorted[sorted.length - 1] : "?"}`
      );
      if (c.dots) {
        const d0 = c.dots.dots && c.dots.dots[0];
        const inner0 = c.dots.containerChildren && c.dots.containerChildren[0] && c.dots.containerChildren[0].inner && c.dots.containerChildren[0].inner[0];
        line(
          `  ${side}: dots kind=${c.dots.kind} count=${c.dots.dotCount} container=${c.dots.container ? JSON.stringify(c.dots.container.rect) : "?"} bottomOffset=${c.dots.containerBottomOffset} h=${c.dots.container ? c.dots.container.height : "?"} containerLineHeight=${c.dots.container ? c.dots.container.lineHeight : "?"}`
        );
        line(
          `  ${side}:   dot0=${d0 ? JSON.stringify(d0.rect) : "?"} span=${inner0 ? JSON.stringify(inner0.rect) + " op=" + inner0.opacity + " bg=" + inner0.backgroundColor : "?"} containerChildren=${c.dots.containerChildren ? c.dots.containerChildren.length : "?"}`
        );
      }
    }
  }

  console.log("\ndone.");
}

main().catch((e) => {
  console.error((e && e.message ? e.message : String(e)).split("\n")[0]);
  process.exit(1);
});
