/**
 * Residual mobile/desktop delta probe — investigation only.
 *
 * Live DOM evidence for the remaining mobile deltas + four small checks.
 * Reuses the capture.mjs browser setup (chrome channel, dsf 1, light,
 * reduced-motion, scroll-flatten) so measurements match the audit PNGs.
 *
 * Usage:
 *   node scripts/audit/residual-probe.mjs --part=1            # rnd/rnd.technology sections
 *   node scripts/audit/residual-probe.mjs --part=2            # rnd.facilities #3 회전융착기
 *   node scripts/audit/residual-probe.mjs --part=3            # company.about gallery duplicate
 *   node scripts/audit/residual-probe.mjs --part=4            # products category tabs
 *   node scripts/audit/residual-probe.mjs --part=5            # 1280x800 header spot check
 *
 * Writes JSON under design/audit/residual/ and PNGs for part 5.
 */
import { chromium } from "playwright-core";
import fs from "node:fs/promises";
import path from "node:path";
import { ORIG_BASE, DEFAULT_LOCAL_BASE } from "./pages.mjs";

const args = process.argv.slice(2);
const getArg = (n, d) => {
  const a = args.find((x) => x.startsWith("--" + n + "="));
  return a ? a.split("=")[1] : d;
};
const PART = getArg("part");
const OUT = path.resolve("design/audit/residual");

const HIDE_DEV_STYLE =
  "nextjs-portal, [data-nextjs-toast], [data-nextjs-dialog], [data-nextjs-dev-tools-button] { display: none !important; }";

async function scrollThrough(page) {
  await page.evaluate(async () => {
    await new Promise((res) => {
      let y = 0;
      const step = () => {
        y += 600;
        window.scrollTo(0, y);
        if (y < document.body.scrollHeight + 1200) setTimeout(step, 40);
        else { window.scrollTo(0, 0); res(); }
      };
      step();
    });
  });
  await page.waitForTimeout(300);
}

/* ------------------------------------------------------------------ */
/* generic helpers injected into the page                              */
/* ------------------------------------------------------------------ */
const PRELUDE = `
  const rnd = (n) => Math.round(n);
  const cls = (el) => (typeof el.className === "string" ? el.className : "").replace(/\\s+/g, " ").trim();
  const oneLine = (s, n) => (s || "").replace(/\\s+/g, " ").trim().slice(0, n);
  const directText = (el) => oneLine([...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" "), 70);
  const rect = (el) => { const r = el.getBoundingClientRect(); return { top: rnd(r.top + window.scrollY), left: rnd(r.left), w: rnd(r.width), h: rnd(r.height) }; };
  function sectionCandidates(side) {
    let cands;
    if (side === "orig") {
      const all = [...document.querySelectorAll(".section_wrap")];
      cands = all.filter((el) => !el.parentElement.closest(".section_wrap"));
      if (!cands.length) cands = [...document.querySelectorAll("main section")];
    } else {
      const all = [...document.querySelectorAll("main section, main > div > section")];
      cands = all.filter((el) => !el.parentElement.closest("section"));
      if (!cands.length) cands = all;
    }
    return cands;
  }
  function findSection(need, side) {
    const cands = sectionCandidates(side);
    const hits = cands.filter((el) => (el.innerText || "").includes(need));
    hits.sort((a, b) => a.getBoundingClientRect().height - b.getBoundingClientRect().height);
    return hits[0] || null;
  }
`;

