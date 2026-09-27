"use client";

import { useRef, useState } from "react";

import type { AdminDict } from "@/lib/admin/i18n";
import { Field, TextInput } from "../registry/fields";

/**
 * Thumbnail control for the News & Notices post form: a URL input (unchanged)
 * plus real image upload, a live preview and a clear button — the same control
 * pattern (and the same `/api/admin/registry/upload` endpoint) as the registry
 * `ImageControl`, using the board editor's own dictionary.
 */

const UPLOAD_BUTTON =
  "inline-flex h-9 shrink-0 cursor-pointer items-center rounded-md border border-line bg-white px-2.5 text-[12px] text-ink transition-colors hover:border-accent hover:text-accent";
const CLEAR_BUTTON =
  "shrink-0 rounded-md border border-line px-2.5 py-1 text-[11px] text-ink/70 transition-colors hover:border-accent hover:text-accent disabled:opacity-50";
const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

export default function ThumbnailField({
  t,
  value,
  disabled,
  onChange,
}: {
  t: AdminDict["boards"];
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    setUploadError(false);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/admin/registry/upload", { method: "POST", body: form });
      const data = (await response.json().catch(() => ({}))) as { url?: unknown };
      if (!response.ok || typeof data.url !== "string") {
        setUploadError(true);
        return;
      }
      onChange(data.url);
    } catch {
      setUploadError(true);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div>
      <Field label={t.form.thumbnail} hint={t.form.thumbnailHint}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <TextInput
              value={value}
              onChange={onChange}
              mono
              placeholder={t.form.thumbnailPlaceholder}
            />
          </div>
          <label
            className={`${UPLOAD_BUTTON} ${disabled || uploading ? "pointer-events-none opacity-50" : ""}`}
          >
            {uploading ? t.form.thumbnailUploading : t.form.thumbnailUpload}
            <input
              ref={fileRef}
              type="file"
              accept={IMAGE_ACCEPT}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />
          </label>
        </div>
      </Field>

      {uploadError ? (
        <p className="mt-1 text-[11px] text-red-600">{t.form.thumbnailUploadFailed}</p>
      ) : null}

      {value ? (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="" className="max-h-16 w-full object-contain" />
          </div>
          <span className="text-[11px] text-[#6b7280]">{t.form.thumbnailPreview}</span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange("")}
            className={CLEAR_BUTTON}
          >
            {t.form.thumbnailClear}
          </button>
        </div>
      ) : null}
    </div>
  );
}
