/**
 * Bilingual visible-text sweep (mobile + desktop optional).
 *
 * Loads every public page in both locales and extracts `document.body.innerText`
 * so untranslated leftovers can be spotted: Korean characters on EN pages, and
 * (sanity) Korean presence on KO pages.
 *
 * Usage:
 *   node scripts/audit/i18n-visible-sweep.mjs [--vp=mobile|desktop] [--tag=run] [--only=key1,key2]
 *
 * Writes design/audit/mobile-spacing/i18n-sweep-<vp>-<tag>.json and prints a table.
 */
import { chromium } from "playwright-core";
import fs from "node:fs/promises";
import path from "node:path";
import { PAGES, VIEWPORTS, DEFAULT_LOCAL_BASE } from "./pages.mjs";

const args = process.argv.slice(2);
const getArg = (n, d) => {
  const a = args.find((x) => x.startsWith("--" + n + "="));
  return a ? a.slice(n.length + 3) : d;
};
const VP = getArg("vp", "mobile");
const TAG = getArg("tag", "run");
const ONLY = getArg("only", "").split(",").filter(Boolean);
const BASE = getArg("base", DEFAULT_LOCAL_BASE);
const OUT = path.resolve("design/audit/mobile-spacing");

const HIDE_DEV_STYLE =
  "nextjs-portal, [data-nextjs-toast], [data-nextjs-dialog], [data-nextjs-dev-tools-button] { display: none !important; }";

const EXTRACT = () => {
  const t = document.body.innerText || "";
  // drop the language-switcher chrome before counting
  const cleaned = t
    .split("\n")
    .filter((l) => !/^\s*(한국어|ENGLISH|English|KOREAN)\s*$/.test(l))
    .join("\n");
  const ko = cleaned.match(/[\uAC00-\uD7AF]/g) || [];
  const snippets = [];
  if (ko.length) {
    const re = /[^\n]*[\uAC00-\uD7AF]+[^\n]*/g;
    const seen = new Set();
    let m;
    while ((m = re.exec(cleaned)) && snippets.length < 8) {
      const s = m[0].replace(/\s+/g, " ").trim().slice(0, 70);
      if (s && !seen.has(s)) {
        seen.add(s);
        snippets.push(s);
      }
    }
  }
  return { koCount: ko.length, snippets, textLen: cleaned.length };
};

async function main() {
  const vp = VIEWPORTS[VP] ?? VIEWPORTS.mobile;
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const out = {};
  const pages = PAGES.filter((p) => !ONLY.length || ONLY.includes(p.key));
  try {
    for (const p of pages) {
      const routes = [
        ["ko", p.local],
        ["en", p.local === "/" ? "/en" : "/en" + p.local],
      ];
      for (const [loc, route] of routes) {
        const key = loc + ":" + p.key;
        const ctx = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          deviceScaleFactor: 1,
          colorScheme: "light",
        });
        try {
          const page = await ctx.newPage();
          await page.emulateMedia({ reducedMotion: "reduce" });
          await page.goto(BASE + route, { waitUntil: "load", timeout: 60000 });
          await page.waitForLoadState("networkidle").catch(() => {});
          await page.addStyleTag({ content: HIDE_DEV_STYLE });
          await page.waitForTimeout(700);
          const data = await page.evaluate(EXTRACT);
          out[key] = { route, ...data, ok: true };
          const flag = loc === "en" && data.koCount > 0 ? "  <-- Korean on EN" : "";
          console.log(`[${loc}] ${p.key.padEnd(22)} koChars=${String(data.koCount).padStart(5)} len=${String(data.textLen).padStart(6)}${flag}`);
        } catch (e) {
          out[key] = { route, ok: false, error: e.message.split("\n")[0] };
          console.log(`[${loc}] ${p.key.padEnd(22)} FAILED: ${e.message.split("\n")[0]}`);
        } finally {
          await ctx.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
  await fs.mkdir(OUT, { recursive: true });
  const file = path.join(OUT, `i18n-sweep-${VP}-${TAG}.json`);
  await fs.writeFile(file, JSON.stringify(out, null, 2));

  const enBad = Object.entries(out).filter(([k, v]) => k.startsWith("en:") && v.ok && v.koCount > 0);
  console.log(`\nEN routes with visible Korean: ${enBad.length}`);
  for (const [k, v] of enBad) {
    console.log(`  ${k} (${v.koCount} chars):`);
    for (const s of v.snippets) console.log(`    - ${s}`);
  }
  console.log(`\nwrote ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
