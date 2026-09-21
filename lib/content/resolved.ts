import type { Locale } from "../i18n";
import type { BoardContent, BoardPost, PageContent, SiteData } from "../types";
import { boardLabel } from "./boards";
import { loadBoardPosts } from "./board-store";
import { loadOverrides } from "./db";
import { applyBoardOverrides, applyPageOverrides, applySiteOverrides } from "./merge";
import { getBoard, getPage, getSite } from "./read";

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
    return applyPageOverrides(base, overrides, locale, { primaryPage });
  }

  return applyPageOverrides(base, overrides, locale);
}

/** Site data with any nav-label overrides applied (base object is never mutated). */
export async function getResolvedSite(locale: Locale): Promise<SiteData> {
  const base = getSite(locale);
  const overrides = await readOverrides(locale);
  if (Object.keys(overrides).length === 0) return base;
  return applySiteOverrides(base, overrides, locale);
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
