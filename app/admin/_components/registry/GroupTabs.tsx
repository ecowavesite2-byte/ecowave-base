"use client";

import Link from "next/link";

import { adminDict } from "@/lib/admin/i18n";
import type { RegistryLocale } from "./types";

/**
 * Group tab row for the registry editor (home | company | rnd | …).
 *
 * Tabs are real links (`/admin/content?group=…`): switching a group re-renders
 * the server page so it can hand the client that group's code defaults and
 * read-only page trees without shipping every group to the browser.
 */

export default function GroupTabs({
  locale,
  groups,
  active,
}: {
  locale: RegistryLocale;
  groups: string[];
  active: string;
}) {
  const t = adminDict[locale];
  const labels = t.nav.content as Record<string, string | undefined>;

  return (
    <nav
      aria-label={t.content.title}
      className="flex flex-wrap gap-1 rounded-[4px] border border-black/10 bg-white p-1"
    >
      {groups.map((group) => {
        const isActive = group === active;
        return (
          <Link
            key={group}
            href={`/admin/content?group=${encodeURIComponent(group)}`}
            aria-current={isActive ? "page" : undefined}
            className={`rounded-[3px] px-3 py-1.5 text-[12px] font-medium transition-colors ${
              isActive ? "bg-accent text-white" : "text-muted hover:text-accent"
            }`}
          >
            {labels[group] ?? group}
          </Link>
        );
      })}
    </nav>
  );
}
