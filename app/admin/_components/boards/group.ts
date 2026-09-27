import type { BoardPost, ProductFilter } from "@/lib/types";

/**
 * Pure grouping + ordering helpers for the product-board post list (client-safe:
 * types only). The board's own post array is the source of truth for order
 * (`sortOrder` is the array index), so reordering re-sequences that whole array:
 * `moveWithinGroup` swaps neighbours inside one group and `flattenGroups` emits
 * the groups in display order — exactly what the editor submits through the
 * existing `replace` action.
 *
 * A post belongs to a filter when `post.category === filter.id`. Every filter
 * keeps its stored order and renders even with zero posts; posts whose category
 * matches no filter (including an empty/missing category) fall into a single
 * trailing "unassigned" bucket (`filterId: null`).
 */

/** One rendered group: a resolved filter, or the unassigned bucket (`filterId: null`). */
export interface BoardGroup {
  /** Filter id, or `null` for the unassigned bucket. */
  filterId: string | null;
  /** Filter display name; empty for the unassigned bucket. */
  name: string;
  /** Posts in board order (same objects as the input, never mutated). */
  posts: BoardPost[];
}

/** Group posts by filter id, in stored filter order, unassigned last. */
export function groupPostsByFilter(posts: BoardPost[], filters: ProductFilter[]): BoardGroup[] {
  const groups: BoardGroup[] = filters.map((filter) => ({
    filterId: filter.id,
    name: filter.name,
    posts: [],
  }));
  const byId = new Map<string, BoardGroup>(
    groups.map((group) => [group.filterId as string, group]),
  );
  const unassigned: BoardPost[] = [];
  for (const post of posts ?? []) {
    const group = typeof post.category === "string" ? byId.get(post.category) : undefined;
    if (group) group.posts.push(post);
    else unassigned.push(post);
  }
  groups.push({ filterId: null, name: "", posts: unassigned });
  return groups;
}

/**
 * Immutably swap a post with its neighbour inside one group. No-op (the same
 * ordering) at the edges or for an unknown group. Untouched groups keep their
 * object identity.
 */
export function moveWithinGroup(
  groups: BoardGroup[],
  filterId: string | null,
  index: number,
  direction: "up" | "down",
): BoardGroup[] {
  const target = index + (direction === "up" ? -1 : 1);
  return groups.map((group) => {
    if (group.filterId !== filterId) return group;
    if (index < 0 || index >= group.posts.length) return group;
    if (target < 0 || target >= group.posts.length) return group;
    const posts = group.posts.slice();
    [posts[index], posts[target]] = [posts[target], posts[index]];
    return { ...group, posts };
  });
}

/** Flatten the groups in display order → the board's post array (defines `sortOrder`). */
export function flattenGroups(groups: BoardGroup[]): BoardPost[] {
  return groups.flatMap((group) => group.posts);
}
