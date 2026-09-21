import type { BoardPost } from "../types";
import type { Locale } from "../i18n";
import { getPrisma } from "./db";
import { isValidBoardSlug } from "./paths";
import { getBoard } from "./read";
import { sanitizeHtmlFragment } from "./sanitize";

/**
 * Board post store (server-only, DB-guarded like `lib/content/db.ts`).
 *
 * Collection-override semantics: the crawled JSON is the code default, and
 * `board_post` holds overrides per `(slug, locale)`.
 *   - ZERO rows for a `(slug, locale)`  → the board renders the crawled defaults;
 *   - ANY rows                          → they REPLACE the default post list
 *                                          entirely (no per-post merge), so
 *                                          delete/reorder are natural.
 * `replaceBoardPosts` writes the whole list in one transaction (deleteMany +
 * createMany), so a half-merged list is impossible. Saving an empty list clears
 * the collection and reverts to defaults (the "empty = default" rule).
 *
 * Never throws at import time; with no `DATABASE_URL` every reader behaves as
 * "no rows" and every writer returns the not-configured message.
 */

/** Mirrors `lib/content/save.ts` (frozen in this lane) so board module stays registry-free. */
export const DB_NOT_CONFIGURED_MESSAGE =
  "Database is not configured (DATABASE_URL missing).";

/** Mirrors the registry `MAX_LENGTH` spirit (text 500 / textarea 20000 / image 2000 / url 2000). */
const LIMITS = {
  idx: 40,
  title: 500,
  category: 200,
  excerpt: 1000,
  content: 20000,
  date: 40,
  url: 2000,
  fileName: 255,
} as const;

export interface BoardStoreResult {
  ok: boolean;
  message?: string;
}

