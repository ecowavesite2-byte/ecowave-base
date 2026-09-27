import { describe, expect, it } from "vitest";
import type { BoardPost, ProductFilter } from "@/lib/types";
import { flattenGroups, groupPostsByFilter, moveWithinGroup } from "../group";

/** Pure product-board grouping + re-sequencing (no DOM, no DB). */

function post(idx: string, category?: string): BoardPost {
  return {
    idx,
    title: idx,
    category,
    excerpt: "",
    thumb: null,
    isNotice: false,
    date: null,
    views: null,
    files: [],
  };
}

const FILTERS: ProductFilter[] = [
  { id: "a", name: "A" },
  { id: "b", name: "B" },
];

describe("groupPostsByFilter", () => {
  it("groups posts by id in stored filter order, keeping board order inside a group", () => {
    const posts = [post("p1", "b"), post("p2", "a"), post("p3", "a")];
    const groups = groupPostsByFilter(posts, FILTERS);
    expect(groups.map((g) => g.filterId)).toEqual(["a", "b", null]);
    expect(groups[0].posts.map((p) => p.idx)).toEqual(["p2", "p3"]);
    expect(groups[1].posts.map((p) => p.idx)).toEqual(["p1"]);
    expect(groups[2].posts).toEqual([]);
  });

  it("keeps a filter with zero posts and its display name", () => {
    const groups = groupPostsByFilter([post("p1", "a")], FILTERS);
    expect(groups[1]).toMatchObject({ filterId: "b", name: "B", posts: [] });
  });

  it("puts empty, missing and unknown categories in the unassigned bucket (last)", () => {
    const posts = [
      post("p1", "a"),
      post("p2", ""),
      post("p3"),
      post("p4", "gone"),
    ];
    const groups = groupPostsByFilter(posts, FILTERS);
    expect(groups[0].posts.map((p) => p.idx)).toEqual(["p1"]);
    expect(groups[2].filterId).toBeNull();
    expect(groups[2].posts.map((p) => p.idx)).toEqual(["p2", "p3", "p4"]);
  });
});

describe("moveWithinGroup", () => {
  it("re-sequences the flattened array into group display order", () => {
    const posts = [post("a1", "a"), post("b1", "b"), post("a2", "a"), post("b2", "b")];
    const groups = groupPostsByFilter(posts, FILTERS);
    expect(flattenGroups(groups).map((p) => p.idx)).toEqual(["a1", "a2", "b1", "b2"]);
  });

  it("moves a post up within its group and leaves the rest in display order", () => {
    const posts = [post("a1", "a"), post("b1", "b"), post("a2", "a"), post("b2", "b")];
    const groups = groupPostsByFilter(posts, FILTERS);
    const next = moveWithinGroup(groups, "a", 1, "up");
    expect(flattenGroups(next).map((p) => p.idx)).toEqual(["a2", "a1", "b1", "b2"]);
  });

  it("moves a post down within its group", () => {
    const posts = [post("a1", "a"), post("b1", "b"), post("a2", "a"), post("b2", "b")];
    const groups = groupPostsByFilter(posts, FILTERS);
    const next = moveWithinGroup(groups, "b", 0, "down");
    expect(flattenGroups(next).map((p) => p.idx)).toEqual(["a1", "a2", "b2", "b1"]);
  });

  it("moves posts inside the unassigned bucket (filterId: null)", () => {
    const posts = [post("u1", ""), post("u2"), post("u3", "gone")];
    const groups = groupPostsByFilter(posts, FILTERS);
    const next = moveWithinGroup(groups, null, 2, "up");
    expect(flattenGroups(next).map((p) => p.idx)).toEqual(["u1", "u3", "u2"]);
  });

  it("is a no-op at the edges and for an unknown group", () => {
    const posts = [post("a1", "a"), post("a2", "a")];
    const groups = groupPostsByFilter(posts, FILTERS);
    const topUp = moveWithinGroup(groups, "a", 0, "up");
    const bottomDown = moveWithinGroup(groups, "a", 1, "down");
    const unknown = moveWithinGroup(groups, "zzz", 0, "up");
    expect(flattenGroups(topUp).map((p) => p.idx)).toEqual(["a1", "a2"]);
    expect(flattenGroups(bottomDown).map((p) => p.idx)).toEqual(["a1", "a2"]);
    expect(flattenGroups(unknown).map((p) => p.idx)).toEqual(["a1", "a2"]);
  });

  it("does not mutate the input groups", () => {
    const posts = [post("a1", "a"), post("a2", "a")];
    const groups = groupPostsByFilter(posts, FILTERS);
    const before = flattenGroups(groups).map((p) => p.idx);
    moveWithinGroup(groups, "a", 1, "up");
    expect(flattenGroups(groups).map((p) => p.idx)).toEqual(before);
  });
});
