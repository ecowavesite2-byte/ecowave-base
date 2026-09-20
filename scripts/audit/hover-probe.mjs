/**
 * Hover / animation / mouse-effect ground-truth probe for the ORIGINAL site.
 *
 * Captures live computed styles and hover deltas for the D-list items
 * (D3 D6 D9 D11 D13 D14 D15 D17) and writes raw JSON under
 * design/audit/hover-probe/.
 *
 * READ-ONLY investigation: the local source is compared by reading files, NOT
 * by probing the running build (which is stale). This script only talks to the
 * original site.
 *
 * Usage:
 *   node scripts/audit/hover-probe.mjs [--only=D3,D6,...] [--base=https://...]
 *
 * Browser setup matches target-probe.mjs (chromium headless, dsf 1, light) but
 * keeps reducedMotion at its default ("no-preference") because D6 must observe
 * the real scroll-reveal animation.
 */
import { chromium } from "playwright-core";
import fs from "node:fs/promises";
import path from "node:path";
import { ORIG_BASE } from "./pages.mjs";

const args = process.argv.slice(2);
const getArg = (name, dflt) => {
  const a = args.find((x) => x.startsWith("--" + name + "="));
  return a ? a.split("=").slice(1).join("=") : dflt;
};
const BASE = getArg("base", ORIG_BASE).replace(/\/$/, "");
const ONLY = getArg("only", "")
  .split(",")
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);
const OUT = path.resolve("design/audit/hover-probe");
const VP = { width: 1440, height: 900 };

const ALL = ["D3", "D6", "D9", "D11", "D13", "D14", "D15", "D17"];
const ITEMS = ONLY.length ? ALL.filter((i) => ONLY.includes(i)) : ALL;

const CSS_PROPS = [
  "color", "backgroundColor", "backgroundImage", "borderTopColor", "borderTopWidth",
  "borderTopStyle", "borderRadius", "textDecorationLine", "textDecorationColor",
  "textDecorationThickness", "textUnderlineOffset", "opacity", "transform", "boxShadow",
  "filter", "fontSize", "fontWeight", "fontFamily", "lineHeight", "letterSpacing",
  "transitionProperty", "transitionDuration", "transitionTimingFunction",
  "display", "position", "overflow", "cursor", "paddingTop", "paddingBottom", "height",
];

const HIDE_DEV_STYLE =
  "nextjs-portal, [data-nextjs-toast], [data-nextjs-dialog], [data-nextjs-dev-tools-button] { display: none !important; }";

async function goto(page, p) {
  await page.goto(BASE + p, { waitUntil: "load", timeout: 45000 });
  await page.waitForTimeout(1500);
  await page.addStyleTag({ content: HIDE_DEV_STYLE }).catch(() => {});
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
}

