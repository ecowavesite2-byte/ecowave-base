/**
 * Mobile INTERACTION probe — 390x844 side-by-side measurement of the original
 * imweb site vs the local rebuild, driven by LIVE element discovery per side.
 *
 * Unlike motion-mobile-probe.mjs (which hard-codes imweb hooks), this probe
 * never trusts a guessed selector: it inspects the live DOM of each side,
 * tags the elements it finds with a `data-probe` attribute, and measures the
 * interaction. That is required because the local rebuild uses different hooks
 * (Tailwind `translate` instead of a transform matrix, inline-style reveals,
 * numeric-aria dot buttons, Link cards) — none of the imweb hooks exist locally.
 *
 * Targets:
 *   1. drawer   mobile drawer/menu open+close transform trace (rAF), duration,
 *               easing, backdrop opacity, close-button opacity.
 *   2. reveal   scroll-reveal trigger: viewport-relative top when opacity first
 *               leaves 0, visible fraction, duration/delay.
 *   3. gallery  dot pager: dot count, item count, item width, active/visible
 *               index before+after a first->second dot click, items advanced.
 *   4. card     board card tap (touch) vs hover (mouse) computed-style deltas +
 *               navigation-block confirmation.
 *
 * Usage:
 *   node scripts/audit/mobile-interaction-probe.mjs [--side=orig|local|both] [--base=...] [--only=drawer,reveal,gallery,card]
 *
 * READ-ONLY on the app: no app/component files are touched. Viewport is fixed
 * at 390x844, deviceScaleFactor 1, colorScheme light, reducedMotion
 * "no-preference" so real animation timing is observable. Writes
 * design/audit/state-probe/mobile-interaction-report.{md,json}.
 */
import { chromium } from "playwright-core";
import fs from "node:fs/promises";
import path from "node:path";
import { PAGES, ORIG_BASE, DEFAULT_LOCAL_BASE } from "./pages.mjs";

const args = process.argv.slice(2);
const getArg = (name, dflt) => {
  const a = args.find((x) => x.startsWith("--" + name + "="));
  return a ? a.split("=").slice(1).join("=") : dflt;
};

const SIDE_ARG = getArg("side", "both");
if (!["orig", "local", "both"].includes(SIDE_ARG)) {
  console.error("usage: node scripts/audit/mobile-interaction-probe.mjs [--side=orig|local|both] [--base=...] [--only=...]");
  process.exit(1);
}
const LOCAL_BASE = getArg("base", DEFAULT_LOCAL_BASE).replace(/\/$/, "");
const VP = { width: 390, height: 844 };
const ALL = ["drawer", "reveal", "gallery", "card"];
const ONLY = getArg("only", "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const RUN = ONLY.length ? ALL.filter((m) => ONLY.includes(m)) : ALL;
const OUT = path.resolve("design/audit/state-probe");

const HIDE_DEV_STYLE =
  "nextjs-portal, [data-nextjs-toast], [data-nextjs-dialog], [data-nextjs-dev-tools-button] { display: none !important; }";

const PAGE = (key) => PAGES.find((p) => p.key === key);
const routeOf = (side, key) => {
  const p = PAGE(key);
  if (!p) throw new Error(`unknown page key ${key}`);
  return side === "orig" ? p.orig : p.local;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function goto(page, side, base, key) {
  const url = base + routeOf(side, key);
  await page.goto(url, { waitUntil: "load", timeout: 45000 });
  await page.waitForTimeout(1500);
  await page.addStyleTag({ content: HIDE_DEV_STYLE }).catch(() => {});
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await page.waitForTimeout(250);
  return url;
}

const err1 = (e) => String((e && e.message) || e).split("\n")[0];

/* ================================================================== drawer */

const DRAWER_DISCO = () => {
  const norm = (s, n = 140) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, n);
  const visible = (e) => {
    if (!e) return false;
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden";
  };
  const offsetOf = (e) => {
    const cs = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    let tx = null;
    const m = /matrix\(([^)]+)\)/.exec(cs.transform || "");
    if (m) tx = parseFloat(m[1].split(",")[4]) || 0;
    const tl = cs.translate || "none";
    if (tx === null && tl !== "none") {
      const p = tl.trim().split(/\s+/);
      tx = parseFloat(p[0]);
    }
    return {
      tag: e.tagName.toLowerCase(), cls: norm(typeof e.className === "string" ? e.className : ""),
      tx, translate: cs.translate, transform: cs.transform,
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      rectLeft: Math.round(r.left), rectRight: Math.round(r.right),
      left: cs.left, right: cs.right, opacity: cs.opacity, visibility: cs.visibility, zIndex: cs.zIndex,
      transitionProperty: cs.transitionProperty, transitionDuration: cs.transitionDuration,
      transitionTimingFunction: cs.transitionTimingFunction, transitionDelay: cs.transitionDelay,
    };
  };
  const tag = (e, v) => { e.setAttribute("data-probe", v); };

  /* trigger */
  const trigCands = [
    'button[aria-label="메뉴 열기"]', 'button[aria-label*="열기"]', 'button[aria-label*="menu" i]',
    ".icon_type_menu a", "a._no_hover.fixed_transform.inline-blocked", ".icon_type_menu", ".btn_menu a",
    'a[class*="menu_btn"]', 'button[class*="menu"]', '[class*="hamburger"]', '[class*="btn_menu"]',
  ];
  let trig = null;
  for (const c of trigCands) {
    const e = [...document.querySelectorAll(c)].find((el) => {
      const r = el.getBoundingClientRect();
      const label = (el.getAttribute("aria-label") || "") + " " + (typeof el.className === "string" ? el.className : "");
      return r.width > 0 && r.height > 0 && r.top < 140 && r.left < 220 && r.width < 140 && r.height < 140 && !/close|닫/i.test(label);
    });
    if (e) { trig = e; break; }
  }
  if (trig) tag(trig, "menu-trigger");

  /* close */
  const closeCands = [
    'button[aria-label="메뉴 닫기"]', ".slide-close", "button.navbar-toggle.close", '[class*="slide-close"]',
    'button[aria-label*="닫"]', '[class*="close"]',
  ];
  let close = null;
  for (const c of closeCands) {
    const e = document.querySelector(c);
    if (e) { close = e; break; }
  }
  if (close) tag(close, "drawer-close");

  /* drawer panel */
  let drawer = null;
  for (const c of ["#mobile_slide_menu", ".mobile_slide_menu", '[data-probe="drawer"]']) {
    const e = document.querySelector(c);
    if (e && visible(e)) { drawer = e; break; }
  }
  if (!drawer) {
    let best = null;
    for (const e of document.querySelectorAll("div,aside,nav")) {
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      if (r.height < 280 || r.width < 180 || r.width > window.innerWidth * 0.96) continue;
      const prop = cs.transitionProperty || "";
      if (!/transform|translate|left|right|all/.test(prop)) continue;
      const m = /matrix\(([^)]+)\)/.exec(cs.transform || "");
      let tx = m ? Math.abs(parseFloat(m[1].split(",")[4]) || 0) : 0;
      const tl = cs.translate || "none";
      if (tl !== "none") tx = Math.max(tx, Math.abs(parseFloat(tl) || 0));
      const off = Math.max(tx, Math.max(0, r.right - window.innerWidth), Math.max(0, -r.left));
      if (off < 20 && !/translate/.test(prop)) continue;
      const score = r.height * r.width + off * 500;
      if (!best || score > best.score) best = { e, score };
    }
    if (best) drawer = best.e;
  }
  if (drawer) tag(drawer, "drawer");

  /* backdrop — the original's `.slide_menu_backdrop` collapses (0x0) while the
   * drawer is closed, so a "covers the viewport right now" test would miss it.
   * Tier 1 matches slide/menu/drawer-specific backdrop hooks (no size test);
   * tier 2 falls back to generic overlay hooks that must cover the viewport. */
  let backdrop = null;
  const bdTier1 = [
    "[class*='slide_menu_backdrop']", "[class*='slide'][class*='backdrop']",
    "[class*='menu'][class*='backdrop']", "[class*='drawer'][class*='backdrop']",
  ];
  const bdTier2 = ["[class*='bg-black']", ".mobile_slide_menu_bg", ".slide_bg", ".menu_dim", "[class*='backdrop']", "[class*='dim']", "[class*='overlay']"];
  const coversViewport = (el) => {
    const r = el.getBoundingClientRect();
    return r.width >= window.innerWidth * 0.85 && r.height >= window.innerHeight * 0.85;
  };
  for (const c of bdTier1) {
    const e = [...document.querySelectorAll(c)].find((el) => getComputedStyle(el).position !== "static");
    if (e) { backdrop = e; break; }
  }
  if (!backdrop) {
    for (const c of bdTier2) {
      const e = [...document.querySelectorAll(c)].find((el) => getComputedStyle(el).position !== "static" && coversViewport(el));
      if (e) { backdrop = e; break; }
    }
  }
  if (backdrop) tag(backdrop, "drawer-backdrop");

  const sel = (e) => (e ? `[data-probe="${e.getAttribute("data-probe")}"]` : null);
  return {
    vw: window.innerWidth, vh: window.innerHeight,
    triggerSel: trig ? sel(trig) : null,
    triggerText: trig ? norm(trig.innerText || trig.getAttribute("aria-label"), 30) : null,
    closeSel: close ? sel(close) : null,
    drawerSel: drawer ? sel(drawer) : null,
    backdropSel: backdrop ? sel(backdrop) : null,
    drawer: drawer ? offsetOf(drawer) : null,
    close: close ? offsetOf(close) : null,
    backdrop: backdrop ? offsetOf(backdrop) : null,
  };
};

