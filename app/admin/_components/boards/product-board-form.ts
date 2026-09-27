import type { BoardPost } from "@/lib/types";
import { formToPost, type PostForm as PostFormShape } from "@/lib/content/board-form";

/**
 * Admin UI-layer product-form helpers (client-safe: types only, no fs/DB).
 *
 * The canonical form↔post mapping lives in `lib/content/board-form` and is
 * shared with the boards lane. This module only adds the product-board
 * refinements the admin UI needs on top of it:
 *
 *  - `normalizeDateInput` — turn a stored date into the `yyyy-mm-dd` value a
 *    native `<input type="date">` requires (dot/slash formats are converted;
 *    empty stays empty);
 *  - `productPostFromForm` — build the payload the product boards write, leaving
 *    the two fields the server derives (thumb from the first body image,
 *    excerpt) empty so a stale form value can never win;
 *  - `previewThumbFromHtml` — DISPLAY-ONLY derivation used by the edit dialog's
 *    live preview so a freshly inserted body image shows up immediately. It is
 *    never persisted: the server owns the saved `thumb`.
 */

const DATE_RE = /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/;

/**
 * Normalize a stored date for a native date input:
 * `2025.09.18` / `2025/9/8` / `2025-09-18` → `2025-09-18`; `""` stays `""`.
 * Anything the input cannot represent collapses to `""` (shown blank) rather
 * than an invalid value the browser would reject.
 */
export function normalizeDateInput(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  const match = DATE_RE.exec(raw);
  if (!match) return "";
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/**
 * Build a product post from the form. Identical to `formToPost`, except the
 * server-derived fields are cleared: the server fills `thumb` from the first
 * image in the body and generates `excerpt` on save.
 */
export function productPostFromForm(form: PostFormShape, base?: BoardPost): BoardPost {
  return { ...formToPost(form, base), thumb: null, excerpt: "" };
}

const IMG_SRC_RE = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;

/** Preview-only: the first `<img src>` in a body, or `null`. Never persisted. */
export function previewThumbFromHtml(html: string): string | null {
  const match = IMG_SRC_RE.exec(html || "");
  const src = (match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
  return src || null;
}
