/**
 * Style probe — computed-style sampler for one side (orig | local).
 * INVESTIGATION ONLY: reads computed styles + document.fonts, writes JSON
 * artifacts under design/audit/style-probe/<side>-<vp>[-tag].json.
 *
 * Samples BOTH typography and MOTION/EFFECT declarations (transition*,
 * animation*, transform, opacity, willChange, backgroundAttachment) so the
 * style-diff can compare motion parity. The motion keys are additive — the
 * original JSON schema is unchanged for consumers that read only typography.
 *
 * Usage:
 *   node scripts/audit/style-probe.mjs --side=orig|local [--vp=desktop|mobile|both] [--only=home,news] [--base=...] [--tag=motion]
 *
 *   --tag=<name>   append `-<name>` to the output filename so a partial run
 *                  (e.g. --only=home,news --tag=motion) does NOT clobber the
 *                  full artifact. Default: no suffix (`orig-desktop.json`).
 *
 * Examples:
 *   # full desktop pass for both sides (writes orig-desktop.json / local-desktop.json)
 *   node scripts/audit/style-probe.mjs --side=orig  --vp=desktop
 *   node scripts/audit/style-probe.mjs --side=local --vp=desktop
 *   # 3-page motion proof pass, non-destructive
 *   node scripts/audit/style-probe.mjs --side=orig --vp=desktop --only=home,company.about,news --tag=motion
 *
 * Reuses the capture.mjs browser setup (chrome channel, dsf 1, light, reduced
 * motion, scroll-flatten) so measurements match the audit PNGs.
 */
import { chromium } from "playwright-core";
import fs from "node:fs/promises";
import path from "node:path";
import { PAGES, VIEWPORTS, ORIG_BASE, DEFAULT_LOCAL_BASE } from "./pages.mjs";

const args = process.argv.slice(2);
const getArg = (name, dflt) => {
  const a = args.find((x) => x.startsWith("--" + name + "="));
  return a ? a.split("=")[1] : dflt;
};

const SIDE = getArg("side");
if (!["orig", "local"].includes(SIDE)) {
  console.error("usage: node scripts/audit/style-probe.mjs --side=orig|local [--vp=desktop|mobile|both] [--only=...] [--base=...]");
  process.exit(1);
}
const VP_ARG = getArg("vp", "both");
const VPS = VP_ARG === "both" ? ["desktop", "mobile"] : [VP_ARG];
for (const v of VPS) {
  if (!VIEWPORTS[v]) {
    console.error(`unknown viewport: ${v} (expected desktop|mobile|both)`);
    process.exit(1);
  }
}
const ONLY = getArg("only", "").split(",").filter(Boolean);
const TAG_RAW = getArg("tag", "");
const TAG = TAG_RAW ? (/^[-_]/.test(TAG_RAW) ? TAG_RAW : "-" + TAG_RAW) : "";
if (TAG && !/^[-_][A-Za-z0-9._-]*$/.test(TAG)) {
  console.error(`invalid --tag: ${TAG_RAW} (use letters/digits/._-)`);
  process.exit(1);
}
const BASE = SIDE === "orig" ? ORIG_BASE : getArg("base", DEFAULT_LOCAL_BASE);
const OUT = path.resolve("design/audit/style-probe");

const PER_SEL_CAP = 40;
const TOTAL_CAP = 700;
const SELECTORS = [
  "body", "h1", "h2", "h3", "h4", "p", "strong", "em", "a", "button", "li", "td", "th",
  ".section_tit", ".btn", '[class*="btn"]', "header a", "nav a", "footer a", "footer p",
];

/** motion / effect declarations sampled alongside typography (additive). */
const MOTION_FIELDS = [
  "transitionProperty", "transitionDuration", "transitionTimingFunction", "transitionDelay",
  "animationName", "animationDuration", "animationTimingFunction", "animationDelay",
  "animationIterationCount", "animationFillMode",
  "transform", "opacity", "willChange", "backgroundAttachment",
];

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

const EXTRACT = ({ selectors, perSel, totalCap, motionFields }) => {
  const norm = (s, n) => (s || "").replace(/\s+/g, " ").trim().slice(0, n);
  const cls = (el) => (typeof el.className === "string" ? norm(el.className, 60) : "");
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    if (el === document.body || el === document.documentElement) return true;
    return el.offsetParent !== null;
  };

  const samples = [];
  for (const sel of selectors) {
    if (samples.length >= totalCap) break;
    let els;
    try {
      els = [...document.querySelectorAll(sel)];
    } catch {
      continue;
    }
    let n = 0;
    for (const el of els) {
      if (n >= perSel || samples.length >= totalCap) break;
      if (!visible(el)) continue;
      const cs = getComputedStyle(el);
      const sample = {
        sel,
        tag: el.tagName.toLowerCase(),
        cls: cls(el),
        text: norm(el.innerText, 60),
        fontFamily: cs.fontFamily,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        lineHeight: cs.lineHeight,
        letterSpacing: cs.letterSpacing,
        color: cs.color,
        textAlign: cs.textAlign,
        textTransform: cs.textTransform,
      };
      for (const p of motionFields) sample[p] = cs[p];
      samples.push(sample);
      n++;
    }
  }

  const seen = new Set();
  const fonts = [];
  for (const f of document.fonts) {
    const k = `${f.family}|${f.weight}|${f.style}|${f.status}`;
    if (seen.has(k)) continue;
    seen.add(k);
    fonts.push({ family: f.family, weight: f.weight, style: f.style, status: f.status });
  }

  return { samples, fonts };
};

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const pages = PAGES.filter((p) => !ONLY.length || ONLY.includes(p.key));
  const browser = await chromium.launch({ channel: "chrome", headless: true });

  for (const vpName of VPS) {
    const vp = VIEWPORTS[vpName];
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      colorScheme: "light",
    });
    const page = await ctx.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });
    const out = {};

    for (const p of pages) {
      const url = BASE + (SIDE === "orig" ? p.orig : p.local);
      try {
        await page.goto(url, { waitUntil: "load", timeout: 30000 });
        await page.waitForTimeout(1200);
        await page.addStyleTag({ content: HIDE_DEV_STYLE }).catch(() => {});
        await scrollThrough(page);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(400);
        const data = await page.evaluate(EXTRACT, {
          selectors: SELECTORS,
          perSel: PER_SEL_CAP,
          totalCap: TOTAL_CAP,
          motionFields: MOTION_FIELDS,
        });
        out[p.key] = { key: p.key, url, vp: vpName, samples: data.samples, fonts: data.fonts };
        console.log(`[${SIDE}/${vpName}] ${p.key} ok samples=${data.samples.length} fonts=${data.fonts.length}`);
      } catch (e) {
        const msg = (e && e.message ? e.message : String(e)).split("\n")[0];
        console.error(`[${SIDE}/${vpName}] ${p.key} FAIL ${msg}`);
        out[p.key] = { key: p.key, url, vp: vpName, samples: [], fonts: [], error: msg };
      }
    }

    await ctx.close();
    const file = path.join(OUT, `${SIDE}-${vpName}${TAG}.json`);
    await fs.writeFile(file, JSON.stringify(out, null, 2));
    console.log(`wrote ${file}`);
  }

  await browser.close();
}

main().catch((e) => {
  console.error((e && e.message ? e.message : String(e)).split("\n")[0]);
});
