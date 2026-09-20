import { fileTypeFromBuffer } from "file-type";
import { assertSameOrigin, requireAdminApi } from "@/lib/auth/guard";
import { MAX_UPLOAD_BYTES, reencodeToWebp } from "@/lib/media/image";
import { getMediaEntry, updateMediaIndex, type MediaEntry } from "@/lib/media/index";
import { writeMediaBlob } from "@/lib/media/store";

export const runtime = "nodejs";

/** `file-type` returns these for PNG/JPEG/WebP; everything else is rejected. */
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status });
}

export async function POST(req: Request) {
  const auth = await requireAdminApi(req);
  if (!auth) return jsonError("Unauthorized", 401);
  if (!assertSameOrigin(req)) return jsonError("Cross-origin request rejected", 403);

  // Reject oversized bodies before buffering the multipart payload.
  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_UPLOAD_BYTES + 1024 * 1024) {
    return jsonError(`File exceeds the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit`, 413);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("Expected multipart/form-data", 400);
  }

  const file = form.get("file");
  // Duck-type instead of `instanceof File` so the route also runs on Node < 20.
  if (
    !file ||
    typeof file === "string" ||
    typeof (file as File).arrayBuffer !== "function"
  ) {
    return jsonError("Missing file field", 400);
  }
  const upload = file as File;
  if (upload.size > MAX_UPLOAD_BYTES) {
    return jsonError(`File exceeds the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit`, 413);
  }

  const input = Buffer.from(await upload.arrayBuffer());

  // Magic-byte sniff BEFORE any decode; the extension is irrelevant.
  const sniffed = await fileTypeFromBuffer(input);
  if (!sniffed || !ALLOWED_MIME.has(sniffed.mime)) {
    const detail = sniffed ? ` (${sniffed.mime})` : "";
    return jsonError(`Unsupported file type${detail}; only PNG, JPEG and WebP are allowed`, 415);
  }

  let encoded;
  try {
    encoded = await reencodeToWebp(input);
  } catch {
    return jsonError("Could not decode the image", 422);
  }

  const blob = await writeMediaBlob(encoded.data, "webp");

  // Optional replace: inherit the (human-curated) alt text; leave the old file.
  const replaceField = form.get("replace");
  const replacePath = typeof replaceField === "string" ? replaceField : "";
  const replaced = replacePath ? getMediaEntry(replacePath) : null;

  const entry: MediaEntry = {
    url: blob.url,
    alt: replaced?.alt ?? "",
    width: encoded.width,
    height: encoded.height,
    size: encoded.size,
    format: encoded.format,
    crops: {},
    uploadedAt: new Date().toISOString(),
  };

  await updateMediaIndex((index) => {
    index[blob.relPath] = entry;
  });

  return Response.json({
    path: blob.relPath,
    name: upload.name,
    replaced: replacePath || null,
    ...entry,
  });
}
