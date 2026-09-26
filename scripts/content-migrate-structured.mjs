#!/usr/bin/env node
/**
 * One-off migration for the structured kinds (WS2 + WS-B).
 *
 * The structured restructures replaced per-widget overrides with payloads:
 *   - 9 company.history keys (3 era labels + 3 era `years` html + 3 era aside
 *     `src`) → ONE `eras` def (`company.history#<firstEra>/eras/eras`);
 *   - 4 company.global branch keys (2 name `html` + 2 map `iframe[0].src`)
 *     → ONE `locations` def (`company.global#<branches>/locations/locations`);
 *   - company.about gallery item keys (`items[i].title|desc|org|thumb` for the
 *     four configured blocks) → ONE `gallery` def per block;
 *   - company.about block-5 card keys (`<widget>/html` + `<widget>/img[0].src`)
 *     → ONE `aboutCards` def;
 *   - company.about block-8 pin `img[0].src` rows → deleted (the 4 text `html`
 *     rows stay, they are the editable cards);
 *   - the configured R&D galleries (`rnd.*`, plus the pre-alias `rnd` pageKey
 *     for the USP block) item keys (`items[i].title|desc|org|thumb`) → ONE
 *     structured `gallery` def per configured block, keyed on the KO widget id;
 *   - the `rnd.technology` techFeatures keys — the v1 per-section defs
 *     (`…/techFeatures/techFeatures` for §4/§5/§6) AND the older per-widget keys
 *     (image `src` + text-table `html` lines, incl. the pre-alias `rnd` page) —
 *     → ONE v2 `techFeatures` def (three fixed blocks) anchored at §4. A v1 def
 *     override wins over legacy per-widget data for its block;
 *   - the `rnd.patents` heading `html` + `gallery` keys (and the pre-gallery
 *     per-item `items[i].*` keys) → ONE `patentSections` def;
 *   - the `rnd.facilities` table `html` lines keys → ONE `facilitiesTable` def
 *     per widget.
 *
 * A legacy text-table override whose run count does not match the authored cell
 * run counts is SKIPPED (its rows are kept, never deleted) so an unexpected edit
 * can never drop content.
 *
 * This script reads the stored rows, folds any override into the corresponding
 * structured payload (seeded from the crawled defaults), upserts the new keys and
 * deletes the superseded rows.
 *
 * Default is a DRY RUN (prints what would change); pass `--apply` to write.
 *
 *   node scripts/content-migrate-structured.mjs           # dry run
 *   node scripts/content-migrate-structured.mjs --apply   # migrate + delete
 *
 * Read-only in dry-run. Mirrors the pg access in scripts/content-health.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import pg from "pg";
import {
  ABOUT_CARDS_SECTION,
  ABOUT_MEDIA_BLOCKS,
  FACILITIES_TABLES,
  PAIR_IGNORED_TYPES,
  PAGE_ALIASES,
  PATENT_SECTIONS,
  RND_MEDIA_BLOCKS,
  RND_MEDIA_WIDGET_BLOCKS,
  TECH_FEATURE_BLOCKS,
  findBranchRow,
  parseAboutCard,
  parseBranchCol,
  parseEraLabel,
  parseEraSection,
  parseEraYears,
  parseFacilitiesTable,
  parseGalleryWidget,
  parseHqSection,
  parsePatentSections,
  parseTableRows,
  parseTechFeatureSection,
  sectionWidgets,
  textRuns,
} from "./gen-content-registry.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CONTENT_ROOT = process.env.CONTENT_ROOT ?? path.join(ROOT, "content");
const APPLY = process.argv.includes("--apply");

const HISTORY_PAGE = "company.history";
const GLOBAL_PAGE = "company.global";
const ABOUT_PAGE = "company.about";
const ABOUT_PINS_SECTION = "s202509180d5f2b5ede2b3"; // block 8

function readPage(locale, pageKey) {
  const file = path.join(CONTENT_ROOT, locale, "pages", `${pageKey}.json`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/* ---------------------------------------------------------------- eras/locations */

function isEraSection(section) {
  if (!/\bside_left\b/.test(section?.cls || "")) return false;
  return Boolean(parseEraSection(section).imageWidget);
}

/** Default `eras` payload for a locale (mirrors the generator). */
function buildEras(locale) {
  const page = readPage(locale, HISTORY_PAGE);
  return (page.sections ?? []).filter(isEraSection).map((section) => {
    const { yearsWidget, labelWidget, imageWidget } = parseEraSection(section);
    const { range, tagline } = parseEraLabel(labelWidget?.html);
    return {
      range,
      tagline,
      image: typeof imageWidget?.src === "string" ? imageWidget.src : "",
      years: parseEraYears(yearsWidget?.html),
    };
  });
}

/**
 * Default `locations` payload for a locale (mirrors the generator):
 * `[hq, ...branches]` — item 0 is the HQ section preceding the branches anchor.
 */
function buildLocations(locale) {
  const page = readPage(locale, GLOBAL_PAGE);
  const sections = page.sections ?? [];
  const branches = sections.find((section) => findBranchRow(section));
  if (!branches) return [];
  const hq = parseHqSection(sections, branches.id);
  const row = findBranchRow(branches);
  return [
    ...(hq ? [hq.location] : []),
    ...(row ? row.cols.map((col) => parseBranchCol(col).location) : []),
  ];
}

/* -------------------------------------------------------------- about media */

/** KO section index → the same-index section in `locale` (generator pairing). */
function pairedSection(locale, koSectionId) {
  const koPage = readPage("ko", ABOUT_PAGE);
  const index = (koPage.sections ?? []).findIndex((section) => section.id === koSectionId);
  if (index < 0) return { koSection: null, targetSection: null };
  const targetPage = locale === "ko" ? koPage : readPage(locale, ABOUT_PAGE);
  return {
    koSection: koPage.sections[index],
    targetSection: (targetPage.sections ?? [])[index] ?? null,
  };
}

/** KO widget id → EN widget (positional, ignoring contentless types) — mirrors the generator. */
function pairWidgetMap(koSection, enSection) {
  const koWidgets = sectionWidgets(koSection).filter((w) => !PAIR_IGNORED_TYPES.has(w.type));
  const enWidgets = sectionWidgets(enSection).filter((w) => !PAIR_IGNORED_TYPES.has(w.type));
  const map = new Map();
  koWidgets.forEach((widget, i) => map.set(widget.id, enWidgets[i] ?? null));
  return map;
}

/** The single gallery2 widget of a section (all configured blocks have exactly one). */
function galleryWidget(section) {
  return sectionWidgets(section).find((w) => w.type === "gallery2") ?? null;
}

/**
 * `{ [koWidgetId]: StructuredMediaItem[] }` for every configured gallery block.
 * `image` seeds as `org || thumb`; the fold below may override it.
 */
function buildGalleries(locale) {
  const out = {};
  for (const [sectionId, cfg] of Object.entries(ABOUT_MEDIA_BLOCKS)) {
    const { koSection, targetSection } = pairedSection(locale, sectionId);
    if (!koSection || !targetSection) continue;
    const koWidget = galleryWidget(koSection);
    if (!koWidget) continue;
    const targetWidget =
      locale === "ko" ? koWidget : pairWidgetMap(koSection, targetSection).get(koWidget.id);
    if (!targetWidget) continue;
    const items = parseGalleryWidget(targetWidget, cfg);
    for (const item of items) item.__authoredImage = item.image;
    out[koWidget.id] = items;
  }
  return out;
}

