import { z } from "zod";
import { assertSameOrigin, requireAdminApi } from "@/lib/auth/guard";
import { appendAudit } from "@/lib/content/audit";
import {
  getMediaEntry,
  removeMediaEntry,
  scanMediaUsage,
  setMediaAlt,
} from "@/lib/media/index";
import { deleteMediaBlob } from "@/lib/media/store";

export const runtime = "nodejs";

const PatchBodySchema = z.object({
  path: z.string(),
  alt: z.string(),
});

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status });
}

/** Save alt text into the media index. */
export async function PATCH(req: Request) {
  const auth = await requireAdminApi(req);
  if (!auth) return jsonError("Unauthorized", 401);
  if (!assertSameOrigin(req)) return jsonError("Cross-origin request rejected", 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const parsed = PatchBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });
  }

  const entry = await setMediaAlt(parsed.data.path, parsed.data.alt, {
    actor: auth.session.admin?.email,
    action: "media-alt",
  });
  if (!entry) return jsonError("Media entry not found", 404);
  return Response.json({ ok: true, path: parsed.data.path, alt: entry.alt });
}

/** Delete a media file + index entry, blocked while any content references it. */
export async function DELETE(req: Request) {
  const auth = await requireAdminApi(req);
  if (!auth) return jsonError("Unauthorized", 401);
  if (!assertSameOrigin(req)) return jsonError("Cross-origin request rejected", 403);

  const relPath = new URL(req.url).searchParams.get("path") ?? "";
  const entry = getMediaEntry(relPath);
  if (!entry) return jsonError("Media entry not found", 404);

  const usage = scanMediaUsage(entry.url);
  if (usage.length > 0) {
    return Response.json({ error: "Media is still in use", usage }, { status: 409 });
  }

  deleteMediaBlob(relPath);
  await removeMediaEntry(relPath, {
    actor: auth.session.admin?.email,
    action: "media-delete",
  });
  appendAudit({
    actor: auth.session.admin?.email,
    action: "media-delete",
    file: relPath,
  });
  return Response.json({ ok: true });
}
