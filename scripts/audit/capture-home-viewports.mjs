/**
 * Home page viewport capture (before/after a responsive change).
 *
 * Boots a dev server, then captures full-page PNGs of `/` (ko) and `/en` at
 * 390 / 768 / 1024 / 1440 px into design/audit/home-<label>/.
 *
 * Usage:
 *   node scripts/audit/capture-home-viewports.mjs --label=baseline
 *   node scripts/audit/capture-home-viewports.mjs --label=phase1 [--base=http://127.0.0.1:3125]
 *
 * `design/` is gitignored; screenshots are local evidence only.
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

const LABEL = getArg("label", "capture");
const PORT = Number(getArg("port", "3125"));
const BASE = getArg("base", `http://127.0.0.1:${PORT}`);
const MANAGED = !args.some((x) => x.startsWith("--base="));
const OUT = path.resolve("design", "audit", `home-${LABEL}`);

const VIEWPORTS = [
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 768 },
  { name: "1440", width: 1440, height: 900 },
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

/** reveal-on-scroll animations: walk the page down, then back to the top */
async function revealAll(page) {
  await page.evaluate(async () => {
    const step = Math.max(300, Math.floor(window.innerHeight * 0.7));
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((r) => setTimeout(r, 400));
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 400));
  });
}

const HIDE_DEV =
  "nextjs-portal, [data-nextjs-toast], [data-nextjs-dialog], [data-nextjs-dev-tools-button] { display: none !important; }";

const out = { label: LABEL, base: BASE, shots: [], ok: false };
try {
  if (!(await waitReady())) {
    console.log(JSON.stringify({ ...out, devReady: false, devLog: devLog.slice(-1200) }, null, 1));
    killDev();
    process.exit(1);
  }

  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  for (const vp of VIEWPORTS) {
    for (const locale of ["ko", "en"]) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      await page.addStyleTag({ content: HIDE_DEV });
      const url = locale === "ko" ? `${BASE}/` : `${BASE}/en`;
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2500);
      await revealAll(page);
      const file = path.join(OUT, `${vp.name}-${locale}.png`);
      await page.screenshot({ path: file, fullPage: true });
      const stats = fs.statSync(file);
      out.shots.push({ viewport: vp.name, locale, file: path.relative(process.cwd(), file), bytes: stats.size });
      await page.close();
    }
  }

  await browser.close();
  out.ok = true;
} catch (e) {
  out.error = String((e && e.stack) || e).slice(0, 700);
  out.devLog = devLog.slice(-1200);
} finally {
  killDev();
  console.log(JSON.stringify(out, null, 1));
}
process.exit(out.ok ? 0 : 1);
