/**
 * Content-level interactive-state parity probe (default / hover / active).
 *
 * This is a TARGETED probe that exists because the generic `hover-probe.mjs`
 * cannot match the local DOM: it hardcodes imweb-anchored selectors
 * (`.type_grid .card`, `.btn-default`, …) which do not exist in the rebuilt
 * Next.js app. Here every element is discovered LIVE per side (orig vs local)
 * and tagged with a `data-probe` attribute before measurement.
 *
 * For each target it records computed styles in the default state and after a
 * VERIFIED hover (`el.matches(':hover')` is checked before the "after" read),
 * then moves the mouse away and settles. Active states (filter pills, category
 * tabs, pagination) are read without hover; their inactive siblings are hovered.
 *
 * Output:
 *   design/audit/state-probe/content-report.md
 *   design/audit/state-probe/content-report.json
 *
 * Browser setup mirrors hover-probe.mjs: chromium headless, 1440x900,
 * deviceScaleFactor 1, colorScheme light.
 *
 * Usage:
 *   node scripts/audit/state-probe-content.mjs [--only=T1,T4] [--orig=URL] [--local=URL]
 */
import { chromium } from "playwright-core";
import fs from "node:fs/promises";
import path from "node:path";
import { ORIG_BASE, DEFAULT_LOCAL_BASE } from "./pages.mjs";

const args = process.argv.slice(2);
const getArg = (name, dflt) => {
  const a = args.find((x) => x.startsWith("--" + name + "="));
  return a ? a.split("=").slice(1).join("=") : dflt;
};
const ONLY = getArg("only", "")
  .split(",")
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);
const ORIG = getArg("orig", ORIG_BASE).replace(/\/$/, "");
const LOCAL = getArg("local", DEFAULT_LOCAL_BASE).replace(/\/$/, "");
const OUT = path.resolve("design/audit/state-probe");
const VP = { width: 1440, height: 900 };

const HIDE_DEV_STYLE =
  "nextjs-portal, [data-nextjs-toast], [data-nextjs-dialog], [data-nextjs-dev-tools-button] { display: none !important; }";

/* --------------------------------------------------------------- props */

const TITLE_PROPS = [
  "color", "textDecorationLine", "textDecorationColor", "transitionProperty",
  "transitionDuration", "transitionTimingFunction", "fontWeight", "fontSize", "opacity",
];
const CARD_PROPS = [
  "backgroundColor", "textDecorationLine", "borderTopWidth", "borderTopStyle",
  "borderTopColor", "borderRadius", "transitionProperty", "transitionDuration",
  "transitionTimingFunction", "opacity",
];
const THUMB_PROPS = [
  "transform", "scale", "opacity", "filter", "transitionProperty", "transitionDuration",
  "transitionTimingFunction",
];
const BTN_PROPS = [
  "color", "backgroundColor", "borderTopWidth", "borderTopStyle", "borderTopColor",
  "borderRadius", "transitionProperty", "transitionDuration", "transitionTimingFunction",
  "fontSize",
];
const PILL_PROPS = [
  "backgroundColor", "color", "borderTopWidth", "borderTopStyle", "borderTopColor",
  "borderRadius", "fontSize", "fontWeight", "transitionProperty", "transitionDuration",
  "transitionTimingFunction",
];
const PAGE_PROPS = [
  "color", "backgroundColor", "borderTopWidth", "borderTopStyle", "borderTopColor",
  "borderRadius", "fontWeight", "fontSize", "transitionProperty", "transitionDuration",
  "transitionTimingFunction",
];

/* --------------------------------------------------------------- helpers */

async function goto(page, base, route) {
  await page.goto(base + route, { waitUntil: "load", timeout: 45000 });
  await page.waitForTimeout(1600);
  await page.addStyleTag({ content: HIDE_DEV_STYLE }).catch(() => {});
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
}

/** computed props of the first element matching `sel`, plus effective background */
async function readProps(page, sel, props) {
  return page.evaluate(
    ({ sel, props }) => {
      const e = document.querySelector(sel);
      if (!e) return { error: "missing " + sel };
      const cs = getComputedStyle(e);
      const o = {};
      for (const p of props) o[p] = cs[p];
      const isTransparent = (c) => !c || c === "transparent" || /rgba\(0,\s*0,\s*0,\s*0\)/.test(c);
      let eff = "rgba(0, 0, 0, 0)";
      for (let n = e; n; n = n.parentElement) {
        const c = getComputedStyle(n).backgroundColor;
        if (!isTransparent(c)) { eff = c; break; }
      }
      const r = e.getBoundingClientRect();
      o._tag = e.tagName.toLowerCase();
      o._cls = (typeof e.className === "string" ? e.className : "").replace(/\s+/g, " ").trim().slice(0, 140);
      o._text = (e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40);
      o._hover = e.matches(":hover");
      o._effBg = eff;
      o._rect = [+r.x.toFixed(0), +r.y.toFixed(0), +r.width.toFixed(0), +r.height.toFixed(0)];
      return o;
    },
    { sel, props },
  );
}

