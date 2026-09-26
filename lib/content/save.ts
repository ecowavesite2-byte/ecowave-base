import { CONTENT_DEF_MAP, MAX_LENGTH, type ContentDef } from "./registry";
import { getPrisma } from "./db";
import type {
  FacilitiesTablePayload,
  PatentSectionsPayload,
  TechFeatureItem,
  TechFeatureRow,
  TechFeaturesPayload,
} from "../types";

/**
 * mcell-style override save logic.
 *
 * Code defaults live in `lib/content/registry.ts`; the DB stores only overrides.
 * An EMPTY value deletes the override so the code default applies again.
 *
 * Server-only: imports the Prisma factory (never imported client-side) and
 * `next/cache` lazily so this module stays importable in DB-free unit tests.
 */

/** Message returned when the DB lane is unavailable. Exported so API routes can map it to 503. */
export const DB_NOT_CONFIGURED_MESSAGE =
  "Database is not configured (DATABASE_URL missing).";

export interface SaveContentResult {
  ok: boolean;
  message?: string;
}

export interface SaveContentInput {
  key: string;
  locale: "ko" | "en";
  value: string;
  actor: string;
}

/** Relative media path (`/images/…`) or absolute http(s) URL; nothing exotic. */
function isValidMediaValue(value: string): boolean {
  // Whitespace, angle brackets, quotes, and backslashes are never valid in a URL
  // field (prevents attribute/HTML injection and stray control characters).
  if (/[\s<>"'\\]/.test(value)) return false;
  // Protocol-relative `//host` is ambiguous and not a local path.
  if (value.startsWith("//")) return false;
  // Local asset path.
  if (value.startsWith("/")) return value.length > 1;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * `slides` payloads are structured: a non-empty JSON array of
 * `{ bg: string | null, title: string, subtitle?: string }`. Rejecting
 * malformed/empty payloads at the API boundary keeps a bad request from
 * blanking the hero (Gate-2 F3).
 */
function isValidSlidesPayload(value: string): boolean {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length === 0) return false;
    return parsed.every((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
      const slide = entry as { bg?: unknown; title?: unknown; subtitle?: unknown };
      const bgOk = slide.bg === null || typeof slide.bg === "string";
      const titleOk = typeof slide.title === "string";
      const subtitleOk = slide.subtitle === undefined || typeof slide.subtitle === "string";
      return bgOk && titleOk && subtitleOk;
    });
  } catch {
    return false;
  }
}

/** `cards` payloads: a non-empty JSON array of `{ lines: string[] }`. */
function isValidCardsPayload(value: string): boolean {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length === 0) return false;
    return parsed.every((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
      const lines = (entry as { lines?: unknown }).lines;
      return Array.isArray(lines) && lines.every((line) => typeof line === "string");
    });
  } catch {
    return false;
  }
}

/** `picks` payloads: `{ board: "news" | "notices", idxs: string[] }` (non-empty). */
function isValidPicksPayload(value: string): boolean {
  try {
    const parsed = JSON.parse(value) as { board?: unknown; idxs?: unknown };
    if (parsed?.board !== "news" && parsed?.board !== "notices") return false;
    return (
      Array.isArray(parsed.idxs) &&
      parsed.idxs.length > 0 &&
      parsed.idxs.every((idx) => typeof idx === "string" || typeof idx === "number")
    );
  } catch {
    return false;
  }
}

/**
 * `eras` payloads: a non-empty JSON array of
 * `{ range, tagline, image, years: [{ year, items: string[] }] }`. Rejecting
 * malformed payloads at the boundary keeps a bad request from splicing the
 * history timeline into a broken page.
 */
function isValidErasPayload(value: string): boolean {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length === 0) return false;
    return parsed.every((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
      const era = entry as {
        range?: unknown;
        tagline?: unknown;
        image?: unknown;
        years?: unknown;
      };
      if (typeof era.range !== "string") return false;
      if (typeof era.tagline !== "string") return false;
      if (typeof era.image !== "string") return false;
      if (!Array.isArray(era.years)) return false;
      return era.years.every((yearEntry) => {
        if (!yearEntry || typeof yearEntry !== "object" || Array.isArray(yearEntry)) return false;
        const year = yearEntry as { year?: unknown; items?: unknown };
        if (typeof year.year !== "string") return false;
        return Array.isArray(year.items) && year.items.every((item) => typeof item === "string");
      });
    });
  } catch {
    return false;
  }
}

