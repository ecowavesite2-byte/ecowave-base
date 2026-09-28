/**
 * Mobile spacing audit — measures 390px spacing per page and flags:
 *   A. text near viewport edges (min inset < EDGE_PX)          [text-node based]
 *   B. excessive section vertical padding / margins / gaps      (unchanged from v1)
 *   C. excessive horizontal text insets (min inset > INSET_PX)  [text-node based]
 *   D. horizontal overflow (documentElement.scrollWidth - clientWidth > 2)
 *   E. internal vertical whitespace inside a section
 *      (lead / trail / largest internal gap > VPAD_PX)
 *
 * v2 upgrades over v1 (measurement only, same CLI/artifacts):
 *   - A/C extracted from every visible text node via Range.getClientRects(),
 *     not from element candidates. Off-screen / scroll-container text is
 *     classified separately as "scroll" and excluded from A/C.
 *   - every flag carries document-Y `top`/`bottom` for screenshot cropping.
 *   - per-section gutter stats: min / median / max of min(insetL, insetR).
 *   - class E: lead / trail / worst internal gap for each top-level section.
 *
 * AUDIT TOOLING ONLY — reads the DOM, writes artifacts under the --out dir.
 * Never mutates app code.
 *
 * Usage:
 *   node scripts/audit/mobile-spacing.mjs [--side=local|orig] [--only=key1,key2]
 *        [--tag=v2] [--base=http://localhost:4517] [--out=design/audit/mobile-spacing]
 *
 * Reuses the capture.mjs / mobile-probe.mjs browser setup (chrome channel, dsf 1,
 * light, reduced motion, dev-overlay hide, scroll-flatten) so measurements match
 * the audit PNGs.
 *
 * Thresholds:
 *   EDGE_PX  = 12   text node min edge inset below this counts as "near edge"   (A)
 *   INSET_PX = 48   text node min edge inset above this counts as "excessive"   (C)
 *   VPAD_PX  = 100  section padding / E lead / trail / internal gap > this      (B, E)
 *   VMAR_PX  = 80   section margin-top/bottom above this counts as excessive    (B)
 *   GAP_PX   = 80   vertical gap between consecutive sections above this        (B)
 */
import { chromium } from "playwright-core";
import fs from "node:fs/promises";
import path from "node:path";
import { PAGES, VIEWPORTS, ORIG_BASE, DEFAULT_LOCAL_BASE } from "./pages.mjs";

const EDGE_PX = 12;
const INSET_PX = 48;
const VPAD_PX = 100;
const VMAR_PX = 80;
const GAP_PX = 80;
const CAP = 500;

const args = process.argv.slice(2);
const getArg = (name, dflt) => {
  const a = args.find((x) => x.startsWith("--" + name + "="));
  return a ? a.split("=")[1] : dflt;
};

const SIDE = getArg("side", "local");
if (!["orig", "local"].includes(SIDE)) {
  console.error("usage: node scripts/audit/mobile-spacing.mjs [--side=local|orig] [--only=...] [--tag=...] [--base=...] [--out=...]");
  process.exit(1);
}
const ONLY = getArg("only", "").split(",").filter(Boolean);
const TAG = getArg("tag", "run");
const BASE = SIDE === "orig" ? ORIG_BASE : getArg("base", DEFAULT_LOCAL_BASE);
const OUT = path.resolve(getArg("out", "design/audit/mobile-spacing"));
const VP = VIEWPORTS.mobile;

const HIDE_DEV_STYLE =
  "nextjs-portal, [data-nextjs-toast], [data-nextjs-dialog], [data-nextjs-dev-tools-button] { display: none !important; }";

/** step down the page to trigger lazy loads / reveal animations, then return to top */
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

