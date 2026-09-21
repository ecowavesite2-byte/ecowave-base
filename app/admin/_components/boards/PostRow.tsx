"use client";

import type { AdminDict } from "@/lib/admin/i18n";
import type { BoardPost } from "@/lib/types";

/** One board post as a table row (title/status/date/views/manage) with per-row feedback. */

export type RowStatus = "idle" | "saving" | "saved" | "error";

const EDIT_BUTTON =
  "rounded-md border border-line px-2.5 py-1 text-[12px] text-ink transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50";
const DELETE_BUTTON =
  "rounded-md border border-red-200 px-2.5 py-1 text-[12px] text-red-700 transition-colors hover:border-red-400 disabled:cursor-not-allowed disabled:opacity-50";

function statusText(status: RowStatus, t: AdminDict["boards"]): string | null {
  if (status === "saving") return t.saving;
  if (status === "saved") return t.saved;
  if (status === "error") return t.failed;
  return null;
}

export default function PostRow({
  t,
  post,
  status,
  disabled,
  onEdit,
  onDelete,
}: {
  t: AdminDict["boards"];
  post: BoardPost;
  status: RowStatus;
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const notice = post.isNotice;
  const feedback = statusText(status, t);

  return (
    <tr className="border-b border-line last:border-0 align-top">
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
