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
 *     rows stay, they are the editable cards).
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
  PAIR_IGNORED_TYPES,
  findBranchRow,
  parseAboutCard,
  parseBranchCol,
  parseEraLabel,
  parseEraSection,
  parseEraYears,
  parseGalleryWidget,
  parseHqSection,
  sectionWidgets,
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
  const oldEntries = [
    ...historyOldKeys(),
    ...locationsOldKeys(),
    ...galleryOldKeys(),
    ...aboutCardsOldKeys(),
    ...pinDeleteKeys(),
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

    if (relevant.length === 0 && legacyLocations.length === 0) {
      console.log(
        `No stored overrides for the ${oldByKey.size} superseded keys nor a legacy ` +
          `locations row — nothing to migrate.`,
      );
      return;
    }

    const erasPayload = { ko: buildEras("ko"), en: buildEras("en") };
    const locationsPayload = { ko: buildLocations("ko"), en: buildLocations("en") };
    const galleriesPayload = { ko: buildGalleries("ko"), en: buildGalleries("en") };
    const aboutCardsPayload = { ko: buildAboutCards("ko"), en: buildAboutCards("en") };
    const touched = {
      eras: { ko: false, en: false },
      locations: { ko: false, en: false },
      galleries: {}, // `${widgetId}|${locale}`
      aboutCards: { ko: false, en: false },
    };

    for (const row of relevant) {
      const meta = oldByKey.get(row.key);
      if (!meta) continue;
      const locale = row.locale === "en" ? "en" : "ko";
      let target;
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
        default:
          continue;
      }
      console.log(`  ${APPLY ? "migrate" : "would migrate"} ${row.key} [${row.locale}] → ${target}`);
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
    if (touched.aboutCards.ko || touched.aboutCards.en) {
      console.log(`\n  upsert ${keys.aboutCards}`);
      for (const locale of ["ko", "en"]) {
        if (touched.aboutCards[locale]) {
          console.log(`    [${locale}] ${JSON.stringify(aboutCardsPayload[locale].items)}`);
        }
      }
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
      const deleteKeys = relevant.map((row) => row.key);
      await client.query("DELETE FROM page_content WHERE key = ANY($1::text[])", [deleteKeys]);
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
