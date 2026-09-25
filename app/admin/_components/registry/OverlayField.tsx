"use client";

import { useMemo } from "react";

import type { AdminDict } from "@/lib/admin/i18n";
import { parseOverlayAlt, serializeOverlayAlt } from "@/lib/content/overlay-alt";

/**
 * `overlay` editor — the vision card label + title.
 *
 * Storage stays the image widget's raw `alt` overlay markup: we parse it with
 * `parseOverlayAlt` and re-serialize with `serializeOverlayAlt` on every edit.
 * When a serialization returns `null` (no overlay markup, or both strings
 * emptied) we keep the existing value instead of erasing the design.
 */

const INPUT =
  "h-[40px] w-full rounded-[3px] border border-black/10 bg-white px-3 text-[13px] text-ink outline-none transition-colors placeholder:text-muted focus:border-accent";

export default function OverlayField({
  value,
  defaultValue,
  disabled = false,
  t,
  onChange,
}: {
  /** Override-only draft (`""` = use the code default). */
  value: string;
  defaultValue: string;
  disabled?: boolean;
  t: AdminDict["content"];
  onChange: (alt: string) => void;
}) {
  const source = value.trim() === "" ? defaultValue : value;
  const parsed = useMemo(() => parseOverlayAlt(source), [source]);

  const commit = (label: string, title: string) => {
    const serialized = serializeOverlayAlt(parsed, label, title);
    if (serialized === null) return; // keep the existing markup
    onChange(serialized);
  };

  if (!parsed.hasOverlay) {
    return <p className="text-[11px] text-muted">{t.overlayInvalid}</p>;
  }

  return (
    <div className="space-y-2" data-testid="overlay-field">
      <label className="block min-w-0">
        <span className="mb-1 block text-[11px] text-muted">{t.overlayLabel}</span>
        <input
          type="text"
          value={parsed.label}
          disabled={disabled}
          onChange={(event) => commit(event.target.value, parsed.title)}
          className={INPUT}
        />
      </label>
      <label className="block min-w-0">
        <span className="mb-1 block text-[11px] text-muted">{t.overlayTitle}</span>
        <input
          type="text"
          value={parsed.title}
          disabled={disabled}
          onChange={(event) => commit(parsed.label, event.target.value)}
          className={INPUT}
        />
      </label>
      <p className="text-[11px] text-muted">{t.overlayHint}</p>
    </div>
  );
}