/* ------------------------------------------------------------------ */
/* PART 1/2 — section outline                                           */
/* ------------------------------------------------------------------ */
const EXTRACT_OUTLINE = `({ need, maxDepth, maxNodes, side }) => {
  ${PRELUDE}
  const sec = findSection(need, side);
  if (!sec) return { found: false, need };
  const sr = rect(sec);
  const tree = [];
  const walk = (el, depth) => {
    if (tree.length >= maxNodes) return;
    const r = rect(el);
    const c = getComputedStyle(el);
    const after = getComputedStyle(el, "::after");
    const before = getComputedStyle(el, "::before");
    const text = directText(el) || (el.children.length === 0 ? oneLine(el.innerText, 70) : "");
    tree.push({
      depth, tag: el.tagName.toLowerCase(), cls: cls(el).slice(0, 70), id: el.id || "",
      ...r,
      display: c.display, position: c.position, overflowX: c.overflowX,
      fontSize: c.fontSize, lineHeight: c.lineHeight, fontFamily: c.fontFamily.split(",")[0],
      paddingTop: c.paddingTop, paddingBottom: c.paddingBottom,
      marginTop: c.marginTop, marginBottom: c.marginBottom,
      minHeight: c.minHeight, borderBottom: c.borderBottomWidth,
      beforeH: before.content !== "none" ? before.height : null,
      afterH: after.content !== "none" ? after.height : null,
      childCount: el.children.length,
      text,
    });
    if (depth < maxDepth) for (const ch of el.children) walk(ch, depth + 1);
  };
  walk(sec, 0);

  // tables: row pitch + cell metrics
  const tables = [...sec.querySelectorAll("table")].map((t, ti) => {
    const trs = [...t.querySelectorAll("tr")].map((tr, i) => {
      const trc = getComputedStyle(tr);
      const cells = [...tr.children].map((td) => {
        const cc = getComputedStyle(td);
        return {
          tag: td.tagName.toLowerCase(), rowspan: td.getAttribute("rowspan") || "",
          ...rect(td), display: cc.display, paddingTop: cc.paddingTop, paddingBottom: cc.paddingBottom,
          fontSize: cc.fontSize, lineHeight: cc.lineHeight, whiteSpace: cc.whiteSpace, wordBreak: cc.wordBreak,
          text: oneLine(td.innerText, 50),
        };
      });
      return { i, ...rect(tr), display: trc.display, cells };
    });
    const tc = getComputedStyle(t);
    const ancestors = [];
    let a = t.parentElement;
    while (a && a !== sec.parentElement) {
      const ac = getComputedStyle(a);
      ancestors.push({ tag: a.tagName.toLowerCase(), cls: cls(a).slice(0, 60), ...rect(a), overflowX: ac.overflowX, overflowY: ac.overflowY, minWidth: ac.minWidth, width: ac.width, maxWidth: ac.maxWidth, display: ac.display, tableLayout: ac.tableLayout, whiteSpace: ac.whiteSpace });
      a = a.parentElement;
    }
    return { i: ti, cls: cls(t).slice(0, 70), ...rect(t), display: tc.display, tableLayout: tc.tableLayout, width: tc.width, minWidth: tc.minWidth, maxWidth: tc.maxWidth, whiteSpace: tc.whiteSpace, overflowX: tc.overflowX, ancestors, trs };
  });

  // text blocks with computed typography (p / h* / li with direct text)
  const textBlocks = [...sec.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li")]
    .filter((el) => oneLine(el.innerText, 5))
    .map((el) => {
      const c = getComputedStyle(el);
      return { tag: el.tagName.toLowerCase(), ...rect(el), fontSize: c.fontSize, lineHeight: c.lineHeight, whiteSpace: c.whiteSpace, wordBreak: c.wordBreak, marginTop: c.marginTop, marginBottom: c.marginBottom, text: oneLine(el.innerText, 60) };
    });

  const imgs = [...sec.querySelectorAll("img")].map((im) => {
    const r = im.getBoundingClientRect();
    return { src: (im.getAttribute("src") || "").split("/").pop().slice(0, 40), currentSrc: (im.currentSrc || "").split("/").pop().slice(0, 40), nw: im.naturalWidth, nh: im.naturalHeight, w: rnd(r.width), h: rnd(r.height), styleW: im.style.width || "" };
  });

  return { found: true, need, side, section: { tag: sec.tagName.toLowerCase(), cls: cls(sec).slice(0, 90), ...sr, display: getComputedStyle(sec).display }, childSum: tree.filter((n) => n.depth === 1).reduce((a, n) => a + n.h, 0), tree, tables, textBlocks, imgs };
}`;