async function drawerTrace(page, sels) {
  await page.evaluate((s) => {
    const d = document.querySelector(s.drawerSel);
    const b = s.backdropSel && s.backdropSel.startsWith("[") ? document.querySelector(s.backdropSel) : null;
    const c = s.closeSel ? document.querySelector(s.closeSel) : null;
    // the original injects `.slide_menu_backdrop` only when the drawer opens, so
    // re-query a side-agnostic backdrop selector on every frame when the closed
    // state had no backdrop element.
    const bdSel = [".slide_menu_backdrop", "[class*='slide'][class*='backdrop']", "[class*='menu'][class*='backdrop']", "[class*='bg-black']", ".mobile_slide_menu_bg", ".dim"];
    const read = (e) => {
      if (!e) return null;
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      return {
        transform: cs.transform, translate: cs.translate, opacity: cs.opacity, visibility: cs.visibility,
        rectLeft: Math.round(r.left), rectRight: Math.round(r.right), rectTop: Math.round(r.top),
        width: Math.round(r.width), height: Math.round(r.height),
      };
    };
    window.__tr = { frames: [], t0: performance.now(), vw: window.innerWidth };
    const loop = () => {
      let be = b;
      if (!be) for (const sel of bdSel) { const el = document.querySelector(sel); if (el) { be = el; break; } }
      window.__tr.frames.push({
        t: Math.round(performance.now() - window.__tr.t0),
        drawer: read(d), backdrop: read(be), close: read(c),
      });
      window.__tr.raf = requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }, sels);
}
async function stopTrace(page) {
  return page.evaluate(() => {
    if (window.__tr && window.__tr.raf) cancelAnimationFrame(window.__tr.raf);
    return { vw: window.__tr ? window.__tr.vw : 0, frames: window.__tr ? window.__tr.frames : [] };
  });
}

const offsetVal = (o) => {
  if (!o) return null;
  const m = /matrix\(([^)]+)\)/.exec(o.transform || "");
  let tx = m ? parseFloat(m[1].split(",")[4]) : null;
  if (tx === null && o.translate && o.translate !== "none") {
    const p = o.translate.trim().split(/\s+/);
    tx = parseFloat(p[0]);
  }
  return { tx, rectLeft: o.rectLeft, rectRight: o.rectRight, width: o.width, height: o.height, opacity: parseFloat(o.opacity) };
};

function rangeOf(vals) {
  const v = vals.filter((x) => x != null && !Number.isNaN(x));
  return v.length ? { min: Math.min(...v), max: Math.max(...v), range: Math.max(...v) - Math.min(...v) } : { min: null, max: null, range: 0 };
}
function channelStats(series, ch) {
  const vals = series.map((s) => ({ t: s.t, v: s[ch] })).filter((s) => s.v != null && !Number.isNaN(s.v));
  if (!vals.length) return { channel: ch, frames: 0 };
  const first = vals[0].v, last = vals[vals.length - 1].v;
  let startT = null, prev = vals[0].v;
  const steps = [];
  for (const s of vals) {
    if (s.v !== prev) {
      if (startT === null) startT = s.t;
      steps.push({ t: s.t, v: s.v });
      prev = s.v;
    }
  }
  // effective end = last change before a long idle gap (the original drawer
  // resets its inline style after the animation, producing a trailing jump).
  let endT = steps.length ? steps[0].t : null;
  for (let i = 1; i < steps.length; i++) {
    if (steps[i].t - steps[i - 1].t > 320) break;
    endT = steps[i].t;
  }
  const lastChange = steps.length ? steps[steps.length - 1].t : null;
  return {
    channel: ch, frames: vals.length, startValue: first, endValue: last,
    firstChangeMs: startT, lastChangeMs: lastChange,
    durationMs: startT != null && endT != null ? endT - startT : null,
    steps: steps.slice(0, 20),
  };
}
function analyzeTrace(frameBag, key) {
  const frames = frameBag.frames || [];
  const series = frames.map((f) => {
    const o = offsetVal(f[key]);
    return { t: f.t, tx: o ? o.tx : null, rectLeft: o ? o.rectLeft : null, rectRight: o ? o.rectRight : null, width: o ? o.width : null, height: o ? o.height : null, opacity: o ? o.opacity : null };
  });
  const ranges = {
    tx: rangeOf(series.map((s) => s.tx)).range,
    rectLeft: rangeOf(series.map((s) => s.rectLeft)).range,
    rectRight: rangeOf(series.map((s) => s.rectRight)).range,
    width: rangeOf(series.map((s) => s.width)).range,
    height: rangeOf(series.map((s) => s.height)).range,
  };
  let best = "rectLeft", bestR = -1;
  for (const ch of ["tx", "rectLeft", "rectRight", "width", "height"]) if (ranges[ch] > bestR) { bestR = ranges[ch]; best = ch; }
  return {
    selectedChannel: best, channelRanges: ranges,
    move: channelStats(series, best),
    opacity: channelStats(series, "opacity"),
    firstFrame: series[0] || null,
    lastFrame: series[series.length - 1] || null,
    frameCount: frames.length,
  };
}

async function waitSettleDrawer(page, drawerSel, vw) {
  let prev = null, stable = 0;
  for (let i = 0; i < 26; i++) {
    const cur = await page.evaluate((s) => {
      const e = document.querySelector(s);
      if (!e) return null;
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      return `${cs.transform}|${cs.translate}|${Math.round(r.left)}|${Math.round(r.right)}`;
    }, drawerSel).catch(() => null);
    if (cur !== null && cur === prev) { if (++stable >= 2) return; } else stable = 0;
    prev = cur;
    await page.waitForTimeout(100);
  }
}