/** `{ widgetId: cfg }` for the configured gallery blocks (normalization config). */
function galleryCfgByWidgetId() {
  const about = readPage("ko", ABOUT_PAGE);
  const out = {};
  for (const [sectionId, cfg] of Object.entries(ABOUT_MEDIA_BLOCKS)) {
    const section = (about.sections ?? []).find((s) => s.id === sectionId);
    const widget = section ? galleryWidget(section) : null;
    if (widget) out[widget.id] = cfg;
  }
  return out;
}

/** Block-5 card widget ids (canonical KO order) — first non-empty text is the heading. */
function aboutCardWidgets() {
  const { koSection } = pairedSection("ko", ABOUT_CARDS_SECTION);
  if (!koSection) return [];
  return sectionWidgets(koSection)
    .filter((w) => w.type === "text" && typeof w.html === "string" && w.html.trim().length > 0)
    .slice(1);
}

/** `{ ids, items }` for the `aboutCards` payload (items paired to the locale). */
function buildAboutCards(locale) {
  const koCards = aboutCardWidgets();
  if (locale === "ko") {
    return { ids: koCards.map((w) => w.id), items: koCards.map((w) => parseAboutCard(w.html)) };
  }
  const { koSection, targetSection } = pairedSection("en", ABOUT_CARDS_SECTION);
  const map = koSection && targetSection ? pairWidgetMap(koSection, targetSection) : null;
  return {
    ids: koCards.map((w) => w.id),
    items: koCards.map((w) => {
      const en = map ? map.get(w.id) : null;
      return en && en.type === "text"
        ? parseAboutCard(en.html)
        : { image: "", title: "", desc: "" };
    }),
  };
}

/* ------------------------------------------------------------------- r&d media */

/** Non-alias `rnd.*` pageKeys that exist in the crawl. */
function rndPageKeys() {
  const dir = path.join(CONTENT_ROOT, "ko", "pages");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json") && !name.endsWith(".draft.json"))
    .map((name) => name.replace(/\.json$/, ""))
    .filter((pageKey) => pageKey.startsWith("rnd") && !PAGE_ALIASES[pageKey])
    .sort();
}

/** Alias pageKeys that serve `pageKey` (e.g. `rnd` → `rnd.technology`). */
function aliasPageKeys(pageKey) {
  return Object.keys(PAGE_ALIASES).filter((alias) => PAGE_ALIASES[alias] === pageKey);
}

/**
 * Every configured structured R&D gallery, resolved from the generator's block
 * config: a section-level entry in `RND_MEDIA_BLOCKS` covers the gallery2
 * widgets of that section; a widget-level entry in `RND_MEDIA_WIDGET_BLOCKS`
 * targets one widget (used when a section holds several). The KO/EN gallery
 * widgets are paired positionally, mirroring the generator.
 *
 * The `rnd.patents` §4 galleries are superseded by the structured
 * `patentSections` kind and skipped here: the `patentSections` lane folds their
 * legacy keys directly, so they must not also be rebuilt as `gallery` defs.
 */
function rndGallerySpecs() {
  const patentWidgetIds = new Set(
    PATENT_SECTIONS.blocks.flatMap((block) => [block.headingWidget, block.galleryWidget]),
  );
  const specs = [];
  for (const pageKey of rndPageKeys()) {
    const koPage = readPage("ko", pageKey);
    const enPath = path.join(CONTENT_ROOT, "en", "pages", `${pageKey}.json`);
    const enPage = fs.existsSync(enPath) ? readPage("en", pageKey) : null;
    (koPage.sections ?? []).forEach((section, index) => {
      const sectionCfg = RND_MEDIA_BLOCKS[section.id];
      const galleries = sectionWidgets(section).filter((w) => w.type === "gallery2");
      if (galleries.length === 0) return;
      const enSection = enPage?.sections?.[index] ?? null;
      const pairMap = enSection ? pairWidgetMap(section, enSection) : new Map();
      for (const koWidget of galleries) {
        if (patentWidgetIds.has(koWidget.id)) continue;
        const cfg = sectionCfg ?? RND_MEDIA_WIDGET_BLOCKS[koWidget.id];
        if (!cfg) continue;
        specs.push({
          pageKey,
          sectionId: section.id,
          koWidget,
          enWidget: pairMap.get(koWidget.id) ?? null,
          cfg,
        });
      }
    });
  }
  return specs;
}

/** Seed `{ [koWidgetId]: StructuredMediaItem[] }` for the R&D specs, per locale. */
function buildRndGalleries(locale, specs) {
  const out = {};
  for (const spec of specs) {
    const widget = locale === "ko" ? spec.koWidget : spec.enWidget;
    if (!widget) continue;
    const items = parseGalleryWidget(widget, spec.cfg);
    for (const item of items) item.__authoredImage = item.image;
    out[spec.koWidget.id] = items;
  }
  return out;
}

/** `{ [koWidgetId]: cfg }` for the configured R&D galleries (normalization config). */
function rndGalleryCfgByWidgetId(specs) {
  return Object.fromEntries(specs.map((spec) => [spec.koWidget.id, spec.cfg]));
}

/** Superseded R&D per-item keys (`items[i].title|desc|org|thumb`), alias included. */
function rndGalleryOldKeys(specs) {
  const out = [];
  for (const spec of specs) {
    const count = (spec.koWidget.items ?? []).length;
    const prefixes = [spec.pageKey, ...aliasPageKeys(spec.pageKey)];
    for (let index = 0; index < count; index += 1) {
      for (const field of ["title", "desc", "org", "thumb"]) {
        for (const prefix of prefixes) {
          out.push({
            key: `${prefix}#${spec.sectionId}/${spec.koWidget.id}/items[${index}].${field}`,
            scope: "rndGallery",
            widgetId: spec.koWidget.id,
            index,
            field,
          });
        }
      }
    }
  }
  return out;
}

/** New structured R&D gallery keys, keyed by KO widget id. */
function rndStructuredKeys(specs) {
  const out = {};
  for (const spec of specs) {
    out[spec.koWidget.id] = `${spec.pageKey}#${spec.sectionId}/${spec.koWidget.id}/gallery`;
  }
  return out;
}

/** Drop empty-image items from the R&D payloads (the gallery contract needs images). */
function dropEmptyGalleryImages(byWidgetId) {
  for (const [widgetId, items] of Object.entries(byWidgetId)) {
    byWidgetId[widgetId] = items.filter((item) => item.image !== "");
  }
}

/* --------------------------------------------------- r&d structured kinds v2 */

const RND_TECH_PAGE = "rnd.technology";
const RND_PATENTS_PAGE = "rnd.patents";
const RND_FACILITIES_PAGE = "rnd.facilities";

/**
 * The shared R&D sub-hero banner: one canonical `lines` def now serves every R&D
 * page (see `lib/content/shared-intro.ts` / `SHARED_INTROS` in the generator), so
 * the per-page copies are dead and their stored override rows must fold onto the
 * canonical key. The pre-alias `rnd` key exists in stores created before the
 * `/rnd` → `rnd.technology` read-alias. Values are `lines` payloads (same def
 * format) and are copied as-is.
 */
const RND_INTRO_CANONICAL_KEY =
  "rnd.technology#s20250909caaa8544e0e70/w20250909b16e1f0580760/html";
const RND_INTRO_DEAD_KEYS = [
  "rnd.patents#s2025082027290aa48803c/w20250820f45ae1e9a7239/html",
  "rnd.facilities#s202508207ea6e772a48a0/w20250820e4cafbac3320e/html",
  "rnd#s20250909caaa8544e0e70/w20250909b16e1f0580760/html",
];

