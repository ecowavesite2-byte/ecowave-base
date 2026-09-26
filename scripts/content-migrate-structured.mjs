#!/usr/bin/env node
/**
 * One-off migration for the WS2 structured kinds.
 *
 * The WS2 restructure replaced 13 per-widget overrides with two structured
 * payloads:
 *   - 9 company.history keys (3 era labels + 3 era `years` html + 3 era aside
 *     `src`) → ONE `eras` def (`company.history#<firstEra>/eras/eras`);
 *   - 4 company.global branch keys (2 name `html` + 2 map `iframe[0].src`)
 *     → ONE `locations` def (`company.global#<branches>/locations/locations`).
 *
 * This script reads the stored rows, folds any override into the corresponding
 * structured payload (seeded from the crawled defaults), upserts the new keys and
 * deletes the old rows. The HQ contacts/map defs are NOT part of this migration.
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
  findBranchRow,
  parseBranchCol,
  parseEraLabel,
  parseEraSection,
  parseEraYears,
} from "./gen-content-registry.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CONTENT_ROOT = process.env.CONTENT_ROOT ?? path.join(ROOT, "content");
const APPLY = process.argv.includes("--apply");

const HISTORY_PAGE = "company.history";
const GLOBAL_PAGE = "company.global";

function readPage(locale, pageKey) {
  const file = path.join(CONTENT_ROOT, locale, "pages", `${pageKey}.json`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

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

/** Default `locations` payload for a locale (mirrors the generator). */
function buildLocations(locale) {
  const page = readPage(locale, GLOBAL_PAGE);
  for (const section of page.sections ?? []) {
    const row = findBranchRow(section);
    if (row) return row.cols.map((col) => parseBranchCol(col).location);
  }
  return [];
}

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

/** The 4 superseded company.global branch per-widget keys (KO ids) + mapping. */
function locationsOldKeys() {
  const page = readPage("ko", GLOBAL_PAGE);
  const out = [];
  for (const section of page.sections ?? []) {
    const row = findBranchRow(section);
    if (!row) continue;
    row.cols.forEach((col, index) => {
      const { nameWidget, mapWidget } = parseBranchCol(col);
      if (nameWidget) {
        out.push({ key: `${GLOBAL_PAGE}#${section.id}/${nameWidget.id}/html`, scope: "locations", index, field: "name" });
      }
      if (mapWidget) {
        out.push({ key: `${GLOBAL_PAGE}#${section.id}/${mapWidget.id}/iframe[0].src`, scope: "locations", index, field: "map" });
      }
    });
    break; // exactly one branches row
  }
  return out;
}

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

/** New structured keys, derived from the crawled anchors. */
function structuredKeys() {
  const history = readPage("ko", HISTORY_PAGE);
  const firstEra = (history.sections ?? []).find(isEraSection);
  if (!firstEra) throw new Error("company.history has no era section");
  const global = readPage("ko", GLOBAL_PAGE);
  const branchSection = (global.sections ?? []).find((section) => findBranchRow(section));
  if (!branchSection) throw new Error("company.global has no branches row");
  return {
    eras: `${HISTORY_PAGE}#${firstEra.id}/eras/eras`,
    locations: `${GLOBAL_PAGE}#${branchSection.id}/locations/locations`,
  };
}

const UPSERT_SQL =
  'INSERT INTO page_content (key, locale, value, "updatedBy") VALUES ($1, $2, $3, $4) ' +
  'ON CONFLICT (key, locale) DO UPDATE SET value = EXCLUDED.value, "updatedBy" = EXCLUDED."updatedBy"';

async function main() {
  const oldEntries = [...historyOldKeys(), ...locationsOldKeys()];
  const oldByKey = new Map(oldEntries.map((entry) => [entry.key, entry]));
  const keys = structuredKeys();

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

    if (relevant.length === 0) {
      console.log(
        `No stored overrides for the ${oldByKey.size} superseded keys — nothing to migrate.`,
      );
      return;
    }

    const erasPayload = { ko: buildEras("ko"), en: buildEras("en") };
    const locationsPayload = { ko: buildLocations("ko"), en: buildLocations("en") };
    const touched = { eras: { ko: false, en: false }, locations: { ko: false, en: false } };

    for (const row of relevant) {
      const meta = oldByKey.get(row.key);
      if (!meta) continue;
      const locale = row.locale === "en" ? "en" : "ko";
      if (meta.scope === "eras") {
        applyEraOverride(erasPayload[locale], meta.eraIndex, meta.field, row.value);
        touched.eras[locale] = true;
      } else {
        applyLocationOverride(locationsPayload[locale], meta.index, meta.field, row.value);
        touched.locations[locale] = true;
      }
      const target = meta.scope === "eras" ? keys.eras : keys.locations;
      console.log(`  ${APPLY ? "migrate" : "would migrate"} ${row.key} [${row.locale}] → ${target}`);
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
