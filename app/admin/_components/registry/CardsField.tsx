"use client";

import { useMemo } from "react";

import type { AdminDict } from "@/lib/admin/i18n";

/**
 * `cards` editor — the home locations card list.
 *
 * The value is a JSON array stored as one override string:
 *   `[{ lines: string[] }]`
 * where `lines` is one entry per design line (inline HTML allowed). Empty value
 * reverts to the code default; every mutation re-serializes the WHOLE array.
 */

type Card = { lines: string[] };

/** Parse the stored JSON; `null` means "malformed" (caller falls back). */
function parseCards(json: string): Card[] | null {
  try {
    const raw: unknown = JSON.parse(json);
    if (!Array.isArray(raw)) return [];
    return raw.map((entry) => {
      const record =
        typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : {};
      const lines = Array.isArray(record.lines)
        ? record.lines.filter((line): line is string => typeof line === "string")
        : [];
      return { lines };
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
  "min-h-[84px] w-full resize-y rounded-[3px] border border-black/10 bg-white px-3 py-2 font-mono text-[13px] leading-relaxed text-ink outline-none transition-colors placeholder:text-muted focus:border-accent";

export default function CardsField({
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
  const parsed = useMemo(() => parseCards(source), [source]);
  const defaultCards = useMemo(() => parseCards(defaultValue) ?? [], [defaultValue]);

  const invalid = !isDefault && parsed === null;
  const cards = parsed ?? defaultCards;

  const commit = (next: Card[]) => onChange(JSON.stringify(next));

  const update = (index: number, text: string) => {
    const lines = text.split("\n");
    commit(cards.map((card, i) => (i === index ? { lines } : card)));
  };

  const remove = (index: number) => {
    if (cards.length <= 1) return;
    commit(cards.filter((_, i) => i !== index));
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= cards.length) return;
    const next = cards.slice();
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    commit(next);
  };

  const add = () => commit([...cards, { lines: [] }]);

  return (
    <div className="space-y-2" data-testid="cards-editor">
      {invalid ? <p className="text-[11px] text-amber-600">{t.slidesInvalid}</p> : null}

      {cards.map((card, index) => (
        <div key={index} className={CARD}>
          <div className="flex items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
              {t.cardsCard(index + 1)}
            </span>
            <button
              type="button"
              aria-label={t.cardsMoveUp}
              title={t.cardsMoveUp}
              disabled={disabled || index === 0}
              onClick={() => move(index, -1)}
              className={ROW_BUTTON}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={t.cardsMoveDown}
              title={t.cardsMoveDown}
              disabled={disabled || index === cards.length - 1}
              onClick={() => move(index, 1)}
              className={ROW_BUTTON}
            >
              ↓
            </button>
            <button
              type="button"
              disabled={disabled || cards.length <= 1}
              onClick={() => remove(index)}
              className={REMOVE_BUTTON}
            >
              {t.cardsRemove}
            </button>
          </div>
          <textarea
            rows={4}
            value={card.lines.join("\n")}
            disabled={disabled}
            onChange={(event) => update(index, event.target.value)}
            className={`${TEXTAREA} mt-2`}
          />
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={disabled} onClick={add} className={ADD_BUTTON}>
          + {t.cardsAdd}
        </button>
        <span className="text-[11px] text-muted">{t.cardsHint}</span>
      </div>
    </div>
  );
}
