import crypto from "node:crypto";
import { put } from "@vercel/blob";
import { assertSameOrigin, requireAdminApi } from "@/lib/auth/guard";
import {
  buildUploadName,
  extensionOf,
  validateUploadName,
} from "@/lib/content/upload-name";

export const runtime = "nodejs";

/**
 * Registry/board upload for the simple admin screens.
 *
 * Accepts multipart `file` (optionally `locale`, unused for storage), stores the
 * bytes in Vercel Blob under a sanitized, content-hashed public name and returns
 * `{ ok: true, url }`. Accepts images and PDFs (see `validateUploadName`) plus
 * video files for the home video widget; the client only writes that URL into
 * the field/attachment draft, and the owning registry/board PUT still persists
 * it.
 */

const BLOB_NOT_CONFIGURED_MESSAGE =
  "Blob storage is not configured (BLOB_READ_WRITE_TOKEN missing).";

/** Video uploads are allowed to be larger than the shared image/PDF cap. */
const MAX_VIDEO_UPLOAD_BYTES = 50 * 1024 * 1024;

/**
 * Video MIME types accepted by this route (mirrors `MIME_EXTENSIONS`'s
 * type → extension allowlist). The extensions stay in lockstep with
 * `SectionRenderer`'s local-video branch, which only plays local
 * `/….(mp4|webm|ogv|mov)` sources as a native `<video>`.
 */
const VIDEO_MIME_EXTENSIONS: Record<string, readonly string[]> = {
  "video/mp4": ["mp4"],
  "video/webm": ["webm"],
  "video/ogg": ["ogv"],
  "video/quicktime": ["mov"],
};

const VIDEO_ALLOWED_TYPE_LABEL = "MP4, WebM, OGV and MOV";

type VideoUploadCheck =
  | { ok: true; name: string }
  | { ok: false; status: 400 | 413 | 415; message: string };

/**
 * Video counterpart of `validateUploadName`: the same path-traversal, empty,
 * size and MIME/extension checks in the same order, with the video allowlist
 * and the larger cap. Kept route-local so the shared upload module (and its
 * tested image/PDF defaults) stay unchanged.
 */
function validateVideoUpload(
  meta: { name: string; type: string; size: number },
  hash: string,
): VideoUploadCheck {
  const { name, type, size } = meta;

  if (!name || name.includes("..")) {
    return { ok: false, status: 400, message: "Invalid file name (path traversal rejected)." };
  }

  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, status: 400, message: "File is empty." };
  }

  if (size > MAX_VIDEO_UPLOAD_BYTES) {
    const limitMb = MAX_VIDEO_UPLOAD_BYTES / 1024 / 1024;
    return { ok: false, status: 413, message: `File exceeds the ${limitMb} MB limit.` };
  }

  const allowedExts = VIDEO_MIME_EXTENSIONS[type.toLowerCase()];
  const ext = extensionOf(name);
  if (!allowedExts || !ext || !allowedExts.includes(ext)) {
    return {
      ok: false,
      status: 415,
      message: `Unsupported file type; allowed: ${VIDEO_ALLOWED_TYPE_LABEL}.`,
    };
  }

  return { ok: true, name: buildUploadName(name, hash) };
}

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status });
}

export async function POST(req: Request) {
  const auth = await requireAdminApi(req);
  if (!auth) return jsonError("Forbidden", 403);
  if (!assertSameOrigin(req)) return jsonError("Cross-origin request rejected", 403);

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return jsonError(BLOB_NOT_CONFIGURED_MESSAGE, 503);

  // Reject oversized bodies before buffering the multipart payload. This is a
  // coarse DoS guard: it uses the larger (video) cap, and the per-type check
  // below enforces the exact limit for the payload's actual type.
  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_VIDEO_UPLOAD_BYTES + 1024 * 1024) {
    return jsonError("File exceeds the upload size limit", 413);
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

  const uploadMeta = { name: upload.name, type: upload.type, size: upload.size };
  const checked = upload.type.toLowerCase().startsWith("video/")
    ? validateVideoUpload(uploadMeta, hash)
    : validateUploadName(uploadMeta, hash);
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
