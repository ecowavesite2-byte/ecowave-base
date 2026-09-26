#!/usr/bin/env node
/**
 * Content registry health check (read-only).
 *
 * Verifies that the auto-generated `lib/content/registry.ts` still lines up with
 * the crawled content tree under `content/` and the Postgres override store:
 *
 *   1. Dangling defs (ERROR)     — every `CONTENT_DEFS` entry targeting a page
 *                                  resolves to a real section/widget in
 *                                  `content/ko/pages/*.json`. Handles both
 *                                  `visual[<i>]` slides and rows→cols→children
 *                                  (plus `aside.items`) widgets. Defs whose
 *                                  sectionId is `board` or `nav` are not page
 *                                  targets and are skipped.
 *   2. Coverage (INFO)          — content-bearing widgets (`text`, `menu_title`,
 *                                  `image`, `button`, `gallery2`, `video`,
 *                                  `code`) that have no def at all, grouped by
 *                                  page. Informational only. Intentionally
 *                                  non-editable widgets are excluded: `code`
 *                                  embeds, the mobile back-to-top image
 *                                  (`href="#doz_header"`), and the location-card
 *                                  texts already covered by a section-scoped
 *                                  `cards` def (all but the section's first text).
 *   3. Stored overrides (ERROR) — keys in the Postgres `page_content` table that
 *                                  are neither a valid board key nor present in
 *                                  the defs' key set. Only runs when
 *                                  `DATABASE_URL` is configured (loaded from
 *                                  `.env.local` via dotenv).
 *
 * Usage:
 *   node scripts/content-health.mjs          # human-readable summary
 *   node scripts/content-health.mjs --json   # one JSON object
 *   npm run content:health
 *
 * Exit codes: 0 = healthy, 1 = dangling refs found, 2 = runtime failure.
 *
 * Read-only: never writes to the registry, content files, or the database.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CONTENT_ROOT = process.env.CONTENT_ROOT ?? path.join(ROOT, "content");
const REGISTRY_FILE = path.join(ROOT, "lib", "content", "registry.ts");

const DEFS_MARKER = "export const CONTENT_DEFS: ContentDef[] = [";
const DEFS_CLOSE = "\n];";
const DEFAULTS_MARKER =
  "export const DEFAULT_VALUES: Record<string, { ko?: string; en?: string }> = {";
const DEFAULTS_CLOSE = "\n};";

/** A board override is valid even when absent from the defs. */
const BOARD_KEY_RE = /^([^#]+)#board\/\1\/(?:name|posts)$/;
const VISUAL_ID_RE = /^visual\[(\d+)\]$/;

/**
 * Mirrors `PAGE_ALIASES` in lib/content/paths.ts (scripts/ is not TS): pageKeys
 * whose file is a crawl artifact served by another pageKey at runtime. The
 * generator emits no defs for them, so their widgets can never be covered —
 * skip the whole file in the coverage walk instead of flagging every widget.
 */
const PAGE_ALIASES = { company: "company.ceo" };

/** Widget types that carry editable content (decorative/board-driven excluded). */
const CONTENT_WIDGET_TYPES = new Set([
  "text",
  "menu_title",
  "image",
  "button",
  "gallery2",
  "video",
  "code",
]);

const { Client } = pg;

/* -------------------------------------------------------------------------- */
/* Registry / content loading                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Extract one pretty-printed JSON literal from the TS source using textual
 * markers. `openChar` is located as the marker's final occurrence, and the
 * slice runs through the matching close token's bracket/brace (inclusive).
 */
function extractLiteral(source, marker, openChar, closeToken) {
  const markerIdx = source.indexOf(marker);
  if (markerIdx === -1) throw new Error(`registry marker not found: ${marker}`);
  const openIdx = markerIdx + marker.lastIndexOf(openChar);
  const closeIdx = source.indexOf(closeToken, openIdx);
  if (closeIdx === -1) {
    throw new Error(
      `closing ${JSON.stringify(closeToken)} not found after marker: ${marker}`,
    );
  }
  // closeToken is "\n<close>;": +1 is the bracket/brace we must include.
  return source.slice(openIdx, closeIdx + 2);
}

function loadRegistry() {
  let source;
  try {
    source = fs.readFileSync(REGISTRY_FILE, "utf8");
  } catch (error) {
    throw new Error(
      `cannot read ${path.relative(ROOT, REGISTRY_FILE)}: ${error.message}`,
    );
  }
  const defs = JSON.parse(extractLiteral(source, DEFS_MARKER, "[", DEFS_CLOSE));
  // DEFAULT_VALUES is parsed for completeness/validation; dangling checks only
  // need the def key set, but a malformed literal should surface as a failure.
  const defaults = JSON.parse(
    extractLiteral(source, DEFAULTS_MARKER, "{", DEFAULTS_CLOSE),
  );
  if (!Array.isArray(defs)) throw new Error("CONTENT_DEFS is not an array");
  if (!defaults || typeof defaults !== "object") {
    throw new Error("DEFAULT_VALUES is not an object");
  }
  return { defs, defaults };
}

function listJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json") && !name.endsWith(".draft.json"))
    .sort();
}

function loadPages() {
  const dir = path.join(CONTENT_ROOT, "ko", "pages");
  if (!fs.existsSync(dir)) {
    throw new Error(`pages directory not found: ${path.relative(ROOT, dir)}`);
  }
  const pages = new Map();
  for (const fileName of listJsonFiles(dir)) {
    const pageKey = fileName.replace(/\.json$/, "");
    const file = path.join(dir, fileName);
    try {
      pages.set(pageKey, JSON.parse(fs.readFileSync(file, "utf8")));
    } catch (error) {
      throw new Error(`cannot parse ${path.relative(ROOT, file)}: ${error.message}`);
    }
  }
  return pages;
}

/* -------------------------------------------------------------------------- */
/* Tree helpers                                                               */
/* -------------------------------------------------------------------------- */

function collectWidgets(nodes, out) {
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    if (node.kind === "widget") {
      out.push(node);
    } else if (node.kind === "col") {
      collectWidgets(node.children ?? [], out);
    } else if (node.kind === "row") {
      for (const col of node.cols ?? []) collectWidgets(col.children ?? [], out);
    }
  }
}

