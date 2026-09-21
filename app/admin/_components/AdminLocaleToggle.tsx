"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  ADMIN_LOCALES,
  ADMIN_LOCALE_COOKIE,
  adminDict,
  type AdminLocale,
} from "@/lib/admin/i18n";

/**
 * KO/EN segmented control for the admin UI.
 *
 * Admin routes are not locale-prefixed, so the choice is persisted in a
 * non-httpOnly cookie (`ADMIN_LOCALE_COOKIE`) and `router.refresh()` re-renders
 * the server shell with the new dictionary. No API route involved.
 */

const LABELS: Record<AdminLocale, string> = { ko: "한국어", en: "English" };

export default function AdminLocaleToggle({ locale }: { locale: AdminLocale }) {
  const router = useRouter();
  const [current, setCurrent] = useState(locale);
  const [pending, startTransition] = useTransition();
  const t = adminDict[locale];

  function select(next: AdminLocale) {
    if (next === current) return;
    setCurrent(next);
    // 1 year, path-wide, readable by the server shell.
    document.cookie = `${ADMIN_LOCALE_COOKIE}=${next};path=/;max-age=31536000;samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <div
      role="group"
      aria-label={t.shell.language}
      className={`flex rounded-[3px] border border-black/10 bg-white p-0.5 ${pending ? "opacity-60" : ""}`}
    >
      {ADMIN_LOCALES.map((value) => {
        const active = value === current;
        return (
          <button
            key={value}
            type="button"
            aria-current={active ? "true" : undefined}
            onClick={() => select(value)}
            className={`rounded-[2px] px-2.5 py-1 text-[12px] font-medium transition-colors ${
              active ? "bg-accent text-white" : "text-muted hover:text-accent"
            }`}
          >
            {LABELS[value]}
          </button>
        );
      })}
    </div>
  );
}
