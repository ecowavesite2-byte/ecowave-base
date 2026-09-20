"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { BoardContent, BoardPost } from "@/lib/types";
import { localeHref, type Locale } from "@/lib/i18n";
import { routeForBoard } from "@/lib/routes";
import { Field, TextArea, TextInput } from "../editor/WidgetFields";

type SaveStatus = "idle" | "saving" | "saved" | "error";
type BannerTone = "info" | "warn" | "error";

interface Banner {
  tone: BannerTone;
  text: string;
  issues?: string[];
}

interface PostPatch {
  title?: string;
  category?: string;
  excerpt?: string;
  date?: string | null;
  isNotice?: boolean;
  thumb?: string | null;
  content?: string;
}

const BANNER_CLASS: Record<BannerTone, string> = {
  info: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warn: "border-amber-300 bg-amber-50 text-amber-900",
  error: "border-red-200 bg-red-50 text-red-800",
};

/**
 * Local mirror of `lib/content/mutate.ts#updateBoardPost`: patch ONLY the target
 * post. We do not import mutate.ts here because it pulls `sanitize-html` into
 * the client bundle; the server's PUT handler sanitizes `content` on save.
 */
function patchPost(board: BoardContent, idx: string, patch: PostPatch): BoardContent {
  const next = structuredClone(board);
  const post = next.posts.find((candidate) => candidate.idx === idx);
  if (!post) return next;
  if (patch.title !== undefined) post.title = patch.title;
  if (patch.category !== undefined) post.category = patch.category;
  if (patch.excerpt !== undefined) post.excerpt = patch.excerpt;
  if (patch.date !== undefined) post.date = patch.date;
  if (patch.isNotice !== undefined) post.isNotice = patch.isNotice;
  if (patch.thumb !== undefined) post.thumb = patch.thumb;
  if (patch.content !== undefined) post.content = patch.content;
  return next;
}

function issueMessages(issues: unknown): string[] {
  if (!Array.isArray(issues)) return [];
  return issues.map((issue) => {
    if (issue && typeof issue === "object" && "message" in issue) {
      return String((issue as { message: unknown }).message);
    }
    return String(issue);
  });
}