/* ------------------------------------------------------------------ */
/* PART 3 — gallery / owl carousel order                               */
/* ------------------------------------------------------------------ */
const EXTRACT_GALLERY = `({ side }) => {
  ${PRELUDE}
  const imgAttrs = (im) => im ? {
    src: (im.getAttribute("src") || "").split("/").pop().slice(0, 40),
    dataSrc: (im.getAttribute("data-src") || "").split("/").pop().slice(0, 40),
    current: (im.currentSrc || "").split("/").pop().slice(0, 40),
    srcset: (im.getAttribute("srcset") || "").split(",").map((s) => s.trim().split(" ")[0].split("/").pop()).slice(0, 2).join("|"),
  } : null;

  // find every carousel track (orig owl-stage / local snap-x) whose subtree
  // contains the gallery caption text
  const tracks = [];
  const owlStages = [...document.querySelectorAll(".owl-stage")];
  for (const st of owlStages) {
    const txt = (st.textContent || "");
    tracks.push({
      kind: "owl",
      top: rect(st).top,
      hasBidet: txt.includes("Bidet Filters"),
      items: [...st.children].map((el, i) => ({
        i, tag: el.tagName.toLowerCase(), cloned: el.classList.contains("cloned"), active: el.classList.contains("active"),
        cls: cls(el).slice(0, 50), ...rect(el), title: oneLine(el.textContent, 50),
        img: imgAttrs(el.querySelector("img")),
        htmlStart: (el.innerHTML || "").replace(/\\s+/g, " ").slice(0, 90),
      })),
    });
  }
  const localTracks = [...document.querySelectorAll(".snap-x")];
  for (const tr of localTracks) {
    const txt = (tr.textContent || "");
    tracks.push({
      kind: "snap",
      top: rect(tr).top,
      hasBidet: txt.includes("Bidet Filters"),
      items: [...tr.children].map((el, i) => ({
        i, tag: el.tagName.toLowerCase(), cloned: false, active: false,
        cls: cls(el).slice(0, 50), ...rect(el), title: oneLine(el.textContent, 50),
        img: imgAttrs(el.querySelector("img")),
        htmlStart: (el.innerHTML || "").replace(/\\s+/g, " ").slice(0, 90),
      })),
    });
  }

  // every "Bidet Filters" occurrence in DOM order, with the item's caption text
  const bidetTexts = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if ((node.textContent || "").includes("Bidet Filters")) {
      const host = node.parentElement;
      const item = host && host.closest(".owl-item, [data-slide-item], li, figure, .snap-x > *");
      bidetTexts.push({ text: oneLine(node.textContent, 40), hostCls: host ? cls(host).slice(0, 50) : "", itemCls: item ? cls(item).slice(0, 50) : "", itemCloned: item ? item.classList.contains("cloned") : null, itemTop: item ? rect(item).top : null, itemHTML: item ? item.innerHTML.replace(/\\s+/g, " ").slice(0, 160) : "" });
    }
  }

  return { side, url: location.href, title: document.title, tracks: tracks.filter((t) => t.items.length), bidetTexts };
}`;

/* ------------------------------------------------------------------ */
/* PART 4 — products category tabs                                      */
/* ------------------------------------------------------------------ */
const EXTRACT_TABS = `({ side }) => {
  ${PRELUDE}
  // broad: every short-text link/button/li in the upper page, visibility included.
  const seen = new Set();
  const tabs = [];
  for (const el of document.querySelectorAll("a, button, li")) {
    if (seen.has(el)) continue; seen.add(el);
    const t = oneLine(el.innerText, 40);
    if (!t || t.length > 40) continue;
    const r = rect(el);
    if (r.top > 1400) continue;
    const c = getComputedStyle(el);
    const anc = el.closest("[class*='tab'],[class*='sub_menu'],[class*='sub-menu'],[class*='filter'],[class*='category'],[class*='menu']");
    const self = (cls(el) + " " + (anc ? cls(anc) : "")).slice(0, 70);
    tabs.push({ tag: el.tagName.toLowerCase(), cls: cls(el).slice(0, 50), anc: anc ? cls(anc).slice(0, 45) : "", ...r, display: c.display, visibility: c.visibility, text: t, href: el.getAttribute("href") || "" });
  }
  tabs.sort((a, b) => a.top - b.top || a.left - b.left);
  // group by nearest sub-menu nav container, list its depth-01 top-level labels
  const subMenus = [...document.querySelectorAll("nav.sub-menu, .sub-menu")].map((nav, ri) => {
    const c = getComputedStyle(nav);
    const r = rect(nav);
    const topLevel = [...nav.children].map((li) => ({ tag: li.tagName.toLowerCase(), cls: cls(li).slice(0, 40), ...rect(li), text: oneLine(li.textContent, 40) }));
    return {
      ri, cls: cls(nav).slice(0, 60), ...r, display: c.display, visibility: c.visibility,
      parent: nav.parentElement ? cls(nav.parentElement).slice(0, 40) : "",
      topLevel,
      depth01: [...nav.querySelectorAll("li.depth-01, li")].filter((li) => li.parentElement === nav || li.parentElement === nav.querySelector("ul")).map((li) => ({ cls: cls(li).slice(0, 40), ...rect(li), text: oneLine(li.textContent, 40) })),
    };
  });
  return { side, url: location.href, title: document.title, count: tabs.length, subMenus, tabs };
}`;

