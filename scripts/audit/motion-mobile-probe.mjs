/**
 * Mobile MOTION/EFFECT probe — 390x844 investigation of the original site's
 * mobile interactions, mirroring the desktop D-item probe (hover-probe.mjs).
 *
 * Covered modules (--only=drawer,reveal,gallery,card):
 *   drawer   mobile slide-menu open/close animation: JS-driven transform trace,
 *            duration, close-button opacity, computed transition of the pane.
 *   reveal   scroll-reveal threshold of [data-widget-anim] widgets: first frame
 *            opacity leaves 0, viewport-relative top at trigger.
 *   gallery  owl-carousel pager: dot count/geometry, active index before/after
 *            `.owl-next` click, stage transform delta, visible item width.
 *   card     card/gallery-item default vs hover vs tapped state (overlay /
 *            caption / title / thumb computed styles and deltas).
 *
 * Usage:
 *   node scripts/audit/motion-mobile-probe.mjs [--side=orig|local] [--base=...] [--only=drawer,reveal,gallery,card]
 *
 * Examples:
 *   node scripts/audit/motion-mobile-probe.mjs                 # original, all modules
 *   node scripts/audit/motion-mobile-probe.mjs --only=drawer   # original, drawer only
 *   node scripts/audit/motion-mobile-probe.mjs --side=local    # rebuild (default localhost:4517)
 *
 * READ-ONLY: talks to the target site only; writes JSON under
 * design/audit/motion-probe/. Viewport fixed at 390x844 (VIEWPORTS.mobile),
 * deviceScaleFactor 1, colourScheme light, reducedMotion left at
 * "no-preference" so the real reveal/animation timing is observable.
 *
 * NOTE: this file is intentionally NOT named mobile-*.mjs — scripts/audit/mobile-*.mjs
 * is owned by another lane.
 */
import { chromium } from "playwright-core";
import fs from "node:fs/promises";
import path from "node:path";
import { PAGES, VIEWPORTS, ORIG_BASE, DEFAULT_LOCAL_BASE } from "./pages.mjs";

const args = process.argv.slice(2);
const getArg = (name, dflt) => {
  const a = args.find((x) => x.startsWith("--" + name + "="));
  return a ? a.split("=").slice(1).join("=") : dflt;
};

const SIDE = getArg("side", "orig");
if (!["orig", "local"].includes(SIDE)) {
  console.error("usage: node scripts/audit/motion-mobile-probe.mjs [--side=orig|local] [--base=...] [--only=...]");
  process.exit(1);
}
const BASE = (SIDE === "orig" ? ORIG_BASE : getArg("base", DEFAULT_LOCAL_BASE)).replace(/\/$/, "");
const VP = VIEWPORTS.mobile;
const ALL_MODULES = ["drawer", "reveal", "gallery", "card"];
const MODULES = getArg("only", "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const RUN = MODULES.length ? ALL_MODULES.filter((m) => MODULES.includes(m)) : ALL_MODULES;
if (!RUN.length) {
  console.error(`unknown --only modules; expected one of ${ALL_MODULES.join(",")}`);
  process.exit(1);
}
const OUT = path.resolve("design/audit/motion-probe");

const HIDE_DEV_STYLE =
  "nextjs-portal, [data-nextjs-toast], [data-nextjs-dialog], [data-nextjs-dev-tools-button] { display: none !important; }";

const PAGE = (key) => PAGES.find((p) => p.key === key);
const routeOf = (key) => {
  const p = PAGE(key);
  if (!p) throw new Error(`unknown page key ${key}`);
  return SIDE === "orig" ? p.orig : p.local;
};

/* ------------------------------------------------------------------ helpers */

async function goto(page, key) {
  const url = BASE + routeOf(key);
  await page.goto(url, { waitUntil: "load", timeout: 45000 });
  await page.waitForTimeout(1500);
  await page.addStyleTag({ content: HIDE_DEV_STYLE }).catch(() => {});
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await page.waitForTimeout(300);
  return url;
}

const txOf = (tr) => {
  if (!tr || tr === "none") return 0;
  const m = /matrix\(([^)]+)\)/.exec(tr);
  if (m) return +parseFloat(m[1].split(",")[4]).toFixed(3);
  const m3 = /matrix3d\(([^)]+)\)/.exec(tr);
  if (m3) return +parseFloat(m3[1].split(",")[12]).toFixed(3);
  return null;
};