async function readGroup(page, readings) {
  const out = {};
  for (const r of readings) out[r.label] = await readProps(page, r.sel, r.props);
  return out;
}

/**
 * Default reading then a verified hover on `hoverSel`, re-reading every reading.
 * Returns { hovered, before:{label->props}, after:{label->props}|null }.
 */
async function measureHover(page, hoverSel, readings, { waitBefore = 520, waitHover = 620 } = {}) {
  const before = await readGroup(page, readings);
  let after = null;
  let hovered = null;
  try {
    await page.evaluate((s) => {
      const e = document.querySelector(s);
      if (e) e.scrollIntoView({ block: "center" });
    }, hoverSel);
    await page.waitForTimeout(waitBefore);
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
      await page.waitForTimeout(waitHover);
    } else {
      await page.hover(hoverSel, { force: true, timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(waitHover);
    }
    hovered = await page.evaluate((s) => {
      const e = document.querySelector(s);
      return e ? e.matches(":hover") : null;
    }, hoverSel);
    after = await readGroup(page, readings);
  } catch (e) {
    after = { _error: String((e && e.message) || e).split("\n")[0].slice(0, 160) };
  }
  await page.mouse.move(2, 2).catch(() => {});
  await page.waitForTimeout(320);
  return { hovered, before, after };
}

/** no hover — active state / static read */
async function measureStatic(page, readings) {
  const before = await readGroup(page, readings);
  return { hovered: null, before, after: null };
}

/* --------------------------------------------------------- discovery */

/** tag the first visible board/product card + its title + thumb */
async function discoCard(page, cfg) {
  return page.evaluate((cfg) => {
    const vis = (e) => {
      if (!e || e.offsetParent === null) return false;
      const r = e.getBoundingClientRect();
      return r.width > 40 && r.height > 10;
    };
    const cardSels = Array.isArray(cfg.card) ? cfg.card : [cfg.card];
    let card = null;
    for (const s of cardSels) {
      card = [...document.querySelectorAll(s)].find(vis) || null;
      if (card) break;
    }
    let title = null;
    let thumb = null;
    if (card) {
      title = cfg.title ? card.querySelector(cfg.title) : card;
      thumb = cfg.thumb ? card.querySelector(cfg.thumb) : null;
      card.setAttribute("data-probe", "card");
      if (title) title.setAttribute("data-probe", "title");
      if (thumb) thumb.setAttribute("data-probe", "thumb");
    }
    const info = (e) =>
      e
        ? {
            tag: e.tagName.toLowerCase(),
            cls: (typeof e.className === "string" ? e.className : "").replace(/\s+/g, " ").trim().slice(0, 130),
            text: (e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40),
          }
        : null;
    return { found: !!card, card: info(card), title: info(title), thumb: info(thumb) };
  }, cfg);
}

/** button widget: first visible `[data-widget-type=button] a` */
async function discoButton(page) {
  return page.evaluate(() => {
    const b = [...document.querySelectorAll("[data-widget-type='button'] a")].find(
      (e) => e.offsetParent !== null && e.getBoundingClientRect().width > 10,
    );
    if (b) b.setAttribute("data-probe", "btn");
    return {
      found: !!b,
      cls: b ? String(b.className).replace(/\s+/g, " ").trim().slice(0, 150) : null,
      text: b ? b.textContent.trim().slice(0, 20) : null,
    };
  });
}

/** facilities filter pills: active + inactive */
async function discoPills(page, side) {
  return page.evaluate((side) => {
    if (side === "orig") {
      const root = [...document.querySelectorAll(".tab-menu")].find(
        (e) => e.offsetParent !== null && /생산설비|검사설비/.test(e.textContent || ""),
      );
      const active = root && root.querySelector(".tab.active");
      const inactive = root && [...root.querySelectorAll(".tab")].find((e) => !e.classList.contains("active"));
      if (active) active.setAttribute("data-probe", "pill-active");
      if (inactive) inactive.setAttribute("data-probe", "pill-inactive");
      return {
        found: !!root,
        rootCls: root ? root.className : null,
        active: active ? { cls: active.className, text: active.textContent.trim() } : null,
        inactive: inactive ? { cls: inactive.className, text: inactive.textContent.trim() } : null,
      };
    }
    const btns = [...document.querySelectorAll("button[aria-pressed]")].filter((e) => e.offsetParent !== null);
    const active = btns.find((e) => e.getAttribute("aria-pressed") === "true");
    const inactive = btns.find((e) => e.getAttribute("aria-pressed") === "false");
    if (active) active.setAttribute("data-probe", "pill-active");
    if (inactive) inactive.setAttribute("data-probe", "pill-inactive");
    return {
      found: btns.length > 0,
      count: btns.length,
      active: active ? { cls: active.className, text: active.textContent.trim() } : null,
      inactive: inactive ? { cls: inactive.className, text: inactive.textContent.trim() } : null,
    };
  }, side);
}

/** product category tabs: active + inactive */
async function discoTabs(page, side) {
  return page.evaluate((side) => {
    const catText = /^(전체|필터|서비스 점검|살균모듈|샤워기|정수기|all)$/;
    if (side === "orig") {
      const nav = [...document.querySelectorAll(".nav.sub-menu")].find(
        (e) => e.offsetParent !== null && /전체/.test(e.textContent || "") && /필터/.test(e.textContent || ""),
      );
      const active = nav && nav.querySelector("a.active");
      const inactive = nav && [...nav.querySelectorAll("a")].find((e) => !e.classList.contains("active"));
      if (active) active.setAttribute("data-probe", "tab-active");
      if (inactive) inactive.setAttribute("data-probe", "tab-inactive");
      return {
        found: !!nav,
        rootCls: nav ? nav.className : null,
        active: active ? { cls: active.className, text: active.textContent.trim() } : null,
        inactive: inactive ? { cls: inactive.className, text: inactive.textContent.trim() } : null,
      };
    }
    const cands = [...document.querySelectorAll("a,button")].filter(
      (e) => e.offsetParent !== null && catText.test((e.textContent || "").trim()),
    );
    const rows = [...new Set(cands.map((e) => e.parentElement))].filter((r) => r && r.children.length >= 2);
    const row = rows[0] || null;
    const kids = row ? [...row.querySelectorAll("a,button")] : [];
    const active = kids.find((e) => e.getAttribute("aria-current") === "page") || kids.find((e) => (e.textContent || "").trim() === "전체");
    const inactive = kids.find((e) => e !== active);
    if (active) active.setAttribute("data-probe", "tab-active");
    if (inactive) inactive.setAttribute("data-probe", "tab-inactive");
    return {
      found: !!row,
      rootCls: row ? String(row.className).slice(0, 130) : null,
      active: active ? { cls: String(active.className).slice(0, 130), text: active.textContent.trim() } : null,
      inactive: inactive ? { cls: String(inactive.className).slice(0, 130), text: inactive.textContent.trim() } : null,
    };
  }, side);
}

/** pagination: active page number + inactive page number */
async function discoPagination(page, side) {
  return page.evaluate((side) => {
    if (side === "orig") {
      const nums = [...document.querySelectorAll("a")].filter((e) => {
        if (e.offsetParent === null) return false;
        if (!/^[0-9]+$/.test((e.textContent || "").trim())) return false;
        const r = e.getBoundingClientRect();
        const br = parseFloat(getComputedStyle(e).borderRadius);
        return r.width > 0 && r.width < 40 && br > 0;
      });
      const active = nums.find((e) => parseInt(getComputedStyle(e).fontWeight, 10) >= 600);
      const inactive = nums.find((e) => e !== active);
      if (active) active.setAttribute("data-probe", "page-active");
      if (inactive) inactive.setAttribute("data-probe", "page-inactive");
      return {
        found: nums.length >= 2,
        count: nums.length,
        active: active ? { text: active.textContent.trim(), cls: active.className } : null,
        inactive: inactive ? { text: inactive.textContent.trim(), cls: inactive.className } : null,
      };
    }
    const nav = document.querySelector('nav[aria-label="페이지네이션"]');
    const active = nav && nav.querySelector('[aria-current="page"]');
    const inactive = nav && [...nav.querySelectorAll("a")].find((e) => /^[0-9]+$/.test((e.textContent || "").trim()));
    if (active) active.setAttribute("data-probe", "page-active");
    if (inactive) inactive.setAttribute("data-probe", "page-inactive");
    return {
      found: !!nav,
      rootCls: nav ? nav.className : null,
      active: active ? { tag: active.tagName.toLowerCase(), text: active.textContent.trim() } : null,
      inactive: inactive ? { text: inactive.textContent.trim(), cls: inactive.className } : null,
    };
  }, side);
}

/* ------------------------------------------------------------- side run */

const CFG = {
  orig: {
    news: { route: "/29", card: [".type_grid .card", "a.post_link_wrap"], title: ".title.title-block", thumb: ".card-head" },
    notices: { route: "/27", card: "a.list_text_title", title: null, thumb: null },
    product: { route: "/37", card: [".type_grid .card", "a.post_link_wrap"], title: ".title.title-block", thumb: ".card-head" },
    button: { route: "/" },
    pills: { route: "/24" },
    tabs: { route: "/37" },
    pagination: { route: "/32" },
  },
  local: {
    news: { route: "/news", card: ['a[href^="/news/"]'], title: "h3", thumb: "div" },
    notices: { route: "/notices", card: ['a[href^="/notices/"]'], title: "h3", thumb: null },
    product: { route: "/products/eco-wave", card: ['a[href^="/products/eco-wave/"]'], title: "h3", thumb: "div" },
    button: { route: "/" },
    pills: { route: "/rnd/facilities" },
    tabs: { route: "/products/eco-wave" },
    pagination: { route: "/products" },
  },
};

async function runCard(page, side, cfg) {
  await goto(page, side === "orig" ? ORIG : LOCAL, cfg.route);
  const d = await discoCard(page, cfg);
  if (!d.found) return { implemented: false, route: cfg.route, discovery: d, reason: "no card matched " + JSON.stringify(cfg.card) };
  const readings = [
    { label: "card", sel: '[data-probe="card"]', props: CARD_PROPS },
    { label: "title", sel: '[data-probe="title"]', props: TITLE_PROPS },
  ];
  if (d.thumb) readings.push({ label: "thumb", sel: '[data-probe="thumb"]', props: THUMB_PROPS });
  const m = await measureHover(page, '[data-probe="card"]', readings);
  return { implemented: true, route: cfg.route, discovery: d, ...m };
}

async function runSide(page, side) {
  const base = side === "orig" ? ORIG : LOCAL;
  const c = CFG[side];
  const out = {};

  // T1 (news card + title) + T4 board thumb
  out.T1 = await runCard(page, side, c.news);
  out.T4_board = out.T1.implemented
    ? { implemented: !!out.T1.discovery.thumb, route: c.news.route, discovery: out.T1.discovery.thumb, hovered: out.T1.hovered, before: out.T1.before, after: out.T1.after }
    : { implemented: false, route: c.news.route, reason: out.T1.reason };

  // T2 notices line row
  out.T2 = await runCard(page, side, c.notices);

  // T3 product card + T4 product thumb
  out.T3 = await runCard(page, side, c.product);
  out.T4_product = out.T3.implemented
    ? { implemented: !!out.T3.discovery.thumb, route: c.product.route, discovery: out.T3.discovery.thumb, hovered: out.T3.hovered, before: out.T3.before, after: out.T3.after }
    : { implemented: false, route: c.product.route, reason: out.T3.reason };

  // T5 button widget
  await goto(page, base, c.button.route);
  const db = await discoButton(page);
  out.T5 = db.found
    ? { implemented: true, route: c.button.route, discovery: db, ...(await measureHover(page, '[data-probe="btn"]', [{ label: "button", sel: '[data-probe="btn"]', props: BTN_PROPS }])) }
    : { implemented: false, route: c.button.route, discovery: db, reason: "no [data-widget-type=button] a" };

  // T6 facilities pills
  await goto(page, base, c.pills.route);
  const dp = await discoPills(page, side);
  if (!dp.found || !dp.active || !dp.inactive) {
    out.T6 = { implemented: false, route: c.pills.route, discovery: dp, reason: "pill active/inactive not both found" };
  } else {
    const stat = await measureStatic(page, [{ label: "pill active", sel: '[data-probe="pill-active"]', props: PILL_PROPS }]);
    // re-scroll to pills before hovering inactive (static read may be off-screen)
    const hov = await measureHover(page, '[data-probe="pill-inactive"]', [
      { label: "pill active", sel: '[data-probe="pill-active"]', props: PILL_PROPS },
      { label: "pill inactive", sel: '[data-probe="pill-inactive"]', props: PILL_PROPS },
    ]);
    out.T6 = { implemented: true, route: c.pills.route, discovery: dp, activeStatic: stat.before["pill active"], hover: hov };
  }

  // T7 product category tabs
  await goto(page, base, c.tabs.route);
  const dt = await discoTabs(page, side);
  if (!dt.found || !dt.active || !dt.inactive) {
    out.T7 = { implemented: false, route: c.tabs.route, discovery: dt, reason: "tab active/inactive not both found" };
  } else {
    const stat = await measureStatic(page, [{ label: "tab active", sel: '[data-probe="tab-active"]', props: PILL_PROPS }]);
    const hov = await measureHover(page, '[data-probe="tab-inactive"]', [
      { label: "tab active", sel: '[data-probe="tab-active"]', props: PILL_PROPS },
      { label: "tab inactive", sel: '[data-probe="tab-inactive"]', props: PILL_PROPS },
    ]);
    out.T7 = { implemented: true, route: c.tabs.route, discovery: dt, activeStatic: stat.before["tab active"], hover: hov };
  }

  // T8 pagination
  await goto(page, base, c.pagination.route);
  const dpg = await discoPagination(page, side);
  if (!dpg.found || !dpg.active || !dpg.inactive) {
    out.T8 = { implemented: false, route: c.pagination.route, discovery: dpg, reason: "pagination active/inactive not both found" };
  } else {
    const stat = await measureStatic(page, [{ label: "page active", sel: '[data-probe="page-active"]', props: PAGE_PROPS }]);
    const hov = await measureHover(page, '[data-probe="page-inactive"]', [
      { label: "page active", sel: '[data-probe="page-active"]', props: PAGE_PROPS },
      { label: "page inactive", sel: '[data-probe="page-inactive"]', props: PAGE_PROPS },
    ]);
    out.T8 = { implemented: true, route: c.pagination.route, discovery: dpg, activeStatic: stat.before["page active"], hover: hov };
  }

  return out;
}

/* --------------------------------------------------------- comparison */

const isTransparent = (v) => {
  const s = String(v);
  if (!s || s === "transparent") return true;
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) return false;
  const parts = m[1].split(",").map((x) => x.trim());
  return parts.length === 4 ? parseFloat(parts[3]) === 0 : false;
};
const isRound = (v) => {
  const s = String(v);
  // 37-51px tall pills: 50px, 9999px and rounded-full all render fully round
  return s === "50%" || s === "9999px" || /e\+0?7/.test(s) || parseFloat(s) >= 18;
};

