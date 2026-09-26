"use client";

import { useMemo } from "react";

import type { AdminDict } from "@/lib/admin/i18n";
import type { GlobalLocation } from "@/lib/types";

/**
 * Structured `locations` editor — the company.global branch list.
 *
 * The value is a JSON array of `GlobalLocation` stored as one override string:
 *   `[{ badge, city, address, mapSrc }]`
 * Empty `value` reverts to the code default; every mutation re-serializes the
 * WHOLE list so the runtime always replaces the branch columns atomically. The
 * HQ card is a fixed section and is not part of this list.
 */

/** Parse the stored JSON; `null` means "malformed" (caller falls back). */
function parseLocations(json: string): GlobalLocation[] | null {
  try {
    const raw: unknown = JSON.parse(json);
    if (!Array.isArray(raw)) return [];
    return raw.map((entry) => {
      const record =
        typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : {};
      return {
        badge: typeof record.badge === "string" ? record.badge : "",
        city: typeof record.city === "string" ? record.city : "",
        address: typeof record.address === "string" ? record.address : "",
        mapSrc: typeof record.mapSrc === "string" ? record.mapSrc : "",
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

export default function LocationsField({
  value,
  defaultValue,
  disabled = false,
  t,
  onChange,
}: {
  value: string;
  defaultValue: string;
  disabled?: boolean;
  t: AdminDict["content"];
  onChange: (json: string) => void;
}) {
  const isDefault = value.trim() === "";
  const source = isDefault ? defaultValue : value;
  const parsed = useMemo(() => parseLocations(source), [source]);
  const defaultList = useMemo(() => parseLocations(defaultValue) ?? [], [defaultValue]);

  const invalid = !isDefault && parsed === null;
  const locations = parsed ?? defaultList;

  const commit = (next: GlobalLocation[]) => onChange(JSON.stringify(next));

  const update = (index: number, patch: Partial<GlobalLocation>) => {
    commit(locations.map((location, i) => (i === index ? { ...location, ...patch } : location)));
  };

  const remove = (index: number) => {
    if (locations.length <= 1) return;
    commit(locations.filter((_, i) => i !== index));
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= locations.length) return;
    const next = locations.slice();
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    commit(next);
  };

  const add = () => commit([...locations, { badge: "", city: "", address: "", mapSrc: "" }]);

  return (
    <div className="space-y-2" data-testid="locations-editor">
      {invalid ? <p className="text-[11px] text-amber-600">{t.slidesInvalid}</p> : null}

      {locations.map((location, index) => (
        <div key={index} data-testid="location-card" className={CARD}>
          <div className="flex items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
              {t.locationsCard(index + 1)}
            </span>
            <button
              type="button"
              aria-label={t.locationsMoveUp}
              title={t.locationsMoveUp}
              disabled={disabled || index === 0}
              onClick={() => move(index, -1)}
              className={ROW_BUTTON}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={t.locationsMoveDown}
              title={t.locationsMoveDown}
              disabled={disabled || index === locations.length - 1}
              onClick={() => move(index, 1)}
              className={ROW_BUTTON}
            >
              ↓
            </button>
            <button
              type="button"
              disabled={disabled || locations.length <= 1}
              onClick={() => remove(index)}
              className={REMOVE_BUTTON}
            >
              {t.locationsRemove}
            </button>
          </div>

          <div className="mt-2 space-y-2">
            <label className="block min-w-0">
              <span className="mb-1 block text-[11px] text-muted">{t.locationsBadge}</span>
              <input
                type="text"
                data-testid="location-badge"
                value={location.badge}
                disabled={disabled}
                onChange={(event) => update(index, { badge: event.target.value })}
                className={INPUT}
              />
            </label>
            <label className="block min-w-0">
              <span className="mb-1 block text-[11px] text-muted">{t.locationsCity}</span>
              <input
                type="text"
                data-testid="location-city"
                value={location.city}
                disabled={disabled}
                onChange={(event) => update(index, { city: event.target.value })}
                className={INPUT}
              />
            </label>
            <label className="block min-w-0">
              <span className="mb-1 block text-[11px] text-muted">{t.locationsAddress}</span>
              <input
                type="text"
                data-testid="location-address"
                value={location.address}
                disabled={disabled}
                onChange={(event) => update(index, { address: event.target.value })}
                className={INPUT}
              />
            </label>
            <label className="block min-w-0">
              <span className="mb-1 block text-[11px] text-muted">{t.locationsMap}</span>
              <input
                type="text"
                data-testid="location-map"
                value={location.mapSrc}
                placeholder={t.urlPlaceholder}
                disabled={disabled}
                onChange={(event) => update(index, { mapSrc: event.target.value })}
                className={`${INPUT} font-mono text-[12px]`}
              />
            </label>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="location-add"
          disabled={disabled}
          onClick={add}
          className={ADD_BUTTON}
        >
          + {t.locationsAdd}
        </button>
        <span className="text-[11px] text-muted">{t.locationsHint}</span>
      </div>
    </div>
  );
}
