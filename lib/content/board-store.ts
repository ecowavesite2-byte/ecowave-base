import type { BoardPost } from "../types";
import type { Locale } from "../i18n";
import { isProductBoard } from "./boards";
import { getPrisma } from "./db";
import { isValidBoardSlug, normalizeBoardSlug } from "./paths";
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

/** Max characters of a server-derived product-post excerpt (before uniqueness). */
const EXCERPT_MAX = 160;

/**
 * Vercel Blob public host — the only remote host `next.config.ts` allowlists, so
 * the only remote `thumb` `next/image` can actually render.
 */
const BLOB_THUMB_RE = /^https:\/\/[^/\s]+\.public\.blob\.vercel-storage\.com\/\S*$/i;

/**
 * A server-derived product `thumb` is only useful when `next/image` can render
 * it WITHOUT a config change: a site-relative `/...` path or a Vercel Blob
 * public URL. Any other host pasted into a body (the `next.config.ts`
 * allowlist has no entry for it) would break the card grid, so `deriveThumb`
 * drops it to `null` and the card renders without an image.
 *
 * Deliberately narrower than `isValidMediaValue` (which keeps accepting any
 * http(s) URL for the non-product thumb/file validations).
 */
function isRenderableThumb(value: string): boolean {
  if (value.startsWith("//")) return false;
  if (value.startsWith("/")) return value.length > 1;
  return BLOB_THUMB_RE.test(value);
}

/** First `<img src="…">` value in an html fragment, or null when there is none. */
function firstImageSrc(html: string): string | null {
  const match = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(html);
  if (!match) return null;
  const src = (match[1] ?? match[2] ?? "").trim();
  return src || null;
}