async function measureDrawer(page, side, base) {
  const out = { url: null, discovery: null, easing: null, open: null, closeAction: null, backdrop: null, closeBtn: null, reset: null };
  out.url = await goto(page, side, base, "home");
  const d = await page.evaluate(DRAWER_DISCO);
  out.discovery = d;
  out.easing = d.drawer
    ? { property: d.drawer.transitionProperty, duration: d.drawer.transitionDuration, timing: d.drawer.transitionTimingFunction, delay: d.drawer.transitionDelay }
    : null;
  if (!d.drawerSel) { out.error = "no drawer element discovered (NOT-IMPLEMENTED)"; return out; }
  if (!d.triggerSel) { out.error = "no menu trigger discovered"; return out; }

  const boxCenter = async (sel) => page.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e) return null;
    e.scrollIntoView({ block: "center" });
    const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: Math.round(r.width), h: Math.round(r.height), visible: r.width > 0 && r.height > 0 && r.left > -1000 && r.left < window.innerWidth };
  }, sel);

  /* ensure closed */
  const closed = await page.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { left: Math.round(r.left), right: Math.round(r.right), vw: window.innerWidth };
  }, d.drawerSel);
  const isOpen = closed && closed.left < closed.vw - 40 && closed.right > 60;
  if (isOpen) {
    out.reset = { wasOpen: true };
    const cb = d.closeSel ? await boxCenter(d.closeSel) : null;
    if (cb && cb.visible) await page.mouse.click(cb.x, cb.y);
    else await page.evaluate((s) => { const e = document.querySelector(s); if (e) e.click(); }, d.drawerSel);
    await waitSettleDrawer(page, d.drawerSel, closed.vw);
  } else out.reset = { wasOpen: false };

  const closeBefore = await page.evaluate((s) => {
    const e = s ? document.querySelector(s) : null;
    if (!e) return null;
    const cs = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    return { opacity: cs.opacity, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], inViewport: r.left > -1000 && r.left < window.innerWidth };
  }, d.closeSel);

  /* open */
  const tbox = await boxCenter(d.triggerSel);
  await drawerTrace(page, { drawerSel: d.drawerSel, backdropSel: d.backdropSel, closeSel: d.closeSel });
  if (tbox) await page.mouse.click(tbox.x, tbox.y);
  await waitSettleDrawer(page, d.drawerSel, closed ? closed.vw : 390);
  await page.waitForTimeout(220);
  let tr = await stopTrace(page);
  out.open = { click: tbox, trace: analyzeTrace(tr, "drawer"), backdropTrace: analyzeTrace(tr, "backdrop"), closeTrace: analyzeTrace(tr, "close"), rawFrames: tr.frames };
  // original backdrop is injected on open — record that it appeared.
  if (!d.backdropSel) {
    const anyBd = (tr.frames || []).find((f) => f.backdrop && (f.backdrop.width > 0 || f.backdrop.opacity !== "0"));
    if (anyBd) {
      d.backdropSel = "dynamic:(injected-on-open)";
      out.backdropFoundOnOpen = { width: anyBd.backdrop.width, height: anyBd.backdrop.height, opacity: anyBd.backdrop.opacity };
    }
  }

  /* open state */
  const openState = await page.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e) return null;
    const cs = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    return {
      left: Math.round(r.left), right: Math.round(r.right), transform: cs.transform, translate: cs.translate, opacity: cs.opacity,
      transitionProperty: cs.transitionProperty, transitionDuration: cs.transitionDuration,
      transitionTimingFunction: cs.transitionTimingFunction, transitionDelay: cs.transitionDelay,
    };
  }, d.drawerSel);
  out.openState = openState;
  // the original only attaches its `transform .3s` rule while the drawer is
  // open (`... _slide_menu animation`), so prefer the open-state transition.
  if (openState && /transform|translate|left|right/.test(openState.transitionProperty)) {
    out.easing = { property: openState.transitionProperty, duration: openState.transitionDuration, timing: openState.transitionTimingFunction, delay: openState.transitionDelay, source: "open-state" };
  } else if (out.easing) out.easing.source = "closed-state";

  /* close */
  const cb = d.closeSel ? await boxCenter(d.closeSel) : null;
  const cVisible = await page.evaluate((s) => {
    const e = s ? document.querySelector(s) : null;
    if (!e) return null;
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    return { opacity: cs.opacity, inViewport: r.left > -1000 && r.left < window.innerWidth + 4, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] };
  }, d.closeSel);
  await drawerTrace(page, { drawerSel: d.drawerSel, backdropSel: d.backdropSel, closeSel: d.closeSel });
  if (cb && cb.visible && cVisible && cVisible.inViewport) {
    await page.mouse.click(cb.x, cb.y);
    out.closeAction = { kind: "close-button", click: cb };
  } else if (d.backdropSel) {
    const bb = await boxCenter(d.backdropSel);
    if (bb && bb.visible) { await page.mouse.click(bb.x, bb.y); out.closeAction = { kind: "backdrop", click: bb }; }
  }
  if (!out.closeAction) {
    await page.evaluate((s) => { const e = document.querySelector(s); if (e) e.click(); }, d.drawerSel);
    out.closeAction = { kind: "programmatic-drawer-click" };
  }
  await waitSettleDrawer(page, d.drawerSel, closed ? closed.vw : 390);
  await page.waitForTimeout(220);
  tr = await stopTrace(page);
  out.closeAction.trace = analyzeTrace(tr, "drawer");
  out.closeAction.backdropTrace = analyzeTrace(tr, "backdrop");
  out.closeAction.closeTrace = analyzeTrace(tr, "close");
  out.closeAction.rawFrames = tr.frames;

  /* final closed state */
  out.closedAfter = await page.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e) return null;
    const cs = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    return { left: Math.round(r.left), right: Math.round(r.right), transform: cs.transform, translate: cs.translate, opacity: cs.opacity };
  }, d.drawerSel);
  return out;
}

/* ================================================================== reveal */

const REVEAL_DISCO = () => {
  const norm = (s, n = 110) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, n);
  const vh = window.innerHeight;
  const annotated = window.scrollY;
  const cands = [];
  // imweb hook
  for (const e of document.querySelectorAll("[data-widget-anim]")) {
    const v = e.getAttribute("data-widget-anim");
    if (!v || v === "none") continue;
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    if (r.height < 4 || r.width < 4) continue;
    cands.push({
      el: e, kind: "imweb-anim", anim: v,
      attrDur: e.getAttribute("data-widget-anim-duration"), attrDelay: e.getAttribute("data-widget-anim-delay"),
      top: r.top, h: r.height, opacity: parseFloat(cs.opacity),
      already: /(^|\s)animated(\s|$)/.test(e.className),
      transition: `${cs.transitionDuration} ${cs.transitionTimingFunction} ${cs.transitionDelay}`,
      cls: norm(typeof e.className === "string" ? e.className : ""),
    });
  }
  // local inline-style reveal
  for (const e of document.querySelectorAll("*")) {
    const st = e.style;
    if (!st || !st.transition || !st.opacity) continue;
    if (!st.transition.includes("opacity") || !st.transition.includes("transform")) continue;
    const r = e.getBoundingClientRect();
    if (r.height < 4 || r.width < 4) continue;
    if (document.querySelector('[data-probe="reveal"]')) break;
    cands.push({
      el: e, kind: "inline-reveal", anim: "inline",
      attrDur: null, attrDelay: null,
      top: r.top, h: r.height, opacity: parseFloat(st.opacity),
      already: parseFloat(st.opacity) > 0.99,
      transition: st.transition,
      cls: norm(typeof e.className === "string" ? e.className : ""),
    });
  }
  if (!cands.length) return { vh, scrollY: annotated, error: "no reveal candidate discovered" };
  // prefer a candidate that is still hidden AND below the fold
  const hidden = cands.filter((c) => !c.already || c.opacity < 0.99);
  const below = hidden.filter((c) => c.top > vh - 4);
  const pick = below[0] || hidden[0] || cands.sort((a, b) => b.top - a.top)[0];
  pick.el.setAttribute("data-probe", "reveal");
  const cs = getComputedStyle(pick.el);
  return {
    vh, scrollY: annotated,
    sel: '[data-probe="reveal"]',
    count: cands.length,
    kinds: [...new Set(cands.map((c) => c.kind))],
    pick: {
      kind: pick.kind, anim: pick.anim, attrDur: pick.attrDur, attrDelay: pick.attrDelay,
      top: Math.round(pick.top), height: Math.round(pick.h), opacity: pick.opacity, already: pick.already,
      transition: pick.transition, cls: pick.cls,
      computedDuration: cs.transitionDuration, computedDelay: cs.transitionDelay,
      computedTiming: cs.transitionTimingFunction, computedProperty: cs.transitionProperty,
      animationDuration: cs.animationDuration, animationName: cs.animationName,
    },
    allTop: cands.slice(0, 12).map((c) => ({ kind: c.kind, top: Math.round(c.top), h: Math.round(c.h), opacity: c.opacity, already: c.already })),
  };
};

