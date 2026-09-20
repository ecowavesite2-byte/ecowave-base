/**
 * Mobile targeted DOM inspector — investigation probe.
 * Usage:
 *   node scripts/audit/mobile-dom.mjs --side=orig|local --key=news [--sel=".img_rendering,img"][--max=12]
 * Prints rect + key computed styles for matched elements, plus header/footer chrome.
 */
import { chromium } from "playwright-core";
import { PAGES, VIEWPORTS, ORIG_BASE, DEFAULT_LOCAL_BASE } from "./pages.mjs";

const args = process.argv.slice(2);
const getArg = (n, d) => { const a = args.find((x) => x.startsWith("--" + n + "=")); return a ? a.split("=")[1] : d; };
const SIDE = getArg("side");
const KEY = getArg("key");
const SEL = getArg("sel", "img");
const MAX = Number(getArg("max", "12"));
const BASE = SIDE === "orig" ? ORIG_BASE : getArg("base", DEFAULT_LOCAL_BASE);
const VP = VIEWPORTS.mobile;
const page = PAGES.find((p) => p.key === KEY);

const EXTRACT = ({ sel, max }) => {
  const rnd = (n) => Math.round(n);
  const brief = (el) => {
    const c = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const img = el.tagName === "IMG" ? el : el.querySelector("img");
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || "",
      cls: (typeof el.className === "string" ? el.className : "").replace(/\s+/g, " ").trim().slice(0, 80),
      top: rnd(r.top + window.scrollY), w: rnd(r.width), h: rnd(r.height),
      display: c.display, cols: c.gridTemplateColumns, flow: c.flexDirection,
      overflow: c.overflowX, position: c.position,
      childCount: el.children.length,
      img: img ? {
        src: (img.currentSrc || img.src || "").split("/").pop()?.slice(0, 40),
        nw: img.naturalWidth, nh: img.naturalHeight, dw: rnd(img.getBoundingClientRect().width), dh: rnd(img.getBoundingClientRect().height),
        srcset: (img.getAttribute("srcset") || "").slice(0, 70),
      } : null,
    };
  };
  const chrome = {};
  for (const q of ["header", "footer", "#doz_header", "[data-footer]", "#footer"]) {
    const el = document.querySelector(q);
    if (el) { const r = el.getBoundingClientRect(); const c = getComputedStyle(el); chrome[q] = { top: rnd(r.top + window.scrollY), h: rnd(r.height), w: rnd(r.width), display: c.display }; }
  }
  const out = [];
  for (const el of document.querySelectorAll(sel)) {
    if (out.length >= max) break;
    out.push(brief(el));
  }
  return { scrollHeight: document.body.scrollHeight, chrome, matches: out };
};

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const ctx = await browser.newContext({ viewport: { width: VP.width, height: VP.height }, deviceScaleFactor: 1, colorScheme: "light" });
  const p = await ctx.newPage();
  await p.emulateMedia({ reducedMotion: "reduce" });
  await p.goto(BASE + (SIDE === "orig" ? page.orig : page.local), { waitUntil: "load", timeout: 45000 });
  await p.waitForLoadState("networkidle").catch(() => {});
  await p.waitForTimeout(700);
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight + 1200; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); } window.scrollTo(0, 0); });
  await p.waitForTimeout(800);
  const data = await p.evaluate(EXTRACT, { sel: SEL, max: MAX });
  console.log(JSON.stringify(data, null, 2));
  await browser.close();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
