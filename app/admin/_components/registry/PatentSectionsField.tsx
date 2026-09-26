"use client";

import { useMemo } from "react";

import type { AdminDict } from "@/lib/admin/i18n";
import { ImageControl } from "./FieldRow";
import type { RegistryLocale } from "./types";

/**
 * Structured `patentSections` editor — the rnd.patents certification groups.
 *
 * The value is a JSON object `{ sections }` stored as one override string:
 *   `{ sections: [{ title, items: [{ image, caption }] }] }`
 * where each section is a heading plus an ordered media list (the crawl folds
 * the old heading + gallery widget pairs into these groups). The server-side
 * validator enforces 1..12 sections with 1..60 items each; this editor mirrors
 * those bounds defensively (add is capped, the last section and the last item
 * cannot be removed). Empty `value` reverts to the code default; every mutation
 * re-serializes the WHOLE payload so the runtime always replaces the section
 * groups atomically.
 */

/** Domain rules: section count and per-section item count caps. */
const MAX_SECTIONS = 12;
const MAX_ITEMS = 60;

type PatentItem = { image: string; caption: string };
type PatentSection = { title: string; items: PatentItem[] };

/** Parse the stored JSON; `null` means "malformed" (caller falls back). */
function parsePatentSections(json: string): PatentSection[] | null {
  try {
    const raw: unknown = JSON.parse(json);
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return [];
    const list = (raw as Record<string, unknown>).sections;
    if (!Array.isArray(list)) return [];
    return list.map((entry) => {
      const record =
        typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : {};
      const items: PatentItem[] = Array.isArray(record.items)
        ? record.items.map((itemEntry) => {
            const itemRecord =
              typeof itemEntry === "object" && itemEntry !== null
                ? (itemEntry as Record<string, unknown>)
                : {};
            return {
              image: typeof itemRecord.image === "string" ? itemRecord.image : "",
              caption: typeof itemRecord.caption === "string" ? itemRecord.caption : "",
            };
          })
        : [];
      return {
        title: typeof record.title === "string" ? record.title : "",
        items,
      };
    });
  } catch {
    return null;
  }
}

const CARD = "rounded-[4px] border border-black/10 bg-soft p-2.5";
const ITEM_CARD = "mt-2 rounded-[4px] border border-black/10 bg-white p-2.5";
const ROW_BUTTON =
  "shrink-0 rounded-[3px] border border-black/10 bg-white px-2 py-1 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-40";
const REMOVE_BUTTON =
  "shrink-0 rounded-[3px] border border-black/10 bg-white px-2 py-1 text-[11px] text-muted transition-colors hover:border-red-400 hover:text-red-600 disabled:opacity-40";
const ADD_BUTTON =
  "h-[32px] rounded-[3px] border border-dashed border-black/20 px-4 text-[12px] text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-40";
const INPUT =
  "h-[36px] w-full rounded-[3px] border border-black/10 bg-white px-3 text-[13px] text-ink outline-none transition-colors placeholder:text-muted focus:border-accent";

