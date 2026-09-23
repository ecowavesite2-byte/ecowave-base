/**
 * Board DETAIL page audit — capture + pixel diff.
 *
 * The 20-page pipeline (capture.mjs / diff.mjs, scripts/audit/pages.mjs) only
 * covers board LIST pages. This tool shoots the *detail* view of the first
 * available post per board (news / notices / products eco-wave) on both the
 * original imweb site and the local rebuild, then diffs each pair.
 *
 * Original detail URL:  <ORIG_BASE>/<boardPath>/?idx=<idx>&bmode=view
 * Local detail route:   /news/<idx> | /notices/<idx> | /products/<cat>/<idx>
 * The idx of each post is read from content/ko/boards/<file>.json (posts[0]).
 *
 * Procedure mirrors scripts/audit/capture.mjs: reduced-motion, scroll-through +
 * settle (lazy images / reveals fire), then a fullPage PNG. On the original
 * side the known reveal end-state is force-applied and page JS is frozen for
 * the shot (same CDP trick capture.mjs uses). Actually this tool never edits
 * capture.mjs — the helpers are re-implemented here on purpose.
 *
 * Usage:
 *   node scripts/audit/details-capture.mjs                    # capture both sides, then diff
 *   node scripts/audit/details-capture.mjs --mode=capture
 *   node scripts/audit/details-capture.mjs --mode=diff
 *   node scripts/audit/details-capture.mjs --only=news-167290728
 *   node scripts/audit/details-capture.mjs --local-base=http://localhost:4517
 *
 * READ-ONLY against both sites; writes only under design/audit/details/.
 */
import { chromium } from "playwright-core";
import fs from "node:fs/promises";
import path from "node:path";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { VIEWPORTS, ORIG_BASE, DEFAULT_LOCAL_BASE } from "./pages.mjs";

const args = process.argv.slice(2);
const getArg = (name, dflt) => {
  const a = args.find((x) => x.startsWith("--" + name + "="));
  return a ? a.split("=").slice(1).join("=") : dflt;
};

const MODE = getArg("mode", "all");
if (!["all", "capture", "diff"].includes(MODE)) {
  console.error("usage: node scripts/audit/details-capture.mjs [--mode=all|capture|diff] [--only=key] [--local-base=...]");
  process.exit(1);
}
const BASE = getArg("local-base", DEFAULT_LOCAL_BASE).replace(/\/$/, "");
const ONLY = getArg("only", "").split(",").filter(Boolean);
const OUT = path.resolve("design/audit/details");
const BANDS = 32;

/** Board config: where the original detail lives and how the local route is built. */
const BOARDS = [
  { slug: "news", file: "news.json", origPath: "/29", localRoute: (idx) => `/news/${idx}` },
  { slug: "notices", file: "notices.json", origPath: "/27", localRoute: (idx) => `/notices/${idx}` },
  { slug: "products.eco-wave", file: "products.eco-wave.json", origPath: "/37", localRoute: (idx) => `/products/eco-wave/${idx}` },
];

/** pick the first available post of each board and derive both URLs */
async function loadPosts() {
  const posts = [];
  for (const b of BOARDS) {
    const file = path.resolve("content/ko/boards", b.file);
    let json;
    try {
      json = JSON.parse(await fs.readFile(file, "utf8"));
    } catch (e) {
      console.error(`  [post] ${b.slug}: cannot read ${b.file}: ${e.message.split("\n")[0]}`);
      continue;
    }
    const p = (json.posts || [])[0];
    if (!p) {
      console.error(`  [post] ${b.slug}: no posts`);
      continue;
    }
    const key = `${b.slug}-${p.idx}`.replace(/[/.]/g, "-");
    posts.push({
      key,
      board: b.slug,
      idx: p.idx,
      title: p.title,
      origUrl: `${ORIG_BASE}${b.origPath}/?idx=${p.idx}&bmode=view`,
      localUrl: `${BASE}${b.localRoute(p.idx)}`,
    });
  }
  return posts.filter((p) => !ONLY.length || ONLY.includes(p.key));
}

const HIDE_DEV_STYLE =
  "nextjs-portal, [data-nextjs-toast], [data-nextjs-dialog], [data-nextjs-dev-tools-button] { display: none !important; }";