/**
 * `locations` payloads: a non-empty JSON array of
 * `{ badge, city, address, phone, fax, email, mapSrc }`. A non-empty `mapSrc`
 * must be a valid media value (relative path or http(s) URL). Returns the
 * payload NORMALIZED — missing `phone`/`fax`/`email` become `""` (backward
 * compatibility with payloads saved before the fields existed) — or `null` when
 * invalid.
 */
function normalizeLocationsPayload(value: string): string | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const out: Array<{
      badge: string;
      city: string;
      address: string;
      phone: string;
      fax: string;
      email: string;
      mapSrc: string;
    }> = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const location = entry as {
        badge?: unknown;
        city?: unknown;
        address?: unknown;
        phone?: unknown;
        fax?: unknown;
        email?: unknown;
        mapSrc?: unknown;
      };
      if (typeof location.badge !== "string") return null;
      if (typeof location.city !== "string") return null;
      if (typeof location.address !== "string") return null;
      if (typeof location.mapSrc !== "string") return null;
      if (location.mapSrc.trim().length > 0 && !isValidMediaValue(location.mapSrc)) return null;
      // Absent contact fields are the pre-upgrade shape: normalize to "".
      const phone = location.phone === undefined ? "" : location.phone;
      const fax = location.fax === undefined ? "" : location.fax;
      const email = location.email === undefined ? "" : location.email;
      if (typeof phone !== "string" || typeof fax !== "string" || typeof email !== "string") {
        return null;
      }
      out.push({
        badge: location.badge,
        city: location.city,
        address: location.address,
        phone,
        fax,
        email,
        mapSrc: location.mapSrc,
      });
    }
    return JSON.stringify(out);
  } catch {
    return null;
  }
}

/**
 * `gallery`/`aboutCards` payloads: a non-empty JSON array of
 * `{ image (non-empty valid media), title: string, desc: string }`. Returns the
 * payload NORMALIZED to its block config (disallowed fields cleared, extras
 * truncated), or `null` when invalid (including over the item cap — the editor
 * must not let a block exceed `maxItems`).
 */
function normalizeMediaPayload(
  value: string,
  cfg: { fields: ("image" | "title" | "desc")[]; maxItems?: number } | undefined,
): string | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    const fields = cfg?.fields;
    const allowTitle = !fields || fields.includes("title");
    const allowDesc = !fields || fields.includes("desc");
    const max = cfg?.maxItems;
    if (typeof max === "number" && parsed.length > max) return null;

    const out: Array<{ image: string; title: string; desc: string }> = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const item = entry as { image?: unknown; title?: unknown; desc?: unknown };
      if (typeof item.image !== "string" || item.image.trim().length === 0) return null;
      if (!isValidMediaValue(item.image)) return null;
      if (typeof item.title !== "string") return null;
      if (typeof item.desc !== "string") return null;
      out.push({
        image: item.image,
        title: allowTitle ? item.title : "",
        desc: allowDesc ? item.desc : "",
      });
    }
    const limited = typeof max === "number" ? out.slice(0, max) : out;
    if (limited.length === 0) return null;
    return JSON.stringify(limited);
  } catch {
    return null;
  }
}

/**
 * `facilityTabs` payloads: a JSON array of 1..3 `{ name, images }` tabs. `name`
 * must be a non-empty string (stored trimmed); `images` must be a non-empty
 * array of valid media values (bare `/…` paths or http(s) URLs). Returns the
 * payload NORMALIZED to `[{ name, images }]` in the same order, or `null` when
 * invalid. 1..3 keeps the tab strip inside the rebuilt renderer's lane.
 */
