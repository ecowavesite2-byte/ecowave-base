"use client";

import type { Locale } from "@/lib/i18n";
import { translationCoverage, type Coverage } from "../../_lib/tree";

/**
 * Editor locale tabs (KO │ EN) with a translation-coverage badge.
 *
 * The parent owns navigation: clicking a tab calls `onLocaleChange`, which
 * reloads the editor for the other locale (the server page carries `?locale=`).
 */
export default function LocaleTabs({
  locale,
  hasEnglish,
  ko,
  en,
  onLocaleChange,
}: {
  locale: Locale;
  hasEnglish: boolean;
  ko: Coverage;
  en: Coverage | null;
  onLocaleChange: (locale: Locale) => void;
}) {
  let badgeLabel: string;
  let badgeClass: string;

  if (!hasEnglish) {
    badgeLabel = "Inherited";
    badgeClass = "bg-[#eef2ff] text-[#4338ca]";
  } else {
    const relative = translationCoverage(en ?? { total: 0, filled: 0 }, ko);
    const missing = relative.total - relative.filled;
    if (missing <= 0) {
      badgeLabel = "Translated";
      badgeClass = "bg-[#ecfdf5] text-[#047857]";
    } else {
      badgeLabel = `Missing ${missing}`;
      badgeClass = "bg-amber-100 text-amber-800";
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div role="tablist" aria-label="Editor locale" className="flex rounded-md border border-line bg-white p-0.5">
        {(["ko", "en"] as const).map((value) => {
          const active = locale === value;
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onLocaleChange(value)}
              className={`rounded px-2.5 py-1 text-[12px] font-medium transition-colors ${
                active ? "bg-accent text-white" : "text-[#6b7280] hover:text-accent"
              }`}
            >
              {value === "ko" ? "KO" : "EN"}
            </button>
          );
        })}
      </div>
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeClass}`}>
        {badgeLabel}
      </span>
    </div>
  );
}