function sectionWidgets(section) {
  const out = [];
  collectWidgets(section.rows ?? [], out);
  if (section.aside) collectWidgets(section.aside.items ?? [], out);
  return out;
}

/** A company.history era section (`side_left` whose aside carries an image). */
function isEraSection(section) {
  if (!/\bside_left\b/.test(section.cls || "")) return false;
  const aside = [];
  if (section.aside) collectWidgets(section.aside.items ?? [], aside);
  return aside.some((widget) => widget.type === "image");
}

function stripTags(html) {
  return String(html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function hasContent(widget) {
  if (typeof widget.html === "string" && stripTags(widget.html).length > 0) return true;
  if (typeof widget.src === "string" && widget.src.trim() !== "") return true;
  if (typeof widget.text === "string" && widget.text.trim() !== "") return true;
  if (typeof widget.href === "string" && widget.href.trim() !== "") return true;
  if (Array.isArray(widget.items) && widget.items.length > 0) return true;
  if (widget.type === "code" && typeof widget.html === "string" && widget.html.trim() !== "") {
    return true;
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* Checks                                                                     */
/* -------------------------------------------------------------------------- */

/** Defs are not page targets when their section is board/nav driven. */
const NON_PAGE_SECTIONS = new Set(["board", "nav"]);

function findDanglingDefs(defs, pages) {
  const dangling = [];
  for (const def of defs) {
    if (NON_PAGE_SECTIONS.has(def.sectionId)) continue;
    const page = pages.get(def.pageKey);
    if (!page) continue; // board slug / site / unknown pageKey — not a page def

    const section = (page.sections ?? []).find((s) => s.id === def.sectionId);
    if (!section) {
      dangling.push({ key: def.key, reason: "section missing" });
      continue;
    }

    const visualMatch = VISUAL_ID_RE.exec(def.widgetId);
    if (visualMatch) {
      const slide = Array.isArray(section.visual)
        ? section.visual[Number(visualMatch[1])]
        : undefined;
      if (slide === undefined || slide === null) {
        dangling.push({ key: def.key, reason: "widget missing" });
      }
      continue;
    }

    // Hero slide-list def (`<page>#<sectionId>/visual/slides`): ONE def replaces
    // the whole `section.visual` array, so the target is the slide list itself.
    if (def.widgetId === "visual" && def.field === "slides") {
      if (!Array.isArray(section.visual) || section.visual.length === 0) {
        dangling.push({ key: def.key, reason: "slides missing" });
      }
      continue;
    }

    // Section-scoped list defs (`/cards/cards`, `/picks/picks`, `/eras/eras`,
    // `/locations/locations`, `/aboutCards/aboutCards`): the section is the target
    // and it exists (checked above) — there is no widget to look up.
    if (
      (def.widgetId === "cards" && def.field === "cards") ||
      (def.widgetId === "picks" && def.field === "picks") ||
      (def.widgetId === "eras" && def.field === "eras") ||
      (def.widgetId === "locations" && def.field === "locations") ||
      (def.widgetId === "aboutCards" && def.field === "aboutCards")
    ) {
      continue;
    }

    const found = sectionWidgets(section).some((w) => w.id === def.widgetId);
    if (!found) dangling.push({ key: def.key, reason: "widget missing" });
  }
  return dangling;
}

function findCoverage(defs, pages) {
  const defined = new Set(
    defs.map((def) => `${def.pageKey}\u0000${def.sectionId}\u0000${def.widgetId}`),
  );
  // Section-scoped `cards` defs (`<page>#<sectionId>/cards/cards`) replace the
  // whole location list; the def binds to the section (not to a widget), so the
  // text widgets it covers would otherwise all be reported as uncovered.
  const cardsSections = new Set(
    defs
      .filter((def) => def.widgetId === "cards" && def.field === "cards")
      .map((def) => `${def.pageKey}\u0000${def.sectionId}`),
  );
  // A page-level `eras` def covers every era section's widgets; a `locations`
  // def covers the branches section's widgets (name + map), which bind to no
  // per-widget defs of their own.
  const erasPages = new Set(
    defs
      .filter((def) => def.widgetId === "eras" && def.field === "eras")
      .map((def) => def.pageKey),
  );
  const locationSections = new Set(
    defs
      .filter((def) => def.widgetId === "locations" && def.field === "locations")
      .map((def) => `${def.pageKey}\u0000${def.sectionId}`),
  );
  // An `aboutCards` def (company.about block 5) covers the 6 card text widgets
  // after the heading (mirrors `hasCardsDef`).
  const aboutCardsSections = new Set(
    defs
      .filter((def) => def.widgetId === "aboutCards" && def.field === "aboutCards")
      .map((def) => `${def.pageKey}\u0000${def.sectionId}`),
  );
  // A `locations` def also covers the HQ section's name/contacts/map text
  // widgets (item 0): the section immediately preceding the branches anchor.
  const locationHqWidgets = new Set();
  for (const def of defs) {
    if (!(def.widgetId === "locations" && def.field === "locations")) continue;
    const page = pages.get(def.pageKey);
    if (!page) continue;
    const list = page.sections ?? [];
    const anchorIndex = list.findIndex((section) => section.id === def.sectionId);
    if (anchorIndex <= 0) continue;
    for (const widget of sectionWidgets(list[anchorIndex - 1])) {
      if (widget.type === "text" && typeof widget.html === "string" && widget.html.trim()) {
        locationHqWidgets.add(`${def.pageKey}\u0000${widget.id}`);
      }
    }
  }
  const coverage = [];
  for (const [pageKey, page] of pages) {
    // Alias page files (`company`) render another page's tree and emit no defs.
    if (PAGE_ALIASES[pageKey]) continue;
    for (const section of page.sections ?? []) {
      // Covered wholesale by a structured def anchored elsewhere/here.
      if (erasPages.has(pageKey) && isEraSection(section)) continue;
      if (locationSections.has(`${pageKey}\u0000${section.id}`)) continue;
      const sectionRef = `${pageKey}\u0000${section.id}`;
      const hasCardsDef = cardsSections.has(sectionRef) || aboutCardsSections.has(sectionRef);
      let seenCardText = false;
      for (const widget of sectionWidgets(section)) {
        if (locationHqWidgets.has(`${pageKey}\u0000${widget.id}`)) continue;
        if (!CONTENT_WIDGET_TYPES.has(widget.type)) continue;
        if (!hasContent(widget)) continue;
        // `code` widgets are raw embed markup, not user content — the override
        // generator skips them, so they can never have a def (pure noise here).
        if (widget.type === "code") continue;
        // The mobile back-to-top image (`href="#doz_header"`) is chrome, not
        // editable content; the generator skips it too.
        if (widget.type === "image" && widget.href === "#doz_header") continue;
        // A section carrying a `cards` def covers every text widget after the
        // first one (the heading); only that first text widget is reported.
        if (hasCardsDef && widget.type === "text") {
          if (seenCardText) continue;
          seenCardText = true;
        }
        const id = `${pageKey}\u0000${section.id}\u0000${widget.id}`;
        if (defined.has(id)) continue;
        coverage.push({
          pageKey,
          sectionId: section.id,
          widgetId: widget.id,
          type: widget.type,
        });
      }
    }
  }
  return coverage;
}

/**
 * Load stored overrides and flag keys that are neither a valid board key nor a
 * known def key. Returns `{ skipped: true }` when no DATABASE_URL is configured.
 * Throws on connection/query failure so the caller can exit 2.
 */
async function findDanglingOverrides(defKeys) {
  loadEnv({ path: [".env.local"], quiet: true });
  const connectionString = process.env.DATABASE_URL;
  if (typeof connectionString !== "string" || connectionString.length === 0) {
    return { skipped: true, danglingOverrides: [] };
  }

  const client = new Client({ connectionString });
  try {
    await client.connect();
    const { rows } = await client.query("SELECT key, locale FROM page_content");
    const danglingOverrides = [];
    for (const row of rows) {
      const key = row.key;
      if (defKeys.has(key) || BOARD_KEY_RE.test(key)) continue;
      danglingOverrides.push({ key, locale: row.locale });
    }
    danglingOverrides.sort((a, b) => {
      if (a.key !== b.key) return a.key < b.key ? -1 : 1;
      return a.locale < b.locale ? -1 : a.locale > b.locale ? 1 : 0;
    });
    return { skipped: false, danglingOverrides };
  } finally {
    await client.end().catch(() => {});
  }
}

/* -------------------------------------------------------------------------- */
/* Output                                                                     */
/* -------------------------------------------------------------------------- */

function printHuman({ defs, defaults, pages, danglingDefs, coverage, overrideResult, ok }) {
  console.log("Content registry health check");
  console.log(`  registry: ${path.relative(ROOT, REGISTRY_FILE)}`);
  console.log(
    `  content defs: ${defs.length} · defaults: ${Object.keys(defaults).length} · pages scanned: ${pages.size}`,
  );

  console.log(`\nDangling defs (ERROR): ${danglingDefs.length}`);
  for (const item of danglingDefs) console.log(`  - ${item.key}  [${item.reason}]`);

  if (overrideResult.skipped) {
    console.log("\nStored overrides (ERROR): skipped (DATABASE_URL not set)");
  } else {
    console.log(`\nStored overrides (ERROR): ${overrideResult.danglingOverrides.length}`);
    for (const item of overrideResult.danglingOverrides) {
      console.log(`  - ${item.key}  [${item.locale}]`);
    }
  }

  console.log(`\nCoverage (INFO): ${coverage.length} content-bearing widget(s) with no def`);
  const byPage = new Map();
  for (const item of coverage) {
    if (!byPage.has(item.pageKey)) byPage.set(item.pageKey, []);
    byPage.get(item.pageKey).push(item);
  }
  for (const [pageKey, items] of byPage) {
    console.log(`  ${pageKey}:`);
    for (const item of items) {
      console.log(`    - ${item.sectionId}/${item.widgetId}  (${item.type})`);
    }
  }

  const summary = ok
    ? "OK — no dangling content references."
    : `FAILED — ${danglingDefs.length} dangling def(s), ` +
      `${overrideResult.danglingOverrides.length} dangling override(s).`;
  console.log(`\n${summary}`);
}

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

async function main() {
  const asJson = process.argv.includes("--json");

  let registry;
  let pages;
  try {
    registry = loadRegistry();
    pages = loadPages();
  } catch (error) {
    console.error(`content-health: ${error.message}`);
    process.exit(2);
  }

  const { defs, defaults } = registry;
  const danglingDefs = findDanglingDefs(defs, pages);
  const coverage = findCoverage(defs, pages);
  const defKeys = new Set(defs.map((def) => def.key));

  let overrideResult;
  try {
    overrideResult = await findDanglingOverrides(defKeys);
  } catch (error) {
    console.error(`content-health: database check failed: ${error.message}`);
    process.exit(2);
  }

  const ok =
    danglingDefs.length === 0 && overrideResult.danglingOverrides.length === 0;

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          danglingDefs,
          coverage,
          danglingOverrides: overrideResult.danglingOverrides,
          ok,
        },
        null,
        2,
      ),
    );
  } else {
    printHuman({
      defs,
      defaults,
      pages,
      danglingDefs,
      coverage,
      overrideResult,
      ok,
    });
  }

  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error(
    `content-health: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(2);
});
