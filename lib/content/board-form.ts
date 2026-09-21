import type { BoardPost } from "../types";

/**
 * Pure mapping between the boards admin form and `BoardPost` (client-safe:
 * types only, no fs/DB). Tests live in `lib/content/__tests__/board-form.test.ts`.
 */

/** One attachment as shown in the editor (size is bytes, optional for legacy rows). */
export interface PostAttachment {
  name: string;
  href: string;
  size?: number;
}

/** Editable form fields for one post (all strings; empty = unset). */
export interface PostForm {
  idx: string;
  title: string;
  category: string;
  excerpt: string;
  content: string;
  thumb: string;
  date: string;
  isNotice: boolean;
  views: string;
  files: PostAttachment[];
}

export function toPostForm(post: BoardPost): PostForm {
  return {
    idx: post.idx,
    title: post.title ?? "",
    category: post.category ?? "",
    excerpt: post.excerpt ?? "",
    content: post.content ?? "",
    thumb: post.thumb ?? "",
    date: post.date ?? "",
    isNotice: post.isNotice ?? false,
    views: post.views == null ? "" : String(post.views),
    files: (post.files ?? []).map((file) => ({ ...file })),
  };
}

/** Drop blank entries and trim names/hrefs; drops an invalid (negative) size. */
export function normalizeAttachments(files: PostAttachment[] | undefined): PostAttachment[] {
  if (!Array.isArray(files)) return [];
  const next: PostAttachment[] = [];
  for (const file of files) {
    const name = typeof file?.name === "string" ? file.name.trim() : "";
    const href = typeof file?.href === "string" ? file.href.trim() : "";
    if (!name || !href) continue;
    const entry: PostAttachment = { name, href };
    if (typeof file.size === "number" && Number.isFinite(file.size) && file.size >= 0) {
      entry.size = Math.floor(file.size);
    }
    next.push(entry);
  }
  return next;
}

/** Build a `BoardPost` from the form, preserving `href` from `base`. */
export function formToPost(form: PostForm, base?: BoardPost): BoardPost {
  const views = form.views.trim() === "" ? null : Number(form.views);
  const basePost: BoardPost = base ?? {
    idx: form.idx,
    title: form.title,
    excerpt: "",
    thumb: null,
    isNotice: false,
    date: null,
    views: null,
    files: [],
  };

  return {
    ...basePost,
    idx: form.idx.trim(),
    title: form.title.trim(),
    category: form.category.trim() || undefined,
    excerpt: form.excerpt,
    content: form.content,
    thumb: form.thumb.trim() || null,
    isNotice: form.isNotice,
    date: form.date.trim() || null,
    views: views !== null && Number.isFinite(views) ? views : null,
    files: normalizeAttachments(form.files),
  };
}

/** A blank post with a client-generated, collision-free idx. */
export function blankPost(idx: string): BoardPost {
  return {
    idx,
    href: null,
    title: "",
    category: undefined,
    excerpt: "",
    content: "",
    thumb: null,
    isNotice: false,
    date: null,
    views: null,
    files: [],
  };
}

/**
 * Generate a stable-ish new post idx not present in `taken`. New posts are
 * persisted via `replace`, so the idx only needs to be unique within a board.
 */
export function generatePostIdx(taken: Iterable<string> = []): string {
  const used = new Set(taken);
  const base = Date.now().toString(36);
  let candidate = `new-${base}`;
  let suffix = 0;
  while (used.has(candidate)) {
    suffix += 1;
    candidate = `new-${base}-${suffix}`;
  }
  return candidate;
}

/** `<img>` snippet inserted into a post body. `alt` is attribute-escaped. */
export function imageTag(url: string, alt = ""): string {
  const safeAlt = alt.replace(/"/g, "&quot;");
  return `<img src="${url}" alt="${safeAlt}"/>`;
}

/**
 * Insert `snippet` into `body` between `start`/`end` (the textarea selection),
 * replacing the selected range. Returns the new value plus the caret offset to
 * restore after the inserted snippet. Offsets are clamped to `[0, length]` and
 * `end` is coerced to be at least `start`, so a stale selection is harmless.
 */
export function insertHtmlAtCaret(
  body: string,
  snippet: string,
  start: number,
  end: number,
): { value: string; caret: number } {
  const length = body.length;
  const from = Math.max(0, Math.min(Number.isFinite(start) ? start : length, length));
  const to = Math.max(from, Math.min(Number.isFinite(end) ? end : from, length));
  const value = body.slice(0, from) + snippet + body.slice(to);
  return { value, caret: from + snippet.length };
}

/** Human file size in KB, matching the legacy board attachment format. */
export function formatFileSize(bytes: number): string {
  const kb = Math.max(1, Math.round((Number.isFinite(bytes) ? bytes : 0) / 1024));
  return `${kb.toLocaleString("en-US")}KB`;
}