function classify(prop, oD, oH, lD, lH) {
  // compare one state-pair (default or hover)
  const pair = (a, aEff, b, bEff) => {
    if (a === undefined || b === undefined) return "na";
    if (a === b) return "match";
    if (prop === "borderRadius" && isRound(a) && isRound(b)) return "minor";
    if (prop === "transitionProperty") return "minor";
    if (prop === "borderTopStyle") return "minor"; // style is invisible at width 0
    if (prop === "borderTopWidth" && (a === "0px" || b === "0px")) return "minor";
    // transparent-vs-solid only matters if the rendered background differs
    if (prop === "backgroundColor" && isTransparent(a) && isTransparent(b)) return "minor";
    if (prop === "backgroundColor" && isTransparent(a) !== isTransparent(b)) {
      return aEff && bEff && aEff === bEff ? "minor" : "mismatch";
    }
    if (prop === "borderTopColor" && (isTransparent(a) || isTransparent(b))) return "minor";
    return "mismatch";
  };
  const ds = oD && lD ? pair(oD.v, oD.eff, lD.v, lD.eff) : oD === undefined && lD === undefined ? "na" : pair(oD ? oD.v : undefined, null, lD ? lD.v : undefined, null);
  let hs = "na";
  if ((oH && oH.v !== undefined) || (lH && lH.v !== undefined)) {
    hs = pair(oH ? oH.v : undefined, oH ? oH.eff : null, lH ? lH.v : undefined, lH ? lH.eff : null);
  }
  if (ds === "mismatch" || hs === "mismatch") return "mismatch";
  if (ds === "minor" || hs === "minor") return "minor";
  if (ds === "match" || hs === "match") return "match";
  return "na";
}

