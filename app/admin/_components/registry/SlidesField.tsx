"use client";

import { useMemo } from "react";

import type { AdminDict } from "@/lib/admin/i18n";
import { ImageControl } from "./FieldRow";
import type { RegistryLocale } from "./types";

/**
 * Dynamic `slides` editor — the home hero slide list.
 *
 * The value is a JSON array stored as one override string:
 *   `[{ bg: string | null, html: string }]`
 * where `html` holds the plain-text lines for that slide (`\n`-separated, no
 * HTML). Empty `value` reverts to the code default; every mutation re-serializes
 * the WHOLE list so the runtime always replaces `section.visual` atomically.
 */

type Slide = { bg: string | null; html: string };

/** Parse the stored JSON; `null` means "malformed" (caller falls back). */
function parseSlides(json: string): Slide[] | null {
  try {
    const raw = JSON.parse(json) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.map((entry) => {
      const record =
        typeof entry === "object" && entry !== null
          ? (entry as Record<string, unknown>)
          : {};
      return {
        bg: typeof record.bg === "string" ? record.bg : null,
        html: typeof record.html === "string" ? record.html : "",
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
  "shrink-0 rounded-[3px] border border-black/10 bg-white px-2 py-1 text-[11px] text-muted transition-colors hover:border-red-400 hover:text-red-600";
const ADD_BUTTON =
  "h-[32px] rounded-[3px] border border-dashed border-black/20 px-4 text-[12px] text-muted transition-colors hover:border-accent hover:text-accent";
const TEXTAREA =
  "min-h-[60px] w-full resize-y rounded-[3px] border border-black/10 bg-white px-3 py-2 font-mono text-[13px] leading-relaxed text-ink outline-none transition-colors placeholder:text-muted focus:border-accent";

export default function SlidesField({
  value,
  defaultValue,
  lang,
  disabled = false,
  t,
  onChange,
}: {
  value: string;
  defaultValue: string;
  lang: RegistryLocale;
  disabled?: boolean;
  t: AdminDict["content"];
  onChange: (json: string) => void;
}) {
  const isDefault = value.trim() === "";
  const source = isDefault ? defaultValue : value;
  const parsed = useMemo(() => parseSlides(source), [source]);
  const defaultList = useMemo(() => parseSlides(defaultValue) ?? [], [defaultValue]);

  const invalid = !isDefault && parsed === null;
  const slides = parsed ?? defaultList;

  const commit = (next: Slide[]) => onChange(JSON.stringify(next));

  const update = (index: number, patch: Partial<Slide>) => {
    commit(slides.map((slide, i) => (i === index ? { ...slide, ...patch } : slide)));
  };

  const remove = (index: number) => {
    if (slides.length <= 1) return;
    commit(slides.filter((_, i) => i !== index));
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= slides.length) return;
    const next = slides.slice();
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    commit(next);
  };

  const add = () => commit([...slides, { bg: "", html: "" }]);

  return (
    <div className="space-y-2">
      {invalid ? <p className="text-[11px] text-amber-600">{t.slidesInvalid}</p> : null}

      {slides.map((slide, index) => (
        <div key={index} className={CARD}>
          <div className="flex items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
              {t.slidesSlide(index + 1)}
            </span>
            <button
              type="button"
              aria-label={t.slidesMoveUp}
              title={t.slidesMoveUp}
              disabled={disabled || index === 0}
              onClick={() => move(index, -1)}
              className={ROW_BUTTON}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={t.slidesMoveDown}
              title={t.slidesMoveDown}
              disabled={disabled || index === slides.length - 1}
              onClick={() => move(index, 1)}
              className={ROW_BUTTON}
            >
              ↓
            </button>
            <button
              type="button"
              disabled={disabled || slides.length <= 1}
              onClick={() => remove(index)}
              className={REMOVE_BUTTON}
            >
              {t.slidesRemove}
            </button>
          </div>

          <div className="mt-2 space-y-2">
            <div>
              <span className="mb-1 block text-[11px] text-muted">{t.slidesImage}</span>
              <ImageControl
                draft={slide.bg || ""}
                fallback=""
                locale={lang}
                t={t}
                disabled={disabled}
                onChange={(next) => update(index, { bg: next === "" ? null : next })}
              />
            </div>
            <label className="block min-w-0">
              <span className="mb-1 block text-[11px] text-muted">{t.slidesText}</span>
              <textarea
                rows={3}
                value={slide.html}
                disabled={disabled}
                onChange={(event) => update(index, { html: event.target.value })}
                className={TEXTAREA}
              />
            </label>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={disabled} onClick={add} className={ADD_BUTTON}>
          + {t.slidesAdd}
        </button>
        <span className="text-[11px] text-muted">{t.slidesHint}</span>
      </div>
    </div>
  );
}