export function normalizeFacilityTabsPayload(value: string): string | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 3) return null;
    const out: Array<{ name: string; images: string[] }> = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const tab = entry as { name?: unknown; images?: unknown };
      if (typeof tab.name !== "string") return null;
      const name = tab.name.trim();
      if (name.length === 0) return null;
      if (!Array.isArray(tab.images) || tab.images.length === 0) return null;
      const images: string[] = [];
      for (const image of tab.images) {
        if (typeof image !== "string" || image.length === 0) return null;
        if (!isValidMediaValue(image)) return null;
        images.push(image);
      }
      out.push({ name, images });
    }
    return JSON.stringify(out);
  } catch {
    return null;
  }
}

/**
 * `techFeatures` payloads (v2): `{ blocks: [{ items: [{ image, heading,
 * rows: [{ label, body }] }] }] }`. Exactly THREE blocks (block k rebuilds the
 * k-th section, per the def's `techBlocks.sections`); each block holds 1..12
 * items, each item a non-empty valid media `image` and a non-empty `heading`;
 * `rows` holds 1..30 entries with a non-empty `label` and a (possibly empty)
 * `body`. Every string is trimmed at its outer edges only — internal newlines
 * are preserved (they map back onto authored lines / `<br>`). Returns the
 * canonical JSON, or `null` when invalid.
 */
export function normalizeTechFeaturesPayload(value: string): string | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const blocks = (parsed as { blocks?: unknown }).blocks;
    if (!Array.isArray(blocks) || blocks.length !== 3) return null;

    const out: TechFeaturesPayload["blocks"] = [];
    for (const blockEntry of blocks) {
      if (!blockEntry || typeof blockEntry !== "object" || Array.isArray(blockEntry)) return null;
      const items = (blockEntry as { items?: unknown }).items;
      if (!Array.isArray(items) || items.length === 0 || items.length > 12) return null;

      const itemsOut: TechFeatureItem[] = [];
      for (const entry of items) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
        const item = entry as { image?: unknown; heading?: unknown; rows?: unknown };
        if (typeof item.image !== "string") return null;
        const image = item.image.trim();
        if (image.length === 0 || !isValidMediaValue(image)) return null;
        if (typeof item.heading !== "string") return null;
        const heading = item.heading.trim();
        if (heading.length === 0) return null;
        if (!Array.isArray(item.rows) || item.rows.length === 0 || item.rows.length > 30) return null;

        const rows: TechFeatureRow[] = [];
        for (const rowEntry of item.rows) {
          if (!rowEntry || typeof rowEntry !== "object" || Array.isArray(rowEntry)) return null;
          const row = rowEntry as { label?: unknown; body?: unknown };
          if (typeof row.label !== "string") return null;
          const label = row.label.trim();
          if (label.length === 0) return null;
          if (typeof row.body !== "string") return null;
          rows.push({ label, body: row.body.trim() });
        }
        itemsOut.push({ image, heading, rows });
      }
      out.push({ items: itemsOut });
    }
    return JSON.stringify({ blocks: out });
  } catch {
    return null;
  }
}

/**
 * `patentSections` payloads: `{ sections: [{ title, items: [{ image, caption }] }] }`.
 * 1..12 groups; each needs a non-empty `title` and 1..60 items with a non-empty
 * valid media `image` and a (possibly empty) `caption`. Strings are trimmed at
 * their outer edges (internal newlines kept). Canonical JSON, or `null`.
 */
export function normalizePatentSectionsPayload(value: string): string | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const sections = (parsed as { sections?: unknown }).sections;
    if (!Array.isArray(sections) || sections.length === 0 || sections.length > 12) return null;

    const out: PatentSectionsPayload["sections"] = [];
    for (const entry of sections) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const section = entry as { title?: unknown; items?: unknown };
      if (typeof section.title !== "string") return null;
      const title = section.title.trim();
      if (title.length === 0) return null;
      if (!Array.isArray(section.items) || section.items.length === 0 || section.items.length > 60) {
        return null;
      }
      const items: PatentSectionsPayload["sections"][number]["items"] = [];
      for (const itemEntry of section.items) {
        if (!itemEntry || typeof itemEntry !== "object" || Array.isArray(itemEntry)) return null;
        const item = itemEntry as { image?: unknown; caption?: unknown };
        if (typeof item.image !== "string") return null;
        const image = item.image.trim();
        if (image.length === 0 || !isValidMediaValue(image)) return null;
        if (typeof item.caption !== "string") return null;
        items.push({ image, caption: item.caption.trim() });
      }
      out.push({ title, items });
    }
    return JSON.stringify({ sections: out });
  } catch {
    return null;
  }
}