/** Original site only: force the known `wg_animated` reveal end-state (see capture.mjs). */
const FORCE_REVEAL_STYLE = `
  .wg_animated {
    visibility: visible !important;
    opacity: 1 !important;
    transition: none !important;
  }
`;

/** step down the page to trigger lazy loads / reveals, then return to top */
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

/** fullPage screenshot; original side freezes page JS for the shot (capture.mjs trick). */
async function fullPageShot(ctx, page, side, dest) {
  if (side !== "orig") {
    await page.screenshot({ path: dest, fullPage: true, type: "png", animations: "disabled" });
    return;
  }
  const client = await ctx.newCDPSession(page);
  await client.send("Emulation.setScriptExecutionDisabled", { value: true });
  try {
    await page.screenshot({ path: dest, fullPage: true, type: "png", animations: "disabled" });
  } finally {
    await client.send("Emulation.setScriptExecutionDisabled", { value: false }).catch(() => {});
    await client.detach().catch(() => {});
  }
}

/** capture one (post, viewport, side); returns a manifest record (never throws) */
async function captureOne(browser, post, viewport, side) {
  const vp = VIEWPORTS[viewport];
  const url = side === "orig" ? post.origUrl : post.localUrl;
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    colorScheme: "light",
  });
  const rec = { side, viewport, key: post.key, url, ok: false };
  try {
    const page = await ctx.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(url, { waitUntil: "load", timeout: 45000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(600);
    await page.addStyleTag({ content: HIDE_DEV_STYLE }).catch(() => {});
    await scrollThrough(page);
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    await page.waitForTimeout(900);
    if (side === "orig") {
      await page.addStyleTag({ content: FORCE_REVEAL_STYLE }).catch(() => {});
      await page.waitForTimeout(200);
    }

    // height before the shot (original: page JS resumes after and may reflow)
    const info = await page.evaluate(() => ({
      pageHeight: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
      title: document.title,
      text: (document.body.innerText || "").replace(/\s+/g, " ").slice(0, 160),
    }));

    const destDir = path.join(OUT, side, viewport);
    await fs.mkdir(destDir, { recursive: true });
    const dest = path.join(destDir, `${post.key}.png`);
    await fullPageShot(ctx, page, side, dest);

    rec.finalUrl = page.url();
    rec.title = info.title;
    rec.text = info.text;
    rec.pageHeight = info.pageHeight;
    rec.dest = path.relative(process.cwd(), dest).replace(/\\/g, "/");
    rec.ok = true;
  } catch (e) {
    rec.error = String((e && e.message) || e).split("\n")[0];
  } finally {
    await ctx.close().catch(() => {});
  }
  return rec;
}

async function runCapture(posts, viewports) {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const manifest = { generatedAt: new Date().toISOString(), base: BASE, records: [] };
  console.log(`capture details: posts=${posts.length} viewports=${viewports.join(",")}`);
  try {
    for (const viewport of viewports) {
      for (const post of posts) {
        for (const side of ["orig", "local"]) {
          const rec = await captureOne(browser, post, viewport, side);
          manifest.records.push(rec);
          console.log(
            `  [${side}/${viewport}] ${post.key} ${rec.ok ? "ok h=" + rec.pageHeight : "FAIL " + rec.error}`,
          );
        }
      }
    }
  } finally {
    await browser.close();
  }
  await fs.mkdir(OUT, { recursive: true });
  await fs.writeFile(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}

/* ------------------------------------------------------------------- diff */

function crop(data, srcW, w, h) {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const s = y * srcW * 4;
    out.set(data.subarray(s, s + w * 4), y * w * 4);
  }
  return out;
}

const isDiffRed = (d, p) => d[p] > 200 && d[p + 1] < 80 && d[p + 2] < 80;

function bandProfile(diff, w, h) {
  const bounds = Array.from({ length: BANDS + 1 }, (_, i) => Math.round((i * h) / BANDS));
  const counts = new Array(BANDS).fill(0);
  for (let b = 0; b < BANDS; b++) {
    for (let y = bounds[b]; y < bounds[b + 1]; y++) {
      for (let x = 0; x < w; x++) {
        if (isDiffRed(diff, (y * w + x) * 4)) counts[b]++;
      }
    }
  }
  return counts.map((n, i) => {
    const y0 = bounds[i];
    const y1 = bounds[i + 1];
    const area = Math.max(1, (y1 - y0) * w);
    return { y0, y1, pct: (n / area) * 100 };
  });
}

/** a compact, numeric structural read of one pair */
function structuralNote(dh, origH, localH, bands, orig, local) {
  const notes = [];
  const dhPct = origH ? (dh / origH) * 100 : 0;
  if (Math.abs(dhPct) >= 5) notes.push(`page height differs by ${dh}px (${dhPct.toFixed(1)}% of orig)`);
  else if (dh !== 0) notes.push(`page height ~matches (dh ${dh}px)`);
  const full = bands.filter((b) => b.pct >= 95);
  if (full.length) notes.push(`${full.length} band(s) ~fully different (>=95%) -> different/missing content`);
  const major = bands.filter((b) => b.pct >= 60 && b.pct < 95);
  if (major.length) notes.push(`${major.length} band(s) major diff (60-95%) -> large layout/content shift`);
  const top = bands.findIndex((b) => b.pct >= 60);
  if (top < 0 && origH && localH) notes.push("no band >=60% -> differences look minor/text/AA-level");
  const notFound = (s) => /\b404\b|not found|could not be found|페이지를 찾을 수 없습니다/i.test(s || "");
  if (notFound(local)) notes.push("local page text suggests a 404 / not-found page");
  if (notFound(orig)) notes.push("orig page text suggests a 404 / not-found page");
  return notes.length ? notes.join("; ") : "no significant structural difference detected";
}

async function comparePair(viewport, post, textOf = () => ({})) {
  const origPath = path.join(OUT, "orig", viewport, `${post.key}.png`);
  const localPath = path.join(OUT, "local", viewport, `${post.key}.png`);
  try {
    await fs.access(origPath);
    await fs.access(localPath);
  } catch {
    return { key: post.key, board: post.board, idx: post.idx, ok: false, error: "missing capture" };
  }
  try {
    const a = PNG.sync.read(await fs.readFile(origPath));
    const b = PNG.sync.read(await fs.readFile(localPath));
    const w = Math.min(a.width, b.width);
    const h = Math.min(a.height, b.height);
    const ca = crop(a.data, a.width, w, h);
    const cb = crop(b.data, b.width, w, h);
    const diff = new Uint8Array(w * h * 4);
    const diffPixels = pixelmatch(ca, cb, diff, w, h, { threshold: 0.1, includeAA: false, alpha: 0.5 });

    const diffDir = path.join(OUT, "diff", viewport);
    await fs.mkdir(diffDir, { recursive: true });
    const vis = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const p = i * 4;
      if (isDiffRed(diff, p)) {
        vis[p] = 255;
        vis[p + 1] = 0;
        vis[p + 2] = 0;
        vis[p + 3] = 255;
      } else {
        vis[p] = Math.round(ca[p] * 0.4);
        vis[p + 1] = Math.round(ca[p + 1] * 0.4);
        vis[p + 2] = Math.round(ca[p + 2] * 0.4);
        vis[p + 3] = 255;
      }
    }
    const diffPng = new PNG({ width: w, height: h });
    diffPng.data = vis;
    await fs.writeFile(path.join(diffDir, `${post.key}.png`), PNG.sync.write(diffPng));

    const bands = bandProfile(diff, w, h);
    const worstBands = [...bands]
      .sort((x, y) => y.pct - x.pct)
      .slice(0, 3)
      .map((x) => ({ y0: x.y0, y1: x.y1, pct: Number(x.pct.toFixed(3)) }));
    const diffPct = Number(((diffPixels / (w * h)) * 100).toFixed(3));
    return {
      key: post.key,
      board: post.board,
      idx: post.idx,
      ok: true,
      origH: a.height,
      localH: b.height,
      dh: b.height - a.height,
      comparedW: w,
      comparedH: h,
      diffPixels,
      diffPct,
      worstBands,
      note: structuralNote(b.height - a.height, a.height, b.height, bands, textOf("orig", viewport).text, textOf("local", viewport).text),
    };
  } catch (e) {
    return { key: post.key, board: post.board, idx: post.idx, ok: false, error: String((e && e.message) || e).split("\n")[0] };
  }
}

