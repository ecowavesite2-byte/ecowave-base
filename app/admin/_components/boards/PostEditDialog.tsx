"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { AdminDict } from "@/lib/admin/i18n";
import { toPostForm, type PostForm as PostFormShape } from "@/lib/content/board-form";
import type { BoardPost, ProductFilter } from "@/lib/types";
import { ui } from "@/lib/ui-strings";
import {
  BoardCardGrid,
  BoardLineList,
  PostDetail,
  type BoardListItem,
} from "@/components/ui/Boards";
import { ScaledDesktop } from "../registry/SectionPreview";
import type { RegistryLocale } from "../registry/types";
import PostForm from "./PostForm";
import { previewThumbFromHtml } from "./product-board-form";

/**
 * Two-pane add/edit dialog for one post, shared by the product boards and the
 * news/notices editor.
 *
 * LEFT  — the shared `PostForm` (metadata, category, body, uploads) exactly as
 *         the Boards lane renders it, so behaviour and styling never drift.
 * RIGHT — a live preview driven by the form's unsaved state. The `variant` picks
 *         which look it renders:
 *   - `"product"` (default): the product grid-card item plus a detail block
 *     rendered through the real `PostDetail` — unchanged from the former
 *     `ProductEditDialog`.
 *   - `"board"` (news/notices): the public LIST look for that board
 *     (`BoardCardGrid` for news, `BoardLineList` for notices) with a single
 *     draft item, plus the same real `PostDetail` with the draft fields.
 *
 * The preview reads the draft only and never writes. Saving is explicit: the
 * form's Save routes through the caller's existing boards-API flow (no
 * autosave, nothing saved on open or close).
 *
 * Card images: the product card follows the first body image (same rule the
 * server applies on save); the news card uses the draft `thumb` verbatim, which
 * is exactly what the public `BoardCardGrid` renders (no body-image fallback for
 * news/notices).
 */

/**
 * One product card, mirroring `ProductCardGrid`'s item markup. Uses a plain
 * `<img>` (not `next/image`) so freshly uploaded body images — public blob URLs
 * — still render in the admin preview without an image-optimizer round-trip.
 */
