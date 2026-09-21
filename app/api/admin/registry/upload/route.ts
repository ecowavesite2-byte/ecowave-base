import crypto from "node:crypto";
import { put } from "@vercel/blob";
import { assertSameOrigin, requireAdminApi } from "@/lib/auth/guard";
import { MAX_UPLOAD_BYTES, validateUploadName } from "@/lib/content/upload-name";

export const runtime = "nodejs";

/**
 * Registry image upload for the simple admin screen.
 *
 * Accepts multipart `file` (optionally `locale`, unused for storage), stores the
 * bytes in Vercel Blob under a sanitized, content-hashed public name and returns
 * `{ ok: true, url }`. The client only writes that URL into the field draft; the
 * existing registry PUT still owns persistence.
 */

const BLOB_NOT_CONFIGURED_MESSAGE =
  "Blob storage is not configured (BLOB_READ_WRITE_TOKEN missing).";

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status });
}

export async function POST(req: Request) {
  const auth = await requireAdminApi(req);
  if (!auth) return jsonError("Forbidden", 403);
  if (!assertSameOrigin(req)) return jsonError("Cross-origin request rejected", 403);

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return jsonError(BLOB_NOT_CONFIGURED_MESSAGE, 503);

  // Reject oversized bodies before buffering the multipart payload.
  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_UPLOAD_BYTES + 1024 * 1024) {
    return jsonError(`File exceeds the ${MAX_UPLOAD_BYTES / 1024 / 1024} MB limit`, 413);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("Expected multipart/form-data", 400);
  }

  const file = form.get("file");
  // Duck-type instead of `instanceof File` so the route also runs on Node < 20.
  if (!file || typeof file === "string" || typeof (file as File).arrayBuffer !== "function") {
    return jsonError("Missing file field", 400);
  }
  const upload = file as File;

  const bytes = Buffer.from(await upload.arrayBuffer());
  const hash = crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 8);

  const checked = validateUploadName(
    { name: upload.name, type: upload.type, size: upload.size },
    hash,
  );
  if (!checked.ok) return jsonError(checked.message, checked.status);

  try {
    const blob = await put(checked.name, bytes, {
      access: "public",
      addRandomSuffix: true,
      contentType: upload.type,
      token,
    });
    return Response.json({ ok: true, url: blob.url });
  } catch {
    return jsonError("Upload failed. Please try again.", 500);
  }
}
