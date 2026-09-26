import fs from "node:fs";
import type { Locale } from "../i18n";
import type {
  BoardContent,
  BoardPost,
  FacilityTabs,
  FacilityTabsEntry,
  GalleryBlockConfig,
  PageContent,
  Section,
  SiteData,
  TechBlocksConfig,
} from "../types";
import { boardLabel } from "./boards";
import { loadBoardPosts } from "./board-store";
import { loadOverrides } from "./db";
import { applyBoardOverrides, applyPageOverrides, applySiteOverrides } from "./merge";
import { facilitiesTabsPath, resolvePageAlias } from "./paths";
import { getBoard, getPage, getSite } from "./read";
import { isSharedIntroSection, sharedIntroFor } from "./shared-intro";
import { CONTENT_DEF_MAP } from "./registry";
import { normalizeFacilityTabsPayload } from "./save";

/**
 * Override key → registry kind, built once. The applier uses it to choose the
 * `html` contract (`lines` → plain-text injection, `textarea` → raw HTML).
 */
const OVERRIDE_KINDS: Record<string, string> = Object.fromEntries(
  Object.values(CONTENT_DEF_MAP).map((def) => [def.key, def.kind]),
);

/**
 * Override key → structured gallery block config, built once. The merge applier
 * uses it to clear disallowed fields / truncate items so a direct-DB payload
 * cannot bypass the editor's contract.
 */
const GALLERY_CONFIGS: Record<string, GalleryBlockConfig> = Object.fromEntries(
  Object.values(CONTENT_DEF_MAP)
    .filter((def) => def.gallery)
    .map((def) => [def.key, def.gallery as GalleryBlockConfig]),
);

/**
 * Override key → structured `techFeatures` block config (`techFeatures` kind).
 * Built once from the emitted defs so the merge applier maps each block to its
 * section via the registry's `techBlocks.sections` instead of hardcoded ids.
 */
const TECH_BLOCK_CONFIGS: Record<string, TechBlocksConfig> = Object.fromEntries(
  Object.values(CONTENT_DEF_MAP)
    .filter((def) => def.techBlocks)
    .map((def) => [def.key, def.techBlocks as TechBlocksConfig]),
);

/**
 * The registry key of the section-less `facilityTabs` def on rnd.facilities.
 * Derived from the registry (not hardcoded) so a regenerated key cannot drift;
 * the literal is only a defensive fallback.
 */
const FACILITY_TABS_KEY =
  Object.values(CONTENT_DEF_MAP).find(
    (def) => def.pageKey === "rnd.facilities" && def.kind === "facilityTabs",
  )?.key ?? "rnd.facilities#facilityTabs/facilityTabs";

/**
 * Permanent render-time content funnel: code defaults (file store) with
 * Postgres overrides applied on top.
 *
 * Server-only — must never be imported from a `"use client"` module (it pulls in
 * the Prisma client via `./db`).
 *
 * `loadOverrides` returns `{}` and never throws when `DATABASE_URL` is unset, so
 * with no database these functions return the unmodified base object — output
 * stays byte-identical to the pre-override site. Only a real override triggers a
 * clone (`merge.ts` always deep-clones, leaving the cached base untouched).
 */

let warned = false;

