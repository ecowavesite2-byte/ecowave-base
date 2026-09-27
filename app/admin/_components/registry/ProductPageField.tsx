"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AdminDict } from "@/lib/admin/i18n";
import { blankPost, generatePostIdx } from "@/lib/content/board-form";
import type { BoardPost, ProductFilter, ProductPagePayload } from "@/lib/types";
import ProductEditDialog from "../boards/ProductEditDialog";
import type { RowStatus } from "../boards/PostRow";
import {
  flattenGroups,
  groupPostsByFilter,
  moveWithinGroup,
} from "../boards/group";
import type { BoardDetail } from "../boards/types";
import type { ProductPostOption, RegistryLocale } from "./types";

/**
 * Structured `productPage` editor — one section-less def per product board.
 *
 * The value is a JSON object stored as one override string:
 *   `{ title, subtitle, filters: [{ id, name }] }`
 * where `title`/`subtitle` are the page hero copy (rendered identically on
 * desktop and mobile) and each filter is one tab: `id` is the stable post
 * `category` string it selects and `name` is the tab's display label.
 *
 * The server-side validator enforces non-empty `title`/`subtitle` (≤120) and
 * 1..20 filters whose `id` and `name` are each non-empty (≤60) and unique. This
 * editor mirrors the caps defensively (add is disabled at twenty, the last
 * filter cannot be removed, inputs are length-capped) without blocking a save on
 * the cross-field rules the API owns. Empty `value` reverts to the code default;
 * every mutation re-serializes the WHOLE payload so the runtime always replaces
 * it atomically.
 *
 * Filter `id`s are NEVER edited: renaming a filter changes only its `name`, and
 * new filters receive an auto-generated stable id that survives renames.
 *
 * The public tab row also carries a built-in `전체`/`All` tab ahead of the
 * filters. It is NOT part of the payload, so it is rendered here as a fixed,
 * non-editable first row so the editor's count matches the public page.
 *
 * Each filter also manages its own product posts (add/edit/delete/reorder)
 * through the SAME boards lane the Boards screen uses: add/edit open the
 * two-pane `ProductEditDialog` (shared `PostForm` + live preview) and everything
 * writes through `GET /api/admin/boards?locale=<lang>&slug=<slug>` to read the
 * board and `PUT { action: replace|update|delete }` to write it. Reordering
 * re-sequences the WHOLE board array (filter groups first, unassigned last),
 * exactly like the Boards grouped view, then flattens it back through `group.ts`.
 *
 * A new category created from the product form joins THIS locale's page draft
 * (`onCreateCategory`) and only takes effect once the page is saved, mirroring
 * the draft model of the title/subtitle/filter fields.
 */

/** Domain rules mirrored from `normalizeProductPagePayload`. */
const MAX_TITLE = 120;
const MAX_FILTERS = 20;
const MAX_FILTER_NAME = 60;

/** Cap the compact preview list the Boards screen's own reader uses. */
const PREVIEW_POST_CAP = 24;

/** Per-row saved ✓ feedback duration, matching the Boards editor. */
const SAVED_FEEDBACK_MS = 2000;

/** Local alias: the editor mutates the same canonical payload shape. */
type ProductPage = ProductPagePayload;

const EMPTY_PAGE: ProductPage = { title: "", subtitle: "", filters: [] };

/**
 * Parse the stored JSON; `null` means "malformed" (caller falls back).
 *
 * Exported so the live preview pane resolves the SAME payload the editor
 * writes (and the runtime stores), keeping the two contracts from drifting.
 */
export function parseProductPage(json: string): ProductPage | null {
  try {
    const raw: unknown = JSON.parse(json);
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
    const record = raw as Record<string, unknown>;
    const filters: ProductFilter[] = Array.isArray(record.filters)
      ? record.filters.map((entry) => {
          const item =
            typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : {};
          return {
            id: typeof item.id === "string" ? item.id : "",
            name: typeof item.name === "string" ? item.name : "",
          };
        })
      : [];
    return {
      title: typeof record.title === "string" ? record.title : "",
      subtitle: typeof record.subtitle === "string" ? record.subtitle : "",
      filters,
    };
  } catch {
    return null;
  }
}