export default function PostEditor({
  board,
  idx,
  slug,
  locale,
  hash: initialHash,
  label,
  isProduct,
}: {
  board: BoardContent;
  idx: string;
  slug: string;
  locale: Locale;
  hash: string;
  label: string;
  isProduct: boolean;
}) {
  const [current, setCurrent] = useState<BoardContent>(board);
  const [hash, setHash] = useState(initialHash);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [banner, setBanner] = useState<Banner | null>(null);

  const post = current.posts.find((candidate) => candidate.idx === idx) ?? null;

  useEffect(() => {
    if (banner?.tone !== "info") return;
    const timer = setTimeout(() => setBanner(null), 2500);
    return () => clearTimeout(timer);
  }, [banner]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function patch(fields: PostPatch) {
    setCurrent((previous) => patchPost(previous, idx, fields));
    setDirty(true);
    setStatus("idle");
    setBanner(null);
  }

  async function save() {
    setStatus("saving");
    setBanner(null);
    try {
      const response = await fetch("/api/admin/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "board", locale, key: slug, content: current, hash }),
      });

      if (response.ok) {
        const data = (await response.json()) as { hash: string };
        setHash(data.hash);
        setDirty(false);
        setStatus("saved");
        setBanner({ tone: "info", text: "Saved" });
        return;
      }

      if (response.status === 409) {
        setStatus("error");
        setBanner({
          tone: "warn",
          text: "Someone changed this board — reload to get the latest version.",
        });
        return;
      }

      if (response.status === 400) {
        const data = (await response.json().catch(() => ({}))) as { issues?: unknown };
        setStatus("error");
        setBanner({ tone: "error", text: "Validation failed.", issues: issueMessages(data.issues) });
        return;
      }

      setStatus("error");
      setBanner({ tone: "error", text: `Save failed (HTTP ${response.status}).` });
    } catch {
      setStatus("error");
      setBanner({ tone: "error", text: "Network error while saving. Retry when back online." });
    }
  }

  async function revert() {
    if (dirty && !window.confirm("Discard all unsaved changes and reload the saved post?")) return;
    setStatus("saving");
    setBanner(null);
    try {
      const response = await fetch(
        `/api/admin/content?kind=board&locale=${locale}&key=${encodeURIComponent(slug)}`,
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as { content: BoardContent; hash: string };
      setCurrent(data.content);
      setHash(data.hash);
      setDirty(false);
      setStatus("idle");
      setBanner({ tone: "info", text: "Reverted to the last saved version." });
    } catch {
      setStatus("error");
      setBanner({ tone: "error", text: "Could not reload the board." });
    }
  }

  const statusText =
    status === "saving"
      ? "Saving…"
      : status === "error"
        ? "Save failed"
        : status === "saved"
          ? "Saved"
          : dirty
            ? "Unsaved changes"
            : "Up to date";

  if (!post) {
    return (
      <div className="mx-auto max-w-[860px] p-8">
        <p className="rounded-lg border border-line bg-white p-6 text-[14px] text-[#6b7280]">
          Post <span className="font-mono">{idx}</span> is no longer in this board.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[860px] p-8">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <Link
            href={`/admin/boards/${slug}?locale=${locale}`}
            className="text-[12px] text-[#6b7280] transition-colors hover:text-accent"
          >
            ← {label}
          </Link>
          <h1 className="mt-1 truncate text-[20px] font-bold tracking-tight text-ink">
            {post.title || "(untitled)"}
          </h1>
          <p className="mt-0.5 font-mono text-[11px] text-[#6b7280]">
            idx {post.idx} · views {post.views ?? "—"} · files {post.files?.length ?? 0}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href={localeHref(locale, `${routeForBoard(slug)}/${idx}`)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] text-[#6b7280] transition-colors hover:text-accent"
          >
            View on site ↗
          </Link>
          <span className={`text-[12px] ${status === "error" ? "text-red-600" : "text-[#6b7280]"}`}>
            {statusText}
          </span>
          <button
            type="button"
            onClick={revert}
            disabled={status === "saving"}
            className="rounded-md border border-line px-2.5 py-1.5 text-[12px] text-ink transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            Revert
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || status === "saving"}
            className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-[#2f5ac7] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "saving" ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {banner ? (
        <div
          className={`mt-4 rounded-md border px-3 py-2 text-[12px] ${BANNER_CLASS[banner.tone]}`}
          role="status"
        >
          <span>{banner.text}</span>
          {banner.issues && banner.issues.length > 0 ? (
            <ul className="mt-1 list-disc pl-5">
              {banner.issues.slice(0, 6).map((issue, index) => (
                <li key={index}>{issue}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 space-y-4 rounded-lg border border-line bg-white p-5">
        <Field label="Title">
          <TextInput value={post.title} onChange={(value) => patch({ title: value })} />
        </Field>

        <div className={`grid gap-4 ${isProduct ? "sm:grid-cols-2" : ""}`}>
          <Field label="Date" hint="YYYY-MM-DD · empty = none">
            <TextInput
              mono
              value={post.date ?? ""}
              placeholder="YYYY-MM-DD"
              onChange={(value) => patch({ date: value.trim() === "" ? null : value })}
            />
          </Field>
          {isProduct ? (
            <Field label="Category">
              <TextInput
                value={post.category ?? ""}
                onChange={(value) => patch({ category: value })}
              />
            </Field>
          ) : null}
        </div>

        <Field label="Excerpt">
          <TextArea
            mono={false}
            rows={3}
            value={post.excerpt}
            onChange={(value) => patch({ excerpt: value })}
          />
        </Field>

        <Field label="Thumbnail" hint="root-relative /images/… path">
          <TextInput
            mono
            value={post.thumb ?? ""}
            placeholder="/images/…"
            onChange={(value) => patch({ thumb: value.trim() === "" ? null : value })}
          />
        </Field>
        <p className="text-[11px] text-[#6b7280]">
          Enter a path directly; the media library picker arrives in Phase 6.
        </p>

        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink">
          <input
            type="checkbox"
            checked={post.isNotice}
            onChange={(event) => patch({ isNotice: event.target.checked })}
            className="h-4 w-4 accent-[#3465de]"
          />
          Pin as notice
        </label>

        <Field label="Body HTML" hint="sanitized on save">
          <TextArea
            mono
            rows={16}
            value={post.content ?? ""}
            onChange={(value) => patch({ content: value })}
          />
        </Field>
        <p className="text-[11px] text-[#6b7280]">
          Raw HTML is saved through the board sanitizer (allowed tags, styles and schemes only).
        </p>
      </div>
    </div>
  );
}
