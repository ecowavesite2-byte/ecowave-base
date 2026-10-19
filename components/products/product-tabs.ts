import type { ProductFilter } from "@/lib/types";

/**
 * Pure helpers for the products category-tab row + filtering. No Next/React
 * imports: the three product routes (landing, category board, detail) call
 * these to derive tabs and the visible post slice from the resolved
 * `productPage` payload, so the copy/order/membership live in the board JSON /
 * override rather than constants in `ProductBoard.tsx`.
 */

/** A rendered category tab (structural match for `ProductTab`). */
export type ProductTabLink = { label: string; href: string; active: boolean };

/**
 * Resolve a requested `?cat=` value against the page's filters.
 *
 * Returns the matching filter `id` (the post `category` string the tab
 * selects) or `null` — the "all" state — when the request is absent or names no
 * filter. Matching is by `id`, never by the display `name`.
 */
export function resolveActiveFilterId(
  filters: readonly ProductFilter[],
  requested?: string | null,
): string | null {
  if (!requested) return null;
  return filters.some((filter) => filter.id === requested) ? requested : null;
}

/**
 * Resolve a requested `?cat=` value across locales.
 *
 * Filter ids are authored per locale (`필터` in KO, `Filter` in EN), so a
 * language switch preserves the query string but the id no longer matches the
 * target locale. When it matches neither list, pair by position against the
 * other locale's filter row: the same category sits at the same index in both
 * (KO/EN boards are authored in parallel order). The returned id is always from
 * `filters`, so filtering, tab highlighting and pagination all use the current
 * locale's category string.
 */
export function resolveFilterIdAcrossLocales(
  filters: readonly ProductFilter[],
  otherFilters: readonly ProductFilter[],
  requested?: string | null,
): string | null {
  const direct = resolveActiveFilterId(filters, requested);
  if (direct !== null || !requested) return direct;
  const index = otherFilters.findIndex((filter) => filter.id === requested);
  if (index < 0) return null;
  return filters[index]?.id ?? null;
}

/**
 * Build the category tab row: `전체` first, then the resolved filters in their
 * stored order (a filter with zero posts still yields a tab). Filter hrefs are
 * `<baseHref>?cat=<id>`; `전체` keeps the bare `baseHref`.
 *
 * `activeId` is the requested `?cat=` value: `전체` is active only when there is
 * no request, and an unknown request leaves no tab active (the board still
 * lists every post — see `filterPostsByCategory`). The detail route passes
 * `null`, which keeps its original `전체`-active tab row.
 */
export function buildProductTabs(
  filters: readonly ProductFilter[],
  allLabel: string,
  baseHref: string,
  activeId?: string | null,
): ProductTabLink[] {
  return [
    { label: allLabel, href: baseHref, active: !activeId },
    ...filters.map((filter) => ({
      label: filter.name,
      href: `${baseHref}?cat=${encodeURIComponent(filter.id)}`,
      active: filter.id === activeId,
    })),
  ];
}

/**
 * Query string for the pagination base: `""` when there is no active filter
 * (`null`), else `?cat=<encoded id>`. Takes the RESOLVED filter id (never the
 * raw `?cat=` request), so an unknown request does not leak into the
 * pagination links.
 */
export function catQueryFor(activeId: string | null): string {
  return activeId === null ? "" : `?cat=${encodeURIComponent(activeId)}`;
}

/**
 * Visible posts for the resolved category: every post (a copy) when `id` is
 * `null`, otherwise the posts whose `category` equals the filter `id`.
 */
export function filterPostsByCategory<T extends { category?: string }>(
  posts: readonly T[],
  id: string | null,
): T[] {
  if (id === null) return posts.slice();
  return posts.filter((post) => post.category === id);
}
