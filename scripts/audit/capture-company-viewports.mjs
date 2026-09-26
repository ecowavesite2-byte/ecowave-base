/**
 * Company channel viewport capture + mobile-verification probe.
 *
 * Independent verification of the single-source migration on the company
 * channel: the mobile variant sections were deleted from company.about /
 * history / global, PC sections now render at every width, and the history era
 * photos surface at mobile through responsive `side_left` asides plus the
 * `MOBILE_IMAGE_SRC` portrait swaps (below 992px the authored image is hidden
 * and the curated portrait rendition shows).
 *
 * Also verifies the "edit-once company intro band" feature: `company`'s band is
 * canonical and the six subpages render its rows in place (local section
 * id/cls preserved). The `sharedBandParity` section measures the band (matched
 * by its unique bg image) plus its h6 metrics across all 7 `/company*` routes at
 * 1440 and 390 and asserts 0px tolerance equality against `/company`.
 *
 * Boots a dev server on a dedicated port (3127), captures full-page PNGs into
 * `design/audit/company-mobile/`, measures horizontal overflow and image
 * visibility, and writes one JSON report next to the PNGs.
 *
 * Usage:
 *   node scripts/audit/capture-company-viewports.mjs [--mode=all|captures|parity]
 *     [--port=3127] [--base=http://127.0.0.1:3127]
 *
 * `design/` is gitignored; screenshots/report are local evidence only.
 */
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const getArg = (name, dflt) => {
  const a = args.find((x) => x.startsWith("--" + name + "="));
  return a ? a.split("=")[1] : dflt;
};
const PORT = Number(getArg("port", "3127"));
const BASE = getArg("base", `http://127.0.0.1:${PORT}`);
const MANAGED = !args.some((x) => x.startsWith("--base="));
const MODE = getArg("mode", "all"); // all | captures | parity
const RUN_CAPTURES = MODE !== "parity";
const RUN_PARITY = MODE !== "captures";
const OUT = path.resolve("design", "audit", "company-mobile");

/** Unique background image of the shared company intro band (see lib/content/shared-intro.ts). */
const SHARED_BG = "269ab684758f0";

/**
 * Per-route image expectations. `portraits` are the curated `MOBILE_IMAGE_SRC`
 * renditions that must show below 992px; `authored` are the crawled PC sources
 * that must be hidden there (no duplicate image) and visible again at >=992px.
 */
const ROUTE_IMAGES = {
  "/company/about": {
    portraits: ["/images/thumbnail/20250919/196f5234277f5.jpg"],
    authored: ["/images/thumbnail/20250918/5cda7b9aa9b6e.jpg"],
  },
  "/en/company/about": {
    portraits: ["/images/thumbnail/20250919/67a21a7c80b5f.jpg"],
    authored: ["/images/thumbnail/20250919/4b6a298c59f93.jpg"],
  },
  "/company/history": {
    portraits: [
      "/images/thumbnail/20250911/8a464767025fa.jpg",
      "/images/thumbnail/20250911/3a403d278f3ca.jpg",
      "/images/thumbnail/20250911/f4ac0f6dcab6e.jpg",
    ],
    authored: [
      "/images/thumbnail/20250828/6b14cd3e03e4b.jpg",
      "/images/thumbnail/20250828/a183e714076fb.jpg",
      "/images/thumbnail/20250828/d7b2a8a54d3e2.jpg",
    ],
  },
  "/company/global": { portraits: [], authored: [] },
  "/en/company/history": { portraits: [], authored: [] },
};

// `/en/company/about` is not in the requested screenshot list but assertion 2
// requires its portrait at 390, so it is captured too.
const CAPTURES = [
  { vp: "390x844", width: 390, height: 844, route: "/company/about" },
  { vp: "390x844", width: 390, height: 844, route: "/en/company/about" },
  { vp: "390x844", width: 390, height: 844, route: "/company/history" },
  { vp: "390x844", width: 390, height: 844, route: "/en/company/history" },
  { vp: "390x844", width: 390, height: 844, route: "/company/global" },
  { vp: "768x1024", width: 768, height: 1024, route: "/company/about" },
  { vp: "768x1024", width: 768, height: 1024, route: "/company/history" },
  { vp: "768x1024", width: 768, height: 1024, route: "/company/global" },
  { vp: "1440x900", width: 1440, height: 900, route: "/company/history" },
];