/** read computed props of `childSel` inside `sel` (or `sel` itself when childSel omitted) */
async function readEl(page, sel, childSel, props = CSS_PROPS) {
  return page.evaluate(
    ({ sel, childSel, props }) => {
      const root = sel ? document.querySelector(sel) : document;
      if (!root) return { error: "no root: " + sel };
      const el = childSel ? root.querySelector(childSel) : root;
      if (!el) return { error: "no child `" + childSel + "` in " + sel };
      const st = getComputedStyle(el);
      const o = {};
      for (const k of props) o[k] = st[k];
      const r = el.getBoundingClientRect();
      o._tag = el.tagName.toLowerCase();
      o._cls = (typeof el.className === "string" ? el.className : "").replace(/\s+/g, " ").trim().slice(0, 140);
      o._text = (el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 80);
      o._rect = { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
      return o;
    },
    { sel, childSel, props },
  );
}

/** default vs :hover computed props for `childSel` (or sel), with hover verification */
async function hoverMeasure(page, sel, childSel, props = CSS_PROPS) {
  const before = await readEl(page, sel, childSel, props);
  if (before.error) return { sel, childSel, before };
  let hover;
  let isHover = null;
  try {
    await page.evaluate((s) => {
      const e = document.querySelector(s);
      if (e) e.scrollIntoView({ block: "center" });
    }, sel);
    await page.waitForTimeout(500);
    const box = await page.evaluate((s) => {
      const e = document.querySelector(s);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, sel);
    if (box && box.w > 0 && box.h > 0) {
      const vh = await page.evaluate(() => window.innerHeight);
      const cx = Math.min(Math.max(box.x + box.w / 2, 5), 1435);
      const cy = Math.min(Math.max(box.y + Math.min(box.h / 2, 120), 5), vh - 5);
      await page.mouse.move(cx, cy);
      await page.waitForTimeout(560);
    } else {
      await page.hover(sel, { force: true, timeout: 4000 });
      await page.waitForTimeout(500);
    }
    isHover = await page.evaluate((s) => {
      const e = document.querySelector(s);
      return e ? e.matches(":hover") : null;
    }, sel);
    hover = await readEl(page, sel, childSel, props);
  } catch (e) {
    hover = { error: String((e && e.message) || e).split("\n")[0].slice(0, 160) };
  }
  await page.mouse.move(2, 2).catch(() => {});
  await page.waitForTimeout(380);
  return { sel, childSel, before, hover, isHover };
}

const CARD_KEYS = ["card-head", "card-summary", "card-body", "card-foot", "post_link_wrap", "title", "title-block", "body", "date", "thumb", "summary", "holder"];

/** computed snapshot of a card + its notable descendants */
async function cardNodeInfo(page, cardSel, keys) {
  return page.evaluate(
    ({ sel, keys }) => {
      const card = document.querySelector(sel);
      if (!card) return { error: "no card " + sel };
      const all = [card, ...card.querySelectorAll("*")];
      const nodes = all.filter((e) => {
        if (e === card) return true;
        if (!keys) return true;
        const c = typeof e.className === "string" ? e.className : "";
        return keys.some((k) => c.includes(k));
      });
      const info = (e) => {
        const cs = getComputedStyle(e);
        const r = e.getBoundingClientRect();
        return {
          tag: e.tagName.toLowerCase(),
          cls: (typeof e.className === "string" ? e.className : "").replace(/\s+/g, " ").trim().slice(0, 80),
          disp: cs.display, pos: cs.position, op: cs.opacity, vis: cs.visibility,
          bg: cs.backgroundColor, bgImg: cs.backgroundImage === "none" ? "none" : cs.backgroundImage.slice(0, 60),
          color: cs.color, td: cs.textDecorationLine, fw: cs.fontWeight, fs: cs.fontSize,
          text: (e.innerText || "").replace(/\s+/g, " ").trim().slice(0, 30),
          rect: [+r.x.toFixed(0), +r.y.toFixed(0), +r.width.toFixed(0), +r.height.toFixed(0)],
        };
      };
      return { card: info(card), nodes: nodes.slice(0, 28).map(info), text: (card.innerText || "").replace(/\s+/g, " ").trim().slice(0, 80) };
    },
    { sel: cardSel, keys },
  );
}

/** default vs hover card subtree diff (reveals overlay show/hide behavior) */
async function hoverCardSnapshot(page, cardSel, keys = CARD_KEYS) {
  const before = await cardNodeInfo(page, cardSel, keys);
  if (before.error) return { cardSel, before };
  await page.evaluate((s) => {
    const e = document.querySelector(s);
    if (e) e.scrollIntoView({ block: "center" });
  }, cardSel);
  await page.waitForTimeout(500);
  const box = await page.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, cardSel);
  if (box && box.w > 0) {
    const vh = await page.evaluate(() => window.innerHeight);
    const cy = Math.min(Math.max(box.y + Math.min(box.h / 2, 120), 5), vh - 5);
    await page.mouse.move(Math.min(Math.max(box.x + box.w / 2, 5), 1435), cy);
    await page.waitForTimeout(600);
  }
  const isHover = await page.evaluate((s) => {
    const e = document.querySelector(s);
    return e ? e.matches(":hover") : null;
  }, cardSel);
  const after = await cardNodeInfo(page, cardSel, keys);
  await page.mouse.move(2, 2).catch(() => {});
  await page.waitForTimeout(350);
  const changed = [];
  const n = Math.min(before.nodes.length, after.nodes.length);
  for (let i = 0; i < n; i++) {
    const b = before.nodes[i];
    const a = after.nodes[i];
    const d = {};
    for (const k of ["disp", "pos", "op", "vis", "bg", "color", "td"]) if (b[k] !== a[k]) d[k] = [b[k], a[k]];
    if (Object.keys(d).length) changed.push({ i, tag: b.tag, cls: b.cls, delta: d });
  }
  return { cardSel, isHover, cardBefore: before.card, cardAfter: after.card, changed, defaultNodes: before.nodes, hoverNodes: after.nodes };
}

/** diff only the props that changed between before/hover */
function delta(m) {
  if (!m || !m.before || !m.hover || m.before.error || m.hover.error) return null;
  const out = {};
  for (const k of Object.keys(m.before)) {
    if (k.startsWith("_")) continue;
    if (m.before[k] !== m.hover[k]) out[k] = [m.before[k], m.hover[k]];
  }
  return out;
}

/* ------------------------------------------------------------------ items */

/** D3 — desktop top-nav link hover + active state */
async function d3(page) {
  const out = { pages: {} };
  for (const [label, route] of [["subpage", "/15"], ["home", "/"]]) {
    await goto(page, route);
    const disco = await page.evaluate(() => {
      const nav = document.querySelector("#w2025081162da6b4eb4a75 .viewport-nav") || document.querySelector(".viewport-nav") || document.querySelector("#doz_header nav");
      if (!nav) return { error: "no nav" };
      // top-level links only (nested .dropdown-submenu links live in .dropdown-menu)
      const links = [...nav.querySelectorAll(":scope > li > a")].filter((a) => a.offsetParent !== null);
      const info = (a) => {
        const cs = getComputedStyle(a);
        const r = a.getBoundingClientRect();
        return {
          text: (a.innerText || "").replace(/\s+/g, " ").trim().slice(0, 20),
          cls: (a.className || "").replace(/\s+/g, " ").trim().slice(0, 90),
          liCls: (a.parentElement.className || "").replace(/\s+/g, " ").trim().slice(0, 90),
          isActive: /(^|\s)active(\s|$)/.test(a.className) || /(^|\s)active(\s|$)/.test(a.parentElement.className),
          color: cs.color, fontWeight: cs.fontWeight, fontSize: cs.fontSize,
          lineHeight: cs.lineHeight, padding: cs.padding, textDecorationLine: cs.textDecorationLine,
          transition: cs.transitionProperty + " " + cs.transitionDuration + " " + cs.transitionTimingFunction,
          rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
        };
      };
      return {
        count: links.length,
        liCount: nav.querySelectorAll(":scope > li").length,
        active: links.filter((a) => /(^|\s)active(\s|$)/.test(a.className) || /(^|\s)active(\s|$)/.test(a.parentElement.className)).map(info),
        links: links.slice(0, 8).map(info),
      };
    });
    // hover the first non-active top-level link
    const target = await page.evaluate(() => {
      const nav = document.querySelector("#w2025081162da6b4eb4a75 .viewport-nav") || document.querySelector(".viewport-nav");
      if (!nav) return null;
      const ls = [...nav.querySelectorAll(":scope > li > a")].filter((a) => a.offsetParent !== null);
      const a = ls.find((x) => !/(^|\s)active(\s|$)/.test(x.className) && !/(^|\s)active(\s|$)/.test(x.parentElement.className)) || ls[1] || ls[0];
      if (!a) return null;
      a.id = a.id || "__nv_target";
      return "#" + (a.id || "__nv_target");
    });
    out.pages[label] = { route, disco, hover: target ? await hoverMeasure(page, target, null) : null };
    if (out.pages[label].hover) out.pages[label].hover.delta = delta(out.pages[label].hover);
  }
  return out;
}

/** D6 — when does the original add the reveal class on scroll */
async function d6(page) {
  const out = {};
  for (const route of ["/17", "/21"]) {
    await goto(page, route);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1200);
    const setup = await page.evaluate(() => {
      const els = [...document.querySelectorAll("[data-widget-anim]")].filter((e) => e.getAttribute("data-widget-anim") !== "none");
      if (!els.length) return { error: "no [data-widget-anim] elements" };
      // pick the first below-fold animated widget (nearest threshold) — cheaper
      // to reach than the deepest one and representative of the scroll handler.
      const vh0 = window.innerHeight;
      const withTop = els.map((e) => ({ e, top: e.getBoundingClientRect().top }));
      const below = withTop.filter((x) => x.top > vh0 + 100).sort((a, b) => a.top - b.top);
      const pick = below[0] || withTop.sort((a, b) => b.top - a.top)[0];
      const e = pick.e;
      const h = e.getBoundingClientRect().height;
      window.__rev = {
        target: e,
        trig: null,
        last: null,
        initial: { cls: e.className, opacity: getComputedStyle(e).opacity, transform: getComputedStyle(e).transform },
      };
      // rAF sampler: record the first frame the element's opacity leaves 0,
      // together with the viewport-relative top at that instant (the real
      // scroll-reveal threshold; the `animated` class is pre-set at load).
      const sample = () => {
        const cs = getComputedStyle(e);
        const r = e.getBoundingClientRect();
        const rec = { scrollY: window.scrollY, top: +r.top.toFixed(1), docTop: +(r.top + window.scrollY).toFixed(1), h: +r.height.toFixed(1), vh: window.innerHeight, opacity: +parseFloat(cs.opacity).toFixed(4), transform: cs.transform, cls: e.className };
        window.__rev.last = rec;
        if (!window.__rev.trig && rec.opacity > 0.001) window.__rev.trig = rec;
        window.__rev.raf = requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
      return {
        count: els.length,
        anim: e.getAttribute("data-widget-anim"),
        animDuration: e.getAttribute("data-widget-anim-duration"),
        animDelay: e.getAttribute("data-widget-anim-delay"),
        pickTop: +pick.top.toFixed(1),
        h: +h.toFixed(1),
        initialCls: e.className,
        initialOpacity: getComputedStyle(e).opacity,
        animatedPreSet: /(^|\s)animated(\s|$)/.test(e.className),
        docH: document.documentElement.scrollHeight,
      };
    });
    if (setup.error) { out[route] = { setup }; continue; }
    // fine stationary scan across the viewport boundary: start with the element
    // still below the fold, then step 10px and pause so any reveal delay elapses
    // before reading the stable viewport-relative top.
    const vh = await page.evaluate(() => window.innerHeight);
    const startY = Math.max(0, Math.round(setup.pickTop - vh - 150));
    await page.evaluate((v) => window.scrollTo(0, v), startY);
    await page.waitForTimeout(900);
    const trace = [];
    let prevTop = null;
    for (let y = startY; y <= setup.pickTop + 60; y += 10) {
      await page.evaluate((v) => window.scrollTo(0, v), y);
      await page.waitForTimeout(320);
      const snap = await page.evaluate(() => {
        const el = window.__rev.target;
        return { trig: window.__rev.trig, top: el ? +el.getBoundingClientRect().top.toFixed(1) : null, op: el ? +parseFloat(getComputedStyle(el).opacity).toFixed(4) : null };
      });
      trace.push({ y, top: snap.top, op: snap.op, prevTop });
      if (snap.trig) break;
      prevTop = snap.top;
    }
    const final = await page.evaluate(() => {
      if (window.__rev.raf) cancelAnimationFrame(window.__rev.raf);
      return { trig: window.__rev.trig, initial: window.__rev.initial };
    });
    const t = final.trig;
    out[route] = {
      setup,
      trigger: t,
      measured: t
        ? {
            topAtTrigger: t.top,
            docTopAtTrigger: t.docTop,
            docTopShift: setup.pickTop != null && t.docTop != null ? +(t.docTop - setup.pickTop).toFixed(1) : null,
            vh: t.vh,
            offsetFromViewportBottom: +(t.vh - t.top).toFixed(1),
            topAsViewportFraction: +(t.top / t.vh).toFixed(3),
            visibleFractionAtTrigger: t.h > 0 ? +Math.max(0, Math.min(1, (t.vh - t.top) / t.h)).toFixed(3) : null,
            opacityAtTrigger: t.opacity,
            animatedPreSet: setup.animatedPreSet,
          }
        : null,
      traceTail: trace.slice(-6),
    };
  }
  return out;
}

/** D9 — hero scrim opacity + widget show_over layers */
async function d9(page) {
  await goto(page, "/");
  const hero = await page.evaluate(() => {
    const vis = document.querySelector(".visual_section") || document.querySelector("section.visual_section");
    if (!vis) return { error: "no .visual_section" };
    const out = [];
    for (const el of vis.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      const bg = cs.backgroundColor;
      const isPaint = cs.backgroundImage !== "none" || /rgba?\([^)]*\)/.test(bg) && !/rgba\(0, 0, 0, 0\)/.test(bg);
      const cls = typeof el.className === "string" ? el.className : "";
      if (!isPaint && !/\bop\b|overlay|section_bg_color/.test(cls)) continue;
      const r = el.getBoundingClientRect();
      out.push({
        tag: el.tagName.toLowerCase(), cls: cls.replace(/\s+/g, " ").trim().slice(0, 110),
        bg, opacity: cs.opacity, backgroundImage: cs.backgroundImage === "none" ? "none" : cs.backgroundImage.slice(0, 90),
        mixBlendMode: cs.mixBlendMode, position: cs.position, zIndex: cs.zIndex,
        rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
      });
    }
    return { count: out.length, layers: out };
  });

  // show_over lives on a desktop grid gallery (/17 has `grid_01 ... hover_show_overlay`)
  await goto(page, "/17");
  await page.evaluate(() => {
    const g = document.querySelector(".hover_show_overlay") || document.querySelector(".gallery2");
    if (g) g.scrollIntoView({ block: "center" });
  });
  await page.waitForTimeout(1500);
  const showOver = await page.evaluate(() => {
    const gal = document.querySelector(".hover_show_overlay") || document.querySelector(".gallery2");
    if (!gal) return { error: "no hover_show_overlay gallery on /17" };
    const items = [...gal.querySelectorAll(".item_gallary")].filter((e) => e.getBoundingClientRect().width > 0);
    const info = (el) => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(), cls: (typeof el.className === "string" ? el.className : "").replace(/\s+/g, " ").trim().slice(0, 120),
        bg: cs.backgroundColor, backgroundImage: cs.backgroundImage === "none" ? "none" : cs.backgroundImage.slice(0, 70),
        opacity: cs.opacity, visibility: cs.visibility,
        transition: cs.transitionProperty + " " + cs.transitionDuration + " " + cs.transitionTimingFunction,
        rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
      };
    };
    const first = items[0];
    return {
      galleryCls: gal.className,
      itemCount: items.length,
      item: info(first),
      overlay: info(first && first.querySelector(".slide_overlay")),
      textWrap: info(first && first.querySelector(".text_wrap")),
      title: info(first && first.querySelector(".title")),
      titleBefore: first && first.querySelector(".title")
        ? getComputedStyle(first.querySelector(".title"), "::before").content
        : null,
    };
  });
  // hover the first visible grid item and read overlay + text_wrap deltas
  let galleryHover = null;
  const itemSel = await page.evaluate(() => {
    const gal = document.querySelector(".hover_show_overlay") || document.querySelector(".gallery2");
    const it = gal && [...gal.querySelectorAll(".item_gallary")].find((e) => e.getBoundingClientRect().width > 0);
    if (!it) return null;
    it.id = it.id || "__gal_item";
    return "#__gal_item";
  });
  if (itemSel) {
    galleryHover = {
      overlay: await hoverMeasure(page, itemSel, ".slide_overlay", ["opacity", "visibility", "backgroundColor", "backgroundImage", "transform", "transitionProperty", "transitionDuration"]),
      textWrap: await hoverMeasure(page, itemSel, ".text_wrap", ["opacity", "visibility", "transform", "backgroundColor", "backgroundImage", "transitionProperty", "transitionDuration"]),
      title: await hoverMeasure(page, itemSel, ".title", ["color", "opacity", "fontWeight", "textDecorationLine", "fontSize", "visibility"]),
      item: await hoverMeasure(page, itemSel, null, ["transform", "boxShadow", "borderTopColor", "opacity"]),
    };
    for (const k of Object.keys(galleryHover)) galleryHover[k].delta = delta(galleryHover[k]);
  }
  return { hero, showOver, galleryHover };
}