/** Log a fold that was skipped (its rows stay in the store, never deleted). */
function skipWarning(message) {
  console.log(`  warning: ${message}`);
}

/** Page sections for a locale, or `[]` when the page file is absent. */
function pageSectionsIfExists(locale, pageKey) {
  const file = path.join(CONTENT_ROOT, locale, "pages", `${pageKey}.json`);
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, "utf8")).sections ?? [];
}

/**
 * KO section (by id) + the EN section at the SAME index — the generator's
 * positional section pairing (`enSection = enSections[koIndex]`).
 */
function pageSectionPair(pageKey, koSectionId) {
  const koSections = readPage("ko", pageKey).sections ?? [];
  const index = koSections.findIndex((section) => section.id === koSectionId);
  if (index < 0) return null;
  const enSections = pageSectionsIfExists("en", pageKey);
  return { index, koSection: koSections[index], enSection: enSections[index] ?? null };
}

/**
 * `lookup(koWidgetId) → target widget` for a locale: KO resolves by id, EN
 * through the positional KO↔EN widget map (contentless types ignored), mirroring
 * the generator. `null` when the section cannot be resolved.
 */
function pairedWidgetResolver(pageKey, koSectionId, locale) {
  const pair = pageSectionPair(pageKey, koSectionId);
  if (!pair) return null;
  const koMap = new Map(sectionWidgets(pair.koSection).map((widget) => [widget.id, widget]));
  const pairMap = pair.enSection ? pairWidgetMap(pair.koSection, pair.enSection) : new Map();
  return (widgetId) =>
    locale === "ko" ? koMap.get(widgetId) ?? null : pairMap.get(widgetId) ?? null;
}

/**
 * Stored `lines` value → run array. The runtime persists a `\n`-joined string,
 * but a JSON array of strings (an older serialization shape) is accepted too.
 */
function lineRuns(value) {
  const raw = String(value ?? "");
  const trimmed = raw.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) && parsed.every((run) => typeof run === "string")) {
        return parsed.map((run) => run.trim());
      }
    } catch {
      /* not JSON — fall through to newline splitting */
    }
  }
  return raw.split(/\r?\n/).map((run) => run.trim());
}

/* ---- techFeatures (rnd.technology §4/§5/§6) ---- */

/** Configured techFeatures sections, in the generator's block order. */
function techFeatureSpecs() {
  return TECH_FEATURE_BLOCKS.sections.map((sectionId) => ({
    pageKey: RND_TECH_PAGE,
    sectionId,
    cfg: TECH_FEATURE_BLOCKS.bySection[sectionId],
  }));
}

/** The ONE v2 `techFeatures` key, anchored at §4 (block 0). */
function techFeatureKey() {
  return `${RND_TECH_PAGE}#${TECH_FEATURE_BLOCKS.sections[0]}/techFeatures/techFeatures`;
}

/** Block index of a KO section id, or -1 when not a techFeatures section. */
function techBlockIndex(sectionId) {
  return TECH_FEATURE_BLOCKS.sections.indexOf(sectionId);
}

/** Default v2 `{ blocks }` payloads (fixed block order) + per-locale resolvers. */
function buildTechFeatureData(specs) {
  const payloads = { ko: { blocks: [] }, en: { blocks: [] } };
  const resolvers = { ko: {}, en: {} };
  for (const locale of ["ko", "en"]) {
    payloads[locale].blocks = specs.map((spec) => {
      const resolve = pairedWidgetResolver(spec.pageKey, spec.sectionId, locale);
      resolvers[locale][spec.sectionId] = resolve;
      return { items: resolve ? parseTechFeatureSection(spec.cfg, (id) => resolve(id)) : [] };
    });
  }
  return { payloads, resolvers };
}

/** True when a v2 payload has all three blocks, each with ≥1 item. */
function techPayloadReady(payload) {
  return (
    payload &&
    Array.isArray(payload.blocks) &&
    payload.blocks.length === TECH_FEATURE_BLOCKS.sections.length &&
    payload.blocks.every((block) => Array.isArray(block.items) && block.items.length > 0)
  );
}

/** Superseded v1 per-section `techFeatures` keys (incl. the pre-alias `rnd` page). */
function techFeatureV1OldKeys(specs) {
  const out = [];
  const anchorKey = techFeatureKey();
  for (const spec of specs) {
    for (const prefix of [spec.pageKey, ...aliasPageKeys(spec.pageKey)]) {
      const key = `${prefix}#${spec.sectionId}/techFeatures/techFeatures`;
      out.push({
        key,
        scope: "techFeaturesV1",
        sectionId: spec.sectionId,
        // The §4 v1 key IS the new v2 anchor key: it is upgraded in place and
        // must NOT be deleted (else the freshly upserted v2 payload would vanish).
        // Every other v1 key (including the pre-alias `rnd` §4 form) is removed.
        preserve: key === anchorKey,
      });
    }
  }
  return out;
}

/**
 * Stored v1 `{ items: [{ image, heading, rows }] }` payload → its items, or
 * `null` when malformed (the caller skips the fold and keeps the rows).
 */
function parseTechV1Items(value) {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const items = parsed.items;
    if (!Array.isArray(items) || items.length === 0) return null;
    const out = [];
    for (const entry of items) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      if (typeof entry.image !== "string" || typeof entry.heading !== "string") return null;
      if (!Array.isArray(entry.rows) || entry.rows.length === 0) return null;
      const rows = [];
      for (const row of entry.rows) {
        if (!row || typeof row !== "object" || Array.isArray(row)) return null;
        if (typeof row.label !== "string" || typeof row.body !== "string") return null;
        rows.push({ label: row.label, body: row.body });
      }
      out.push({ image: entry.image, heading: entry.heading, rows });
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Per-cell run counts of a techFeatures text table in document order: the
 * heading cell, then each data row's label + body cell. Mirrors `parseTechTable`
 * (a 3+ cell first row carries the rowspan heading AND its own label/body).
 */
function techRunSlots(item, html) {
  const rows = parseTableRows(html);
  if (rows.length === 0) return null;
  const first = rows[0];
  const rowspanHeading = first.length >= 3;
  const dataCells = rowspanHeading ? [first.slice(1), ...rows.slice(1)] : rows.slice(1);
  if (dataCells.length !== item.rows.length) return null;
  const slots = [{ owner: item, key: "heading", count: textRuns(first[0]).length }];
  dataCells.forEach((cells, rowIndex) => {
    const row = item.rows[rowIndex];
    slots.push({ owner: row, key: "label", count: textRuns(cells[0]).length });
    slots.push({ owner: row, key: "body", count: textRuns(cells[1]).length });
  });
  return slots;
}

/**
 * Fold a stored text-table `lines` value onto a techFeatures item. Runs map
 * positionally onto the authored cells; `{ ok: false, reason }` signals a shape
 * or run-count mismatch (the caller skips the fold and keeps the row).
 */
function foldTechFeatureText(item, html, value) {
  const slots = techRunSlots(item, html);
  if (!slots) return { ok: false, reason: "authored table shape mismatch" };
  const runs = lineRuns(value);
  const total = slots.reduce((sum, slot) => sum + slot.count, 0);
  if (runs.length !== total) {
    return { ok: false, reason: `run count mismatch (stored ${runs.length}, authored ${total})` };
  }
  let cursor = 0;
  for (const slot of slots) {
    slot.owner[slot.key] = runs.slice(cursor, cursor + slot.count).join("\n");
    cursor += slot.count;
  }
  return { ok: true };
}

/** Superseded per-widget image/text keys (KO ids; pre-alias `rnd` included). */
function techFeatureOldKeys(specs) {
  const out = [];
  for (const spec of specs) {
    const prefixes = [spec.pageKey, ...aliasPageKeys(spec.pageKey)];
    spec.cfg.items.forEach((pair, itemIndex) => {
      for (const prefix of prefixes) {
        out.push({
          key: `${prefix}#${spec.sectionId}/${pair.imageWidget}/src`,
          scope: "techFeatures",
          sectionId: spec.sectionId,
          itemIndex,
          kind: "image",
        });
        out.push({
          key: `${prefix}#${spec.sectionId}/${pair.textWidget}/html`,
          scope: "techFeatures",
          sectionId: spec.sectionId,
          itemIndex,
          kind: "text",
          textWidget: pair.textWidget,
        });
      }
    });
  }
  return out;
}

/* ---- patentSections (rnd.patents §4) ---- */

/** New structured `patentSections` key. */
function patentSectionsKey() {
  return `${RND_PATENTS_PAGE}#${PATENT_SECTIONS.sectionId}/patentSections/patentSections`;
}

/** Default `{ sections }` payloads + per-locale gallery widget resolvers. */
function buildPatentSectionsData() {
  const payloads = { ko: null, en: null };
  const resolvers = { ko: null, en: null };
  for (const locale of ["ko", "en"]) {
    const resolve = pairedWidgetResolver(RND_PATENTS_PAGE, PATENT_SECTIONS.sectionId, locale);
    resolvers[locale] = resolve;
    payloads[locale] = resolve ? parsePatentSections(PATENT_SECTIONS, (id) => resolve(id)) : null;
  }
  return { payloads, resolvers };
}

/** Raw authored gallery slots of one block (before empty-image filtering). */
function patentAuthoredItems(resolve, block) {
  const widget = resolve ? resolve(block.galleryWidget) : null;
  return (widget?.items ?? []).map((item) => ({
    org: item?.org || "",
    thumb: item?.thumb || "",
    title: item?.title || "",
  }));
}

/** A legacy `gallery` payload `[{image,title,desc}]` → items; `null` when malformed. */
function parsePatentGalleryPayload(value) {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .map((entry) => ({
        image: typeof entry?.image === "string" ? entry.image : "",
        caption: typeof entry?.title === "string" ? entry.title : "",
      }))
      .filter((item) => item.image !== "");
  } catch {
    return null;
  }
}