/**
 * A fresh stable id for a new filter; renaming never touches it. Exported so the
 * product form's “new category” path shares the same generator.
 */
export function newFilterId(): string {
  const uuid =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `f-${uuid.replace(/-/g, "").slice(0, 8)}`;
}

/** Compact a full board post array to the preview option shape (cap 24). */
function compactProductPosts(posts: BoardPost[]): ProductPostOption[] {
  return posts.slice(0, PREVIEW_POST_CAP).map((post) => ({
    idx: post.idx,
    title: post.title,
    category: post.category,
    thumb: post.thumb ?? null,
    date: post.date ?? null,
  }));
}

/** Best-effort full post from a compact preview option (fallback before load). */
function optionToPost(option: ProductPostOption): BoardPost {
  return {
    idx: option.idx,
    title: option.title,
    category: option.category,
    excerpt: "",
    thumb: option.thumb ?? null,
    isNotice: false,
    date: option.date ?? null,
    views: null,
  };
}

const CARD = "rounded-[4px] border border-black/10 bg-soft p-2.5";
const FILTER_CARD = "mt-2 rounded-[4px] border border-black/10 bg-white p-2.5";
const PRODUCTS_BOX = "mt-2 rounded-[4px] border border-black/10 bg-white/70 p-2";
const ROW_BUTTON =
  "shrink-0 rounded-[3px] border border-black/10 bg-white px-2 py-1 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-40";
const REMOVE_BUTTON =
  "shrink-0 rounded-[3px] border border-black/10 bg-white px-2 py-1 text-[11px] text-muted transition-colors hover:border-red-400 hover:text-red-600 disabled:opacity-40";
const ADD_BUTTON =
  "h-[32px] rounded-[3px] border border-dashed border-black/20 px-4 text-[12px] text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-40";
const ADD_PRODUCT_BUTTON =
  "shrink-0 rounded-[3px] border border-black/10 bg-white px-2.5 py-1 text-[11px] text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-40";
const INPUT =
  "h-[36px] w-full rounded-[3px] border border-black/10 bg-white px-3 text-[13px] text-ink outline-none transition-colors placeholder:text-muted focus:border-accent";
const COPY_BUTTON =
  "h-[32px] shrink-0 rounded-[3px] border border-black/10 bg-white px-3 text-[12px] text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-40";

/** One inline product row: thumb, title and the Boards-lane row controls. */
function ProductRow({
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
  const feedback =
    status === "saving" ? t.saving : status === "saved" ? t.saved : status === "error" ? t.failed : null;

  return (
    <li className="flex items-center gap-2 rounded-[3px] border border-black/5 bg-white px-2 py-1.5">
      <span className="flex h-9 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[2px] border border-black/10 bg-soft">
        {post.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.thumb} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-[10px] text-muted">—</span>
        )}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12px] text-ink">
        {post.title || t.noTitle}
      </span>
      <button
        type="button"
        data-testid="product-page-product-move-up"
        aria-label={t.moveUp}
        title={t.moveUp}
        disabled={disabled || !canMoveUp}
        onClick={onMoveUp}
        className={ROW_BUTTON}
      >
        ↑
      </button>
      <button
        type="button"
        data-testid="product-page-product-move-down"
        aria-label={t.moveDown}
        title={t.moveDown}
        disabled={disabled || !canMoveDown}
        onClick={onMoveDown}
        className={ROW_BUTTON}
      >
        ↓
      </button>
      <button
        type="button"
        data-testid="product-page-product-edit"
        disabled={disabled}
        onClick={onEdit}
        className={ROW_BUTTON}
      >
        {t.edit}
      </button>
      <button
        type="button"
        data-testid="product-page-product-delete"
        disabled={disabled}
        onClick={onDelete}
        className={REMOVE_BUTTON}
      >
        {t.delete}
      </button>
      {feedback ? (
        <span
          className={`text-[11px] ${status === "error" ? "text-red-600" : "text-emerald-600"}`}
        >
          {feedback}
        </span>
      ) : null}
    </li>
  );
}