async function measureReveal(page, side, base) {
  const out = { url: null, discovery: null, trace: [], trigger: null, applied: null };
  out.url = await goto(page, side, base, "rnd");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(900);
  const d = await page.evaluate(REVEAL_DISCO);
  out.discovery = d;
  if (d.error) { out.error = d.error; return out; }

  const info = await page.evaluate((s) => {
    const e = document.querySelector(s);
    const r = e.getBoundingClientRect();
    return { docTop: r.top + window.scrollY, top: r.top, h: r.height };
  }, d.sel);
  const vh = d.vh;
  const startY = Math.max(0, Math.round(info.docTop - vh - 30));

  /* rAF watcher records the exact first frame opacity leaves 0 plus top */
  await page.evaluate((s) => {
    const e = document.querySelector(s);
    window.__rev = { trig: null, t0: performance.now(), target: e };
    const sample = () => {
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      const rec = {
        t: Math.round(performance.now() - window.__rev.t0),
        scrollY: Math.round(window.scrollY), top: +r.top.toFixed(1), h: +r.height.toFixed(1),
        opacity: +parseFloat(cs.opacity).toFixed(4),
      };
      if (!window.__rev.trig && rec.opacity > 0.001) window.__rev.trig = rec;
      window.__rev.last = rec;
      if (window.__rev.frames) window.__rev.frames.push(rec);
      window.__rev.raf = requestAnimationFrame(sample);
    };
    window.__rev.frames = [];
    requestAnimationFrame(sample);
  }, d.sel);

  await page.evaluate((y) => window.scrollTo(0, y), startY);
  await page.waitForTimeout(650);
  for (let y = startY; y <= info.docTop + 60; y += 10) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await page.waitForTimeout(170);
    const stop = await page.evaluate(() => ({ trig: window.__rev.trig, scrollY: window.scrollY, top: window.__rev.last ? window.__rev.last.top : null, opacity: window.__rev.last ? window.__rev.last.opacity : null }));
    out.trace.push({ y: Math.round(y), top: stop.top, opacity: stop.opacity });
    if (stop.trig) break;
  }
  const fin = await page.evaluate(() => {
    if (window.__rev && window.__rev.raf) cancelAnimationFrame(window.__rev.raf);
    return { trig: window.__rev.trig, initialOpacity: window.__rev.frames.length ? window.__rev.frames[0].opacity : null, last: window.__rev.last, sampleCount: window.__rev.frames.length, frames: window.__rev.frames.slice(-40) };
  });
  out.sampleCount = fin.sampleCount;
  out.framesTail = fin.frames;
  const t = fin.trig;
  out.trigger = t
    ? {
        topAtTrigger: t.top,
        docTopAtTrigger: +(t.top + t.scrollY).toFixed(1),
        vh,
        offsetFromViewportBottom: +(vh - t.top).toFixed(1),
        topAsViewportFraction: +(t.top / vh).toFixed(3),
        visibleFractionAtTrigger: t.h > 0 ? +Math.max(0, Math.min(1, (vh - t.top) / t.h)).toFixed(3) : null,
        opacityAtTrigger: t.opacity,
      }
    : null;
  out.applied = {
    effectiveDuration: d.pick.kind === "imweb-anim"
      ? (d.pick.attrDur ? `${d.pick.attrDur}s` : (d.pick.animationDuration && d.pick.animationDuration !== "0s" ? d.pick.animationDuration : d.pick.computedDuration))
      : String(d.pick.computedDuration || "").split(",")[0].trim(),
    effectiveDelay: d.pick.kind === "imweb-anim"
      ? (d.pick.attrDelay ? `${d.pick.attrDelay}s` : d.pick.computedDelay)
      : String(d.pick.computedDelay || "").split(",")[0].trim(),
    computedDuration: d.pick.computedDuration, computedDelay: d.pick.computedDelay,
    computedTiming: d.pick.computedTiming, computedProperty: d.pick.computedProperty,
    animationDuration: d.pick.animationDuration,
  };
  out.startY = startY;
  out.docTop = Math.round(info.docTop);
  if (!t) out.error = "opacity never left 0 within the scan range";
  return out;
}

/* ================================================================= gallery */

const GALLERY_DISCO = () => {
  const norm = (s, n = 140) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, n);
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden"; };
  const cands = [];

  // A) imweb owl-carousel hook. A hidden carousel is still a real pager (the
  //    original hides the 4-dot/11-item company.about gallery at 390 via
  //    `visibility:hidden`), so include it and record visibility.
  for (const root of document.querySelectorAll(".owl-carousel")) {
    const dots = [...root.querySelectorAll(".owl-dots .owl-dot")];
    if (!dots.length) continue;
    const cls = typeof root.className === "string" ? root.className : "";
    if (/visual_area/.test(cls)) continue;
    const r0 = root.getBoundingClientRect();
    const cs0 = getComputedStyle(root);
    const items = [...root.querySelectorAll(".owl-item")];
    const visible = items.filter((e) => e.getBoundingClientRect().width > 0);
    cands.push({
      kind: "owl", rootCls: norm(cls), dots: dots.length, items: items.length, visibleItems: visible.length,
      visible: cs0.display !== "none" && cs0.visibility !== "hidden",
      itemWidth: visible[0] ? +visible[0].getBoundingClientRect().width.toFixed(1) : null,
      rect: [Math.round(r0.left), Math.round(r0.top + window.scrollY), Math.round(r0.width)],
      root, dotEls: dots, itemEls: items,
      stage: root.querySelector(".owl-stage"), track: root.querySelector(".owl-stage"),
    });
  }

  // B) local numeric-aria dot groups (button[aria-label="1"] ... under a scroll track)
  const byParent = new Map();
  for (const b of document.querySelectorAll('button[aria-label]')) {
    if (!/^\d+$/.test(b.getAttribute("aria-label") || "")) continue;
    const g = b.parentElement && b.parentElement.parentElement;
    if (!g) continue;
    if (!byParent.has(g)) byParent.set(g, []);
    byParent.get(g).push(b);
  }
  for (const [group, buttons] of byParent) {
    if (buttons.length < 2) continue;
    const root = group.parentElement;
    if (!root || !vis(root)) continue;
    const track = [...root.children].find((c) => {
      const cs = getComputedStyle(c);
      return (cs.overflowX === "auto" || cs.overflowX === "scroll") && c.children.length >= 2;
    });
    if (!track) continue;
    const items = [...track.children];
    cands.push({
      kind: "local-dots", rootCls: norm(typeof root.className === "string" ? root.className : ""),
      dots: buttons.length, items: items.length, visibleItems: items.filter((e) => e.getBoundingClientRect().width > 0).length,
      visible: true,
      itemWidth: items[0] ? +items[0].getBoundingClientRect().width.toFixed(1) : null,
      rect: (() => { const r = root.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top + window.scrollY), Math.round(r.width)]; })(),
      root, dotEls: buttons, itemEls: items, stage: null, track,
    });
  }

  if (!cands.length) return { error: "no gallery with a dot pager discovered" };
  // Prefer the imweb `gallery2 paging_type_line` (non custom_nav) gallery on the
  // original — that is the one the earlier measurements describe — then the
  // topmost visible candidate. Local numeric-dot groups only ever have one kind.
  const scoreOf = (c) => {
    if (c.kind === "owl") {
      let s = 100;
      if (/gallery2/.test(c.rootCls)) s += 50;
      if (/paging_type_line/.test(c.rootCls)) s += 30;
      if (/custom_nav/.test(c.rootCls)) s -= 40;
      if (c.visible) s += 20;
      return s;
    }
    return 80 + (c.visible ? 20 : 0);
  };
  cands.forEach((c) => (c._score = scoreOf(c)));
  cands.sort((a, b) => b._score - a._score || a.rect[1] - b.rect[1]);
  const pick = cands[0];
  pick.root.setAttribute("data-probe", "gallery");
  pick.root.id = pick.root.id || "__probe_gallery";
  pick.dotEls.forEach((el, i) => el.setAttribute("data-probe-dot", String(i)));
  return {
    count: cands.length,
    candidates: cands.map((c) => ({ kind: c.kind, rootCls: c.rootCls, dots: c.dots, items: c.items, visibleItems: c.visibleItems, visible: c.visible, itemWidth: c.itemWidth, rect: c.rect, score: c._score })),
    pick: { kind: pick.kind, rootCls: pick.rootCls, dots: pick.dots, items: pick.items, visibleItems: pick.visibleItems, visible: pick.visible, itemWidth: pick.itemWidth, rect: pick.rect, rootId: pick.root.id, score: pick._score },
  };
};