async function runDiff(posts, viewports) {
  const generatedAt = new Date().toISOString();
  const combined = { generatedAt, viewports: {} };
  let compared = 0;
  const failures = [];
  let textRecords = [];
  try {
    textRecords = JSON.parse(await fs.readFile(path.join(OUT, "manifest.json"), "utf8")).records || [];
  } catch {
    /* diff-only runs may predate a manifest */
  }
  for (const viewport of viewports) {
    const entries = [];
    for (const post of posts) {
      const textFor = (side) =>
        textRecords.find((r) => r.side === side && r.viewport === viewport && r.key === post.key) || {};
      const r = await comparePair(viewport, post, (side) => textFor(side));
      entries.push(r);
      if (r.ok) {
        compared++;
        console.log(`  [${viewport}] ${r.key} diff=${r.diffPct.toFixed(2)}% h=${r.origH}/${r.localH} dh=${r.dh}`);
      } else {
        failures.push(`${viewport}/${r.key} (${r.error})`);
        console.error(`  [${viewport}] ${r.key} FAIL ${r.error}`);
      }
    }
    combined.viewports[viewport] = entries;
  }
  await fs.mkdir(OUT, { recursive: true });
  await fs.writeFile(path.join(OUT, "report.json"), JSON.stringify(combined, null, 2));
  await fs.writeFile(path.join(OUT, "report.md"), mdReport(generatedAt, combined.viewports, failures));
  console.log(`\ncompared ${compared} detail pair(s); failures=${failures.length}`);
  if (failures.length) console.log("failed: " + failures.join(", "));
  console.log("-> design/audit/details/report.md + report.json");
  return combined;
}

