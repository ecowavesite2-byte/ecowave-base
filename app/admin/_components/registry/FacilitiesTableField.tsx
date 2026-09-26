"use client";

import { useMemo } from "react";

import type { AdminDict } from "@/lib/admin/i18n";

/**
 * Structured `facilitiesTable` editor — the rnd.facilities equipment tables.
 *
 * The value is a JSON object `{ header, rows }` stored as one override string:
 *   `{ header: [string, string], rows: [[string, string]] }`
 * where the header holds the two editable column labels and every row is a pair
 * of cells (equipment name + count). The server-side validator enforces a fixed
 * two-column shape with 1..100 rows; this editor mirrors that defensively (add
 * is capped at 100, the last row cannot be removed, both header inputs are
 * editable). Empty `value` reverts to the code default; every mutation
 * re-serializes the WHOLE payload so the runtime always replaces the table
 * atomically.
 */

/** Domain rule: the table holds at most 100 data rows. */
const MAX_ROWS = 100;

/** The fixed column count for a facilities table. */
const COLUMNS = 2;

type FacilitiesTable = { header: string[]; rows: string[][] };

/** Coerce one cell to a string (non-strings become ""). */
function cell(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Parse the stored JSON; `null` means "malformed" (caller falls back). */
function parseTable(json: string): FacilitiesTable | null {
  try {
    const raw: unknown = JSON.parse(json);
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return { header: ["", ""], rows: [] };
    }
    const record = raw as Record<string, unknown>;
    const headerSource = Array.isArray(record.header) ? record.header : [];
    const header = Array.from({ length: COLUMNS }, (_, i) => cell(headerSource[i]));
    const rows: string[][] = Array.isArray(record.rows)
      ? record.rows.map((rowEntry) => {
          const cells = Array.isArray(rowEntry) ? rowEntry : [];
          return Array.from({ length: COLUMNS }, (_, i) => cell(cells[i]));
        })
      : [];
    return { header, rows };
  } catch {
    return null;
  }
}

const CARD = "rounded-[4px] border border-black/10 bg-soft p-2.5";
const ROW_CARD = "mt-2 rounded-[4px] border border-black/10 bg-white p-2.5";
const ROW_BUTTON =
  "shrink-0 rounded-[3px] border border-black/10 bg-white px-2 py-1 text-[11px] text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-40";
const REMOVE_BUTTON =
  "shrink-0 rounded-[3px] border border-black/10 bg-white px-2 py-1 text-[11px] text-muted transition-colors hover:border-red-400 hover:text-red-600 disabled:opacity-40";
const ADD_BUTTON =
  "h-[32px] rounded-[3px] border border-dashed border-black/20 px-4 text-[12px] text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-40";
const INPUT =
  "h-[36px] w-full rounded-[3px] border border-black/10 bg-white px-3 text-[13px] text-ink outline-none transition-colors placeholder:text-muted focus:border-accent";

export default function FacilitiesTableField({
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
  const parsed = useMemo(() => parseTable(source), [source]);
  const defaultTable = useMemo(
    () => parseTable(defaultValue) ?? { header: ["", ""], rows: [] },
    [defaultValue],
  );

  const invalid = !isDefault && parsed === null;
  const table = parsed ?? defaultTable;
  const atMax = table.rows.length >= MAX_ROWS;

  const commit = (next: FacilitiesTable) => onChange(JSON.stringify(next));

  const updateHeader = (column: number, next: string) => {
    commit({ ...table, header: table.header.map((label, i) => (i === column ? next : label)) });
  };

  const updateCell = (rowIndex: number, column: number, next: string) => {
    commit({
      ...table,
      rows: table.rows.map((row, i) =>
        i === rowIndex ? row.map((value, c) => (c === column ? next : value)) : row,
      ),
    });
  };

  const removeRow = (index: number) => {
    if (table.rows.length <= 1) return;
    commit({ ...table, rows: table.rows.filter((_, i) => i !== index) });
  };

  const moveRow = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= table.rows.length) return;
    const rows = table.rows.slice();
    const [row] = rows.splice(index, 1);
    rows.splice(target, 0, row);
    commit({ ...table, rows });
  };

  const addRow = () => {
    if (table.rows.length >= MAX_ROWS) return;
    commit({ ...table, rows: [...table.rows, Array.from({ length: COLUMNS }, () => "")] });
  };

  return (
    <div className="space-y-2" data-testid="facilities-table-editor">
      {invalid ? <p className="text-[11px] text-amber-600">{t.slidesInvalid}</p> : null}

      <div className="rounded-[4px] border border-black/10 bg-white/60 p-2">
        <span className="mb-1 block text-[11px] font-medium text-muted">
          {t.facilitiesTableHeader}
        </span>
        <div className="grid grid-cols-2 gap-2">
          {table.header.map((label, column) => (
            <label key={column} className="block min-w-0">
              <span className="mb-1 block text-[11px] text-muted">
                {t.facilitiesTableHeaderColumn(column + 1)}
              </span>
              <input
                type="text"
                data-testid={`facilities-table-header-${column + 1}`}
                value={label}
                disabled={disabled}
                onChange={(event) => updateHeader(column, event.target.value)}
                className={INPUT}
              />
            </label>
          ))}
        </div>
      </div>

      {table.rows.map((row, rowIndex) => (
        <div key={rowIndex} data-testid="facilities-table-row" className={CARD}>
          <div className="flex items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
              {t.facilitiesTableRow(rowIndex + 1)}
            </span>
            <button
              type="button"
              data-testid="facilities-table-row-move-up"
              aria-label={t.facilitiesTableMoveUp}
              title={t.facilitiesTableMoveUp}
              disabled={disabled || rowIndex === 0}
              onClick={() => moveRow(rowIndex, -1)}
              className={ROW_BUTTON}
            >
              ↑
            </button>
            <button
              type="button"
              data-testid="facilities-table-row-move-down"
              aria-label={t.facilitiesTableMoveDown}
              title={t.facilitiesTableMoveDown}
              disabled={disabled || rowIndex === table.rows.length - 1}
              onClick={() => moveRow(rowIndex, 1)}
              className={ROW_BUTTON}
            >
              ↓
            </button>
            <button
              type="button"
              data-testid="facilities-table-row-remove"
              disabled={disabled || table.rows.length <= 1}
              onClick={() => removeRow(rowIndex)}
              className={REMOVE_BUTTON}
            >
              {t.facilitiesTableRemove}
            </button>
          </div>

          <div className={`${ROW_CARD} grid grid-cols-2 gap-2`}>
            {row.map((cellValue, column) => (
              <input
                key={column}
                type="text"
                data-testid={`facilities-table-cell-${column + 1}`}
                value={cellValue}
                disabled={disabled}
                onChange={(event) => updateCell(rowIndex, column, event.target.value)}
                className={INPUT}
              />
            ))}
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="facilities-table-row-add"
          disabled={disabled || atMax}
          onClick={addRow}
          className={ADD_BUTTON}
        >
          + {t.facilitiesTableAddRow}
        </button>
        <span className="text-[11px] text-muted">
          {atMax ? t.facilitiesTableMaxHint(MAX_ROWS) : t.facilitiesTableHint}
        </span>
      </div>
    </div>
  );
}