/** D11 — board/product card title hover */
async function d11(page) {
  const out = {};

  const discoverCard = (id) =>
    page.evaluate((cardId) => {
      const card = document.querySelector(".type_grid .card") || document.querySelector(".card._card") || document.querySelector(".card");
      if (!card) return { error: "no .card" };
      card.id = card.id || cardId;
      const grid = card.closest(".type_grid");
      const link = card.querySelector("a.post_link_wrap") || card.querySelector("a");
      return {
        cardSel: "#" + card.id,
        gridCls: grid ? (grid.className || "").replace(/\s+/g, " ").trim().slice(0, 130) : null,
        cardCls: (card.className || "").replace(/\s+/g, " ").trim().slice(0, 130),
        linkCls: link ? (link.className || "").replace(/\s+/g, " ").trim().slice(0, 130) : null,
        text: (card.innerText || "").replace(/\s+/g, " ").trim().slice(0, 90),
      };
    }, id);

  // board grid (news /29)
  await goto(page, "/29");
  const boardDisco = await discoverCard("__card29");
  out.board = { disco: boardDisco };
  if (boardDisco.cardSel) {
    out.board.hover = await hoverCardSnapshot(page, boardDisco.cardSel);
    const titleSel = await page.evaluate(() => {
      const el = [...document.querySelectorAll(".type_grid .card *")].find(
        (e) => /title|summary|body/.test(e.className || "") && (e.innerText || "").trim(),
      );
      if (!el) return null;
      el.id = el.id || "__card29title";
      return "#" + (el.id || "__card29title");
    });
    if (titleSel) {
      const m = await hoverMeasure(page, boardDisco.cardSel, titleSel, ["color", "textDecorationLine", "opacity", "fontWeight"]);
      m.delta = delta(m);
      out.board.titleHover = m;
    }
  }

  // product card /32
  await goto(page, "/32");
  const prodDisco = await discoverCard("__card32");
  out.product = { disco: prodDisco };
  if (prodDisco.cardSel) out.product.hover = await hoverCardSnapshot(page, prodDisco.cardSel);

  // notices /27 (local BoardLineList) — first non-notice row link
  await goto(page, "/27");
  const noticeDisco = await page.evaluate(() => {
    const card = document.querySelector(".type_grid .card") || document.querySelector(".card._card");
    let root = card;
    if (!root) {
      const foot = document.querySelector("[class*=li_footer]");
      const list = foot ? foot.parentElement : null;
      if (list) root = [...list.querySelectorAll("li")].find((li) => li.offsetParent !== null && li.querySelector("a"));
    }
    if (!root) root = [...document.querySelectorAll("a")].find((a) => a.offsetParent !== null && /\/27/.test(a.getAttribute("href") || ""));
    if (!root) return { error: "no /27 row" };
    root.id = root.id || "__row27";
    // a column/title element for the title-hover question
    const title = [...root.querySelectorAll("h3,h4,span,div,a")].find((e) => (e.innerText || "").trim().length > 4 && e.children.length === 0);
    if (title) title.id = title.id || "__row27title";
    return {
      cardSel: "#" + root.id,
      titleSel: title ? "#" + title.id : null,
      isCard: !!card,
      cls: (root.className || "").replace(/\s+/g, " ").trim().slice(0, 130),
      text: (root.innerText || "").replace(/\s+/g, " ").trim().slice(0, 90),
    };
  });
  out.notices = { disco: noticeDisco };
  if (noticeDisco.cardSel) out.notices.hover = await hoverCardSnapshot(page, noticeDisco.cardSel, null);
  return out;
}

