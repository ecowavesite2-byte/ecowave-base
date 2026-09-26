"use client";

import { useMemo } from "react";

import type { AdminDict } from "@/lib/admin/i18n";
import type { GlobalLocation } from "@/lib/types";

/**
 * Structured `locations` editor — the company.global location list.
 *
 * The value is a JSON array of `GlobalLocation` stored as one override string:
 *   `[{ badge, city, address, phone, fax, email, mapSrc }]`
 * Item 0 is the HQ slot (rendered in the full-width HQ band); items 1+ are the
 * branch cards. The HQ card is locked (no move/remove). Empty `value` reverts to
 * the code default; every mutation re-serializes the WHOLE list so the runtime
 * always replaces the HQ + branch markup atomically.
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
        phone: typeof record.phone === "string" ? record.phone : "",
        fax: typeof record.fax === "string" ? record.fax : "",
        email: typeof record.email === "string" ? record.email : "",
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

  const add = () =>
    commit([
      ...locations,
      { badge: "", city: "", address: "", phone: "", fax: "", email: "", mapSrc: "" },
    ]);

  return (
    <div className="space-y-2" data-testid="locations-editor">
      {invalid ? <p className="text-[11px] text-amber-600">{t.slidesInvalid}</p> : null}

      {locations.map((location, index) => {
        const mapQuery = [location.city, location.address].filter(Boolean).join(", ");
        const showMapPreview =
          typeof location.mapSrc === "string" &&
          location.mapSrc.startsWith("http") &&
          location.mapSrc.includes("/maps/embed");
        return (
          <div key={index} data-testid="location-card" className={CARD}>
            <div className="flex items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                {t.locationsCard(index + 1)}
              </span>
              {index === 0 ? (
                // Item 0 is the HQ slot: locked (no move/remove).
                <span className="shrink-0 rounded-full border border-accent/40 px-2 py-0.5 text-[10px] font-medium text-accent">
                  {t.locationsHq}
                </span>
              ) : (
                <>
                  <button
                    type="button"
                    data-testid="location-move-up"
                    aria-label={t.locationsMoveUp}
                    title={t.locationsMoveUp}
                    // Never move a branch above the HQ slot.
                    disabled={disabled || index <= 1}
                    onClick={() => move(index, -1)}
                    className={ROW_BUTTON}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    data-testid="location-move-down"
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
                    data-testid="location-remove"
                    disabled={disabled || locations.length <= 1}
                    onClick={() => remove(index)}
                    className={REMOVE_BUTTON}
                  >
                    {t.locationsRemove}
                  </button>
                </>
              )}
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
                <span className="mb-1 block text-[11px] text-muted">{t.locationsPhone}</span>
                <input
                  type="text"
                  data-testid="location-phone"
                  value={location.phone}
                  disabled={disabled}
                  onChange={(event) => update(index, { phone: event.target.value })}
                  className={INPUT}
                />
              </label>
              <label className="block min-w-0">
                <span className="mb-1 block text-[11px] text-muted">{t.locationsFax}</span>
                <input
                  type="text"
                  data-testid="location-fax"
                  value={location.fax}
                  disabled={disabled}
                  onChange={(event) => update(index, { fax: event.target.value })}
                  className={INPUT}
                />
              </label>
              <label className="block min-w-0">
                <span className="mb-1 block text-[11px] text-muted">{t.locationsEmail}</span>
                <input
                  type="text"
                  data-testid="location-email"
                  value={location.email}
                  disabled={disabled}
                  onChange={(event) => update(index, { email: event.target.value })}
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
                <span className="mt-1 block text-[11px] text-muted">{t.locationsMapHint}</span>
              </label>
              {showMapPreview ? (
                <iframe
                  src={location.mapSrc}
                  title={`${t.locationsCard(index + 1)} · ${t.locationsMap}`}
                  loading="lazy"
                  className="h-[160px] w-full rounded-[4px] border border-black/10"
                />
              ) : null}
              {mapQuery ? (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-[11px] text-accent hover:underline"
                >
                  {t.locationsOpenMap}
                </a>
              ) : null}
            </div>
          </div>
        );
      })}

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
