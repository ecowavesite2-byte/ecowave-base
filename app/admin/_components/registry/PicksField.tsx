"use client";

import { useState } from "react";

import type { AdminDict } from "@/lib/admin/i18n";
import type { BoardOptions } from "./types";

/**
 * `picks` editor — the home notice-ticker post selection.
 *
 * The value is a JSON object stored as one override string:
 *   `{ board: "news" | "notices", idxs: string[] }`
 * where `idxs` are board post ids in the admin's chosen order. Empty selection
 * is written as `""` (revert to the default = the first four news posts); merge
 * ignores a payload with no ids, so only a non-empty selection is ever stored.
 */

type Board = "news" | "notices";
type Picks = { board: Board; idxs: string[] };

/** Parse the stored JSON; always returns a usable shape. */
function parsePicks(json: string): Picks {
  try {
    const raw = JSON.parse(json) as { board?: unknown; idxs?: unknown };
    return {
      board: raw?.board === "notices" ? "notices" : "news",
      idxs: Array.isArray(raw?.idxs)
        ? raw.idxs
            .filter((idx): idx is string | number => typeof idx === "string" || typeof idx === "number")
            .map(String)
        : [],
    };
  } catch {
    return { board: "news", idxs: [] };
  }
}

const SELECT =
  "h-[34px] rounded-[3px] border border-black/10 bg-white px-2 text-[13px] text-ink outline-none transition-colors focus:border-accent";
const ROW =
  "flex items-start gap-2 rounded-[3px] px-2 py-1.5 text-[12px] text-ink transition-colors hover:bg-soft";

export default function PicksField({
  value,
  defaultValue,
  options,
  disabled = false,
  t,
  onChange,
}: {
  value: string;
  defaultValue: string;
  options: BoardOptions;
  disabled?: boolean;
  t: AdminDict["content"];
  onChange: (json: string) => void;
}) {
  const isDefault = value.trim() === "";
  const source = isDefault ? defaultValue : value;
  const parsed = parsePicks(source);
  const [board, setBoard] = useState<Board>(parsed.board);

  const idxs = parsed.idxs;
  const posts = options[board];

  const commit = (nextBoard: Board, nextIdxs: string[]) => {
    if (nextIdxs.length === 0) {
      onChange("");
      return;
    }
    onChange(JSON.stringify({ board: nextBoard, idxs: nextIdxs }));
  };

  const changeBoard = (next: Board) => {
    setBoard(next);
    // Ids belong to one board: clear any selection that came from the other.
    if (idxs.length > 0) onChange("");
  };

  const toggle = (idx: string) => {
    const next = idxs.includes(idx) ? idxs.filter((item) => item !== idx) : [...idxs, idx];
    commit(board, next);
  };

  return (
    <div className="space-y-2" data-testid="picks-editor">
      <label className="flex items-center gap-2">
        <span className="text-[11px] text-muted">{t.picksBoard}</span>
        <select
          value={board}
          disabled={disabled}
          onChange={(event) => changeBoard(event.target.value === "notices" ? "notices" : "news")}
          className={SELECT}
        >
          <option value="news">{t.picksBoardNews}</option>
          <option value="notices">{t.picksBoardNotices}</option>
        </select>
      </label>

      {posts.length === 0 ? (
        <p className="text-[11px] text-muted">{t.picksNoPosts}</p>
      ) : (
        <div className="max-h-[240px] overflow-y-auto rounded-[3px] border border-black/10 bg-white p-1">
          {posts.map((post) => (
            <label key={post.idx} className={ROW}>
              <input
                type="checkbox"
                checked={idxs.includes(post.idx)}
                disabled={disabled}
                onChange={() => toggle(post.idx)}
                className="mt-0.5 h-[16px] w-[16px] shrink-0 accent-[#3465de]"
              />
              <span className="min-w-0">
                <span className="block truncate">{post.title}</span>
                {post.date ? <span className="block text-[11px] text-muted">{post.date}</span> : null}
              </span>
            </label>
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted">{t.picksHint}</p>
    </div>
  );
}