/** D13 — owl gallery slide: structure, pager, counter, nav behavior */
async function d13(page) {
  const out = {};
  for (const route of ["/17", "/21"]) {
    await goto(page, route);
    const disco = await page.evaluate(() => {
      const roots = [...document.querySelectorAll(".owl-carousel")].filter((e) => !/visual_area/.test(e.className));
      return roots.map((root) => {
        const cls = (typeof root.className === "string" ? root.className : "").replace(/\s+/g, " ").trim();
        const r = root.getBoundingClientRect();
        const dots = root.querySelector(".owl-dots");
        const nav = root.querySelector(".owl-nav");
        const items = [...root.querySelectorAll(".owl-item, .item_gallary, ._item")];
        const visible = items.filter((e) => e.getBoundingClientRect().width > 0);
        const dotList = dots ? [...dots.querySelectorAll(".owl-dot")].map((d, i) => {
          const sp = d.querySelector("span") || d;
          const dr = d.getBoundingClientRect();
          return {
            i,
            cls: (typeof d.className === "string" ? d.className : "").replace(/\s+/g, " ").trim().slice(0, 40),
            text: (d.innerText || "").trim(),
            before: getComputedStyle(sp, "::before").content,
            rect: { x: +dr.x.toFixed(1), y: +dr.y.toFixed(1), w: +dr.width.toFixed(1), h: +dr.height.toFixed(1) },
          };
        }) : [];
        const counters = [...root.querySelectorAll("*")]
          .filter((e) => e.children.length === 0)
          .map((e) => (e.textContent || "").replace(/\s+/g, " ").trim())
          .filter((t) => /^\d+\s*\/\s*\d+$/.test(t));
        return {
          id: root.id, cls,
          pagingType: (cls.match(/paging_type_\w+/) || [])[0] || null,
          rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
          paddingBottom: getComputedStyle(root).paddingBottom,
          itemCount: items.length,
          visibleItems: visible.length,
          itemWidth: visible[0] ? +visible[0].getBoundingClientRect().width.toFixed(1) : null,
          hasDots: !!dots,
          dotCount: dotList.length,
          dots: dotList.slice(0, 10),
          hasNav: !!nav,
          navHtml: nav ? nav.outerHTML.replace(/\s+/g, " ").slice(0, 260) : null,
          counters,
          outerText: (root.innerText || "").replace(/\s+/g, " ").trim().slice(0, 120),
        };
      });
    });
    // simulate next on the first gallery whose owl-next is actually visible
    // (index-based: owl re-attaches slides and drops ids on transition)
    const navInfo = await page.evaluate(() => {
      const roots = [...document.querySelectorAll(".owl-carousel")].filter((e) => !/visual_area/.test(e.className));
      const index = roots.findIndex((e) => {
        const n = e.querySelector(".owl-nav .owl-next");
        return n && n.getBoundingClientRect().width > 0;
      });
      if (index < 0) return null;
      const root = roots[index];
      root.scrollIntoView({ block: "center" });
      const dots = root.querySelector(".owl-dots");
      return {
        index,
        id: root.id,
        cls: (root.className || "").replace(/\s+/g, " ").trim().slice(0, 130),
        activeBefore: [...root.querySelectorAll(".owl-item")].findIndex((e) => e.classList.contains("active")),
        dotBefore: dots ? [...dots.querySelectorAll(".owl-dot")].findIndex((d) => d.classList.contains("active")) : null,
      };
    });
    let nextBehavior = null;
    if (navInfo) {
      try {
        await page.waitForTimeout(900);
        await page.evaluate((i) => {
          const roots = [...document.querySelectorAll(".owl-carousel")].filter((e) => !/visual_area/.test(e.className));
          const r = roots[i];
          const n = r && r.querySelector(".owl-nav .owl-next");
          if (n) n.click();
        }, navInfo.index);
        await page.waitForTimeout(1100);
        const after = await page.evaluate((i) => {
          const roots = [...document.querySelectorAll(".owl-carousel")].filter((e) => !/visual_area/.test(e.className));
          const r = roots[i];
          if (!r) return { error: "root lost after click" };
          const items = [...r.querySelectorAll(".owl-item")];
          const dots = r.querySelector(".owl-dots");
          const counter = [...r.querySelectorAll("*")].filter((e) => e.children.length === 0).map((e) => (e.textContent || "").trim()).find((t) => /^\d+\s*\/\s*\d+$/.test(t)) || null;
          const stage = r.querySelector(".owl-stage");
          return {
            activeAfter: items.findIndex((e) => e.classList.contains("active")),
            activeDot: dots ? [...dots.querySelectorAll(".owl-dot")].findIndex((d) => d.classList.contains("active")) : null,
            counter,
            stageTransform: stage ? getComputedStyle(stage).transform : null,
          };
        }, navInfo.index);
        nextBehavior = { ...navInfo, after };
      } catch (e) {
        nextBehavior = { ...navInfo, error: String((e && e.message) || e).split("\n")[0].slice(0, 140) };
      }
    }
    out[route] = { disco, nav: navInfo, nextBehavior };
  }
  return out;
}

