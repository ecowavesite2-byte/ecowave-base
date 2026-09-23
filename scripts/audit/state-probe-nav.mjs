/**
 * Header-level interactive-state parity probe (nav / header).
 *
 * The generic hover-probe (scripts/audit/hover-probe.mjs) is imweb-anchored and
 * cannot match the local DOM (on the rebuild it discovers navLinks=0). This
 * probe measures BOTH sides with PER-SIDE selectors, so the header interactive
 * states (default / hover / active) can be compared 1:1.
 *
 * Browser setup mirrors hover-probe.mjs: chromium (channel chrome, headless),
 * 1440x900, deviceScaleFactor 1, colorScheme light.
 *
 * Method per measurement:
 *   1. read computed props "before"
 *   2. scrollIntoView({block:center}) + wait
 *   3. page.mouse.move() to the element centre
 *   4. VERIFY el.matches(':hover') before reading "after"
 *   5. read computed props "after"
 *   6. move the mouse away and settle
 *
 * Output:
 *   design/audit/state-probe/nav-report.json
 *   design/audit/state-probe/nav-report.md
 *
 * Usage:
 *   node scripts/audit/state-probe-nav.mjs
 */
import { chromium } from "playwright-core";
import fs from "node:fs/promises";
import path from "node:path";
import { ORIG_BASE, DEFAULT_LOCAL_BASE } from "./pages.mjs";

const VP = { width: 1440, height: 900 };
const OUT = path.resolve("design/audit/state-probe");

const HIDE_DEV_STYLE =
  "nextjs-portal, [data-nextjs-toast], [data-nextjs-dialog], [data-nextjs-dev-tools-button] { display: none !important; }";

const ROUTES = {
  orig: { t1: "/15", t2: "/", t5: "/", t6: "/17" },
  local: { t1: "/company", t2: "/", t5: "/", t6: "/company/about" },
};

/* --------------------------------------------------------------- helpers */

async function goto(page, base, route) {
  await page.goto(base + route, { waitUntil: "load", timeout: 60000 });
  await page.waitForTimeout(1800);
  await page.addStyleTag({ content: HIDE_DEV_STYLE }).catch(() => {});
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await page.waitForTimeout(300);
}

