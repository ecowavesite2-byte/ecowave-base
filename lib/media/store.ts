import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import writeFileAtomic from "write-file-atomic";

/**
 * Media blob storage for admin uploads.
 *
 * Files live under `data/media/` (gitignored) and are served through
 * `app/media/[...path]/route.ts` — never written into `public/`, so the git
 * tree stays clean and `next build`/standalone output is not polluted.
 * Filenames are content-hashed and immutable: an existing file is never
 * overwritten (identical bytes are reused; a collision gets a numeric suffix).
 */

export const MEDIA_ROOT =
  process.env.MEDIA_ROOT ?? path.join(process.cwd(), "data", "media");
export const MEDIA_URL_PREFIX = "/media";

const CONTENT_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".avif": "image/avif",
};

export function mediaUrl(relPath: string): string {
  const encoded = relPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${MEDIA_URL_PREFIX}/${encoded}`;
}

/** Reject paths that could escape MEDIA_ROOT or confuse the filesystem. */
export function assertSafeMediaPath(relPath: string): string {
  if (typeof relPath !== "string" || relPath.length === 0) {
    throw new Error(`Unsafe media path: ${JSON.stringify(relPath)}`);
  }
  if (relPath.includes("..")) throw new Error(`Unsafe media path (traversal): ${relPath}`);
  if (relPath.includes("\\")) throw new Error(`Unsafe media path (backslash): ${relPath}`);
  if (relPath.includes(":")) throw new Error(`Unsafe media path (colon): ${relPath}`);
  if (relPath.startsWith("/")) throw new Error(`Unsafe media path (absolute): ${relPath}`);
  for (const segment of relPath.split("/")) {
    if (segment === "" || segment === "." || segment === "..") {
      throw new Error(`Unsafe media path segment: ${JSON.stringify(segment)}`);
    }
    if (/[. ]$/.test(segment)) throw new Error(`Unsafe media path (trailing dot/space): ${relPath}`);
  }
  return relPath;
}

/** Resolve a relative media path to an absolute file under MEDIA_ROOT. */
export function resolveMediaFile(relPath: string): string {
  assertSafeMediaPath(relPath);
  const root = path.resolve(MEDIA_ROOT);
  const file = path.resolve(root, relPath);
  if (!(file === root || file.startsWith(root + path.sep))) {
    throw new Error(`Media path escapes MEDIA_ROOT: ${relPath}`);
  }
  return file;
}

/** First 16 hex chars of sha256 — the immutable filename stem. */
export function hashName16(data: Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex").slice(0, 16);
}

export interface StoredBlob {
  relPath: string;
  url: string;
  /** false when identical bytes already existed (deduplicated, not rewritten). */
  created: boolean;
}

/** Write a content-hashed blob; never overwrite an existing file. */
export async function writeMediaBlob(data: Buffer, ext: string): Promise<StoredBlob> {
  fs.mkdirSync(MEDIA_ROOT, { recursive: true });
  const cleanExt = ext.replace(/^\./, "").toLowerCase();
  const stem = hashName16(data);

  let relPath = `${stem}.${cleanExt}`;
  for (let suffix = 1; ; suffix += 1) {
    const file = resolveMediaFile(relPath);
    if (!fs.existsSync(file)) {
      await writeFileAtomic(file, data);
      return { relPath, url: mediaUrl(relPath), created: true };
    }
    if (fs.readFileSync(file).equals(data)) {
      return { relPath, url: mediaUrl(relPath), created: false };
    }
    relPath = `${stem}-${suffix}.${cleanExt}`;
  }
}

/** Write a blob at an explicit relative path (fixed crop siblings); never overwrite. */
export async function writeMediaBlobNamed(relPath: string, data: Buffer): Promise<StoredBlob> {
  assertSafeMediaPath(relPath);
  fs.mkdirSync(path.dirname(resolveMediaFile(relPath)), { recursive: true });
  const file = resolveMediaFile(relPath);
  if (fs.existsSync(file)) {
    return { relPath, url: mediaUrl(relPath), created: false };
  }
  await writeFileAtomic(file, data);
  return { relPath, url: mediaUrl(relPath), created: true };
}

export function readMediaBlob(relPath: string): Buffer | null {
  const file = resolveMediaFile(relPath);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file);
}

export function deleteMediaBlob(relPath: string): boolean {
  const file = resolveMediaFile(relPath);
  if (!fs.existsSync(file)) return false;
  fs.unlinkSync(file);
  return true;
}

export function contentTypeFor(relPath: string): string {
  return CONTENT_TYPES[path.extname(relPath).toLowerCase()] ?? "application/octet-stream";
}
