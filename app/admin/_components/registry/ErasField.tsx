"use client";

import { useMemo } from "react";

import type { AdminDict } from "@/lib/admin/i18n";
import type { EraEntry, EraYear } from "@/lib/types";
import { ImageControl } from "./FieldRow";
import type { RegistryLocale } from "./types";

/**
 * Structured `eras` editor — the company.history timeline.
 *
 * The value is a JSON array of `EraEntry` stored as one override string:
 *   `[{ range, tagline, image, years: [{ year, items: string[] }] }]`
 * where `tagline` is the label runs (after the range) joined with `\n`, and each
 * `items` entry is one milestone WITHOUT the leading `· ` (the renderer adds it).
 * Empty `value` reverts to the code default; every mutation re-serializes the
 * WHOLE list so the runtime always replaces the era sections atomically.
 */

/** Parse the stored JSON; `null` means "malformed" (caller falls back). */
function parseEras(json: string): EraEntry[] | null {
  try {
    const raw: unknown = JSON.parse(json);
    if (!Array.isArray(raw)) return [];
    return raw.map((entry) => {
      const record =
        typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : {};
      const years: EraYear[] = Array.isArray(record.years)
        ? record.years.map((yearEntry) => {
            const yearRecord =
              typeof yearEntry === "object" && yearEntry !== null
                ? (yearEntry as Record<string, unknown>)
                : {};
            return {
              year: typeof yearRecord.year === "string" ? yearRecord.year : "",
              items: Array.isArray(yearRecord.items)
                ? yearRecord.items.filter((item): item is string => typeof item === "string")
                : [],
            };
          })
        : [];
      return {
        range: typeof record.range === "string" ? record.range : "",
        tagline: typeof record.tagline === "string" ? record.tagline : "",
        image: typeof record.image === "string" ? record.image : "",
        years,
      };
    });
  } catch {
    return null;
  }
}

const CARD = "rounded-[4px] border border-black/10 bg-soft p-2.5";
const YEAR_CARD = "mt-2 rounded-[4px] border border-black/10 bg-white p-2.5";
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

