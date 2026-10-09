/**
 * Hover-scale parity scan: list image widgets per locale with their image
 * basename and whether they are in HOVER_SCALE_WIDGET_IDS, to find KO/EN twins
 * that are missing. Usage: node scripts/audit/hover-parity.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const setSrc = fs.readFileSync(
  path.join(ROOT, "components/content/SectionRenderer.tsx"),
  "utf8",
);
const m = setSrc.match(/const HOVER_SCALE_WIDGET_IDS = new Set\(\[([\s\S]*?)\]\);/);
const IDS = new Set([...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));

const base = (p) => (p || "").split("/").pop();
const rows = { ko: [], en: [] };

function walk(node, locale, file) {
  if (Array.isArray(node)) {
    node.forEach((n) => walk(n, locale, file));
    return;
  }
  if (!node || typeof node !== "object") return;
  if (node.kind === "widget" && node.type === "image" && node.src) {
    rows[locale].push({ file, id: node.id, base: base(node.src), hover: IDS.has(node.id) });
  }
  for (const k of Object.keys(node)) walk(node[k], locale, file);
}

for (const locale of ["ko", "en"]) {
  const dir = path.join(ROOT, "content", locale, "pages");
  for (const f of fs.readdirSync(dir)) {
    walk(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")), locale, f);
  }
}

const koHover = new Set(rows.ko.filter((r) => r.hover).map((r) => r.base));
console.log("KO hover images:", koHover.size);
console.log("\nEN images whose basename is hover-scaled in KO but the EN widget is not in the set:");
for (const r of rows.en) {
  if (koHover.has(r.base) && !r.hover) {
    console.log(`  ${r.file} ${r.id} ${r.base}`);
  }
}
console.log("\nKO images that are hover-scaled but have no EN twin by basename:");
const enBases = new Set(rows.en.map((r) => r.base));
for (const b of koHover) if (!enBases.has(b)) console.log("  " + b);
