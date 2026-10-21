import { describe, expect, it } from "vitest";

import type { BoardPost, ProductFilter } from "../../types";
import { copyProductPosts, countUnmappedProductPosts, mapProductCategory } from "../product-copy";

const KO_FILTERS: ProductFilter[] = [
  { id: "필터", name: "필터" },
  { id: "살균모듈", name: "살균모듈" },
];
const EN_FILTERS: ProductFilter[] = [
  { id: "Filter", name: "Filter" },
  { id: "Sterilization module", name: "Sterilization module" },
];

function post(overrides: Partial<BoardPost> = {}): BoardPost {
  return {
    idx: "167494007",
    title: "3단계 필터",
    category: "필터",
    excerpt: "",
    thumb: null,
    isNotice: false,
    date: null,
    views: null,
    content: "<p>본문</p>",
    files: [],
    ...overrides,
  };
}

describe("mapProductCategory", () => {
  it("maps a source category to the target tab at the same position", () => {
    expect(mapProductCategory("필터", KO_FILTERS, EN_FILTERS)).toBe("Filter");
    expect(mapProductCategory("살균모듈", KO_FILTERS, EN_FILTERS)).toBe(
      "Sterilization module",
    );
  });

  it("keeps an identical id that exists in the target", () => {
    expect(mapProductCategory("Filter", KO_FILTERS, EN_FILTERS)).toBe("Filter");
  });

  it("leaves empty/unassigned posts unassigned", () => {
    expect(mapProductCategory("", KO_FILTERS, EN_FILTERS)).toBe("");
    expect(mapProductCategory(undefined, KO_FILTERS, EN_FILTERS)).toBe("");
  });

  it("does not invent a category when the target has no matching tab", () => {
    expect(mapProductCategory("살균모듈", KO_FILTERS, [EN_FILTERS[0]])).toBe("");
  });
});

describe("copyProductPosts", () => {
  it("clones every post and maps only the category", () => {
    const source = [
      post({ idx: "1", category: "필터" }),
      post({ idx: "2", category: "살균모듈", isNotice: true }),
      post({ idx: "3", category: "" }),
    ];
    const copied = copyProductPosts(source, KO_FILTERS, EN_FILTERS);

    expect(copied.map((item) => item.category)).toEqual([
      "Filter",
      "Sterilization module",
      "",
    ]);
    expect(copied[0]).toMatchObject({
      idx: "1",
      title: "3단계 필터",
      content: "<p>본문</p>",
    });
    expect(copied[1].isNotice).toBe(true);
  });

  it("does not mutate the source posts", () => {
    const source = [post({ category: "필터" })];
    copyProductPosts(source, KO_FILTERS, EN_FILTERS);
    expect(source[0].category).toBe("필터");
  });
});

describe("countUnmappedProductPosts", () => {
  it("counts posts whose source tab has no positional target tab", () => {
    const source = [
      post({ idx: "1", category: "필터" }),
      post({ idx: "2", category: "살균모듈" }),
      post({ idx: "3", category: "살균모듈" }),
    ];
    expect(countUnmappedProductPosts(source, KO_FILTERS, EN_FILTERS)).toBe(0);
    expect(countUnmappedProductPosts(source, KO_FILTERS, [EN_FILTERS[0]])).toBe(2);
  });

  it("ignores posts that are already unassigned in the source", () => {
    const source = [post({ category: "" }), post({ category: "legacy" })];
    expect(countUnmappedProductPosts(source, KO_FILTERS, [])).toBe(0);
  });
});