/** Shared-intro parity matrix: all 7 `/company*` routes (ko) at both widths. */
const PARITY_ROUTES = [
  "/company",
  "/company/ceo",
  "/company/about",
  "/company/philosophy",
  "/company/history",
  "/company/organization",
  "/company/global",
];
const PARITY_VIEWPORTS = [
  { vp: "1440x900", width: 1440, height: 900 },
  { vp: "390x844", width: 390, height: 844 },
];

// Measured, INTENTIONAL exception: company.philosophy's §1 promise band keeps
// its mobile 48px-span line-height hook (`data-ph48`, `PH48_SECTION_IDS` in
// components/content/SectionRenderer.tsx, rule at app/globals.css:352, commit
// 386cf03 "company.philosophy - … promise-band line-height"). The shared-intro
// implementation preserves each page's local section id, so the hook still fires
// at <=991px and the band renders exactly this much shorter than the canonical
// /company band (48px spans at line-height 1.2 -> 33.6px instead of the
// inherited 1.4 -> 39.2px). Assert that documented state — not a 0px match — so
// a lost hook or a drift on any other route still fails.
const PHILOSOPHY_BAND_SHORTFALL = 16.78; // canonical band height - philosophy band height @390, px
const PHILOSOPHY_SPAN_LINE_HEIGHT = "33.6px";
const PHILOSOPHY_BAND_TOLERANCE = 1; // px

const slug = (route) => route.replace(/^\//, "").replace(/\//g, "-");

let dev = null;
let devLog = "";
if (MANAGED) {
  dev = spawn("npx", ["next", "dev", "--port", String(PORT)], {
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  dev.stdout.on("data", (d) => (devLog += d));
  dev.stderr.on("data", (d) => (devLog += d));
}
const killDev = () => {
  if (dev) {
    try { spawnSync("taskkill", ["/pid", String(dev.pid), "/T", "/F"], { stdio: "ignore" }); } catch {}
  }
};

async function waitReady() {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) return true; } catch {}
    await sleep(2500);
  }
  return false;
}

const HIDE_DEV =
  "nextjs-portal, [data-nextjs-toast], [data-nextjs-dialog], [data-nextjs-dev-tools-button] { display: none !important; }";
const FREEZE =
  "*, *::before, *::after { animation: none !important; transition: none !important; }";

/** Scroll the whole page (triggers lazy images/reveals), then settle. */
async function revealAndSettle(page) {
  await page.evaluate(async () => {
    const step = Math.max(300, Math.floor(window.innerHeight * 0.7));
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 100));
    }
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((r) => setTimeout(r, 400));
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 400));
  });
  // Lazy images: wait for the visible ones to finish decoding (hidden images
  // never load, so treat a zero-width box as "nothing to wait for").
  await page
    .waitForFunction(
      () =>
        [...document.images].every((i) => {
          const r = i.getBoundingClientRect();
          return i.complete || r.width === 0;
        }),
      null,
      { timeout: 10000 },
    )
    .catch(() => {});
  await page.waitForTimeout(500);
}

/**
 * Measure one page for the shared-intro parity matrix. Locates the band by the
 * unique bg image (the `<section>` whose subtree carries the url), then records
 * its box height plus the first h6's computed font-size/line-height, the first
 * h6 span's metrics (diagnostic), the `data-ph48` hook and the full-page height.
 */
async function measureBand(page, needle) {
  return page.evaluate((bg) => {
    const doc = document.scrollingElement || document.documentElement;
    const pageHeight = Math.round(doc.scrollHeight * 100) / 100;
    const sections = [...document.querySelectorAll("section")];
    let band = null;
    for (const s of sections) {
      if (s.querySelector(`[style*="${bg}"]`)) { band = s; break; }
    }
    if (!band) {
      const el = document.querySelector(`[style*="${bg}"]`);
      band = el ? el.closest("section") : null;
    }
    if (!band) return { found: false, pageHeight };

    const r = band.getBoundingClientRect();
    const h6s = [...band.querySelectorAll("h6")];
    const h6 = h6s[0] || null;
    const hcs = h6 ? getComputedStyle(h6) : null;
    const span = h6 ? h6.querySelector("span") : null;
    const scs = span ? getComputedStyle(span) : null;
    const round = (n) => Math.round(n * 100) / 100;
    return {
      found: true,
      sectionIndex: sections.indexOf(band),
      dataPh48: band.getAttribute("data-ph48"),
      bandHeight: round(r.height),
      bandTop: round(r.top),
      h6Count: h6s.length,
      h6FontSize: hcs ? hcs.fontSize : null,
      h6LineHeight: hcs ? hcs.lineHeight : null,
      spanCount: h6 ? h6.querySelectorAll("span").length : 0,
      spanFontSize: scs ? scs.fontSize : null,
      spanLineHeight: scs ? scs.lineHeight : null,
      h6Text: h6 ? h6.textContent.trim().slice(0, 40) : null,
      pageHeight,
    };
  }, needle);
}