/* ------------------------------------------------------------------ */
/* PART 5 — 1280 header spot check                                      */
/* ------------------------------------------------------------------ */
const EXTRACT_HEADER = `({ side }) => {
  ${PRELUDE}
  const hdrSels = ["#doz_header", "#doz_header_wrap", "header", ".doz_header", "[class*='header_wrap']"];
  let headerEl = null;
  for (const q of hdrSels) { const el = document.querySelector(q); if (el && rect(el).h > 0) { headerEl = el; break; } }
  if (!headerEl) headerEl = document.querySelector(hdrSels.join(","));
  const navs = [...document.querySelectorAll("nav, .viewport-nav, ._main_menu, ._main_clone_menu, ._menu_wrap")]
    .filter((el, i, arr) => !arr.some((o) => o !== el && o.contains(el)))
    .map((el) => {
      const c = getComputedStyle(el);
      const visibleLinks = [...el.querySelectorAll("a")].map((a) => ({ text: oneLine(a.innerText, 24), ...rect(a) })).filter((a) => a.text && a.h > 0);
      return { cls: cls(el).slice(0, 90), display: c.display, visibility: c.visibility, opacity: c.opacity, ...rect(el), links: visibleLinks.map((a) => a.text) };
    });
  const visibleTopLinks = [...document.querySelectorAll("a, button")]
    .map((a) => ({ text: oneLine(a.innerText, 24), ...rect(a) }))
    .filter((a) => a.text && a.h > 0 && a.top < 130 && a.w > 0 && a.left >= 0)
    .sort((a, b) => a.left - b.left);
  const headerStyles = headerEl ? (() => { const c = getComputedStyle(headerEl); return { sel: headerEl.id ? "#" + headerEl.id : headerEl.tagName.toLowerCase(), cls: cls(headerEl).slice(0, 80), ...rect(headerEl), position: c.position, display: c.display, background: c.backgroundColor, height: c.height, overflowX: c.overflowX }; })() : null;
  const bar = document.querySelector("#doz_header_wrap, #doz_header, header");
  const innerBar = bar ? (bar.firstElementChild || bar) : null;
  const innerStyles = innerBar ? (() => { const c = getComputedStyle(innerBar); return { cls: cls(innerBar).slice(0, 60), ...rect(innerBar), height: c.height, display: c.display }; })() : null;
  const mainMenus = [...document.querySelectorAll(".viewport-nav.desktop._main_menu, .viewport-nav.desktop, ._main_menu, header nav")].map((el, i) => {
    const c = getComputedStyle(el);
    return {
      i, cls: cls(el).slice(0, 70), display: c.display, ...rect(el),
      items: [...el.querySelectorAll("li")].map((li) => ({ cls: cls(li).slice(0, 40), text: oneLine(li.textContent, 30), disp: getComputedStyle(li).display, ...rect(li) })).filter((x) => x.text),
      controls: [...el.querySelectorAll("button, [role='button'], [class*='more'], [class*='toggle']")].map((b) => ({ cls: cls(b).slice(0, 40), label: oneLine(b.getAttribute("aria-label") || b.className, 30), disp: getComputedStyle(b).display, ...rect(b) })),
    };
  });
  return { side, url: location.href, docWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, bodyScrollWidth: document.body.scrollWidth, header: headerStyles, innerBar: innerStyles, navs, visibleTopLinks, mainMenus };
}`;

/* ------------------------------------------------------------------ */
/* compile the source-string extractors into real functions             */
/* ------------------------------------------------------------------ */
const makeFn = (src) => new Function("return (" + src + ");")();
const FN_OUTLINE = makeFn(EXTRACT_OUTLINE);
const FN_GALLERY = makeFn(EXTRACT_GALLERY);
const FN_TABS = makeFn(EXTRACT_TABS);
const FN_HEADER = makeFn(EXTRACT_HEADER);

/* ------------------------------------------------------------------ */