/** Apply the collected heading / per-item / gallery patches to one block. */
function applyPatentPatches(payload, blockIndex, patch, authored) {
  if (patch.title !== undefined) payload.sections[blockIndex].title = patch.title;
  if (patch.items && patch.items.size > 0) {
    const raw = authored.map((item) => ({ ...item }));
    for (const [index, fields] of patch.items) {
      const item = raw[index];
      if (!item) continue;
      if (fields.title !== undefined) item.title = fields.title;
      if (fields.org !== undefined) item.org = fields.org;
      if (fields.thumb !== undefined) item.thumb = fields.thumb;
    }
    payload.sections[blockIndex].items = raw
      .map((item) => ({ image: item.org || item.thumb || "", caption: item.title || "" }))
      .filter((item) => item.image !== "");
  }
  if (patch.gallery) payload.sections[blockIndex].items = patch.gallery;
}

/**
 * Superseded patentSections keys: the three heading `html` rows, the three legacy
 * `gallery` payloads, and (for stores from before the structured gallery) the
 * per-item `items[i].title|desc|org|thumb` rows.
 */
function patentSectionsOldKeys(resolve) {
  const out = [];
  PATENT_SECTIONS.blocks.forEach((block, blockIndex) => {
    out.push({
      key: `${RND_PATENTS_PAGE}#${PATENT_SECTIONS.sectionId}/${block.headingWidget}/html`,
      scope: "patentSections",
      blockIndex,
      kind: "heading",
    });
    out.push({
      key: `${RND_PATENTS_PAGE}#${PATENT_SECTIONS.sectionId}/${block.galleryWidget}/gallery`,
      scope: "patentSections",
      blockIndex,
      kind: "gallery",
    });
    const widget = resolve ? resolve(block.galleryWidget) : null;
    (widget?.items ?? []).forEach((_, itemIndex) => {
      for (const field of ["title", "desc", "org", "thumb"]) {
        out.push({
          key: `${RND_PATENTS_PAGE}#${PATENT_SECTIONS.sectionId}/${block.galleryWidget}/items[${itemIndex}].${field}`,
          scope: "patentSections",
          blockIndex,
          kind: "item",
          itemIndex,
          field,
        });
      }
    });
  });
  return out;
}

/* ---- facilitiesTable (rnd.facilities §5) ---- */

/** Widget id → new structured `facilitiesTable` key. */
function facilitiesTableKeys() {
  return Object.fromEntries(
    Object.entries(FACILITIES_TABLES).map(([widgetId, cfg]) => [
      widgetId,
      `${RND_FACILITIES_PAGE}#${cfg.sectionId}/${widgetId}/facilitiesTable`,
    ]),
  );
}

/** Default `{ header, rows }` payloads + per-locale table widgets. */
function buildFacilitiesData() {
  const payloads = { ko: {}, en: {} };
  const widgets = { ko: {}, en: {} };
  for (const widgetId of Object.keys(FACILITIES_TABLES)) {
    const sectionId = FACILITIES_TABLES[widgetId].sectionId;
    for (const locale of ["ko", "en"]) {
      const resolve = pairedWidgetResolver(RND_FACILITIES_PAGE, sectionId, locale);
      const widget = resolve ? resolve(widgetId) : null;
      widgets[locale][widgetId] = widget;
      payloads[locale][widgetId] = widget ? parseFacilitiesTable(widget) : null;
    }
  }
  return { payloads, widgets };
}

/**
 * Fold a stored table `lines` value onto `{ header, rows }`. Runs map
 * positionally onto the authored cells (row0 = header, the rest = rows); a shape
 * or run-count mismatch signals a skip.
 */
function foldFacilitiesTable(payload, html, value) {
  const rows = parseTableRows(html);
  if (rows.length === 0) return { ok: false, reason: "authored table missing" };
  const plan = rows.map((cells) => cells.map((cell) => textRuns(cell).length));
  const total = plan.flat().reduce((sum, count) => sum + count, 0);
  const runs = lineRuns(value);
  if (runs.length !== total) {
    return { ok: false, reason: `run count mismatch (stored ${runs.length}, authored ${total})` };
  }
  let cursor = 0;
  const take = (count) => {
    const slice = runs.slice(cursor, cursor + count).join("\n");
    cursor += count;
    return slice;
  };
  payload.header = plan[0].map(take);
  payload.rows = plan.slice(1).map((rowPlan) => rowPlan.map(take));
  return { ok: true };
}

/** Superseded per-widget table `lines` keys. */
function facilitiesTableOldKeys() {
  return Object.entries(FACILITIES_TABLES).map(([widgetId, cfg]) => ({
    key: `${RND_FACILITIES_PAGE}#${cfg.sectionId}/${widgetId}/html`,
    scope: "facilitiesTable",
    widgetId,
  }));
}

/* ------------------------------------------------------------ superseded keys */

