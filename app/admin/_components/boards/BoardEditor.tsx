"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import BoardNameField from "./BoardNameField";
import PostRow from "./PostRow";
import type { BoardDetail, BoardLocale } from "./types";
import { blankPost, generatePostIdx } from "@/lib/content/board-form";
import type { BoardPost } from "@/lib/types";

/** Board editor: name override + inline post list (collection override). */

const LOCALES: { value: BoardLocale; label: string }[] = [
  { value: "ko", label: "한국어" },
  { value: "en", label: "English" },
];

const PRIMARY_BUTTON =
  "rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON =
  "rounded-md border border-line px-3 py-1.5 text-[12px] text-ink transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50";

export default function BoardEditor({
  slug,
  initialLocale,
}: {
  slug: string;
  initialLocale: BoardLocale;
}) {
  const [locale, setLocale] = useState<BoardLocale>(initialLocale);
  const [data, setData] = useState<BoardDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dbConfigured, setDbConfigured] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [newPost, setNewPost] = useState<BoardPost | null>(null);

  const [name, setName] = useState("");
  const [nameBase, setNameBase] = useState("");
  const [nameStatus, setNameStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch(
        `/api/admin/boards?locale=${locale}&slug=${encodeURIComponent(slug)}`,
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const detail = (await response.json()) as BoardDetail;
      setData(detail);
      setName(detail.name);
      setNameBase(detail.name);
      setNameStatus("idle");
      setNewPost(null);
      if (typeof detail.dbConfigured === "boolean") setDbConfigured(detail.dbConfigured);
    } catch {
      setData(null);
      setLoadError("Could not load this board.");
    } finally {
      setLoading(false);
    }
  }, [locale, slug]);

  useEffect(() => {
    void load();
  }, [load]);

  async function put(body: unknown): Promise<{ ok: boolean; error?: string }> {
    setBusy(true);
    setActionError(null);
    try {
      const response = await fetch("/api/admin/boards", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.ok) return { ok: true };
      const payload = (await response.json().catch(() => ({}))) as { error?: unknown };
      const message =
        typeof payload.error === "string" ? payload.error : `Request failed (HTTP ${response.status}).`;
      if (response.status === 503) setDbConfigured(false);
      return { ok: false, error: message };
    } catch {
      return { ok: false, error: "Network error. Retry when online." };
    } finally {
      setBusy(false);
    }
  }

  async function saveName() {
    setNameStatus("saving");
    const result = await put({ action: "name", slug, locale, value: name });
    if (result.ok) {
      setNameBase(name);
      setNameStatus("saved");
      void load();
    } else {
      setNameStatus("error");
      setActionError(result.error ?? "Could not save the name.");
    }
  }

  async function run(action: Record<string, unknown>) {
    const result = await put(action);
    if (result.ok) await load();
    else setActionError(result.error ?? "Action failed.");
  }

  const posts = data?.posts ?? [];
  const nameDirty = name !== nameBase;

  return (
    <div className="mx-auto max-w-[960px] p-8">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <Link
            href={`/admin/boards?locale=${locale}`}
            className="text-[12px] text-[#6b7280] transition-colors hover:text-accent"
          >
            ← Boards
          </Link>
          <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink">
            {data?.label ?? slug}
          </h1>
          <p className="mt-0.5 text-[13px] text-[#6b7280]">
            {data ? `${posts.length} posts` : "…"} · <span className="font-mono">{slug}</span>
          </p>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <Link
            href={`/${locale === "ko" ? "" : "en/"}${slug.replace(/\./g, "/")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] text-[#6b7280] transition-colors hover:text-accent"
          >
            View board ↗
          </Link>
          <div className="flex rounded-md border border-line bg-white p-0.5">
            {LOCALES.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-current={locale === item.value ? "true" : undefined}
                onClick={() => setLocale(item.value)}
                className={`rounded px-3 py-1 text-[12px] font-medium transition-colors ${
                  locale === item.value ? "bg-accent text-white" : "text-[#6b7280] hover:text-accent"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!dbConfigured ? (
        <div
          role="status"
          className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900"
        >
          Database is not configured (DATABASE_URL missing). Showing crawled defaults — saving is
          disabled.
        </div>
      ) : null}

      {loadError ? (
        <div className="mt-6 flex items-center gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => void load()}
            className="ml-auto rounded-md border border-red-200 bg-white px-2.5 py-1 text-[12px] text-red-700 transition-colors hover:border-red-400"
          >
            Retry
          </button>
        </div>
      ) : null}

      {actionError ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
          {actionError}
        </p>
      ) : null}

      {loading ? <p className="mt-6 text-[13px] text-[#6b7280]">Loading…</p> : null}

      {!loading && data ? (
        <>
          <BoardNameField
            value={name}
            dirty={nameDirty}
            disabled={!dbConfigured}
            saving={nameStatus === "saving"}
            saved={nameStatus === "saved"}
            onChange={(value) => {
              setName(value);
              setNameStatus("idle");
            }}
            onSave={() => void saveName()}
          />

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {data.materialized ? (
              <span className="rounded-full bg-[#ecfdf5] px-2 py-0.5 text-[10px] font-medium text-[#047857]">
                Overrides active
              </span>
            ) : (
              <span className="rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[10px] font-medium text-[#6b7280]">
                Crawled defaults ({data.defaultCount})
              </span>
            )}

            <div className="ml-auto flex flex-wrap gap-2">
              {!data.materialized ? (
                <button
                  type="button"
                  className={SECONDARY_BUTTON}
                  disabled={!dbConfigured || busy}
                  onClick={() => void run({ action: "seed", slug, locale })}
                >
                  Seed from defaults
                </button>
              ) : (
                <button
                  type="button"
                  className={SECONDARY_BUTTON}
                  disabled={!dbConfigured || busy}
                  onClick={() => {
                    if (window.confirm("Reset this board to the crawled defaults? All overrides for this locale are removed.")) {
                      void run({ action: "replace", slug, locale, posts: [] });
                    }
                  }}
                >
                  Reset to defaults
                </button>
              )}
              <button
                type="button"
                className={PRIMARY_BUTTON}
                disabled={!dbConfigured || busy || newPost !== null}
                onClick={() => setNewPost(blankPost(generatePostIdx(posts.map((p) => p.idx))))}
              >
                Add post
              </button>
            </div>
          </div>

          {!data.materialized ? (
            <p className="mt-3 rounded-md border border-line bg-white px-3 py-2 text-[12px] text-[#6b7280]">
              Showing crawled defaults. Seed (or Add a post) to start overriding this board.
            </p>
          ) : null}

          {newPost ? (
            <section className="mt-6">
              <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#6b7280]">
                New post (unsaved)
              </h2>
              <PostRow
                post={newPost}
                isProduct={data.isProduct}
                disabled={!dbConfigured}
                busy={busy}
                onSave={(post) =>
                  void run({ action: "replace", slug, locale, posts: [...posts, post] })
                }
                onDelete={() => setNewPost(null)}
              />
            </section>
          ) : null}

          <section className="mt-6 space-y-3">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-[#6b7280]">
              Posts
            </h2>
            {posts.length === 0 ? (
              <p className="text-[13px] text-[#6b7280]">No posts.</p>
            ) : (
              posts.map((post) => (
                <PostRow
                  key={post.idx}
                  post={post}
                  isProduct={data.isProduct}
                  disabled={!dbConfigured || !data.materialized}
                  busy={busy}
                  onSave={(next) =>
                    void run({ action: "update", slug, locale, idx: post.idx, patch: next })
                  }
                  onDelete={(idx) => void run({ action: "delete", slug, locale, idx })}
                />
              ))
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