export default function PatentSectionsField({
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
  const parsed = useMemo(() => parsePatentSections(source), [source]);
  const defaultList = useMemo(() => parsePatentSections(defaultValue) ?? [], [defaultValue]);

  const invalid = !isDefault && parsed === null;
  const sections = parsed ?? defaultList;
  const atMax = sections.length >= MAX_SECTIONS;

  const commit = (next: PatentSection[]) => onChange(JSON.stringify({ sections: next }));

  const updateSection = (index: number, patch: Partial<PatentSection>) => {
    commit(sections.map((section, i) => (i === index ? { ...section, ...patch } : section)));
  };

  const removeSection = (index: number) => {
    if (sections.length <= 1) return;
    commit(sections.filter((_, i) => i !== index));
  };

  const moveSection = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= sections.length) return;
    const next = sections.slice();
    const [section] = next.splice(index, 1);
    next.splice(target, 0, section);
    commit(next);
  };

  const addSection = () => {
    if (sections.length >= MAX_SECTIONS) return;
    commit([...sections, { title: "", items: [{ image: "", caption: "" }] }]);
  };

  const updateItem = (sectionIndex: number, itemIndex: number, patch: Partial<PatentItem>) => {
    const section = sections[sectionIndex];
    if (!section) return;
    updateSection(sectionIndex, {
      items: section.items.map((item, i) => (i === itemIndex ? { ...item, ...patch } : item)),
    });
  };

  const removeItem = (sectionIndex: number, itemIndex: number) => {
    const section = sections[sectionIndex];
    if (!section || section.items.length <= 1) return;
    updateSection(sectionIndex, { items: section.items.filter((_, i) => i !== itemIndex) });
  };

  const moveItem = (sectionIndex: number, itemIndex: number, delta: number) => {
    const section = sections[sectionIndex];
    if (!section) return;
    const target = itemIndex + delta;
    if (target < 0 || target >= section.items.length) return;
    const items = section.items.slice();
    const [item] = items.splice(itemIndex, 1);
    items.splice(target, 0, item);
    updateSection(sectionIndex, { items });
  };

  const addItem = (sectionIndex: number) => {
    const section = sections[sectionIndex];
    if (!section || section.items.length >= MAX_ITEMS) return;
    updateSection(sectionIndex, { items: [...section.items, { image: "", caption: "" }] });
  };

  return (
    <div className="space-y-2" data-testid="patent-sections-editor">
      {invalid ? <p className="text-[11px] text-amber-600">{t.slidesInvalid}</p> : null}

      {sections.map((section, index) => (
        <div key={index} data-testid="patent-section-card" className={CARD}>
          <div className="flex items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
              {t.patentSectionsSection(index + 1)}
            </span>
            <button
              type="button"
              data-testid="patent-section-move-up"
              aria-label={t.patentSectionsMoveUp}
              title={t.patentSectionsMoveUp}
              disabled={disabled || index === 0}
              onClick={() => moveSection(index, -1)}
              className={ROW_BUTTON}
            >
              ↑
            </button>
            <button
              type="button"
              data-testid="patent-section-move-down"
              aria-label={t.patentSectionsMoveDown}
              title={t.patentSectionsMoveDown}
              disabled={disabled || index === sections.length - 1}
              onClick={() => moveSection(index, 1)}
              className={ROW_BUTTON}
            >
              ↓
            </button>
            <button
              type="button"
              data-testid="patent-section-remove"
              disabled={disabled || sections.length <= 1}
              onClick={() => removeSection(index)}
              className={REMOVE_BUTTON}
            >
              {t.patentSectionsRemove}
            </button>
          </div>

          <div className="mt-2 space-y-2">
            <label className="block min-w-0">
              <span className="mb-1 block text-[11px] text-muted">{t.patentSectionsTitle}</span>
              <input
                type="text"
                data-testid="patent-section-title"
                value={section.title}
                disabled={disabled}
                onChange={(event) => updateSection(index, { title: event.target.value })}
                className={INPUT}
              />
            </label>

            <div className="rounded-[4px] border border-black/10 bg-white/60 p-2">
              <span className="mb-1 block text-[11px] font-medium text-muted">
                {t.patentSectionsItems}
              </span>
              <div className="space-y-2">
                {section.items.map((item, itemIndex) => (
                  <div
                    key={itemIndex}
                    data-testid="patent-section-item"
                    className={ITEM_CARD}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink">
                        {t.patentSectionsItem} {itemIndex + 1}
                      </span>
                      <button
                        type="button"
                        data-testid="patent-section-item-move-up"
                        aria-label={t.patentSectionsMoveUp}
                        title={t.patentSectionsMoveUp}
                        disabled={disabled || itemIndex === 0}
                        onClick={() => moveItem(index, itemIndex, -1)}
                        className={ROW_BUTTON}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        data-testid="patent-section-item-move-down"
                        aria-label={t.patentSectionsMoveDown}
                        title={t.patentSectionsMoveDown}
                        disabled={disabled || itemIndex === section.items.length - 1}
                        onClick={() => moveItem(index, itemIndex, 1)}
                        className={ROW_BUTTON}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        data-testid="patent-section-item-remove"
                        disabled={disabled || section.items.length <= 1}
                        onClick={() => removeItem(index, itemIndex)}
                        className={REMOVE_BUTTON}
                      >
                        {t.patentSectionsRemove}
                      </button>
                    </div>
                    <div data-testid="patent-section-item-image" className="mt-2">
                      <ImageControl
                        draft={item.image}
                        fallback=""
                        locale={lang}
                        t={t}
                        disabled={disabled}
                        onChange={(next) => updateItem(index, itemIndex, { image: next })}
                      />
                    </div>
                    <label className="mt-2 block min-w-0">
                      <span className="mb-1 block text-[11px] text-muted">
                        {t.patentSectionsCaption}
                      </span>
                      <input
                        type="text"
                        data-testid="patent-section-item-caption"
                        value={item.caption}
                        disabled={disabled}
                        onChange={(event) =>
                          updateItem(index, itemIndex, { caption: event.target.value })
                        }
                        className={INPUT}
                      />
                    </label>
                  </div>
                ))}
              </div>
              <button
                type="button"
                data-testid="patent-section-item-add"
                disabled={disabled || section.items.length >= MAX_ITEMS}
                onClick={() => addItem(index)}
                className={`${ADD_BUTTON} mt-2`}
              >
                + {t.patentSectionsAddItem}
              </button>
            </div>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="patent-section-add"
          disabled={disabled || atMax}
          onClick={addSection}
          className={ADD_BUTTON}
        >
          + {t.patentSectionsAdd}
        </button>
        <span className="text-[11px] text-muted">
          {atMax ? t.patentSectionsMaxHint(MAX_SECTIONS) : t.patentSectionsHint}
        </span>
      </div>
    </div>
  );
}
