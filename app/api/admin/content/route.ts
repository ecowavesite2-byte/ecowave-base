import fs from "node:fs";
import { z } from "zod";
import { assertSameOrigin, requireAdminApi } from "@/lib/auth/guard";
import { PageContentSchema, BoardContentSchema, SiteDataSchema } from "@/lib/content/schemas";
import {
  boardPath,
  isValidBoardSlug,
  isValidLocale,
  isValidPageKey,
  pagePath,
  sitePath,
} from "@/lib/content/paths";
import { boardSourceFile, pageSourceFile } from "@/lib/content/read";
import { sanitizeBoardContent, sanitizePageContent } from "@/lib/content/sanitize";
import { saveJsonFile, HashMismatchError, hashOfFile } from "@/lib/content/write";
import { revalidateFor, type ContentKind } from "@/lib/content/revalidate";
import type { BoardContent, PageContent } from "@/lib/types";

export const runtime = "nodejs";

const KINDS = ["page", "board", "site"] as const;

const PutBodySchema = z.object({
  kind: z.enum(KINDS),
  locale: z.string(),
  key: z.string().default(""),
  content: z.unknown(),
  hash: z.string(),
});

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status });
}

interface Resolved {
  kind: ContentKind;
  locale: "ko" | "en";
  key: string;
  /** File currently holding the content (ko fallback for an inherited en page). */
  source: string;
  /** Locale-specific file a PUT will write. */
  dest: string;
}

/** Validate the kind/locale/key triple and resolve its source + destination. */
function resolveContent(
  kind: string,
  locale: string,
  key: string,
): Resolved | { error: string } {
  if (kind !== "page" && kind !== "board" && kind !== "site") {
    return { error: "kind must be one of page, board, site" };
  }
  if (!isValidLocale(locale)) {
    return { error: "locale must be ko or en" };
  }

  if (kind === "site") {
    return { kind, locale, key: "", source: sitePath(locale), dest: sitePath(locale) };
  }

  if (!key) return { error: `key is required for ${kind}` };

  if (kind === "page") {
    if (!isValidPageKey(key)) return { error: `Unknown page key: ${key}` };
    return {
      kind,
      locale,
      key,
      source: pageSourceFile(locale, key),
      dest: pagePath(locale, key),
    };
  }

  if (!isValidBoardSlug(key)) return { error: `Unknown board slug: ${key}` };
  return {
    kind,
    locale,
    key,
    source: boardSourceFile(locale, key),
    dest: boardPath(locale, key),
  };
}

type ValidationResult =
  | { ok: true; value: unknown }
  | { ok: false; issues: unknown[] };

function validateContent(kind: ContentKind, content: unknown): ValidationResult {
  const schema =
    kind === "page" ? PageContentSchema : kind === "board" ? BoardContentSchema : SiteDataSchema;
  const result = schema.safeParse(content);
  if (!result.success) return { ok: false, issues: result.error.issues };
  return { ok: true, value: result.data };
}

export async function GET(req: Request) {
  const auth = await requireAdminApi(req);
  if (!auth) return jsonError("Unauthorized", 401);

  const url = new URL(req.url);
  const resolved = resolveContent(
    url.searchParams.get("kind") ?? "",
    url.searchParams.get("locale") ?? "",
    url.searchParams.get("key") ?? "",
  );
  if ("error" in resolved) return jsonError(resolved.error, 400);

  if (!fs.existsSync(resolved.source)) return jsonError("Content not found", 404);

  const content = JSON.parse(fs.readFileSync(resolved.source, "utf8")) as unknown;
  return Response.json({ content, hash: hashOfFile(resolved.source) });
}

export async function PUT(req: Request) {
  const auth = await requireAdminApi(req);
  if (!auth) return jsonError("Unauthorized", 401);
  if (!assertSameOrigin(req)) return jsonError("Cross-origin request rejected", 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const parsed = PutBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });
  }

  const resolved = resolveContent(parsed.data.kind, parsed.data.locale, parsed.data.key);
  if ("error" in resolved) return jsonError(resolved.error, 400);

  const validated = validateContent(resolved.kind, parsed.data.content);
  if (!validated.ok) {
    return Response.json(
      { error: `Invalid ${resolved.kind} content`, issues: validated.issues },
      { status: 400 },
    );
  }

  const sanitized =
    resolved.kind === "page"
      ? sanitizePageContent(validated.value as PageContent)
      : resolved.kind === "board"
        ? sanitizeBoardContent(validated.value as BoardContent)
        : validated.value;

  try {
    const hash = await saveJsonFile({
      file: resolved.dest,
      content: sanitized,
      expectedHash: parsed.data.hash,
      versionFile: resolved.source,
      actor: auth.session.admin?.email,
      action: "save",
    });
    await revalidateFor(resolved.kind, resolved.locale, resolved.key);
    return Response.json({ hash });
  } catch (error) {
    if (error instanceof HashMismatchError) {
      return Response.json(
        { error: "Content changed since it was loaded", expected: error.expected, actual: error.actual },
        { status: 409 },
      );
    }
    console.error("[admin-content] save failed", error);
    return jsonError("Failed to save content", 500);
  }
}