/** The 9 superseded company.history per-widget keys (KO ids) + their mapping. */
function historyOldKeys() {
  const page = readPage("ko", HISTORY_PAGE);
  const out = [];
  page.sections.filter(isEraSection).forEach((section, eraIndex) => {
    const { yearsWidget, labelWidget, imageWidget } = parseEraSection(section);
    if (labelWidget) {
      out.push({ key: `${HISTORY_PAGE}#${section.id}/${labelWidget.id}/html`, scope: "eras", eraIndex, field: "label" });
    }
    if (yearsWidget) {
      out.push({ key: `${HISTORY_PAGE}#${section.id}/${yearsWidget.id}/html`, scope: "eras", eraIndex, field: "years" });
    }
    if (imageWidget) {
      out.push({ key: `${HISTORY_PAGE}#${section.id}/${imageWidget.id}/src`, scope: "eras", eraIndex, field: "image" });
    }
  });
  return out;
}

/**
 * The superseded company.global per-widget keys (KO ids) + mapping:
 *  - HQ name `html`, HQ contacts `html`, HQ map `iframe[0].src` → item 0;
 *  - branch name `html` / map `iframe[0].src` → items 1+ (index offset by 1).
 */
function locationsOldKeys() {
  const page = readPage("ko", GLOBAL_PAGE);
  const sections = page.sections ?? [];
  const out = [];

  const branches = sections.find((section) => findBranchRow(section));
  if (branches) {
    // HQ = the section immediately preceding the branches anchor.
    const branchIndex = sections.indexOf(branches);
    const hqSection = branchIndex > 0 ? sections[branchIndex - 1] : null;
    const hq = hqSection ? parseHqSection(sections, branches.id) : null;
    if (hq && hqSection) {
      if (hq.nameWidget) {
        out.push({ key: `${GLOBAL_PAGE}#${hqSection.id}/${hq.nameWidget.id}/html`, scope: "hq", field: "name" });
      }
      if (hq.contactsWidget) {
        out.push({ key: `${GLOBAL_PAGE}#${hqSection.id}/${hq.contactsWidget.id}/html`, scope: "hq", field: "contacts" });
      }
      if (hq.mapWidget) {
        out.push({ key: `${GLOBAL_PAGE}#${hqSection.id}/${hq.mapWidget.id}/iframe[0].src`, scope: "hq", field: "map" });
      }
    }

    const row = findBranchRow(branches);
    row?.cols?.forEach?.((col, index) => {
      const { nameWidget, mapWidget } = parseBranchCol(col);
      // +1: item 0 is the HQ slot in the upgraded payload.
      if (nameWidget) {
        out.push({ key: `${GLOBAL_PAGE}#${branches.id}/${nameWidget.id}/html`, scope: "locations", index: index + 1, field: "name" });
      }
      if (mapWidget) {
        out.push({ key: `${GLOBAL_PAGE}#${branches.id}/${mapWidget.id}/iframe[0].src`, scope: "locations", index: index + 1, field: "map" });
      }
    });
  }
  return out;
}

/** Superseded gallery item keys (`items[i].title|desc|org|thumb`) for the four blocks. */
function galleryOldKeys() {
  const about = readPage("ko", ABOUT_PAGE);
  const out = [];
  for (const sectionId of Object.keys(ABOUT_MEDIA_BLOCKS)) {
    const section = (about.sections ?? []).find((s) => s.id === sectionId);
    const widget = section ? galleryWidget(section) : null;
    if (!widget) continue;
    (widget.items ?? []).forEach((_, index) => {
      for (const field of ["title", "desc", "org", "thumb"]) {
        out.push({
          key: `${ABOUT_PAGE}#${sectionId}/${widget.id}/items[${index}].${field}`,
          scope: "gallery",
          widgetId: widget.id,
          index,
          field,
        });
      }
    });
  }
  return out;
}

/** Superseded block-5 card keys (`<widget>/html` + `<widget>/img[0].src`). */
function aboutCardsOldKeys() {
  const out = [];
  for (const widget of aboutCardWidgets()) {
    out.push({ key: `${ABOUT_PAGE}#${ABOUT_CARDS_SECTION}/${widget.id}/html`, scope: "aboutCards", widgetId: widget.id, field: "html" });
    if (/<img\b/i.test(widget.html || "")) {
      out.push({ key: `${ABOUT_PAGE}#${ABOUT_CARDS_SECTION}/${widget.id}/img[0].src`, scope: "aboutCards", widgetId: widget.id, field: "image" });
    }
  }
  return out;
}

/** Block-8 pin `img[0].src` rows: deleted only (the 4 text `html` rows stay). */
function pinDeleteKeys() {
  const about = readPage("ko", ABOUT_PAGE);
  const section = (about.sections ?? []).find((s) => s.id === ABOUT_PINS_SECTION);
  if (!section) return [];
  return sectionWidgets(section)
    .filter((w) => w.type === "text" && typeof w.html === "string" && /<img\b/i.test(w.html))
    .map((w) => ({
      key: `${ABOUT_PAGE}#${ABOUT_PINS_SECTION}/${w.id}/img[0].src`,
      scope: "deleteOnly",
    }));
}

/** New structured keys, derived from the crawled anchors. */
function structuredKeys() {
  const history = readPage("ko", HISTORY_PAGE);
  const firstEra = (history.sections ?? []).find(isEraSection);
  if (!firstEra) throw new Error("company.history has no era section");
  const global = readPage("ko", GLOBAL_PAGE);
  const branchSection = (global.sections ?? []).find((section) => findBranchRow(section));
  if (!branchSection) throw new Error("company.global has no branches row");

  const about = readPage("ko", ABOUT_PAGE);
  const galleries = {};
  for (const [sectionId] of Object.entries(ABOUT_MEDIA_BLOCKS)) {
    const section = (about.sections ?? []).find((s) => s.id === sectionId);
    const widget = section ? galleryWidget(section) : null;
    if (widget) galleries[widget.id] = `${ABOUT_PAGE}#${sectionId}/${widget.id}/gallery`;
  }

  return {
    eras: `${HISTORY_PAGE}#${firstEra.id}/eras/eras`,
    locations: `${GLOBAL_PAGE}#${branchSection.id}/locations/locations`,
    galleries,
    aboutCards: `${ABOUT_PAGE}#${ABOUT_CARDS_SECTION}/aboutCards/aboutCards`,
  };
}

/* ------------------------------------------------------------- fold helpers */

function applyEraOverride(eras, index, field, value) {
  const era = eras[index];
  if (!era) return;
  if (field === "label") {
    const { range, tagline } = parseEraLabel(value);
    era.range = range;
    era.tagline = tagline;
  } else if (field === "years") {
    era.years = parseEraYears(value);
  } else if (field === "image") {
    era.image = value;
  }
}

/** Fold a stored HQ per-widget override into item 0 (name/contacts/map). */
function applyHqOverride(hq, field, value) {
  if (!hq) return;
  if (field === "name") {
    // Authored HQ name is `[chip, address]` (city was folded in); 3+ runs keep
    // an explicit city.
    const lines = String(value).split(/\r?\n/).map((line) => line.trim());
    hq.badge = lines[0] ?? "";
    if (lines.length >= 3) {
      hq.city = lines[1] ?? "";
      hq.address = lines[2] ?? "";
    } else {
      hq.city = "";
      hq.address = lines[1] ?? "";
    }
  } else if (field === "contacts") {
    // Runs are `["TEL", phone, "FAX", fax, "EMAIL", email]`.
    const runs = String(value).split(/\r?\n/).map((line) => line.trim());
    hq.phone = runs[1] ?? "";
    hq.fax = runs[3] ?? "";
    hq.email = runs[5] ?? "";
  } else if (field === "map") {
    hq.mapSrc = value;
  }
}