const GALLERY_STATE = () => {
  const root = document.querySelector('[data-probe="gallery"]');
  if (!root) return { error: "root lost" };
  const dots = [...root.querySelectorAll("[data-probe-dot]")];
  let track = null;
  if (root.classList.contains("owl-carousel")) track = root.querySelector(".owl-stage");
  if (!track) track = [...root.children].find((c) => { const cs = getComputedStyle(c); return (cs.overflowX === "auto" || cs.overflowX === "scroll") && c.children.length >= 2; });
  const itemSel = root.classList.contains("owl-carousel") ? ".owl-item" : ":scope > *";
  const items = track ? [...track.querySelectorAll(itemSel)] : [];
  const trackLeft = track ? track.getBoundingClientRect().left : 0;
  const clipLeft = root.getBoundingClientRect().left;
  // leftmost item that still intersects the carousel's clip box — works for
  // both owl (transformed stage, root clips) and the local scroll track.
  const lead = () => {
    let best = null;
    items.forEach((e, i) => {
      const r = e.getBoundingClientRect();
      if (r.width <= 0) return;
      if (r.right <= clipLeft + 1) return;
      const d = Math.abs(r.left - clipLeft);
      if (!best || d < best.d) best = { i, d, left: Math.round(r.left), top: Math.round(r.top), w: Math.round(r.width) };
    });
    if (!best) {
      items.forEach((e, i) => {
        const r = e.getBoundingClientRect();
        if (r.width <= 0) return;
        const d = Math.abs(r.left - clipLeft);
        if (!best || d < best.d) best = { i, d, left: Math.round(r.left), top: Math.round(r.top), w: Math.round(r.width) };
      });
    }
    return best;
  };
  return {
    activeDot: dots.findIndex((d) => d.classList.contains("active") || d.getAttribute("aria-current") === "true"),
    dotOpacities: dots.slice(0, 6).map((d) => getComputedStyle(d).opacity),
    activeItem: items.findIndex((e) => e.classList.contains("active")),
    itemCount: items.length,
    visibleItemCount: items.filter((e) => e.getBoundingClientRect().width > 0).length,
    lead: lead(),
    trackLeft: Math.round(trackLeft),
    scrollLeft: track ? Math.round(track.scrollLeft) : null,
    stageTransform: track && root.classList.contains("owl-carousel") ? getComputedStyle(track).transform : null,
  };
};

async function waitSettleGallery(page, tries = 16) {
  let prev = null, stable = 0;
  for (let i = 0; i < tries; i++) {
    const cur = await page.evaluate(() => {
      const root = document.querySelector('[data-probe="gallery"]');
      if (!root) return null;
      let track = null;
      if (root.classList.contains("owl-carousel")) track = root.querySelector(".owl-stage");
      if (!track) track = [...root.children].find((c) => { const cs = getComputedStyle(c); return (cs.overflowX === "auto" || cs.overflowX === "scroll") && c.children.length >= 2; });
      if (!track) return null;
      return `${Math.round(track.scrollLeft)}|${getComputedStyle(track).transform}|${[...track.children].map((c) => Math.round(c.getBoundingClientRect().left)).join(",")}`;
    }).catch(() => null);
    if (cur !== null && cur === prev) { if (++stable >= 2) return; } else stable = 0;
    prev = cur;
    await page.waitForTimeout(160);
  }
}

async function measureGallery(page, side, base, key) {
  const out = { url: null, discovery: null, before: null, afterDot2: null };
  out.url = await goto(page, side, base, key);
  const d = await page.evaluate(GALLERY_DISCO);
  out.discovery = d;
  if (d.error) { out.error = d.error; return out; }
  await page.evaluate(() => document.querySelector('[data-probe="gallery"]').scrollIntoView({ block: "center" }));
  await page.waitForTimeout(600);
  await waitSettleGallery(page);

  const clickDot = async (i) => {
    return page.evaluate((idx) => {
      const root = document.querySelector('[data-probe="gallery"]');
      const dots = [...root.querySelectorAll("[data-probe-dot]")];
      const el = dots[idx];
      if (!el) return { clicked: false, reason: "no dot " + idx };
      const r = el.getBoundingClientRect();
      el.click();
      return { clicked: true, at: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] };
    }, i);
  };

  // normalise to dot 0
  const first = await clickDot(0);
  await waitSettleGallery(page);
  await page.waitForTimeout(250);
  out.before = await page.evaluate(GALLERY_STATE);
  out.before.click = first;

  if (d.pick.dots < 2) { out.error = "pager has fewer than 2 dots"; return out; }
  const click2 = await clickDot(1);
  await waitSettleGallery(page);
  await page.waitForTimeout(250);
  out.afterDot2 = await page.evaluate(GALLERY_STATE);
  out.afterDot2.click = click2;

  const beforeLead = out.before.lead ? out.before.lead.i : null;
  const afterLead = out.afterDot2.lead ? out.afterDot2.lead.i : null;
  const beforeActive = out.before.activeItem != null && out.before.activeItem >= 0 ? out.before.activeItem : null;
  const afterActive = out.afterDot2.activeItem != null && out.afterDot2.activeItem >= 0 ? out.afterDot2.activeItem : null;
  out.advanceByLead = beforeLead != null && afterLead != null ? afterLead - beforeLead : null;
  out.advanceByActiveItem = beforeActive != null && afterActive != null ? afterActive - beforeActive : null;
  out.advancePerDotClick = out.advanceByActiveItem != null ? out.advanceByActiveItem : out.advanceByLead;
  out.stageTx = {
    before: out.before.stageTransform,
    after: out.afterDot2.stageTransform,
    delta: out.before.stageTransform != null && out.afterDot2.stageTransform != null
      ? (parseFloat((/matrix\(([^)]+)\)/.exec(out.afterDot2.stageTransform) || [0, "0"])[1].split(",")[4]) || 0) -
        (parseFloat((/matrix\(([^)]+)\)/.exec(out.before.stageTransform) || [0, "0"])[1].split(",")[4]) || 0)
      : null,
  };

  // restore to dot 0
  await clickDot(0);
  await waitSettleGallery(page);
  return out;
}

/* ==================================================================== card */

const CARD_PROPS = [
  "display", "position", "opacity", "visibility", "transform", "backgroundColor", "backgroundImage",
  "color", "textDecorationLine", "fontWeight", "fontSize", "boxShadow", "overflow", "cursor",
  "transitionProperty", "transitionDuration", "transitionTimingFunction",
];

const CARD_DISCO = () => {
  const norm = (s, n = 120) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, n);
  const cands = [...document.querySelectorAll("a")].filter((e) => {
    const r = e.getBoundingClientRect();
    if (!(r.width > 60 && r.height > 40)) return false;
    const href = e.getAttribute("href") || "";
    return /idx=|bdmode=view|\/news\/\d+|\/\d+\/\?/.test(href) && (e.querySelector("img,h3,h4,.title,.text_wrap,strong,figcaption,div.card-body") || e.querySelector("div,figure")) && (e.innerText || "").trim().length > 2;
  });
  if (!cands.length) return { error: "no board card link discovered" };
  cands.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  const el = cands[0];
  el.setAttribute("data-probe", "card");
  el.id = el.id || "__probe_card";
  const title = el.querySelector("h3,h4,.title,.text_wrap,strong") || el.querySelector("p");
  if (title) title.setAttribute("data-probe", "card-title");
  const r = el.getBoundingClientRect();
  return {
    sel: '[data-probe="card"]',
    titleSel: title ? '[data-probe="card-title"]' : null,
    href: el.getAttribute("href"),
    cls: norm(typeof el.className === "string" ? el.className : ""),
    tag: el.tagName.toLowerCase(),
    text: norm(el.innerText, 50),
    rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
    candidateCount: cands.length,
  };
};

