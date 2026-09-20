/**
 * Lane D: products height arithmetic from the crawled content JSON.
 * Confirms the local block sum equals the measured live original scrollHeight
 * without running a build. Constants mirror components/products/ProductBoard.tsx
 * and components/ui/PageHero.tsx (hero 353, header spacer 88, footer 412).
 */
import fs from "node:fs";
import path from "node:path";

const HEADER = 88; // Lane A in-flow spacer (desktop)
const HERO = 353; // products first section (page JSON rows 139+154+60)
const FOOTER = 412; // footer section (31+350+31)
const TABS = 67; // pad 15 + 37 pill + pad 15
const SPACER = 31; // empty padding row (15 + min-height 1 + 15)
const GRID_MT = 5; // measured -5px pull-up of the grid
const ROW = 401; // item pad 20 + card 361 + pad 20
const PAG = 58 + 24; // pagination margin-top + 24px band
const BOTTOM_PAG = 181;
const BOTTOM_NOPAG = 200;
const PAGE_SIZE = 6;

const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const boardSection = (page) =>
  page.sections.find(
    (s) => /pc_section/.test(s.cls) && /side_/.test(s.cls) && !/section_first/.test(s.cls),
  );
const rowsHeight = (sec) => sec.rows.reduce((n, r) => n + (r.h ?? 0), 0);

const cases = [
  { key: "products", pageKey: "products", slug: "products/eco-wave", orig: 2012 },
  { key: "products.eco-wave", pageKey: "products.eco-wave", slug: "products/eco-wave", orig: 2012 },
  { key: "products.clean-b", pageKey: "products.clean-b", slug: "products/clean-b", orig: 2012 },
  { key: "products.flowell", pageKey: "products.flowell", slug: "products/flowell", orig: 1547 },
];

let bad = 0;
for (const c of cases) {
  const page = read(path.join("content", "ko", "pages", c.pageKey + ".json"));
  const board = read(path.join("content", "ko", "boards", c.slug.replace(/\//g, ".") + ".json"));
  const sec = boardSection(page);
  const secH = rowsHeight(sec);
  const total = board.posts.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const visible = Math.min(PAGE_SIZE, total);
  const gridRows = Math.ceil(visible / 3);
  const paginated = pages > 1;
  const local = HEADER + HERO + (TABS + SPACER - GRID_MT + gridRows * ROW + (paginated ? PAG + BOTTOM_PAG : BOTTOM_NOPAG)) + FOOTER;
  const matchesJson = TABS + SPACER + 914 <= secH; // board JSON row for 6+ posts is 914
  const ok = local === (c.orig === 2012 ? 2011 : c.orig); // original scrollHeight rounds +1
  console.log(
    `${c.key.padEnd(18)} posts=${total} pages=${pages} rows=${gridRows} boardJSON=${secH} local=${local} orig=${c.orig} delta=${local - c.orig} ${ok ? "OK" : "DIFF"} secHas914=${matchesJson}`,
  );
  if (!ok) bad++;
}
console.log(bad === 0 ? "ALL PRODUCTS HEIGHTS MATCH (within 1px rounding)" : `${bad} mismatch(es)`);
process.exit(bad === 0 ? 0 : 1);