/** summarize a transform trace: where it starts/ends and how long it animates */
function transformStats(frames, field = "transform") {
  const vals = frames.map((f) => ({ t: f.t, tx: txOf(f[field]) }));
  if (!vals.length) return { frames: 0 };
  let startT = null;
  let endT = null;
  let prev = vals[0].tx;
  const steps = [];
  for (const v of vals) {
    if (v.tx !== prev) {
      if (startT === null) startT = v.t;
      endT = v.t;
      steps.push({ t: v.t, tx: v.tx });
      prev = v.tx;
    }
  }
  return {
    frames: vals.length,
    startTx: vals[0].tx,
    endTx: prev,
    firstChangeMs: startT,
    lastChangeMs: endT,
    durationMs: startT != null && endT != null ? endT - startT : null,
    steps: steps.slice(0, 16),
  };
}

async function installTrace(page, sel, extraSel) {
  await page.evaluate(
    ({ sel, extraSel }) => {
      const d = document.querySelector(sel);
      window.__traceInfo = { sel, found: !!d };
      if (!d) return;
      const c = extraSel ? document.querySelector(extraSel) : null;
      window.__tr = { frames: [], t0: performance.now() };
      const loop = () => {
        const ds = getComputedStyle(d);
        const r = d.getBoundingClientRect();
        window.__tr.frames.push({
          t: Math.round(performance.now() - window.__tr.t0),
          transform: ds.transform,
          left: ds.left,
          right: ds.right,
          opacity: ds.opacity,
          visibility: ds.visibility,
          x: Math.round(r.x),
          extraOpacity: c ? getComputedStyle(c).opacity : null,
          extraLeft: c ? getComputedStyle(c).left : null,
        });
        window.__tr.raf = requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    },
    { sel, extraSel },
  );
}

async function stopTrace(page) {
  return page.evaluate(() => {
    if (window.__tr && window.__tr.raf) cancelAnimationFrame(window.__tr.raf);
    return { info: window.__traceInfo, frames: window.__tr ? window.__tr.frames : [] };
  });
}

/* ------------------------------------------------------------------- drawer */

async function moduleDrawer(page) {
  const out = { url: null, pageKey: "home", menu: null, drawer: null, close: null, open: null, closeAction: null };
  try {
    out.url = await goto(page, "home");

    const disco = await page.evaluate(() => {
      const norm = (s, n) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, n);
      const menuCands = [
        ".icon_type_menu a",
        "a._no_hover.fixed_transform.inline-blocked",
        ".icon_type_menu",
        ".btn_menu a",
        "a[class*=menu_btn]",
        "button[class*=menu]",
      ];
      let menu = null;
      let menuSel = null;
      for (const c of menuCands) {
        const e = document.querySelector(c);
        if (e && e.getBoundingClientRect().width > 0) {
          e.id = e.id || "__mm_menu";
          menu = e;
          menuSel = "#" + e.id;
          break;
        }
      }
      const drawer = document.querySelector("#mobile_slide_menu") || document.querySelector(".mobile_slide_menu");
      const close = document.querySelector(".slide-close, .navbar-toggle.close");
      const box = (e) => {
        if (!e) return null;
        const r = e.getBoundingClientRect();
        const cs = getComputedStyle(e);
        return {
          tag: e.tagName.toLowerCase(),
          cls: norm(typeof e.className === "string" ? e.className : "", 120),
          rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
          display: cs.display,
          visibility: cs.visibility,
          opacity: cs.opacity,
          position: cs.position,
          left: cs.left,
          right: cs.right,
          transform: cs.transform,
          transition: cs.transitionProperty + " " + cs.transitionDuration + " " + cs.transitionTimingFunction + " " + cs.transitionDelay,
          zIndex: cs.zIndex,
        };
      };
      return {
        menuSel,
        menu: box(menu),
        drawerSel: drawer ? "#" + (drawer.id || (drawer.id = "__mm_drawer")) : null,
        drawer: box(drawer),
        closeSel: ".slide-close",
        close: box(close),
      };
    });
    out.menu = disco.menu;
    out.drawer = { sel: disco.drawerSel, closed: disco.drawer };
    out.close = { sel: ".slide-close", closed: disco.close };

    const drawerSel = disco.drawerSel || "#mobile_slide_menu";
    const closeSel = ".slide-close";

    /* --- open --- */
    await installTrace(page, drawerSel, closeSel);
    const menuBox = await page.evaluate((s) => {
      const e = document.querySelector(s);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, disco.menuSel || ".icon_type_menu");
    if (menuBox) {
      await page.mouse.click(menuBox.x, menuBox.y);
      await page.waitForTimeout(1400);
    }
    let tr = await stopTrace(page);
    out.open = {
      click: menuBox,
      traceInfo: tr.info,
      stats: transformStats(tr.frames),
      framesSampled: tr.frames.length,
      final: tr.frames[tr.frames.length - 1] || null,
      firstFrames: tr.frames.slice(0, 6),
    };

    /* --- close --- */
    const closeBox = await page.evaluate((s) => {
      const e = document.querySelector(s);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, opacity: cs.opacity, onScreen: r.x > -1000 };
    }, closeSel);
    await installTrace(page, drawerSel, closeSel);
    if (closeBox && closeBox.onScreen) {
      await page.mouse.click(closeBox.x, closeBox.y);
      await page.waitForTimeout(1400);
    } else {
      // programmatic close fallback (element hidden off-screen)
      await page.evaluate((s) => {
        const e = document.querySelector(s);
        if (e) e.click();
      }, closeSel);
      await page.waitForTimeout(1400);
    }
    tr = await stopTrace(page);
    out.closeAction = {
      click: closeBox,
      stats: transformStats(tr.frames),
      framesSampled: tr.frames.length,
      final: tr.frames[tr.frames.length - 1] || null,
    };
  } catch (e) {
    out.error = String((e && e.message) || e).split("\n")[0];
  }
  return out;
}