function targetVerdict(rows) {
  if (rows.some((r) => r.status === "mismatch")) return "MISMATCH";
  return "MATCH";
}

/* ------------------------------------------------------------- report */

const DEF = {
  T1: { name: "Board card title (news)", origRoute: "/29", localRoute: "/news", note: "news card + title, hover the card" },
  T2: { name: "Line-row board title (notices)", origRoute: "/27", localRoute: "/notices", note: "line-row title, hover the row title" },
  T3: { name: "Product card title", origRoute: "/37", localRoute: "/products/eco-wave", note: "product card + title, hover the card" },
  T4: { name: "Card thumb/image hover", origRoute: "/29 + /37", localRoute: "/news + /products/eco-wave", note: "image container transform/opacity/filter, hover the card" },
  T5: { name: "Button widget (+ plus-circle)", origRoute: "/", localRoute: "/", note: "first [data-widget-type=button] a" },
  T6: { name: "Facilities filter pills", origRoute: "/24", localRoute: "/rnd/facilities", note: "active read static; inactive hovered" },
  T7: { name: "Product category tabs", origRoute: "/37", localRoute: "/products/eco-wave", note: "active read static; inactive hovered" },
  T8: { name: "Pagination", origRoute: "/32", localRoute: "/products", note: "active read static; inactive page number hovered" },
};

