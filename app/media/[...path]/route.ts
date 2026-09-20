import { contentTypeFor, readMediaBlob } from "@/lib/media/store";

export const runtime = "nodejs";

/**
 * Serve uploaded media from `data/media/`. Publicly readable (images must render
 * on the site); traversal-safe via `resolveMediaFile`; immutable caching because
 * filenames are content-hashed.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;
  const relPath = segments.join("/");

  let data: Buffer | null;
  try {
    data = readMediaBlob(relPath);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!data) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": contentTypeFor(relPath),
      "Content-Length": String(data.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
