"use client";

import { useMemo } from "react";

import type { AdminDict } from "@/lib/admin/i18n";
import { ImageControl } from "./FieldRow";
import type { RegistryLocale } from "./types";

/**
 * Structured `techFeatures` editor — the rnd.technology feature blocks.
 *
 * The value is a JSON object `{ blocks }` stored as one override string:
 *   `{ blocks: [{ items: [{ image, heading, rows: [{ label, body }] }] }] }`
 *
 * There are EXACTLY THREE fixed groups, in page order:
 *   block 1 → §4 eco-friendly / premium
 *   block 2 → §5 OEM / inspection
 *   block 3 → §6 smart / sterilization + mass production
 * Blocks cannot be added, removed or reordered. Inside each block the item
 * editor is the previous one: 1..12 items, each a shared ImageControl, a
 * MULTILINE `heading` (authored design lines joined with `\n`) and 1..30
 * label/body rows whose `body` also keeps authored `\n` line breaks. The
 * server-side validator enforces those bounds; this editor mirrors them
 * defensively (add is capped, the last item and the last row cannot be
 * removed).
 *
 * Parsing is defensive: a valid v2 payload renders the three groups, while a
 * malformed value — including the legacy `{ items }` shape — falls back to the
 * code default (or an empty three-block state) and never throws. Empty `value`
 * reverts to the code default; every mutation re-serializes the WHOLE v2
 * payload so the runtime always replaces the block atomically.
 */

/** The fixed group count (page §4 / §5 / §6). */
const BLOCK_COUNT = 3;
/** Domain rules: per-block item count and per-item row count caps. */
const MAX_ITEMS = 12;
const MAX_ROWS = 30;

type TechFeatureRow = { label: string; body: string };
type TechFeatureItem = { image: string; heading: string; rows: TechFeatureRow[] };
/** One fixed group: its ordered, editable items. */
type TechFeatureBlock = TechFeatureItem[];

/** A fresh, editable empty group (one empty item keeps remove disabled). */
function emptyBlock(): TechFeatureBlock {
  return [{ image: "", heading: "", rows: [{ label: "", body: "" }] }];
}

/** The empty fallback state: three editable empty groups. */
function emptyBlocks(): TechFeatureBlock[] {
  return Array.from({ length: BLOCK_COUNT }, () => emptyBlock());
}

/** Coerce the stored `rows` array, dropping anything non-string. */
function parseRows(value: unknown): TechFeatureRow[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const record =
      typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : {};
    return {
      label: typeof record.label === "string" ? record.label : "",
      body: typeof record.body === "string" ? record.body : "",
    };
  });
}

/** Coerce one block's `items` array. */
function parseItems(value: unknown): TechFeatureItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const record =
      typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : {};
    return {
      image: typeof record.image === "string" ? record.image : "",
      heading: typeof record.heading === "string" ? record.heading : "",
      rows: parseRows(record.rows),
    };
  });
}

/** Force the parsed groups into the fixed three-block shape (pad/truncate). */
function normalizeBlocks(blocks: TechFeatureBlock[]): TechFeatureBlock[] {
  const next = blocks.slice(0, BLOCK_COUNT);
  while (next.length < BLOCK_COUNT) next.push(emptyBlock());
  return next;
}

/** Parse the stored JSON; `null` means "invalid" (caller falls back). */
function parseTechFeatures(json: string): TechFeatureBlock[] | null {
  try {
    const raw: unknown = JSON.parse(json);
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
    const blocks = (raw as Record<string, unknown>).blocks;
    if (!Array.isArray(blocks)) return null; // legacy `{ items }` or malformed
    return normalizeBlocks(
      blocks.map((entry) => {
        const record =
          typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : {};
        return parseItems(record.items);
      }),
    );
  } catch {
    return null;
  }
}

const BLOCK = "rounded-[6px] border border-black/10 bg-black/[0.015] p-2.5";
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
const TEXTAREA =
  "min-h-[60px] w-full resize-y rounded-[3px] border border-black/10 bg-white px-3 py-2 font-mono text-[13px] leading-relaxed text-ink outline-none transition-colors placeholder:text-muted focus:border-accent";