async function setupPage(ctx, url) {
  const page = await ctx.newPage();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(url, { waitUntil: "load", timeout: 45000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(600);
  await page.addStyleTag({ content: HIDE_DEV_STYLE });
  await scrollThrough(page);
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(900);
  return page;
}

async function runPart1(browser) {
  const needs = ["다단계 정수 시스템", "글로벌 대기업 공급 실적", "스마트·살균 기술", "투자자 핵심 USP 요약"];
  const out = {};
  for (const side of ["orig", "local"]) {
    const base = side === "orig" ? ORIG_BASE : DEFAULT_LOCAL_BASE;
    const url = base + (side === "orig" ? "/22" : "/rnd/technology");
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: "light" });
    try {
      const page = await setupPage(ctx, url);
      out[side] = { url, scrollHeight: await page.evaluate(() => document.body.scrollHeight), sections: {} };
      for (const need of needs) {
        const d = await page.evaluate(FN_OUTLINE, { need, maxDepth: 10, maxNodes: 900, side });
        out[side].sections[need] = d;
        console.log(`[p1 ${side}] "${need}" found=${d.found} sectionH=${d.section ? d.section.h : "-"} tree=${d.tree.length} tables=${d.tables.length}`);
      }
    } finally { await ctx.close(); }
  }
  await fs.writeFile(path.join(OUT, "part1-rnd-sections.json"), JSON.stringify(out, null, 2));
  console.log("wrote part1-rnd-sections.json");
}

async function runPart2(browser) {
  const need = "회전융착기";
  const out = {};
  for (const side of ["orig", "local"]) {
    const base = side === "orig" ? ORIG_BASE : DEFAULT_LOCAL_BASE;
    const url = base + (side === "orig" ? "/24" : "/rnd/facilities");
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: "light" });
    try {
      const page = await setupPage(ctx, url);
      const d = await page.evaluate(FN_OUTLINE, { need, maxDepth: 7, maxNodes: 1200, side });
      out[side] = { url, scrollHeight: await page.evaluate(() => document.body.scrollHeight), section: d };
      console.log(`[p2 ${side}] found=${d.found} sectionH=${d.section ? d.section.h : "-"} tree=${d.tree.length} tables=${d.tables.length}`);
    } finally { await ctx.close(); }
  }
  await fs.writeFile(path.join(OUT, "part2-facilities.json"), JSON.stringify(out, null, 2));
  console.log("wrote part2-facilities.json");
}

async function runPart3(browser) {
  const out = {};
  for (const side of ["orig", "local"]) {
    const base = side === "orig" ? ORIG_BASE : DEFAULT_LOCAL_BASE;
    const url = base + (side === "orig" ? "/17" : "/company/about");
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: "light" });
    try {
      const page = await setupPage(ctx, url);
      const d = await page.evaluate(FN_GALLERY, { side });
      out[side] = d;
      console.log(`[p3 ${side}] tracks=${d.tracks.length} bidetTexts=${d.bidetTexts.length}`);
      for (const t of d.tracks) if (t.hasBidet) console.log(`    track ${t.kind} top=${t.top} items=${t.items.length} cloned=${t.items.filter((i) => i.cloned).length}`);
      for (const b of d.bidetTexts) console.log(`    bidet top=${b.itemTop} cloned=${b.itemCloned} cls=${b.itemCls} text="${b.text}"`);
    } finally { await ctx.close(); }
  }
  await fs.writeFile(path.join(OUT, "part3-gallery.json"), JSON.stringify(out, null, 2));
  console.log("wrote part3-gallery.json");
}

async function runPart4(browser) {
  const out = {};
  const targets = [
    ["orig-32", ORIG_BASE, "/32"],
    ["orig-37", ORIG_BASE, "/37"],
    ["local", DEFAULT_LOCAL_BASE, "/products"],
  ];
  for (const [label, base, route] of targets) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: "light" });
    try {
      const page = await setupPage(ctx, base + route);
      const d = await page.evaluate(FN_TABS, { side: label });
      out[label] = d;
      console.log(`[p4 ${label}] items=${d.count}`);
      for (const t of d.tabs) console.log(`    top=${t.top} ${t.tag} disp=${t.display} vis=${t.visibility} ${t.w}x${t.h} cls=${t.cls.split(" ").slice(0, 3).join(".")} anc=${t.anc.split(" ").slice(0, 3).join(".")} :: ${JSON.stringify(t.text)}`);
    } finally { await ctx.close(); }
  }
  await fs.writeFile(path.join(OUT, "part4-products-tabs.json"), JSON.stringify(out, null, 2));
  console.log("wrote part4-products-tabs.json");
}