const report = {
  base: BASE,
  out: path.relative(process.cwd(), OUT),
  mode: MODE,
  pass: false,
  cases: {
    overflow: { pass: true, details: [] },
    portraits: { pass: true, details: [] },
    swap: { pass: true, details: [] },
    desktop: { pass: true, details: [] },
  },
  sharedBandParity: null,
  captures: [],
  failures: [],
};

let browser;
try {
  if (!(await waitReady())) {
    console.log(JSON.stringify({ ...report, devReady: false, devLog: devLog.slice(-1200) }, null, 1));
    killDev();
    process.exit(1);
  }

  fs.mkdirSync(OUT, { recursive: true });
  browser = await chromium.launch();

  /* ------------------------------------------------------- existing captures */
  if (RUN_CAPTURES) {
    for (const cap of CAPTURES) {
      const cfg = ROUTE_IMAGES[cap.route] ?? { portraits: [], authored: [] };
      const page = await browser.newPage({ viewport: { width: cap.width, height: cap.height } });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.addStyleTag({ content: HIDE_DEV });
      await page.goto(`${BASE}${cap.route}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2500);
      await revealAndSettle(page);
      await page.addStyleTag({ content: FREEZE });
      await page.waitForTimeout(300);

      const data = await page.evaluate(
        ({ portraits, authored }) => {
          const vw = window.innerWidth;
          const scrolling = document.scrollingElement || document.documentElement;
          const scrollWidth = scrolling.scrollWidth;
          const docOverflow = scrollWidth - vw;

          const offenders = [];
          for (const el of document.querySelectorAll("body *")) {
            const r = el.getBoundingClientRect();
            if (r.width < 2 || r.height < 2) continue;
            if (r.right > vw + 3) {
              // Same ignore rules as check-home-overflow.mjs: expected off-canvas
              // UI (aria-hidden drawer), fixed chrome, and ancestors that already
              // clip/scroll the overflow cannot widen the document.
              if (el.closest('[aria-hidden="true"]')) continue;
              let fixedOrClipped = false;
              for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
                const cs = getComputedStyle(a);
                if (cs.position === "fixed") { fixedOrClipped = true; break; }
                if (a !== el && /^(hidden|clip|auto|scroll)$/.test(cs.overflowX)) {
                  fixedOrClipped = true;
                  break;
                }
              }
              if (fixedOrClipped) continue;
              offenders.push({
                tag: el.tagName.toLowerCase(),
                cls: (el.className || "").toString().slice(0, 80),
                left: Math.round(r.left),
                right: Math.round(r.right),
              });
            }
            if (offenders.length >= 12) break;
          }

          const imgState = (src) => {
            const out = [];
            for (const i of document.images) {
              if ((i.getAttribute("src") || "") !== src) continue;
              const cs = getComputedStyle(i);
              const r = i.getBoundingClientRect();
              out.push({
                display: cs.display,
                visibility: cs.visibility,
                left: Math.round(r.left),
                top: Math.round(r.top),
                width: Math.round(r.width),
                height: Math.round(r.height),
                naturalWidth: i.naturalWidth,
                complete: i.complete,
                visible:
                  cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0,
              });
            }
            return out;
          };

          return {
            vw,
            scrollWidth,
            docOverflow,
            offenders,
            portraits: portraits.map((src) => ({ src, instances: imgState(src) })),
            authored: authored.map((src) => ({ src, instances: imgState(src) })),
          };
        },
        { portraits: cfg.portraits, authored: cfg.authored },
      );

      const file = path.join(OUT, `${cap.vp}-${slug(cap.route)}.png`);
      await page.screenshot({ path: file, fullPage: true });
      const bytes = fs.statSync(file).size;
      await page.close();

      report.captures.push({
        viewport: cap.vp,
        width: cap.width,
        route: cap.route,
        file: path.relative(process.cwd(), file),
        bytes,
        scrollWidth: data.scrollWidth,
        innerWidth: data.vw,
        docOverflow: data.docOverflow,
        offenders: data.offenders,
      });

      /* Case 1 — no horizontal overflow at 390 / 768 (scrollWidth <= vw + 2). */
      if (cap.width <= 768) {
        const ok = data.docOverflow <= 2;
        report.cases.overflow.details.push({
          viewport: cap.vp,
          route: cap.route,
          scrollWidth: data.scrollWidth,
          innerWidth: data.vw,
          docOverflow: data.docOverflow,
          offenders: data.offenders,
          ok,
        });
        if (!ok) {
          report.cases.overflow.pass = false;
          report.failures.push(
            `overflow @ ${cap.vp} ${cap.route}: scrollWidth ${data.scrollWidth} > innerWidth ${data.vw} + 2`,
          );
        }
      }

      /* Case 2 — portrait renditions visible at 390. */
      if (cap.width === 390 && cfg.portraits.length > 0) {
        for (const { src, instances } of data.portraits) {
          const visible = instances.some((i) => i.visible);
          const ok = visible;
          report.cases.portraits.details.push({ viewport: cap.vp, route: cap.route, src, instances, ok });
          if (!ok) {
            report.cases.portraits.pass = false;
            report.failures.push(`portrait not visible @ ${cap.vp} ${cap.route}: ${src} (${JSON.stringify(instances)})`);
          }
        }
      }

      /* Case 3 — authored PC images hidden at 390 (swap engaged, no duplicate). */
      if (cap.width === 390 && cfg.authored.length > 0) {
        for (const { src, instances } of data.authored) {
          const stillVisible = instances.some((i) => i.visible);
          const ok = !stillVisible;
          report.cases.swap.details.push({ viewport: cap.vp, route: cap.route, src, instances, ok });
          if (!ok) {
            report.cases.swap.pass = false;
            report.failures.push(`authored image still visible @ ${cap.vp} ${cap.route}: ${src} (${JSON.stringify(instances)})`);
          }
        }
      }

      /* Case 4 — desktop 1440: PC era images visible (asides active) + no overflow. */
      if (cap.width >= 992) {
        for (const { src, instances } of data.authored) {
          const visible = instances.some((i) => i.visible);
          const ok = visible;
          report.cases.desktop.details.push({ viewport: cap.vp, route: cap.route, src, instances, ok });
          if (!ok) {
            report.cases.desktop.pass = false;
            report.failures.push(`desktop authored image not visible @ ${cap.vp} ${cap.route}: ${src} (${JSON.stringify(instances)})`);
          }
        }
        const overflowOk = data.docOverflow <= 2;
        report.cases.desktop.details.push({
          viewport: cap.vp,
          route: cap.route,
          check: "noHorizontalOverflow",
          scrollWidth: data.scrollWidth,
          innerWidth: data.vw,
          docOverflow: data.docOverflow,
          offenders: data.offenders,
          ok: overflowOk,
        });
        if (!overflowOk) {
          report.cases.desktop.pass = false;
          report.failures.push(
            `desktop overflow @ ${cap.vp} ${cap.route}: scrollWidth ${data.scrollWidth} > innerWidth ${data.vw} + 2`,
          );
        }
      }
    }
  }

  /* ------------------------------------------- shared intro band parity */
  if (RUN_PARITY) {
    report.sharedBandParity = {
      bg: SHARED_BG,
      reference: "/company",
      pass: true,
      viewports: {},
      shots: [],
      failures: [],
    };
    const parity = report.sharedBandParity;

    for (const vp of PARITY_VIEWPORTS) {
      const result = { reference: null, routes: {}, comparisons: [], ok: true };
      for (const route of PARITY_ROUTES) {
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.addStyleTag({ content: HIDE_DEV });
        await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2500);
        await revealAndSettle(page);
        await page.addStyleTag({ content: FREEZE });
        await page.waitForTimeout(300);

        const measured = await measureBand(page, SHARED_BG);

        const file = path.join(OUT, `shared-${vp.vp}-${slug(route)}.png`);
        await page.screenshot({ path: file, fullPage: true });
        parity.shots.push({ viewport: vp.vp, route, file: path.relative(process.cwd(), file) });
        await page.close();

        result.routes[route] = measured;
        if (route === parity.reference) result.reference = measured;
      }

      const ref = result.reference;
      if (!ref || !ref.found) {
        result.ok = false;
        parity.pass = false;
        parity.failures.push(`parity @ ${vp.vp}: reference ${parity.reference} band not found (${JSON.stringify(ref)})`);
      } else {
        for (const route of PARITY_ROUTES) {
          const m = result.routes[route];
          if (!m || !m.found) {
            result.ok = false;
            parity.pass = false;
            parity.failures.push(`parity @ ${vp.vp} ${route}: band not found`);
            continue;
          }
          // The philosophy band at 390 has a documented, intentional shortfall
          // (see the PHILOSOPHY_* constants above); every other route must match
          // the canonical /company band exactly at both viewports.
          const isPhilosophyException = vp.width === 390 && route === "/company/philosophy";
          const deltas = {
            bandHeight: Math.round((m.bandHeight - ref.bandHeight) * 100) / 100,
            h6FontSize: m.h6FontSize === ref.h6FontSize ? 0 : `${m.h6FontSize} vs ${ref.h6FontSize}`,
            h6LineHeight: m.h6LineHeight === ref.h6LineHeight ? 0 : `${m.h6LineHeight} vs ${ref.h6LineHeight}`,
          };
          let ok;
          if (isPhilosophyException) {
            const expectedBandHeight =
              Math.round((ref.bandHeight - PHILOSOPHY_BAND_SHORTFALL) * 100) / 100;
            const bandOk = Math.abs(m.bandHeight - expectedBandHeight) <= PHILOSOPHY_BAND_TOLERANCE;
            const spanOk = m.spanLineHeight === PHILOSOPHY_SPAN_LINE_HEIGHT;
            const ph48Ok = m.dataPh48 === "1";
            const h6Ok = m.h6FontSize === ref.h6FontSize && m.h6LineHeight === ref.h6LineHeight;
            ok = bandOk && spanOk && ph48Ok && h6Ok;
            deltas.expectedShortfall = -PHILOSOPHY_BAND_SHORTFALL;
            deltas.expectedBandHeight = expectedBandHeight;
            deltas.spanLineHeight = `${m.spanLineHeight} (expected ${PHILOSOPHY_SPAN_LINE_HEIGHT})`;
            deltas.dataPh48 = m.dataPh48;
            parity.philosophyHook = {
              viewport: vp.vp,
              route,
              dataPh48: m.dataPh48,
              spanLineHeight: m.spanLineHeight,
              bandHeight: m.bandHeight,
              expectedBandHeight,
              tolerance: PHILOSOPHY_BAND_TOLERANCE,
              ok,
            };
            if (!ok) {
              parity.failures.push(
                `philosophy exception @ ${vp.vp}: band ${m.bandHeight} (expected ${expectedBandHeight}±${PHILOSOPHY_BAND_TOLERANCE}), ` +
                  `span lh ${m.spanLineHeight} (expected ${PHILOSOPHY_SPAN_LINE_HEIGHT}), data-ph48 ${JSON.stringify(m.dataPh48)}`,
              );
            }
          } else {
            ok =
              m.bandHeight === ref.bandHeight &&
              m.h6FontSize === ref.h6FontSize &&
              m.h6LineHeight === ref.h6LineHeight;
          }
          result.comparisons.push({
            route,
            expected: isPhilosophyException ? "philosophy-48px-hook" : "strict-0px",
            ok,
            deltas,
          });
          if (!ok) {
            result.ok = false;
            parity.pass = false;
            if (!isPhilosophyException) {
              parity.failures.push(
                `parity @ ${vp.vp} ${route}: band ${m.bandHeight} (ref ${ref.bandHeight}), ` +
                  `h6 ${m.h6FontSize}/${m.h6LineHeight} (ref ${ref.h6FontSize}/${ref.h6LineHeight})`,
              );
            }
          }
        }
      }
      parity.viewports[vp.vp] = result;
    }

    if (!parity.philosophyHook) {
      parity.philosophyHook = {
        viewport: "390x844",
        route: "/company/philosophy",
        dataPh48: null,
        spanLineHeight: null,
        bandHeight: null,
        expectedBandHeight: null,
        ok: false,
      };
      parity.pass = false;
      parity.failures.push("philosophy exception @ 390x844: band not measured");
    }
  }

  const capturesPass =
    report.cases.overflow.pass &&
    report.cases.portraits.pass &&
    report.cases.swap.pass &&
    report.cases.desktop.pass;
  report.pass =
    (!RUN_CAPTURES || capturesPass) &&
    (!RUN_PARITY || (report.sharedBandParity && report.sharedBandParity.pass));
} catch (e) {
  report.error = String((e && e.stack) || e).slice(0, 900);
  report.pass = false;
  report.failures.push(`script error: ${report.error}`);
} finally {
  try { if (browser) await browser.close(); } catch {}
  killDev();
  report.devLogTail = report.pass ? undefined : devLog.slice(-1200);
  try {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 1));
  } catch (e) {
    report.reportWriteError = String(e).slice(0, 200);
  }
  console.log(JSON.stringify(report, null, 1));
}
process.exit(report.pass ? 0 : 1);