/* ------------------------------------------------------------------- reveal */

async function moduleReveal(page) {
  const out = { routes: {} };
  for (const key of ["rnd", "home"]) {
    const rec = { pageKey: key };
    try {
      rec.url = await goto(page, key);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(900);
      const setup = await page.evaluate(() => {
        const els = [...document.querySelectorAll("[data-widget-anim]")].filter(
          (e) => e.getAttribute("data-widget-anim") && e.getAttribute("data-widget-anim") !== "none",
        );
        if (!els.length) return { error: "no animated [data-widget-anim] elements" };
        const vh0 = window.innerHeight;
        const withTop = els.map((e) => ({ e, top: e.getBoundingClientRect().top }));
        const below = withTop.filter((x) => x.top > vh0 + 60).sort((a, b) => a.top - b.top);
        const pick = below[0] || withTop.sort((a, b) => b.top - a.top)[0];
        const e = pick.e;
        window.__rev = { target: e, trig: null, initial: { opacity: getComputedStyle(e).opacity, transform: getComputedStyle(e).transform, cls: e.className } };
        const sample = () => {
          const cs = getComputedStyle(e);
          const r = e.getBoundingClientRect();
          const recF = { scrollY: window.scrollY, top: +r.top.toFixed(1), docTop: +(r.top + window.scrollY).toFixed(1), h: +r.height.toFixed(1), vh: window.innerHeight, opacity: +parseFloat(cs.opacity).toFixed(4) };
          if (!window.__rev.trig && recF.opacity > 0.001) window.__rev.trig = recF;
          window.__rev.raf = requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
        return {
          count: els.length,
          anim: e.getAttribute("data-widget-anim"),
          animDuration: e.getAttribute("data-widget-anim-duration"),
          animDelay: e.getAttribute("data-widget-anim-delay"),
          pickTop: +pick.top.toFixed(1),
          h: +e.getBoundingClientRect().height.toFixed(1),
          initialOpacity: getComputedStyle(e).opacity,
          animatedPreSet: /(^|\s)animated(\s|$)/.test(e.className),
        };
      });
      if (setup.error) {
        rec.setup = setup;
        out.routes[key] = rec;
        continue;
      }
      const vh = await page.evaluate(() => window.innerHeight);
      const startY = Math.max(0, Math.round(setup.pickTop - vh - 120));
      await page.evaluate((y) => window.scrollTo(0, y), startY);
      await page.waitForTimeout(700);
      const trace = [];
      for (let y = startY; y <= setup.pickTop + 40; y += 10) {
        await page.evaluate((v) => window.scrollTo(0, v), y);
        await page.waitForTimeout(260);
        const snap = await page.evaluate(() => ({
          top: +window.__rev.target.getBoundingClientRect().top.toFixed(1),
          op: +parseFloat(getComputedStyle(window.__rev.target).opacity).toFixed(4),
          trig: window.__rev.trig,
        }));
        trace.push({ y, top: snap.top, op: snap.op });
        if (snap.trig) break;
      }
      const final = await page.evaluate(() => {
        if (window.__rev.raf) cancelAnimationFrame(window.__rev.raf);
        return { trig: window.__rev.trig, initial: window.__rev.initial };
      });
      const t = final.trig;
      rec.setup = setup;
      rec.trigger = t;
      rec.measured = t
        ? {
            topAtTrigger: t.top,
            docTopAtTrigger: t.docTop,
            vh: t.vh,
            offsetFromViewportBottom: +(t.vh - t.top).toFixed(1),
            topAsViewportFraction: +(t.top / t.vh).toFixed(3),
            visibleFractionAtTrigger: t.h > 0 ? +Math.max(0, Math.min(1, (t.vh - t.top) / t.h)).toFixed(3) : null,
            opacityAtTrigger: t.opacity,
          }
        : null;
      rec.traceTail = trace.slice(-5);
      out.routes[key] = rec;
    } catch (e) {
      rec.error = String((e && e.message) || e).split("\n")[0];
      out.routes[key] = rec;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ gallery */

async function moduleGallery(page) {
  const out = { routes: {} };
  for (const key of ["home", "company.about"]) {
    const rec = { pageKey: key };
    try {
      rec.url = await goto(page, key);
      const disco = await page.evaluate(() => {
        const norm = (s, n) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, n);
        const roots = [...document.querySelectorAll(".owl-carousel")].filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && e.querySelectorAll(".owl-dot").length > 0 && !/visual_area/.test(e.className);
        });
        const root = roots.find((e) => /gallery2/.test(e.className)) || roots[0];
        if (!root) return { error: "no visible non-hero owl-carousel with dots" };
        if (!root.id) root.id = "__mm_gal";
        root.scrollIntoView({ block: "center" });
        const dotsRoot = root.querySelector(".owl-dots");
        const items = [...root.querySelectorAll(".owl-item")];
        const visible = items.filter((e) => e.getBoundingClientRect().width > 0);
        const dots = dotsRoot ? [...dotsRoot.querySelectorAll(".owl-dot")] : [];
        const nav = root.querySelector(".owl-nav .owl-next");
        const stage = root.querySelector(".owl-stage");
        const dotInfo = (d, i) => {
          const sp = d.querySelector("span") || d;
          const cs = getComputedStyle(sp);
          const r = d.getBoundingClientRect();
          const rs = sp.getBoundingClientRect();
          const rc = getComputedStyle(d);
          return {
            i,
            cls: norm(d.className, 60),
            spanOpacity: cs.opacity,
            spanBg: cs.backgroundColor,
            spanRadius: cs.borderRadius,
            dotOpacity: rc.opacity,
            before: getComputedStyle(sp, "::before").content,
            dotRect: [+r.x.toFixed(1), +r.y.toFixed(1), +r.width.toFixed(1), +r.height.toFixed(1)],
            spanRect: [+rs.x.toFixed(1), +rs.y.toFixed(1), +rs.width.toFixed(1), +rs.height.toFixed(1)],
          };
        };
        return {
          sel: "#" + root.id,
          cls: norm(root.className, 150),
          pagingType: (String(root.className).match(/paging_type_\w+/) || [])[0] || null,
          rect: (() => { const r = root.getBoundingClientRect(); return [+r.x.toFixed(1), +r.y.toFixed(1), +r.width.toFixed(1), +r.height.toFixed(1)]; })(),
          itemCount: items.length,
          visibleItems: visible.length,
          itemWidth: visible[0] ? +visible[0].getBoundingClientRect().width.toFixed(1) : null,
          dotCount: dots.length,
          dots: dots.slice(0, 8).map(dotInfo),
          activeItem: items.findIndex((e) => e.classList.contains("active")),
          activeDot: dots.findIndex((d) => d.classList.contains("active")),
          hasNav: !!nav,
          navVisible: nav ? nav.getBoundingClientRect().width > 0 : false,
          navDisplay: nav ? getComputedStyle(nav.parentElement).display : null,
          stageTransform: stage ? getComputedStyle(stage).transform : null,
          stageTransition: stage ? getComputedStyle(stage).transitionProperty + " " + getComputedStyle(stage).transitionDuration + " " + getComputedStyle(stage).transitionTimingFunction : null,
        };
      });
      rec.disco = disco;
      if (disco.error) {
        out.routes[key] = rec;
        continue;
      }

      const readState = (sel) => {
        const root = document.querySelector(sel);
        if (!root) return { error: "root lost" };
        const items = [...root.querySelectorAll(".owl-item")];
        const dotsRoot = root.querySelector(".owl-dots");
        const dots = dotsRoot ? [...dotsRoot.querySelectorAll(".owl-dot")] : [];
        const stage = root.querySelector(".owl-stage");
        return {
          activeItem: items.findIndex((e) => e.classList.contains("active")),
          activeDot: dots.findIndex((d) => d.classList.contains("active")),
          stageTransform: stage ? getComputedStyle(stage).transform : null,
          spanOpacities: dots.slice(0, 8).map((d) => getComputedStyle(d.querySelector("span") || d).opacity),
        };
      };

      // best-effort: stop owl autoplay so the pager delta is not confounded by an
      // autoplay tick landing between the before/after snapshots (owl v1 exposes
      // stopAutoplay(), owl v2 the `stop.owl.autoplay` event).
      await page
        .evaluate((sel) => {
          const jq = window.jQuery || window.$;
          const root = document.querySelector(sel);
          if (!jq || !root) return;
          try {
            jq(root).trigger("stop.owl.autoplay");
          } catch {
            /* ignore */
          }
          try {
            const inst = jq(root).data("owlCarousel");
            if (inst && typeof inst.stopAutoplay === "function") inst.stopAutoplay();
            else if (inst && typeof inst.autoplay === "function") inst.autoplay(false);
          } catch {
            /* ignore */
          }
        }, disco.sel)
        .catch(() => {});

      /** poll the stage transform until two consecutive reads agree (settled). */
      const waitStableStage = async (sel, tries = 10) => {
        let prev = null;
        for (let i = 0; i < tries; i++) {
          const cur = await page
            .evaluate((s) => {
              const st = document.querySelector(s + " .owl-stage");
              return st ? getComputedStyle(st).transform : null;
            }, sel)
            .catch(() => null);
          if (cur !== null && cur === prev) return { transform: cur, polls: i };
          prev = cur;
          await page.waitForTimeout(250);
        }
        return { transform: prev, polls: tries };
      };

      const settleBefore = await waitStableStage(disco.sel);
      const before = await page.evaluate(readState, disco.sel);
      // paging_type_line galleries have no visible owl-nav, so the pager action is
      // a dot click; fall back to .owl-next only when it is actually visible.
      const clickInfo = await page.evaluate((sel) => {
        const root = document.querySelector(sel);
        if (!root) return { clicked: false, reason: "root lost" };
        const next = root.querySelector(".owl-nav .owl-next");
        const dots = [...root.querySelectorAll(".owl-dots .owl-dot")];
        let el = null;
        let kind = null;
        if (next && next.getBoundingClientRect().width > 0) {
          el = next;
          kind = "next";
        } else if (dots.length) {
          const ai = dots.findIndex((d) => d.classList.contains("active"));
          el = dots[ai >= 0 ? (ai + 1) % dots.length : 0];
          kind = "dot";
        }
        if (!el) return { clicked: false, reason: "no next button and no dots" };
        const r = el.getBoundingClientRect();
        const idx = dots.indexOf(el);
        el.click();
        return { clicked: true, kind, dotIndex: idx >= 0 ? idx : null, at: [+r.x.toFixed(1), +r.y.toFixed(1), +r.width.toFixed(1), +r.height.toFixed(1)] };
      }, disco.sel);
      await page.waitForTimeout(150);
      const mid = await page.evaluate(readState, disco.sel);
      const settleAfter = await waitStableStage(disco.sel);
      const after = await page.evaluate(readState, disco.sel);
      rec.next = {
        click: clickInfo,
        settleBefore,
        settleAfter,
        before,
        mid,
        after,
        stageTx: { before: txOf(before && before.stageTransform), mid: txOf(mid && mid.stageTransform), after: txOf(after && after.stageTransform) },
        advancedItems: after && before && after.activeItem != null && before.activeItem != null ? after.activeItem - before.activeItem : null,
      };
      out.routes[key] = rec;
    } catch (e) {
      rec.error = String((e && e.message) || e).split("\n")[0];
      out.routes[key] = rec;
    }
  }
  return out;
}

/* --------------------------------------------------------------------- card */

const CARD_PROPS = [
  "display", "position", "opacity", "visibility", "transform", "backgroundColor", "backgroundImage",
  "color", "textDecorationLine", "fontWeight", "fontSize", "boxShadow", "overflow",
  "transitionProperty", "transitionDuration", "transitionTimingFunction",
];

async function moduleCard(page) {
  const out = { routes: {} };
  for (const key of ["home", "news"]) {
    const rec = { pageKey: key };
    try {
      rec.url = await goto(page, key);
      const target = await page.evaluate(() => {
        const norm = (s, n) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, n);
        const cands = [
          ".card._card",
          "a.holder",
          "._card_wrap",
          ".item_gallary",
          "li[class*=item]",
          ".card",
        ];
        let el = null;
        for (const c of cands) {
          el = [...document.querySelectorAll(c)].find((e) => {
            const r = e.getBoundingClientRect();
            return r.width > 60 && r.height > 40;
          });
          if (el) break;
        }
        if (!el) return { error: "no visible card candidate" };
        if (!el.id) el.id = "__mm_card";
        el.scrollIntoView({ block: "center" });
        return {
          sel: "#" + el.id,
          cls: norm(typeof el.className === "string" ? el.className : "", 130),
          tag: el.tagName.toLowerCase(),
          text: norm(el.innerText, 60),
          parentCls: el.parentElement ? norm(el.parentElement.className, 100) : "",
        };
      });
      if (target.error) {
        rec.target = target;
        out.routes[key] = rec;
        continue;
      }
      rec.target = target;
      await page.waitForTimeout(500);

      const snap = (sel) =>
        page.evaluate(
          ({ sel, props }) => {
            const card = document.querySelector(sel);
            if (!card) return { error: "no card" };
            const keys = ["", ".text_wrap", ".title", ".slide_overlay", "img", ".card-body", ".card-head", "figcaption", ".desc", ".text", ".thumb", ".explain"];
            const nodes = [card];
            for (const k of keys.slice(1)) {
              const e = k === "" ? card : card.querySelector(k);
              if (e && !nodes.includes(e)) nodes.push(e);
            }
            const info = (e) => {
              const cs = getComputedStyle(e);
              const r = e.getBoundingClientRect();
              const o = { tag: e.tagName.toLowerCase(), cls: (typeof e.className === "string" ? e.className : "").replace(/\s+/g, " ").trim().slice(0, 70) };
              for (const p of props) o[p] = cs[p];
              o.rect = [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
              return o;
            };
            return { nodes: nodes.map(info) };
          },
          { sel, props: CARD_PROPS },
        );

      const before = await snap(target.sel);

      // hover (pointer over), with a re-measure retry because carousels can drift
      let isHover = false;
      for (let attempt = 0; attempt < 2 && !isHover; attempt++) {
        const box = await page.evaluate((s) => {
          const e = document.querySelector(s);
          if (!e) return null;
          const r = e.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: Math.max(5, r.y + Math.min(r.height / 2, 120)) };
        }, target.sel);
        if (!box) break;
        await page.mouse.move(box.x, box.y);
        await page.waitForTimeout(500);
        isHover = await page.evaluate((s) => {
          const e = document.querySelector(s);
          return e ? e.matches(":hover") : false;
        }, target.sel);
        if (!isHover) await page.hover(target.sel, { force: true, timeout: 3000 }).catch(() => {});
        isHover = await page.evaluate((s) => {
          const e = document.querySelector(s);
          return e ? e.matches(":hover") : false;
        }, target.sel);
      }
      const hover = await snap(target.sel);

      // tapped state: block default navigation for the duration of the tap so the
      // app's own pointer handlers still run but a link does not unload the page.
      await page.evaluate(() => {
        window.__blockNav = true;
        window.__navBlocker = (e) => {
          if (window.__blockNav) e.preventDefault();
        };
        document.addEventListener("click", window.__navBlocker, true);
      });
      await page.mouse.down();
      await page.waitForTimeout(350);
      const isActive = await page.evaluate((s) => {
        const e = document.querySelector(s);
        return e ? e.matches(":active") : false;
      }, target.sel);
      const active = await snap(target.sel);
      await page.mouse.up();
      await page.waitForTimeout(500);
      const tapped = await snap(target.sel);
      const finalUrl = page.url();
      await page.evaluate(() => {
        window.__blockNav = false;
        if (window.__navBlocker) document.removeEventListener("click", window.__navBlocker, true);
      });

      const diffNodes = (a, b) => {
        if (!a || !b || a.error || b.error) return null;
        const changes = [];
        const n = Math.min(a.nodes.length, b.nodes.length);
        for (let i = 0; i < n; i++) {
          const d = {};
          for (const p of CARD_PROPS) if (a.nodes[i][p] !== b.nodes[i][p]) d[p] = [a.nodes[i][p], b.nodes[i][p]];
          if (Object.keys(d).length) changes.push({ i, tag: a.nodes[i].tag, cls: a.nodes[i].cls, delta: d });
        }
        return changes;
      };

      rec.isHover = isHover;
      rec.isActive = isActive;
      rec.default = before;
      rec.hover = hover;
      rec.active = active;
      rec.tapped = tapped;
      rec.changedHover = diffNodes(before, hover);
      rec.changedTap = diffNodes(before, tapped);
      rec.navigated = finalUrl !== rec.url ? finalUrl : null;
      out.routes[key] = rec;
    } catch (e) {
      rec.error = String((e && e.message) || e).split("\n")[0];
      out.routes[key] = rec;
    }
  }
  return out;
}