/** D14 — button widget hover */
async function d14(page) {
  await goto(page, "/");
  const disco = await page.evaluate(() => {
    const cands = ["[data-widget-type='button'] a", ".btn", ".btn-default", ".btn_ea4e6bf7346e7", ".btn_82610ee2a0658", "button"];
    return cands.map((c) => ({ sel: c, count: [...document.querySelectorAll(c)].filter((e) => e.offsetParent !== null).length })).filter((x) => x.count);
  });
  const out = { disco, samples: [] };
  for (const sel of ["[data-widget-type='button'] a", ".btn-default", ".btn"]) {
    const m = await hoverMeasure(page, sel, null);
    if (!m.before || m.before.error) { out.samples.push({ sel, note: m.before ? m.before.error : "none" }); continue; }
    m.delta = delta(m);
    out.samples.push({ sel, before: m.before, hover: m.hover, delta: m.delta });
  }
  return out;
}

/** D15 — footer sitemap link hover */
async function d15(page) {
  await goto(page, "/");
  const disco = await page.evaluate(() => {
    // the original footer is not a <footer>/[data-footer]; it is the black band
    // with the most links near the page bottom
    let best = null, bestN = 0, bestBg = null;
    for (const e of document.querySelectorAll("div, section, footer")) {
      const cs = getComputedStyle(e);
      const n = e.querySelectorAll("a").length;
      if (n === 0) continue;
      if (/rgb\(0, 0, 0\)/.test(cs.backgroundColor) && n > bestN) { bestN = n; best = e; bestBg = cs.backgroundColor; }
    }
    if (!best) {
      const f = document.querySelector("footer");
      if (f) { best = f; bestN = f.querySelectorAll("a").length; bestBg = getComputedStyle(f).backgroundColor; }
    }
    if (!best) return { error: "no footer-ish element" };
    best.id = best.id || "__ft_root";
    const links = [...best.querySelectorAll("a")].filter((a) => a.offsetParent !== null && (a.innerText || "").trim());
    links.slice(0, 12).forEach((a, i) => { if (!a.id) a.id = "__ft_link_" + i; });
    // pick a sitemap-column link (short label, deep in the grid) as well as the first link
    const info = (a) => {
      const cs = getComputedStyle(a);
      return {
        text: (a.innerText || "").replace(/\s+/g, " ").trim().slice(0, 26),
        cls: (a.className || "").replace(/\s+/g, " ").trim().slice(0, 100),
        color: cs.color, opacity: cs.opacity, td: cs.textDecorationLine, fw: cs.fontWeight, fs: cs.fontSize,
        transition: cs.transitionProperty + " " + cs.transitionDuration + " " + cs.transitionTimingFunction,
      };
    };
    return {
      root: "#" + best.id, rootTag: best.tagName.toLowerCase(),
      rootCls: (best.className || "").replace(/\s+/g, " ").trim().slice(0, 100), rootBg: bestBg,
      count: links.length, sample: links.slice(0, 10).map(info),
      firstLinkSel: links[0] ? "#" + links[0].id : null,
      allLinkSelectors: links.slice(0, 10).map((a) => "#" + a.id),
    };
  });
  const out = { disco };
  if (disco.firstLinkSel) {
    const m = await hoverMeasure(page, disco.firstLinkSel, null);
    m.delta = delta(m);
    out.hover = m;
  }
  // try one more link (a sitemap sub-link deeper in the footer) if the first shows no change
  if (disco.allLinkSelectors && disco.allLinkSelectors.length > 1 && (!out.hover || !out.hover.delta || !Object.keys(out.hover.delta).length)) {
    const m2 = await hoverMeasure(page, disco.allLinkSelectors[disco.allLinkSelectors.length - 1], null);
    m2.delta = delta(m2);
    out.hover2 = m2;
  }
  return out;
}

