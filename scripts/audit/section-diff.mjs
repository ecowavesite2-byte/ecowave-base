/**
 * Visual audit — per-section IDLE-STATE pixel parity
 *
 * Unlike diff.mjs (32 equal horizontal bands per page), this tool measures the
 * live top-level content sections on each side, pairs them by index and diffs
 * each aligned pair out of the EXISTING full-page captures:
 *   design/audit/orig/<vp>/<key>.png  +  design/audit/local/<vp>/<key>.png
 * It reuses capture.mjs's exact navigate / scroll-through / force-reveal settle
 * procedure so the section geometry matches what was shot, then reuses diff.mjs's
 * pixelmatch conventions (threshold 0.1, includeAA false, alpha 0.5).
 *
 * Usage:
 *   node scripts/audit/section-diff.mjs --vp=desktop|mobile|both
 *        [--only=key1,key2] [--out=design/audit/sections] [--top=12]
 *        [--captures=design/audit] [--base=http://localhost:4517]
 *
 * Section selectors (evidence in the report; see also scripts/audit/README notes):
 *   orig : `#doz_body > .section_wrap`  (imweb wraps every page section in a
 *          top-level `.section_wrap` direct child of body#doz_body; header is
 *          `header#doz_header_wrap`, footer is a `.section_wrap` and is excluded
 *          by id). Hidden channel sections (`mobile_section` at desktop,
 *          `.mobile_hide` pc sections at mobile) collapse to 0 height and are
 *          dropped by the visibility filter. `position:fixed` elements (the
 *          imweb floating widget, a visible `mobile_section` at mobile) are
 *          dropped on both sides: they are not document-flow sections and their
 *          viewport rect cannot be cropped from a full-page capture.
 *   local: every `<section>` inside `<main>` that is NOT nested inside another
 *          `<section>` (i.e. `main > section` for the PageHero/hero/ticker and
 *          `main > div > section` for the SectionRenderer wrapper). Header and
 *          footer live outside `<main>` so they are naturally excluded.
 *
 * Outputs:
 *   <out>/report-<vp>.json
 *   <out>/report-<vp>.md
 *   <out>/crops/<vp>/<key>/<idx>-{orig,local,diff}.png   (worst --top sections)
 */
import { chromium } from "playwright-core";
import fs from "node:fs/promises";
import path from "node:path";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { PAGES, VIEWPORTS, ORIG_BASE, DEFAULT_LOCAL_BASE } from "./pages.mjs";

const args = process.argv.slice(2);
const getArg = (name, dflt) => {
  const a = args.find((x) => x.startsWith("--" + name + "="));
  return a ? a.split("=")[1] : dflt;
};

const VP_ARG = getArg("vp", getArg("viewport", "both"));
const VPS = VP_ARG === "both" ? ["desktop", "mobile"] : [VP_ARG];
for (const v of VPS) {
  if (!VIEWPORTS[v]) {
    console.error(`unknown viewport: ${v} (expected desktop|mobile|both)`);
    process.exit(1);
  }
}
const ONLY = getArg("only", "").split(",").filter(Boolean);
const OUT = path.resolve(getArg("out", "design/audit/sections"));
const CAPTURES = path.resolve(getArg("captures", "design/audit"));
const TOP = Math.max(1, Number.parseInt(getArg("top", "12"), 10) || 12);
const LOCAL_BASE = getArg("base", DEFAULT_LOCAL_BASE);
const LABEL_LEN = 40;

const pages = PAGES.filter((p) => !ONLY.length || ONLY.includes(p.key));

/**
 * The black imweb footer band is itself a top-level `.section_wrap`; its id is
 * shared with lib/page-hero.ts (FOOTER_SECTION_ID). The rebuild renders the
 * footer as a <footer> OUTSIDE <main>, so it is never in the local set — it
 * must be excluded here too or every page shows a phantom trailing mismatch.
 */
const FOOTER_SECTION_ID = "s20250811f489e3443bdbe";

/** harmless on production/original; hides local dev-tool overlays on the rebuild */
const HIDE_DEV_STYLE =
  "nextjs-portal, [data-nextjs-toast], [data-nextjs-dialog], [data-nextjs-dev-tools-button] { display: none !important; }";

/** verbatim from capture.mjs: reveal imweb entrance-animated widgets */
const FORCE_REVEAL_STYLE = `
  .wg_animated {
    visibility: visible !important;
    opacity: 1 !important;
    transition: none !important;
  }
`;

/** verbatim from capture.mjs: step down the page to trigger lazy loads, return to top */
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

/* ---------------- section measurement (runs in page context) ---------------- */

