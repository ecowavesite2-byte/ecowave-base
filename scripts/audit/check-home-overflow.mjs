/**
 * Home responsive sanity probe (Gate evidence).
 *
 * Boots a dev server (or uses --base) and checks `/` and `/en` at mobile and
 * tablet widths for the classic single-source regressions:
 *   - horizontal document overflow (scrollWidth > viewport)
 *   - off-screen elements (rects crossing the viewport edges)
 *   - raw desktop video boxes (iframe height >> 16:9 for its width)
 *   - hero band height at 390 (should stay the ~356px mobile band)
 *
 * Usage: node scripts/audit/check-home-overflow.mjs [--label=phase1] [--port=3126] [--base=http://...]
 * Prints one JSON report; exit 1 when any FAIL-level check trips.
 */
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const getArg = (name, dflt) => {
  const a = args.find((x) => x.startsWith("--" + name + "="));
  return a ? a.split("=")[1] : dflt;
};
const LABEL = getArg("label", "probe");
const PORT = Number(getArg("port", "3126"));
const BASE = getArg("base", `http://127.0.0.1:${PORT}`);
const MANAGED = !args.some((x) => x.startsWith("--base="));

const VIEWPORTS = [
  { name: "390", width: 390, height: 844, strict: true },
  { name: "768", width: 768, height: 1024, strict: true },
  // 1024 sits inside the pre-existing desktop band (the imweb 1280px layout is
  // rendered from 1024 up: 15px ticker negative margins, 1250px mission image),
  // which existed before the single-source migration and is recorded as
  // accepted in the deepwork file. Keep it informational, not a gate failure.
  { name: "1024", width: 1024, height: 768, strict: false },
];

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

const report = { label: LABEL, base: BASE, checks: [], pass: false };
let fail = false;
try {
  if (!(await waitReady())) {
    console.log(JSON.stringify({ ...report, devReady: false, devLog: devLog.slice(-1200) }, null, 1));
    killDev();
    process.exit(1);
  }

  const browser = await chromium.launch();
  for (const vp of VIEWPORTS) {
    for (const locale of ["ko", "en"]) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      const url = locale === "ko" ? `${BASE}/` : `${BASE}/en`;
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2500);
      // Reveal animations use transforms, which distort scrollWidth/rects while
      // they run (measured: +200-400px phantom overflow). Freeze them before
      // scrolling so only real layout overflow is measured.
      await page.addStyleTag({
        content: "*, *::before, *::after { animation: none !important; transition: none !important; }",
      });
      await page.waitForTimeout(300);
      await page.evaluate(async () => {
        const step = Math.max(300, Math.floor(window.innerHeight * 0.8));
        for (let y = 0; y < document.body.scrollHeight; y += step) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 100));
        }
        window.scrollTo(0, 0);
        await new Promise((r) => setTimeout(r, 300));
      });

      const data = await page.evaluate(() => {
        const vw = window.innerWidth;
        const docOverflow = document.documentElement.scrollWidth - vw;
        const offenders = [];
        for (const el of document.querySelectorAll("body *")) {
          const r = el.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) continue;
          // Only RIGHT-side overflow can create a horizontal scrollbar in LTR;
          // left-bleeding decoration (imweb gutter margins) is clipped by the
          // viewport edge and is not a defect.
          if (r.right > vw + 3) {
            // expected off-canvas UI: the closed mobile drawer lives in an
            // aria-hidden subtree; overlays and fixed chrome are positioned
            // off-screen by design.
            if (el.closest('[aria-hidden="true"]')) continue;
            let fixedOrClipped = false;
            for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
              const cs = getComputedStyle(a);
              if (cs.position === "fixed") {
                fixedOrClipped = true;
                break;
              }
              if (a !== el && /^(hidden|clip|auto|scroll)$/.test(cs.overflowX)) {
                // an ancestor already clips/scrolls this overflow, so it cannot
                // widen the document (e.g. the ticker sections' overflow-x-clip)
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
        const iframes = [...document.querySelectorAll("iframe")].map((f) => {
          const r = f.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height), src: (f.getAttribute("src") || "").slice(0, 60) };
        });
        const hero = document.querySelector(".hero-carousel");
        const heroRect = hero ? hero.getBoundingClientRect() : null;
        return {
          viewport: vw,
          docOverflow,
          offenders,
          iframes,
          heroHeight: heroRect ? Math.round(heroRect.height) : null,
        };
      });
      await page.close();

      const srcs = data.iframes.map((f) => f.src).filter(Boolean);
      const checks = {
        noHorizontalOverflow: data.docOverflow <= 2,
        noOffscreenElements: data.offenders.length === 0,
        iframesLookMobile: data.iframes.every((f) => f.h <= 500 || f.w >= 700),
        heroBandAt390: vp.width !== 390 || (data.heroHeight !== null && data.heroHeight <= 500),
        // one embed per source (catches hidden duplicate iframes still fetching)
        noDuplicateEmbeds: new Set(srcs).size === srcs.length,
      };
      const ok = Object.values(checks).every(Boolean);
      if (!ok && vp.strict) fail = true;
      report.checks.push({ viewport: vp.name, locale, strict: vp.strict, ...checks, ok, data });
    }
  }
  await browser.close();
  report.pass = !fail;
} catch (e) {
  report.error = String((e && e.stack) || e).slice(0, 700);
  report.pass = false;
} finally {
  killDev();
  try {
    const fs = await import("node:fs");
    fs.mkdirSync("design/audit", { recursive: true });
    fs.writeFileSync(`design/audit/home-${LABEL}-overflow.json`, JSON.stringify(report, null, 1));
  } catch {}
  console.log(JSON.stringify(report, null, 1));
}
process.exit(fail ? 1 : 0);
