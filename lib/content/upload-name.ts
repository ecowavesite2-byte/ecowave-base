/**
 * Pure validation + naming for admin uploads (registry images + board
 * attachments).
 *
 * Kept free of Node/server imports so it can be unit-tested in isolation and
 * imported by any runtime. Callers supply a short content hash, which keeps
 * naming deterministic (same bytes + filename -> same slug).
 */

/** Hard cap for a single upload (image or attachment), matching the legacy media lane. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** Allowed MIME types mapped to the extensions each one may legitimately use. */
export const MIME_EXTENSIONS: Record<string, readonly string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "image/gif": ["gif"],
  "image/svg+xml": ["svg"],
  "application/pdf": ["pdf"],
};

/** Human list used in error messages. */
export const ALLOWED_TYPE_LABEL = "JPEG, PNG, WebP, GIF, SVG and PDF";

const MAX_SLUG_LENGTH = 48;
const MAX_HASH_LENGTH = 16;

/** Last path segment's extension, lowercased and without the dot; "" when absent. */
export function extensionOf(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

/** Lowercase, filesystem-safe stem; never empty and never carries a path. */
export function slugifyBasename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const slug = stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");
  return slug || "image";
}

/**
 * Deterministic `<slug>-<hash>.<ext>` name. The hash is sanitized to lowercase
 * alphanumerics so a caller can never smuggle path characters through it.
 */
export function buildUploadName(filename: string, hash: string): string {
  const ext = extensionOf(filename);
  const cleanHash =
    hash.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, MAX_HASH_LENGTH) || "0";
  return `${slugifyBasename(filename)}-${cleanHash}${ext ? `.${ext}` : ""}`;
}

export interface UploadFileMeta {
  name: string;
  type: string;
  size: number;
}

export type UploadNameResult =
  | { ok: true; name: string; ext: string }
  | { ok: false; status: 400 | 413 | 415; message: string };

/** Path traversal, empty/oversized bodies and MIME+extension allowlisting. */
export function validateUploadName(meta: UploadFileMeta, hash: string): UploadNameResult {
  const { name, type, size } = meta;

  if (!name || name.includes("..")) {
    return { ok: false, status: 400, message: "Invalid file name (path traversal rejected)." };
  }

  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, status: 400, message: "File is empty." };
  }

  const limitMb = MAX_UPLOAD_BYTES / 1024 / 1024;
  if (size > MAX_UPLOAD_BYTES) {
    return { ok: false, status: 413, message: `File exceeds the ${limitMb} MB limit.` };
  }

  const allowedExts = MIME_EXTENSIONS[type.toLowerCase()];
  const ext = extensionOf(name);
  if (!allowedExts || !ext || !allowedExts.includes(ext)) {
    return {
      ok: false,
      status: 415,
      message: `Unsupported file type; allowed: ${ALLOWED_TYPE_LABEL}.`,
    };
  }

  return { ok: true, name: buildUploadName(name, hash), ext };
}