/**
 * Measured in the browser so it shares the exact post-settle layout. Returns the
 * VISIBLE top-level sections in document order:
 *   { domIndex, idx, top, height, width, label }
 * `domIndex` indexes the selector's full match list; `idx` is the dense index
 * over visible sections (the value used for pairing and crop filenames).
 */
function measureSections({ side, footerId, labelLen }) {
  const main = document.querySelector("main");
  let all;
  if (side === "orig") {
    all = [...document.querySelectorAll("#doz_body > .section_wrap")].filter(
      (el) => el.id !== footerId,
    );
  } else {
    if (!main) return [];
    all = [...main.querySelectorAll("section")].filter(
      (el) => el.closest("main") === main && !(el.parentElement && el.parentElement.closest("section")),
    );
  }

  const labelFor = (el) => {
    const head = el.querySelector("h1, h2, h3, h4, h5, h6");
    let t = head ? head.textContent || "" : "";
    if (!t.trim()) {
      const strong = el.querySelector("strong");
      t = strong ? strong.textContent || "" : "";
    }
    if (!t.trim()) t = el.textContent || "";
    return t.replace(/\s+/g, " ").trim().slice(0, labelLen);
  };

  const out = [];
  let idx = 0;
  all.forEach((el, domIndex) => {
    // position:fixed elements are viewport-anchored (floating menus/CTAs), not
    // document-flow sections: their rect is a viewport coordinate, so cropping
    // the full-page capture at `rect.top + scrollY` reads an arbitrary region and
    // misaligns index pairing. This only bites at mobile — the imweb floating
    // widget is a `mobile_section` that collapses to 0 height at desktop, so the
    // desktop-only validation never saw it.
    if (window.getComputedStyle(el).position === "fixed") return;
    const r = el.getBoundingClientRect();
    if (r.height <= 0 || r.width <= 0) return;
    out.push({
      domIndex,
      idx: idx++,
      top: Math.round(r.top + window.scrollY),
      height: Math.round(r.height),
      width: Math.round(r.width),
      label: labelFor(el),
    });
  });
  return out;
}

/** navigate one page/side and return its measured sections */
async function measureOne(browser, side, viewport, url) {
  const vp = VIEWPORTS[viewport];
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    colorScheme: "light",
  });
  try {
    const page = await ctx.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(url, { waitUntil: "load", timeout: 45000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(600);
    await page.addStyleTag({ content: HIDE_DEV_STYLE });
    await scrollThrough(page);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(900);
    if (side === "orig") {
      await page.addStyleTag({ content: FORCE_REVEAL_STYLE });
      await page.waitForTimeout(200);
    }
    return await page.evaluate(measureSections, {
      side,
      footerId: FOOTER_SECTION_ID,
      labelLen: LABEL_LEN,
    });
  } finally {
    await ctx.close();
  }
}

/* ---------------- cropping / diffing (mirrors diff.mjs) ---------------- */

/** top-left aligned x0,y0 crop into a fresh tightly-packed RGBA buffer */
function cropAt(data, srcW, x0, y0, w, h) {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const s = ((y0 + y) * srcW + x0) * 4;
    out.set(data.subarray(s, s + w * 4), y * w * 4);
  }
  return out;
}

const isDiffRed = (d, p) => d[p] > 200 && d[p + 1] < 80 && d[p + 2] < 80;

/** dimmed original with differing pixels drawn pure red (same as diff.mjs) */
function visualize(orig, diff, w, h) {
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    if (isDiffRed(diff, p)) {
      out[p] = 255;
      out[p + 1] = 0;
      out[p + 2] = 0;
      out[p + 3] = 255;
    } else {
      out[p] = Math.round(orig[p] * 0.4);
      out[p + 1] = Math.round(orig[p + 1] * 0.4);
      out[p + 2] = Math.round(orig[p + 2] * 0.4);
      out[p + 3] = 255;
    }
  }
  const png = new PNG({ width: w, height: h });
  png.data = out;
  return PNG.sync.write(png);
}

