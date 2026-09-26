import fs from "node:fs";
import type { BoardContent, BoardPost, PageContent, SiteData } from "../types";
import { defaultLocale, type Locale } from "../i18n";
import { boardPath, pagePath, resolvePageAlias, sitePath } from "./paths";

/**
 * Read path for the file-backed content store.
 *
 * `lib/content.ts` re-exports this module, so every existing `@/lib/content`
 * import keeps working unchanged. Reads stay synchronous (`fs.readFileSync`)
 * to preserve the current API; a tiny mtime+size cache avoids re-parsing the
 * same file repeatedly during a request while still reflecting external edits
 * (the admin write lane renames a new file into place, changing mtime + size).
 */

type CacheEntry = { mtimeMs: number; size: number; data: unknown };

const cache = new Map<string, CacheEntry>();

function readJson<T>(file: string): T {
  let stat: fs.Stats | null = null;
  try {
    stat = fs.statSync(file);
  } catch {
    stat = null;
  }

  if (stat) {
    const hit = cache.get(file);
    if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) {
      return hit.data as T;
    }
  }

  const data = JSON.parse(fs.readFileSync(file, "utf8")) as T;
  if (stat) cache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, data });
  return data;
}

/**
 * File actually read for a page/board: the locale file when present, otherwise
 * the default-locale (ko) fallback — mirroring the original EN→KO existence
 * fallback. Returns the locale path even when nothing exists, so callers can
 * test for a 404 themselves.
 */
export function pageSourceFile(locale: Locale, key: string): string {
  // Alias keys (e.g. `company` → `company.ceo`) are served from the target file
  // with no redirect; `content/*/pages/company.json` stays a crawl artifact.
  const target = resolvePageAlias(key);
  const file = pagePath(locale, target);
  if (locale === defaultLocale || fs.existsSync(file)) return file;
  const fallback = pagePath(defaultLocale, target);
  return fs.existsSync(fallback) ? fallback : file;
}

export function boardSourceFile(locale: Locale, slug: string): string {
  const file = boardPath(locale, slug);
  if (locale === defaultLocale || fs.existsSync(file)) return file;
  const fallback = boardPath(defaultLocale, slug);
  return fs.existsSync(fallback) ? fallback : file;
}

/** True when the English locale has its own page file (false → EN inherits ko). */
export function hasEnglishPage(key: string): boolean {
  return fs.existsSync(pagePath("en", resolvePageAlias(key)));
}

/** True when the English locale has its own board file (false → EN inherits ko). */
export function hasEnglishBoard(slug: string): boolean {
  return fs.existsSync(boardPath("en", slug));
}

export function getSite(locale: Locale): SiteData {
  return readJson<SiteData>(sitePath(locale));
}

export function getPage(locale: Locale, key: string): PageContent {
  return readJson<PageContent>(pageSourceFile(locale, key));
}

export function getBoard(locale: Locale, slug: string): BoardContent {
  return readJson<BoardContent>(boardSourceFile(locale, slug));
}

export function getBoardPost(locale: Locale, slug: string, idx: string): BoardPost | null {
  const board = getBoard(locale, slug);
  return board.posts.find((p) => p.idx === idx) ?? null;
}

/** product category board slugs */
export const PRODUCT_BOARDS = [
  "products/eco-wave",
  "products/clean-b",
  "products/flowell",
] as const;
