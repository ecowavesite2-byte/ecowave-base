"use client";

import { useRef, useState } from "react";
import type { AdminDict } from "@/lib/admin/i18n";
import { Field, TextInput } from "../registry/fields";
import {
  formToPost,
  formatFileSize,
  imageTag,
  insertHtmlAtCaret,
  toPostForm,
  type PostAttachment,
  type PostForm as PostFormShape,
} from "@/lib/content/board-form";
import { MIME_EXTENSIONS, MAX_UPLOAD_BYTES, extensionOf } from "@/lib/content/upload-name";
import type { BoardPost } from "@/lib/types";

/**
 * Inline create/edit form for one board post: metadata, HTML body with
 * caret-aware image insertion, and multi-attachment (image + PDF) uploads.
 * Mirrors the MCell board form while preserving ecowave's extra fields.
 */

const SAVE_BUTTON =
  "rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50";
const CANCEL_BUTTON =
  "rounded-md border border-line px-3 py-1.5 text-[12px] text-ink transition-colors hover:border-accent hover:text-accent";
const UPLOAD_BUTTON =
  "inline-flex h-9 shrink-0 cursor-pointer items-center rounded-md border border-line bg-white px-2.5 text-[12px] text-ink transition-colors hover:border-accent hover:text-accent";
const UPLOAD_BUSY = "pointer-events-none opacity-50";

const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/svg+xml";
const ATTACHMENT_ACCEPT = `${IMAGE_ACCEPT},application/pdf`;

/** Allowed type + size check, matching the server's `validateUploadName` rules. */
function isAllowedFile(file: File): boolean {
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) return false;
  const allowed = MIME_EXTENSIONS[file.type.toLowerCase()];
  const ext = extensionOf(file.name);
  return Boolean(allowed && ext && allowed.includes(ext));
}

/** POST one file to the shared admin upload endpoint; returns its public URL. */
async function uploadFileToServer(
  file: File,
  uploadFailed: (status: number) => string,
): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/admin/registry/upload", { method: "POST", body: form });
  const data = (await response.json().catch(() => ({}))) as { url?: unknown; error?: unknown };
  if (!response.ok || typeof data.url !== "string") {
    throw new Error(
      typeof data.error === "string" ? data.error : uploadFailed(response.status),
    );
  }
  return data.url;
}

