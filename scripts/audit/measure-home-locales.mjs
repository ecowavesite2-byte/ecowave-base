/**
 * Measure the rendered home page per section for both locales.
 * Boots a dev server on 3128 and prints per-section height/width/background at
 * 1440 and 390, plus the page height, for a KO-vs-EN diff.
 */
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import fs from "node:fs";
import { chromium } from "playwright-core";

const PORT = 3128;
const BASE = `http://127.0.0.1:${PORT}`;
const dev = spawn("npx", ["next", "dev", "--port", String(PORT)], { shell: true, stdio: ["ignore", "pipe", "pipe"] });
let log = "";
dev.stdout.on("data", (d) => (log += d));
dev.stderr.on("data", (d) => (log += d));
const kill = () => { try { spawnSync("taskkill", ["/pid", String(dev.pid), "/T", "/F"], { stdio: "ignore" }); } catch {} };

async function ready() {
  const t = Date.now() + 180000;
  while (Date.now() < t) { try { const r = await fetch(BASE); if (r.ok) return true; } catch {} await sleep(2500); }
  return false;
}

const measure = async (page) => {
  await page.evaluate(async () => {
    const s = Math.max(300, Math.floor(innerHeight * 0.8));
    for (let y = 0; y < document.body.scrollHeight; y += s) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
    scrollTo(0, 0); await new Promise((r) => setTimeout(r, 300));
  });
  return page.evaluate(() => {
    const main = document.querySelector("main");
    // top-level content sections only (no section ancestor), in DOM order
    const sections = [...(main ? main.querySelectorAll("section") : [])].filter(
      (s) => !s.parentElement?.closest("section"),
    );
    const rows = sections.map((s, i) => {
      const r = s.getBoundingClientRect();
      const h = s.querySelector("h1,h2,h3,h6,p");
      return {
        i,
        cls: (s.className || "").toString().replace(/\s+/g, " ").slice(0, 46),
        h: Math.round(r.height),
        w: Math.round(r.width),
        bg: getComputedStyle(s).backgroundColor,
        firstText: h ? h.textContent.replace(/\s+/g, " ").trim().slice(0, 34) : "",
      };
    });
    return { pageHeight: document.documentElement.scrollHeight, rows };
  });
};

try {
  if (!(await ready())) { console.log(JSON.stringify({ ready: false, log: log.slice(-600) })); kill(); process.exit(1); }
  const browser = await chromium.launch();
  const out = {};
  for (const vp of [{ w: 1440, h: 900 }, { w: 390, h: 844 }]) {
    for (const locale of ["ko", "en"]) {
      const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
      await page.goto(locale === "ko" ? BASE : `${BASE}/en`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2500);
      out[`${vp.w}-${locale}`] = await measure(page);
      await page.close();
    }
  }
  fs.mkdirSync("design/audit", { recursive: true });
  fs.writeFileSync("design/audit/locale-sections.json", JSON.stringify(out, null, 1));
  console.log("wrote design/audit/locale-sections.json");
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
} catch (e) {
  console.log("ERR", String(e).slice(0, 500));
} finally {
  kill();
}
