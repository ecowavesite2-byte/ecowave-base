import type { BoardPost, ProductFilter } from "../types";

/**
 * Cross-locale product-list copy.
 *
 * Filter ids ARE locale-specific by design: they double as the post `category`
 * string a tab selects, so KO `필터` and EN `Filter` are different ids for the
 * same tab. Copying posts verbatim would therefore leave every copied product
 * unassigned. The two locales author the same tabs in the same order, so map the
 * source category onto the target tab at the SAME INDEX, falling back to a
 * literal id match (identical ids across locales) and finally to unassigned.
 *
 * Pure and client-safe: the admin editor uses it before PUTting the target board.
 */
export function mapProductCategory(
  category: string | undefined,
  sourceFilters: ProductFilter[],
  targetFilters: ProductFilter[],
): string {
  if (!category) return "";
  const index = sourceFilters.findIndex((filter) => filter.id === category);
  if (index >= 0) return targetFilters[index]?.id ?? "";
  return targetFilters.some((filter) => filter.id === category) ? category : "";
}

/**
 * Clone `posts` for the target locale with their categories mapped onto
 * `targetFilters`. Every other field (title, content, media, ordering flags) is
 * copied untouched so the admin can translate it in place afterwards.
 */
export function copyProductPosts(
  posts: BoardPost[],
  sourceFilters: ProductFilter[],
  targetFilters: ProductFilter[],
): BoardPost[] {
  return posts.map((post) => ({
    ...post,
    category: mapProductCategory(post.category, sourceFilters, targetFilters),
  }));
}

/**
 * Number of source posts that are assigned to a source tab but have no target
 * tab at the same position. Copying those would create posts that no filter in
 * the target locale can display (the admin editor renders per-filter groups
 * only), so the caller refuses the copy and asks for aligned tabs first.
 * Posts already unassigned in the source are ignored — they stay unassigned.
 */
export function countUnmappedProductPosts(
  posts: BoardPost[],
  sourceFilters: ProductFilter[],
  targetFilters: ProductFilter[],
): number {
  return posts.filter(
    (post) =>
      !!post.category &&
      sourceFilters.some((filter) => filter.id === post.category) &&
      !mapProductCategory(post.category, sourceFilters, targetFilters),
  ).length;
}