/* --------------------------------------------------------------------- main */

const RUNNERS = { drawer: moduleDrawer, reveal: moduleReveal, gallery: moduleGallery, card: moduleCard };

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const ctx = await browser.newContext({
    viewport: { width: VP.width, height: VP.height },
    deviceScaleFactor: 1,
    colorScheme: "light",
  });
  const page = await ctx.newPage();
  const all = { side: SIDE, base: BASE, vp: VP, modules: {} };
  const t0 = Date.now();

  for (const m of RUN) {
    const start = Date.now();
    try {
      const data = await RUNNERS[m](page);
      data._module = m;
      data._durationMs = Date.now() - start;
      all.modules[m] = data;
      await fs.writeFile(path.join(OUT, `mobile-${SIDE}-${m}.json`), JSON.stringify(data, null, 2));
      console.log(`[${SIDE}/mobile/${m}] ok ${((Date.now() - start) / 1000).toFixed(1)}s`);
    } catch (e) {
      const msg = String((e && e.message) || e).split("\n")[0];
      all.modules[m] = { _module: m, error: msg };
      console.error(`[${SIDE}/mobile/${m}] FAIL ${msg}`);
    }
  }

  all.durationMs = Date.now() - t0;
  await fs.writeFile(path.join(OUT, `mobile-${SIDE}.json`), JSON.stringify(all, null, 2));
  await browser.close();

  /* compact console summary */
  console.log(`\n================ MOBILE MOTION SUMMARY (${SIDE} @ ${BASE}, ${VP.width}x${VP.height}) ================`);
  const p = (o) => JSON.stringify(o);
  if (all.modules.drawer) {
    const d = all.modules.drawer;
    console.log(`drawer menu=${d.menu ? d.menu.cls : "?"} drawer=${d.drawer ? d.drawer.sel : "?"} transition=${d.drawer && d.drawer.closed ? d.drawer.closed.transition : "?"}`);
    console.log(`  open  startTx=${d.open && d.open.stats.startTx} -> endTx=${d.open && d.open.stats.endTx} durationMs=${d.open && d.open.stats.durationMs} frames=${d.open && d.open.framesSampled}`);
    console.log(`  close startTx=${d.closeAction && d.closeAction.stats.startTx} -> endTx=${d.closeAction && d.closeAction.stats.endTx} durationMs=${d.closeAction && d.closeAction.stats.durationMs} frames=${d.closeAction && d.closeAction.framesSampled}`);
  }
  if (all.modules.reveal) {
    for (const [k, v] of Object.entries(all.modules.reveal.routes)) {
      console.log(`reveal[${k}] anim=${v.setup ? v.setup.anim : v.error} preset=${v.setup && v.setup.animatedPreSet} measured=${p(v.measured)}`);
    }
  }
  if (all.modules.gallery) {
    for (const [k, v] of Object.entries(all.modules.gallery.routes)) {
      if (v.disco && !v.disco.error) {
        console.log(`gallery[${k}] dots=${v.disco.dotCount} items=${v.disco.itemCount} visible=${v.disco.visibleItems} itemW=${v.disco.itemWidth} nav=${v.disco.hasNav}/${v.disco.navVisible} paging=${v.disco.pagingType}`);
        console.log(`  action=${v.next && v.next.click.kind} clicked=${v.next && v.next.click.clicked} dotIndex=${v.next && v.next.click.dotIndex} activeItem ${v.next && v.next.before.activeItem}->${v.next && v.next.after.activeItem} activeDot ${v.next && v.next.before.activeDot}->${v.next && v.next.after.activeDot} stageTx ${v.next && v.next.stageTx.before}->${v.next && v.next.stageTx.after}`);
      } else {
        console.log(`gallery[${k}] ${v.disco ? v.disco.error : v.error}`);
      }
    }
  }
  if (all.modules.card) {
    for (const [k, v] of Object.entries(all.modules.card.routes)) {
      console.log(`card[${k}] sel=${v.target ? v.target.sel : v.error} cls=${v.target && v.target.cls}`);
      console.log(`  isHover=${v.isHover} isActive=${v.isActive} changedHover=${p(v.changedHover)} changedTap=${p(v.changedTap)} navigated=${p(v.navigated)}`);
    }
  }
  console.log(`\ntotal ${((Date.now() - t0) / 1000).toFixed(1)}s -> design/audit/motion-probe/mobile-${SIDE}.json`);
}

main().catch((e) => {
  console.error(String((e && e.message) || e).split("\n")[0]);
  process.exit(1);
});