function applyLocationOverride(locations, index, field, value) {
  const location = locations[index];
  if (!location) return;
  if (field === "name") {
    const lines = String(value).split(/\r?\n/).map((line) => line.trim());
    location.badge = lines[0] ?? "";
    location.city = lines[1] ?? "";
    location.address = lines[2] ?? "";
  } else if (field === "map") {
    location.mapSrc = value;
  }
}

/**
 * Parse a stored `locations` row. Returns `null` when the value is not a
 * non-empty array of objects. Legacy rows (branch-only) have no contact fields.
 */
function parseStoredLocations(value) {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    if (!parsed.every((item) => item && typeof item === "object" && !Array.isArray(item))) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** True when a stored locations row already carries the upgraded shape. */
function hasHqContactFields(items) {
  return items.some(
    (item) =>
      item &&
      (item.phone !== undefined || item.fax !== undefined || item.email !== undefined),
  );
}

/** `image = orgOverride || thumbOverride || authored.image` (org wins over thumb). */
function applyGalleryOverride(items, index, field, value) {
  const item = items?.[index];
  if (!item) return;
  if (field === "title") item.title = value;
  else if (field === "desc") item.desc = value;
  else if (field === "org") {
    item.__org = value;
    item.image = value || item.__thumb || item.__authoredImage || "";
  } else if (field === "thumb") {
    item.__thumb = value;
    item.image = item.__org || value || item.__authoredImage || "";
  }
}

/** Drop temp keys, blank disallowed fields, cap at `maxItems` (generator config). */
function normalizeGalleries(byWidgetId, cfgByWidgetId) {
  for (const [widgetId, items] of Object.entries(byWidgetId)) {
    const cfg = cfgByWidgetId[widgetId];
    if (!cfg) continue;
    for (const item of items) {
      item.title = cfg.fields.includes("title") ? item.title || "" : "";
      item.desc = cfg.fields.includes("desc") ? item.desc || "" : "";
      delete item.__org;
      delete item.__thumb;
      delete item.__authoredImage;
    }
    if (cfg.maxItems && items.length > cfg.maxItems) items.length = cfg.maxItems;
  }
}

function applyAboutCardsOverride(payload, widgetId, field, value) {
  const index = payload.ids.indexOf(widgetId);
  if (index < 0) return;
  const item = payload.items[index];
  if (field === "image") {
    item.image = value || item.image;
  } else if (field === "html") {
    // `lines` value → title (first line) + desc (the rest).
    const lines = String(value).split(/\r?\n/);
    item.title = (lines[0] ?? "").trim();
    item.desc = lines.slice(1).map((line) => line.trim()).join("\n");
  }
}

const UPSERT_SQL =
  'INSERT INTO page_content (key, locale, value, "updatedBy") VALUES ($1, $2, $3, $4) ' +
  'ON CONFLICT (key, locale) DO UPDATE SET value = EXCLUDED.value, "updatedBy" = EXCLUDED."updatedBy"';

async function main() {
  const rndSpecs = rndGallerySpecs();
  const rndKeys = rndStructuredKeys(rndSpecs);
  const rndCfg = rndGalleryCfgByWidgetId(rndSpecs);
  const techSpecs = techFeatureSpecs();
  const techKey = techFeatureKey();
  const techData = buildTechFeatureData(techSpecs);
  const patentKey = patentSectionsKey();
  const patentData = buildPatentSectionsData();
  const facilitiesKeys = facilitiesTableKeys();
  const facilitiesData = buildFacilitiesData();
  const oldEntries = [
    ...historyOldKeys(),
    ...locationsOldKeys(),
    ...galleryOldKeys(),
    ...aboutCardsOldKeys(),
    ...pinDeleteKeys(),
    ...rndGalleryOldKeys(rndSpecs),
    ...techFeatureOldKeys(techSpecs),
    ...techFeatureV1OldKeys(techSpecs),
    ...patentSectionsOldKeys(patentData.resolvers.ko),
    ...facilitiesTableOldKeys(),
  ];
  const oldByKey = new Map(oldEntries.map((entry) => [entry.key, entry]));
  const keys = structuredKeys();
  const galleryCfg = galleryCfgByWidgetId();

  loadEnv({ path: [".env.local"], quiet: true });
  const connectionString = process.env.DATABASE_URL;
  if (typeof connectionString !== "string" || connectionString.length === 0) {
    console.log("DATABASE_URL not set — nothing to do.");
    return;
  }

  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const { rows } = await client.query("SELECT key, locale, value FROM page_content");
    const relevant = rows.filter((row) => oldByKey.has(row.key));
    // Stored `locations` rows from the branch-only era: legacy shape (no contact
    // fields) needs the HQ item prepended.
    const storedLocationsRows = rows.filter((row) => row.key === keys.locations);
    const legacyLocations = storedLocationsRows.filter((row) => {
      const items = parseStoredLocations(row.value);
      return items !== null && !hasHqContactFields(items);
    });
    // Stored rows of the shared R&D intro banner (canonical + superseded copies).
    const rndIntroKeys = new Set([RND_INTRO_CANONICAL_KEY, ...RND_INTRO_DEAD_KEYS]);
    const rndIntroRows = rows.filter((row) => rndIntroKeys.has(row.key));

    if (
      relevant.length === 0 &&
      legacyLocations.length === 0 &&
      rndIntroRows.length === 0
    ) {
      console.log(
        `No stored overrides for the ${oldByKey.size} superseded keys, the shared R&D intro ` +
          `banner, nor a legacy locations row — nothing to migrate.`,
      );
      return;
    }

    const erasPayload = { ko: buildEras("ko"), en: buildEras("en") };
    const locationsPayload = { ko: buildLocations("ko"), en: buildLocations("en") };
    const galleriesPayload = { ko: buildGalleries("ko"), en: buildGalleries("en") };
    const aboutCardsPayload = { ko: buildAboutCards("ko"), en: buildAboutCards("en") };
    const rndGalleriesPayload = {
      ko: buildRndGalleries("ko", rndSpecs),
      en: buildRndGalleries("en", rndSpecs),
    };
    const touched = {
      eras: { ko: false, en: false },
      locations: { ko: false, en: false },
      galleries: {}, // `${widgetId}|${locale}`
      aboutCards: { ko: false, en: false },
      rndGalleries: {}, // `${koWidgetId}|${locale}`
      techFeatures: { ko: false, en: false },
      patentSections: { ko: false, en: false },
      facilitiesTable: {}, // `${widgetId}|${locale}`
    };
    // Only the rows that were actually folded are deleted; a skipped fold keeps
    // its rows so a shape mismatch can never drop content.
    const migrated = new Set();
    // Collected patentSections overrides, applied after the loop in a fixed
    // heading → per-item → gallery order so row order cannot change precedence.
    const patentPatches = { ko: {}, en: {} };
    // Collected v1 techFeatures per-section overrides, applied after the legacy
    // per-widget folds so a v1 def override wins for its block.
    const techV1Patches = { ko: {}, en: {} };

    for (const row of relevant) {
      const meta = oldByKey.get(row.key);
      if (!meta) continue;
      const locale = row.locale === "en" ? "en" : "ko";
      let target;
      let skip = false;
      switch (meta.scope) {
        case "eras":
          applyEraOverride(erasPayload[locale], meta.eraIndex, meta.field, row.value);
          touched.eras[locale] = true;
          target = keys.eras;
          break;
        case "hq":
          applyHqOverride(locationsPayload[locale][0], meta.field, row.value);
          touched.locations[locale] = true;
          target = keys.locations;
          break;
        case "locations":
          applyLocationOverride(locationsPayload[locale], meta.index, meta.field, row.value);
          touched.locations[locale] = true;
          target = keys.locations;
          break;
        case "gallery":
          applyGalleryOverride(galleriesPayload[locale][meta.widgetId], meta.index, meta.field, row.value);
          touched.galleries[`${meta.widgetId}|${locale}`] = true;
          target = keys.galleries[meta.widgetId];
          break;
        case "aboutCards":
          applyAboutCardsOverride(aboutCardsPayload[locale], meta.widgetId, meta.field, row.value);
          touched.aboutCards[locale] = true;
          target = keys.aboutCards;
          break;
        case "deleteOnly":
          target = "(delete superseded pin row)";
          break;
        case "rndGallery": {
          const items = rndGalleriesPayload[locale][meta.widgetId];
          if (!items) {
            skipWarning(`skip ${row.key}: no ${locale} gallery payload for ${meta.widgetId}`);
            skip = true;
            break;
          }
          applyGalleryOverride(items, meta.index, meta.field, row.value);
          touched.rndGalleries[`${meta.widgetId}|${locale}`] = true;
          target = rndKeys[meta.widgetId];
          break;
        }
        case "techFeatures": {
          const blockIndex = techBlockIndex(meta.sectionId);
          const block = techData.payloads[locale].blocks[blockIndex];
          const resolve = techData.resolvers[locale][meta.sectionId];
          const item = block?.items?.[meta.itemIndex];
          if (blockIndex < 0 || !resolve || !item) {
            skipWarning(`skip ${row.key}: no ${locale} techFeatures target for ${meta.sectionId}`);
            skip = true;
            break;
          }
          if (meta.kind === "image") {
            item.image = row.value;
          } else {
            const textWidget = resolve(meta.textWidget);
            const result = foldTechFeatureText(item, textWidget?.html, row.value);
            if (!result.ok) {
              skipWarning(`skip ${row.key}: ${result.reason}`);
              skip = true;
              break;
            }
          }
          touched.techFeatures[locale] = true;
          target = techKey;
          break;
        }
        case "techFeaturesV1": {
          const items = parseTechV1Items(row.value);
          if (!items || techBlockIndex(meta.sectionId) < 0) {
            skipWarning(`skip ${row.key}: malformed v1 techFeatures payload`);
            skip = true;
            break;
          }
          techV1Patches[locale][meta.sectionId] = items;
          touched.techFeatures[locale] = true;
          target = techKey;
          break;
        }
        case "patentSections": {
          const payload = patentData.payloads[locale];
          const resolve = patentData.resolvers[locale];
          if (!payload || !resolve) {
            skipWarning(`skip ${row.key}: no ${locale} patentSections target`);
            skip = true;
            break;
          }
          const patch = (patentPatches[locale][meta.blockIndex] ??= { items: new Map() });
          if (meta.kind === "heading") {
            patch.title = lineRuns(row.value).join("\n");
          } else if (meta.kind === "gallery") {
            const items = parsePatentGalleryPayload(row.value);
            if (items === null) {
              skipWarning(`skip ${row.key}: malformed gallery payload`);
              skip = true;
              break;
            }
            patch.gallery = items;
          } else {
            const fields = patch.items.get(meta.itemIndex) ?? {};
            fields[meta.field] = row.value;
            patch.items.set(meta.itemIndex, fields);
          }
          touched.patentSections[locale] = true;
          target = patentKey;
          break;
        }
        case "facilitiesTable": {
          const payload = facilitiesData.payloads[locale][meta.widgetId];
          const widget = facilitiesData.widgets[locale][meta.widgetId];
          if (!payload || !widget) {
            skipWarning(`skip ${row.key}: no ${locale} facilitiesTable target for ${meta.widgetId}`);
            skip = true;
            break;
          }
          const result = foldFacilitiesTable(payload, widget.html, row.value);
          if (!result.ok) {
            skipWarning(`skip ${row.key}: ${result.reason}`);
            skip = true;
            break;
          }
          touched.facilitiesTable[`${meta.widgetId}|${locale}`] = true;
          target = facilitiesKeys[meta.widgetId];
          break;
        }
        default:
          continue;
      }
      if (skip) continue;
      // `preserve` rows (the §4 anchor, which is now the v2 key) are upgraded in
      // place and must not be queued for deletion.
      if (!meta.preserve) migrated.add(row.key);
      console.log(`  ${APPLY ? "migrate" : "would migrate"} ${row.key} [${row.locale}] → ${target}`);
    }

    // Shared R&D intro banner: fold the superseded per-page copies onto the one
    // canonical key. A stored non-empty canonical value wins (the dead rows are
    // still deleted); otherwise the first non-empty dead value (patents →
    // facilities → pre-alias `rnd`) is adopted, warning when several differ. A
    // locale with no stored row for the canonical and no dead row is a no-op.
    const rndIntroDeletes = new Set();
    const rndIntroUpserts = [];
    for (const locale of ["ko", "en"]) {
      const rowFor = (key) =>
        rndIntroRows.find((row) => row.key === key && row.locale === locale) ?? null;
      const nonEmpty = (row) =>
        row && typeof row.value === "string" && row.value.trim().length > 0 ? row.value : null;
      const canonicalValue = nonEmpty(rowFor(RND_INTRO_CANONICAL_KEY));
      const dead = RND_INTRO_DEAD_KEYS.map((key) => ({ key, value: nonEmpty(rowFor(key)) })).filter(
        (entry) => entry.value !== null,
      );
      if (dead.length === 0) continue; // nothing superseded to fold
      if (canonicalValue) {
        console.log(
          `  ${APPLY ? "keep" : "would keep"} ${RND_INTRO_CANONICAL_KEY} [${locale}] (stored value)`,
        );
      } else {
        const adopted = dead[0];
        const distinct = [...new Set(dead.map((entry) => entry.value))];
        if (distinct.length > 1) {
          skipWarning(
            `distinct superseded rnd intro values for [${locale}]; adopting ${adopted.key}`,
          );
        }
        rndIntroUpserts.push({ locale, value: adopted.value });
        console.log(
          `  ${APPLY ? "adopt" : "would adopt"} ${adopted.key} [${locale}] → ${RND_INTRO_CANONICAL_KEY}`,
        );
      }
      for (const entry of dead) {
        rndIntroDeletes.add(entry.key);
        console.log(`  ${APPLY ? "delete" : "would delete"} ${entry.key} [${locale}]`);
      }
    }

    // Apply the collected patentSections patches (heading + per-item + gallery).
    for (const locale of ["ko", "en"]) {
      const payload = patentData.payloads[locale];
      const resolve = patentData.resolvers[locale];
      if (!payload || !resolve) continue;
      for (const [blockIndex, patch] of Object.entries(patentPatches[locale])) {
        const hasContent =
          patch.title !== undefined || patch.gallery !== undefined || patch.items.size > 0;
        if (!hasContent) continue;
        const block = PATENT_SECTIONS.blocks[Number(blockIndex)];
        applyPatentPatches(payload, Number(blockIndex), patch, patentAuthoredItems(resolve, block));
      }
    }

    // v1 per-section techFeatures overrides replace their block wholesale, winning
    // over any legacy per-widget data folded into that block (per locale).
    for (const locale of ["ko", "en"]) {
      for (const [sectionId, items] of Object.entries(techV1Patches[locale])) {
        const blockIndex = techBlockIndex(sectionId);
        if (blockIndex < 0) continue;
        techData.payloads[locale].blocks[blockIndex] = { items };
      }
    }

    // Upgrade legacy stored `locations` rows (branch-only, no contact fields) by
    // prepending the folded HQ item; the admin-authored branch edits are kept.
    for (const row of legacyLocations) {
      const locale = row.locale === "en" ? "en" : "ko";
      const items = parseStoredLocations(row.value);
      const hq = locationsPayload[locale][0];
      if (!items || !hq) continue;
      locationsPayload[locale] = [hq, ...items];
      touched.locations[locale] = true;
      console.log(
        `  ${APPLY ? "upgrade" : "would upgrade"} ${row.key} [${row.locale}] → prepend HQ item to locations`,
      );
    }

    for (const locale of ["ko", "en"]) normalizeGalleries(galleriesPayload[locale], galleryCfg);
    for (const locale of ["ko", "en"]) {
      normalizeGalleries(rndGalleriesPayload[locale], rndCfg);
      dropEmptyGalleryImages(rndGalleriesPayload[locale]);
    }

    if (touched.eras.ko || touched.eras.en) {
      console.log(`\n  upsert ${keys.eras}`);
      for (const locale of ["ko", "en"]) {
        if (touched.eras[locale]) console.log(`    [${locale}] ${JSON.stringify(erasPayload[locale])}`);
      }
    }
    if (touched.locations.ko || touched.locations.en) {
      console.log(`\n  upsert ${keys.locations}`);
      for (const locale of ["ko", "en"]) {
        if (touched.locations[locale]) {
          console.log(`    [${locale}] ${JSON.stringify(locationsPayload[locale])}`);
        }
      }
    }
    for (const entry of Object.keys(touched.galleries)) {
      const [widgetId, locale] = entry.split("|");
      console.log(`\n  upsert ${keys.galleries[widgetId]}`);
      console.log(`    [${locale}] ${JSON.stringify(galleriesPayload[locale][widgetId])}`);
    }
    for (const entry of Object.keys(touched.rndGalleries)) {
      const [widgetId, locale] = entry.split("|");
      console.log(`\n  upsert ${rndKeys[widgetId]}`);
      console.log(`    [${locale}] ${JSON.stringify(rndGalleriesPayload[locale][widgetId])}`);
    }
    if (touched.aboutCards.ko || touched.aboutCards.en) {
      console.log(`\n  upsert ${keys.aboutCards}`);
      for (const locale of ["ko", "en"]) {
        if (touched.aboutCards[locale]) {
          console.log(`    [${locale}] ${JSON.stringify(aboutCardsPayload[locale].items)}`);
        }
      }
    }
    if (touched.techFeatures.ko || touched.techFeatures.en) {
      console.log(`\n  upsert ${techKey}`);
      for (const locale of ["ko", "en"]) {
        if (!touched.techFeatures[locale]) continue;
        if (!techPayloadReady(techData.payloads[locale])) {
          skipWarning(`not upserting ${techKey} [${locale}]: incomplete techFeatures payload`);
          continue;
        }
        console.log(`    [${locale}] ${JSON.stringify(techData.payloads[locale])}`);
      }
    }
    if (touched.patentSections.ko || touched.patentSections.en) {
      console.log(`\n  upsert ${patentKey}`);
      for (const locale of ["ko", "en"]) {
        if (touched.patentSections[locale]) {
          console.log(`    [${locale}] ${JSON.stringify(patentData.payloads[locale])}`);
        }
      }
    }
    for (const entry of Object.keys(touched.facilitiesTable)) {
      const [widgetId, locale] = entry.split("|");
      console.log(`\n  upsert ${facilitiesKeys[widgetId]}`);
      console.log(`    [${locale}] ${JSON.stringify(facilitiesData.payloads[locale][widgetId])}`);
    }
    for (const entry of rndIntroUpserts) {
      console.log(`\n  ${APPLY ? "upsert" : "would upsert"} ${RND_INTRO_CANONICAL_KEY}`);
      console.log(`    [${entry.locale}] ${entry.value}`);
    }

    if (APPLY) {
      if (touched.eras.ko || touched.eras.en) {
        for (const locale of ["ko", "en"]) {
          if (!touched.eras[locale]) continue;
          await client.query(UPSERT_SQL, [
            keys.eras,
            locale,
            JSON.stringify(erasPayload[locale]),
            "content-migrate-structured",
          ]);
        }
      }
      if (touched.locations.ko || touched.locations.en) {
        for (const locale of ["ko", "en"]) {
          if (!touched.locations[locale]) continue;
          await client.query(UPSERT_SQL, [
            keys.locations,
            locale,
            JSON.stringify(locationsPayload[locale]),
            "content-migrate-structured",
          ]);
        }
      }
      for (const entry of Object.keys(touched.galleries)) {
        const [widgetId, locale] = entry.split("|");
        await client.query(UPSERT_SQL, [
          keys.galleries[widgetId],
          locale,
          JSON.stringify(galleriesPayload[locale][widgetId]),
          "content-migrate-structured",
        ]);
      }
      for (const entry of Object.keys(touched.rndGalleries)) {
        const [widgetId, locale] = entry.split("|");
        await client.query(UPSERT_SQL, [
          rndKeys[widgetId],
          locale,
          JSON.stringify(rndGalleriesPayload[locale][widgetId]),
          "content-migrate-structured",
        ]);
      }
      if (touched.aboutCards.ko || touched.aboutCards.en) {
        for (const locale of ["ko", "en"]) {
          if (!touched.aboutCards[locale]) continue;
          await client.query(UPSERT_SQL, [
            keys.aboutCards,
            locale,
            JSON.stringify(aboutCardsPayload[locale].items),
            "content-migrate-structured",
          ]);
        }
      }
      if (touched.techFeatures.ko || touched.techFeatures.en) {
        for (const locale of ["ko", "en"]) {
          if (!touched.techFeatures[locale]) continue;
          const payload = techData.payloads[locale];
          if (!techPayloadReady(payload)) {
            skipWarning(`not upserting ${techKey} [${locale}]: incomplete techFeatures payload`);
            continue;
          }
          await client.query(UPSERT_SQL, [
            techKey,
            locale,
            JSON.stringify(payload),
            "content-migrate-structured",
          ]);
        }
      }
      if (touched.patentSections.ko || touched.patentSections.en) {
        for (const locale of ["ko", "en"]) {
          if (!touched.patentSections[locale]) continue;
          await client.query(UPSERT_SQL, [
            patentKey,
            locale,
            JSON.stringify(patentData.payloads[locale]),
            "content-migrate-structured",
          ]);
        }
      }
      for (const entry of Object.keys(touched.facilitiesTable)) {
        const [widgetId, locale] = entry.split("|");
        await client.query(UPSERT_SQL, [
          facilitiesKeys[widgetId],
          locale,
          JSON.stringify(facilitiesData.payloads[locale][widgetId]),
          "content-migrate-structured",
        ]);
      }
      for (const entry of rndIntroUpserts) {
        await client.query(UPSERT_SQL, [
          RND_INTRO_CANONICAL_KEY,
          entry.locale,
          entry.value,
          "content-migrate-structured",
        ]);
      }
      const deleteKeys = [...new Set([...migrated, ...rndIntroDeletes])];
      if (deleteKeys.length > 0) {
        await client.query("DELETE FROM page_content WHERE key = ANY($1::text[])", [deleteKeys]);
      }
      console.log(`\nApplied. Deleted ${deleteKeys.length} superseded row(s).`);
    } else {
      console.log("\nDry run — no changes written. Re-run with --apply to migrate.");
    }
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(String((error && error.stack) || error));
  process.exit(1);
});
