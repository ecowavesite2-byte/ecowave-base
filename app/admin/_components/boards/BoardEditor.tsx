"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { adminDict, type AdminDict, type AdminLocale } from "@/lib/admin/i18n";
import BoardNameField from "./BoardNameField";
import PostEditDialog from "./PostEditDialog";
import PostForm from "./PostForm";
import PostRow, { type RowStatus } from "./PostRow";
import type { BoardDetail, BoardListResponse, BoardLocale, BoardSummary } from "./types";
import { blankPost, generatePostIdx } from "@/lib/content/board-form";
import { flattenGroups, groupPostsByFilter, moveWithinGroup, type BoardGroup } from "./group";
import type { BoardPost } from "@/lib/types";

/** Board editor: board tabs, name override, and a post table with inline create/edit. */

const PRIMARY_BUTTON =
  "rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON =
  "rounded-md border border-line px-3 py-1.5 text-[12px] text-ink transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50";
const EDIT_BUTTON =
  "rounded-md border border-line px-2.5 py-1 text-[12px] text-ink transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50";
const DELETE_BUTTON =
  "rounded-md border border-red-200 px-2.5 py-1 text-[12px] text-red-700 transition-colors hover:border-red-400 disabled:cursor-not-allowed disabled:opacity-50";
const ORDER_BUTTON =
  "flex h-5 w-5 items-center justify-center rounded border border-line text-[11px] leading-none text-ink/70 transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40";

const SAVED_FEEDBACK_MS = 2000;

function rowStatusText(status: RowStatus, t: AdminDict["boards"]): string | null {
  if (status === "saving") return t.saving;
  if (status === "saved") return t.saved;
  if (status === "error") return t.failed;
  return null;
}

/**
 * One product-board post row: mirrors `PostRow` and adds a leading column with
 * up/down reorder controls (the news/notices table stays on `PostRow`).
 */