/** Strip tags, decode common entities and collapse whitespace to plain text. */
function toPlainText(html: string): string {
  return String(html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/gi, "'")
    .replace(/&#x0*27;/gi, "'")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Clip plain text to ~`max` characters on a word boundary (hard cut for CJK). */
function clipToWords(text: string, max = EXCERPT_MAX): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trim();
}

/**
 * Server-derived excerpt base for a product post: plain text of its content
 * (falling back to the title when the body carries no text), clipped to ~160
 * characters on a word boundary.
 */
function excerptBase(post: { content: string; title: string }): string {
  return clipToWords(toPlainText(post.content) || post.title);
}

/**
 * Make `base` unique against the excerpts already `used`, appending a
 * ` … (#idx)` disambiguator and re-checking until it no longer collides. Bounded
 * so pathological look-alike content can never loop forever.
 */
function uniqueExcerpt(base: string, idx: string, used: Set<string>): string {
  let candidate = base;
  let attempt = 0;
  while (used.has(candidate) && attempt < 100) {
    attempt += 1;
    candidate =
      attempt === 1 ? `${base} … (#${idx})` : `${base} … (#${idx}) (${attempt})`;
  }
  return candidate;
}

/** Server-derived `thumb` for a product post: its first renderable image, else null. */
function deriveThumb(content: string): string | null {
  const src = firstImageSrc(content);
  if (!src || src.length > LIMITS.url || !isRenderableThumb(src)) return null;
  return src;
}

/**
 * Product-board save rule: every post's `thumb`/`excerpt` is server-derived
 * (client-provided values are ignored) and excerpts are made unique across the
 * whole incoming list.
 */
function deriveProductFields(posts: PostInput[]): PostInput[] {
  const used = new Set<string>();
  return posts.map((post) => {
    const excerpt = uniqueExcerpt(excerptBase(post), post.idx, used);
    used.add(excerpt);
    return { ...post, thumb: deriveThumb(post.content), excerpt };
  });
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
  files: { name: string; href: string; size?: number }[];
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
  ctx: { slug: string; locale: Locale; actor: string; product: boolean },
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

  // Product boards derive `excerpt` server-side (after the whole list is known)
  // and `thumb` from the content, so client-provided values are ignored here.
  const excerpt = ctx.product ? "" : typeof p.excerpt === "string" ? p.excerpt : "";
  if (!ctx.product && excerpt.length > LIMITS.excerpt) {
    return { ok: false, message: `${where} (${idx}): excerpt exceeds ${LIMITS.excerpt} characters` };
  }

  const rawContent = typeof p.content === "string" ? p.content : "";
  const content = sanitizeHtmlFragment(rawContent);
  if (content.length > LIMITS.content) {
    return { ok: false, message: `${where} (${idx}): content exceeds ${LIMITS.content} characters` };
  }

  let thumb: string | null = null;
  if (!ctx.product) {
    const thumbRaw = p.thumb == null ? "" : String(p.thumb).trim();
    thumb = thumbRaw || null;
    if (thumb && (thumb.length > LIMITS.url || !isValidMediaValue(thumb))) {
      return {
        ok: false,
        message: `${where} (${idx}): thumb must be a relative "/..." path or an http(s) URL`,
      };
    }
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

  const files: { name: string; href: string; size?: number }[] = [];
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
      const file: { name: string; href: string; size?: number } = { name, href };
      if (entry.size != null && entry.size !== "") {
        const size = Number(entry.size);
        if (!Number.isFinite(size) || size < 0) {
          return {
            ok: false,
            message: `${where} (${idx}): file ${i + 1} size must be a non-negative number`,
          };
        }
        file.size = Math.floor(size);
      }
      files.push(file);
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
  ctx: { slug: string; locale: Locale; actor: string; product: boolean },
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
    files: Array.isArray(row.files) ? (row.files as { name: string; href: string; size?: number }[]) : [],
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
  const normalized = normalizeBoardSlug(slug);
  const prisma = getPrisma();
  if (!prisma) return null;
  try {
    const rows = await prisma.boardPost.findMany({
      where: { slug: normalized, locale },
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
  const { locale, posts, actor } = input;
  const slug = normalizeBoardSlug(input.slug);
  if (!isValidBoardSlug(slug)) return error(`Unknown board slug: ${slug}`);
  if (!isLocale(locale)) return error("locale must be ko or en");

  const product = isProductBoard(slug);
  const validated = validatePosts(posts, { slug, locale, actor, product });
  if (!validated.ok) return { ok: false, message: validated.message };

  // Product posts always carry server-derived thumb/excerpt (client values are
  // ignored); other boards keep exactly what the caller sent.
  const value = product ? deriveProductFields(validated.value) : validated.value;

  const prisma = getPrisma();
  if (!prisma) return error(DB_NOT_CONFIGURED_MESSAGE);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.boardPost.deleteMany({ where: { slug, locale } });
      if (value.length > 0) {
        await tx.boardPost.createMany({ data: value });
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
  const { locale, actor } = input;
  const slug = normalizeBoardSlug(input.slug);
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
  const { locale, idx, patch, actor } = input;
  const slug = normalizeBoardSlug(input.slug);
  if (!isValidBoardSlug(slug)) return error(`Unknown board slug: ${slug}`);
  if (!isLocale(locale)) return error("locale must be ko or en");
  if (!idx) return error("idx is required");

  // `idx` is the row identity (part of the `slug_locale_idx` unique key) and is
  // never exposed by the UI. A patch that tries to rename it is rejected rather
  // than silently moving the row under a new key; passing the same value is a
  // harmless no-op and stays allowed.
  const patchRecord = asRecord(patch);
  if (patchRecord.idx !== undefined && patchRecord.idx !== idx) {
    return error(`idx is immutable (got "${String(patchRecord.idx)}" for post "${idx}")`);
  }

  const prisma = getPrisma();
  if (!prisma) return error(DB_NOT_CONFIGURED_MESSAGE);

  try {
    const existing = await prisma.boardPost.findUnique({
      where: { slug_locale_idx: { slug, locale, idx } },
    });
    if (!existing) {
      return error("Post is not in the override set (seed the board first)");
    }

    const product = isProductBoard(slug);
    const validated = validatePosts(
      [{ ...toPostInput(existing), ...asRecord(patch) }],
      { slug, locale, actor, product },
    );
    if (!validated.ok) return { ok: false, message: validated.message };

    let value = validated.value[0];
    if (product) {
      // Uniqueness must hold against the board's OTHER rows; fetch them so a
      // derived excerpt never collides with an existing one.
      const siblings = await prisma.boardPost.findMany({ where: { slug, locale } });
      const used = new Set(
        siblings.filter((row) => row.idx !== idx).map((row) => row.excerpt),
      );
      const excerpt = uniqueExcerpt(excerptBase(value), value.idx, used);
      value = { ...value, thumb: deriveThumb(value.content), excerpt };
    }

    // `validatePosts` assigns sortOrder = array index (0 here); keep the row's
    // existing position so an edit never reorders the board.
    const preservedSortOrder = (existing as { sortOrder?: number }).sortOrder;

    await prisma.boardPost.update({
      where: { slug_locale_idx: { slug, locale, idx } },
      data: {
        ...value,
        ...(typeof preservedSortOrder === "number" ? { sortOrder: preservedSortOrder } : {}),
      },
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
  const { locale, idx } = input;
  const slug = normalizeBoardSlug(input.slug);
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
