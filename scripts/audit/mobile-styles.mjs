/**
 * Mobile computed-style probe — investigation tool.
 * Dumps font-size / line-height / color / box metrics for elements matching a
 * CSS selector, on either side (orig | local), at the 390 mobile viewport.
 *
 * Usage:
 *   node scripts/audit/mobile-styles.mjs --side=orig --key=rnd --sel="#s202509091799d895b62ea td"
 *   node scripts/audit/mobile-styles.mjs --side=local --key=rnd --sel="main section:nth-of-type(4) td"
 *   [--max=20] [--props=font-size,line-height,color,margin-top]
 *
 * Prints one JSON line per matched element (tag, classes, rect, computed props).
 */
import { chromium } from "playwright-core";
import { PAGES, VIEWPORTS, ORIG_BASE, DEFAULT_LOCAL_BASE } from "./pages.mjs";

const args = process.argv.slice(2);
const getArg = (n, d) => {
  const a = args.find((x) => x.startsWith("--" + n + "="));
  // slice past the prefix so values containing "=" (e.g. [class*="x"]) survive
  return a ? a.slice(("--" + n + "=").length) : d;
};
const SIDE = getArg("side");
if (!["orig", "local"].includes(SIDE)) {
  console.error("usage: node scripts/audit/mobile-styles.mjs --side=orig|local --key=<page> --sel=\"<css>\" [--max=20]");
  process.exit(1);
}
const KEY = getArg("key");
const SEL = getArg("sel");
if (!KEY || !SEL) {
  console.error("need --key and --sel");
  process.exit(1);
}
const MAX = Number(getArg("max", "25"));
const PROPS = getArg(
  "props",
  "font-size,line-height,font-weight,color,text-align,margin-top,margin-bottom,padding-top,padding-bottom,width,height,display",
).split(",");
const BASE = SIDE === "orig" ? ORIG_BASE : getArg("base", DEFAULT_LOCAL_BASE);
const page = PAGES.find((p) => p.key === KEY);
if (!page) {
  console.error("unknown key " + KEY);
  process.exit(1);
}
const VP_NAME = getArg("vp", "mobile");
if (!VIEWPORTS[VP_NAME]) {
  console.error("unknown vp " + VP_NAME + " (expected desktop|mobile)");
  process.exit(1);
}
const VP = VIEWPORTS[VP_NAME];

const EXTRACT = ({ sel, max, props }) => {
  const rnd = (n) => Math.round(n * 100) / 100;
  const out = [];
  for (const el of document.querySelectorAll(sel)) {
    if (out.length >= max) break;
    const c = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const o = {
      tag: el.tagName.toLowerCase(),
      cls: (typeof el.className === "string" ? el.className : "").replace(/\s+/g, " ").trim().slice(0, 60),
      top: rnd(r.top + window.scrollY),
      left: rnd(r.left + window.scrollX),
      w: rnd(r.width),
      h: rnd(r.height),
      decl: (el.getAttribute("style") || "").replace(/\s+/g, " ").slice(0, 90),
      text: (el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 40),
      textc: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60),
    };
    for (const p of props) o[p] = c.getPropertyValue(p);
    out.push(o);
  }
  return { scrollHeight: document.body.scrollHeight, matches: out };
};

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const ctx = await browser.newContext({ viewport: { width: VP.width, height: VP.height }, deviceScaleFactor: 1, colorScheme: "light" });
  const p = await ctx.newPage();
  await p.emulateMedia({ reducedMotion: "reduce" });
  await p.goto(BASE + (SIDE === "orig" ? page.orig : page.local), { waitUntil: "load", timeout: 45000 });
  await p.waitForLoadState("networkidle").catch(() => {});
  await p.waitForTimeout(700);
  await p.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight + 1200; y += 700) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 40));
    }
    window.scrollTo(0, 0);
  });
  await p.waitForTimeout(800);
  const data = await p.evaluate(EXTRACT, { sel: SEL, max: MAX, props: PROPS });
  console.log(JSON.stringify(data, null, 1));
  await browser.close();
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