export default function ErasField({
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
  const parsed = useMemo(() => parseEras(source), [source]);
  const defaultList = useMemo(() => parseEras(defaultValue) ?? [], [defaultValue]);

  const invalid = !isDefault && parsed === null;
  const eras = parsed ?? defaultList;

  const commit = (next: EraEntry[]) => onChange(JSON.stringify(next));

  const updateEra = (index: number, patch: Partial<EraEntry>) => {
    commit(eras.map((era, i) => (i === index ? { ...era, ...patch } : era)));
  };

  const removeEra = (index: number) => {
    if (eras.length <= 1) return;
    commit(eras.filter((_, i) => i !== index));
  };

  const moveEra = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= eras.length) return;
    const next = eras.slice();
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    commit(next);
  };

  const addEra = () =>
    commit([...eras, { range: "", tagline: "", image: "", years: [{ year: "", items: [] }] }]);

  const updateYear = (eraIndex: number, yearIndex: number, patch: Partial<EraYear>) => {
    const era = eras[eraIndex];
    if (!era) return;
    const years = era.years.map((year, i) => (i === yearIndex ? { ...year, ...patch } : year));
    updateEra(eraIndex, { years });
  };

  const removeYear = (eraIndex: number, yearIndex: number) => {
    const era = eras[eraIndex];
    if (!era || era.years.length <= 1) return;
    updateEra(eraIndex, { years: era.years.filter((_, i) => i !== yearIndex) });
  };

  const moveYear = (eraIndex: number, yearIndex: number, delta: number) => {
    const era = eras[eraIndex];
    if (!era) return;
    const target = yearIndex + delta;
    if (target < 0 || target >= era.years.length) return;
    const years = era.years.slice();
    const [item] = years.splice(yearIndex, 1);
    years.splice(target, 0, item);
    updateEra(eraIndex, { years });
  };

  const addYear = (eraIndex: number) => {
    const era = eras[eraIndex];
    if (!era) return;
    updateEra(eraIndex, { years: [...era.years, { year: "", items: [] }] });
  };

  return (
    <div className="space-y-2" data-testid="eras-editor">
      {invalid ? <p className="text-[11px] text-amber-600">{t.slidesInvalid}</p> : null}

      {eras.map((era, index) => (
        <div key={index} data-testid="era-card" className={CARD}>
          <div className="flex items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
              {t.erasEra(index + 1)}
            </span>
            <button
              type="button"
              aria-label={t.erasMoveUp}
              title={t.erasMoveUp}
              disabled={disabled || index === 0}
              onClick={() => moveEra(index, -1)}
              className={ROW_BUTTON}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={t.erasMoveDown}
              title={t.erasMoveDown}
              disabled={disabled || index === eras.length - 1}
              onClick={() => moveEra(index, 1)}
              className={ROW_BUTTON}
            >
              ↓
            </button>
            <button
              type="button"
              disabled={disabled || eras.length <= 1}
              onClick={() => removeEra(index)}
              className={REMOVE_BUTTON}
            >
              {t.erasRemove}
            </button>
          </div>

          <div className="mt-2 space-y-2">
            <label className="block min-w-0">
              <span className="mb-1 block text-[11px] text-muted">{t.erasRange}</span>
              <input
                type="text"
                data-testid="era-range"
                value={era.range}
                disabled={disabled}
                onChange={(event) => updateEra(index, { range: event.target.value })}
                className={INPUT}
              />
            </label>
            <label className="block min-w-0">
              <span className="mb-1 block text-[11px] text-muted">{t.erasTagline}</span>
              <textarea
                data-testid="era-tagline"
                rows={3}
                value={era.tagline}
                disabled={disabled}
                onChange={(event) => updateEra(index, { tagline: event.target.value })}
                className={TEXTAREA}
              />
            </label>
            <div>
              <span className="mb-1 block text-[11px] text-muted">{t.erasImage}</span>
              <ImageControl
                draft={era.image}
                fallback=""
                locale={lang}
                t={t}
                disabled={disabled}
                onChange={(next) => updateEra(index, { image: next })}
              />
            </div>

            <div className="rounded-[4px] border border-black/10 bg-white/60 p-2">
              <span className="mb-1 block text-[11px] font-medium text-muted">{t.erasYears}</span>
              <div className="space-y-2">
                {era.years.map((year, yearIndex) => (
                  <div key={yearIndex} data-testid="era-year" className={YEAR_CARD}>
                    <div className="flex items-center gap-1.5">
                      <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink">
                        {t.erasYear} {yearIndex + 1}
                      </span>
                      <button
                        type="button"
                        aria-label={t.erasMoveUp}
                        title={t.erasMoveUp}
                        disabled={disabled || yearIndex === 0}
                        onClick={() => moveYear(index, yearIndex, -1)}
                        className={ROW_BUTTON}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={t.erasMoveDown}
                        title={t.erasMoveDown}
                        disabled={disabled || yearIndex === era.years.length - 1}
                        onClick={() => moveYear(index, yearIndex, 1)}
                        className={ROW_BUTTON}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        disabled={disabled || era.years.length <= 1}
                        onClick={() => removeYear(index, yearIndex)}
                        className={REMOVE_BUTTON}
                      >
                        {t.erasRemove}
                      </button>
                    </div>
                    <div className="mt-2 space-y-2">
                      <input
                        type="text"
                        data-testid="era-year-input"
                        value={year.year}
                        disabled={disabled}
                        placeholder="2025"
                        onChange={(event) =>
                          updateYear(index, yearIndex, { year: event.target.value })
                        }
                        className={INPUT}
                      />
                      <textarea
                        data-testid="era-year-items"
                        rows={3}
                        value={year.items.join("\n")}
                        disabled={disabled}
                        onChange={(event) =>
                          updateYear(index, yearIndex, {
                            items: event.target.value.split("\n"),
                          })
                        }
                        className={TEXTAREA}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                data-testid="era-add-year"
                disabled={disabled}
                onClick={() => addYear(index)}
                className={`${ADD_BUTTON} mt-2`}
              >
                + {t.erasAddYear}
              </button>
            </div>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="era-add"
          disabled={disabled}
          onClick={addEra}
          className={ADD_BUTTON}
        >
          + {t.erasAdd}
        </button>
        <span className="text-[11px] text-muted">{t.erasHint}</span>
      </div>
    </div>
  );
}