async function runPart5(browser) {
  const out = {};
  const targets = [
    ["orig", ORIG_BASE + "/15"],
    ["local", DEFAULT_LOCAL_BASE + "/company"],
  ];
  for (const [side, url] of targets) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, colorScheme: "light" });
    try {
      const page = await setupPage(ctx, url);
      const d = await page.evaluate(FN_HEADER, { side });
      out[side] = d;
      await page.screenshot({ path: path.join(OUT, `${side}-company-1280-full.png`), fullPage: false, animations: "disabled" });
      // header-only crop
      const headerSel = side === "orig" ? "#doz_header_wrap, #doz_header, header" : "#doz_header";
      const el = await page.$(headerSel);
      if (el) {
        await el.screenshot({ path: path.join(OUT, `${side}-company-1280-header.png`) }).catch(() => {});
      }
      // also crop the top 130px of the viewport as a header band
      await page.screenshot({ path: path.join(OUT, `${side}-company-1280-topband.png`), clip: { x: 0, y: 0, width: 1280, height: 130 }, animations: "disabled" });
      console.log(`[p5 ${side}] header=`, JSON.stringify(d.header));
      console.log(`    navs=${d.navs.length} scrollWidth=${d.scrollWidth} bodyScrollWidth=${d.bodyScrollWidth}`);
      for (const n of d.navs) console.log(`    nav display=${n.display} h=${n.h} links=[${n.links.join(", ")}]`);
    } finally { await ctx.close(); }
  }
  await fs.writeFile(path.join(OUT, "part5-header-1280.json"), JSON.stringify(out, null, 2));
  console.log("wrote part5-header-1280.json");
}

async function runPart6(browser) {
  const out = {};
  const targets = [
    ["orig", [ORIG_BASE + "/21", ORIG_BASE + "/22"]],
    ["local", [DEFAULT_LOCAL_BASE + "/rnd", DEFAULT_LOCAL_BASE + "/rnd/technology"]],
  ];
  for (const [side, urls] of targets) {
    out[side] = {};
    for (const url of urls) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: "light" });
      try {
        const page = await setupPage(ctx, url);
        const d = await page.evaluate(({ side }) => {
          const rnd = (n) => Math.round(n);
          const cls = (el) => (typeof el.className === "string" ? el.className : "").replace(/\s+/g, " ").trim();
          let cands;
          if (side === "orig") {
            const all = [...document.querySelectorAll(".section_wrap")];
            cands = all.filter((el) => !el.parentElement.closest(".section_wrap"));
          } else {
            const all = [...document.querySelectorAll("main section, main > div > section")];
            cands = all.filter((el) => !el.parentElement.closest("section"));
          }
          const secs = cands.map((el) => {
            const r = el.getBoundingClientRect();
            const h = el.querySelector("h1,h2,h3,h4,h5,h6");
            return { h: rnd(r.height), top: rnd(r.top + scrollY), head: (h ? h.innerText : el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 40) };
          }).filter((s) => s.h > 0);
          return { scrollHeight: document.body.scrollHeight, sections: secs };
        }, { side });
        out[side][url] = d;
        console.log(`[p6 ${side}] ${url} scrollH=${d.scrollHeight} sections=${d.sections.length}`);
      } finally { await ctx.close(); }
    }
    const [a, b] = urls;
    const same = JSON.stringify(out[side][a].sections.map((s) => s.h)) === JSON.stringify(out[side][b].sections.map((s) => s.h));
    console.log(`[p6 ${side}] mirror sections=${same} scrollH ${out[side][a].scrollHeight} vs ${out[side][b].scrollHeight}`);
  }
  await fs.writeFile(path.join(OUT, "part6-rnd-mirror.json"), JSON.stringify(out, null, 2));
  console.log("wrote part6-rnd-mirror.json");
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    if (PART === "1") await runPart1(browser);
    else if (PART === "2") await runPart2(browser);
    else if (PART === "3") await runPart3(browser);
    else if (PART === "4") await runPart4(browser);
    else if (PART === "5") await runPart5(browser);
    else if (PART === "6") await runPart6(browser);
    else { console.error("usage: node scripts/audit/residual-probe.mjs --part=1|2|3|4|5|6"); process.exit(1); }
  } finally { await browser.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
