"use client";

import { useMemo } from "react";

import type { AdminDict } from "@/lib/admin/i18n";
import { ImageControl } from "./FieldRow";
import type { RegistryLocale } from "./types";

/**
 * Structured `facilityTabs` editor — the rnd.facilities production-facility tabs.
 *
 * The value is a JSON array of `{ name, images }` stored as one override string:
 *   `[{ name, images: string[] }]`
 * where `name` is the tab label and `images` is the ordered media list. The
 * server-side validator enforces 1..3 tabs, each with a non-empty name and a
 * non-empty images array; this editor mirrors those bounds defensively (add is
 * capped at three, the last tab and the last image cannot be removed). Empty
 * `value` reverts to the code default; every mutation re-serializes the WHOLE
 * list so the runtime always replaces the tab block atomically.
 */

/** Domain rule: the tab menu holds at most three tabs. */
const MAX_TABS = 3;

type FacilityTab = { name: string; images: string[] };

/** Parse the stored JSON; `null` means "malformed" (caller falls back). */
function parseTabs(json: string): FacilityTab[] | null {
  try {
    const raw: unknown = JSON.parse(json);
    if (!Array.isArray(raw)) return [];
    return raw.map((entry) => {
      const record =
        typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : {};
      return {
        name: typeof record.name === "string" ? record.name : "",
        images: Array.isArray(record.images)
          ? record.images.filter((image): image is string => typeof image === "string")
          : [],
      };
    });
  } catch {
    return null;
  }
}

const CARD = "rounded-[4px] border border-black/10 bg-soft p-2.5";
const IMAGE_CARD = "mt-2 rounded-[4px] border border-black/10 bg-white p-2.5";
const ROW_BUTTON =
  "shrink-0 rounded-[3px] border border-black/10 bg-white px-2 py-1 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-40";
const REMOVE_BUTTON =
  "shrink-0 rounded-[3px] border border-black/10 bg-white px-2 py-1 text-[11px] text-muted transition-colors hover:border-red-400 hover:text-red-600 disabled:opacity-40";
const ADD_BUTTON =
  "h-[32px] rounded-[3px] border border-dashed border-black/20 px-4 text-[12px] text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-40";
const INPUT =
  "h-[36px] w-full rounded-[3px] border border-black/10 bg-white px-3 text-[13px] text-ink outline-none transition-colors placeholder:text-muted focus:border-accent";