/* --------------------------------------------- readings from side data */

/**
 * Normalise a side's raw run output into `{label: {before, after}}` maps used
 * by buildRowsFromSide. For pill/tab/page targets the "active" state is a
 * static read (before only) and the inactive state carries the hover.
 */
function normalizedReadings(orig, local) {
  const r = { orig: {}, local: {} };
  const set = (side, id, label, before, after) => {
    r[side][id] = r[side][id] || {};
    r[side][id][label] = { before, after };
  };
  for (const side of ["orig", "local"]) {
    const s = side === "orig" ? orig : local;
    // T1..T5 direct
    for (const [id, key] of [["T1", "T1"], ["T2", "T2"], ["T3", "T3"], ["T5", "T5"]]) {
      const blk = s[key];
      if (!blk || !blk.implemented) { set(side, id, "X", null, null); continue; }
      const labels = blk.before ? Object.keys(blk.before) : [];
      for (const lab of labels) set(side, id, lab, blk.before[lab], blk.after ? blk.after[lab] : null);
    }
    // T4
    for (const [key, lab] of [["T4_board", "board thumb"], ["T4_product", "product thumb"]]) {
      const blk = s[key];
      if (!blk || !blk.implemented || !blk.before) { set(side, "T4", lab, null, null); continue; }
      const b = blk.before["thumb"];
      const a = blk.after ? blk.after["thumb"] : null;
      set(side, "T4", lab, b, a);
    }
    // T6/T7/T8: active static + inactive hover
    for (const [id, blkKey, activeLabel, inactiveLabel] of [
      ["T6", "T6", "pill active", "pill inactive"],
      ["T7", "T7", "tab active", "tab inactive"],
      ["T8", "T8", "page active", "page inactive"],
    ]) {
      const blk = s[blkKey];
      if (!blk || !blk.implemented) { set(side, id, activeLabel, null, null); set(side, id, inactiveLabel, null, null); continue; }
      const activeB = blk.activeStatic || null;
      const inactB = blk.hover && blk.hover.before ? blk.hover.before[inactiveLabel] : null;
      const inactA = blk.hover && blk.hover.after ? blk.hover.after[inactiveLabel] : null;
      set(side, id, activeLabel, activeB, null);
      set(side, id, inactiveLabel, inactB, inactA);
    }
  }
  return r;
}

