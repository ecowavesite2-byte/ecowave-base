"use client";

import { useState } from "react";
import { localeHref, type Locale } from "@/lib/i18n";

const WIDTHS = [1440, 992, 390] as const;

/**
 * Live iframe of the public route at the site's fixed device widths.
 * "Preview draft" toggles Next's `draftMode()` for this browser session via the
 * admin draft API, then reloads the iframe so the draft-aware getters serve the
 * draft overlay (or the published page when no draft file exists).
 */
export default function PreviewPane({
  route,
  locale,
  kind,
  contentKey,
}: {
  route: string;
  locale: Locale;
  kind: "page" | "board";
  contentKey: string;
}) {
  const [width, setWidth] = useState<number>(1440);
  const [reloadKey, setReloadKey] = useState(0);
  const [draft, setDraft] = useState(false);
  const [busy, setBusy] = useState(false);
  const src = localeHref(locale, route);

  async function toggleDraft() {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/admin/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: draft ? "disable" : "enable",
          locale,
          kind,
          key: contentKey,
        }),
      });
      if (response.ok) {
        setDraft((value) => !value);
        setReloadKey((value) => value + 1);
      }
    } catch {
      // keep the current state; the toggle can be retried
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <div className="flex rounded-md border border-line p-0.5">
          {WIDTHS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setWidth(value)}
              className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                width === value ? "bg-accent text-white" : "text-[#6b7280] hover:text-accent"
              }`}
            >
              {value}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setReloadKey((value) => value + 1)}
          className="rounded-md border border-line px-2 py-1 text-[11px] text-ink transition-colors hover:border-accent hover:text-accent"
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={toggleDraft}
          disabled={busy}
          aria-pressed={draft}
          className={`rounded-md border px-2 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            draft
              ? "border-accent bg-accent/10 text-accent"
              : "border-line text-ink hover:border-accent hover:text-accent"
          }`}
        >
          {draft ? "Draft preview on" : "Preview draft"}
        </button>
        <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
          draft content
        </span>
      </div>

      <div className="min-w-0 flex-1 overflow-auto bg-[#e5e7eb] p-3">
        <div className="mx-auto" style={{ width }}>
          <iframe
            key={reloadKey}
            src={src}
            title="Page preview"
            className="h-[900px] w-full border-0 bg-white shadow-sm"
          />
        </div>
      </div>

      <p className="border-t border-line px-3 py-1.5 text-[10px] text-[#6b7280]">
        Preview draft enables draftMode() for this session; visitors always see the published page.
      </p>
    </div>
  );
}
