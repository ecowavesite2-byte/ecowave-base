"use client";

import { useMemo } from "react";

import type { AdminDict } from "@/lib/admin/i18n";
import type { GalleryBlockConfig, StructuredMediaItem } from "@/lib/types";
import { ImageControl } from "./FieldRow";
import type { RegistryLocale } from "./types";

/**
 * Structured `gallery` / `aboutCards` editor — company.about media blocks.
 *
 * The value is a JSON array of `StructuredMediaItem` stored as one override
 * string: `[{ image, title, desc }]`. One uploaded image serves both the
 * thumbnail and the full-size (`org = thumb`) view — there is no separate
 * thumbnail field. `config` (emitted on `gallery` defs) limits which per-item
 * fields are editable and how many items a block may hold; when it is absent
 * (`aboutCards`) every field is exposed with no cap. Empty `value` reverts to
 * the code default; every mutation re-serializes the WHOLE list.
 */

/** Parse the stored JSON; `null` means "malformed" (caller falls back). */
function parseItems(json: string): StructuredMediaItem[] | null {
  try {
    const raw: unknown = JSON.parse(json);
    if (!Array.isArray(raw)) return [];
    return raw.map((entry) => {
      const record =
        typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : {};
      return {
        image: typeof record.image === "string" ? record.image : "",
        title: typeof record.title === "string" ? record.title : "",
        desc: typeof record.desc === "string" ? record.desc : "",
      };
    });
  } catch {
    return null;
  }
}

const CARD = "rounded-[4px] border border-black/10 bg-soft p-2.5";
const ROW_BUTTON =
  "shrink-0 rounded-[3px] border border-black/10 bg-white px-2 py-1 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-40";
const REMOVE_BUTTON =
  "shrink-0 rounded-[3px] border border-black/10 bg-white px-2 py-1 text-[11px] text-muted transition-colors hover:border-red-400 hover:text-red-600 disabled:opacity-40";
const ADD_BUTTON =
  "h-[32px] rounded-[3px] border border-dashed border-black/20 px-4 text-[12px] text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-40";
const INPUT =
  "h-[36px] w-full rounded-[3px] border border-black/10 bg-white px-3 text-[13px] text-ink outline-none transition-colors placeholder:text-muted focus:border-accent";
const TEXTAREA =
  "min-h-[60px] w-full resize-y rounded-[3px] border border-black/10 bg-white px-3 py-2 font-mono text-[13px] leading-relaxed text-ink outline-none transition-colors placeholder:text-muted focus:border-accent";

export default function GalleryField({
  value,
  defaultValue,
  config,
  lang,
  disabled = false,
  t,
  onChange,
}: {
  value: string;
  defaultValue: string;
  /** Block config (editable fields + optional item cap); absent = allow all, no cap. */
  config?: GalleryBlockConfig;
  lang: RegistryLocale;
  disabled?: boolean;
  t: AdminDict["content"];
  onChange: (json: string) => void;
}) {
  const isDefault = value.trim() === "";
  const source = isDefault ? defaultValue : value;
  const parsed = useMemo(() => parseItems(source), [source]);
  const defaultList = useMemo(() => parseItems(defaultValue) ?? [], [defaultValue]);

  const invalid = !isDefault && parsed === null;
  const items = parsed ?? defaultList;

  const allowTitle = !config || config.fields.includes("title");
  const allowDesc = !config || config.fields.includes("desc");
  const max = config?.maxItems;
  const atMax = typeof max === "number" && items.length >= max;

  const commit = (next: StructuredMediaItem[]) => onChange(JSON.stringify(next));

  const update = (index: number, patch: Partial<StructuredMediaItem>) => {
    commit(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const remove = (index: number) => {
    if (items.length <= 1) return;
    commit(items.filter((_, i) => i !== index));
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = items.slice();
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    commit(next);
  };

  const add = () => commit([...items, { image: "", title: "", desc: "" }]);

  return (
    <div className="space-y-2" data-testid="gallery-editor">
      {invalid ? <p className="text-[11px] text-amber-600">{t.slidesInvalid}</p> : null}

      {items.map((item, index) => (
        <div key={index} data-testid="gallery-item" className={CARD}>
          <div className="flex items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
              {t.galleryItem(index + 1)}
            </span>
            <button
              type="button"
              aria-label={t.galleryMoveUp}
              title={t.galleryMoveUp}
              disabled={disabled || index === 0}
              onClick={() => move(index, -1)}
              className={ROW_BUTTON}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={t.galleryMoveDown}
              title={t.galleryMoveDown}
              disabled={disabled || index === items.length - 1}
              onClick={() => move(index, 1)}
              className={ROW_BUTTON}
            >
              ↓
            </button>
            <button
              type="button"
              disabled={disabled || items.length <= 1}
              onClick={() => remove(index)}
              className={REMOVE_BUTTON}
            >
              {t.galleryRemove}
            </button>
          </div>

          <div className="mt-2 space-y-2">
            <div>
              <span className="mb-1 block text-[11px] text-muted">{t.galleryImage}</span>
              <ImageControl
                draft={item.image}
                fallback=""
                locale={lang}
                t={t}
                disabled={disabled}
                onChange={(next) => update(index, { image: next })}
              />
            </div>
            {allowTitle ? (
              <label className="block min-w-0">
                <span className="mb-1 block text-[11px] text-muted">{t.galleryTitle}</span>
                <input
                  type="text"
                  data-testid="gallery-title"
                  value={item.title}
                  disabled={disabled}
                  onChange={(event) => update(index, { title: event.target.value })}
                  className={INPUT}
                />
              </label>
            ) : null}
            {allowDesc ? (
              <label className="block min-w-0">
                <span className="mb-1 block text-[11px] text-muted">{t.galleryDesc}</span>
                <textarea
                  data-testid="gallery-desc"
                  rows={3}
                  value={item.desc}
                  disabled={disabled}
                  onChange={(event) => update(index, { desc: event.target.value })}
                  className={TEXTAREA}
                />
              </label>
            ) : null}
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="gallery-add"
          disabled={disabled || atMax}
          onClick={add}
          className={ADD_BUTTON}
        >
          + {t.galleryAdd}
        </button>
        <span className="text-[11px] text-muted">
          {atMax && typeof max === "number" ? t.galleryMaxHint(max) : t.galleryHint}
        </span>
      </div>
    </div>
  );
}