export default function TechFeaturesField({
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
  const parsed = useMemo(() => parseTechFeatures(source), [source]);
  const defaultBlocks = useMemo(
    () => parseTechFeatures(defaultValue) ?? emptyBlocks(),
    [defaultValue],
  );

  const invalid = !isDefault && parsed === null;
  const blocks = parsed ?? defaultBlocks;

  /** Every mutation rewrites the whole v2 payload atomically. */
  const commit = (next: TechFeatureBlock[]) =>
    onChange(JSON.stringify({ blocks: next.map((items) => ({ items })) }));

  const updateBlock = (blockIndex: number, nextBlock: TechFeatureBlock) => {
    commit(blocks.map((block, i) => (i === blockIndex ? nextBlock : block)));
  };

  const updateItem = (
    blockIndex: number,
    itemIndex: number,
    patch: Partial<TechFeatureItem>,
  ) => {
    const block = blocks[blockIndex];
    if (!block) return;
    updateBlock(
      blockIndex,
      block.map((item, i) => (i === itemIndex ? { ...item, ...patch } : item)),
    );
  };

  const removeItem = (blockIndex: number, itemIndex: number) => {
    const block = blocks[blockIndex];
    if (!block || block.length <= 1) return;
    updateBlock(blockIndex, block.filter((_, i) => i !== itemIndex));
  };

  const moveItem = (blockIndex: number, itemIndex: number, delta: number) => {
    const block = blocks[blockIndex];
    if (!block) return;
    const target = itemIndex + delta;
    if (target < 0 || target >= block.length) return;
    const next = block.slice();
    const [item] = next.splice(itemIndex, 1);
    next.splice(target, 0, item);
    updateBlock(blockIndex, next);
  };

  const addItem = (blockIndex: number) => {
    const block = blocks[blockIndex];
    if (!block || block.length >= MAX_ITEMS) return;
    updateBlock(blockIndex, [...block, { image: "", heading: "", rows: [{ label: "", body: "" }] }]);
  };

  const updateRow = (
    blockIndex: number,
    itemIndex: number,
    rowIndex: number,
    patch: Partial<TechFeatureRow>,
  ) => {
    const item = blocks[blockIndex]?.[itemIndex];
    if (!item) return;
    updateItem(blockIndex, itemIndex, {
      rows: item.rows.map((row, i) => (i === rowIndex ? { ...row, ...patch } : row)),
    });
  };

  const removeRow = (blockIndex: number, itemIndex: number, rowIndex: number) => {
    const item = blocks[blockIndex]?.[itemIndex];
    if (!item || item.rows.length <= 1) return;
    updateItem(blockIndex, itemIndex, { rows: item.rows.filter((_, i) => i !== rowIndex) });
  };

  const moveRow = (blockIndex: number, itemIndex: number, rowIndex: number, delta: number) => {
    const item = blocks[blockIndex]?.[itemIndex];
    if (!item) return;
    const target = rowIndex + delta;
    if (target < 0 || target >= item.rows.length) return;
    const rows = item.rows.slice();
    const [row] = rows.splice(rowIndex, 1);
    rows.splice(target, 0, row);
    updateItem(blockIndex, itemIndex, { rows });
  };

  const addRow = (blockIndex: number, itemIndex: number) => {
    const item = blocks[blockIndex]?.[itemIndex];
    if (!item || item.rows.length >= MAX_ROWS) return;
    updateItem(blockIndex, itemIndex, { rows: [...item.rows, { label: "", body: "" }] });
  };

  return (
    <div className="space-y-3">
      {invalid ? <p className="text-[11px] text-amber-600">{t.slidesInvalid}</p> : null}

      {blocks.map((block, blockIndex) => {
        const atMax = block.length >= MAX_ITEMS;
        return (
          <section key={blockIndex} data-testid="tech-feature-block" className={BLOCK}>
            <div className="mb-2 flex items-baseline gap-2">
              <span className="text-[12px] font-semibold text-ink">
                {t.techFeaturesBlock(blockIndex + 1)}
              </span>
              <span className="min-w-0 truncate text-[11px] text-muted">
                {t.techFeaturesBlocks[blockIndex]}
              </span>
            </div>

            <div className="space-y-2" data-testid="tech-features-editor">
              {block.map((item, index) => (
                <div key={index} data-testid="tech-feature-card" className={CARD}>
                  <div className="flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                      {t.techFeaturesItem(index + 1)}
                    </span>
                    <button
                      type="button"
                      data-testid="tech-feature-move-up"
                      aria-label={t.techFeaturesMoveUp}
                      title={t.techFeaturesMoveUp}
                      disabled={disabled || index === 0}
                      onClick={() => moveItem(blockIndex, index, -1)}
                      className={ROW_BUTTON}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      data-testid="tech-feature-move-down"
                      aria-label={t.techFeaturesMoveDown}
                      title={t.techFeaturesMoveDown}
                      disabled={disabled || index === block.length - 1}
                      onClick={() => moveItem(blockIndex, index, 1)}
                      className={ROW_BUTTON}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      data-testid="tech-feature-remove"
                      disabled={disabled || block.length <= 1}
                      onClick={() => removeItem(blockIndex, index)}
                      className={REMOVE_BUTTON}
                    >
                      {t.techFeaturesRemove}
                    </button>
                  </div>

                  <div className="mt-2 space-y-2">
                    <div data-testid="tech-feature-image">
                      <span className="mb-1 block text-[11px] text-muted">
                        {t.techFeaturesImage}
                      </span>
                      <ImageControl
                        draft={item.image}
                        fallback=""
                        locale={lang}
                        t={t}
                        disabled={disabled}
                        onChange={(next) => updateItem(blockIndex, index, { image: next })}
                      />
                    </div>

                    <label className="block min-w-0">
                      <span className="mb-1 block text-[11px] text-muted">
                        {t.techFeaturesHeading}
                      </span>
                      <textarea
                        data-testid="tech-feature-heading"
                        rows={2}
                        value={item.heading}
                        disabled={disabled}
                        onChange={(event) =>
                          updateItem(blockIndex, index, { heading: event.target.value })
                        }
                        className={TEXTAREA}
                      />
                    </label>

                    <div className="rounded-[4px] border border-black/10 bg-white/60 p-2">
                      <span className="mb-1 block text-[11px] font-medium text-muted">
                        {t.techFeaturesRows}
                      </span>
                      <div className="space-y-2">
                        {item.rows.map((row, rowIndex) => (
                          <div
                            key={rowIndex}
                            data-testid="tech-feature-row"
                            className={ROW_CARD}
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink">
                                {t.techFeaturesRow} {rowIndex + 1}
                              </span>
                              <button
                                type="button"
                                data-testid="tech-feature-row-move-up"
                                aria-label={t.techFeaturesMoveUp}
                                title={t.techFeaturesMoveUp}
                                disabled={disabled || rowIndex === 0}
                                onClick={() => moveRow(blockIndex, index, rowIndex, -1)}
                                className={ROW_BUTTON}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                data-testid="tech-feature-row-move-down"
                                aria-label={t.techFeaturesMoveDown}
                                title={t.techFeaturesMoveDown}
                                disabled={disabled || rowIndex === item.rows.length - 1}
                                onClick={() => moveRow(blockIndex, index, rowIndex, 1)}
                                className={ROW_BUTTON}
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                data-testid="tech-feature-row-remove"
                                disabled={disabled || item.rows.length <= 1}
                                onClick={() => removeRow(blockIndex, index, rowIndex)}
                                className={REMOVE_BUTTON}
                              >
                                {t.techFeaturesRemove}
                              </button>
                            </div>
                            <div className="mt-2 space-y-2">
                              <label className="block min-w-0">
                                <span className="mb-1 block text-[11px] text-muted">
                                  {t.techFeaturesRowLabel}
                                </span>
                                <input
                                  type="text"
                                  data-testid="tech-feature-row-label"
                                  value={row.label}
                                  disabled={disabled}
                                  onChange={(event) =>
                                    updateRow(blockIndex, index, rowIndex, {
                                      label: event.target.value,
                                    })
                                  }
                                  className={INPUT}
                                />
                              </label>
                              <label className="block min-w-0">
                                <span className="mb-1 block text-[11px] text-muted">
                                  {t.techFeaturesRowBody}
                                </span>
                                <textarea
                                  data-testid="tech-feature-row-body"
                                  rows={3}
                                  value={row.body}
                                  disabled={disabled}
                                  onChange={(event) =>
                                    updateRow(blockIndex, index, rowIndex, {
                                      body: event.target.value,
                                    })
                                  }
                                  className={TEXTAREA}
                                />
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        data-testid="tech-feature-row-add"
                        disabled={disabled || item.rows.length >= MAX_ROWS}
                        onClick={() => addRow(blockIndex, index)}
                        className={`${ADD_BUTTON} mt-2`}
                      >
                        + {t.techFeaturesAddRow}
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="tech-feature-add"
                  disabled={disabled || atMax}
                  onClick={() => addItem(blockIndex)}
                  className={ADD_BUTTON}
                >
                  + {t.techFeaturesAdd}
                </button>
                <span className="text-[11px] text-muted">
                  {atMax ? t.techFeaturesMaxHint(MAX_ITEMS) : t.techFeaturesHint}
                </span>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
