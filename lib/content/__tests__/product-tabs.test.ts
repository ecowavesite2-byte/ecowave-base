import { describe, expect, it } from "vitest";
import type { ProductFilter } from "../../types";
import {
  buildProductTabs,
  catQueryFor,
  filterPostsByCategory,
  resolveActiveFilterId,
  resolveFilterIdAcrossLocales,
} from "../../../components/products/product-tabs";

/**
 * Pure products category-tab helpers: stored filter order, the always-present
 * `전체` tab, id (not name) matching, and the unknown-`?cat=` → all fallback.
 */

/** Distinct id/name pairs so a name can never be mistaken for an id. */
const FILTERS: ProductFilter[] = [
  { id: "a", name: "Alpha" },
  { id: "b", name: "Beta" },
  { id: "empty", name: "Empty" },
];

/** The real KO eco-wave payload: stored order incl. the post-less 살균모듈 tab. */
const KO_ECO_WAVE: ProductFilter[] = [
  { id: "필터", name: "필터" },
  { id: "서비스 점검/자가관리 키트", name: "서비스 점검/자가관리 키트" },
  { id: "살균모듈", name: "살균모듈" },
];

describe("buildProductTabs", () => {
  it("puts 전체 first, then filters in stored order, labelled by name", () => {
    expect(buildProductTabs(FILTERS, "전체", "/products/x", null)).toEqual([
      { label: "전체", href: "/products/x", active: true },
      { label: "Alpha", href: "/products/x?cat=a", active: false },
      { label: "Beta", href: "/products/x?cat=b", active: false },
      { label: "Empty", href: "/products/x?cat=empty", active: false },
    ]);
  });

  it("keeps a post-less filter as a tab (KO 살균모듈)", () => {
    const tabs = buildProductTabs(
      KO_ECO_WAVE,
      "전체",
      "/products/eco-wave",
      null,
    );
    expect(tabs.map((t) => t.label)).toEqual([
      "전체",
      "필터",
      "서비스 점검/자가관리 키트",
      "살균모듈",
    ]);
    // non-ASCII + space + slash ids are percent-encoded in the href
    expect(tabs[2].href).toBe(
      `/products/eco-wave?cat=${encodeURIComponent("서비스 점검/자가관리 키트")}`,
    );
  });

  it("activates the tab whose id matches (never the display name)", () => {
    const byId = buildProductTabs(FILTERS, "전체", "/p", "b");
    expect(byId.find((t) => t.label === "Beta")?.active).toBe(true);
    expect(byId.find((t) => t.label === "전체")?.active).toBe(false);

    // "Alpha" is a name, not an id → no tab active
    const byName = buildProductTabs(FILTERS, "전체", "/p", "Alpha");
    expect(byName.some((t) => t.active)).toBe(false);
  });

  it("leaves no active tab for an unknown requested id, 전체 active for null", () => {
    const unknown = buildProductTabs(FILTERS, "전체", "/p", "does-not-exist");
    expect(unknown.some((t) => t.active)).toBe(false);
    expect(buildProductTabs(FILTERS, "전체", "/p", null)[0].active).toBe(true);
    expect(buildProductTabs(FILTERS, "전체", "/p", undefined)[0].active).toBe(
      true,
    );
  });
});

describe("resolveActiveFilterId", () => {
  it("returns the matching id", () => {
    expect(resolveActiveFilterId(FILTERS, "a")).toBe("a");
    expect(resolveActiveFilterId(FILTERS, "empty")).toBe("empty");
  });

  it("returns null (the all state) for absent or unknown requests", () => {
    expect(resolveActiveFilterId(FILTERS, undefined)).toBeNull();
    expect(resolveActiveFilterId(FILTERS, null)).toBeNull();
    expect(resolveActiveFilterId(FILTERS, "")).toBeNull();
    expect(resolveActiveFilterId(FILTERS, "nope")).toBeNull();
  });

  it("matches by id, not by name", () => {
    expect(resolveActiveFilterId(FILTERS, "Alpha")).toBeNull();
  });
});

describe("resolveFilterIdAcrossLocales", () => {
  const EN_ECO_WAVE: ProductFilter[] = [
    { id: "Filter", name: "Filter" },
    { id: "Service check/self-care kit", name: "Service check/self-care kit" },
    { id: "Sterilization module", name: "Sterilization module" },
  ];

  it("maps a foreign-locale id onto the local filter at the same position", () => {
    // Switching EN → KO with ?cat=Filter keeps the filter active.
    expect(
      resolveFilterIdAcrossLocales(KO_ECO_WAVE, EN_ECO_WAVE, "Filter"),
    ).toBe("필터");
    // And KO → EN with the Korean id.
    expect(
      resolveFilterIdAcrossLocales(
        EN_ECO_WAVE,
        KO_ECO_WAVE,
        "서비스 점검/자가관리 키트",
      ),
    ).toBe("Service check/self-care kit");
  });

  it("prefers a direct local id and leaves absent/unknown values in the all state", () => {
    expect(
      resolveFilterIdAcrossLocales(KO_ECO_WAVE, EN_ECO_WAVE, "살균모듈"),
    ).toBe("살균모듈");
    expect(
      resolveFilterIdAcrossLocales(KO_ECO_WAVE, EN_ECO_WAVE, undefined),
    ).toBeNull();
    expect(
      resolveFilterIdAcrossLocales(KO_ECO_WAVE, EN_ECO_WAVE, ""),
    ).toBeNull();
    expect(
      resolveFilterIdAcrossLocales(KO_ECO_WAVE, EN_ECO_WAVE, "nope"),
    ).toBeNull();
  });

  it("does not invent a filter when the other locale has fewer filters", () => {
    const short: ProductFilter[] = [{ id: "only", name: "Only" }];
    expect(
      resolveFilterIdAcrossLocales(short, KO_ECO_WAVE, "살균모듈"),
    ).toBeNull();
  });
});

describe("catQueryFor", () => {
  it("returns an empty string for the all state (null)", () => {
    expect(catQueryFor(null)).toBe("");
  });

  it("encodes a normal id", () => {
    expect(catQueryFor("filter")).toBe("?cat=filter");
  });

  it("percent-encodes special characters (space, slash, non-ASCII)", () => {
    expect(catQueryFor("서비스 점검/자가관리 키트")).toBe(
      `?cat=${encodeURIComponent("서비스 점검/자가관리 키트")}`,
    );
    expect(catQueryFor("a b/c?d")).toBe(
      `?cat=${encodeURIComponent("a b/c?d")}`,
    );
  });
});

describe("filterPostsByCategory", () => {
  const posts = [
    { category: "a", title: "one" },
    { category: "b", title: "two" },
    { title: "none" },
  ];

  it("returns every post when the id is null (unknown/absent → all)", () => {
    expect(filterPostsByCategory(posts, null)).toEqual(posts);
    // composition: unknown ?cat= resolves to null → all posts
    expect(
      filterPostsByCategory(posts, resolveActiveFilterId(FILTERS, "nope")),
    ).toEqual(posts);
  });

  it("matches post.category against the filter id", () => {
    expect(filterPostsByCategory(posts, "a")).toEqual([
      { category: "a", title: "one" },
    ]);
    expect(filterPostsByCategory(posts, "missing")).toEqual([]);
  });
});