function warnOnce(error: unknown): void {
  if (warned) return;
  warned = true;
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[content/resolved] override load failed; rendering defaults: ${message}`);
}

/** Belt-and-braces guard: a broken override lookup must never break rendering. */
async function readOverrides(locale: Locale): Promise<Record<string, string>> {
  try {
    return await loadOverrides(locale);
  } catch (error) {
    warnOnce(error);
    return {};
  }
}

/** Page content with any DB overrides applied (base object is never mutated). */
export async function getResolvedPage(locale: Locale, key: string): Promise<PageContent> {
  const base = getPage(locale, key);
  const overrides = await readOverrides(locale);
  // No overrides → return the cached base untouched (no clone, no primary read).
  if (Object.keys(overrides).length === 0) return base;

  // Non-primary locale: thread the KO tree in so EN overrides can pair widgets
  // positionally (ids differ per locale). `getPage` is synchronous + cached.
  if (locale !== "ko") {
    let primaryPage: PageContent | null = null;
    try {
      primaryPage = getPage("ko", key);
    } catch {
      primaryPage = null;
    }
    return applyPageOverrides(base, overrides, locale, {
      primaryPage,
      kinds: OVERRIDE_KINDS,
      galleryConfigs: GALLERY_CONFIGS,
      techBlockConfigs: TECH_BLOCK_CONFIGS,
    });
  }

  return applyPageOverrides(base, overrides, locale, {
    kinds: OVERRIDE_KINDS,
    galleryConfigs: GALLERY_CONFIGS,
    techBlockConfigs: TECH_BLOCK_CONFIGS,
  });
}

/** Site data with any nav-label overrides applied (base object is never mutated). */
export async function getResolvedSite(locale: Locale): Promise<SiteData> {
  const base = getSite(locale);
  const overrides = await readOverrides(locale);
  if (Object.keys(overrides).length === 0) return base;
  return applySiteOverrides(base, overrides, locale);
}

/**
 * Shared intro bands: replace the rows of a page's own (dead) copy with the
 * canonical channel page's rows, so ONE def edits every channel page.
 *
 * Mirrors the footer mechanism (see `lib/content/shared-intro.ts`). Only the
 * rows are swapped (never the section), so each page keeps its local
 * `id`/`cls`/`bg` — e.g. company.philosophy's band id is in `PH48_SECTION_IDS`,
 * so replacing the section would regress its mobile typography. A channel root
 * that aliases the canonical page already serves the canonical copy and must not
 * swap. Returns `sections` untouched when the page has no shared band or no
 * matching section. Never mutates the passed array or the cached pages.
 */
export async function applySharedIntroRows(
  locale: Locale,
  pageKey: string,
  sections: Section[],
): Promise<Section[]> {
  const shared = sharedIntroFor(pageKey);
  if (!shared || resolvePageAlias(pageKey) === shared.canonicalPageKey) return sections;
  const canonical = await getResolvedPage(locale, shared.canonicalPageKey);
  const band = canonical.sections.find((s) => isSharedIntroSection(s, shared));
  if (!band) return sections;
  const rows = structuredClone(band.rows); // never mutate the cached page
  const out = sections.slice();
  for (let i = 0; i < out.length; i += 1) {
    if (isSharedIntroSection(out[i], shared)) out[i] = { ...out[i], rows };
  }
  return out;
}

/**
 * Read the file-backed facilities tabs (KO, or EN when its file exists),
 * stripping the `&quot;` delimiters the extractor left around each `url()`.
 * Mirrors the former page-local reader; `facilitiesTabsPath` keeps it
 * CONTENT_ROOT-aware.
 */
function readFacilitiesTabsBase(locale: Locale): FacilityTabsEntry[] {
  const enFile = facilitiesTabsPath("en");
  const file = locale === "en" && fs.existsSync(enFile) ? enFile : facilitiesTabsPath("ko");
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as FacilityTabsEntry[];
  return raw.map((tab) => ({
    name: tab.name,
    images: tab.images.map((src) => src.replace(/&quot;/g, "").trim()),
  }));
}

/** Add the stable per-position render id on top of the payload entries. */
function toRenderedTabs(entries: FacilityTabsEntry[]): FacilityTabs[] {
  return entries.map((tab, i) => ({ id: `tab${i + 1}`, name: tab.name, images: tab.images }));
}

/**
 * Resolved rnd.facilities tabs: the file defaults with the `facilityTabs`
 * override applied on top. An invalid/malformed override falls back to the
 * file defaults (never throws), and the validator is shared with `saveContent`
 * so the stored contract and the render contract cannot drift.
 */
export async function getResolvedFacilitiesTabs(locale: Locale): Promise<FacilityTabs[]> {
  const base = toRenderedTabs(readFacilitiesTabsBase(locale));
  const overrides = await readOverrides(locale);
  const stored = overrides[FACILITY_TABS_KEY];
  if (typeof stored !== "string" || stored.trim().length === 0) return base;

  const normalized = normalizeFacilityTabsPayload(stored);
  if (normalized === null) {
    warnOnce(new Error(`invalid facilityTabs override: ${FACILITY_TABS_KEY}`));
    return base;
  }
  try {
    return toRenderedTabs(JSON.parse(normalized) as FacilityTabsEntry[]);
  } catch (error) {
    warnOnce(error);
    return base;
  }
}

/**
 * Board content with overrides applied:
 *  - posts come from `board_post` when any rows exist, else the crawled defaults;
 *  - name precedence: stored `<slug>#board/<slug>/name` override > `boardLabel`
 *    (the crawled name is unreliable/swapped) — the label only takes effect once
 *    the board is materialized (rows or a name override present).
 *
 * With no DB and no name override this returns the cached base object untouched.
 */
export async function getResolvedBoard(locale: Locale, slug: string): Promise<BoardContent> {
  const base = getBoard(locale, slug);
  const [posts, overrides] = await Promise.all([
    loadBoardPosts(locale, slug),
    readOverrides(locale),
  ]);

  const storedName = overrides[`${slug}#board/${slug}/name`];
  const hasName = typeof storedName === "string" && storedName.trim().length > 0;
  // Nothing to apply → same cached base object (no clone).
  if (!posts && !hasName) return base;

  return applyBoardOverrides(base, overrides, slug, {
    fallbackName: boardLabel(slug, locale),
    posts,
  });
}

/** One resolved board post by idx (null when absent). */
export async function getResolvedBoardPost(
  locale: Locale,
  slug: string,
  idx: string,
): Promise<BoardPost | null> {
  const board = await getResolvedBoard(locale, slug);
  return board.posts.find((post) => post.idx === idx) ?? null;
}