async function measureCard(page, side, base) {
  const out = { url: null, target: null, default: null, touchTap: null, hover: null, active: null };
  const key = "news";
  out.url = await goto(page, side, base, key);
  const target = await page.evaluate(CARD_DISCO);
  out.target = target;
  if (target.error) { out.error = target.error; return out; }
  await page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: "center" }), target.sel);
  await page.waitForTimeout(500);

  const snap = () => page.evaluate(({ sel, titleSel, props }) => {
    const card = document.querySelector(sel);
    if (!card) return { error: "no card" };
    const title = titleSel ? document.querySelector(titleSel) : null;
    const info = (e) => {
      if (!e) return null;
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      const o = { tag: e.tagName.toLowerCase(), cls: (typeof e.className === "string" ? e.className : "").replace(/\s+/g, " ").trim().slice(0, 60) };
      for (const p of props) o[p] = cs[p];
      o.rect = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
      return o;
    };
    return { card: info(card), title: info(title) };
  }, { sel: target.sel, titleSel: target.titleSel, props: CARD_PROPS });

  const diff = (a, b) => {
    const out = {};
    for (const part of ["card", "title"]) {
      if (!a || !a[part] || !b || !b[part]) continue;
      const d = {};
      for (const p of CARD_PROPS) if (a[part][p] !== b[part][p]) d[p] = [a[part][p], b[part][p]];
      if (Object.keys(d).length) out[part] = d;
    }
    return Object.keys(out).length ? out : null;
  };

  out.default = await snap();

  // block navigation via capture-phase click listener, count blocked clicks
  await page.evaluate(() => {
    window.__probeBlock = { count: 0, on: true };
    window.__probeClickBlocker = (e) => { if (window.__probeBlock.on) { window.__probeBlock.count++; e.preventDefault(); } };
    document.addEventListener("click", window.__probeClickBlocker, true);
  });

  const box = await page.evaluate((s) => {
    const r = document.querySelector(s).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 120) };
  }, target.sel);

  const urlBefore = page.url();
  /* touch tap */
  await page.touchscreen.tap(box.x, box.y).catch((e) => (out.touchError = err1(e)));
  await page.waitForTimeout(450);
  out.touchTap = await snap();
  out.urlAfterTouch = page.url();
  out.touchNavigated = out.urlAfterTouch !== urlBefore ? out.urlAfterTouch : null;

  /* mouse hover */
  let isHover = false;
  for (let i = 0; i < 2 && !isHover; i++) {
    await page.mouse.move(box.x, box.y);
    await page.waitForTimeout(450);
    isHover = await page.evaluate((s) => { const e = document.querySelector(s); return e ? e.matches(":hover") : false; }, target.sel).catch(() => false);
  }
  out.isHover = isHover;
  out.hover = await snap();

  /* mouse down / active */
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await page.waitForTimeout(280);
  out.isActive = await page.evaluate((s) => { const e = document.querySelector(s); return e ? e.matches(":active") : false; }, target.sel).catch(() => false);
  out.active = await snap();
  await page.mouse.up();
  await page.waitForTimeout(100);

  out.changedTouchTap = diff(out.default, out.touchTap);
  out.changedHover = diff(out.default, out.hover);
  out.changedActive = diff(out.default, out.active);
  out.block = await page.evaluate(() => {
    window.__probeBlock.on = false;
    document.removeEventListener("click", window.__probeClickBlocker, true);
    return { blockedClicks: window.__probeBlock.count };
  });
  out.urlAfter = page.url();
  out.navigated = out.urlAfter !== urlBefore ? out.urlAfter : null;
  return out;
}

/* ============================================================ compare/report */

function pickPairs(a, b) {
  if (!a || !a.discovery || !a.discovery.pick) return { a: null, b: (b && b.discovery && b.discovery.pick) || null, note: "orig candidate unavailable" };
  if (!b || !b.discovery || !b.discovery.pick) return { a: a.discovery.pick, b: null, note: "local candidate unavailable" };
  const da = a.discovery.pick;
  const cb = b.discovery.candidates || [];
  let chosen = b.discovery.pick;
  let note = `selected each side's role/visibility-preferred candidate (orig score ${da.score}, local score ${chosen.score})`;
  const exact = cb.find((c) => c.items === da.items && c.dots === da.dots);
  const byItems = cb.find((c) => c.items === da.items);
  if (exact) { chosen = exact; note = "paired candidate with identical dots+items"; }
  else if (byItems) { chosen = byItems; note = "paired by item count"; }
  else if (cb.length > 1) note += `; ${cb.length} local candidates available (no item-count match)`;
  return { a: da, b: chosen, note };
}

function verdictDrawer(o, l) {
  if (!o || !l) return { verdict: "UNVERIFIABLE", note: "one side missing" };
  if (o.error && !o.discovery) return { verdict: "UNVERIFIABLE", note: `orig: ${o.error}` };
  if (!l.discovery || !l.discovery.drawerSel) return { verdict: "NOT-IMPLEMENTED", note: "local: no drawer element discovered" };
  if (l.error) return { verdict: "UNVERIFIABLE", note: `local: ${l.error}` };
  const od = o.open && o.open.trace && o.open.trace.move ? o.open.trace.move.durationMs : null;
  const ld = l.open && l.open.trace && l.open.trace.move ? l.open.trace.move.durationMs : null;
  const oe = o.easing ? `${o.easing.duration} ${o.easing.timing}` : null;
  const le = l.easing ? `${l.easing.duration} ${l.easing.timing}` : null;
  const oBackdrop = o.discovery.backdropSel ? true : false;
  const lBackdrop = l.discovery.backdropSel ? true : false;
  const problems = [];
  if (od != null && ld != null && Math.abs(od - ld) > 150) problems.push(`open duration ${od}ms vs ${ld}ms`);
  if (od == null && ld != null) problems.push("orig open duration unmeasured");
  if (oe && le && oe !== le) problems.push(`transition ${oe} vs ${le}`);
  if (oBackdrop !== lBackdrop) problems.push(`backdrop ${oBackdrop ? "present" : "absent"} vs ${lBackdrop ? "present" : "absent"}`);
  return { verdict: problems.length ? "MISMATCH" : "MATCH", note: problems.join("; ") };
}

function verdictReveal(o, l) {
  if (!o || !l) return { verdict: "UNVERIFIABLE", note: "one side missing" };
  if (o.error || !o.trigger) return { verdict: "UNVERIFIABLE", note: `orig: ${o.error || "no trigger"}` };
  if (l.error || !l.trigger) return { verdict: "UNVERIFIABLE", note: `local: ${l.error || "no trigger"}` };
  const problems = [];
  const of = o.trigger.topAsViewportFraction, lf = l.trigger.topAsViewportFraction;
  if (Math.abs(of - lf) > 0.05) problems.push(`trigger viewport fraction ${of} vs ${lf} (delta ${(Math.abs(of - lf)).toFixed(3)})`);
  const od = o.applied.effectiveDuration, ld = l.applied.effectiveDuration;
  if (od !== ld) problems.push(`effective duration ${od} vs ${ld}`);
  return { verdict: problems.length ? "MISMATCH" : "MATCH", note: problems.join("; ") };
}

function verdictGallery(o, l, pair) {
  if (!o || !l) return { verdict: "UNVERIFIABLE", note: "one side missing" };
  if (o.error || !o.before) return { verdict: "UNVERIFIABLE", note: `orig: ${o.error || "no state"}` };
  if (l.error || !l.before) return { verdict: "UNVERIFIABLE", note: `local: ${l.error || "no state"}` };
  const a = pair.a, b = pair.b;
  if (!a || !b) return { verdict: "UNVERIFIABLE", note: "candidate pairing failed" };
  const problems = [];
  const notes = [];
  if (a.dots !== b.dots) problems.push(`dots ${a.dots} vs ${b.dots}`);
  if (a.items !== b.items) problems.push(`items ${a.items} vs ${b.items}`);
  if (a.itemWidth != null && b.itemWidth != null && Math.abs(a.itemWidth - b.itemWidth) > 12) problems.push(`itemWidth ${a.itemWidth} vs ${b.itemWidth}`);
  const oa = o.advancePerDotClick, la = l.advancePerDotClick;
  if (oa == null || la == null) problems.push("advance unmeasured");
  else if (oa !== la) problems.push(`advance/dot ${oa} vs ${la}`);
  if (a.visible === false || b.visible === false) notes.push(`candidate hidden at 390 (orig=${a.visible}, local=${b.visible})`);
  const note = [pair.note, ...notes, ...problems].filter(Boolean).join("; ");
  return { verdict: problems.length ? "MISMATCH" : "MATCH", note };
}

function verdictCard(o, l) {
  if (!o || !l) return { verdict: "UNVERIFIABLE", note: "one side missing" };
  if (o.error || !o.default) return { verdict: "UNVERIFIABLE", note: `orig: ${o.error || "no snapshot"}` };
  if (l.error || !l.default) return { verdict: "UNVERIFIABLE", note: `local: ${l.error || "no snapshot"}` };
  const oc = !!(o.changedTouchTap || o.changedHover || o.changedActive);
  const lc = !!(l.changedTouchTap || l.changedHover || l.changedActive);
  if (oc !== lc) return { verdict: "MISMATCH", note: `orig changes=${oc} (${Object.keys(o.changedTouchTap || o.changedHover || o.changedActive || {}).join(",") || "none"}) vs local changes=${lc} (${Object.keys(l.changedTouchTap || l.changedHover || l.changedActive || {}).join(",") || "none"})` };
  return { verdict: "MATCH", note: oc ? "both sides show a state change" : "no tap/hover style delta on either side" };
}

