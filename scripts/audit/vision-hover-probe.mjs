/**
 * TEMPORARY probe (fixer lane) — vision-section image hover scale.
 *
 * Measures the original vs local for the company.philosophy 비전 image widget
 * (w202508289fc0c0165c025): subtree transforms/transition/overflow at rest and
 * under a verified :hover, at desktop 1440x900 and mobile 390x844. Also scans
 * every original page for elements carrying an opt-in hover class
 * (`hover_scale` / `_scale`) and reports their geometry.
 *
 * Usage:
 *   node scripts/audit/vision-hover-probe.mjs [--side=orig|local|both] [--vp=desktop|mobile|both] [--scan=1]
 */
import { chromium } from "playwright-core";
import { ORIG_BASE, DEFAULT_LOCAL_BASE, PAGES } from "./pages.mjs";

const args = process.argv.slice(2);
const getArg = (n, d) => {
  const a = args.find((x) => x.startsWith("--" + n + "="));
  return a ? a.split("=").slice(1).join("=") : d;
};
const SIDE_ARG = getArg("side", "both");
const SIDES = SIDE_ARG === "both" ? ["orig", "local"] : [SIDE_ARG];
const VP_ARG = getArg("vp", "both");
const VPS = VP_ARG === "both" ? ["desktop", "mobile"] : VP_ARG.split(",");
const SCAN = getArg("scan", "0") === "1";
const BASES = { orig: ORIG_BASE, local: getArg("base", DEFAULT_LOCAL_BASE) };
const VPDEF = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };
const vpDef = (v) => VPDEF[v] || (/^(\d+)x(\d+)$/.test(v) ? { width: +RegExp.$1, height: +RegExp.$2 } : VPDEF.desktop);
const WID = "w202508289fc0c0165c025";
const PHILO = { orig: "/18", local: "/company/philosophy" };
const HIDE = "nextjs-portal,[data-nextjs-toast],[data-nextjs-dialog],[data-nextjs-dev-tools-button]{display:none!important}";

async function goto(page, url) {
  await page.goto(url, { waitUntil: "load", timeout: 45000 });
  await page.waitForTimeout(1600);
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
}

function INFO(el) {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return {
    tag: el.tagName.toLowerCase(),
    id: el.id || "",
    cls: (typeof el.className === "string" ? el.className : "").replace(/\s+/g, " ").trim().slice(0, 200),
    rect: [+r.x.toFixed(1), +r.y.toFixed(1), +r.width.toFixed(1), +r.height.toFixed(1)],
    transform: cs.transform,
    scale: cs.scale,
    transitionProperty: cs.transitionProperty,
    transitionDuration: cs.transitionDuration,
    transitionTimingFunction: cs.transitionTimingFunction,
    transitionDelay: cs.transitionDelay,
    overflow: cs.overflow,
    overflowX: cs.overflowX,
    overflowY: cs.overflowY,
    position: cs.position,
    display: cs.display,
    width: cs.width,
    height: cs.height,
    objectFit: cs.objectFit,
    willChange: cs.willChange,
    hover: el.matches(":hover"),
    src: el.tagName === "IMG" ? (el.getAttribute("src") || "").slice(-40) : undefined,
  };
}

async function subtree(page, rootSel) {
  return page.evaluate(
    ({ rootSel, INFO }) => {
      const root = document.querySelector(rootSel);
      if (!root) return { error: "no root " + rootSel };
      const chain = [];
      let el = root;
      for (let i = 0; el && i < 7; i++) {
        chain.push(INFO(el));
        el = el.parentElement;
      }
      const descendants = [root, ...root.querySelectorAll("*")].slice(0, 40).map(INFO);
      return { chain, descendants, html: root.outerHTML.replace(/\s+/g, " ").slice(0, 1500) };
    },
    { rootSel, INFO: INFO.toString().replace(/^function INFO/, "function") },
  );
}
// INFO string form above is awkward; instead inline a page function:
async function subtreeDirect(page, rootSel) {
  return page.evaluate((rootSel) => {
    const inf = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(),
        id: el.id || "",
        cls: (typeof el.className === "string" ? el.className : "").replace(/\s+/g, " ").trim().slice(0, 200),
        rect: [+r.x.toFixed(1), +r.y.toFixed(1), +r.width.toFixed(1), +r.height.toFixed(1)],
        transform: cs.transform,
        scale: cs.scale,
        transitionProperty: cs.transitionProperty,
        transitionDuration: cs.transitionDuration,
        transitionTimingFunction: cs.transitionTimingFunction,
        transitionDelay: cs.transitionDelay,
        overflow: cs.overflow,
        overflowX: cs.overflowX,
        overflowY: cs.overflowY,
        position: cs.position,
        display: cs.display,
        width: cs.width,
        height: cs.height,
        objectFit: cs.objectFit,
        willChange: cs.willChange,
        hover: el.matches(":hover"),
        src: el.tagName === "IMG" ? (el.getAttribute("src") || "").slice(-40) : undefined,
      };
    };
    const root = document.querySelector(rootSel);
    if (!root) return { error: "no root " + rootSel };
    const chain = [];
    let el = root;
    for (let i = 0; el && i < 7; i++) {
      chain.push(inf(el));
      el = el.parentElement;
    }
    const descendants = [root, ...root.querySelectorAll("*")].slice(0, 40).map(inf);
    return { chain, descendants, html: root.outerHTML.replace(/\s+/g, " ").slice(0, 2000) };
  }, rootSel);
}