/** D17 — featured/board card default vs hover (pre-hover state, overlay reveal, zoom) */
async function d17(page) {
  await goto(page, "/");
  const disco = await page.evaluate(() => {
    // home featured cards: the news ticker cards (links to /29/<idx>), imweb `holder`
    const links = [...document.querySelectorAll("a.holder, a[href*='/29/']")].filter((a) => a.offsetParent !== null);
    if (!links.length) return { error: "no home card links" };
    const card = links[0];
    card.id = card.id || "__d17_card";
    const info = (a) => {
      const r = a.getBoundingClientRect();
      return {
        cls: (a.className || "").replace(/\s+/g, " ").trim().slice(0, 120),
        parentCls: (a.parentElement.className || "").replace(/\s+/g, " ").trim().slice(0, 120),
        text: (a.innerText || "").replace(/\s+/g, " ").trim().slice(0, 60),
        rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
      };
    };
    return { cardSel: "#__d17_card", count: links.length, cards: links.slice(0, 4).map(info) };
  });
  const out = { disco };
  if (disco.cardSel) out.hover = await hoverCardSnapshot(page, disco.cardSel, null);
  return out;
}

const RUNNERS = { D3: d3, D6: d6, D9: d9, D11: d11, D13: d13, D14: d14, D15: d15, D17: d17 };