function error(message: string): BoardStoreResult {
  return { ok: false, message };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isLocale(value: string): value is Locale {
  return value === "ko" || value === "en";
}

/** Relative media path (`/images/…`) or http(s) URL — mirrors `save.ts`. */
function isValidMediaValue(value: string): boolean {
  if (/[\s<>"'\\]/.test(value)) return false;
  if (value.startsWith("//")) return false;
  if (value.startsWith("/")) return value.length > 1;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

let warned = false;

function warnOnce(error: unknown): void {
  if (warned) return;
  warned = true;
  console.warn(`[content/board-store] board query failed; using defaults: ${messageOf(error)}`);
}

/** Row shape for `board_post` createMany / update. */
interface PostInput {
  slug: string;
  locale: string;
  idx: string;
  title: string;
  category: string | null;
  excerpt: string;
  content: string;
  thumb: string | null;
  isNotice: boolean;
  date: string | null;
  views: number | null;
  files: { name: string; href: string }[];
  sortOrder: number;
  updatedBy: string | null;
}

/** Structural view of a `board_post` row (avoids importing generated model types). */
interface BoardPostRow {
  idx: string;
  title: string;
  category: string | null;
  excerpt: string;
  content: string;
  thumb: string | null;
  isNotice: boolean;
  date: string | null;
  views: number | null;
  files: unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/** Validate one post (as a whole) into a typed create/update payload. */
function validatePost(
  raw: unknown,
  index: number,
  ctx: { slug: string; locale: Locale; actor: string },
): { ok: true; value: PostInput } | { ok: false; message: string } {
  const p = asRecord(raw);
  const where = `post ${index + 1}`;

  const idx = typeof p.idx === "string" ? p.idx.trim() : "";
  if (!idx) return { ok: false, message: `${where}: idx is required` };
  if (idx.length > LIMITS.idx) {
    return { ok: false, message: `${where} (${idx}): idx exceeds ${LIMITS.idx} characters` };
  }

  const title = typeof p.title === "string" ? p.title.trim() : "";
  if (!title) return { ok: false, message: `${where} (${idx}): title is required` };
  if (title.length > LIMITS.title) {
    return { ok: false, message: `${where} (${idx}): title exceeds ${LIMITS.title} characters` };
  }

  const category = p.category == null ? null : String(p.category).trim() || null;
  if (category && category.length > LIMITS.category) {
    return { ok: false, message: `${where} (${idx}): category exceeds ${LIMITS.category} characters` };
  }

  const excerpt = typeof p.excerpt === "string" ? p.excerpt : "";
  if (excerpt.length > LIMITS.excerpt) {
    return { ok: false, message: `${where} (${idx}): excerpt exceeds ${LIMITS.excerpt} characters` };
  }

  const rawContent = typeof p.content === "string" ? p.content : "";
  const content = sanitizeHtmlFragment(rawContent);
  if (content.length > LIMITS.content) {
    return { ok: false, message: `${where} (${idx}): content exceeds ${LIMITS.content} characters` };
  }

  const thumbRaw = p.thumb == null ? "" : String(p.thumb).trim();
  const thumb = thumbRaw || null;
  if (thumb && (thumb.length > LIMITS.url || !isValidMediaValue(thumb))) {
    return {
      ok: false,
      message: `${where} (${idx}): thumb must be a relative "/..." path or an http(s) URL`,
    };
  }

  let date: string | null = null;
  if (p.date != null && String(p.date).trim()) {
    date = String(p.date).trim();
    if (date.length > LIMITS.date) {
      return { ok: false, message: `${where} (${idx}): date exceeds ${LIMITS.date} characters` };
    }
  }

  let views: number | null = null;
  if (p.views != null && p.views !== "") {
    const n = Number(p.views);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, message: `${where} (${idx}): views must be a non-negative number` };
    }
    views = Math.floor(n);
  }

  const files: { name: string; href: string }[] = [];
  if (p.files != null) {
    if (!Array.isArray(p.files)) {
      return { ok: false, message: `${where} (${idx}): files must be an array` };
    }
    for (let i = 0; i < p.files.length; i += 1) {
      const entry = asRecord(p.files[i]);
      const name = typeof entry.name === "string" ? entry.name.trim() : "";
      const href = typeof entry.href === "string" ? entry.href.trim() : "";
      if (!name) return { ok: false, message: `${where} (${idx}): file ${i + 1} name is required` };
      if (name.length > LIMITS.fileName) {
        return { ok: false, message: `${where} (${idx}): file ${i + 1} name exceeds ${LIMITS.fileName} characters` };
      }
      if (!href || href.length > LIMITS.url || !isValidMediaValue(href)) {
        return {
          ok: false,
          message: `${where} (${idx}): file ${i + 1} href must be a relative "/..." path or an http(s) URL`,
        };
      }
      files.push({ name, href });
    }
  }

  return {
    ok: true,
    value: {
      slug: ctx.slug,
      locale: ctx.locale,
      idx,
      title,
      category,
      excerpt,
      content,
      thumb,
      isNotice: p.isNotice === true,
      date,
      views,
      files,
      sortOrder: index,
      updatedBy: ctx.actor ?? null,
    },
  };
}

function validatePosts(
  posts: unknown,
  ctx: { slug: string; locale: Locale; actor: string },
): { ok: true; value: PostInput[] } | { ok: false; message: string } {
  if (!Array.isArray(posts)) return { ok: false, message: "posts must be an array" };
  const value: PostInput[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < posts.length; i += 1) {
    const parsed = validatePost(posts[i], i, ctx);
    if (!parsed.ok) return parsed;
    if (seen.has(parsed.value.idx)) {
      return { ok: false, message: `duplicate post idx: ${parsed.value.idx}` };
    }
    seen.add(parsed.value.idx);
    value.push(parsed.value);
  }
  return { ok: true, value };
}

function toBoardPost(row: BoardPostRow): BoardPost {
  return {
    idx: row.idx,
    href: null,
    title: row.title,
    category: row.category ?? undefined,
    excerpt: row.excerpt,
    thumb: row.thumb,
    isNotice: row.isNotice,
    date: row.date,
    views: row.views,
    content: row.content,
    files: Array.isArray(row.files) ? (row.files as { name: string; href: string }[]) : [],
  };
}

function toPostInput(row: BoardPostRow): Record<string, unknown> {
  return {
    idx: row.idx,
    title: row.title,
    category: row.category,
    excerpt: row.excerpt,
    content: row.content,
    thumb: row.thumb,
    isNotice: row.isNotice,
    date: row.date,
    views: row.views,
    files: Array.isArray(row.files) ? row.files : [],
  };
}

/**
 * Board routes to invalidate. `revalidateVariants` mirrors the (frozen)
 * `save.ts` scheme: the served form plus the `/ko`-prefixed prerendered variant.
 */
function revalidateVariants(path: string): string[] {
  if (path === "/") return ["/", "/ko"];
  if (path.startsWith("/en/") || path === "/en") return [path];
  return [path, "/ko" + path];
}

async function revalidateBoard(slug: string): Promise<void> {
  try {
    const { revalidatePath } = await import("next/cache");
    const route = "/" + slug.replace(/\./g, "/");
    const paths = [route, `/en${route}`, `${route}/[id]`, `/en${route}/[id]`];
    revalidatePath("/", "layout");
    for (const path of paths) {
      for (const variant of revalidateVariants(path)) revalidatePath(variant, "page");
    }
  } catch (error) {
    console.warn("[content/board-store] revalidate failed", error);
  }
}

/**
 * Override posts for a `(locale, slug)`, or `null` when there are none (render
 * the crawled defaults) — also `null` when the DB is unconfigured or a read fails.
 */
export async function loadBoardPosts(locale: Locale, slug: string): Promise<BoardPost[] | null> {
  const prisma = getPrisma();
  if (!prisma) return null;
  try {
    const rows = await prisma.boardPost.findMany({
      where: { slug, locale },
      orderBy: [{ sortOrder: "asc" }, { idx: "asc" }],
    });
    if (rows.length === 0) return null;
    return rows.map((row) => toBoardPost(row));
  } catch (error) {
    warnOnce(error);
    return null;
  }
}

/** Replace the whole override collection in one transaction (empty list reverts to defaults). */
export async function replaceBoardPosts(input: {
  slug: string;
  locale: Locale;
  posts: unknown;
  actor: string;
}): Promise<BoardStoreResult> {
  const { slug, locale, posts, actor } = input;
  if (!isValidBoardSlug(slug)) return error(`Unknown board slug: ${slug}`);
  if (!isLocale(locale)) return error("locale must be ko or en");

  const validated = validatePosts(posts, { slug, locale, actor });
  if (!validated.ok) return { ok: false, message: validated.message };

  const prisma = getPrisma();
  if (!prisma) return error(DB_NOT_CONFIGURED_MESSAGE);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.boardPost.deleteMany({ where: { slug, locale } });
      if (validated.value.length > 0) {
        await tx.boardPost.createMany({ data: validated.value });
      }
    });
  } catch (err) {
    return error(`Failed to save board posts: ${messageOf(err)}`);
  }

  await revalidateBoard(slug);
  return { ok: true };
}