async function hoverDelta(page, rootSel) {
  const before = await subtreeDirect(page, rootSel);
  if (before.error) return { before };
  const box = await page.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e) return null;
    e.scrollIntoView({ block: "center" });
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, rootSel);
  await page.waitForTimeout(400);
  const box2 = await page.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, rootSel);
  const b = box2 || box;
  if (b && b.w > 0 && b.h > 0) {
    const vh = await page.evaluate(() => window.innerHeight);
    const cx = Math.min(Math.max(b.x + b.w / 2, 5), 1435);
    const cy = Math.min(Math.max(b.y + Math.min(b.h / 2, 160), 5), vh - 5);
    await page.mouse.move(cx, cy);
    await page.waitForTimeout(700);
  }
  const after = await subtreeDirect(page, rootSel);
  const rootHover = await page.evaluate((s) => {
    const e = document.querySelector(s);
    return e ? e.matches(":hover") : null;
  }, rootSel);
  await page.mouse.move(2, 2).catch(() => {});
  await page.waitForTimeout(400);
  // diff descendants by index
  const changes = [];
  const n = Math.min(before.descendants.length, after.descendants.length);
  for (let i = 0; i < n; i++) {
    const b0 = before.descendants[i];
    const a0 = after.descendants[i];
    const d = {};
    for (const k of ["transform", "scale", "transitionProperty", "transitionDuration", "transitionTimingFunction", "transitionDelay", "overflow", "width", "height", "hover"]) {
      if (b0 && a0 && b0[k] !== a0[k]) d[k] = [b0[k], a0[k]];
    }
    if (Object.keys(d).length) changes.push({ i, tag: b0.tag, cls: b0.cls, id: b0.id, delta: d });
  }
  return { rootHover, before, after, changes };
}