async function readProps(page, sel, props) {
  if (!sel) return { error: "no selector" };
  return page.evaluate(
    ({ sel, props }) => {
      const el = document.querySelector(sel);
      if (!el) return { error: "no element " + sel };
      const cs = getComputedStyle(el);
      const o = {};
      for (const k of props) o[k] = cs[k];
      // Tailwind v4 emits color-mix()/oklab() for alpha colors; rasterize any
      // color-ish prop to sRGB so orig rgba() and local oklab() compare fairly.
      const COLOR_KEYS = ["color", "backgroundColor", "borderTopColor", "borderBottomColor", "textDecorationColor", "outlineColor", "fill", "stroke"];
      const cv = document.createElement("canvas");
      cv.width = cv.height = 1;
      const cx = cv.getContext("2d");
      const toRgb = (c) => {
        try {
          cx.clearRect(0, 0, 1, 1);
          cx.fillStyle = "#000";
          cx.fillStyle = c;
          cx.fillRect(0, 0, 1, 1);
          const d = cx.getImageData(0, 0, 1, 1).data;
          return `rgba(${d[0]}, ${d[1]}, ${d[2]}, ${(d[3] / 255).toFixed(3)})`;
        } catch {
          return null;
        }
      };
      for (const k of props) if (COLOR_KEYS.includes(k)) o["_rgb:" + k] = toRgb(cs[k]);
      const r = el.getBoundingClientRect();
      o._tag = el.tagName.toLowerCase();
      o._cls = String(el.className).replace(/\s+/g, " ").trim().slice(0, 150);
      o._text = (el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 40);
      o._rect = { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
      o._matchesHover = el.matches(":hover");
      return o;
    },
    { sel, props },
  );
}

/** before/hover read with a verified mouse-hover over `hoverSel` (reads `propsSel`). */
async function hoverAndRead(page, { hoverSel, propsSel, props }) {
  const before = await readProps(page, propsSel, props);
  if (before.error) return { hoverSel, propsSel, before, after: null, isHover: null, error: before.error };
  try {
    await page.evaluate((s) => {
      const e = document.querySelector(s);
      if (e) e.scrollIntoView({ block: "center" });
    }, hoverSel);
    await page.waitForTimeout(500);
    const box = await page.evaluate((s) => {
      const e = document.querySelector(s);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, hoverSel);
    if (box && box.w > 0 && box.h > 0) {
      const vh = await page.evaluate(() => window.innerHeight);
      const cx = Math.min(Math.max(box.x + box.w / 2, 5), VP.width - 5);
      const cy = Math.min(Math.max(box.y + Math.min(box.h / 2, 120), 5), vh - 5);
      await page.mouse.move(cx, cy);
      await page.waitForTimeout(620);
    }
    const isHover = await page.evaluate((s) => {
      const e = document.querySelector(s);
      return e ? e.matches(":hover") : null;
    }, hoverSel);
    const after = await readProps(page, propsSel, props);
    return { hoverSel, propsSel, before, after, isHover };
  } catch (e) {
    return { hoverSel, propsSel, before, after: null, isHover: null, error: String((e && e.message) || e).split("\n")[0].slice(0, 160) };
  } finally {
    await page.mouse.move(2, 2).catch(() => {});
    await page.waitForTimeout(900);
  }
}

/** normalize a hoverAndRead result into { default, hover, isHover } for report/verdict code */
function pair(m) {
  if (!m) return { default: { error: "no measurement" }, hover: null, isHover: null };
  return {
    default: m.before,
    hover: m.after,
    isHover: m.isHover,
    error: m.error || (m.before && m.before.error) || null,
    rectBefore: m.before && m.before._rect,
    rectAfter: m.after && m.after._rect,
  };
}

/* ------------------------------------------------------- per-target disco */

const T1_PROPS = ["color", "opacity", "fontWeight", "fontSize", "lineHeight", "transitionProperty", "transitionDuration", "transitionTimingFunction", "textDecorationLine"];

async function measureT1(page, side) {
  const disco = await page.evaluate((side) => {
    const vis = (e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    let nav;
    if (side === "orig") {
      nav = document.querySelector(".viewport-nav.desktop._main_menu") || document.querySelector(".viewport-nav:not(.mobile)");
    } else {
      nav = [...document.querySelectorAll("header nav")].filter(vis)[0];
    }
    if (!nav) return { error: "no visible nav" };
    const lis = [...nav.querySelectorAll(":scope > ul > li, :scope > li")].filter(vis);
    const links = lis.map((li) => li.querySelector(":scope > a")).filter(Boolean).filter(vis);
    const path = location.pathname;
    const info = (a) => ({
      text: (a.innerText || "").replace(/\s+/g, " ").trim().slice(0, 20),
      href: a.getAttribute("href"),
      cls: String(a.className).replace(/\s+/g, " ").trim().slice(0, 130),
    });
    let active = links.find(
      (a) => /(^|\s)active(\s|$)/.test(a.className) || /(^|\s)active(\s|$)/.test(String(a.parentElement.className)),
    );
    if (!active && side === "local") {
      const cands = links
        .filter((a) => {
          const h = a.getAttribute("href");
          return h && h !== "/" && path.startsWith(h);
        })
        .sort((a, b) => b.getAttribute("href").length - a.getAttribute("href").length);
      active = cands[0] || null;
    }
    const def = links.find((a) => a !== active && (a.innerText || "").trim());
    if (active) active.id = active.id || "__t1_active";
    if (def) def.id = def.id || "__t1_default";
    return {
      navCls: String(nav.className).slice(0, 150),
      count: links.length,
      activeSel: active ? "#" + active.id : null,
      defaultSel: def ? "#" + def.id : null,
      active: active ? info(active) : null,
      def: def ? info(def) : null,
    };
  }, side);

  const out = { disco };
  if (disco.error) return out;
  if (disco.defaultSel) out.default = pair(await hoverAndRead(page, { hoverSel: disco.defaultSel, propsSel: disco.defaultSel, props: T1_PROPS }));
  if (disco.activeSel) out.active = pair(await hoverAndRead(page, { hoverSel: disco.activeSel, propsSel: disco.activeSel, props: T1_PROPS }));
  return out;
}

async function measureT2(page, side) {
  // home overlay header — same nav discovery as T1, first non-active visible link
  const disco = await page.evaluate((side) => {
    const vis = (e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    let nav;
    if (side === "orig") {
      nav = document.querySelector(".viewport-nav.desktop._main_menu") || document.querySelector(".viewport-nav:not(.mobile)");
    } else {
      nav = [...document.querySelectorAll("header nav")].filter(vis)[0];
    }
    if (!nav) return { error: "no visible nav" };
    const links = [...nav.querySelectorAll(":scope > ul > li > a, :scope > li > a")].filter(vis);
    const a = links.find((x) => (x.innerText || "").trim());
    if (!a) return { error: "no visible nav link" };
    a.id = a.id || "__t2_link";
    const cs = getComputedStyle(a);
    // header background (overlay state on home)
    const header = document.querySelector("header, #doz_header_wrap, #doz_header");
    return {
      sel: "#" + a.id,
      text: (a.innerText || "").trim().slice(0, 20),
      href: a.getAttribute("href"),
      cls: String(a.className).replace(/\s+/g, " ").trim().slice(0, 130),
      defaultColor: cs.color,
      headerCls: header ? String(header.className).slice(0, 150) : null,
      headerBg: header ? getComputedStyle(header).backgroundColor : null,
    };
  }, side);

  const props = ["color", "opacity", "fontWeight", "fontSize", "transitionProperty", "transitionDuration", "transitionTimingFunction"];
  const out = { disco };
  if (disco.sel) out.link = pair(await hoverAndRead(page, { hoverSel: disco.sel, propsSel: disco.sel, props }));
  return out;
}

const T3_PROPS = ["opacity", "visibility", "display", "transitionProperty", "transitionDuration", "transitionTimingFunction", "backgroundColor"];

async function measureT3(page, side) {
  const disco = await page.evaluate((side) => {
    const vis = (e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    let nav;
    if (side === "orig") {
      nav = document.querySelector(".viewport-nav.desktop._main_menu") || document.querySelector(".viewport-nav:not(.mobile)");
    } else {
      nav = [...document.querySelectorAll("header nav")].filter(vis)[0];
    }
    if (!nav) return { error: "no visible nav" };
    let li, menu;
    if (side === "orig") {
      for (const cand of [...nav.querySelectorAll(":scope > li.dropdown, :scope > ul > li.dropdown")]) {
        const a = cand.querySelector(":scope > a");
        const m = cand.querySelector("ul.dropdown-menu");
        if (a && m && (a.innerText || "").trim()) { li = cand; menu = m; break; }
      }
      if (!li) return { error: "no dropdown parent in nav" };
    } else {
      for (const cand of [...nav.querySelectorAll(":scope > ul > li, :scope > li")]) {
        const a = cand.querySelector(":scope > a");
        const m = cand.querySelector(":scope > div[class*='invisible'], :scope > div");
        if (a && m && (a.innerText || "").trim()) { li = cand; menu = m; break; }
      }
      if (!li) return { error: "no dropdown parent in nav" };
    }
    li.id = li.id || "__t3_li";
    menu.id = menu.id || "__t3_menu";
    const a = li.querySelector(":scope > a");
    const mcs = getComputedStyle(menu);
    const trigger = a ? getComputedStyle(a) : null;
    // the visible panel: orig = the ul itself; local = the inner ul.imweb-dropdown (the
    // hover-animated wrapper is transparent). Compare panel bg, not wrapper bg.
    const panel = side === "orig" ? menu : menu.querySelector("ul.imweb-dropdown") || menu.firstElementChild;
    const panelBg = panel ? getComputedStyle(panel).backgroundColor : null;
    return {
      liSel: "#" + li.id,
      menuSel: "#" + menu.id,
      triggerSel: a ? (a.id = a.id || "__t3_trigger", "#" + a.id) : "#" + li.id,
      liCls: String(li.className).replace(/\s+/g, " ").trim().slice(0, 130),
      menuCls: String(menu.className).replace(/\s+/g, " ").trim().slice(0, 150),
      menuTag: menu.tagName.toLowerCase(),
      panelTag: panel ? panel.tagName.toLowerCase() : null,
      panelCls: panel ? String(panel.className).replace(/\s+/g, " ").trim().slice(0, 110) : null,
      panelBg,
      triggerText: a ? (a.innerText || "").replace(/\s+/g, " ").trim().slice(0, 20) : null,
      menuDefault: { opacity: mcs.opacity, visibility: mcs.visibility, display: mcs.display },
      triggerTransition: trigger ? trigger.transitionProperty + " " + trigger.transitionDuration + " " + trigger.transitionTimingFunction : null,
      triggerHoverRule: side === "local" ? /group-hover/.test(String(menu.className)) : /hover|display|show/i.test(String(menu.className)),
    };
  }, side);

  const out = { disco };
  if (disco.menuSel) out.menu = pair(await hoverAndRead(page, { hoverSel: disco.triggerSel, propsSel: disco.menuSel, props: T3_PROPS }));
  if (out.menu && disco.panelBg) {
    // surface the panel background (wrapper is transparent on local) for the bg comparison
    const m = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(disco.panelBg);
    const panelRgb = m ? `rgba(${m[1]}, ${m[2]}, ${m[3]}, 1.000)` : null;
    if (out.menu.default) {
      out.menu.default.backgroundColor = disco.panelBg;
      if (panelRgb) out.menu.default["_rgb:backgroundColor"] = panelRgb;
    }
    if (out.menu.hover) {
      out.menu.hover.backgroundColor = disco.panelBg;
      if (panelRgb) out.menu.hover["_rgb:backgroundColor"] = panelRgb;
    }
  }
  return out;
}

async function measureT4(page, side) {
  const disco = await page.evaluate((side) => {
    const vis = (e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const cands = [...document.querySelectorAll("a, button")].filter(
      (e) => /^(ENGLISH|English|EN|한국어|KOR)$/i.test((e.innerText || "").trim()) && vis(e),
    );
    let lang = cands.find((e) => /en\.ecowavekorea|^\/en\//.test(e.getAttribute("href") || "")) || cands.find((e) => /ENGLISH|English/i.test((e.innerText || "").trim())) || cands[0];
    if (!lang) return { error: "no visible language selector" };
    lang.id = lang.id || "__t4_lang";
    return {
      sel: "#" + lang.id,
      tag: lang.tagName.toLowerCase(),
      text: (lang.innerText || "").trim().slice(0, 20),
      href: lang.getAttribute("href"),
      cls: String(lang.className).replace(/\s+/g, " ").trim().slice(0, 140),
      candidates: cands.map((e) => ({ tag: e.tagName.toLowerCase(), text: (e.innerText || "").trim().slice(0, 16), href: e.getAttribute("href") })),
    };
  }, side);

  const props = ["fontFamily", "fontSize", "lineHeight", "color", "opacity", "transitionProperty", "transitionDuration", "transitionTimingFunction"];
  const out = { disco };
  if (disco.sel) out.link = pair(await hoverAndRead(page, { hoverSel: disco.sel, propsSel: disco.sel, props }));
  return out;
}

async function measureT5(page, side) {
  const disco = await page.evaluate((side) => {
    const vis = (e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    let root = null;
    if (side === "orig") {
      let bestN = 0;
      for (const e of document.querySelectorAll("div, section, footer")) {
        const n = e.querySelectorAll("a").length;
        if (!n) continue;
        if (/rgb\(0, 0, 0\)/.test(getComputedStyle(e).backgroundColor) && n > bestN) { bestN = n; root = e; }
      }
    } else {
      root = document.querySelector("footer");
    }
    if (!root) return { error: "no footer root" };
    const links = [...root.querySelectorAll("a")].filter((a) => vis(a) && (a.innerText || "").trim());
    let link = links.find((a) => (a.innerText || "").trim() === "회사소개") || links[0];
    if (!link) return { error: "no visible footer link" };
    link.id = link.id || "__t5_link";
    const cs = getComputedStyle(link);
    return {
      sel: "#" + link.id,
      rootTag: root.tagName.toLowerCase(),
      rootCls: String(root.className).replace(/\s+/g, " ").trim().slice(0, 120),
      rootBg: getComputedStyle(root).backgroundColor,
      linkCount: links.length,
      text: (link.innerText || "").trim().slice(0, 24),
      href: link.getAttribute("href"),
      cls: String(link.className).replace(/\s+/g, " ").trim().slice(0, 130),
      color: cs.color,
      td: cs.textDecorationLine,
    };
  }, side);

  const props = ["color", "transitionProperty", "transitionDuration", "transitionTimingFunction", "textDecorationLine"];
  const out = { disco };
  if (disco.sel) out.link = pair(await hoverAndRead(page, { hoverSel: disco.sel, propsSel: disco.sel, props }));
  return out;
}

// NB: `display` is intentionally excluded — orig caption is `.text_wrap` (display:table)
// while local uses `<figcaption>` (display:block); element type is not a parity signal.
const T6_PROPS = ["opacity", "visibility", "transitionProperty", "transitionDuration", "transitionTimingFunction"];

async function measureT6(page, side) {
  // sections are laid out lazily (content-visibility): scroll the gallery into view first
  await page.evaluate((side) => {
    const g =
      side === "orig"
        ? document.querySelector(".hover_show_overlay") || document.querySelector(".gallery2")
        : [...document.querySelectorAll(".gallery-grid")].find((x) => x.querySelector("figcaption"));
    if (g) g.scrollIntoView({ block: "center" });
  }, side);
  await page.waitForTimeout(1100);
  const disco = await page.evaluate((side) => {
    const vis = (e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    let item = null;
    let caption = null;
    let galCls = null;
    if (side === "orig") {
      const gal = document.querySelector(".hover_show_overlay") || document.querySelector(".gallery2");
      if (!gal) return { error: "no .hover_show_overlay / .gallery2 gallery" };
      galCls = String(gal.className).replace(/\s+/g, " ").trim().slice(0, 150);
      const items = [...gal.querySelectorAll(".item_gallary")].filter((e) => e.getBoundingClientRect().width > 0);
      item = items.find((e) => e.querySelector(".text_wrap") || e.querySelector(".slide_overlay")) || items[0];
      if (item) caption = item.querySelector(".text_wrap") || item.querySelector(".slide_overlay");
    } else {
      const grids = [...document.querySelectorAll(".gallery-grid")];
      const gal = grids.find((g) => g.querySelector("figcaption")) || grids[grids.length - 1];
      if (!gal) return { error: "no .gallery-grid with figcaption" };
      galCls = String(gal.className).replace(/\s+/g, " ").trim().slice(0, 150);
      item = [...gal.querySelectorAll("figure")].filter(vis)[0];
      if (item) caption = item.querySelector("figcaption");
    }
    if (!item) return { error: "no visible gallery item" };
    item.id = item.id || "__t6_item";
    if (!caption) return { error: "gallery item has no caption element", galCls, itemCls: String(item.className).slice(0, 120) };
    caption.id = caption.id || "__t6_caption";
    return {
      galCls,
      itemSel: "#" + item.id,
      captionSel: "#" + caption.id,
      itemCls: String(item.className).replace(/\s+/g, " ").trim().slice(0, 120),
      captionTag: caption.tagName.toLowerCase(),
      captionCls: String(caption.className).replace(/\s+/g, " ").trim().slice(0, 150),
      captionText: (caption.innerText || "").replace(/\s+/g, " ").trim().slice(0, 40),
    };
  }, side);

  const out = { disco };
  if (disco.itemSel) {
    out.caption = pair(await hoverAndRead(page, { hoverSel: disco.itemSel, propsSel: disco.captionSel, props: T6_PROPS }));
    out.item = pair(await hoverAndRead(page, { hoverSel: disco.itemSel, propsSel: disco.itemSel, props: ["opacity", "visibility", "transform"] }));
  }
  return out;
}

/* ------------------------------------------------------------------ verdict */

function norm(key, v) {
  if (v == null) return v;
  let s = String(v).trim();
  if (key === "transitionProperty") {
    s = s.split(",").map((x) => x.trim()).filter(Boolean).sort().join(", ");
  }
  return s.replace(/\s+/g, " ");
}

/** value used for comparison: prefer the rasterized sRGB '_rgb:<key>' when present */
function val(block, k) {
  if (!block || block.error) return null;
  const rgb = block["_rgb:" + k];
  if (rgb != null) return { rgb };
  return { s: norm(k, block[k]) };
}

function parseRgb(s) {
  const m = /^rgba?\(([^)]+)\)$/.exec(s || "");
  if (!m) return null;
  const p = m[1].split(",").map((x) => parseFloat(x));
  if (p.length < 3 || p.some((n) => Number.isNaN(n))) return null;
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
}

/** semantic comparison with a small sRGB tolerance (rounding from oklab round-tripping) */
function sameVal(a, b) {
  if (a == null || b == null) return a == null && b == null;
  if (a.rgb != null && b.rgb != null) {
    const pa = parseRgb(a.rgb);
    const pb = parseRgb(b.rgb);
    if (pa && pb) {
      return Math.abs(pa.r - pb.r) <= 3 && Math.abs(pa.g - pb.g) <= 3 && Math.abs(pa.b - pb.b) <= 3 && Math.abs(pa.a - pb.a) <= 0.03;
    }
    return a.rgb === b.rgb;
  }
  return a.s === b.s;
}

/** compare orig/local blocks at two states (default+hover) */
function verdictFor(origBlock, localBlock, props) {
  const missingLocal = !localBlock || !localBlock.default || !!localBlock.default.error;
  const missingOrig = !origBlock || !origBlock.default || !!origBlock.default.error;
  if (missingOrig) return { verdict: "N-A", detail: "orig not measurable" };
  if (missingLocal) return { verdict: "NOT-IMPLEMENTED", detail: (localBlock && (localBlock.default?.error || localBlock.error)) || "local not measurable" };
  const rows = [];
  let mismatch = 0;
  for (const k of props) {
    for (const state of ["default", "hover"]) {
      const a = val(origBlock[state], k);
      const b = val(localBlock[state], k);
      const match = sameVal(a, b);
      if (!match) mismatch++;
      rows.push({
        property: k,
        state,
        orig: origBlock[state] && origBlock[state][k],
        local: localBlock[state] && localBlock[state][k],
        match,
      });
    }
  }
  return { verdict: mismatch ? "MISMATCH" : "MATCH", mismatchCount: mismatch, rows };
}

/* --------------------------------------------------------------------- main */

async function runSide(ctx, side) {
  const base = (side === "orig" ? ORIG_BASE : DEFAULT_LOCAL_BASE).replace(/\/$/, "");
  const r = ROUTES[side];
  const page = await ctx.newPage();
  const out = { side, base };
  const t0 = Date.now();
  try {
    await goto(page, base, r.t1);
    out.t1 = await measureT1(page, side);
    out.t3 = await measureT3(page, side);
    out.t4 = await measureT4(page, side);
    await goto(page, base, r.t2);
    out.t2 = await measureT2(page, side);
    out.t5 = await measureT5(page, side);
    await goto(page, base, r.t6);
    out.t6 = await measureT6(page, side);
  } finally {
    out._durationMs = Date.now() - t0;
    await page.close();
  }
  return out;
}

function fmt(v) {
  if (v == null) return "—";
  const s = String(v);
  return s.length > 44 ? s.slice(0, 41) + "..." : s;
}

function buildMd(report) {
  const L = [];
  L.push(`# Header interactive-state parity probe (nav)`);
  L.push("");
  L.push(`- orig base: \`${report.meta.origBase}\``);
  L.push(`- local base: \`${report.meta.localBase}\``);
  L.push(`- viewport: ${VP.width}x${VP.height}, dsf 1, colorScheme light`);
  L.push(`- generated: ${report.meta.generatedAt}`);
  L.push(`- comparison: colors are rasterized to sRGB before diffing (±3/255, ±0.03 alpha) because Tailwind v4 serializes alpha colors as \`oklab()\`/\`color-mix()\` while imweb emits \`rgba()\`; \`transitionProperty\` lists are order-insensitive.`);
  L.push("");
  L.push(`## Summary`);
  L.push("");
  L.push(`| target | verdict | note |`);
  L.push(`| --- | --- | --- |`);
  for (const t of report.targets) L.push(`| ${t.id} — ${t.title} | **${t.verdict}** | ${t.note || ""} |`);
  L.push("");

  const table = (label, props, orig, local) => {
    L.push(`#### ${label}`);
    L.push("");
    L.push(`| property | orig default | orig hover | local default | local hover | verdict |`);
    L.push(`| --- | --- | --- | --- | --- | --- |`);
    for (const k of props) {
      const od = orig && orig.default ? fmt(orig.default[k]) : "—";
      const oh = orig && orig.hover ? fmt(orig.hover[k]) : "—";
      const ld = local && local.default ? fmt(local.default[k]) : "—";
      const lh = local && local.hover ? fmt(local.hover[k]) : "—";
      const v =
        sameVal(val(orig?.default, k), val(local?.default, k)) && sameVal(val(orig?.hover, k), val(local?.hover, k))
          ? "MATCH"
          : "MISMATCH";
      L.push(`| ${k} | ${od} | ${oh} | ${ld} | ${lh} | ${v} |`);
    }
    L.push("");
  };

  const o = report.sides.orig;
  const lo = report.sides.local;

  // T1
  const t1 = report.targets.find((x) => x.id === "T1");
  L.push(`## T1 — Subpage header nav link (default / hover / active)`);
  L.push("");
  L.push(`- orig route: \`${report.routes.orig.t1}\` — nav \`${o.t1?.disco?.navCls || "?"}\``);
  L.push(`- local route: \`${report.routes.local.t1}\` — nav \`${lo.t1?.disco?.navCls || "?"}\``);
  L.push(`- orig active: \`${JSON.stringify(o.t1?.disco?.active)}\``);
  L.push(`- local active: \`${JSON.stringify(lo.t1?.disco?.active)}\``);
  L.push("");
  table("Non-active nav link", T1_PROPS, o.t1?.default, lo.t1?.default);
  table("Active (current page) nav link", T1_PROPS, o.t1?.active, lo.t1?.active);
  L.push(`**Verdict: ${t1.verdict}** ${t1.note || ""}`);
  L.push(`- isHover verified: orig=${o.t1?.default?.isHover} / local=${lo.t1?.default?.isHover}`);
  L.push("");

  // T2
  const t2 = report.targets.find((x) => x.id === "T2");
  L.push(`## T2 — Home overlay header nav link`);
  L.push("");
  L.push(`- orig route: \`${report.routes.orig.t2}\` (header bg \`${o.t2?.disco?.headerBg || "?"}\`, cls \`${o.t2?.disco?.headerCls || "?"}\`)`);
  L.push(`- local route: \`${report.routes.local.t2}\` (header bg \`${lo.t2?.disco?.headerBg || "?"}\`, cls \`${lo.t2?.disco?.headerCls || "?"}\`)`);
  L.push("");
  table("Home nav link", ["color", "opacity", "fontWeight", "fontSize", "transitionProperty", "transitionDuration", "transitionTimingFunction"], o.t2?.link, lo.t2?.link);
  L.push(`**Verdict: ${t2.verdict}** ${t2.note || ""}`);
  L.push(`- isHover verified: orig=${o.t2?.link?.isHover} / local=${lo.t2?.link?.isHover}`);
  L.push("");

  // T3
  const t3 = report.targets.find((x) => x.id === "T3");
  L.push(`## T3 — Nav dropdown / submenu open state`);
  L.push("");
  L.push(`- orig trigger: \`${o.t3?.disco?.triggerText || "?"}\` | menu \`<${o.t3?.disco?.menuTag}> ${o.t3?.disco?.menuCls || "?"}\``);
  L.push(`- local trigger: \`${lo.t3?.disco?.triggerText || "?"}\` | menu \`<${lo.t3?.disco?.menuTag}> ${lo.t3?.disco?.menuCls || "?"}\``);
  L.push("");
  table("Submenu box", T3_PROPS, o.t3?.menu, lo.t3?.menu);
  L.push(`**Verdict: ${t3.verdict}** ${t3.note || ""}`);
  L.push(`- isHover verified: orig=${o.t3?.menu?.isHover} / local=${lo.t3?.menu?.isHover}`);
  L.push("");

  // T4
  const t4 = report.targets.find((x) => x.id === "T4");
  L.push(`## T4 — Language selector`);
  L.push("");
  L.push(`- orig: \`<${o.t4?.disco?.tag}> ${o.t4?.disco?.text}\` -> ${o.t4?.disco?.href}`);
  L.push(`- local: \`<${lo.t4?.disco?.tag}> ${lo.t4?.disco?.text}\` -> ${lo.t4?.disco?.href}`);
  L.push("");
  table("Language selector", ["fontFamily", "fontSize", "lineHeight", "color", "opacity", "transitionProperty", "transitionDuration", "transitionTimingFunction"], o.t4?.link, lo.t4?.link);
  L.push(`**Verdict: ${t4.verdict}** ${t4.note || ""}`);
  L.push(`- isHover verified: orig=${o.t4?.link?.isHover} / local=${lo.t4?.link?.isHover}`);
  L.push("");

  // T5
  const t5 = report.targets.find((x) => x.id === "T5");
  L.push(`## T5 — Footer sitemap link`);
  L.push("");
  L.push(`- orig root: \`<${o.t5?.disco?.rootTag}> ${o.t5?.disco?.rootCls}\` bg=${o.t5?.disco?.rootBg} link="${o.t5?.disco?.text}"`);
  L.push(`- local root: \`<${lo.t5?.disco?.rootTag}> ${lo.t5?.disco?.rootCls}\` bg=${lo.t5?.disco?.rootBg} link="${lo.t5?.disco?.text}"`);
  L.push("");
  table("Footer sitemap link", ["color", "transitionProperty", "transitionDuration", "transitionTimingFunction", "textDecorationLine"], o.t5?.link, lo.t5?.link);
  L.push(`**Verdict: ${t5.verdict}** ${t5.note || ""}`);
  L.push(`- isHover verified: orig=${o.t5?.link?.isHover} / local=${lo.t5?.link?.isHover}`);
  L.push("");

  // T6
  const t6 = report.targets.find((x) => x.id === "T6");
  L.push(`## T6 — Gallery caption hover-fade`);
  L.push("");
  L.push(`- orig gallery: \`${o.t6?.disco?.galCls || o.t6?.disco?.error}\` item \`${o.t6?.disco?.itemCls || "?"}\` caption \`<${o.t6?.disco?.captionTag}> ${o.t6?.disco?.captionCls || "?"}\``);
  L.push(`- local gallery: \`${lo.t6?.disco?.galCls || lo.t6?.disco?.error}\` item \`${lo.t6?.disco?.itemCls || "?"}\` caption \`<${lo.t6?.disco?.captionTag}> ${lo.t6?.disco?.captionCls || "?"}\``);
  L.push("");
  table("Caption", T6_PROPS, o.t6?.caption, lo.t6?.caption);
  L.push(`**Verdict: ${t6.verdict}** ${t6.note || ""}`);
  L.push(`- isHover verified: orig=${o.t6?.caption?.isHover} / local=${lo.t6?.caption?.isHover}`);
  L.push(`- local caption kind: ${lo.t6?.disco?.captionCls ? (/opacity-0/.test(lo.t6.disco.captionCls) ? "hover-only overlay (opacity 0 default)" : "check default opacity") : "none"}`);
  L.push("");

  return L.join("\n");
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 1, colorScheme: "light" });
  const t0 = Date.now();
  const orig = await runSide(ctx, "orig");
  console.log(`[orig] done in ${(orig._durationMs / 1000).toFixed(1)}s`);
  const local = await runSide(ctx, "local");
  console.log(`[local] done in ${(local._durationMs / 1000).toFixed(1)}s`);
  await ctx.close();
  await browser.close();

  const sides = { orig, local };

  const targets = [
    {
      id: "T1",
      title: "Subpage header nav link (default/hover/active)",
      ...(() => {
        const v = verdictFor(orig.t1?.default, local.t1?.default, T1_PROPS);
        const va = verdictFor(orig.t1?.active, local.t1?.active, T1_PROPS);
        const bad = [];
        for (const row of v.rows || []) if (!row.match) bad.push(`default/${row.property} ${row.orig} vs ${row.local}`);
        for (const row of va.rows || []) if (!row.match) bad.push(`active/${row.property} ${row.orig} vs ${row.local}`);
        const parts = [v.verdict, va.verdict];
        const verdict = parts.includes("MISMATCH")
          ? "MISMATCH"
          : parts.includes("NOT-IMPLEMENTED")
            ? "NOT-IMPLEMENTED"
            : parts.every((x) => x === "N-A")
              ? "N-A"
              : "MATCH";
        return { verdict, note: bad.slice(0, 6).join("; "), sub: { def: v, active: va } };
      })(),
    },
    {
      id: "T2",
      title: "Home overlay header nav link",
      ...(() => {
        const v = verdictFor(orig.t2?.link, local.t2?.link, ["color", "opacity", "fontWeight", "fontSize", "transitionProperty", "transitionDuration", "transitionTimingFunction"]);
        const bad = (v.rows || []).filter((r) => !r.match).map((r) => `${r.state}/${r.property} ${r.orig} vs ${r.local}`);
        return { verdict: v.verdict, note: bad.slice(0, 6).join("; ") };
      })(),
    },
    {
      id: "T3",
      title: "Nav dropdown / submenu open state",
      ...(() => {
        const v = verdictFor(orig.t3?.menu, local.t3?.menu, T3_PROPS);
        const bad = (v.rows || []).filter((r) => !r.match).map((r) => `${r.state}/${r.property} ${r.orig} vs ${r.local}`);
        return { verdict: v.verdict, note: bad.slice(0, 6).join("; ") };
      })(),
    },
    {
      id: "T4",
      title: "Language selector",
      ...(() => {
        const v = verdictFor(orig.t4?.link, local.t4?.link, ["fontFamily", "fontSize", "lineHeight", "color", "opacity", "transitionProperty", "transitionDuration", "transitionTimingFunction"]);
        const bad = (v.rows || []).filter((r) => !r.match).map((r) => `${r.state}/${r.property} ${r.orig} vs ${r.local}`);
        return { verdict: v.verdict, note: bad.slice(0, 6).join("; ") };
      })(),
    },
    {
      id: "T5",
      title: "Footer sitemap link",
      ...(() => {
        const v = verdictFor(orig.t5?.link, local.t5?.link, ["color", "transitionProperty", "transitionDuration", "transitionTimingFunction", "textDecorationLine"]);
        const bad = (v.rows || []).filter((r) => !r.match).map((r) => `${r.state}/${r.property} ${r.orig} vs ${r.local}`);
        return { verdict: v.verdict, note: bad.slice(0, 6).join("; ") };
      })(),
    },
    {
      id: "T6",
      title: "Gallery caption hover-fade",
      ...(() => {
        const v = verdictFor(orig.t6?.caption, local.t6?.caption, T6_PROPS);
        const bad = (v.rows || []).filter((r) => !r.match).map((r) => `${r.state}/${r.property} ${r.orig} vs ${r.local}`);
        return { verdict: v.verdict, note: bad.slice(0, 6).join("; ") };
      })(),
    },
  ];

  const report = {
    meta: {
      generatedAt: new Date().toISOString(),
      origBase: ORIG_BASE,
      localBase: DEFAULT_LOCAL_BASE,
      viewport: VP,
      totalMs: Date.now() - t0,
    },
    routes: ROUTES,
    targets,
    sides,
  };

  await fs.writeFile(path.join(OUT, "nav-report.json"), JSON.stringify(report, null, 2));
  await fs.writeFile(path.join(OUT, "nav-report.md"), buildMd(report));

  console.log(`\n================ STATE-PROBE-NAV SUMMARY ================`);
  for (const t of targets) console.log(`${t.id} ${t.verdict.padEnd(16)} ${t.title}`);
  console.log(`\nwrote ${path.relative(process.cwd(), path.join(OUT, "nav-report.md"))}`);
  console.log(`wrote ${path.relative(process.cwd(), path.join(OUT, "nav-report.json"))}`);
  console.log(`total ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((e) => {
  console.error(String((e && e.message) || e).split("\n")[0]);
  process.exit(1);
});
