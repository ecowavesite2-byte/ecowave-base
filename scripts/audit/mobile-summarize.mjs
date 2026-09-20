/** summarize mobile probe JSONs: orig vs local per-page section comparison */
import fs from "node:fs";
const dir = "design/audit/mobile-probe";
const o = JSON.parse(fs.readFileSync(`${dir}/orig-run.json`, "utf8"));
const l = JSON.parse(fs.readFileSync(`${dir}/local-run.json`, "utf8"));
const keys = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(o);

const h = (s) => `h=${String(s.h).padStart(5)}${s.hidden ? " HID" : "    "}${s.forcedH != null ? " forced=" + s.forcedH : ""}${s.hasMobile ? " [mob]" : ""}${s.hasPc ? " [pc]" : ""}`;
for (const k of keys) {
  if (!o[k] || !l[k]) continue;
  console.log(`\n================ ${k}  orig=${o[k].scrollHeight} local=${l[k].scrollHeight} dh=${l[k].scrollHeight - o[k].scrollHeight}`);
  console.log("-- ORIG sections:");
  for (const s of o[k].sections) console.log(`   [${String(s.i).padStart(2)}] ${h(s)} :: ${s.heading.slice(0, 62)}`);
  console.log("-- LOCAL sections:");
  for (const s of l[k].sections) console.log(`   [${String(s.i).padStart(2)}] ${h(s)} :: ${s.heading.slice(0, 62)}`);
}