async function scanHoverClasses(page, base, side) {
  const out = [];
  for (const p of PAGES) {
    const url = base + (side === "orig" ? p.orig : p.local);
    try {
      await goto(page, url);
      const found = await page.evaluate(() => {
        const hits = [];
        for (const el of document.querySelectorAll('[class*="hover_scale"]')) {
          const c = typeof el.className === "string" ? el.className : "";
          const wid = el.closest("[id^='w']") ? el.closest("[id^='w']").id : el.id || "";
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          hits.push({
            page: "",
            tag: el.tagName.toLowerCase(),
            cls: c.replace(/\s+/g, " ").trim().slice(0, 160),
            wid,
            rect: [+r.x.toFixed(1), +r.y.toFixed(1), +r.width.toFixed(1), +r.height.toFixed(1)],
            transform: cs.transform,
            transition: cs.transitionProperty + " " + cs.transitionDuration + " " + cs.transitionTimingFunction,
          });
        }
        return hits;
      });
      for (const h of found) out.push({ ...h, page: p.key, orig: p.orig, local: p.local });
      if (found.length) console.log(`[scan ${side}] ${p.key} (${p.orig}) -> ${found.length} hit(s)`);
    } catch (e) {
      console.error(`[scan ${side}] ${p.key} FAIL ${String((e && e.message) || e).split("\n")[0]}`);
    }
  }
  return out;
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const side of SIDES) {
    const base = BASES[side];
    for (const vp of VPS) {
      const ctx = await browser.newContext({ viewport: vpDef(vp), deviceScaleFactor: 1, colorScheme: "light" });
      const page = await ctx.newPage();
      const url = base + (side === "orig" ? PHILO.orig : PHILO.local);
      const sel = side === "orig" ? "#" + WID : `[data-widget-id="${WID}"]`;
      console.log(`\n========== ${side} ${vp} ${url} ==========`);
      try {
        await goto(page, url);
        const r = await hoverDelta(page, sel);
        if (r.before && r.before.error) {
          console.log("  BEFORE error:", r.before.error, " (sel=" + sel + ")");
          // fall back: find any img whose src includes the vision file
          const alt = await page.evaluate(() => {
            const imgs = [...document.querySelectorAll("img")].filter((i) => /3241669643c6e/.test(i.getAttribute("src") || ""));
            return imgs.map((i) => {
              const w = i.closest('[id^="w"], [data-widget-id]');
              return { src: (i.getAttribute("src") || "").slice(-50), wid: w ? w.id || w.getAttribute("data-widget-id") : null };
            });
          });
          console.log("  fallback imgs:", JSON.stringify(alt));
        } else {
          console.log("  rootHover:", r.rootHover, " changes:", r.changes.length);
          console.log("  CHAIN:");
          for (const c of r.before.chain) {
            console.log(`    ${c.tag}${c.id ? "#" + c.id : ""} .${c.cls} transform=${c.transform} scale=${c.scale} trans=${c.transitionProperty}/${c.transitionDuration}/${c.transitionTimingFunction} overflow=${c.overflow} rect=${c.rect}`);
          }
          console.log("  CHANGES (before -> hover):");
          for (const c of r.changes) {
            console.log(`    ${c.tag} .${c.cls} ${c.id ? "#" + c.id : ""} => ${JSON.stringify(c.delta)}`);
          }
          console.log("  KEY NODES before -> after:");
          for (let i = 0; i < r.before.descendants.length; i++) {
            const b0 = r.before.descendants[i];
            const a0 = r.after.descendants[i];
            const key = b0.tag === "img" || /img_box|hover|overlay|org_image|widget image/.test(b0.cls);
            if (!key) continue;
            console.log(`    [${i}] ${b0.tag}.${b0.cls} #${b0.id}`);
            console.log(`       before: transform=${b0.transform} trans=${b0.transitionProperty}/${b0.transitionDuration}/${b0.transitionTimingFunction}/${b0.transitionDelay} overflow=${b0.overflow} w=${b0.width} h=${b0.height} pos=${b0.position} fit=${b0.objectFit} willch=${b0.willChange}`);
            console.log(`       after : transform=${a0.transform} trans=${a0.transitionProperty}/${a0.transitionDuration}/${a0.transitionTimingFunction}/${a0.transitionDelay} hover=${a0.hover}`);
          }
          console.log("  HTML:", r.before.html.slice(0, 1400));
          // CSS rules mentioning hover_scale / _hover_image / hover_scale
          const rules = await page.evaluate(() => {
            const out = [];
            for (const ss of document.styleSheets) {
              let list;
              try { list = ss.cssRules; } catch { continue; }
              if (!list) continue;
              const walk = (rs, media) => {
                for (const r of rs) {
                  if (r.cssRules) { walk(r.cssRules, r.conditionText || media); continue; }
                  const t = r.cssText || "";
                  if (/hover_scale|_hover_image|hover_img_hide|_hover_overlay/.test(t)) out.push({ media, css: t.slice(0, 400) });
                }
              };
              walk(list, "");
            }
            return out;
          });
          console.log("  CSS RULES (hover_scale family):", rules.length);
          for (const ru of rules) console.log("    [" + (ru.media || "all") + "] " + ru.css);
        }
      } catch (e) {
        console.error("  FAIL", String((e && e.message) || e).split("\n")[0]);
      }
      await ctx.close();
    }
  }
  if (SCAN) {
    const ctx = await browser.newContext({ viewport: VPDEF.desktop, deviceScaleFactor: 1, colorScheme: "light" });
    const page = await ctx.newPage();
    for (const side of SIDES) {
      const hits = await scanHoverClasses(page, BASES[side], side);
      console.log(`\n===== SCAN ${side}: ${hits.length} total =====`);
      for (const h of hits) console.log(`  ${h.page} ${h.tag} .${h.cls} wid=${h.wid} rect=${h.rect} transform=${h.transform} trans=${h.transition}`);
    }
    await ctx.close();
  }
  await browser.close();
}

main().catch((e) => {
  console.error(String((e && e.message) || e).split("\n")[0]);
  process.exit(1);
});