/** single in-page extractor, identical for both sides (section selection differs by `side`) */
const EXTRACT = ({ side, EDGE_PX, INSET_PX, VPAD_PX, CAP }) => {
  const rnd = (n) => Math.round(n);
  const cs = (el) => getComputedStyle(el);
  const px = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  const norm = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  const innerW = document.documentElement.clientWidth;
  const scrollY = window.scrollY;
  const docTop = (r) => r.top + scrollY;
  const docBottom = (r) => r.bottom + scrollY;

  const SKIP_SEL = "script, style, noscript, header, nav, template";
  const MEDIA_SEL = "img, picture, video, iframe, svg, button, input, select, textarea, table";

  // --- top-level visible sections (unchanged from v1) ---
  let sectionEls;
  if (side === "orig") {
    const all = [...document.querySelectorAll(".section_wrap")];
    const top = all.filter((el) => !el.parentElement.closest(".section_wrap"));
    sectionEls = top.length ? top : [...document.querySelectorAll("main section")];
  } else {
    const all = [...document.querySelectorAll("main section, main > div > section")];
    const top = all.filter((el) => !el.parentElement.closest("section"));
    sectionEls = top.length ? top : all;
  }
  sectionEls = sectionEls.filter((el) => {
    const c = cs(el);
    if (c.display === "none" || c.visibility === "hidden") return false;
    if (c.position === "fixed" || c.position === "sticky") return false;
    if (el.getBoundingClientRect().height <= 0) return false;
    return true;
  });

  const headingOf = (el) => {
    const h = el.querySelector("h1,h2,h3,h4,h5,h6");
    const t = h ? norm(h.innerText).slice(0, 70) : "";
    return t || norm(el.innerText).slice(0, 70);
  };

  const sections = sectionEls.map((el, i) => {
    const c = cs(el);
    const r = el.getBoundingClientRect();
    const top = r.top + scrollY;
    return {
      i,
      tag: el.tagName.toLowerCase(),
      id: el.id || "",
      cls: norm(typeof el.className === "string" ? el.className : "").slice(0, 120),
      heading: headingOf(el),
      top: rnd(top),
      h: rnd(r.height),
      bottom: rnd(top + r.height),
      padTop: rnd(px(c.paddingTop)),
      padBottom: rnd(px(c.paddingBottom)),
      marTop: rnd(px(c.marginTop)),
      marBottom: rnd(px(c.marginBottom)),
      minTextInset: null,
      medianTextInset: null,
      maxTextInset: null,
      e: null,
    };
  });

  sections.forEach((s, i) => {
    s.gapBefore = i > 0 ? s.top - sections[i - 1].bottom : null;
  });

  const secIndexOf = (el) => {
    for (let i = 0; i < sectionEls.length; i++) if (sectionEls[i].contains(el)) return i;
    return -1;
  };

  // per-section collections: gutter insets (GAP 3) + content intervals (GAP 2/E)
  const gutter = sections.map(() => []);
  const intervals = sections.map(() => []);

  // --- overflow-ancestor test with small memo (GAP 1 scroll classification) ---
  const ovfCache = new WeakMap();
  const inOverflowScroller = (start) => {
    let n = start;
    let d = 0;
    const stack = [];
    while (n && d < 10) {
      if (ovfCache.has(n)) {
        const v = ovfCache.get(n);
        for (const s of stack) ovfCache.set(s, v);
        return v;
      }
      stack.push(n);
      const c = cs(n);
      if (["auto", "scroll", "hidden"].includes(c.overflowX) || ["hidden", "auto", "scroll"].includes(c.overflow)) {
        for (const s of stack) ovfCache.set(s, true);
        return true;
      }
      n = n.parentElement;
      d++;
    }
    for (const s of stack) ovfCache.set(s, false);
    return false;
  };

  // --- GAP 1: walk every visible text node ---
  const flags = [];
  const scrollFlags = [];
  const range = document.createRange();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const tv = node.nodeValue;
      const tt = tv ? tv.trim() : "";
      if (!tt || tt.length < 2) return NodeFilter.FILTER_REJECT;
      const p = node.parentElement;
      if (!p) return NodeFilter.FILTER_REJECT;
      if (p.closest(SKIP_SEL)) return NodeFilter.FILTER_REJECT;
      if (typeof p.checkVisibility === "function" && !p.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let node;
  while ((node = walker.nextNode())) {
    const p = node.parentElement;
    range.selectNodeContents(node);
    const rawRects = [...range.getClientRects()].filter((r) => r.width > 0 || r.height > 0);
    if (!rawRects.length) continue;

    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    for (const r of rawRects) {
      if (r.left < left) left = r.left;
      if (r.right > right) right = r.right;
      const t = docTop(r);
      const b = docBottom(r);
      if (t < top) top = t;
      if (b > bottom) bottom = b;
    }
    if (right - left < 4) continue;

    const insetL = rnd(left);
    const insetR = rnd(innerW - right);
    const minInset = Math.min(insetL, insetR);
    const c = cs(p);
    const secI = secIndexOf(p);
    const base = {
      secI,
      tag: p.tagName.toLowerCase(),
      cls: norm(typeof p.className === "string" ? p.className : "").slice(0, 80),
      text: norm(node.nodeValue).slice(0, 70),
      left: rnd(left),
      right: rnd(right),
      top: rnd(top),
      bottom: rnd(bottom),
      insetL,
      insetR,
      fs: rnd(px(c.fontSize)),
      lh: rnd(px(c.lineHeight)),
    };

    const intersectsX = left < innerW && right > 0;
    if (!intersectsX || inOverflowScroller(p)) {
      scrollFlags.push({ ...base, kind: "scroll" });
      continue;
    }

    // in-view text node
    if (secI >= 0) {
      gutter[secI].push(minInset);
      intervals[secI].push([top, bottom]);
    }

    let kind = null;
    if (minInset < EDGE_PX) kind = "edge";
    else if (minInset > INSET_PX) kind = "inset";
    if (!kind) continue;
    flags.push({ ...base, kind, _min: minInset });
  }

  // --- GAP 2 (E): visible media rects also feed section content intervals ---
  for (const el of document.querySelectorAll(MEDIA_SEL)) {
    if (el.closest(SKIP_SEL)) continue;
    if (typeof el.checkVisibility === "function" && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    if (!(r.left < innerW && r.right > 0)) continue;
    const secI = secIndexOf(el);
    if (secI < 0) continue;
    intervals[secI].push([docTop(r), docBottom(r)]);
  }

  // merge overlapping/touching intervals -> bands; lead / trail / maxGap
  const eOf = (idx) => {
    const iv = intervals[idx].slice().sort((a, b) => a[0] - b[0]);
    if (!iv.length) return null;
    const bands = [];
    for (const [t, b] of iv) {
      const last = bands[bands.length - 1];
      if (last && t <= last[1]) {
        if (b > last[1]) last[1] = b;
      } else {
        bands.push([t, b]);
      }
    }
    const s = sections[idx];
    const lead = rnd(bands[0][0] - s.top);
    const trail = rnd(s.bottom - bands[bands.length - 1][1]);
    let maxGap = 0;
    let worstTop = null;
    for (let i = 1; i < bands.length; i++) {
      const gap = bands[i][0] - bands[i - 1][1];
      if (gap > maxGap) {
        maxGap = gap;
        worstTop = bands[i - 1][1];
      }
    }
    maxGap = rnd(maxGap);
    return {
      lead,
      trail,
      maxGap,
      worstGapTop: worstTop == null ? null : rnd(worstTop),
      worstGapHeight: maxGap,
      bands: bands.length,
      flagged: lead > VPAD_PX || trail > VPAD_PX || maxGap > VPAD_PX,
    };
  };

  // --- GAP 3: per-section min/median/max text gutter ---
  const median = (arr) => {
    const s = arr.slice().sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  };
  gutter.forEach((arr, i) => {
    if (arr.length) {
      sections[i].minTextInset = rnd(arr.reduce((a, b) => (b < a ? b : a), Infinity));
      sections[i].maxTextInset = rnd(arr.reduce((a, b) => (b > a ? b : a), -Infinity));
      sections[i].medianTextInset = rnd(median(arr));
    }
    sections[i].e = eOf(i);
  });

  // cap A/C: edges ascending by min inset, insets descending
  const edges = flags.filter((f) => f.kind === "edge").sort((a, b) => a._min - b._min);
  const insets = flags.filter((f) => f.kind === "inset").sort((a, b) => b._min - a._min);
  const edgeTotal = edges.length;
  const insetTotal = insets.length;
  const textFlags = [...edges, ...insets].slice(0, CAP).map(({ _min, ...rest }) => rest);

  const scrollTotal = scrollFlags.length;
  const scrollSample = scrollFlags.slice(0, CAP);
  const eCount = sections.filter((s) => s.e && s.e.flagged).length;

  return {
    title: document.title,
    scrollHeight: document.body.scrollHeight,
    clientWidth: innerW,
    overflowPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    sections,
    textFlags,
    scrollFlags: scrollSample,
    counts: { edge: edgeTotal, inset: insetTotal, e: eCount, scroll: scrollTotal },
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
    await page.goto(url, { waitUntil: "load", timeout: 60000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(600);
    await page.addStyleTag({ content: HIDE_DEV_STYLE });
    await scrollThrough(page);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(900);
    const data = await page.evaluate(EXTRACT, { side, EDGE_PX, INSET_PX, VPAD_PX, CAP });
    return { key, side, url, finalUrl: page.url(), ok: true, ...data };
  } finally {
    await ctx.close();
  }
}

const secHeading = (page, secI) => {
  if (!page.sections || secI == null || secI < 0 || !page.sections[secI]) return "(no section)";
  return page.sections[secI].heading || "(untitled)";
};

const esc = (s) => String(s == null ? "" : s).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

function pageStats(p) {
  const edge = p.counts ? p.counts.edge : (p.textFlags || []).filter((f) => f.kind === "edge").length;
  const inset = p.counts ? p.counts.inset : (p.textFlags || []).filter((f) => f.kind === "inset").length;
  const e = p.counts ? p.counts.e : (p.sections || []).filter((s) => s.e && s.e.flagged).length;
  const scroll = p.counts ? p.counts.scroll : (p.scrollFlags || []).length;
  const vpad = (p.sections || []).filter(
    (s) => s.padTop > VPAD_PX || s.padBottom > VPAD_PX || s.marTop > VMAR_PX || s.marBottom > VMAR_PX,
  ).length;
  const vgap = (p.sections || []).filter((s) => s.gapBefore != null && s.gapBefore > GAP_PX).length;
  return { edge, inset, e, scroll, vpad, vgap, ovf: p.overflowPx };
}

function buildMd(side, tag, out) {
  const iso = new Date().toISOString();
  const keys = Object.keys(out);
  const lines = [];
  lines.push(`# Mobile spacing audit (v2) — side=${side} tag=${tag} (${iso})`);
  lines.push("");
  lines.push(
    `Thresholds: EDGE_PX=${EDGE_PX} (A: text min inset < ${EDGE_PX}px), INSET_PX=${INSET_PX} (C: text min inset > ${INSET_PX}px), ` +
      `VPAD_PX=${VPAD_PX} (B: section pad, E: lead/trail/gap > ${VPAD_PX}px), VMAR_PX=${VMAR_PX} (B: section margin > ${VMAR_PX}px), GAP_PX=${GAP_PX} (B: section gap > ${GAP_PX}px).`,
  );
  lines.push("");
  lines.push(
    "A/C are text-node based (Range.getClientRects); off-screen / overflow-scroller text is classified as `scroll` and excluded. Every item carries document-Y `top`/`bottom` for cropping. Caps: 500 items per page.",
  );
  lines.push("");

  lines.push("## Page table");
  lines.push("");
  lines.push("| page | sections | A (edge) | C (inset) | E | scroll | vpad>100 | vgap>80 | overflowPx |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const key of keys) {
    const p = out[key];
    if (!p.ok) {
      lines.push(`| ${key} | FAIL | - | - | - | - | - | - | - |`);
      continue;
    }
    const st = pageStats(p);
    lines.push(
      `| ${key} | ${(p.sections || []).length} | ${st.edge} | ${st.inset} | ${st.e} | ${st.scroll} | ${st.vpad} | ${st.vgap} | ${st.ovf} |`,
    );
  }
  lines.push("");

  const renderFlagList = (kind) => {
    let any = false;
    for (const key of keys) {
      const p = out[key];
      if (!p.ok) continue;
      const items = (p.textFlags || []).filter((f) => f.kind === kind);
      if (!items.length) continue;
      any = true;
      lines.push(`### ${key}`);
      for (const f of items) {
        lines.push(
          `- \u00a7${esc(secHeading(p, f.secI))} [${f.tag} ${f.fs}/${f.lh}] left=${f.insetL} right=${f.insetR} top=${f.top} bottom=${f.bottom} :: "${esc(f.text)}"`,
        );
      }
      lines.push("");
    }
    return any;
  };

  lines.push(`## A — text near viewport edges (min inset < ${EDGE_PX}px)`);
  lines.push("");
  if (!renderFlagList("edge")) {
    lines.push("_none_");
    lines.push("");
  }

  lines.push(`## B — excessive vertical (pad > ${VPAD_PX}px, margin > ${VMAR_PX}px, or gap > ${GAP_PX}px)`);
  lines.push("");
  let anyB = false;
  for (const key of keys) {
    const p = out[key];
    if (!p.ok) continue;
    const off = (p.sections || []).filter(
      (s) =>
        s.padTop > VPAD_PX ||
        s.padBottom > VPAD_PX ||
        s.marTop > VMAR_PX ||
        s.marBottom > VMAR_PX ||
        (s.gapBefore != null && s.gapBefore > GAP_PX),
    );
    if (!off.length) continue;
    anyB = true;
    lines.push(`### ${key}`);
    for (const s of off) {
      lines.push(
        `- \u00a7${esc(s.heading || "(untitled)")} padTop=${s.padTop} padBottom=${s.padBottom} marTop=${s.marTop} marBottom=${s.marBottom} gapBefore=${s.gapBefore == null ? "-" : s.gapBefore}`,
      );
    }
    lines.push("");
  }
  if (!anyB) {
    lines.push("_none_");
    lines.push("");
  }

  lines.push(`## C — excessive horizontal insets (min inset > ${INSET_PX}px)`);
  lines.push("");
  if (!renderFlagList("inset")) {
    lines.push("_none_");
    lines.push("");
  }

  lines.push(`## E — internal vertical whitespace (lead > ${VPAD_PX}px, trail > ${VPAD_PX}px, or maxGap > ${VPAD_PX}px)`);
  lines.push("");
  let anyE = false;
  for (const key of keys) {
    const p = out[key];
    if (!p.ok) continue;
    const flagged = (p.sections || []).filter((s) => s.e && s.e.flagged);
    if (!flagged.length) continue;
    anyE = true;
    lines.push(`### ${key}`);
    for (const s of flagged) {
      const e = s.e;
      lines.push(
        `- \u00a7${esc(s.heading || "(untitled)")} sec=${s.top}-${s.bottom} lead=${e.lead} trail=${e.trail} maxGap=${e.maxGap} worstGapTop=${e.worstGapTop == null ? "-" : e.worstGapTop} h=${e.worstGapHeight} bands=${e.bands}`,
      );
    }
    lines.push("");
  }
  if (!anyE) {
    lines.push("_none_");
    lines.push("");
  }

  lines.push("## D — horizontal overflow");
  lines.push("");
  let anyD = false;
  for (const key of keys) {
    const p = out[key];
    if (!p.ok) continue;
    if (p.overflowPx > 2) {
      anyD = true;
      lines.push(`- ${key}: overflowPx=${p.overflowPx}`);
    }
  }
  if (!anyD) {
    lines.push("_none_");
    lines.push("");
  }

  lines.push("## scroll — off-screen / overflow-scroller text (excluded from A/C)");
  lines.push("");
  let anyS = false;
  for (const key of keys) {
    const p = out[key];
    if (!p.ok) continue;
    const n = p.counts ? p.counts.scroll : (p.scrollFlags || []).length;
    if (!n) continue;
    anyS = true;
    lines.push(`### ${key} — ${n} item(s)${n > CAP ? ` (first ${CAP} shown)` : ""}`);
    for (const f of (p.scrollFlags || []).slice(0, 20)) {
      lines.push(
        `- \u00a7${esc(secHeading(p, f.secI))} [${f.tag}] left=${f.insetL} right=${f.insetR} top=${f.top} bottom=${f.bottom} :: "${esc(f.text)}"`,
      );
    }
    lines.push("");
  }
  if (!anyS) {
    lines.push("_none_");
    lines.push("");
  }

  return lines.join("\n");
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const pages = PAGES.filter((p) => !ONLY.length || ONLY.includes(p.key));
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const out = {};
  const failures = [];

  for (const p of pages) {
    const url = BASE + (SIDE === "orig" ? p.orig : p.local);
    let record = null;
    let lastErr = null;
    for (let attempt = 1; attempt <= 2 && !record; attempt++) {
      try {
        record = await probeOne(browser, p.key, url, SIDE);
      } catch (e) {
        lastErr = e;
        console.error(`  [${SIDE}] ${p.key} attempt ${attempt} failed: ${e.message.split("\n")[0]}`);
      }
    }
    if (!record) {
      record = { key: p.key, side: SIDE, url, ok: false, error: lastErr ? lastErr.message.split("\n")[0] : "unknown error" };
      failures.push(p.key);
    }
    out[p.key] = record;

    if (record.ok) {
      const st = pageStats(record);
      console.log(
        `[${SIDE}] ${p.key} sections=${record.sections.length} A=${st.edge} C=${st.inset} E=${st.e} scroll=${st.scroll} vpad=${st.vpad} vgap=${st.vgap} ovf=${st.ovf}`,
      );
    } else {
      console.error(`[${SIDE}] ${p.key} FAILED: ${record.error}`);
    }
  }

  await browser.close();

  const jsonFile = path.join(OUT, `${SIDE}-${TAG}.json`);
  const mdFile = path.join(OUT, `summary-${SIDE}-${TAG}.md`);
  await fs.writeFile(jsonFile, JSON.stringify(out, null, 2), "utf8");
  await fs.writeFile(mdFile, buildMd(SIDE, TAG, out), "utf8");

  const okCount = pages.length - failures.length;
  const totals = Object.values(out).filter((r) => r.ok);
  const sumEdge = totals.reduce((a, r) => a + pageStats(r).edge, 0);
  const sumInset = totals.reduce((a, r) => a + pageStats(r).inset, 0);
  const sumE = totals.reduce((a, r) => a + pageStats(r).e, 0);
  const sumScroll = totals.reduce((a, r) => a + pageStats(r).scroll, 0);
  const sumOvf = totals.filter((r) => r.overflowPx > 2).length;
  console.log(
    `\n[${SIDE}] totals: pages=${okCount}/${pages.length} A=${sumEdge} C=${sumInset} E=${sumE} scroll=${sumScroll} overflowPages=${sumOvf} failures=${failures.length}`,
  );
  if (failures.length) console.error(`failed pages: ${failures.join(", ")}`);
  console.log(`wrote ${jsonFile}`);
  console.log(`wrote ${mdFile}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