function mdReport(generatedAt, viewports, failures) {
  const lines = [
    "# ECOWAVE board DETAIL visual audit",
    "",
    `Generated: ${generatedAt}`,
    "",
    "First available post per board, desktop 1440x900 + mobile 390x844.",
    "Orig URLs: `/29/?idx=<id>&bmode=view` (news), `/27/...` (notices), `/37/...` (products eco-wave).",
    "Local routes: `/news/<id>`, `/notices/<id>`, `/products/eco-wave/<id>`.",
    "",
    "Bands split the compared page into 32 equal horizontal slices, top-aligned",
    "(both crops reduced to min width/height). Band % = differing pixels.",
    "Pixelmatch threshold 0.1, includeAA false. Rows sorted worst diff % first.",
    "",
  ];
  for (const vp of Object.keys(viewports)) {
    const entries = viewports[vp] || [];
    lines.push(`## ${vp}`, "");
    lines.push("| post | diff % | orig h | local h | dh | worst bands (y0-y1: pct) | note |");
    lines.push("| --- | ---: | ---: | ---: | ---: | --- | --- |");
    const sorted = [...entries].sort((a, b) => (b.ok ? b.diffPct : -1) - (a.ok ? a.diffPct : -1));
    for (const e of sorted) {
      if (!e.ok) {
        lines.push(`| ${e.key} | - | - | - | - | _(failed: ${e.error})_ | |`);
        continue;
      }
      const bands = e.worstBands.map((b) => `${b.y0}-${b.y1}: ${b.pct.toFixed(2)}%`).join(", ");
      lines.push(`| ${e.key} | ${e.diffPct.toFixed(2)} | ${e.origH} | ${e.localH} | ${e.dh} | ${bands} | ${e.note} |`);
    }
    if (!entries.length) lines.push("| _(no captures)_ | | | | | | |");
    lines.push("");
  }
  if (failures.length) {
    lines.push("## failures", "");
    for (const f of failures) lines.push(`- ${f}`);
    lines.push("");
  }
  return lines.join("\n");
}

/* ------------------------------------------------------------------- main */

async function main() {
  const posts = await loadPosts();
  if (!posts.length) {
    console.error("no posts selected");
    process.exit(1);
  }
  for (const p of posts) console.log(`  post ${p.key}: orig=${p.origUrl} local=${p.localUrl}`);
  const viewports = ["desktop", "mobile"];

  if (MODE === "all" || MODE === "capture") await runCapture(posts, viewports);
  if (MODE === "all" || MODE === "diff") await runDiff(posts, viewports);
}

main().catch((e) => {
  console.error(String((e && e.stack) || e));
  process.exit(1);
});