/**
 * `facilitiesTable` payloads: `{ header: [string, string], rows: [[string, string]] }`.
 * `header` must hold exactly two non-empty strings; `rows` 1..100 entries of
 * exactly two (possibly empty) strings. Strings are trimmed at their outer edges.
 * Canonical JSON, or `null`.
 */
export function normalizeFacilitiesTablePayload(value: string): string | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const header = (parsed as { header?: unknown }).header;
    if (!Array.isArray(header) || header.length !== 2) return null;
    const headerOut: FacilitiesTablePayload["header"] = ["", ""];
    for (let i = 0; i < 2; i += 1) {
      const cell = header[i];
      if (typeof cell !== "string") return null;
      const trimmed = cell.trim();
      if (trimmed.length === 0) return null;
      headerOut[i] = trimmed;
    }
    const rows = (parsed as { rows?: unknown }).rows;
    if (!Array.isArray(rows) || rows.length === 0 || rows.length > 100) return null;
    const rowsOut: FacilitiesTablePayload["rows"] = [];
    for (const rowEntry of rows) {
      if (!Array.isArray(rowEntry) || rowEntry.length !== 2) return null;
      const [a, b] = rowEntry;
      if (typeof a !== "string" || typeof b !== "string") return null;
      rowsOut.push([a.trim(), b.trim()]);
    }
    return JSON.stringify({ header: headerOut, rows: rowsOut });
  } catch {
    return null;
  }
}

/**
 * Invalidate the routes a def affects.
 *
 * `ContentDef.revalidate` (emitted by the registry generator) lists the routes in
 * the form they are SERVED in: Korean is prefixless ("/", "/company") and English
 * is prefixed ("/en", "/en/company"). Next.js on the other hand prerenders every
 * locale under its segment ("/ko", "/ko/company", "/en", …), so a pages-only
 * purge of the served form can miss the cached entry that answers the request.
 * We therefore invalidate the prefixed variant as well, plus the root layout,
 * which is cheap on a site this size and guarantees the public site updates.
 */
function revalidateVariants(path: string): string[] {
  if (path === "/") return ["/", "/ko"];
  if (path.startsWith("/en/") || path === "/en") return [path];
  return [path, "/ko" + path];
}

async function revalidateDef(def: ContentDef): Promise<void> {
  try {
    const { revalidatePath } = await import("next/cache");
    const isSite = def.pageKey === "site" || def.sectionId === "nav";
    revalidatePath("/", "layout");
    for (const path of def.revalidate) {
      for (const variant of revalidateVariants(path)) {
        revalidatePath(variant, isSite ? "layout" : "page");
      }
    }
  } catch (error) {
    // The override is already persisted; a revalidation hiccup must not fail the save.
    console.warn("[content/save] revalidate failed", error);
  }
}

/**
 * Validate + persist one override.
 *
 * - unknown key / bad locale / over-length / bad media shape → `{ ok: false, message }`
 * - unconfigured DB → `{ ok: false, message: DB_NOT_CONFIGURED_MESSAGE }`
 * - empty value → delete the override row(s); `url` fields delete both locales
 * - non-empty `url` value → upsert both locales with the same value
 * - never throws
 */
