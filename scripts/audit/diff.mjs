/**
 * Visual audit — pixel diff + report
 * Compares captured orig/local PNGs per page & viewport, writes diff images,
 * per-viewport + combined JSON reports and a human-readable markdown report.
 *
 * Usage:
 *   node scripts/audit/diff.mjs [--viewport=desktop|mobile|both]
 *        [--only=home,support] [--out=design/audit]
 */
import fs from "node:fs/promises";
import path from "node:path";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { PAGES, VIEWPORTS } from "./pages.mjs";

const args = process.argv.slice(2);
const getArg = (name, dflt) => {
  const a = args.find((x) => x.startsWith("--" + name + "="));
  return a ? a.split("=")[1] : dflt;
};

const VP_ARG = getArg("viewport", "both");
const VPS = VP_ARG === "both" ? ["desktop", "mobile"] : [VP_ARG];
for (const v of VPS) {
  if (!VIEWPORTS[v]) {
    console.error(`unknown viewport: ${v} (expected desktop|mobile|both)`);
    process.exit(1);
  }
}
const ONLY = getArg("only", "").split(",").filter(Boolean);
const OUT = path.resolve(getArg("out", "design/audit"));
const BANDS = 32;

const pages = PAGES.filter((p) => !ONLY.length || ONLY.includes(p.key));

/** top-left aligned crop into a fresh tightly-packed RGBA buffer */
function crop(data, srcW, w, h) {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const s = y * srcW * 4;
    out.set(data.subarray(s, s + w * 4), y * w * 4);
  }
  return out;
}

const isDiffRed = (d, p) => d[p] > 200 && d[p + 1] < 80 && d[p + 2] < 80;

/** per-band differing-pixel percentage over 32 equal horizontal bands */
function bandProfile(diff, w, h) {
  // one shared boundary set keeps the counting range and the divisor consistent
  const bounds = Array.from({ length: BANDS + 1 }, (_, i) =>
    Math.round((i * h) / BANDS),
  );
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

/** dimmed copy of the original with differing pixels drawn pure red */
function visualize(orig, diff, w, h) {
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    if (isDiffRed(diff, p)) {
      out[p] = 255;
      out[p + 1] = 0;
      out[p + 2] = 0;
      out[p + 3] = 255;
    } else {
      out[p] = Math.round(orig[p] * 0.4);
      out[p + 1] = Math.round(orig[p + 1] * 0.4);
      out[p + 2] = Math.round(orig[p + 2] * 0.4);
      out[p + 3] = 255;
    }
  }
  const png = new PNG({ width: w, height: h });
  png.data = out;
  return PNG.sync.write(png);
}

async function comparePage(viewport, key) {
  const origPath = path.join(OUT, "orig", viewport, `${key}.png`);
  const localPath = path.join(OUT, "local", viewport, `${key}.png`);
  const a = PNG.sync.read(await fs.readFile(origPath));
  const b = PNG.sync.read(await fs.readFile(localPath));

  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  const ca = crop(a.data, a.width, w, h);
  const cb = crop(b.data, b.width, w, h);
  const diff = new Uint8Array(w * h * 4);
  const diffPixels = pixelmatch(ca, cb, diff, w, h, {
    threshold: 0.1,
    includeAA: false,
    alpha: 0.5,
  });

  const diffDir = path.join(OUT, "diff", viewport);
  await fs.mkdir(diffDir, { recursive: true });
  await fs.writeFile(
    path.join(diffDir, `${key}.png`),
    visualize(ca, diff, w, h),
  );

  const bands = bandProfile(diff, w, h);
  const worstBands = [...bands]
    .sort((x, y) => y.pct - x.pct)
    .slice(0, 4)
    .map((x) => ({ y0: x.y0, y1: x.y1, pct: Number(x.pct.toFixed(3)) }));

  return {
    key,
    origH: a.height,
    localH: b.height,
    dh: b.height - a.height,
    comparedW: w,
    comparedH: h,
    diffPixels,
    diffPct: Number(((diffPixels / (w * h)) * 100).toFixed(3)),
    worstBands,
  };
}

function mdReport(generatedAt, viewports) {
  const lines = [
    "# ECOWAVE visual audit",
    "",
    `Generated: ${generatedAt}`,
    "",
    "Legend: bands split the compared page into 32 equal horizontal slices; y-ranges are in",
    "original-page pixels, top-aligned (both images cropped to min height/width before diffing).",
    "Band % = differing pixels within that slice. Rows sorted worst diff % first.",
    "",
  ];
  for (const vp of VPS) {
    const entries = viewports[vp] || [];
    lines.push(`## ${vp}`, "");
    lines.push("| page | diff % | orig h | local h | dh | worst band y-ranges |");
    lines.push("| --- | ---: | ---: | ---: | ---: | --- |");
    const sorted = [...entries].sort((a, b) => b.diffPct - a.diffPct);
    for (const e of sorted) {
      const bands = e.worstBands
        .map((b) => `${b.y0}-${b.y1} (${b.pct.toFixed(2)}%)`)
        .join(", ");
      lines.push(
        `| ${e.key} | ${e.diffPct.toFixed(2)} | ${e.origH} | ${e.localH} | ${e.dh} | ${bands} |`,
      );
    }
    if (!sorted.length) lines.push("| _(no captures found)_ | | | | | |");
    lines.push("");
  }
  return lines.join("\n");
}

async function main() {
  const generatedAt = new Date().toISOString();
  const combined = { generatedAt, viewports: {} };
  let compared = 0;
  const missing = [];

  for (const viewport of VPS) {
    const entries = [];
    for (const p of pages) {
      const origPath = path.join(OUT, "orig", viewport, `${p.key}.png`);
      const localPath = path.join(OUT, "local", viewport, `${p.key}.png`);
      try {
        await fs.access(origPath);
        await fs.access(localPath);
      } catch {
        missing.push(`${viewport}/${p.key}`);
        continue;
      }
      const result = await comparePage(viewport, p.key);
      entries.push(result);
      compared++;
      console.log(
        `  [${viewport}] ${p.key} diff=${result.diffPct.toFixed(2)}% (${result.comparedW}x${result.comparedH})`,
      );
    }
    combined.viewports[viewport] = entries;
    await fs.writeFile(
      path.join(OUT, `report-${viewport}.json`),
      JSON.stringify({ generatedAt, viewport, pages: entries }, null, 2),
    );
  }

  await fs.mkdir(OUT, { recursive: true });
  await fs.writeFile(
    path.join(OUT, "report.json"),
    JSON.stringify(combined, null, 2),
  );
  await fs.writeFile(
    path.join(OUT, "report.md"),
    mdReport(generatedAt, combined.viewports),
  );

  console.log(`\ncompared ${compared} page/viewport pairs`);
  if (missing.length) console.log("skipped (missing captures): " + missing.join(", "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
