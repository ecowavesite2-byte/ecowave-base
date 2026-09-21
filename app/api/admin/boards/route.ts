import { z } from "zod";
import { assertSameOrigin, requireAdminApi } from "@/lib/auth/guard";
import { boardLabel, isProductBoard } from "@/lib/content/boards";
import {
  DB_NOT_CONFIGURED_MESSAGE,
  deleteBoardPost,
  loadBoardPosts,
  replaceBoardPosts,
  seedBoardFromDefaults,
  updateBoardPost,
  type BoardStoreResult,
} from "@/lib/content/board-store";
import { isDbConfigured } from "@/lib/content/db";
import { BOARD_SLUGS, isValidBoardSlug } from "@/lib/content/paths";
import { getBoard, hasEnglishBoard } from "@/lib/content/read";
import { getResolvedBoard } from "@/lib/content/resolved";
import { saveContent } from "@/lib/content/save";
import type { BoardPost } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Boards API for the simple board editor.
 *
 * GET  `?locale=ko|en`            → board list (+ materialized flag)
 * GET  `?locale=ko|en&slug=<slug>` → one board's resolved detail
 * PUT  `{ action: "seed" | "replace" | "update" | "delete" | "name", … }`
 *
 * Writes go through `lib/content/board-store` (collection overrides); the
 * `name` action goes through `saveContent` so it stays in `page_content`
 * (`<slug>#board/<slug>/name`). DB-unconfigured writes map to 503 with the
 * not-configured message, validation to 400 with the store's message.
 */

const LOCALES = ["ko", "en"] as const;
type Locale = (typeof LOCALES)[number];

const PutBodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("seed"), slug: z.string(), locale: z.enum(LOCALES) }),
  z.object({
    action: z.literal("replace"),
    slug: z.string(),
    locale: z.enum(LOCALES),
    posts: z.array(z.unknown()),
  }),
  z.object({
    action: z.literal("update"),
    slug: z.string(),
    locale: z.enum(LOCALES),
    idx: z.string().min(1),
    patch: z.record(z.string(), z.unknown()),
  }),
  z.object({
    action: z.literal("delete"),
    slug: z.string(),
    locale: z.enum(LOCALES),
    idx: z.string().min(1),
  }),
  z.object({
    action: z.literal("name"),
    slug: z.string(),
    locale: z.enum(LOCALES),
    value: z.string(),
  }),
]);

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status });
}

function defaultCount(locale: Locale, slug: string): number {
  try {
    return getBoard(locale, slug).posts.length;
  } catch {
    return 0;
  }
}

export async function GET(req: Request) {
  const auth = await requireAdminApi(req);
  if (!auth) return jsonError("Forbidden", 403);

  const url = new URL(req.url);
  const localeParam = url.searchParams.get("locale") ?? "ko";
  if (localeParam !== "ko" && localeParam !== "en") {
    return jsonError("locale must be ko or en", 400);
  }
  const locale: Locale = localeParam;
  const slug = url.searchParams.get("slug");

  if (slug) {
    if (!isValidBoardSlug(slug)) return jsonError(`Unknown board slug: ${slug}`, 400);

    const board = await getResolvedBoard(locale, slug);
    const rows = await loadBoardPosts(locale, slug);

    return Response.json({
      slug,
      label: boardLabel(slug, locale),
      name: board.name,
      materialized: rows !== null,
      posts: board.posts,
      count: board.posts.length,
      defaultCount: defaultCount(locale, slug),
      isProduct: isProductBoard(slug),
      dbConfigured: isDbConfigured(),
    });
  }

  const boards = [];
  for (const boardSlug of BOARD_SLUGS) {
    const rows = await loadBoardPosts(locale, boardSlug);
    boards.push({
      slug: boardSlug,
      label: boardLabel(boardSlug, locale),
      count: rows ? rows.length : defaultCount(locale, boardSlug),
      materialized: rows !== null,
      hasEnglish: hasEnglishBoard(boardSlug),
    });
  }

  return Response.json({ locale, dbConfigured: isDbConfigured(), boards });
}

export async function PUT(req: Request) {
  const auth = await requireAdminApi(req);
  if (!auth) return jsonError("Forbidden", 403);
  if (!assertSameOrigin(req)) return jsonError("Cross-origin request rejected", 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const parsed = PutBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const data = parsed.data;
  if (!isValidBoardSlug(data.slug)) {
    return jsonError(`Unknown board slug: ${data.slug}`, 400);
  }
  const actor = auth.session.admin?.email ?? "";

  let result: BoardStoreResult;
  switch (data.action) {
    case "seed":
      result = await seedBoardFromDefaults({ slug: data.slug, locale: data.locale, actor });
      break;
    case "replace":
      result = await replaceBoardPosts({
        slug: data.slug,
        locale: data.locale,
        posts: data.posts,
        actor,
      });
      break;
    case "update":
      result = await updateBoardPost({
        slug: data.slug,
        locale: data.locale,
        idx: data.idx,
        patch: data.patch as Partial<BoardPost>,
        actor,
      });
      break;
    case "delete":
      result = await deleteBoardPost({ slug: data.slug, locale: data.locale, idx: data.idx });
      break;
    case "name":
      result = await saveContent({
        key: `${data.slug}#board/${data.slug}/name`,
        locale: data.locale,
        value: data.value,
        actor,
      });
      break;
  }

  if (!result.ok) {
    const status = result.message === DB_NOT_CONFIGURED_MESSAGE ? 503 : 400;
    return jsonError(result.message ?? "Invalid request", status);
  }

  return Response.json({ ok: true });
}