export default function PostForm({
  t,
  post,
  isProduct,
  disabled,
  busy,
  onSave,
  onCancel,
}: {
  t: AdminDict["boards"];
  post: BoardPost;
  isProduct: boolean;
  disabled: boolean;
  busy: boolean;
  onSave: (post: BoardPost) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<PostFormShape>(() => toPostForm(post));
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  function set<K extends keyof PostFormShape>(key: K, value: PostFormShape[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleUploadError(err: unknown) {
    setUploadError(err instanceof Error ? err.message : "Upload failed.");
  }

  async function handleImagePicked(file: File) {
    setUploadError(null);
    setUploading(true);
    try {
      const url = await uploadFileToServer(file, t.uploadFailed);
      const textarea = bodyRef.current;
      const current = textarea ? textarea.value : form.content;
      const start = textarea?.selectionStart ?? current.length;
      const end = textarea?.selectionEnd ?? start;
      const { value, caret } = insertHtmlAtCaret(current, imageTag(url), start, end);
      set("content", value);
      requestAnimationFrame(() => {
        if (!textarea) return;
        textarea.focus();
        textarea.setSelectionRange(caret, caret);
      });
    } catch (err) {
      handleUploadError(err);
    } finally {
      setUploading(false);
    }
  }

  async function handleAttachmentsPicked(files: FileList) {
    setUploadError(null);
    setUploading(true);
    const added: PostAttachment[] = [];
    let lastError: string | null = null;
    for (const file of Array.from(files)) {
      if (!isAllowedFile(file)) {
        lastError = t.unsupportedFile(file.name, MAX_UPLOAD_BYTES / 1024 / 1024);
        continue;
      }
      try {
        const url = await uploadFileToServer(file, t.uploadFailed);
        added.push({ name: file.name, href: url, size: file.size });
      } catch (err) {
        lastError = `${file.name}: ${err instanceof Error ? err.message : "upload failed"}`;
        break;
      }
    }
    if (added.length > 0) setForm((prev) => ({ ...prev, files: [...prev.files, ...added] }));
    setUploadError(lastError);
    setUploading(false);
  }

  function removeAttachment(index: number) {
    setForm((prev) => ({ ...prev, files: prev.files.filter((_, i) => i !== index) }));
  }

  const locked = disabled || busy;

  return (
    <form
      className="mt-4 space-y-3 rounded-lg border border-line bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(formToPost(form, post));
      }}
    >
      <Field label={t.form.title}>
        <TextInput value={form.title} onChange={(value) => set("title", value)} />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {isProduct ? (
          <Field label={t.form.category}>
            <TextInput value={form.category} onChange={(value) => set("category", value)} />
          </Field>
        ) : null}
        <Field label={t.form.date} hint={t.form.dateHint}>
          <TextInput value={form.date} onChange={(value) => set("date", value)} />
        </Field>
      </div>

      <Field label={t.form.thumbnail} hint={t.form.thumbnailHint}>
        <TextInput
          value={form.thumb}
          onChange={(value) => set("thumb", value)}
          mono
          placeholder={t.form.thumbnailPlaceholder}
        />
      </Field>

      <Field label={t.form.excerpt}>
        <TextInput value={form.excerpt} onChange={(value) => set("excerpt", value)} />
      </Field>

      <Field label={t.form.content} hint={t.form.contentHint}>
        <textarea
          ref={bodyRef}
          value={form.content}
          rows={10}
          placeholder={t.form.contentPlaceholder}
          onChange={(event) => set("content", event.target.value)}
          className="min-h-[180px] w-full resize-y rounded-md border border-line bg-white px-2.5 py-2 font-mono text-[12px] leading-relaxed text-ink outline-none transition-colors placeholder:text-[#9ca3af] focus:border-accent focus:ring-2 focus:ring-accent/25"
        />
      </Field>

      <div className="flex items-center gap-2">
        <label
          className={`${UPLOAD_BUTTON} ${locked || uploading ? UPLOAD_BUSY : ""}`}
          title={t.form.insertImageTitle}
        >
          {uploading ? t.uploading : t.form.insertImage}
          <input
            type="file"
            accept={IMAGE_ACCEPT}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (event.target) event.target.value = "";
              if (file) void handleImagePicked(file);
            }}
          />
        </label>
        <span className="text-[11px] text-[#6b7280]">{t.form.insertImageHint}</span>
      </div>

      {uploadError ? <p className="text-[12px] text-red-600">{uploadError}</p> : null}

      <div className="space-y-2 rounded-md border border-line bg-[#fafafa] p-3">
        <p className="text-[12px] font-medium text-ink">{t.form.attachments}</p>
        {form.files.length === 0 ? (
          <p className="text-[12px] text-[#6b7280]">{t.form.noAttachments}</p>
        ) : (
          <ul className="space-y-1">
            {form.files.map((file, index) => (
              <li key={`${file.href}-${index}`} className="flex items-center gap-2">
                <span aria-hidden className="text-[13px]">
                  📎
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink">
                  {file.name}
                  {typeof file.size === "number" ? (
                    <span className="ml-1 text-[11px] text-[#6b7280]">
                      ({formatFileSize(file.size)})
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachment(index)}
                  disabled={locked}
                  aria-label={t.removeAttachment(file.name)}
                  className="shrink-0 rounded-md border border-line px-2 py-0.5 text-[11px] text-ink/70 transition-colors hover:border-red-400 hover:text-red-600 disabled:opacity-50"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <label
          className={`${UPLOAD_BUTTON} ${locked || uploading ? UPLOAD_BUSY : ""}`}
          title={t.form.addFilesTitle}
        >
          {uploading ? t.uploading : t.form.addFiles}
          <input
            type="file"
            accept={ATTACHMENT_ACCEPT}
            multiple
            className="hidden"
            onChange={(event) => {
              const files = event.target.files;
              if (event.target) event.target.value = "";
              if (files && files.length > 0) void handleAttachmentsPicked(files);
            }}
          />
        </label>
        <span className="ml-2 text-[11px] text-[#6b7280]">{t.form.addFilesHint}</span>
      </div>

      <label className="flex items-center gap-2 text-[12px] text-ink">
        <input
          type="checkbox"
          checked={form.isNotice}
          disabled={locked}
          onChange={(event) => set("isNotice", event.target.checked)}
          className="h-4 w-4 rounded border-line accent-accent"
        />
        {t.form.pinnedNotice}
      </label>

      <div className="flex gap-2 pt-1">
        <button type="submit" className={SAVE_BUTTON} disabled={locked || uploading}>
          {busy ? t.form.saving : t.form.save}
        </button>
        <button type="button" className={CANCEL_BUTTON} onClick={onCancel} disabled={busy}>
          {t.form.cancel}
        </button>
      </div>
    </form>
  );
}

// `blankPost` lives in `lib/content/board-form`; callers build an empty post there.