/** diff one aligned pair; returns stats plus the crop geometry actually used */
function diffPair(a, b, origSec, localSec) {
  const w = Math.min(a.width, b.width);
  const topO = Math.max(0, Math.min(origSec.top, a.height));
  const topL = Math.max(0, Math.min(localSec.top, b.height));
  // clamp each side's height to what fits in its own image before taking the min
  const fitO = a.height - topO;
  const fitL = b.height - topL;
  const h = Math.min(Math.max(0, Math.min(origSec.height, localSec.height)), fitO, fitL);
  if (h <= 0 || w <= 0) {
    return { w, h: 0, topO, topL, diffPixels: 0, diffPct: null, clipped: true, ca: null, cb: null, diff: null };
  }
  const ca = cropAt(a.data, a.width, 0, topO, w, h);
  const cb = cropAt(b.data, b.width, 0, topL, w, h);
  const diff = new Uint8Array(w * h * 4);
  const diffPixels = pixelmatch(ca, cb, diff, w, h, {
    threshold: 0.1,
    includeAA: false,
    alpha: 0.5,
  });
  return {
    w,
    h,
    topO,
    topL,
    diffPixels,
    diffPct: Number(((diffPixels / (w * h)) * 100).toFixed(3)),
    clipped: h < Math.min(origSec.height, localSec.height) || topO < origSec.top || topL < localSec.top,
    ca,
    cb,
    diff,
  };
}

/* ---------------- report building ---------------- */

async function comparePage(viewport, key) {
  const origPath = path.join(CAPTURES, "orig", viewport, `${key}.png`);
  const localPath = path.join(CAPTURES, "local", viewport, `${key}.png`);
  const a = PNG.sync.read(await fs.readFile(origPath));
  const b = PNG.sync.read(await fs.readFile(localPath));

  // measure both sides live (fresh navigation, same settle procedure as capture)
  const [origSecs, localSecs] = await Promise.all([
    measureOne(browserRef, "orig", viewport, ORIG_BASE + PAGES.find((p) => p.key === key).orig),
    measureOne(browserRef, "local", viewport, LOCAL_BASE + PAGES.find((p) => p.key === key).local),
  ]);

  const n = Math.min(origSecs.length, localSecs.length);
  const sections = [];
  for (let i = 0; i < n; i++) {
    const os = origSecs[i];
    const ls = localSecs[i];
    const d = diffPair(a, b, os, ls);
    sections.push({
      idx: i,
      label: os.label || ls.label || "",
      labelLocal: ls.label || "",
      origTop: os.top,
      localTop: ls.top,
      origH: os.height,
      localH: ls.height,
      dh: ls.height - os.height,
      alignedH: d.h,
      diffPixels: d.diffPixels,
      diffPct: d.diffPct,
      clipped: d.clipped,
      origDomIndex: os.domIndex,
      localDomIndex: ls.domIndex,
    });
  }

  const unmatchedOrig = origSecs.slice(n).map((s) => ({
    idx: s.idx,
    top: s.top,
    height: s.height,
    label: s.label,
  }));
  const unmatchedLocal = localSecs.slice(n).map((s) => ({
    idx: s.idx,
    top: s.top,
    height: s.height,
    label: s.label,
  }));

  const byWorst = [...sections].sort((x, y) => (y.diffPct ?? -1) - (x.diffPct ?? -1));

  // export crop triples for the worst TOP sections of this page
  for (const s of byWorst.slice(0, TOP)) {
    const i = s.idx;
    const d = diffPair(a, b, origSecs[i], localSecs[i]);
    if (!d.ca) continue;
    const dir = path.join(OUT, "crops", viewport, key);
    await fs.mkdir(dir, { recursive: true });
    const origPng = new PNG({ width: d.w, height: d.h });
    origPng.data = Buffer.from(d.ca);
    const localPng = new PNG({ width: d.w, height: d.h });
    localPng.data = Buffer.from(d.cb);
    await fs.writeFile(path.join(dir, `${i}-orig.png`), PNG.sync.write(origPng));
    await fs.writeFile(path.join(dir, `${i}-local.png`), PNG.sync.write(localPng));
    await fs.writeFile(path.join(dir, `${i}-diff.png`), visualize(d.ca, d.diff, d.w, d.h));
  }

  const pcts = sections.map((s) => s.diffPct).filter((p) => p != null);
  return {
    key,
    origH: a.height,
    localH: b.height,
    dh: b.height - a.height,
    comparedW: Math.min(a.width, b.width),
    origCount: origSecs.length,
    localCount: localSecs.length,
    structuralMismatch: origSecs.length !== localSecs.length,
    unmatchedOrig,
    unmatchedLocal,
    worstPct: pcts.length ? Math.max(...pcts) : null,
    meanPct: pcts.length ? Number((pcts.reduce((s, p) => s + p, 0) / pcts.length).toFixed(3)) : null,
    sections: byWorst,
  };
}

