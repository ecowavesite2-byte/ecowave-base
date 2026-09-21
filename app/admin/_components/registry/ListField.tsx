"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { AdminDict } from "@/lib/admin/i18n";

/**
 * Dynamic `list` editor — the registry's collection kind.
 *
 * The value is a JSON array stored as a single override string (empty = revert
 * to the code default, matching the API's "empty deletes the override" rule).
 * Rows are collapsible (like MCell's history/office/cert list editors): the
 * header shows a summary and each row expands into per-field inputs.
 *
 * Scalar fields get type-appropriate controls; nested arrays/objects get a
 * compact JSON box. Columns are derived from the row objects themselves, so the
 * editor stays generic across every list shape the registry emits.
 */

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRows(json: string): unknown[] {
  if (!json.trim()) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Preferred summary keys, in order, for the collapsed row label. */
const SUMMARY_KEYS = ["title", "name", "text", "label", "year", "idx"];

function rowSummary(row: JsonRecord, index: number): string {
  for (const key of SUMMARY_KEYS) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  for (const value of Object.values(row)) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return `#${index + 1}`;
}

/** Empty value matching the type of an existing one (used for a new row). */
function blankLike(value: unknown): unknown {
  if (typeof value === "string") return "";
  if (typeof value === "number") return null;
  if (typeof value === "boolean") return false;
  if (Array.isArray(value)) return [];
  return null;
}

function newRow(rows: JsonRecord[]): JsonRecord {
  const shape = rows.find((row) => Object.keys(row).length > 0);
  if (!shape) return { title: "" };
  const row: JsonRecord = {};
  for (const [key, value] of Object.entries(shape)) row[key] = blankLike(value);
  if (typeof shape.idx === "string") {
    row.idx = `new-${Date.now().toString(36)}`;
  }
  return row;
}

/** Compact JSON box for nested arrays/objects, committing only valid JSON. */
function JsonValueInput({
  value,
  label,
  onChange,
}: {
  value: unknown;
  label: string;
  onChange: (next: unknown) => void;
}) {
  const [buffer, setBuffer] = useState(() => JSON.stringify(value ?? null));
  const [invalid, setInvalid] = useState(false);
  const bufferRef = useRef(buffer);
  bufferRef.current = buffer;

  useEffect(() => {
    const external = JSON.stringify(value ?? null);
    // Keep the user's in-progress text when it already means the same thing.
    if (bufferRef.current === external) return;
    try {
      if (JSON.stringify(JSON.parse(bufferRef.current)) === external) return;
    } catch {
      /* invalid buffer: fall through and reset */
    }
    setBuffer(external);
    setInvalid(false);
  }, [value]);

  return (
    <textarea
      rows={3}
      value={buffer}
      spellCheck={false}
      aria-invalid={invalid || undefined}
      aria-label={label}
      onChange={(event) => {
        const next = event.target.value;
        setBuffer(next);
        try {
          onChange(JSON.parse(next) as unknown);
          setInvalid(false);
        } catch {
          setInvalid(true);
        }
      }}
      className={`w-full resize-y rounded-[3px] border bg-white px-2 py-1.5 font-mono text-[12px] text-ink outline-none transition-colors focus:border-accent ${
        invalid ? "border-red-400" : "border-black/10"
      }`}
    />
  );
}

const ROW_INPUT =
  "h-[34px] w-full rounded-[3px] border border-black/10 bg-white px-2 text-[13px] text-ink outline-none transition-colors placeholder:text-muted focus:border-accent";
const ROW_BUTTON =
  "shrink-0 rounded-[3px] border border-black/10 bg-white px-2 py-1 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-40";

export default function ListField({
  value,
  defaultValue,
  t,
  onChange,
}: {
  value: string;
  defaultValue: string;
  t: AdminDict["content"];
  onChange: (json: string) => void;
}) {
  const isDefault = value.trim() === "";
  const source = isDefault ? defaultValue : value;
  const rows = useMemo(() => parseRows(source), [source]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const records = rows.every(isRecord);

  const commit = (next: JsonRecord[]) => {
    onChange(next.length === 0 ? "" : JSON.stringify(next));
  };

  const updateRow = (index: number, patch: JsonRecord) => {
    commit(rows.map((row, i) => (i === index && isRecord(row) ? { ...row, ...patch } : (row as JsonRecord))));
  };

  const removeRow = (index: number) => {
    commit(rows.filter((_, i) => i !== index) as JsonRecord[]);
    setExpanded(null);
  };

  const moveRow = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const next = rows.slice() as JsonRecord[];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    commit(next);
    setExpanded(null);
  };

  const addRow = () => {
    const next = [...(rows as JsonRecord[]), newRow(rows as JsonRecord[])];
    commit(next);
    setExpanded(next.length - 1);
  };

  // A list whose entries are not objects cannot be edited field-by-field.
  if (rows.length > 0 && !records) {
    return (
      <div className="space-y-2">
        <p className="text-[12px] text-muted">{t.listItems(rows.length)}</p>
        <JsonValueInput value={rows} label={t.listJsonValue} onChange={(next) => onChange(JSON.stringify(next))} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-muted">{t.listItems(rows.length)}</span>
        {isDefault ? (
          <span className="rounded-[3px] bg-soft px-1.5 py-0.5 text-[11px] text-muted">
            {t.defaultBadge}
          </span>
        ) : null}
      </div>

      {rows.length === 0 ? <p className="text-[12px] text-muted">{t.listEmpty}</p> : null}

      {rows.map((raw, index) => {
        const row = raw as JsonRecord;
        const open = expanded === index;
        return (
          <div key={index} className="rounded-[4px] border border-black/10 bg-soft">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setExpanded(open ? null : index)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden
                  className={`shrink-0 text-muted transition-transform ${open ? "rotate-90" : ""}`}
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
                <span className="truncate text-[13px] font-medium text-ink">{rowSummary(row, index)}</span>
              </button>
              <button
                type="button"
                aria-label={t.listMoveUp}
                title={t.listMoveUp}
                disabled={index === 0}
                onClick={() => moveRow(index, -1)}
                className={ROW_BUTTON}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={t.listMoveDown}
                title={t.listMoveDown}
                disabled={index === rows.length - 1}
                onClick={() => moveRow(index, 1)}
                className={ROW_BUTTON}
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => removeRow(index)}
                className="shrink-0 rounded-[3px] border border-black/10 bg-white px-2 py-1 text-[11px] text-muted transition-colors hover:border-red-400 hover:text-red-600"
              >
                {t.listRemove}
              </button>
            </div>

            {open ? (
              <div className="grid grid-cols-1 gap-2 border-t border-black/5 p-2.5 lg:grid-cols-2">
                {Object.entries(row).map(([field, fieldValue]) => (
                  <label key={field} className="block min-w-0">
                    <span className="mb-1 block font-mono text-[11px] text-muted">{field}</span>
                    {typeof fieldValue === "boolean" ? (
                      <input
                        type="checkbox"
                        checked={fieldValue}
                        onChange={(event) => updateRow(index, { [field]: event.target.checked })}
                        className="h-[18px] w-[18px] accent-[#3465de]"
                      />
                    ) : typeof fieldValue === "number" ? (
                      <input
                        type="number"
                        value={String(fieldValue)}
                        onChange={(event) =>
                          updateRow(index, {
                            [field]: event.target.value === "" ? null : Number(event.target.value),
                          })
                        }
                        className={ROW_INPUT}
                      />
                    ) : typeof fieldValue === "string" || fieldValue === null ? (
                      <input
                        type="text"
                        value={fieldValue ?? ""}
                        onChange={(event) =>
                          updateRow(index, { [field]: event.target.value === "" ? null : event.target.value })
                        }
                        className={ROW_INPUT}
                      />
                    ) : (
                      <JsonValueInput
                        value={fieldValue}
                        label={t.listJsonValue}
                        onChange={(next) => updateRow(index, { [field]: next })}
                      />
                    )}
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={addRow}
          className="h-[32px] rounded-[3px] border border-dashed border-black/20 px-4 text-[12px] text-muted transition-colors hover:border-accent hover:text-accent"
        >
          + {t.listAdd}
        </button>
        <span className="text-[11px] text-muted">{t.listDefaultNote}</span>
      </div>
    </div>
  );
}