/** Copy the crawled default posts into `board_post` so an editor can start from them. */
export async function seedBoardFromDefaults(input: {
  slug: string;
  locale: Locale;
  actor: string;
}): Promise<BoardStoreResult> {
  const { slug, locale, actor } = input;
  if (!isValidBoardSlug(slug)) return error(`Unknown board slug: ${slug}`);
  if (!isLocale(locale)) return error("locale must be ko or en");

  let posts: BoardPost[];
  try {
    posts = getBoard(locale, slug).posts;
  } catch {
    return error(`No default board content for ${slug} (${locale})`);
  }
  if (posts.length === 0) return error("No default posts to seed");

  return replaceBoardPosts({ slug, locale, posts, actor });
}

/** Patch one override row (the board must already be seeded). */
export async function updateBoardPost(input: {
  slug: string;
  locale: Locale;
  idx: string;
  patch: Partial<BoardPost>;
  actor: string;
}): Promise<BoardStoreResult> {
  const { slug, locale, idx, patch, actor } = input;
  if (!isValidBoardSlug(slug)) return error(`Unknown board slug: ${slug}`);
  if (!isLocale(locale)) return error("locale must be ko or en");
  if (!idx) return error("idx is required");

  const prisma = getPrisma();
  if (!prisma) return error(DB_NOT_CONFIGURED_MESSAGE);

  try {
    const existing = await prisma.boardPost.findUnique({
      where: { slug_locale_idx: { slug, locale, idx } },
    });
    if (!existing) {
      return error("Post is not in the override set (seed the board first)");
    }

    const validated = validatePosts(
      [{ ...toPostInput(existing), ...asRecord(patch) }],
      { slug, locale, actor },
    );
    if (!validated.ok) return { ok: false, message: validated.message };

    await prisma.boardPost.update({
      where: { slug_locale_idx: { slug, locale, idx } },
      data: validated.value[0],
    });
  } catch (err) {
    return error(`Failed to update post: ${messageOf(err)}`);
  }

  await revalidateBoard(slug);
  return { ok: true };
}

/** Delete one override row (deleting the last row reverts the board to defaults). */
export async function deleteBoardPost(input: {
  slug: string;
  locale: Locale;
  idx: string;
}): Promise<BoardStoreResult> {
  const { slug, locale, idx } = input;
  if (!isValidBoardSlug(slug)) return error(`Unknown board slug: ${slug}`);
  if (!isLocale(locale)) return error("locale must be ko or en");
  if (!idx) return error("idx is required");

  const prisma = getPrisma();
  if (!prisma) return error(DB_NOT_CONFIGURED_MESSAGE);

  try {
    const result = await prisma.boardPost.deleteMany({ where: { slug, locale, idx } });
    if (result.count === 0) return error("Post is not in the override set");
  } catch (err) {
    return error(`Failed to delete post: ${messageOf(err)}`);
  }

  await revalidateBoard(slug);
  return { ok: true };
}

/** All override rows for a locale (admin listing); `[]` when unconfigured/empty. */
export async function listBoardRows(locale: Locale): Promise<BoardPost[]> {
  const prisma = getPrisma();
  if (!prisma) return [];
  try {
    const rows = await prisma.boardPost.findMany({
      where: { locale },
      orderBy: [{ slug: "asc" }, { sortOrder: "asc" }, { idx: "asc" }],
    });
    return rows.map((row) => toBoardPost(row));
  } catch (error) {
    warnOnce(error);
    return [];
  }
}
