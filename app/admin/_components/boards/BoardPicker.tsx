"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { adminDict, type AdminLocale } from "@/lib/admin/i18n";
import type { BoardListResponse, BoardLocale, BoardSummary } from "./types";

/** Board picker: five slugs, locale switch, materialized/defaults badges. */

export default function BoardPicker({
  initialLocale,
  adminLocale,
}: {
  initialLocale: BoardLocale;
  adminLocale: AdminLocale;
}) {
  const t = adminDict[adminLocale].boards;
  const LOCALES: { value: BoardLocale; label: string }[] = [
    { value: "ko", label: t.localeKo },
    { value: "en", label: t.localeEn },
  ];
  const [locale, setLocale] = useState<BoardLocale>(initialLocale);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [dbConfigured, setDbConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    (async () => {
      try {
        const response = await fetch(`/api/admin/boards?locale=${locale}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as BoardListResponse;
        if (cancelled) return;
        setBoards(data.boards);
        setDbConfigured(data.dbConfigured);
      } catch {
        if (cancelled) return;
        setBoards([]);
        setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [locale, refresh]);

  return (
    <div className="mx-auto max-w-[960px] p-8">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold tracking-tight text-ink">{t.title}</h1>
          <p className="mt-0.5 text-[13px] text-[#6b7280]">{t.pickerBlurb}</p>
        </div>
        <div className="ml-auto flex rounded-md border border-line bg-white p-0.5">
          {LOCALES.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-current={locale === item.value ? "true" : undefined}
              onClick={() => setLocale(item.value)}
              className={`rounded px-3 py-1 text-[12px] font-medium transition-colors ${
                locale === item.value ? "bg-accent text-white" : "text-[#6b7280] hover:text-accent"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {!dbConfigured ? (
        <div
          role="status"
          className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900"
        >
          {t.dbNotice}
        </div>
      ) : null}

      {error ? (
        <div className="mt-6 flex items-center gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
          <span>{t.pickerLoadError}</span>
          <button
            type="button"
            onClick={() => setRefresh((n) => n + 1)}
            className="ml-auto rounded-md border border-red-200 bg-white px-2.5 py-1 text-[12px] text-red-700 transition-colors hover:border-red-400"
          >
            {t.retry}
          </button>
        </div>
      ) : null}

      {loading ? <p className="mt-6 text-[13px] text-[#6b7280]">{t.loading}</p> : null}

      {!loading && !error ? (
        <div className="mt-6 overflow-hidden rounded-lg border border-line bg-white">
          {boards.map((board, index) => (
            <Link
              key={board.slug}
              href={`/admin/boards/${board.slug}?locale=${locale}`}
              className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[#f4f5f7] ${
                index > 0 ? "border-t border-line" : ""
              }`}
            >
              <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">
                {board.label}
              </span>
              <span className="hidden font-mono text-[11px] text-[#9ca3af] sm:inline">
                {board.slug}
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  board.materialized
                    ? "bg-[#ecfdf5] text-[#047857]"
                    : "bg-[#f3f4f6] text-[#6b7280]"
                }`}
              >
                {board.materialized ? t.overrides : t.defaults}
              </span>
              <span className="shrink-0 rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[11px] font-medium text-[#4b5563]">
                {t.postCount(board.count)}
              </span>
              {board.hasEnglish ? null : (
                <span className="shrink-0 rounded-full bg-[#eef2ff] px-2 py-0.5 text-[10px] font-medium text-[#4338ca]">
                  {t.enInherits}
                </span>
              )}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
