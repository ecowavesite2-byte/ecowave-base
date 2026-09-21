import { z } from "zod";
import { assertSameOrigin, requireAdminApi } from "@/lib/auth/guard";
import { isDbConfigured, loadOverrides } from "@/lib/content/db";
import {
  CONTENT_DEFS,
  CONTENT_GROUPS,
  DEFAULT_VALUES,
  type ContentDef,
  type ContentGroup,
} from "@/lib/content/registry";
import { DB_NOT_CONFIGURED_MESSAGE, saveContent } from "@/lib/content/save";

export const runtime = "nodejs";

/**
 * Registry API for the (future, simple) override admin UI.
 *
 * GET returns the registry defs plus the EFFECTIVE values for a locale (DB
 * override > generated default > empty string). PUT persists a single override
 * via `saveContent`. Nothing here imports client-side code, and the DB lane
 * degrades gracefully when `DATABASE_URL` is unset.
 */

const LOCALES = ["ko", "en"] as const;
type Locale = (typeof LOCALES)[number];

const PutBodySchema = z.object({
  key: z.string().min(1),
  locale: z.enum(LOCALES),
  value: z.string(),
});

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status });
}

function isGroup(value: string): value is ContentGroup {
  return (CONTENT_GROUPS as readonly string[]).includes(value);
}

export async function GET(req: Request) {
  const auth = await requireAdminApi(req);
  if (!auth) return jsonError("Unauthorized", 401);

  const url = new URL(req.url);

  const groupParam = url.searchParams.get("group");
  if (groupParam && !isGroup(groupParam)) {
    return jsonError(`Unknown group: ${groupParam}`, 400);
  }

  const localeParam = url.searchParams.get("locale") ?? "ko";
  if (localeParam !== "ko" && localeParam !== "en") {
    return jsonError("locale must be ko or en", 400);
  }
  const locale: Locale = localeParam;

  const defs: ContentDef[] = groupParam
    ? CONTENT_DEFS.filter((def) => def.group === groupParam)
    : CONTENT_DEFS;

  const overrides = await loadOverrides(
    locale,
    defs.map((def) => def.key),
  );

  const values: Record<string, string> = {};
  for (const def of defs) {
    const override = overrides[def.key];
    // An empty stored value means "revert to default", so treat it as absent.
    values[def.key] =
      typeof override === "string" && override.length > 0
        ? override
        : DEFAULT_VALUES[def.key]?.[locale] ?? "";
  }

  return Response.json({
    groups: CONTENT_GROUPS,
    defs,
    values,
    dbConfigured: isDbConfigured(),
  });
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

  const result = await saveContent({
    key: parsed.data.key,
    locale: parsed.data.locale,
    value: parsed.data.value,
    actor: auth.session.admin?.email ?? "",
  });

  if (!result.ok) {
    const status = result.message === DB_NOT_CONFIGURED_MESSAGE ? 503 : 400;
    return jsonError(result.message ?? "Invalid request", status);
  }

  return Response.json({ ok: true });
}
