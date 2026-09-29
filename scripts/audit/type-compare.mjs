/**
 * Compare component-type probes (orig vs local) per page/section.
 * Usage: node type-compare.mjs [--mobile=390] [--desktop=1440] [--out=design/audit/mobile-compare/types]
 */
import fs from "node:fs";

const args = process.argv.slice(2);
const getArg = (n, d) => { const a = args.find((x) => x.startsWith("--" + n + "=")); return a ? a.split("=")[1] : d; };
const OUT = getArg("out", "design/audit/mobile-compare/types");
const M = getArg("mobile", "390");
const D = getArg("desktop", "1440");

const read = (f) => { try { return JSON.parse(fs.readFileSync(`${OUT}/${f}`, "utf8")); } catch { return null; } };
const origM = read(`types-orig-${M}.json`);
const localM = read(`types-local-${M}.json`);
const origD = read(`types-orig-${D}.json`);
if (!origM || !localM) { console.error("missing mobile probes"); process.exit(1); }

const sig = (s) => {
  if (!s) return "(none)";
  const bits = [];
  const car = (s.sliderMarks || 0) > 0 || (s.carousels || 0) > 0 || (s.dots || 0) >= 2;
  if (car) bits.push(`carousel${s.dots ? "+dots" : ""}${s.arrows ? "+arrows" : ""}`);
  if (s.hscroll) bits.push(`hscroll(${s.maxScrollX}px)`);
  if (s.grid && s.grid.total >= 3) bits.push(`items ${s.grid.perRow}x${s.grid.rows} w${s.grid.itemW}`);
  if (s.tables) bits.push(`table(${s.tableRows}tr)`);
  if (s.tabs) bits.push(`tabs(${s.tabs})`);
  if (s.images) bits.push(`imgs(${s.images})${s.imgWidths.length ? " w" + s.imgWidths.slice(0, 4).join("/") : ""}`);
  return bits.join(" · ") || "(no collection)";
};

const visible = (arr) => (arr || []).filter((s) => s && !s.hidden && !s.error);

/** heuristic type-difference flag */
const flag = (o, l) => {
  if (!o || !l) return "?";
  const oc = (o.sliderMarks || 0) > 0 || (o.carousels || 0) > 0 || (o.dots || 0) >= 2;
  const lc = (l.sliderMarks || 0) > 0 || (l.carousels || 0) > 0 || (l.dots || 0) >= 2;
  if (oc !== lc) return "TYPE-DIFF carousel";
  const og = o.grid && o.grid.total >= 3 ? o.grid : null;
  const lg = l.grid && l.grid.total >= 3 ? l.grid : null;
  if (og && lg && og.perRow !== lg.perRow && Math.abs(og.itemW - lg.itemW) > 15) return `TYPE-DIFF layout ${og.perRow}-up/${og.itemW}px vs ${lg.perRow}-up/${lg.itemW}px`;
  if (!!o.hscroll !== !!l.hscroll) return "TYPE-DIFF scroller";
  if (o.tables !== l.tables) return "TYPE-DIFF table";
  if (o.tabs !== l.tabs) return `TYPE-DIFF tabs ${o.tabs} vs ${l.tabs}`;
  return "";
};

const lines = [];
for (const key of Object.keys(origM)) {
  const om = origM[key];
  const lm = localM[key];
  if (om.error || lm.error) { lines.push(`## ${key} — probe error`); continue; }
  const os = visible(om.sections);
  const ls = visible(lm.sections);
  const od = origD && origD[key] ? visible(origD[key].sections) : null;
  lines.push(`## ${key}  (orig-mobile ${os.length} sections / local ${ls.length}${od ? ` / orig-desktop ${od.length}` : ""})`);
  const n = Math.max(os.length, ls.length);
  for (let i = 0; i < n; i++) {
    const o = os[i], l = ls[i];
    const f = flag(o, l);
    lines.push(`- §${i} ${o ? "orig: " + sig(o) : "orig: —"}`);
    if (od && od[i]) lines.push(`      orig@${D}: ${sig(od[i])}`);
    lines.push(`      local: ${l ? sig(l) : "—"}${f ? "   << " + f : ""}`);
    if (o && l) lines.push(`      heading: "${(o.heading || "").slice(0, 45)}" | "${(l.heading || "").slice(0, 45)}"`);
  }
}
const text = lines.join("\n");
fs.writeFileSync(`${OUT}/type-compare-report.txt`, text);
console.log(text);
