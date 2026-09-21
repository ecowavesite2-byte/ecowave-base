/**
 * Dump CSS rules whose selector matches a regex, from a page (orig|local).
 * Usage: node scripts/audit/mobile-cssrules.mjs --side=orig --key=rnd --re="table-responsive|tableHorizontal"
 */
import { chromium } from "playwright-core";
import { PAGES, VIEWPORTS, ORIG_BASE, DEFAULT_LOCAL_BASE } from "./pages.mjs";

const args = process.argv.slice(2);
const getArg = (n, d) => {
  const a = args.find((x) => x.startsWith("--" + n + "="));
  return a ? a.split("=")[1] : d;
};
const SIDE = getArg("side", "orig");
const KEY = getArg("key", "rnd");
const RE = getArg("re", "table-responsive");
const BASE = SIDE === "orig" ? ORIG_BASE : getArg("base", DEFAULT_LOCAL_BASE);
const page = PAGES.find((p) => p.key === KEY);
const VP = VIEWPORTS.mobile;

const EXTRACT = ({ re }) => {
  const rx = new RegExp(re, "i");
  const out = [];
  const walk = (rules, media) => {
    for (const r of rules) {
      if (r.cssRules && (r.type === 4 || r.type === 12 || r.conditionText !== undefined)) {
        walk(r.cssRules, r.conditionText || media);
        continue;
      }
      if (r.selectorText && rx.test(r.selectorText)) {
        out.push({ media: media || null, selector: r.selectorText, css: r.style.cssText.slice(0, 300) });
      }
    }
  };
  for (const sh of document.styleSheets) {
    try {
      walk(sh.cssRules, null);
    } catch {}
  }
  return out;
};

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const ctx = await browser.newContext({ viewport: { width: VP.width, height: VP.height }, deviceScaleFactor: 1, colorScheme: "light" });
  const p = await ctx.newPage();
  await p.goto(BASE + (SIDE === "orig" ? page.orig : page.local), { waitUntil: "load", timeout: 45000 });
  await p.waitForTimeout(1500);
  const rules = await p.evaluate(EXTRACT, { re: RE });
  console.log(JSON.stringify(rules, null, 1));
  await browser.close();
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
