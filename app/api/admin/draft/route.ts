import { z } from "zod";
import { draftMode } from "next/headers";
import { assertSameOrigin, requireAdminApi } from "@/lib/auth/guard";
import {
  DraftValidationError,
  discardDraft,
  promoteDraft,
  resolveDraftTarget,
  writeDraft,
} from "@/lib/content/drafts";
import { HashMismatchError } from "@/lib/content/write";

export const runtime = "nodejs";

const PutBodySchema = z.object({
  locale: z.string(),
  kind: z.string(),
  key: z.string().default(""),
  content: z.unknown(),
  hash: z.string(),
});

const PostBodySchema = z.object({
  action: z.enum(["enable", "disable", "publish", "discard"]),
  locale: z.string(),
  kind: z.string(),
  key: z.string().default(""),
});

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status });
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

  const target = resolveDraftTarget(parsed.data.locale, parsed.data.kind, parsed.data.key);
  if (!target) return jsonError("Invalid draft target", 400);

  try {
    const hash = await writeDraft(
      target.locale,
      target.kind,
      target.key,
      parsed.data.content,
      parsed.data.hash,
    );
    return Response.json({ hash });
  } catch (error) {
    if (error instanceof HashMismatchError) {
      return Response.json(
        {
          error: "Draft changed since it was loaded",
          expected: error.expected,
          actual: error.actual,
        },
        { status: 409 },
      );
    }
    if (error instanceof DraftValidationError) {
      return Response.json(
        { error: "Invalid draft content", issues: error.issues },
        { status: 400 },
      );
    }
    console.error("[admin-draft] save failed", error);
    return jsonError("Failed to save draft", 500);
  }
}

export async function POST(req: Request) {
  const auth = await requireAdminApi(req);
  if (!auth) return jsonError("Unauthorized", 401);
  if (!assertSameOrigin(req)) return jsonError("Cross-origin request rejected", 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const parsed = PostBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });
  }

  const { action } = parsed.data;

  // draftMode() is per-browser-session; toggle it for the authenticated admin.
  if (action === "enable") {
    (await draftMode()).enable();
    return Response.json({ ok: true });
  }
  if (action === "disable") {
    (await draftMode()).disable();
    return Response.json({ ok: true });
  }

  const target = resolveDraftTarget(parsed.data.locale, parsed.data.kind, parsed.data.key);
  if (!target) return jsonError("Invalid draft target", 400);

  try {
    if (action === "publish") {
      const result = await promoteDraft(target.locale, target.kind, target.key);
      if (!result) return jsonError("No draft to publish", 404);
      return Response.json({ ok: true, hash: result.hash });
    }

    const removed = await discardDraft(target.locale, target.kind, target.key);
    if (!removed) return jsonError("No draft to discard", 404);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof DraftValidationError) {
      return Response.json(
        { error: "Invalid draft content", issues: error.issues },
        { status: 400 },
      );
    }
    console.error(`[admin-draft] ${action} failed`, error);
    return jsonError(`Failed to ${action} the draft`, 500);
  }
}