export async function saveContent({
  key,
  locale,
  value,
  actor,
}: SaveContentInput): Promise<SaveContentResult> {
  const def = CONTENT_DEF_MAP[key];
  if (!def) {
    return { ok: false, message: `Unknown content key: ${key}` };
  }

  if (locale !== "ko" && locale !== "en") {
    return { ok: false, message: "locale must be ko or en" };
  }

  if (typeof value !== "string") {
    return { ok: false, message: "value must be a string" };
  }

  const trimmedLength = value.trim().length;
  if (trimmedLength > MAX_LENGTH[def.kind]) {
    return {
      ok: false,
      message: `Value exceeds the ${MAX_LENGTH[def.kind]} character limit for ${def.kind} fields`,
    };
  }

  if ((def.kind === "image" || def.kind === "url" || def.kind === "embed") && trimmedLength > 0) {
    if (!isValidMediaValue(value)) {
      return {
        ok: false,
        message: `Invalid ${def.kind} value: use a relative "/..." path or an http(s) URL`,
      };
    }
  }

  if (def.kind === "slides" && trimmedLength > 0 && !isValidSlidesPayload(value)) {
    return {
      ok: false,
      message: "Invalid slides payload: expected a non-empty JSON array of { bg, title, subtitle }",
    };
  }

  if (def.kind === "cards" && trimmedLength > 0 && !isValidCardsPayload(value)) {
    return {
      ok: false,
      message: "Invalid cards payload: expected a non-empty JSON array of { lines }",
    };
  }

  if (def.kind === "picks" && trimmedLength > 0 && !isValidPicksPayload(value)) {
    return {
      ok: false,
      message: "Invalid picks payload: expected { board, idxs }",
    };
  }

  if (def.kind === "eras" && trimmedLength > 0 && !isValidErasPayload(value)) {
    return {
      ok: false,
      message:
        "Invalid eras payload: expected a non-empty JSON array of { range, tagline, image, years }",
    };
  }

  if (def.kind === "locations" && trimmedLength > 0) {
    const normalized = normalizeLocationsPayload(value);
    if (normalized === null) {
      return {
        ok: false,
        message:
          "Invalid locations payload: expected a non-empty JSON array of { badge, city, address, phone, fax, email, mapSrc }",
      };
    }
    // Store the normalized value (missing contact fields filled with "").
    value = normalized;
  }

  if ((def.kind === "gallery" || def.kind === "aboutCards") && trimmedLength > 0) {
    const normalized = normalizeMediaPayload(value, def.gallery);
    if (normalized === null) {
      return {
        ok: false,
        message: `Invalid ${def.kind} payload: expected a non-empty JSON array of { image, title, desc } within the block limits`,
      };
    }
    // Store the normalized value (disallowed fields cleared, extras truncated).
    value = normalized;
  }

  if (def.kind === "facilityTabs" && trimmedLength > 0) {
    const normalized = normalizeFacilityTabsPayload(value);
    if (normalized === null) {
      return {
        ok: false,
        message:
          "Invalid facilityTabs payload: expected 1-3 tabs of { name, images } with valid media paths",
      };
    }
    // Store the normalized value (names trimmed, unknown fields dropped).
    value = normalized;
  }

  if (def.kind === "techFeatures" && trimmedLength > 0) {
    const normalized = normalizeTechFeaturesPayload(value);
    if (normalized === null) {
      return {
        ok: false,
        message:
          "Invalid techFeatures payload: expected 3 blocks of 1-12 items of { image, heading, rows[] } with valid media paths",
      };
    }
    value = normalized;
  }

  if (def.kind === "patentSections" && trimmedLength > 0) {
    const normalized = normalizePatentSectionsPayload(value);
    if (normalized === null) {
      return {
        ok: false,
        message:
          "Invalid patentSections payload: expected 1-12 sections of { title, items[] } with valid media paths",
      };
    }
    value = normalized;
  }

  if (def.kind === "facilitiesTable" && trimmedLength > 0) {
    const normalized = normalizeFacilitiesTablePayload(value);
    if (normalized === null) {
      return {
        ok: false,
        message:
          "Invalid facilitiesTable payload: expected { header: [string, string], rows: [[string, string]] }",
      };
    }
    value = normalized;
  }

  const prisma = getPrisma();
  if (!prisma) {
    return { ok: false, message: DB_NOT_CONFIGURED_MESSAGE };
  }

  // `url` fields are shared across locales (a link is the same in ko/en).
  const locales: Array<"ko" | "en"> =
    def.kind === "url" ? ["ko", "en"] : [locale];

  try {
    if (trimmedLength === 0) {
      await prisma.pageContent.deleteMany({
        where: { key, locale: { in: locales } },
      });
    } else {
      for (const target of locales) {
        await prisma.pageContent.upsert({
          where: { key_locale: { key, locale: target } },
          create: { key, locale: target, value, updatedBy: actor ?? null },
          update: { value, updatedBy: actor ?? null },
        });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `Failed to save override: ${message}` };
  }

  await revalidateDef(def);
  return { ok: true };
}