function buildRowsFromSide(id, sideData) {
  const labelMap = {
    T1: [["card", CARD_PROPS], ["title", TITLE_PROPS]],
    T2: [["title", TITLE_PROPS]],
    T3: [["card", CARD_PROPS], ["title", TITLE_PROPS]],
    T4: [["board thumb", THUMB_PROPS], ["product thumb", THUMB_PROPS]],
    T5: [["button", BTN_PROPS]],
    T6: [["pill active", PILL_PROPS], ["pill inactive", PILL_PROPS]],
    T7: [["tab active", PILL_PROPS], ["tab inactive", PILL_PROPS]],
    T8: [["page active", PAGE_PROPS], ["page inactive", PAGE_PROPS]],
  };
  const rows = [];
  const visibleProps = ["color", "backgroundColor", "textDecorationLine", "opacity", "transform", "borderTopColor", "borderTopWidth", "fontWeight", "boxShadow", "filter"];
  const hasVisibleDelta = (r) => {
    if (!r || !r.before || !r.after) return null;
    return visibleProps.some((p) => r.before[p] !== r.after[p]);
  };
  for (const [label, props] of labelMap[id]) {
    const o = (sideData.orig[id] && sideData.orig[id][label]) || {};
    const l = (sideData.local[id] && sideData.local[id][label]) || {};
    // a hover transition is only observable if the element actually changes on hover
    const inertTransition = hasVisibleDelta(o) === false && hasVisibleDelta(l) === false;
    for (const prop of props) {
      const oB = o.before ? o.before[prop] : undefined;
      const oA = o.after ? o.after[prop] : undefined;
      const lB = l.before ? l.before[prop] : undefined;
      const lA = l.after ? l.after[prop] : undefined;
      if (oB === undefined && oA === undefined && lB === undefined && lA === undefined) continue;
      let status = "na";
      if (oB !== undefined || lB !== undefined) {
        status = classify(prop, oB !== undefined ? { v: oB, eff: o.before._effBg } : undefined, undefined, lB !== undefined ? { v: lB, eff: l.before._effBg } : undefined, undefined);
      }
      let hstatus = "na";
      if (oA !== undefined || lA !== undefined) {
        hstatus = classify(prop, oA !== undefined ? { v: oA, eff: o.after._effBg } : undefined, undefined, lA !== undefined ? { v: lA, eff: l.after._effBg } : undefined, undefined);
      }
      // border colours are invisible when the border width is zero on either side
      const oBWd = o.before && o.before.borderTopWidth;
      const lBWd = l.before && l.before.borderTopWidth;
      const oBWh = o.after && o.after.borderTopWidth;
      const lBWh = l.after && l.after.borderTopWidth;
      const borderInvisible = prop === "borderTopColor" && ((oBWd === "0px" || lBWd === "0px") || (oBWh === "0px" || lBWh === "0px"));
      // an inert transition (no visible hover delta on either side) is not observable
      const inert = inertTransition && prop.startsWith("transition");
      // a property present on only one side is a real mismatch
      const missing = (oB !== undefined) !== (lB !== undefined) || (oA !== undefined) !== (lA !== undefined);
      const final = missing
        ? "mismatch"
        : borderInvisible || inert
          ? "minor"
          : status === "mismatch" || hstatus === "mismatch"
            ? "mismatch"
            : status === "minor" || hstatus === "minor"
              ? "minor"
              : status === "na" && hstatus === "na"
                ? "na"
                : "match";
      rows.push({ element: label, property: prop, origDefault: oB, origAfter: oA, localDefault: lB, localAfter: lA, status: final });
    }
  }
  return rows;
}

