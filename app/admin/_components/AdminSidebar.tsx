"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import {
  ADMIN_BOARD_ENTRIES,
  ADMIN_CONTENT_GROUPS,
  adminDict,
  type AdminLocale,
} from "@/lib/admin/i18n";

/**
 * Grouped admin navigation, modelled on MCell's `AdminSidebar`.
 *
 * Active-state rules (same idiom as MCell):
 *   - `exact` entries match only the landing path (`/admin`);
 *   - an entry may carry `query`, which must all match `useSearchParams`
 *     (so `/admin/content?group=products` highlights only that group link);
 *   - `defaultQuery` additionally treats an ABSENT param as a match, so the
 *     group link whose param the content page would default to ("home") stays
 *     highlighted on a bare `/admin/content`.
 *
 * Board links carry `?locale=` inside `href` (the board editor reads it) but are
 * matched on pathname only — the slug already identifies the entry.
 *
 * Below the desktop breakpoint the parent shell hides this nav and shows the
 * desktop-only notice instead, so the mobile classes below are inert by design
 * (kept for parity with MCell).
 */

interface SidebarEntry {
  href: string;
  label: string;
  /** exact pathname match (ignores query) */
  exact?: boolean;
  /** also require these query params to match */
  query?: Record<string, string>;
  /** treat an absent query param as matching (the page's own default) */
  defaultQuery?: boolean;
}

interface SidebarGroup {
  key: string;
  label: string;
  entries: SidebarEntry[];
}

function buildGroups(locale: AdminLocale): SidebarGroup[] {
  const t = adminDict[locale];
  const boardLocale = locale === "en" ? "en" : "ko";

  return [
    {
      key: "main",
      label: "",
      entries: [{ href: "/admin", label: t.nav.overview, exact: true }],
    },
    {
      key: "content",
      label: t.nav.contentGroup,
      entries: ADMIN_CONTENT_GROUPS.map(({ group, key }) => ({
        href: "/admin/content",
        query: { group },
        defaultQuery: group === "home",
        label: t.nav.content[key],
      })),
    },
    {
      key: "boards",
      label: t.nav.boardsGroup,
      entries: ADMIN_BOARD_ENTRIES.map(({ slug, key }) => ({
        href: `/admin/boards/${slug}?locale=${boardLocale}`,
        label: t.nav.boards[key],
      })),
    },
    {
      key: "manage",
      label: t.nav.managementGroup,
      entries: [
        { href: "/admin/settings", label: t.nav.settings },
        { href: "/admin/inquiries", label: t.nav.inquiries },
      ],
    },
  ];
}

/** Append an entry's `query` to its href (board hrefs already carry `?locale=`). */
function entryHref(entry: SidebarEntry): string {
  if (!entry.query) return entry.href;
  const qs = new URLSearchParams(entry.query).toString();
  return `${entry.href}${entry.href.includes("?") ? "&" : "?"}${qs}`;
}

export default function AdminSidebar({ locale }: { locale: AdminLocale }) {
  const pathname = usePathname() ?? "/admin";
  const params = useSearchParams();
  const t = adminDict[locale];
  const groups = buildGroups(locale);
  const barePath = "/admin";

  const isActive = (entry: SidebarEntry) => {
    if (!pathname.startsWith(barePath)) return false;
    const sub = pathname.slice(barePath.length) || "/";
    if (entry.exact) return sub === "/";
    const path = entry.href.split("?")[0];
    const base = path.slice(barePath.length) || "/";
    if (sub !== base) return false;
    if (!entry.query) return true;
    return Object.entries(entry.query).every(([k, v]) => {
      const actual = params.get(k);
      return actual === v || (entry.defaultQuery === true && actual === null);
    });
  };

  return (
    <nav
      aria-label={t.shell.title}
      className="flex shrink-0 gap-2 overflow-x-auto min-[992px]:sticky min-[992px]:top-6 min-[992px]:max-h-[calc(100vh-3rem)] min-[992px]:w-[190px] min-[992px]:flex-col min-[992px]:self-start min-[992px]:overflow-y-auto"
    >
      {groups.map((group) => (
        <div key={group.key} className="min-[992px]:mb-1">
          {group.label ? (
            <p className="mt-2 hidden px-3 pb-1 text-[11px] font-medium tracking-wide text-muted uppercase min-[992px]:block">
              {group.label}
            </p>
          ) : null}
          <ul className="flex gap-2 min-[992px]:flex-col min-[992px]:gap-0.5">
            {group.entries.map((entry) => {
              const active = isActive(entry);
              return (
                <li key={entry.href + JSON.stringify(entry.query ?? {})}>
                  <Link
                    href={entryHref(entry)}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center rounded-[3px] border px-3 py-2 text-[13px] whitespace-nowrap transition-colors ${
                      active
                        ? "border-accent bg-accent text-white"
                        : "border-transparent bg-white text-ink hover:border-black/15 hover:text-accent min-[992px]:border-transparent min-[992px]:bg-transparent"
                    }`}
                  >
                    {entry.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
