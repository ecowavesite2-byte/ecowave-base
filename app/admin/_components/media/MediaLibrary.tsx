"use client";

import { useEffect, useRef, useState } from "react";
import type { MediaEntryView } from "@/lib/media/index";

/** Media library: upload queue (3 parallel), filters, grid, detail drawer. */

const MAX_PARALLEL = 3;
const ACCEPT = "image/png,image/jpeg,image/webp";

type UploadStatus = "queued" | "uploading" | "done" | "error";

interface UploadItem {
  id: string;
  file: File;
  progress: number;
  status: UploadStatus;
  error?: string;
}

type Filter = "all" | "missing-alt" | "unused";

interface Notice {
  tone: "info" | "error";
  text: string;
}

function mediaHref(relPath: string): string {
  return "/media/" + relPath.split("/").map(encodeURIComponent).join("/");
}

function suggestAlt(name: string | undefined): string {
  if (!name) return "";
  return name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildEntry(record: Record<string, unknown>): MediaEntryView {
  return {
    path: String(record.path ?? ""),
    url: String(record.url ?? ""),
    alt: String(record.alt ?? ""),
    width: Number(record.width ?? 0),
    height: Number(record.height ?? 0),
    size: Number(record.size ?? 0),
    format: String(record.format ?? "webp"),
    crops: (record.crops as Record<string, string>) ?? {},
    uploadedAt: String(record.uploadedAt ?? new Date().toISOString()),
    usage: [],
  };
}

function postUpload(
  file: File,
  replacePath: string | null,
  onProgress: (progress: number) => void,
): Promise<MediaEntryView> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/upload");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.onload = () => {
      let data: unknown = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && data && typeof data === "object") {
        resolve(buildEntry(data as Record<string, unknown>));
        return;
      }
      const message =
        data && typeof data === "object" && "error" in data
          ? String((data as { error: unknown }).error)
          : `Upload failed (HTTP ${xhr.status})`;
      reject(new Error(message));
    };
    const form = new FormData();
    form.append("file", file);
    if (replacePath) form.append("replace", replacePath);
    xhr.send(form);
  });
}