function ProductCardPreview({ title, thumb }: { title: string; thumb: string | null }) {
  return (
    <div className="-mx-[15px] flex flex-wrap px-[5px] lg:-mx-5 lg:-mt-[5px] lg:px-0">
      <div className="w-1/2 p-[10px] lg:w-1/3 lg:p-5">
        <div className="block h-[214px] overflow-hidden border border-[#eee] bg-white lg:h-[361px]">
          <div className="relative h-[128px] w-full overflow-hidden lg:h-[294px]">
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumb}
                alt={title}
                className="h-full w-full object-cover object-center"
              />
            ) : null}
          </div>
          <div className="flex h-[84px] items-start justify-center bg-[#f7f7f7] px-5 pt-5 lg:h-[65px]">
            <h3 className="w-full truncate text-center text-[15px] font-normal leading-[20px] text-black">
              {title}
            </h3>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PostEditDialog({
  t,
  title,
  post,
  filters,
  locale,
  variant = "product",
  boardKind,
  boardHref,
  boardName,
  disabled,
  busy,
  error,
  onCreateCategory,
  onSave,
  onCancel,
}: {
  t: AdminDict["boards"];
  /** Dialog heading: new post vs edit post. */
  title: string;
  post: BoardPost;
  filters: ProductFilter[];
  locale: RegistryLocale;
  /** Which preview to render: the product card (default) or a board list row. */
  variant?: "product" | "board";
  /** Board list kind for `variant="board"`: news card vs notices line row. */
  boardKind?: "news" | "notices";
  /** Public board base href (board variant): the detail summary + list link. */
  boardHref?: string;
  /** Resolved board name shown in the `PostDetail` summary (board variant). */
  boardName?: string;
  disabled: boolean;
  busy: boolean;
  /** Last save error from the caller's boards-API flow (shown in the dialog). */
  error?: string | null;
  onCreateCategory?: (name: string) => Promise<string | null>;
  onSave: (post: BoardPost) => void;
  onCancel: () => void;
}) {
  // The form lives in `PostForm`; this is its last emitted shape, used only to
  // drive the preview. `post` is read once on mount (the caller keys the dialog
  // per post), so an unstable parent object cannot reset an in-progress edit.
  const [draft, setDraft] = useState<PostFormShape>(() => toPostForm(post));
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel]);

  const categoryName = useMemo(() => {
    const found = filters.find((filter) => filter.id === draft.category);
    return found ? found.name : draft.category;
  }, [filters, draft.category]);

  const isBoard = variant === "board";
  const cardThumb = previewThumbFromHtml(draft.content);
  const detailHref = boardHref ?? (locale === "en" ? "/en" : "/");
  const strings = ui(locale);

  // Draft views (notices rows + detail show it; products pass none).
  const rawViews = draft.views.trim() === "" ? null : Number(draft.views);
  const views = rawViews !== null && Number.isFinite(rawViews) ? rawViews : null;

  /** One draft item for the board list look (news card / notices row). */
  const listItem: BoardListItem = {
    idx: draft.idx,
    title: draft.title,
    excerpt: draft.excerpt,
    thumb: draft.thumb || null,
    isNotice: draft.isNotice,
    date: draft.date || null,
    views,
  };

  const dialog = (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        data-testid="post-edit-dialog"
        className="flex max-h-[92vh] w-full max-w-[1120px] flex-col overflow-hidden rounded-lg border border-line bg-white shadow-2xl outline-none"
      >
        <header className="flex items-center gap-3 border-b border-line px-4 py-3">
          <h2 className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink">{title}</h2>
          <button
            type="button"
            data-testid="post-edit-dialog-close"
            aria-label={t.dialog.close}
            title={t.dialog.close}
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-line px-2 py-1 text-[12px] text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            ✕
          </button>
        </header>

        {error ? (
          <p
            data-testid="post-edit-dialog-error"
            className="border-b border-red-200 bg-red-50 px-4 py-2 text-[12px] text-red-800"
          >
            {error}
          </p>
        ) : null}

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-2 lg:overflow-hidden">
          {/* LEFT — the shared form. */}
          <div className="min-w-0 lg:overflow-y-auto lg:border-r lg:border-line">
            <div className="p-4">
              <PostForm
                t={t}
                post={post}
                isProduct={!isBoard}
                filters={filters}
                disabled={disabled}
                busy={busy}
                onCreateCategory={onCreateCategory}
                onFormChange={setDraft}
                onSave={onSave}
                onCancel={onCancel}
              />
            </div>
          </div>

          {/* RIGHT — live preview, scaled from the public 1280px layout. */}
          <div
            className="min-w-0 border-t border-line bg-[#f8f9fb] lg:border-t-0 lg:overflow-y-auto"
            data-testid="post-edit-preview"
          >
            <div className="space-y-4 p-4">
              {isBoard ? (
                <>
                  <section data-testid="post-edit-preview-list">
                    <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">
                      {t.dialog.list}
                    </h3>
                    <div className="overflow-hidden rounded-md border border-black/5 bg-white">
                      <ScaledDesktop>
                        <div className="mx-auto max-w-[1280px] px-[15px] py-10">
                          {boardKind === "notices" ? (
                            <BoardLineList
                              posts={[listItem]}
                              boardHref={detailHref}
                              emptyLabel=""
                              viewsLabel={locale === "ko" ? "조회수" : "Views"}
                              titleLabel={locale === "ko" ? "제목" : "Title"}
                              dateLabel={locale === "ko" ? "작성시간" : "Date"}
                              noticeLabel={locale === "ko" ? "공지" : "Notice"}
                            />
                          ) : (
                            <BoardCardGrid
                              posts={[listItem]}
                              boardHref={detailHref}
                              emptyLabel=""
                            />
                          )}
                        </div>
                      </ScaledDesktop>
                    </div>
                  </section>

                  <section data-testid="post-edit-preview-detail">
                    <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">
                      {t.dialog.detail}
                    </h3>
                    <div className="overflow-hidden rounded-md border border-black/5 bg-white">
                      <ScaledDesktop>
                        <div className="mx-auto max-w-[1280px] px-[15px] py-10">
                          <PostDetail
                            post={{
                              idx: draft.idx,
                              title: draft.title,
                              category: draft.category || undefined,
                              isNotice: draft.isNotice,
                              date: draft.date || null,
                              views,
                              content: draft.content,
                              files: draft.files,
                            }}
                            boardHref={detailHref}
                            boardName={boardName}
                            listLabel={strings.board.list}
                          />
                        </div>
                      </ScaledDesktop>
                    </div>
                  </section>
                </>
              ) : (
                <>
                  <section data-testid="post-edit-preview-card">
                    <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">
                      {t.dialog.card}
                    </h3>
                    <div className="overflow-hidden rounded-md border border-black/5 bg-white">
                      <ScaledDesktop>
                        <div className="mx-auto max-w-[1280px] px-[15px] py-10">
                          <ProductCardPreview title={draft.title} thumb={cardThumb} />
                        </div>
                      </ScaledDesktop>
                    </div>
                  </section>

                  <section data-testid="post-edit-preview-detail">
                    <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">
                      {t.dialog.detail}
                    </h3>
                    <div className="overflow-hidden rounded-md border border-black/5 bg-white">
                      <ScaledDesktop>
                        <div className="mx-auto max-w-[1280px] px-[15px] py-10">
                          <PostDetail
                            post={{
                              idx: draft.idx,
                              title: draft.title,
                              category: categoryName || undefined,
                              isNotice: draft.isNotice,
                              date: draft.date || null,
                              views: null,
                              content: draft.content,
                              files: draft.files,
                            }}
                            boardHref={detailHref}
                            listLabel={strings.board.list}
                          />
                        </div>
                      </ScaledDesktop>
                    </div>
                  </section>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(dialog, document.body);
}