function mdReport(viewport, generatedAt, entries) {
  const lines = [];
  lines.push(`# ECOWAVE section-level visual audit — ${viewport}`);
  lines.push("");
  lines.push(`Generated: ${generatedAt}`);
  lines.push("");
  lines.push(
    "Sections are top-level content blocks measured live on each side after the capture.mjs",
  );
  lines.push(
    "scroll/reveal settle. Each aligned pair is cropped from the existing full-page captures",
  );
  lines.push(
    "(orig at its own section top, local at its own) and diffed with pixelmatch threshold 0.1.",
  );
  lines.push(
    "`diff %` = differing pixels over the compared (min-height) crop. Section rows sorted worst-first.",
  );
  lines.push("");

  lines.push("## Page summary (worst first)");
  lines.push("");
  lines.push("| page | worst % | mean % | orig h | local h | dh | sections (orig/local) | structural |");
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |");
  const sortedPages = [...entries].sort((p, q) => (q.worstPct ?? -1) - (p.worstPct ?? -1));
  if (!sortedPages.length) lines.push("| _(no pages compared)_ | | | | | | | |");
  for (const p of sortedPages) {
    lines.push(
      `| ${p.key} | ${p.worstPct == null ? "-" : p.worstPct.toFixed(2)} | ${
        p.meanPct == null ? "-" : p.meanPct.toFixed(2)
      } | ${p.origH} | ${p.localH} | ${p.dh} | ${p.origCount}/${p.localCount} | ${
        p.structuralMismatch ? "**MISMATCH**" : "ok"
      } |`,
    );
  }
  lines.push("");

  for (const p of sortedPages) {
    lines.push(`## ${p.key}`);
    lines.push("");
    if (p.structuralMismatch) {
      lines.push(
        `> Structural mismatch: orig has ${p.origCount} visible sections, local has ${p.localCount}. ` +
          `Paired the first ${Math.min(p.origCount, p.localCount)} by index; unmatched listed below.`,
      );
      lines.push("");
    }
    lines.push("| # | label | orig y | orig h | local h | dh | diff % | clipped |");
    lines.push("| ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |");
    for (const s of p.sections) {
      const label = (s.label || "_(no text)_").replace(/\|/g, "\\|");
      lines.push(
        `| ${s.idx} | ${label} | ${s.origTop} | ${s.origH} | ${s.localH} | ${s.dh} | ${
          s.diffPct == null ? "n/a" : s.diffPct.toFixed(2)
        } | ${s.clipped ? "yes" : ""} |`,
      );
    }
    for (const u of p.unmatchedOrig) {
      lines.push(`| ${u.idx} | _(orig only)_ ${(u.label || "").replace(/\|/g, "\\|")} | ${u.top} | ${u.height} | - | - | n/a | |`);
    }
    for (const u of p.unmatchedLocal) {
      lines.push(`| ${u.idx} | _(local only)_ ${(u.label || "").replace(/\|/g, "\\|")} | - | - | ${u.height} | - | n/a | |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/* ---------------- main ---------------- */

let browserRef = null;

async function main() {
  const generatedAt = new Date().toISOString();
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  browserRef = browser;
  console.log(
    `section-diff viewports=${VPS.join(",")} pages=${pages.length} top=${TOP} out=${OUT}`,
  );

  const missing = [];
  for (const viewport of VPS) {
    const entries = [];
    for (const p of pages) {
      const origPath = path.join(CAPTURES, "orig", viewport, `${p.key}.png`);
      const localPath = path.join(CAPTURES, "local", viewport, `${p.key}.png`);
      try {
        await fs.access(origPath);
        await fs.access(localPath);
      } catch {
        missing.push(`${viewport}/${p.key}`);
        continue;
      }
      const result = await comparePage(viewport, p.key);
      entries.push(result);
      console.log(
        `  [${viewport}] ${p.key} sections=${result.origCount}/${result.localCount}` +
          `${result.structuralMismatch ? " MISMATCH" : ""} worst=${result.worstPct?.toFixed(2)}% mean=${result.meanPct?.toFixed(2)}%`,
      );
    }

    await fs.mkdir(OUT, { recursive: true });
    await fs.writeFile(
      path.join(OUT, `report-${viewport}.json`),
      JSON.stringify(
        {
          generatedAt,
          viewport,
          top: TOP,
          selectors: {
            orig: "#doz_body > .section_wrap (footer id excluded, visible only)",
            local: "main section not nested in another section (visible only)",
          },
          pages: entries,
        },
        null,
        2,
      ),
    );
    await fs.writeFile(
      path.join(OUT, `report-${viewport}.md`),
      mdReport(viewport, generatedAt, entries),
    );
  }

  await browser.close();
  console.log(`\nwrote ${path.join(OUT, "report-<vp>.{json,md}")}`);
  if (missing.length) console.log("skipped (missing captures): " + missing.join(", "));
}

main().catch(async (e) => {
  console.error(e);
  if (browserRef) await browserRef.close().catch(() => {});
  process.exit(1);
});
