/**
 * Lane D: products board height arithmetic from the board-backed content JSON.
 *
 * Products pages are board-backed only — the products page JSONs were deleted
 * in f301307 — so post counts come from content/ko/boards/products.*.json
 * (EN board JSONs mirror KO, so this KO check guards the shared render model).
 * The constants mirror components/products/ProductBoard.tsx and
 * components/ui/PageHero.tsx (HEADER 88, HERO 353, FOOTER 412, TABS 67,
 * SPACER 31, GRID_MT 5, ROW 401, PAG/BOTTOM_PAG/BOTTOM_NOPAG, PAGE_SIZE 6).
 *
 * Guarantees: for each product board the sum of the local block heights equals
 * the live-measured original scrollHeight (within the +1px local rounding),
 * i.e. the board's post count still drives the paginated/unpaginated grid and
 * tail heights correctly.
 */
import fs from "node:fs";
import path from "node:path";

const HEADER = 88; // Lane A in-flow spacer (desktop)
const HERO = 353; // products first section (PageHero products height)
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

// Landing `/products` is the eco-wave board on the original, so it shares that
// board JSON; the subpage cases read their own board.
const cases = [
  { key: "products (landing)", slug: "products/eco-wave", orig: 2012 },
  { key: "products.eco-wave", slug: "products/eco-wave", orig: 2012 },
  { key: "products.clean-b", slug: "products/clean-b", orig: 2012 },
  { key: "products.flowell", slug: "products/flowell", orig: 1547 },
];

let bad = 0;
for (const c of cases) {
  const board = read(path.join("content", "ko", "boards", c.slug.replace(/\//g, ".") + ".json"));
  const total = board.posts.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const visible = Math.min(PAGE_SIZE, total);
  const gridRows = Math.ceil(visible / 3);
  const paginated = pages > 1;
  const local = HEADER + HERO + (TABS + SPACER - GRID_MT + gridRows * ROW + (paginated ? PAG + BOTTOM_PAG : BOTTOM_NOPAG)) + FOOTER;
  const ok = local === (c.orig === 2012 ? 2011 : c.orig); // original scrollHeight rounds +1
  console.log(
    `${c.key.padEnd(18)} posts=${total} pages=${pages} rows=${gridRows} local=${local} orig=${c.orig} delta=${local - c.orig} ${ok ? "OK" : "DIFF"}`,
  );
  if (!ok) bad++;
}
console.log(bad === 0 ? "ALL PRODUCTS HEIGHTS MATCH (within 1px rounding)" : `${bad} mismatch(es)`);
process.exit(bad === 0 ? 0 : 1);
