import { z } from "zod";
import { assertSameOrigin, requireAdminApi } from "@/lib/auth/guard";
import { CROPS, CROP_SLUGS, renderCrop, type CropName } from "@/lib/media/image";
import { getMediaEntry, setMediaCrops } from "@/lib/media/index";
import { mediaUrl, readMediaBlob, writeMediaBlobNamed } from "@/lib/media/store";

export const runtime = "nodejs";

const BodySchema = z.object({ path: z.string() });

function JsonError(error: string, status: number) {
  return Response.json({ error }, { status });
}

/** Generate the fixed named crops as sibling files and record them in the index. */
export async function POST(req: Request) {
  const auth = await requireAdminApi(req);
  if (!auth) return JsonError("Unauthorized", 401);
  if (!assertSameOrigin(req)) return JsonError("Cross-origin request rejected", 403);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return JsonError("Invalid JSON body", 400);
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });
  }

  const { path: relPath } = parsed.data;
  if (!getMediaEntry(relPath)) return JsonError("Media entry not found", 404);

  let original: Buffer | null;
  try {
    original = readMediaBlob(relPath);
  } catch {
    return JsonError("Media path is invalid", 400);
  }
  if (!original) return JsonError("Media file not found", 404);

  const base = relPath.replace(/\.[^.]+$/, "");
  const crops: Record<string, string> = {};
  try {
    for (const name of Object.keys(CROPS) as CropName[]) {
      const buffer = await renderCrop(original, name);
      const cropPath = `${base}_${CROP_SLUGS[name]}.webp`;
      await writeMediaBlobNamed(cropPath, buffer);
      crops[name] = cropPath;
    }
  } catch {
    return JsonError("Could not generate crops", 422);
  }

  const updated = await setMediaCrops(relPath, crops);
  const urls: Record<string, string> = {};
  for (const [name, cropPath] of Object.entries(updated?.crops ?? crops)) {
    urls[name] = mediaUrl(cropPath);
  }
  return Response.json({ ok: true, path: relPath, crops: updated?.crops ?? crops, urls });
}
