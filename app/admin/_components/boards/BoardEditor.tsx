"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { adminDict, type AdminLocale } from "@/lib/admin/i18n";
import BoardNameField from "./BoardNameField";
import PostForm from "./PostForm";
import PostRow, { type RowStatus } from "./PostRow";
import type { BoardDetail, BoardListResponse, BoardLocale, BoardSummary } from "./types";
import { blankPost, generatePostIdx } from "@/lib/content/board-form";
import type { BoardPost } from "@/lib/types";

/** Board editor: board tabs, name override, and a post table with inline create/edit. */

const PRIMARY_BUTTON =
  "rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON =
  "rounded-md border border-line px-3 py-1.5 text-[12px] text-ink transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50";

const SAVED_FEEDBACK_MS = 2000;

export default function BoardEditor({
  slug,
  initialLocale,
  adminLocale,
}: {
  slug: string;
  initialLocale: BoardLocale;
  adminLocale: AdminLocale;
}) {
  const t = adminDict[adminLocale].boards;
  const LOCALES: { value: BoardLocale; label: string }[] = [
    { value: "ko", label: t.localeKo },
    { value: "en", label: t.localeEn },
  ];
  const [locale, setLocale] = useState<BoardLocale>(initialLocale);
  const [data, setData] = useState<BoardDetail | null>(null);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [dbConfigured, setDbConfigured] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState<BoardPost | "new" | null>(null);
  const [rowStatus, setRowStatus] = useState<Record<string, RowStatus>>({});

  const [name, setName] = useState("");
  const [nameBase, setNameBase] = useState("");
  const [nameStatus, setNameStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
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
      if (typeof detail.dbConfigured === "boolean") setDbConfigured(detail.dbConfigured);
    } catch {
      setData(null);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [locale, slug]);

  const loadBoards = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/boards?locale=${locale}`);
      if (!response.ok) return;
      const list = (await response.json()) as BoardListResponse;
      setBoards(list.boards);
    } catch {
      setBoards([]);
    }
  }, [locale]);

  useEffect(() => {
    void load();
    void loadBoards();
  }, [load, loadBoards]);

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
        typeof payload.error === "string" ? payload.error : t.requestFailed(response.status);
      if (response.status === 503) setDbConfigured(false);
      return { ok: false, error: message };
    } catch {
      return { ok: false, error: t.networkError };
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
      setActionError(result.error ?? t.actionFailed);
    }
  }

  /** Run a mutation, reload, and optionally flash per-row feedback for `rowIdx`. */
  async function run(action: Record<string, unknown>, rowIdx?: string) {
    if (rowIdx) setRowStatus((prev) => ({ ...prev, [rowIdx]: "saving" }));
    const result = await put(action);
    if (!result.ok) {
      if (rowIdx) setRowStatus((prev) => ({ ...prev, [rowIdx]: "error" }));
      setActionError(result.error ?? t.actionFailed);
      return;
    }
    await load();
    setEditing(null);
    if (rowIdx) {
      setRowStatus((prev) => ({ ...prev, [rowIdx]: "saved" }));
      window.setTimeout(() => {
        setRowStatus((prev) => ({ ...prev, [rowIdx]: "idle" }));
      }, SAVED_FEEDBACK_MS);
    }
  }

  const posts = data?.posts ?? [];
  const nameDirty = name !== nameBase;
  const rowsDisabled = !dbConfigured || busy || !data?.materialized;
  const formDisabled = !dbConfigured || busy;

  return (
    <div className="mx-auto max-w-[960px] p-8">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <Link
            href={`/admin/boards?locale=${locale}`}
            className="text-[12px] text-[#6b7280] transition-colors hover:text-accent"
          >
            ← {t.backLabel}
          </Link>
          <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink">
            {data?.label ?? slug}
          </h1>
          <p className="mt-0.5 text-[13px] text-[#6b7280]">
            {data ? t.postCount(posts.length) : "…"} · <span className="font-mono">{slug}</span>
          </p>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <Link
            href={`/${locale === "ko" ? "" : "en/"}${slug.replace(/\./g, "/")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] text-[#6b7280] transition-colors hover:text-accent"
          >
            {t.viewBoard} ↗
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

      {/* Board tabs */}
      {boards.length > 0 ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {boards.map((board) => {
            const active = board.slug === slug;
            return (
              <Link
                key={board.slug}
                href={`/admin/boards/${board.slug}?locale=${locale}`}
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  active
                    ? "bg-accent text-white"
                    : "border border-line bg-white text-ink hover:border-accent hover:text-accent"
                }`}
              >
                {board.label}
                <span className={`ml-1.5 text-[11px] ${active ? "text-white/70" : "text-[#9ca3af]"}`}>
                  {board.count}
                </span>
              </Link>
            );
          })}
        </div>
      ) : null}

      {!dbConfigured ? (
        <div
          role="status"
          className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900"
        >
          {t.dbNotice}
        </div>
      ) : null}

      {loadError ? (
        <div className="mt-6 flex items-center gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
          <span>{t.boardLoadError}</span>
          <button
            type="button"
            onClick={() => void load()}
            className="ml-auto rounded-md border border-red-200 bg-white px-2.5 py-1 text-[12px] text-red-700 transition-colors hover:border-red-400"
          >
            {t.retry}
          </button>
        </div>
      ) : null}

      {actionError ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
          {actionError}
        </p>
      ) : null}

      {loading ? <p className="mt-6 text-[13px] text-[#6b7280]">{t.loading}</p> : null}

      {!loading && data ? (
        <>
          <BoardNameField
            t={t}
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
                {t.overridesActive}
              </span>
            ) : (
              <span className="rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[10px] font-medium text-[#6b7280]">
                {t.crawledDefaults(data.defaultCount)}
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
                  {t.seed}
                </button>
              ) : (
                <button
                  type="button"
                  className={SECONDARY_BUTTON}
                  disabled={!dbConfigured || busy}
                  onClick={() => {
                    if (window.confirm(t.resetConfirm)) {
                      void run({ action: "replace", slug, locale, posts: [] });
                    }
                  }}
                >
                  {t.reset}
                </button>
              )}
              <button
                type="button"
                className={PRIMARY_BUTTON}
                disabled={!dbConfigured || busy || editing !== null}
                onClick={() => setEditing("new")}
              >
                {t.addPost}
              </button>
            </div>
          </div>

          {!data.materialized ? (
            <p className="mt-3 rounded-md border border-line bg-white px-3 py-2 text-[12px] text-[#6b7280]">
              {t.defaultsNotice}
            </p>
          ) : null}

          {editing !== null ? (
            <section className="mt-6">
              <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#6b7280]">
                {editing === "new" ? t.newPost : t.editPost(editing.idx)}
              </h2>
              <PostForm
                t={t}
                key={editing === "new" ? "new" : editing.idx}
                post={
                  editing === "new"
                    ? blankPost(generatePostIdx(posts.map((p) => p.idx)))
                    : editing
                }
                isProduct={data.isProduct}
                disabled={formDisabled}
                busy={busy}
                onSave={(post) => {
                  if (editing === "new") {
                    void run(
                      { action: "replace", slug, locale, posts: [...posts, post] },
                      post.idx,
                    );
                  } else {
                    void run(
                      { action: "update", slug, locale, idx: post.idx, patch: post },
                      post.idx,
                    );
                  }
                }}
                onCancel={() => setEditing(null)}
              />
            </section>
          ) : (
            <section className="mt-6">
              <div className="overflow-hidden rounded-lg border border-line bg-white">
                <table className="w-full min-w-[640px] text-left">
                  <thead>
                    <tr className="border-b border-line bg-[#fafafa] text-[12px] text-[#6b7280]">
                      <th className="px-4 py-2.5 font-medium">{t.columns.title}</th>
                      <th className="px-4 py-2.5 font-medium">{t.columns.status}</th>
                      <th className="px-4 py-2.5 font-medium">{t.columns.date}</th>
                      <th className="px-4 py-2.5 font-medium">{t.columns.views}</th>
                      <th className="px-4 py-2.5 font-medium">{t.columns.manage}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {posts.map((post) => (
                      <PostRow
                        key={post.idx}
                        t={t}
                        post={post}
                        status={rowStatus[post.idx] ?? "idle"}
                        disabled={rowsDisabled}
                        onEdit={() => setEditing(post)}
                        onDelete={() => {
                          if (window.confirm(t.deleteConfirm(post.title || post.idx))) {
                            void run(
                              { action: "delete", slug, locale, idx: post.idx },
                              post.idx,
                            );
                          }
                        }}
                      />
                    ))}
                    {posts.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-[13px] text-[#6b7280]">
                          {t.noPosts}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}