/* ------------------------------------------------------------------ main */

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const ctx = await browser.newContext({
    viewport: { width: VP.width, height: VP.height },
    deviceScaleFactor: 1,
    colorScheme: "light",
  });
  const page = await ctx.newPage();
  const all = {};
  const t0 = Date.now();
  for (const item of ITEMS) {
    const start = Date.now();
    try {
      const data = await RUNNERS[item](page);
      data._item = item;
      data._durationMs = Date.now() - start;
      all[item] = data;
      const file = path.join(OUT, `orig-${item}.json`);
      await fs.writeFile(file, JSON.stringify(data, null, 2));
      console.log(`[${item}] ok ${((Date.now() - start) / 1000).toFixed(1)}s -> ${path.basename(file)}`);
    } catch (e) {
      const msg = String((e && e.message) || e).split("\n")[0];
      all[item] = { _item: item, error: msg };
      await fs.writeFile(path.join(OUT, `orig-${item}.json`), JSON.stringify(all[item], null, 2));
      console.error(`[${item}] FAIL ${msg}`);
    }
  }
  await fs.writeFile(path.join(OUT, "orig-all.json"), JSON.stringify(all, null, 2));

  /* compact console summary */
  console.log("\n================ SUMMARY ================");
  const p = (o) => JSON.stringify(o);
  if (all.D3) {
    for (const [k, v] of Object.entries(all.D3.pages || {})) {
      const na = (v.disco.links || []).find((l) => !l.isActive) || {};
      console.log(`D3[${k}] navLinks=${v.disco.count} active=${v.disco.active && v.disco.active[0] ? v.disco.active[0].color + "/" + v.disco.active[0].fontWeight : "none"} navDefault=${na.color || "?"}/${na.fontWeight || "?"} hoverDelta=${v.hover ? p(v.hover.delta) : "?"}`);
    }
  }
  if (all.D6) {
    for (const [k, v] of Object.entries(all.D6)) {
      if (!k.startsWith("/")) continue;
      console.log(`D6[${k}] ${v.setup && v.setup.error ? v.setup.error : "anim=" + v.setup.anim + " pickTop=" + v.setup.pickTop + " preset=" + v.setup.animatedPreSet + " trigger=" + (v.measured ? p(v.measured) : "none")}`);
    }
  }
  if (all.D9) {
    const layers = (all.D9.hero && all.D9.hero.layers) || [];
    const scr = layers.filter((l) => /rgba?\(0, 0, 0, 0\.[0-9]/.test(l.bg) || /\bop\b/.test(l.cls));
    console.log(`D9 heroLayers=${layers.length} scrimCandidates=${p(scr.slice(0, 4).map((l) => ({ cls: l.cls, bg: l.bg, opacity: l.opacity })))}`);
    const so = all.D9.showOver || {};
    console.log(`D9 showOver gallery=${JSON.stringify(so.galleryCls)} items=${so.itemCount} textWrapDefault=${so.textWrap ? so.textWrap.opacity + "/" + so.textWrap.visibility : "?"} overlayDefault=${so.overlay ? so.overlay.opacity + "/" + so.overlay.visibility : "?"}`);
    console.log(`D9 galleryHover overlayDelta=${p(all.D9.galleryHover && all.D9.galleryHover.overlay && all.D9.galleryHover.overlay.delta)} textWrapDelta=${p(all.D9.galleryHover && all.D9.galleryHover.textWrap && all.D9.galleryHover.textWrap.delta)} titleDelta=${p(all.D9.galleryHover && all.D9.galleryHover.title && all.D9.galleryHover.title.delta)} itemDelta=${p(all.D9.galleryHover && all.D9.galleryHover.item && all.D9.galleryHover.item.delta)}`);
  }
  if (all.D11) {
    const bh = all.D11.board && all.D11.board.hover;
    const ph = all.D11.product && all.D11.product.hover;
    console.log(`D11 board grid=${p(all.D11.board && all.D11.board.disco && all.D11.board.disco.gridCls)} isHover=${bh && bh.isHover} changed=${p(bh && bh.changed)}`);
    console.log(`D11 product grid=${p(all.D11.product && all.D11.product.disco && all.D11.product.disco.gridCls)} isHover=${ph && ph.isHover} changed=${p(ph && ph.changed)}`);
    const nh = all.D11.notices && all.D11.notices.hover;
    console.log(`D11 notices row=${p(all.D11.notices && all.D11.notices.disco && all.D11.notices.disco.cls)} isCard=${all.D11.notices && all.D11.notices.disco && all.D11.notices.disco.isCard} isHover=${nh && nh.isHover} changed=${p(nh && nh.changed)}`);
  }
  if (all.D13) {
    for (const [k, v] of Object.entries(all.D13)) {
      if (!k.startsWith("/")) continue;
      const g = (v.disco || []).map((x) => `${x.id || "?"}: items=${x.itemCount} dots=${x.dotCount} nav=${x.hasNav} counter=${p(x.counters)} paging=${x.pagingType}`);
      console.log(`D13[${k}] ${g.join(" | ") || "none"} next=${p(v.nextBehavior)}`);
    }
  }
  if (all.D14) {
    for (const s of all.D14.samples) console.log(`D14 ${s.sel} delta=${p(s.delta)} note=${s.note || ""}`);
  }
  if (all.D15) {
    console.log(`D15 footer=${p(all.D15.disco.rootTag)} cls=${p(all.D15.disco.rootCls)} bg=${p(all.D15.disco.rootBg)} links=${all.D15.disco.count} hoverDelta=${all.D15.hover ? p(all.D15.hover.delta) : "?"} hover2Delta=${all.D15.hover2 ? p(all.D15.hover2.delta) : "-"}`);
    console.log(`D15 sample=${p((all.D15.disco.sample || []).slice(0, 3))}`);
  }
  if (all.D17) {
    const h = all.D17.hover;
    console.log(`D17 cards=${all.D17.disco.count} isHover=${h && h.isHover} changed=${p(h && h.changed)}`);
    console.log(`D17 defaultNodes=${p((h && h.defaultNodes || []).slice(0, 8).map((n) => ({ cls: n.cls, disp: n.disp, op: n.op, bg: n.bg, color: n.color })))}`);
  }
  console.log(`\ntotal ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await browser.close();
}

main().catch((e) => {
  console.error(String((e && e.message) || e).split("\n")[0]);
  process.exit(1);
});
