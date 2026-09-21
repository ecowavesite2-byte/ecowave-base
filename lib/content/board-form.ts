import type { BoardPost } from "../types";

/**
 * Pure mapping between the boards admin form and `BoardPost` (client-safe:
 * types only, no fs/DB). Tests live in `lib/content/__tests__/board-form.test.ts`.
 */

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
  };
}

/** Build a `BoardPost` from the form, preserving `files`/`href` from `base`. */
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