/* ------------------------------------------------------------- main */

function esc(v) {
  if (v === undefined || v === null) return "—";
  return String(v).replace(/\|/g, "\\|");
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 1, colorScheme: "light" });
  const page = await ctx.newPage();
  const t0 = Date.now();

  const result = { meta: { orig: ORIG, local: LOCAL, viewport: VP, startedAt: new Date().toISOString() }, targets: {} };
  const sideRuns = {};

  for (const side of ["orig", "local"]) {
    const start = Date.now();
    try {
      sideRuns[side] = await runSide(page, side);
      console.log(`[${side}] measured in ${((Date.now() - start) / 1000).toFixed(1)}s`);
    } catch (e) {
      sideRuns[side] = { _error: String((e && e.message) || e).split("\n")[0] };
      console.error(`[${side}] FAIL ${sideRuns[side]._error}`);
    }
  }
  await browser.close();

  const sideData = normalizedReadings(sideRuns.orig || {}, sideRuns.local || {});
  result.raw = sideRuns;
  result.sideData = sideData;

  const TARGETS = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8"].filter((t) => !ONLY.length || ONLY.includes(t));

  const md = [];
  md.push("# Content-level interactive-state parity probe");
  md.push("");
  md.push(`- Orig: \`${ORIG}\`  •  Local: \`${LOCAL}\``);
  md.push("- Chromium headless, viewport 1440×900, deviceScaleFactor 1, colorScheme light.");
  md.push("- Method: discover elements LIVE per side, `scrollIntoView({block:center})`, `mouse.move` to the element centre, VERIFY `el.matches(':hover')` before the \`after\` read, then move away and settle.");
  md.push("- Active states (pills / tabs / pagination) are read without hover; their inactive sibling is hovered.");
  md.push(`- Raw JSON: \`design/audit/state-probe/content-report.json\``);
  md.push("");

  const summary = [];
  for (const id of TARGETS) {
    const d = DEF[id];
    const o = sideRuns.orig && sideRuns.orig[id];
    const l = sideRuns.local && sideRuns.local[id];
    const oImpl = id === "T4" ? !!(sideRuns.orig && sideRuns.orig.T4_board && sideRuns.orig.T4_board.implemented && sideRuns.orig.T4_product && sideRuns.orig.T4_product.implemented) : !!(o && o.implemented);
    const lImpl = id === "T4" ? !!(sideRuns.local && sideRuns.local.T4_board && sideRuns.local.T4_board.implemented && sideRuns.local.T4_product && sideRuns.local.T4_product.implemented) : !!(l && l.implemented);
    const rows = buildRowsFromSide(id, sideData);
    let verdict;
    if (!oImpl && !lImpl) verdict = "NOT-IMPLEMENTED";
    else if (!lImpl) verdict = "NOT-IMPLEMENTED";
    else if (!oImpl) verdict = "N-A";
    else verdict = targetVerdict(rows);
    result.targets[id] = { ...d, id, verdict, origImplemented: oImpl, localImplemented: lImpl, rows };
    summary.push({ id, name: d.name, verdict, mismatches: rows.filter((r) => r.status === "mismatch") });

    md.push(`## ${id} — ${d.name} — **${verdict}**`);
    md.push("");
    md.push(`Orig \`${d.origRoute}\` vs local \`${d.localRoute}\`. ${d.note}.`);
    // discovery evidence
    const ev = (side) => {
      const s = sideRuns[side];
      if (!s || s._error) return `error: ${s && s._error}`;
      if (id === "T1" || id === "T2" || id === "T3") return s[id] && s[id].discovery ? JSON.stringify(s[id].discovery) : "—";
      if (id === "T4") return `board=${JSON.stringify(s.T4_board && s.T4_board.discovery)} product=${JSON.stringify(s.T4_product && s.T4_product.discovery)}`;
      return s[id] && s[id].discovery ? JSON.stringify(s[id].discovery) : "—";
    };
    md.push("");
    md.push(`Discovery — orig: \`${ev("orig")}\``);
    md.push("");
    md.push(`Discovery — local: \`${ev("local")}\``);
    md.push("");
    if (!lImpl && oImpl) md.push(`> **Local feature not implemented** — ${l.reason || "not found"}.`);
    md.push("");
    md.push("| Element | Property | Orig default | Orig hover/active | Local default | Local hover/active | Status |");
    md.push("|---|---|---|---|---|---|---|");
    for (const r of rows) {
      const st = r.status === "mismatch" ? "**MISMATCH**" : r.status === "minor" ? "≈ minor" : r.status === "match" ? "MATCH" : "—";
      md.push(`| ${esc(r.element)} | ${esc(r.property)} | ${esc(r.origDefault)} | ${esc(r.origAfter)} | ${esc(r.localDefault)} | ${esc(r.localAfter)} | ${st} |`);
    }
    md.push("");
    const mism = rows.filter((r) => r.status === "mismatch");
    if (mism.length) {
      md.push("**Mismatching values (orig → local):**");
      for (const r of mism) {
        md.push(`- \`${r.element}.${r.property}\`: orig default=${esc(r.origDefault)} / hover|active=${esc(r.origAfter)} → local default=${esc(r.localDefault)} / hover|active=${esc(r.localAfter)}`);
      }
      md.push("");
    }
    const minors = rows.filter((r) => r.status === "minor");
    if (minors.length) {
      md.push(`> Cosmetic-equivalent differences (duration/rounding/transparent-border): ${minors.map((r) => `\`${r.element}.${r.property}\``).join(", ")}`);
      md.push("");
    }
    md.push("---");
    md.push("");
  }

  // summary table at top
  const header = md.slice(0, 6);
  const body = md.slice(6);
  const sumTable = ["## Verdict summary", "", "| Target | Topic | Verdict | Mismatching properties |", "|---|---|---|---|"];
  for (const s of summary) {
    sumTable.push(`| ${s.id} | ${s.name} | **${s.verdict}** | ${s.mismatches.length ? s.mismatches.map((m) => `\`${m.element}.${m.property}\``).join(", ") : "—"} |`);
  }
  sumTable.push("");
  sumTable.push(`_Run: ${((Date.now() - t0) / 1000).toFixed(1)}s._`);
  sumTable.push("");
  const finalMd = header.concat(sumTable, body).join("\n");
  await fs.writeFile(path.join(OUT, "content-report.md"), finalMd);
  await fs.writeFile(path.join(OUT, "content-report.json"), JSON.stringify(result, null, 2));

  console.log("\n================ CONTENT STATE-PROBE SUMMARY ================");
  for (const s of summary) {
    console.log(`${s.id} ${s.verdict.padEnd(15)} ${s.name}${s.mismatches.length ? " :: " + s.mismatches.map((m) => `${m.element}.${m.property}(orig[${m.origDefault ?? "—"}|${m.origAfter ?? "—"}]->local[${m.localDefault ?? "—"}|${m.localAfter ?? "—"}])`).join(", ") : ""}`);
  }
  console.log(`\nwrote ${path.join(OUT, "content-report.md")} + content-report.json`);
  console.log(`total ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((e) => {
  console.error(String((e && e.message) || e).split("\n")[0]);
  process.exit(1);
});