export default function ProductPageField({
  value,
  defaultValue,
  lang,
  disabled = false,
  t,
  boardsT,
  boardSlug,
  posts,
  onPostsChange,
  onCopyToOther,
  onChange,
}: {
  value: string;
  defaultValue: string;
  lang: RegistryLocale;
  disabled?: boolean;
  t: AdminDict["content"];
  /** Boards dictionary, reused by the inline product manager's shared controls. */
  boardsT: AdminDict["boards"];
  /** Board slug of this product page (`def.pageKey`, e.g. `products.eco-wave`). */
  boardSlug: string;
  /** Compact preview posts from the server (fallback before the board loads). */
  posts: ProductPostOption[];
  /** Called with the refreshed compact post list after each successful mutation. */
  onPostsChange: (posts: ProductPostOption[]) => void;
  /**
   * Write this panel's copyable payload (`{ title, subtitle }` only) into the
   * OTHER locale draft (copy button). When omitted the button is hidden — the
   * Boards lane never uses it. Filter ids are locale-specific, so the caller
   * merges the target's OWN filters on top (see `FieldRow`).
   */
  onCopyToOther?: (json: string) => void;
  onChange: (json: string) => void;
}) {
  const isDefault = value.trim() === "";
  const source = isDefault ? defaultValue : value;
  const parsed = useMemo(() => parseProductPage(source), [source]);
  const defaultPage = useMemo(() => parseProductPage(defaultValue), [defaultValue]);

  const invalid = !isDefault && parsed === null;
  const page = parsed ?? defaultPage ?? EMPTY_PAGE;
  const atMax = page.filters.length >= MAX_FILTERS;

  // Full board posts (all fields) for this content locale, fetched from the
  // existing boards lane. `null` until the first load resolves.
  const [boardPosts, setBoardPosts] = useState<BoardPost[] | null>(null);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsError, setPostsError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState<BoardPost | "new" | null>(null);
  /** Filter id pre-selected when adding from a filter row. */
  const [newCategory, setNewCategory] = useState<string | undefined>(undefined);
  const [rowStatus, setRowStatus] = useState<Record<string, RowStatus>>({});
  /** Transient "copied to the other language" feedback for this panel. */
  const [copied, setCopied] = useState(false);
  /**
   * Stable idx for the post being added, fixed when the dialog opens. The
   * dialog is keyed by `new-<category>` (not the idx) so a re-render cannot
   * remount it and wipe an in-progress edit.
   */
  const newPostIdxRef = useRef("");

  // Keep the latest callback without retriggering the loader effect on every
  // parent render (the inline arrow in FieldRow is a fresh identity each time).
  const onPostsChangeRef = useRef(onPostsChange);
  useEffect(() => {
    onPostsChangeRef.current = onPostsChange;
  });

  const loadPosts = useCallback(async () => {
    setPostsLoading(true);
    setPostsError(false);
    try {
      const response = await fetch(
        `/api/admin/boards?locale=${lang}&slug=${encodeURIComponent(boardSlug)}`,
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const detail = (await response.json()) as BoardDetail;
      setBoardPosts(detail.posts);
      onPostsChangeRef.current(compactProductPosts(detail.posts));
    } catch {
      setPostsError(true);
    } finally {
      setPostsLoading(false);
    }
  }, [boardSlug, lang]);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  const commit = (patch: Partial<ProductPage>) => onChange(JSON.stringify({ ...page, ...patch }));

  const updateFilter = (index: number, patch: Partial<ProductFilter>) => {
    commit({ filters: page.filters.map((filter, i) => (i === index ? { ...filter, ...patch } : filter)) });
  };

  const removeFilter = (index: number) => {
    if (page.filters.length <= 1) return;
    commit({ filters: page.filters.filter((_, i) => i !== index) });
  };

  const moveFilter = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= page.filters.length) return;
    const next = page.filters.slice();
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    commit({ filters: next });
  };

  const addFilter = () => {
    if (page.filters.length >= MAX_FILTERS) return;
    commit({ filters: [...page.filters, { id: newFilterId(), name: "" }] });
  };

  /**
   * Add a filter from the product form. The new filter joins THIS locale's page
   * draft (so the page now needs a Save) and its id is returned for selection.
   * Returns `null` when the name is empty or the filter cap is reached.
   */
  const handleCreateCategory = async (name: string): Promise<string | null> => {
    const trimmed = name.trim();
    if (!trimmed || page.filters.length >= MAX_FILTERS) return null;
    const id = newFilterId();
    commit({ filters: [...page.filters, { id, name: trimmed }] });
    return id;
  };

  /**
   * Copy only this panel's title/subtitle into the other locale's draft. Filter
   * ids name locale-specific post categories (KO `필터` vs EN `Filter`), so
   * they must NEVER cross locales — the target keeps its own filters untouched.
   */
  const handleCopyToOther = () => {
    if (!onCopyToOther) return;
    onCopyToOther(JSON.stringify({ title: page.title, subtitle: page.subtitle }));
    setCopied(true);
    window.setTimeout(() => setCopied(false), SAVED_FEEDBACK_MS);
  };

  /** Run one boards-lane mutation, then refetch and re-sync the preview. */
  async function put(body: unknown): Promise<boolean> {
    setBusy(true);
    setActionError(null);
    try {
      const response = await fetch("/api/admin/boards", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.ok) return true;
      const payload = (await response.json().catch(() => ({}))) as { error?: unknown };
      setActionError(
        typeof payload.error === "string" ? payload.error : boardsT.requestFailed(response.status),
      );
      return false;
    } catch {
      setActionError(boardsT.networkError);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function run(action: Record<string, unknown>, rowIdx?: string) {
    if (rowIdx) setRowStatus((prev) => ({ ...prev, [rowIdx]: "saving" }));
    const ok = await put(action);
    if (!ok) {
      if (rowIdx) setRowStatus((prev) => ({ ...prev, [rowIdx]: "error" }));
      return;
    }
    setEditing(null);
    await loadPosts();
    if (rowIdx) {
      setRowStatus((prev) => ({ ...prev, [rowIdx]: "saved" }));
      window.setTimeout(() => {
        setRowStatus((prev) => ({ ...prev, [rowIdx]: "idle" }));
      }, SAVED_FEEDBACK_MS);
    }
  }

  /** Open the new-product dialog with a filter pre-selected. */
  function startNew(category?: string) {
    newPostIdxRef.current = generatePostIdx((boardPosts ?? []).map((item) => item.idx));
    setActionError(null);
    setNewCategory(category);
    setEditing("new");
  }

  /**
   * Move a post inside one filter. `moveWithinGroup` swaps neighbours and
   * `flattenGroups` re-sequences the WHOLE board array in display order (filter
   * groups first, unassigned last) before submitting it via `replace`, exactly
   * like the Boards grouped view. Requires the full board array (no fallback).
   */
  function move(filterId: string, index: number, direction: "up" | "down") {
    if (!boardPosts) return;
    const group = groups.find((candidate) => candidate.filterId === filterId);
    if (!group) return;
    const target = index + (direction === "up" ? -1 : 1);
    if (target < 0 || target >= group.posts.length) return;
    const next = moveWithinGroup(groups, filterId, index, direction);
    void run(
      { action: "replace", slug: boardSlug, locale: lang, posts: flattenGroups(next) },
      group.posts[index].idx,
    );
  }

  // Display posts: the loaded full list, else the compact server preview mapped
  // to a minimal shape so counts/rows render before the fetch resolves.
  const displayPosts = useMemo(
    () => boardPosts ?? posts.map(optionToPost),
    [boardPosts, posts],
  );
  const groups = useMemo(
    () => groupPostsByFilter(displayPosts, page.filters),
    [displayPosts, page.filters],
  );

  const rowsDisabled = disabled || busy || boardPosts === null;

  // The post the dialog edits: the selected one, or a fresh blank post carrying
  // the pre-selected filter and the idx fixed when the dialog opened.
  const editingPost: BoardPost | null =
    editing === null
      ? null
      : editing === "new"
        ? {
            ...blankPost(
              newPostIdxRef.current ||
                generatePostIdx((boardPosts ?? []).map((item) => item.idx)),
            ),
            ...(newCategory ? { category: newCategory } : {}),
          }
        : editing;
  const dialogKey =
    editing === "new" ? `new-${newCategory ?? ""}` : editing ? editing.idx : "";

  return (
    <div className="space-y-2" data-testid="product-page-editor" data-lang={lang}>
      {invalid ? <p className="text-[11px] text-amber-600">{t.productPageInvalid}</p> : null}

      <div className={CARD}>
        {onCopyToOther ? (
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-[4px] border border-black/10 bg-white/70 px-2.5 py-2">
            <button
              type="button"
              data-testid="product-page-copy-other"
              disabled={disabled}
              onClick={handleCopyToOther}
              className={COPY_BUTTON}
            >
              {t.productPageCopyOther}
            </button>
            <span className="min-w-0 flex-1 text-[11px] text-muted">
              {copied ? t.productPageCopyOtherDone : t.productPageCopyOtherHint}
            </span>
          </div>
        ) : null}

        <div className="space-y-2">
          <label className="block min-w-0">
            <span className="mb-1 block text-[11px] text-muted">{t.productPageTitle}</span>
            <input
              type="text"
              data-testid="product-page-title"
              value={page.title}
              maxLength={MAX_TITLE}
              disabled={disabled}
              onChange={(event) => commit({ title: event.target.value })}
              className={INPUT}
            />
            <span className="mt-1 block text-[11px] text-muted">{t.productPageTitleHint}</span>
          </label>

          <label className="block min-w-0">
            <span className="mb-1 block text-[11px] text-muted">{t.productPageSubtitle}</span>
            <input
              type="text"
              data-testid="product-page-subtitle"
              value={page.subtitle}
              maxLength={MAX_TITLE}
              disabled={disabled}
              onChange={(event) => commit({ subtitle: event.target.value })}
              className={INPUT}
            />
            <span className="mt-1 block text-[11px] text-muted">{t.productPageSubtitleHint}</span>
          </label>
        </div>

        <div className="mt-2 rounded-[4px] border border-black/10 bg-white/60 p-2">
          <span className="mb-1 block text-[11px] font-medium text-muted">
            {t.productPageFilters}
          </span>
          <p className="mb-2 text-[11px] text-muted">{t.productPageFilterHint}</p>

          {/* Built-in `전체`/`All` tab: not part of the payload, always first. */}
          <div
            data-testid="product-page-builtin-tab"
            className="mb-2 flex flex-wrap items-center gap-2 rounded-[4px] border border-dashed border-black/15 bg-white/70 px-2.5 py-2"
          >
            <span className="rounded-[3px] bg-soft px-2 py-0.5 text-[12px] font-medium text-ink">
              {lang === "ko" ? t.productPageBuiltinAllKo : t.productPageBuiltinAllEn}
            </span>
            <span className="text-[11px] text-muted">{t.productPageBuiltinHint}</span>
          </div>

          {postsLoading ? (
            <p className="mb-2 text-[11px] text-muted" data-testid="product-page-products-loading">
              {t.productPageProductsLoading}
            </p>
          ) : null}
          {postsError ? (
            <p
              className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-red-600"
              data-testid="product-page-products-error"
            >
              {t.productPageProductsError}
              <button type="button" onClick={() => void loadPosts()} className={ROW_BUTTON}>
                {boardsT.retry}
              </button>
            </p>
          ) : null}
          {actionError ? (
            <p
              className="mb-2 rounded-[3px] border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-800"
              data-testid="product-page-products-action-error"
            >
              {actionError}
            </p>
          ) : null}

          <div className="space-y-2">
            {page.filters.map((filter, index) => {
              const groupPosts = groups[index]?.posts ?? [];
              return (
                <div key={index} data-testid="product-page-filter" className={FILTER_CARD}>
                  <div className="flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink">
                      {t.productPageFilter(index + 1)}
                    </span>
                    <button
                      type="button"
                      data-testid="product-page-filter-move-up"
                      aria-label={t.productPageMoveUp}
                      title={t.productPageMoveUp}
                      disabled={disabled || index === 0}
                      onClick={() => moveFilter(index, -1)}
                      className={ROW_BUTTON}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      data-testid="product-page-filter-move-down"
                      aria-label={t.productPageMoveDown}
                      title={t.productPageMoveDown}
                      disabled={disabled || index === page.filters.length - 1}
                      onClick={() => moveFilter(index, 1)}
                      className={ROW_BUTTON}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      data-testid="product-page-filter-remove"
                      disabled={disabled || page.filters.length <= 1}
                      onClick={() => removeFilter(index)}
                      className={REMOVE_BUTTON}
                    >
                      {t.productPageRemove}
                    </button>
                  </div>

                  <label className="mt-2 block min-w-0">
                    <span className="mb-1 block text-[11px] text-muted">
                      {t.productPageFilterName}
                    </span>
                    <input
                      type="text"
                      data-testid="product-page-filter-name"
                      value={filter.name}
                      maxLength={MAX_FILTER_NAME}
                      disabled={disabled}
                      onChange={(event) => updateFilter(index, { name: event.target.value })}
                      className={INPUT}
                    />
                  </label>

                  <div className="mt-2 min-w-0">
                    <span className="block text-[11px] text-muted">{t.productPageFilterId}</span>
                    <code
                      data-testid="product-page-filter-id"
                      className="mt-1 block truncate font-mono text-[11px] text-muted"
                    >
                      {filter.id || "—"}
                    </code>
                    <span className="mt-1 block text-[11px] text-muted">{t.productPageIdHint}</span>
                  </div>

                  {/* Inline products for THIS filter (category === filter.id). */}
                  <div className={PRODUCTS_BOX} data-testid="product-page-products">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-medium text-muted">
                        {t.productPageProducts}
                      </span>
                      <span
                        className="text-[11px] text-muted"
                        data-testid="product-page-product-count"
                      >
                        {t.productPageProductCount(groupPosts.length)}
                      </span>
                      <button
                        type="button"
                        data-testid="product-page-product-add"
                        disabled={rowsDisabled}
                        onClick={() => startNew(filter.id)}
                        className={`ml-auto ${ADD_PRODUCT_BUTTON}`}
                      >
                        + {t.productPageAddProduct}
                      </button>
                    </div>

                    {groupPosts.length === 0 ? (
                      <p
                        className="mt-1 text-[11px] text-muted"
                        data-testid="product-page-products-empty"
                      >
                        {t.productPageProductsEmpty}
                      </p>
                    ) : (
                      <ul className="mt-1 space-y-1" data-testid="product-page-product-list">
                        {groupPosts.map((post, postIndex) => (
                          <ProductRow
                            key={post.idx}
                            t={boardsT}
                            post={post}
                            status={rowStatus[post.idx] ?? "idle"}
                            disabled={rowsDisabled}
                            canMoveUp={postIndex > 0}
                            canMoveDown={postIndex < groupPosts.length - 1}
                            onMoveUp={() => move(filter.id, postIndex, "up")}
                            onMoveDown={() => move(filter.id, postIndex, "down")}
                            onEdit={() => {
                              setActionError(null);
                              setNewCategory(undefined);
                              setEditing(post);
                            }}
                            onDelete={() => {
                              if (window.confirm(boardsT.deleteConfirm(post.title || post.idx))) {
                                void run(
                                  { action: "delete", slug: boardSlug, locale: lang, idx: post.idx },
                                  post.idx,
                                );
                              }
                            }}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="product-page-filter-add"
              disabled={disabled || atMax}
              onClick={addFilter}
              className={ADD_BUTTON}
            >
              + {t.productPageAdd}
            </button>
            <span className="text-[11px] text-muted">
              {atMax ? t.productPageMaxHint(MAX_FILTERS) : t.productPageHint}
            </span>
          </div>
        </div>
      </div>

      {editingPost ? (
        <ProductEditDialog
          key={dialogKey}
          t={boardsT}
          title={editing === "new" ? boardsT.newPost : boardsT.editPost(editingPost.idx)}
          post={editingPost}
          filters={page.filters}
          locale={lang}
          disabled={disabled}
          busy={busy}
          error={actionError}
          onCreateCategory={handleCreateCategory}
          onSave={(next) => {
            const base = boardPosts ?? [];
            if (editing === "new") {
              void run(
                { action: "replace", slug: boardSlug, locale: lang, posts: [...base, next] },
                next.idx,
              );
            } else {
              void run(
                { action: "update", slug: boardSlug, locale: lang, idx: next.idx, patch: next },
                next.idx,
              );
            }
          }}
          onCancel={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