/* ================================================================ render md */

function esc(s) { return String(s == null ? "" : s).replace(/\|/g, "\\|"); }
function code(v) { return "`" + String(v) + "`"; }
function dur(t) { return t && t.move && t.move.durationMs != null ? `${t.move.durationMs}ms` : "n/a"; }

function mdDrawer(o, l, cmp) {
  const bdDesc = (d) => {
    if (!d || !d.discovery) return "n/a";
    if (!d.discovery.backdropSel) return "absent";
    const t = d.open && d.open.backdropTrace;
    if (!t) return "present";
    if (t.opacity && t.opacity.frames && t.opacity.durationMs != null) return `present, fades opacity ${t.opacity.startValue}->${t.opacity.endValue} over ~${t.opacity.durationMs}ms`;
    if (t.move && t.move.frames && t.move.durationMs != null) return `present, animates ${t.move.selectedChannel} ${t.move.startValue}->${t.move.endValue} over ~${t.move.durationMs}ms`;
    return `present, appears instantly (opacity ${t.opacity ? t.opacity.startValue : "?"}, no fade)`;
  };
  const rows = [];
  const line = (label, ov, lv) => rows.push(`| ${esc(label)} | ${esc(ov)} | ${esc(lv)} |`);
  line("trigger", o && o.discovery ? o.discovery.triggerText : "?", l && l.discovery ? l.discovery.triggerText : "?");
  line("drawer element", o && o.discovery ? o.discovery.drawerSel : "?", l && l.discovery ? l.discovery.drawerSel : "?");
  line("moving channel", o && o.open ? o.open.trace.selectedChannel : "?", l && l.open ? l.open.trace.selectedChannel : "?");
  line("open start -> end", o && o.open ? `${o.open.trace.move.startValue} -> ${o.open.trace.move.endValue}` : "?", l && l.open ? `${l.open.trace.move.startValue} -> ${l.open.trace.move.endValue}` : "?");
  line("open duration", o && o.open ? dur(o.open.trace) : "?", l && l.open ? dur(l.open.trace) : "?");
  line("close duration", o && o.closeAction ? dur(o.closeAction.trace) : "?", l && l.closeAction ? dur(l.closeAction.trace) : "?");
  line("transition", o && o.easing ? `${o.easing.property} ${o.easing.duration} ${o.easing.timing}` : "?", l && l.easing ? `${l.easing.property} ${l.easing.duration} ${l.easing.timing}` : "?");
  line("backdrop behavior on open", bdDesc(o), bdDesc(l));
  line("close button", o && o.discovery ? (o.discovery.closeSel ? "present" : "absent") : "?", l && l.discovery ? (l.discovery.closeSel ? "present" : "absent") : "?");
  line("close button opacity closed -> open", o && o.discovery && o.discovery.close ? o.discovery.close.opacity : "n/a", l && l.discovery && l.discovery.close ? l.discovery.close.opacity : "n/a");
  line("close button fade on open", o && o.open ? `${o.open.closeTrace.opacity.startValue} -> ${o.open.closeTrace.opacity.endValue}` : "n/a", l && l.open ? `${l.open.closeTrace.opacity.startValue} -> ${l.open.closeTrace.opacity.endValue}` : "n/a");
  return rows.join("\n") + `\n\n**Verdict: ${cmp.verdict}** — ${cmp.note || "all measured signals match"}`;
}

function mdReveal(o, l, cmp) {
  const rows = [];
  const line = (label, ov, lv) => rows.push(`| ${esc(label)} | ${esc(ov)} | ${esc(lv)} |`);
  line("hook kind", o && o.discovery ? o.discovery.pick.kind + "/" + o.discovery.pick.anim : "?", l && l.discovery ? l.discovery.pick.kind + "/" + l.discovery.pick.anim : "?");
  line("viewport top @ trigger", o && o.trigger ? `${o.trigger.topAtTrigger}px` : "n/a", l && l.trigger ? `${l.trigger.topAtTrigger}px` : "n/a");
  line("top / vh fraction", o && o.trigger ? o.trigger.topAsViewportFraction : "n/a", l && l.trigger ? l.trigger.topAsViewportFraction : "n/a");
  line("visible fraction @ trigger", o && o.trigger ? o.trigger.visibleFractionAtTrigger : "n/a", l && l.trigger ? l.trigger.visibleFractionAtTrigger : "n/a");
  line("applied duration / delay", o && o.applied ? `${o.applied.effectiveDuration} / ${o.applied.effectiveDelay}` : "n/a", l && l.applied ? `${l.applied.effectiveDuration} / ${l.applied.effectiveDelay}` : "n/a");
  line("raw computed duration", o && o.applied ? o.applied.computedDuration : "n/a", l && l.applied ? l.applied.computedDuration : "n/a");
  return rows.join("\n") + `\n\n**Verdict: ${cmp.verdict}** — ${cmp.note || "trigger threshold and duration match"}`;
}

function mdGallery(o, l, cmp, pair) {
  const rows = [];
  const line = (label, ov, lv) => rows.push(`| ${esc(label)} | ${esc(ov)} | ${esc(lv)} |`);
  const oa = pair.a || {}, lb = pair.b || {};
  line("candidate", oa.kind ? `${oa.kind} ${oa.rootCls || ""}` : "?", lb.kind ? `${lb.kind} ${lb.rootCls || ""}` : "?");
  line("visible at 390", oa.visible, lb.visible);
  line("dots", oa.dots, lb.dots);
  line("items", oa.items, lb.items);
  line("item width", oa.itemWidth, lb.itemWidth);
  line("active dot before -> after", o && o.before ? `${o.before.activeDot} -> ${o.afterDot2 && o.afterDot2.activeDot}` : "?", l && l.before ? `${l.before.activeDot} -> ${l.afterDot2 && l.afterDot2.activeDot}` : "?");
  line("active item before -> after", o && o.before ? `${o.before.activeItem} -> ${o.afterDot2 && o.afterDot2.activeItem}` : "?", l && l.before ? `${l.before.activeItem} -> ${l.afterDot2 && l.afterDot2.activeItem}` : "?");
  line("visible lead before -> after", o && o.before && o.before.lead ? `${o.before.lead.i} -> ${o.afterDot2 && o.afterDot2.lead && o.afterDot2.lead.i}` : "?", l && l.before && l.before.lead ? `${l.before.lead.i} -> ${l.afterDot2 && l.afterDot2.lead && l.afterDot2.lead.i}` : "?");
  line("items advanced per dot", o ? o.advancePerDotClick : "?", l ? l.advancePerDotClick : "?");
  line("stage transform delta", o ? o.stageTx && o.stageTx.delta : "?", l ? l.stageTx && l.stageTx.delta : "?");
  return rows.join("\n") + `\n\n**Verdict: ${cmp.verdict}** — ${cmp.note || "pager behaviour matches"}`;
}

function mdCard(o, l, cmp) {
  const rows = [];
  const line = (label, ov, lv) => rows.push(`| ${esc(label)} | ${esc(ov)} | ${esc(lv)} |`);
  line("card", o && o.target ? `${o.target.tag} ${o.target.cls}` : "?", l && l.target ? `${l.target.tag} ${l.target.cls}` : "?");
  line("href", o && o.target ? o.target.href : "?", l && l.target ? l.target.href : "?");
  line("touch tap style delta", o ? (o.changedTouchTap ? JSON.stringify(Object.keys(o.changedTouchTap)) : "none") : "?", l ? (l.changedTouchTap ? JSON.stringify(Object.keys(l.changedTouchTap)) : "none") : "?");
  line("hover style delta", o ? (o.changedHover ? JSON.stringify(Object.keys(o.changedHover)) : "none") : "?", l ? (l.changedHover ? JSON.stringify(Object.keys(l.changedHover)) : "none") : "?");
  line("active style delta", o ? (o.changedActive ? JSON.stringify(Object.keys(o.changedActive)) : "none") : "?", l ? (l.changedActive ? JSON.stringify(Object.keys(l.changedActive)) : "none") : "?");
  line("navigation blocked", o ? `${!o.navigated} (blockedClicks=${o.block ? o.block.blockedClicks : "?"})` : "?", l ? `${!l.navigated} (blockedClicks=${l.block ? l.block.blockedClicks : "?"})` : "?");
  line("navigated during probe", o ? (o.navigated || "no") : "?", l ? (l.navigated || "no") : "?");
  return rows.join("\n") + `\n\n**Verdict: ${cmp.verdict}** — ${cmp.note || "card state matches"}`;
}

