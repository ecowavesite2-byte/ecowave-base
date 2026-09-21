"use client";

import { useRef, useState, type ReactNode } from "react";
import { Field, ReadOnlyNotice, TextArea, TextInput } from "./fields";
import type { RegistryDef, RegistryLocale, SaveStatus } from "./types";

/** One editable registry field: label, kind-appropriate control, save/revert. */

const EDITABLE_KINDS = new Set(["text", "textarea", "image", "url"]);

const SAVE_BUTTON =
  "rounded-md bg-accent px-2.5 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50";
const REVERT_BUTTON =
  "rounded-md border border-line px-2.5 py-1.5 text-[12px] text-ink transition-colors hover:border-accent hover:text-accent";
const UPLOAD_BUTTON =
  "inline-flex h-9 shrink-0 cursor-pointer items-center rounded-md border border-line bg-white px-2.5 font-mono text-[12px] text-ink transition-colors hover:border-accent hover:text-accent";
const UPLOAD_BUSY = "pointer-events-none opacity-50";
type UploadState = "idle" | "uploading" | "success" | "error";

function statusText(status: SaveStatus, dirty: boolean): string {
  if (status === "saving") return "Saving…";
  if (status === "saved") return "Saved";
  return dirty ? "Unsaved changes" : "Up to date";
}

export default function FieldRow({
  def,
  locale,
  value,
  dirty,
  status,
  error,
  disabled,
  imageOptions,
  onChange,
  onSave,
  onRevert,
}: {
  def: RegistryDef;
  locale: RegistryLocale;
  value: string;
  dirty: boolean;
  status: SaveStatus;
  error?: string;
  disabled: boolean;
  imageOptions: string[];
  onChange: (value: string) => void;
  onSave: () => void;
  onRevert: () => void;
}) {
  const label = def.label[locale] || def.label.ko;
  const editable = EDITABLE_KINDS.has(def.kind);
  const listId = `registry-image-${def.key.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  /** Upload one image; success only sets the draft (Save still persists it). */
  async function handleFile(file: File) {
    setUploadState("uploading");
    setUploadMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/admin/registry/upload", { method: "POST", body: form });
      const data = (await response.json().catch(() => ({}))) as { url?: unknown; error?: unknown };
      if (!response.ok || typeof data.url !== "string") {
        setUploadState("error");
        setUploadMessage(
          typeof data.error === "string" ? data.error : `Upload failed (HTTP ${response.status}).`,
        );
        return;
      }
      onChange(data.url);
      setUploadState("success");
      setUploadMessage("Uploaded — press Save to store.");
    } catch {
      setUploadState("error");
      setUploadMessage("Network error. Retry when online.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleTyped(next: string) {
    onChange(next);
    if (uploadState !== "idle") {
      setUploadState("idle");
      setUploadMessage(null);
    }
  }

  let control: ReactNode;
  switch (def.kind) {
    case "text":
      control = <TextInput value={value} onChange={onChange} placeholder="Value" />;
      break;
    case "textarea":
      control = <TextArea value={value} onChange={onChange} placeholder="<p>HTML…</p>" />;
      break;
    case "image":
      control = (
        <>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <TextInput
                value={value}
                onChange={handleTyped}
                mono
                placeholder="/images/… or https://…"
                listId={listId}
              />
              <datalist id={listId}>
                {imageOptions.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </div>
            <label
              className={`${UPLOAD_BUTTON} ${disabled || uploadState === "uploading" ? UPLOAD_BUSY : ""}`}
              title={disabled ? "Database is not configured" : "Upload an image"}
            >
              {uploadState === "uploading" ? "Uploading…" : "Upload"}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleFile(file);
                }}
              />
            </label>
          </div>
          {uploadMessage ? (
            <p
              className={`mt-1 text-[11px] ${
                uploadState === "error" ? "text-red-600" : "text-emerald-600"
              }`}
            >
              {uploadMessage}
            </p>
          ) : null}
        </>
      );
      break;
    case "url":
      control = (
        <TextInput
          value={value}
          onChange={onChange}
          mono
          placeholder="/path or https://…"
        />
      );
      break;
    case "list":
      control = <ReadOnlyNotice text="Board post lists are edited in a later phase." />;
      break;
    default:
      control = <ReadOnlyNotice text={`${def.kind} fields arrive in a later phase.`} />;
      break;
  }

  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <Field label={label} hint={def.kind}>
        {control}
      </Field>

      {editable ? (
        <div className="mt-2 flex items-center gap-2">
          {error ? (
            <span className="text-[11px] text-red-600">{error}</span>
          ) : (
            <span
              className={`text-[11px] ${status === "saved" ? "text-emerald-600" : "text-[#6b7280]"}`}
            >
              {statusText(status, dirty)}
            </span>
          )}

          <div className="ml-auto flex gap-2">
            {dirty ? (
              <button type="button" onClick={onRevert} className={REVERT_BUTTON}>
                Revert
              </button>
            ) : null}
            {dirty ? (
              <button
                type="button"
                onClick={onSave}
                disabled={disabled || status === "saving"}
                title={disabled ? "Database is not configured" : undefined}
                className={SAVE_BUTTON}
              >
                Save
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