export default function MediaLibrary({ initialEntries }: { initialEntries: MediaEntryView[] }) {
  const [entries, setEntries] = useState<MediaEntryView[]>(initialEntries);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [altDraft, setAltDraft] = useState("");
  const [savingAlt, setSavingAlt] = useState(false);
  const [cropping, setCropping] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [nameHints, setNameHints] = useState<Record<string, string>>({});

  const [items, setItems] = useState<UploadItem[]>([]);
  const queueRef = useRef<UploadItem[]>([]);
  const runningRef = useRef(0);
  const idRef = useRef(0);
  const replaceRef = useRef<HTMLInputElement>(null);

  const selected = entries.find((entry) => entry.path === selectedPath) ?? null;

  useEffect(() => {
    if (!selected) {
      setAltDraft("");
      return;
    }
    setAltDraft(selected.alt || suggestAlt(nameHints[selected.path]));
  }, [selected, nameHints]);

  function syncItems() {
    setItems(queueRef.current.map((item) => ({ ...item })));
  }

  async function runUpload(item: UploadItem) {
    try {
      const result = await postUpload(item.file, null, (progress) => {
        item.progress = progress;
        syncItems();
      });
      item.status = "done";
      item.progress = 100;
      setNameHints((hints) => ({ ...hints, [result.path]: item.file.name }));
      setEntries((prev) => [result, ...prev.filter((entry) => entry.path !== result.path)]);
      setSelectedPath((current) => current ?? result.path);
    } catch (error) {
      item.status = "error";
      item.error = error instanceof Error ? error.message : String(error);
    } finally {
      runningRef.current -= 1;
      syncItems();
      pump();
    }
  }

  function pump() {
    while (runningRef.current < MAX_PARALLEL) {
      const item = queueRef.current.find((candidate) => candidate.status === "queued");
      if (!item) return;
      item.status = "uploading";
      item.progress = 0;
      item.error = undefined;
      runningRef.current += 1;
      syncItems();
      void runUpload(item);
    }
  }

  function enqueue(files: File[]) {
    if (files.length === 0) return;
    for (const file of files) {
      queueRef.current.push({ id: `u${++idRef.current}`, file, progress: 0, status: "queued" });
    }
    syncItems();
    pump();
  }

  function retry(id: string) {
    const item = queueRef.current.find((candidate) => candidate.id === id);
    if (!item) return;
    item.status = "queued";
    item.progress = 0;
    item.error = undefined;
    syncItems();
    pump();
  }

  async function saveAlt() {
    if (!selected) return;
    setSavingAlt(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: selected.path, alt: altDraft }),
      });
      if (!response.ok) throw new Error("Could not save alt text");
      setEntries((prev) =>
        prev.map((entry) => (entry.path === selected.path ? { ...entry, alt: altDraft } : entry)),
      );
      setNotice({ tone: "info", text: "Alt text saved" });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Save failed" });
    } finally {
      setSavingAlt(false);
    }
  }

  async function generateCrops() {
    if (!selected) return;
    setCropping(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/media/crop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: selected.path }),
      });
      const data = (await response.json()) as { crops?: Record<string, string>; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not generate crops");
      setEntries((prev) =>
        prev.map((entry) =>
          entry.path === selected.path ? { ...entry, crops: data.crops ?? entry.crops } : entry,
        ),
      );
      setNotice({ tone: "info", text: "Crops generated" });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Crop failed" });
    } finally {
      setCropping(false);
    }
  }

  async function deleteSelected() {
    if (!selected || selected.usage.length > 0) return;
    if (!window.confirm("Delete this media file? This cannot be undone.")) return;
    setDeleting(true);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/admin/media?path=${encodeURIComponent(selected.path)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Delete failed");
      }
      setEntries((prev) => prev.filter((entry) => entry.path !== selected.path));
      setSelectedPath(null);
      setNotice({ tone: "info", text: "Deleted" });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Delete failed" });
    } finally {
      setDeleting(false);
    }
  }

  async function replaceSelected(file: File) {
    if (!selected) return;
    setReplacing(true);
    setNotice(null);
    try {
      const result = await postUpload(file, selected.path, () => {});
      setEntries((prev) => [result, ...prev]);
      setSelectedPath(result.path);
      setNotice({ tone: "info", text: "Replaced (old file kept)" });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Replace failed" });
    } finally {
      setReplacing(false);
    }
  }

  const filtered = entries.filter((entry) => {
    if (filter === "missing-alt") return !entry.alt.trim();
    if (filter === "unused") return entry.usage.length === 0;
    return true;
  });

  const activeUploads = items.filter((item) => item.status === "uploading").length;

  return (
    <div className="mx-auto max-w-[1200px] p-8">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold tracking-tight text-ink">Media</h1>
          <p className="mt-0.5 text-[13px] text-[#6b7280]">
            {entries.length} files · {entries.filter((e) => e.usage.length === 0).length} unused ·{" "}
            {entries.filter((e) => !e.alt.trim()).length} missing alt
          </p>
        </div>
        <div className="ml-auto flex rounded-md border border-line bg-white p-0.5">
          {(
            [
              ["all", "All"],
              ["missing-alt", "Missing alt"],
              ["unused", "Unused only"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded px-3 py-1 text-[12px] font-medium transition-colors ${
                filter === value ? "bg-accent text-white" : "text-[#6b7280] hover:text-accent"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          enqueue(Array.from(event.dataTransfer.files));
        }}
        className={`mt-6 rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
          dragOver ? "border-accent bg-accent/5" : "border-line bg-white"
        }`}
      >
        <input
          id="media-file-input"
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files) enqueue(Array.from(event.target.files));
            event.target.value = "";
          }}
        />
        <label htmlFor="media-file-input" className="cursor-pointer text-[13px] text-[#6b7280]">
          Drop PNG / JPEG / WebP here or{" "}
          <span className="font-medium text-accent">choose files</span> (max 8 MB each)
        </label>
        {activeUploads > 0 ? (
          <p className="mt-1 text-[11px] text-[#6b7280]">{activeUploads} uploading…</p>
        ) : null}
      </div>

      {items.length > 0 ? (
        <div className="mt-4 space-y-1.5">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-md border border-line bg-white px-3 py-2"
            >
              <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{item.file.name}</span>
              <span className="w-[120px] shrink-0">
                <span className="block h-1.5 w-full overflow-hidden rounded-full bg-[#e5e7eb]">
                  <span
                    className={`block h-full rounded-full ${
                      item.status === "error" ? "bg-red-400" : "bg-accent"
                    }`}
                    style={{ width: `${item.progress}%` }}
                  />
                </span>
              </span>
              <span className="w-[90px] shrink-0 text-right text-[11px] text-[#6b7280]">
                {item.status === "done" ? "done" : item.status === "error" ? item.error : `${item.progress}%`}
              </span>
              {item.status === "error" ? (
                <button
                  type="button"
                  onClick={() => retry(item.id)}
                  className="shrink-0 rounded-md border border-line px-2 py-0.5 text-[11px] text-ink transition-colors hover:border-accent hover:text-accent"
                >
                  Retry
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {notice ? (
        <p
          className={`mt-4 rounded-md border px-3 py-2 text-[12px] ${
            notice.tone === "error"
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
          role="status"
        >
          {notice.text}
        </p>
      ) : null}

      <div className="mt-6 flex gap-5">
        <div className="min-w-0 flex-1">
          {filtered.length === 0 ? (
            <p className="rounded-lg border border-line bg-white px-4 py-10 text-center text-[13px] text-[#6b7280]">
              No media matches this filter.
            </p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
              {filtered.map((entry) => (
                <button
                  key={entry.path}
                  type="button"
                  onClick={() => setSelectedPath(entry.path)}
                  className={`overflow-hidden rounded-lg border bg-white text-left transition-colors ${
                    entry.path === selectedPath
                      ? "border-accent"
                      : "border-line hover:border-accent/50"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={entry.url}
                    alt={entry.alt}
                    className="h-[110px] w-full bg-[#f4f5f7] object-cover"
                  />
                  <span className="block px-2 py-1.5">
                    <span className="block truncate font-mono text-[11px] text-ink" title={entry.path}>
                      {entry.path}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[#6b7280]">
                      <span>
                        {entry.width}×{entry.height}
                      </span>
                      <span>{entry.format}</span>
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1">
                      <span className="rounded-full bg-[#f3f4f6] px-1.5 py-0.5 text-[10px] text-[#4b5563]">
                        used ×{entry.usage.length}
                      </span>
                      {!entry.alt.trim() ? (
                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">
                          needs alt
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {selected ? (
          <aside className="w-[360px] shrink-0 rounded-lg border border-line bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-[13px] font-semibold text-ink">Details</h2>
              <button
                type="button"
                onClick={() => setSelectedPath(null)}
                className="text-[12px] text-[#6b7280] hover:text-accent"
              >
                Close
              </button>
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selected.url}
              alt={selected.alt || selected.path}
              className="mt-3 max-h-[220px] w-full rounded-md bg-[#f4f5f7] object-contain"
            />

            <p className="mt-2 font-mono text-[11px] break-all text-[#6b7280]">{selected.path}</p>
            <p className="mt-1 text-[11px] text-[#6b7280]">
              {selected.width}×{selected.height} · {selected.format} · {formatBytes(selected.size)}
            </p>

            <label className="mt-3 block text-[12px] font-medium text-ink">
              Alt text
              <textarea
                value={altDraft}
                rows={2}
                onChange={(event) => setAltDraft(event.target.value)}
                className="mt-1 w-full resize-y rounded-md border border-line bg-white px-2 py-1.5 text-[12px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
              />
            </label>
            {!selected.alt.trim() ? (
              <p className="mt-1 text-[11px] text-amber-700">
                Suggested from the filename — needs review.
              </p>
            ) : null}
            <button
              type="button"
              onClick={saveAlt}
              disabled={savingAlt}
              className="mt-2 rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-[#2f5ac7] disabled:opacity-60"
            >
              {savingAlt ? "Saving…" : "Save alt"}
            </button>

            <div className="mt-4 border-t border-line pt-3">
              <h3 className="text-[12px] font-semibold text-ink">Usage ({selected.usage.length})</h3>
              {selected.usage.length === 0 ? (
                <p className="mt-1 text-[11px] text-[#6b7280]">Not referenced by any content.</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {selected.usage.map((ref) => (
                    <li key={ref.file} className="text-[11px] text-[#6b7280]">
                      <span className="font-mono text-ink">{ref.file}</span>
                      {ref.widgets.length > 0 ? ` · ${ref.widgets.join(", ")}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-4 border-t border-line pt-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[12px] font-semibold text-ink">Crops</h3>
                <button
                  type="button"
                  onClick={generateCrops}
                  disabled={cropping}
                  className="rounded-md border border-line px-2 py-1 text-[11px] text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
                >
                  {cropping ? "Generating…" : "Generate crops"}
                </button>
              </div>
              {Object.keys(selected.crops).length === 0 ? (
                <p className="mt-1 text-[11px] text-[#6b7280]">
                  No crops yet. Generates 1:1, 3:4, 16:9, Card 320×213 and Hero 1280×640 siblings.
                </p>
              ) : (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {Object.entries(selected.crops).map(([name, cropPath]) => (
                    <figure key={name} className="text-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={mediaHref(cropPath)}
                        alt={name}
                        className="h-[60px] w-full rounded border border-line bg-[#f4f5f7] object-cover"
                      />
                      <figcaption className="mt-0.5 text-[10px] text-[#6b7280]">{name}</figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center gap-2 border-t border-line pt-3">
              <input
                ref={replaceRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void replaceSelected(file);
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => replaceRef.current?.click()}
                disabled={replacing}
                className="rounded-md border border-line px-2.5 py-1 text-[11px] text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
              >
                {replacing ? "Replacing…" : "Replace file"}
              </button>
              <button
                type="button"
                onClick={deleteSelected}
                disabled={deleting || selected.usage.length > 0}
                title={
                  selected.usage.length > 0
                    ? "Remove all references before deleting"
                    : "Delete this file"
                }
                className="ml-auto rounded-md border border-line px-2.5 py-1 text-[11px] text-ink transition-colors hover:border-red-300 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