export default function FacilityTabsField({
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
  const parsed = useMemo(() => parseTabs(source), [source]);
  const defaultList = useMemo(() => parseTabs(defaultValue) ?? [], [defaultValue]);

  const invalid = !isDefault && parsed === null;
  const tabs = parsed ?? defaultList;
  const atMax = tabs.length >= MAX_TABS;

  const commit = (next: FacilityTab[]) => onChange(JSON.stringify(next));

  const updateTab = (index: number, patch: Partial<FacilityTab>) => {
    commit(tabs.map((tab, i) => (i === index ? { ...tab, ...patch } : tab)));
  };

  const removeTab = (index: number) => {
    if (tabs.length <= 1) return;
    commit(tabs.filter((_, i) => i !== index));
  };

  const moveTab = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= tabs.length) return;
    const next = tabs.slice();
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    commit(next);
  };

  const addTab = () => {
    if (tabs.length >= MAX_TABS) return;
    commit([...tabs, { name: "", images: [""] }]);
  };

  /** Replace one image path inside a tab (the `ImageControl` change callback). */
  const updateImage = (tabIndex: number, imageIndex: number, next: string) => {
    const tab = tabs[tabIndex];
    if (!tab) return;
    updateTab(tabIndex, {
      images: tab.images.map((image, i) => (i === imageIndex ? next : image)),
    });
  };

  const addImage = (tabIndex: number) => {
    const tab = tabs[tabIndex];
    if (!tab) return;
    updateTab(tabIndex, { images: [...tab.images, ""] });
  };

  const removeImage = (tabIndex: number, imageIndex: number) => {
    const tab = tabs[tabIndex];
    if (!tab || tab.images.length <= 1) return;
    updateTab(tabIndex, { images: tab.images.filter((_, i) => i !== imageIndex) });
  };

  const moveImage = (tabIndex: number, imageIndex: number, delta: number) => {
    const tab = tabs[tabIndex];
    if (!tab) return;
    const target = imageIndex + delta;
    if (target < 0 || target >= tab.images.length) return;
    const images = tab.images.slice();
    const [item] = images.splice(imageIndex, 1);
    images.splice(target, 0, item);
    updateTab(tabIndex, { images });
  };

  return (
    <div className="space-y-2" data-testid="facility-tabs-editor">
      {invalid ? <p className="text-[11px] text-amber-600">{t.slidesInvalid}</p> : null}

      {tabs.map((tab, index) => (
        <div key={index} data-testid="facility-tab" className={CARD}>
          <div className="flex items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
              {t.facilityTabsTab(index + 1)}
            </span>
            <button
              type="button"
              data-testid="facility-tab-move-up"
              aria-label={t.facilityTabsMoveUp}
              title={t.facilityTabsMoveUp}
              disabled={disabled || index === 0}
              onClick={() => moveTab(index, -1)}
              className={ROW_BUTTON}
            >
              ↑
            </button>
            <button
              type="button"
              data-testid="facility-tab-move-down"
              aria-label={t.facilityTabsMoveDown}
              title={t.facilityTabsMoveDown}
              disabled={disabled || index === tabs.length - 1}
              onClick={() => moveTab(index, 1)}
              className={ROW_BUTTON}
            >
              ↓
            </button>
            <button
              type="button"
              data-testid="facility-tab-remove"
              disabled={disabled || tabs.length <= 1}
              onClick={() => removeTab(index)}
              className={REMOVE_BUTTON}
            >
              {t.facilityTabsRemove}
            </button>
          </div>

          <div className="mt-2 space-y-2">
            <label className="block min-w-0">
              <span className="mb-1 block text-[11px] text-muted">{t.facilityTabsName}</span>
              <input
                type="text"
                data-testid="facility-tab-name"
                value={tab.name}
                disabled={disabled}
                onChange={(event) => updateTab(index, { name: event.target.value })}
                className={INPUT}
              />
            </label>

            <div className="rounded-[4px] border border-black/10 bg-white/60 p-2">
              <span className="mb-1 block text-[11px] font-medium text-muted">
                {t.facilityTabsImages}
              </span>
              <div className="space-y-2">
                {tab.images.map((image, imageIndex) => (
                  <div key={imageIndex} data-testid="facility-tab-image" className={IMAGE_CARD}>
                    <div className="flex items-center gap-1.5">
                      <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink">
                        {t.facilityTabsImage} {imageIndex + 1}
                      </span>
                      <button
                        type="button"
                        data-testid="facility-tab-image-move-up"
                        aria-label={t.facilityTabsMoveUp}
                        title={t.facilityTabsMoveUp}
                        disabled={disabled || imageIndex === 0}
                        onClick={() => moveImage(index, imageIndex, -1)}
                        className={ROW_BUTTON}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        data-testid="facility-tab-image-move-down"
                        aria-label={t.facilityTabsMoveDown}
                        title={t.facilityTabsMoveDown}
                        disabled={disabled || imageIndex === tab.images.length - 1}
                        onClick={() => moveImage(index, imageIndex, 1)}
                        className={ROW_BUTTON}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        data-testid="facility-tab-image-remove"
                        disabled={disabled || tab.images.length <= 1}
                        onClick={() => removeImage(index, imageIndex)}
                        className={REMOVE_BUTTON}
                      >
                        {t.facilityTabsRemove}
                      </button>
                    </div>
                    <div className="mt-2">
                      <ImageControl
                        draft={image}
                        fallback=""
                        locale={lang}
                        t={t}
                        disabled={disabled}
                        onChange={(next) => updateImage(index, imageIndex, next)}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                data-testid="facility-tab-image-add"
                disabled={disabled}
                onClick={() => addImage(index)}
                className={`${ADD_BUTTON} mt-2`}
              >
                + {t.facilityTabsImageAdd}
              </button>
            </div>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="facility-tab-add"
          disabled={disabled || atMax}
          onClick={addTab}
          className={ADD_BUTTON}
        >
          + {t.facilityTabsAdd}
        </button>
        <span className="text-[11px] text-muted">
          {atMax ? t.facilityTabsMaxHint(MAX_TABS) : t.facilityTabsHint}
        </span>
      </div>
    </div>
  );
}