/* ===================================================================== main */

async function measureSide(page, side, base) {
  const res = {};
  for (const m of RUN) {
    const start = Date.now();
    try {
      res[m] = m === "drawer"
        ? await measureDrawer(page, side, base)
        : m === "reveal"
          ? await measureReveal(page, side, base)
          : m === "gallery"
            ? { home: await measureGallery(page, side, base, "home"), about: await measureGallery(page, side, base, "company.about") }
            : await measureCard(page, side, base);
    } catch (e) {
      res[m] = { error: err1(e) };
    }
    res[m]._durationMs = Date.now() - start;
    console.log(`[${side}/${m}] ${res[m].error ? "ERR " + res[m].error : `ok ${(res[m]._durationMs / 1000).toFixed(1)}s`}`);
  }
  return res;
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const makeCtx = () => browser.newContext({
    viewport: VP, deviceScaleFactor: 1, colorScheme: "light",
    reducedMotion: "no-preference", hasTouch: true,
  });

  const sides = SIDE_ARG === "both" ? ["orig", "local"] : [SIDE_ARG];
  const data = { meta: { generated: new Date().toISOString(), vp: VP, sides, base: { orig: ORIG_BASE, local: LOCAL_BASE }, modules: RUN }, sides: {} };
  const ctx = await makeCtx();
  const page = await ctx.newPage();
  page.on("pageerror", () => {});

  const t0 = Date.now();
  for (const side of sides) {
    const base = side === "orig" ? ORIG_BASE : LOCAL_BASE;
    console.log(`\n=== ${side} @ ${base} ===`);
    data.sides[side] = await measureSide(page, side, base);
  }

  /* ------- compare + report (only meaningful when both sides present) ------- */
  const O = data.sides.orig || {};
  const L = data.sides.local || {};
  const cmp = {};
  if (O.drawer || L.drawer) cmp.drawer = verdictDrawer(O.drawer, L.drawer);
  if (O.reveal || L.reveal) cmp.reveal = verdictReveal(O.reveal, L.reveal);

  const gPair = {};
  for (const k of ["home", "about"]) {
    const o = O.gallery && O.gallery[k];
    const l = L.gallery && L.gallery[k];
    gPair[k] = pickPairs(o, l);
    cmp["gallery." + k] = verdictGallery(o, l, gPair[k]);
  }
  if (O.card || L.card) cmp.card = verdictCard(O.card, L.card);
  data.compare = cmp;

  await fs.writeFile(path.join(OUT, "mobile-interaction-report.json"), JSON.stringify(data, null, 2));

  const md = [];
  md.push("# Mobile interaction parity probe (live discovery, 390x844)");
  md.push("");
  md.push(`- orig base: \`${ORIG_BASE}\``);
  md.push(`- local base: \`${LOCAL_BASE}\``);
  md.push(`- viewport: 390x844, dsf 1, colorScheme light, reducedMotion no-preference, hasTouch true`);
  md.push(`- generated: ${data.meta.generated}`);
  md.push(`- discovery: every hook is found by inspecting the live DOM per side and tagged with a \`data-probe\` attribute; no imweb selector is assumed on the local side.`);
  md.push("");
  md.push("## Summary");
  md.push("");
  md.push("| target | verdict | note |");
  md.push("| --- | --- | --- |");
  for (const [k, v] of Object.entries(cmp)) md.push(`| ${esc(k)} | **${v.verdict}** | ${esc(v.note)} |`);
  md.push("");
  md.push("## T1 — Mobile drawer / menu");
  if (O.drawer && L.drawer) md.push(mdDrawer(O.drawer, L.drawer, cmp.drawer));
  else md.push("UNVERIFIABLE — one side missing.");
  md.push("");
  md.push("## T2 — Scroll reveal (`/21` vs `/rnd`)");
  if (O.reveal && L.reveal) md.push(mdReveal(O.reveal, L.reveal, cmp.reveal));
  else md.push("UNVERIFIABLE — one side missing.");
  md.push("");
  md.push("## T3a — Gallery dots (home `/` vs `/`)");
  if (O.gallery && L.gallery) md.push(mdGallery(O.gallery.home, L.gallery.home, cmp["gallery.home"], gPair.home));
  else md.push("UNVERIFIABLE — one side missing.");
  md.push("");
  md.push("## T3b — Gallery dots (`/17` vs `/company/about`)");
  if (O.gallery && L.gallery) md.push(mdGallery(O.gallery.about, L.gallery.about, cmp["gallery.about"], gPair.about));
  else md.push("UNVERIFIABLE — one side missing.");
  md.push("");
  md.push("## T4 — Board card tap vs hover (`/29` vs `/news`)");
  if (O.card && L.card) md.push(mdCard(O.card, L.card, cmp.card));
  else md.push("UNVERIFIABLE — one side missing.");
  md.push("");
  md.push("## Raw drawer traces");
  md.push("");
  md.push("Full per-frame traces and step tables are in `mobile-interaction-report.json` (sides.<side>.drawer.open.trace.move.steps / closeAction.trace.move.steps). Summarised steps:");
  md.push("");
  for (const side of [["orig", O.drawer], ["local", L.drawer]]) {
    const [name, d] = side;
    if (!d || !d.open) continue;
    const steps = (d.open.trace.move.steps || []).map((s) => `${s.t}ms:${s.v}`).join(", ");
    md.push(`- ${name} open steps (${d.open.trace.selectedChannel}): ${steps || "none"}`);
    if (d.closeAction && d.closeAction.trace) {
      const cs = (d.closeAction.trace.move.steps || []).map((s) => `${s.t}ms:${s.v}`).join(", ");
      md.push(`- ${name} close steps (${d.closeAction.trace.selectedChannel}): ${cs || "none"}`);
    }
  }
  md.push("");
  md.push("## Unverifiable / caveats");
  md.push("");
  const unv = [];
  for (const [k, v] of Object.entries(cmp)) if (v.verdict === "UNVERIFIABLE" || v.verdict === "NOT-IMPLEMENTED") unv.push(`- ${k}: ${v.verdict} — ${v.note}`);
  if (O.reveal && O.reveal.discovery && O.reveal.discovery.pick) unv.push(`- reveal candidates: orig ${O.reveal.discovery.count} (${O.reveal.discovery.kinds.join(",")}); local ${(L.reveal && L.reveal.discovery && L.reveal.discovery.count) || "n/a"} (${(L.reveal && L.reveal.discovery && L.reveal.discovery.kinds.join(",")) || "n/a"})`);
  for (const k of ["home", "about"]) {
    const oc = O.gallery && O.gallery[k] && O.gallery[k].discovery && O.gallery[k].discovery.candidates;
    const lc = L.gallery && L.gallery[k] && L.gallery[k].discovery && L.gallery[k].discovery.candidates;
    if (oc) unv.push(`- gallery.${k} orig candidates: ${oc.map((c) => `${c.dots}dots/${c.items}items/${c.itemWidth}w${c.visible ? "" : " hidden"}`).join(", ")}`);
    if (lc) unv.push(`- gallery.${k} local candidates: ${lc.map((c) => `${c.dots}dots/${c.items}items/${c.itemWidth}w${c.visible ? "" : " hidden"}`).join(", ")}`);
  }
  md.push(unv.length ? unv.join("\n") : "- none");
  md.push("");
  await fs.writeFile(path.join(OUT, "mobile-interaction-report.md"), md.join("\n"));

  await browser.close();
  console.log(`\ntotal ${((Date.now() - t0) / 1000).toFixed(1)}s -> design/audit/state-probe/mobile-interaction-report.{md,json}`);
  console.log("verdicts:", JSON.stringify(Object.fromEntries(Object.entries(cmp).map(([k, v]) => [k, v.verdict]))));
}

main().catch((e) => { console.error(err1(e)); process.exit(1); });