function GroupedPostRow({
  t,
  post,
  status,
  disabled,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onEdit,
  onDelete,
}: {
  t: AdminDict["boards"];
  post: BoardPost;
  status: RowStatus;
  disabled: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const notice = post.isNotice;
  const feedback = rowStatusText(status, t);

  return (
    <tr className="border-b border-line last:border-0 align-top">
      <td className="w-16 whitespace-nowrap px-2 py-3">
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            aria-label={t.moveUp}
            title={t.moveUp}
            className={ORDER_BUTTON}
            onClick={onMoveUp}
            disabled={disabled || !canMoveUp}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label={t.moveDown}
            title={t.moveDown}
            className={ORDER_BUTTON}
            onClick={onMoveDown}
            disabled={disabled || !canMoveDown}
          >
            ↓
          </button>
        </div>
      </td>
      <td className="max-w-[340px] px-4 py-3 text-[13px] text-ink">
        <span className="line-clamp-2 break-words">{post.title || t.noTitle}</span>
        {post.files && post.files.length > 0 ? (
          <span className="ml-1 text-[11px] text-[#6b7280]" title={t.attachments(post.files.length)}>
            📎 {post.files.length}
          </span>
        ) : null}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-[12px]">
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            notice ? "bg-[#eef2ff] text-[#4338ca]" : "bg-[#f3f4f6] text-[#6b7280]"
          }`}
        >
          {notice ? t.notice : t.normal}
        </span>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-[12px] text-[#6b7280]">
        {post.date ?? post.idx}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-[12px] text-[#6b7280]">
        {post.views ?? 0}
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <div className="flex items-center gap-2">
          <button type="button" className={EDIT_BUTTON} onClick={onEdit} disabled={disabled}>
            {t.edit}
          </button>
          <button type="button" className={DELETE_BUTTON} onClick={onDelete} disabled={disabled}>
            {t.delete}
          </button>
          {feedback ? (
            <span
              className={`text-[11px] ${
                status === "error" ? "text-red-600" : "text-emerald-600"
              }`}
            >
              {feedback}
            </span>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

export default function BoardEditor({
  slug,
  initialLocale,
  adminLocale,
  embedded = false,
}: {
  slug: string;
  initialLocale: BoardLocale;
  adminLocale: AdminLocale;
  /**
   * Embedded mode (Content → News & Notices): drops the outer page padding, the
   * board-picker tab row and the back link, and renders the title as an `h2`.
   * The locale switch, board name field, seed/reset, post table and PostForm are
   * unchanged — posts still save through the same `/api/admin/boards` route.
   */
  embedded?: boolean;
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
  /** Filter id pre-selected when adding a post from a product-board group. */
  const [newCategory, setNewCategory] = useState<string | undefined>(undefined);
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
    if (!embedded) void loadBoards();
  }, [load, loadBoards, embedded]);

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
  const filters = data?.filters ?? [];
  // Product-board grouping is pure; news/notices never render it.
  const groups = groupPostsByFilter(posts, filters);
  const nameDirty = name !== nameBase;
  // Edit/Delete are available even before the board is materialized: a
  // non-materialized board still shows the crawled defaults, and editing one
  // writes the whole computed list via `replace` (see `saveEditedPost`).
  const rowsDisabled = !dbConfigured || busy;
  const formDisabled = !dbConfigured || busy;

  /** Open the new-post form, optionally pre-selecting a product filter. */
  function startNew(category?: string) {
    setNewCategory(category);
    setEditing("new");
  }

  /**
   * Reorder a post inside one group. `moveWithinGroup` swaps the neighbours,
   * then `flattenGroups` re-sequences the WHOLE board array in group display
   * order (filter groups first, unassigned last) and submits it via `replace`,
   * so `sortOrder` follows the visible order. Unassigned/other posts are kept.
   */
  function move(group: BoardGroup, index: number, direction: "up" | "down") {
    const target = index + (direction === "up" ? -1 : 1);
    if (target < 0 || target >= group.posts.length) return;
    const next = moveWithinGroup(groups, group.filterId, index, direction);
    void run(
      { action: "replace", slug, locale, posts: flattenGroups(next) },
      group.posts[index].idx,
    );
  }

  /** Append a new post (always a `replace`, which materializes the collection). */
  function addPost(post: BoardPost) {
    void run({ action: "replace", slug, locale, posts: [...posts, post] }, post.idx);
  }

  /**
   * Save an edited post. A materialized board uses the targeted `update`; a board
   * still showing crawled defaults has no rows to target, so the whole computed
   * list is written via `replace` — exactly the materialization `seed` performs.
   * Exactly one PUT runs either way (no double-write).
   */
  function saveEditedPost(post: BoardPost) {
    if (data?.materialized) {
      void run({ action: "update", slug, locale, idx: post.idx, patch: post }, post.idx);
    } else {
      void run(
        { action: "replace", slug, locale, posts: posts.map((p) => (p.idx === post.idx ? post : p)) },
        post.idx,
      );
    }
  }

  /** Delete a post, materializing the board first when it still has no overrides. */
  function deletePost(post: BoardPost) {
    if (!window.confirm(t.deleteConfirm(post.title || post.idx))) return;
    if (data?.materialized) {
      void run({ action: "delete", slug, locale, idx: post.idx }, post.idx);
    } else {
      void run(
        { action: "replace", slug, locale, posts: posts.filter((p) => p.idx !== post.idx) },
        post.idx,
      );
    }
  }

  return (
    <div className={embedded ? "min-w-0" : "mx-auto max-w-[960px] p-8"}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          {embedded ? null : (
            <Link
              href={`/admin/boards?locale=${locale}`}
              className="text-[12px] text-[#6b7280] transition-colors hover:text-accent"
            >
              ← {t.backLabel}
            </Link>
          )}
          {embedded ? (
            <h2 className="mt-1 text-[18px] font-bold tracking-tight text-ink">
              {data?.label ?? slug}
            </h2>
          ) : (
            <h1 className="mt-1 text-[22px] font-bold tracking-tight text-ink">
              {data?.label ?? slug}
            </h1>
          )}
          <p className="mt-0.5 text-[13px] text-[#6b7280]">
            {data ? t.postCount(posts.length) : "…"} · <span className="font-mono">{slug}</span>
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-4">
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

      {/* Board tabs (hidden in the embedded News & Notices editor) */}
      {!embedded && boards.length > 0 ? (
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
                onClick={() => startNew()}
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
            data.isProduct ? (
              <section className="mt-6">
                <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#6b7280]">
                  {editing === "new" ? t.newPost : t.editPost(editing.idx)}
                </h2>
                <PostForm
                  t={t}
                  key={editing === "new" ? "new" : editing.idx}
                  post={
                    editing === "new"
                      ? {
                          ...blankPost(generatePostIdx(posts.map((p) => p.idx))),
                          ...(newCategory ? { category: newCategory } : {}),
                        }
                      : editing
                  }
                  isProduct
                  filters={filters}
                  disabled={formDisabled}
                  busy={busy}
                  onSave={(post) => {
                    if (editing === "new") addPost(post);
                    else saveEditedPost(post);
                  }}
                  onCancel={() => setEditing(null)}
                />
              </section>
            ) : (
              /* News/notices: the shared two-pane dialog (form + live preview). */
              <PostEditDialog
                key={editing === "new" ? "new" : editing.idx}
                variant="board"
                boardKind={slug === "notices" ? "notices" : "news"}
                boardHref={`/${locale === "ko" ? "" : "en/"}${slug.replace(/\./g, "/")}`}
                boardName={data.name || data.label}
                t={t}
                title={editing === "new" ? t.newPost : t.editPost(editing.idx)}
                post={
                  editing === "new"
                    ? {
                        ...blankPost(generatePostIdx(posts.map((p) => p.idx))),
                        ...(newCategory ? { category: newCategory } : {}),
                      }
                    : editing
                }
                filters={filters}
                locale={locale}
                disabled={formDisabled}
                busy={busy}
                error={actionError}
                onSave={(post) => {
                  if (editing === "new") addPost(post);
                  else saveEditedPost(post);
                }}
                onCancel={() => setEditing(null)}
              />
            )
          ) : data.isProduct ? (
            <section className="mt-6">
              <p className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[#6b7280]">
                <Link
                  href="/admin/content?group=products"
                  className="transition-colors hover:text-accent"
                >
                  {t.filtersHint}
                </Link>
                <span aria-hidden="true">·</span>
                <span>{t.reorderHint}</span>
              </p>
              <div className="space-y-4">
                {groups.map((group) => (
                  <div
                    key={group.filterId ?? "__unassigned"}
                    className="overflow-hidden rounded-lg border border-line bg-white"
                  >
                    <div className="flex flex-wrap items-center gap-2 border-b border-line bg-[#fafafa] px-4 py-2.5">
                      <span className="text-[13px] font-semibold text-ink">
                        {group.filterId === null ? t.unassigned : group.name}
                      </span>
                      <span
                        className={`text-[11px] ${
                          group.filterId === null ? "text-[#9ca3af]" : "text-[#6b7280]"
                        }`}
                      >
                        {t.postCount(group.posts.length)}
                      </span>
                      <button
                        type="button"
                        className={`ml-auto ${SECONDARY_BUTTON}`}
                        disabled={!dbConfigured || busy}
                        onClick={() => startNew(group.filterId ?? undefined)}
                      >
                        {t.addPost}
                      </button>
                    </div>
                    <table className="w-full min-w-[640px] text-left">
                      <thead>
                        <tr className="border-b border-line text-[12px] text-[#6b7280]">
                          <th className="w-16 px-2 py-2.5 font-medium" aria-hidden="true" />
                          <th className="px-4 py-2.5 font-medium">{t.columns.title}</th>
                          <th className="px-4 py-2.5 font-medium">{t.columns.status}</th>
                          <th className="px-4 py-2.5 font-medium">{t.columns.date}</th>
                          <th className="px-4 py-2.5 font-medium">{t.columns.views}</th>
                          <th className="px-4 py-2.5 font-medium">{t.columns.manage}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.posts.map((post, index) => (
                          <GroupedPostRow
                            key={post.idx}
                            t={t}
                            post={post}
                            status={rowStatus[post.idx] ?? "idle"}
                            disabled={rowsDisabled}
                            canMoveUp={index > 0}
                            canMoveDown={index < group.posts.length - 1}
                            onMoveUp={() => move(group, index, "up")}
                            onMoveDown={() => move(group, index, "down")}
                            onEdit={() => setEditing(post)}
                            onDelete={() => deletePost(post)}
                          />
                        ))}
                        {group.posts.length === 0 ? (
                          <tr>
                            <td
                              colSpan={6}
                              className="px-4 py-6 text-center text-[12px] text-[#9ca3af]"
                            >
                              {t.noPosts}
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
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
                        onDelete={() => deletePost(post)}
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
