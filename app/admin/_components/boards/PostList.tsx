"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { BoardPost } from "@/lib/types";
import type { Locale } from "@/lib/i18n";

const PAGE_SIZE = 20;

const NAV_BUTTON =
  "rounded-md border border-line px-2.5 py-1 text-[12px] text-ink transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50";

/** Client-side search + pagination over the board's posts. */
export default function PostList({
  slug,
  locale,
  posts,
  isProduct,
}: {
  slug: string;
  locale: Locale;
  posts: BoardPost[];
  isProduct: boolean;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return posts;
    return posts.filter((post) =>
      [post.title, post.idx, post.category ?? "", post.excerpt].some((value) =>
        value.toLowerCase().includes(term),
      ),
    );
  }, [posts, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  function changeQuery(value: string) {
    setQuery(value);
    setPage(0);
  }

  return (
    <div className="rounded-lg border border-line bg-white">
      <div className="flex items-center gap-3 border-b border-line px-3 py-2">
        <input
          value={query}
          onChange={(event) => changeQuery(event.target.value)}
          placeholder="Search title, idx, category…"
          aria-label="Search posts"
          className="h-9 w-full max-w-[320px] rounded-md border border-line bg-white px-2.5 text-[13px] text-ink outline-none transition-colors placeholder:text-[#9ca3af] focus:border-accent focus:ring-2 focus:ring-accent/25"
        />
        <span className="ml-auto shrink-0 text-[12px] text-[#6b7280]">
          {filtered.length} {filtered.length === 1 ? "post" : "posts"}
        </span>
      </div>

      <div className="hidden items-center gap-3 border-b border-line px-4 py-2 text-[10px] font-semibold tracking-wide text-[#9ca3af] uppercase sm:flex">
        <span className="w-[88px] shrink-0">Idx</span>
        <span className="min-w-0 flex-1">Title</span>
        {isProduct ? <span className="hidden w-[160px] shrink-0 sm:inline">Category</span> : null}
        <span className="hidden w-[90px] shrink-0 text-right sm:inline">Date</span>
        <span className="hidden w-[60px] shrink-0 text-right md:inline">Views</span>
      </div>

      <div className="divide-y divide-line">
        {visible.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-[#6b7280]">No posts match.</p>
        ) : (
          visible.map((post) => (
            <Link
              key={post.idx}
              href={`/admin/boards/${slug}/${post.idx}?locale=${locale}`}
              className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[#f4f5f7]"
            >
              <span className="w-[88px] shrink-0 rounded bg-[#f3f4f6] px-1.5 py-0.5 text-center font-mono text-[11px] text-[#4b5563]">
                {post.idx}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[14px] text-ink">{post.title}</span>
                  {post.isNotice ? (
                    <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                      Pinned
                    </span>
                  ) : null}
                </span>
                {post.excerpt ? (
                  <span className="mt-0.5 block truncate text-[12px] text-[#9ca3af]">
                    {post.excerpt}
                  </span>
                ) : null}
              </span>
              {isProduct ? (
                <span className="hidden max-w-[160px] shrink-0 truncate text-[12px] text-[#6b7280] sm:inline">
                  {post.category || "—"}
                </span>
              ) : null}
              <span className="hidden w-[90px] shrink-0 text-right font-mono text-[11px] text-[#6b7280] sm:inline">
                {post.date ?? "—"}
              </span>
              <span className="hidden w-[60px] shrink-0 text-right font-mono text-[11px] text-[#6b7280] md:inline">
                {post.views ?? "—"}
              </span>
            </Link>
          ))
        )}
      </div>

      {pageCount > 1 ? (
        <div className="flex items-center justify-end gap-2 border-t border-line px-3 py-2">
          <button
            type="button"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
            className={NAV_BUTTON}
          >
            Prev
          </button>
          <span className="text-[12px] text-[#6b7280]">
            Page {safePage + 1} / {pageCount}
          </span>
          <button
            type="button"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage(safePage + 1)}
            className={NAV_BUTTON}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
