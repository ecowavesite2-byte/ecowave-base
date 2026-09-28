import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPrismaMock, loadOverridesMock } = vi.hoisted(() => ({
  getPrismaMock: vi.fn(),
  loadOverridesMock: vi.fn(async () => ({}) as Record<string, string>),
}));

vi.mock("../db", () => ({
  getPrisma: getPrismaMock,
  isDbConfigured: vi.fn(() => false),
  loadOverrides: loadOverridesMock,
}));

import type { ProductPagePayload } from "../../types";
import { boardLabel } from "../boards";
import { CONTENT_DEF_MAP, DEFAULT_VALUES } from "../registry";
import { normalizeBoardSlug } from "../paths";
import { getBoard } from "../read";
import { getResolvedProductPage, resolveProductPage } from "../resolved";
import { normalizeProductPagePayload, saveContent } from "../save";

/**
 * Product-channel `productPage` kind: the shared save validator plus the
 * resolved board-JSON/override funnel. No live DB — `loadOverrides` is mocked.
 *
 * The payload carries ONE hero title (`title`) rendered identically on desktop
 * and mobile, plus `subtitle` and the filter tabs. `mobileTitle` was removed;
 * legacy stored payloads that still carry it are accepted and stripped.
 */

const ECO_WAVE_KEY = "products.eco-wave#productPage/productPage";

/** B1.1 canonical defaults, mirrored here so the parity test pins exact copy. */
const EXPECTED: Record<string, { ko: ProductPagePayload; en: ProductPagePayload }> = {
  "products.eco-wave": {
    ko: {
      title: "Eco wave",
      subtitle: "에코웨이브",
      filters: [
        { id: "필터", name: "필터" },
        { id: "서비스 점검/자가관리 키트", name: "서비스 점검/자가관리 키트" },
        { id: "살균모듈", name: "살균모듈" },
      ],
    },
    en: {
      title: "Eco wave",
      subtitle: "",
      filters: [
        { id: "Filter", name: "Filter" },
        { id: "Service check/self-care kit", name: "Service check/self-care kit" },
        { id: "Sterilization module", name: "Sterilization module" },
      ],
    },
  },
  "products.clean-b": {
    ko: {
      title: "clean B",
      subtitle: "에코웨이브",
      filters: [
        { id: "샤워기", name: "샤워기" },
        { id: "필터", name: "필터" },
      ],
    },
    en: {
      title: "clean B",
      subtitle: "",
      filters: [
        { id: "Shower", name: "Shower" },
        { id: "Filter", name: "Filter" },
      ],
    },
  },
  "products.flowell": {
    ko: {
      title: "Flowell",
      subtitle: "플로웰",
      filters: [
        { id: "정수기", name: "정수기" },
        { id: "필터", name: "필터" },
      ],
    },
    en: {
      title: "Flowell",
      subtitle: "",
      filters: [
        { id: "Water purifier", name: "Water purifier" },
        { id: "Filter", name: "Filter" },
      ],
    },
  },
};

const BASE: ProductPagePayload = {
  title: "T",
  subtitle: "S",
  filters: [{ id: "a", name: "a" }],
};

type UpsertArgs = {
  create: { key: string; locale: string; value: string; updatedBy: string | null };
};
function makeFakePrisma() {
  const upsert = vi.fn(async (_args: UpsertArgs) => ({}));
  const deleteMany = vi.fn(async () => ({ count: 0 }));
  return { upsert, deleteMany, prisma: { pageContent: { upsert, deleteMany } } };
}

beforeEach(() => {
  vi.clearAllMocks();
  getPrismaMock.mockReturnValue(null);
  loadOverridesMock.mockResolvedValue({});
  // The resolver warns once on an invalid override; keep the test output clean.
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("normalizeProductPagePayload", () => {
  it("round-trips a valid payload to canonical JSON (trimmed, unknown keys dropped)", () => {
    const value = JSON.stringify({
      title: "  제목  ",
      subtitle: "  부제  ",
      filters: [
        { id: "  a  ", name: "  A  ", extra: 1 },
        { id: "b", name: "B" },
      ],
      junk: true,
    });
    expect(normalizeProductPagePayload(value)).toBe(
      JSON.stringify({
        title: "제목",
        subtitle: "부제",
        filters: [
          { id: "a", name: "A" },
          { id: "b", name: "B" },
        ],
      }),
    );
  });

  it("strips a legacy mobileTitle (canonical output has no mobileTitle key)", () => {
    const normalized = normalizeProductPagePayload(
      JSON.stringify({ ...BASE, mobileTitle: "에코웨이브(Eco wave)" }),
    );
    expect(normalized).toBe(JSON.stringify(BASE));
    expect(Object.keys(JSON.parse(normalized!))).toEqual(["title", "subtitle", "filters"]);
    // A non-string legacy value is likewise just an ignored unknown key.
    expect(normalizeProductPagePayload(JSON.stringify({ ...BASE, mobileTitle: 5 }))).toBe(
      JSON.stringify(BASE),
    );
  });

  it("rejects malformed payloads", () => {
    const bad = [
      "not json",
      "[]",
      "{}",
      "null",
      JSON.stringify({ subtitle: "s", filters: BASE.filters }), // missing title
      JSON.stringify({ ...BASE, title: "" }),
      JSON.stringify({ ...BASE, title: "   " }),
      JSON.stringify({ ...BASE, title: 5 }),
      JSON.stringify({ ...BASE, subtitle: 5 }),
      JSON.stringify({ title: "t", subtitle: "s" }), // missing filters
      JSON.stringify({ ...BASE, filters: {} }),
      JSON.stringify({ ...BASE, filters: [] }),
      JSON.stringify({ ...BASE, filters: [null] }),
      JSON.stringify({ ...BASE, filters: [{ id: "a" }] }), // missing name
      JSON.stringify({ ...BASE, filters: [{ id: 1, name: "a" }] }),
      JSON.stringify({ ...BASE, filters: [{ id: "", name: "a" }] }),
      JSON.stringify({ ...BASE, filters: [{ id: "  ", name: "a" }] }),
      JSON.stringify({ ...BASE, filters: [{ id: "a", name: "" }] }),
    ];
    for (const value of bad) {
      expect(normalizeProductPagePayload(value), value).toBeNull();
    }
  });

  it("accepts an empty subtitle (EN product heroes omit it)", () => {
    expect(normalizeProductPagePayload(JSON.stringify({ ...BASE, subtitle: "" }))).toBe(
      JSON.stringify({ ...BASE, subtitle: "" }),
    );
    expect(normalizeProductPagePayload(JSON.stringify({ ...BASE, subtitle: "   " }))).toBe(
      JSON.stringify({ ...BASE, subtitle: "" }),
    );
  });

  it("rejects duplicate ids and duplicate names", () => {
    expect(
      normalizeProductPagePayload(
        JSON.stringify({
          ...BASE,
          filters: [
            { id: "a", name: "One" },
            { id: "a", name: "Two" },
          ],
        }),
      ),
    ).toBeNull();
    expect(
      normalizeProductPagePayload(
        JSON.stringify({
          ...BASE,
          filters: [
            { id: "a", name: "Same" },
            { id: "b", name: "Same" },
          ],
        }),
      ),
    ).toBeNull();
  });

  it("enforces the caps (title/subtitle ≤120, id/name ≤60, 1..20 filters)", () => {
    const title = (n: number) => "t".repeat(n);
    expect(normalizeProductPagePayload(JSON.stringify({ ...BASE, title: title(120) }))).not.toBeNull();
    expect(normalizeProductPagePayload(JSON.stringify({ ...BASE, title: title(121) }))).toBeNull();
    expect(normalizeProductPagePayload(JSON.stringify({ ...BASE, subtitle: title(120) }))).not.toBeNull();
    expect(normalizeProductPagePayload(JSON.stringify({ ...BASE, subtitle: title(121) }))).toBeNull();

    const filter = (n: number) => ({ id: "i".repeat(n), name: "n".repeat(n) });
    expect(
      normalizeProductPagePayload(JSON.stringify({ ...BASE, filters: [filter(60)] })),
    ).not.toBeNull();
    expect(
      normalizeProductPagePayload(JSON.stringify({ ...BASE, filters: [filter(61)] })),
    ).toBeNull();

    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ id: `id${i}`, name: `name${i}` }));
    expect(normalizeProductPagePayload(JSON.stringify({ ...BASE, filters: many(20) }))).not.toBeNull();
    expect(normalizeProductPagePayload(JSON.stringify({ ...BASE, filters: many(21) }))).toBeNull();
  });
});

describe("resolveProductPage (pure)", () => {
  it("returns a valid override (normalized)", () => {
    const stored = JSON.stringify({
      title: "  Override  ",
      subtitle: "Sub",
      filters: [{ id: " x ", name: " y " }],
      junk: 1,
    });
    expect(resolveProductPage(BASE, stored)).toEqual({
      title: "Override",
      subtitle: "Sub",
      filters: [{ id: "x", name: "y" }],
    });
  });

  it("ignores a stored legacy mobileTitle (render-side reader)", () => {
    const stored = JSON.stringify({
      title: "Override",
      subtitle: "Sub",
      mobileTitle: "에코웨이브(Eco wave)",
      filters: [{ id: "f", name: "F" }],
    });
    const resolved = resolveProductPage(BASE, stored);
    expect(resolved).toEqual({
      title: "Override",
      subtitle: "Sub",
      filters: [{ id: "f", name: "F" }],
    });
    expect(resolved).not.toHaveProperty("mobileTitle");
  });

  it("returns the base (same reference) for empty/absent/invalid overrides", () => {
    expect(resolveProductPage(BASE, undefined)).toBe(BASE);
    expect(resolveProductPage(BASE, null)).toBe(BASE);
    expect(resolveProductPage(BASE, "")).toBe(BASE);
    expect(resolveProductPage(BASE, "   ")).toBe(BASE);
    expect(resolveProductPage(BASE, "{not json")).toBe(BASE);
    expect(resolveProductPage(BASE, JSON.stringify({ ...BASE, filters: [] }))).toBe(BASE);
  });
});

describe("getResolvedProductPage", () => {
  it("returns the board JSON base (B1.1 copy) for both locales", async () => {
    expect(await getResolvedProductPage("ko", "products/eco-wave")).toEqual(
      EXPECTED["products.eco-wave"].ko,
    );
    expect(await getResolvedProductPage("en", "products/eco-wave")).toEqual(
      EXPECTED["products.eco-wave"].en,
    );
    expect(await getResolvedProductPage("ko", "products/clean-b")).toEqual(
      EXPECTED["products.clean-b"].ko,
    );
    expect(await getResolvedProductPage("en", "products/flowell")).toEqual(
      EXPECTED["products.flowell"].en,
    );
  });

  it("canonicalizes a slash slug to the dot override key", async () => {
    loadOverridesMock.mockResolvedValue({
      [ECO_WAVE_KEY]: JSON.stringify({
        title: "Override",
        subtitle: "Sub",
        filters: [{ id: "f", name: "F" }],
      }),
    });
    expect(await getResolvedProductPage("ko", "products/eco-wave")).toEqual({
      title: "Override",
      subtitle: "Sub",
      filters: [{ id: "f", name: "F" }],
    });
  });

  it("drops a stored legacy mobileTitle from the resolved payload", async () => {
    loadOverridesMock.mockResolvedValue({
      [ECO_WAVE_KEY]: JSON.stringify({
        title: "Override",
        subtitle: "Sub",
        mobileTitle: "에코웨이브(Eco wave)",
        filters: [{ id: "f", name: "F" }],
      }),
    });
    const resolved = await getResolvedProductPage("ko", "products/eco-wave");
    expect(resolved).toEqual({
      title: "Override",
      subtitle: "Sub",
      filters: [{ id: "f", name: "F" }],
    });
    expect(resolved).not.toHaveProperty("mobileTitle");
  });

  it("applies a valid override on top of the base", async () => {
    loadOverridesMock.mockResolvedValue({
      [ECO_WAVE_KEY]: JSON.stringify({
        title: "  New title  ",
        subtitle: "New sub",
        filters: [
          { id: "x", name: "X" },
          { id: "y", name: "Y" },
        ],
      }),
    });
    const resolved = await getResolvedProductPage("ko", "products/eco-wave");
    expect(resolved).toEqual({
      title: "New title",
      subtitle: "New sub",
      filters: [
        { id: "x", name: "X" },
        { id: "y", name: "Y" },
      ],
    });
  });

  it("falls back to the base when the override is invalid or empty", async () => {
    const base = await getResolvedProductPage("ko", "products/eco-wave");
    loadOverridesMock.mockResolvedValue({ [ECO_WAVE_KEY]: JSON.stringify({ ...BASE, filters: [] }) });
    expect(await getResolvedProductPage("ko", "products/eco-wave")).toEqual(base);
    loadOverridesMock.mockResolvedValue({ [ECO_WAVE_KEY]: "   " });
    expect(await getResolvedProductPage("ko", "products/eco-wave")).toEqual(base);
  });
});

describe("saveContent productPage validation (no DB)", () => {
  const actor = "admin@example.com";
  const def = Object.values(CONTENT_DEF_MAP).find((d) => d.kind === "productPage")!;

  it("has a registry def of kind productPage", () => {
    expect(def).toBeDefined();
    expect(def.pageKey.startsWith("products.")).toBe(true);
  });

  it("rejects malformed payloads with the productPage message", async () => {
    for (const value of ["not json", "{}", JSON.stringify({ ...BASE, filters: [] })]) {
      const result = await saveContent({ key: def.key, locale: "ko", value, actor });
      expect(result.ok, value).toBe(false);
      expect(result.message).toContain("Invalid productPage payload");
    }
  });

  it("stores a valid payload normalized (trimmed, unknown fields dropped)", async () => {
    const { upsert, prisma } = makeFakePrisma();
    getPrismaMock.mockReturnValue(prisma as never);
    const value = JSON.stringify({
      title: "  Title  ",
      subtitle: "Sub",
      filters: [{ id: " a ", name: " A ", extra: 1 }],
      junk: true,
    });

    const result = await saveContent({ key: def.key, locale: "ko", value, actor });

    expect(result).toEqual({ ok: true });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0].create.value).toBe(
      JSON.stringify({
        title: "Title",
        subtitle: "Sub",
        filters: [{ id: "a", name: "A" }],
      }),
    );
  });

  it("accepts a legacy payload carrying mobileTitle and stores it stripped", async () => {
    const { upsert, prisma } = makeFakePrisma();
    getPrismaMock.mockReturnValue(prisma as never);
    const value = JSON.stringify({
      title: "Title",
      subtitle: "Sub",
      mobileTitle: "레거시 모바일 제목",
      filters: [{ id: "a", name: "A" }],
    });

    const result = await saveContent({ key: def.key, locale: "ko", value, actor });

    expect(result).toEqual({ ok: true });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0].create.value).toBe(
      JSON.stringify({
        title: "Title",
        subtitle: "Sub",
        filters: [{ id: "a", name: "A" }],
      }),
    );
    expect(upsert.mock.calls[0][0].create.value).not.toContain("mobileTitle");
  });
});

describe("eco-wave productPage revalidation", () => {
  it("revalidates the /products landing (it renders this payload)", () => {
    const def = CONTENT_DEF_MAP["products.eco-wave#productPage/productPage"];
    expect(def).toBeDefined();
    expect(def.revalidate).toContain("/products");
    expect(def.revalidate).toContain("/en/products");
  });

  it("does not add the landing routes to the other product boards", () => {
    for (const slug of ["products.clean-b", "products.flowell"]) {
      const def = CONTENT_DEF_MAP[`${slug}#productPage/productPage`];
      expect(def).toBeDefined();
      expect(def.revalidate).not.toContain("/products");
      expect(def.revalidate).not.toContain("/en/products");
    }
  });
});

describe("productPage defaults parity", () => {
  for (const slug of Object.keys(EXPECTED)) {
    it(`${slug}: DEFAULT_VALUES === board JSON page/filters (both locales)`, () => {
      const def = Object.values(CONTENT_DEF_MAP).find(
        (candidate) => candidate.kind === "productPage" && candidate.pageKey === slug,
      );
      expect(def).toBeDefined();
      expect(def!.key).toBe(`${slug}#productPage/productPage`);

      for (const locale of ["ko", "en"] as const) {
        const stored = DEFAULT_VALUES[def!.key][locale];
        expect(stored).toBeDefined();
        // Generated default == B1.1 expected copy.
        expect(JSON.parse(stored!)).toEqual(EXPECTED[slug][locale]);
        // Exactly the canonical three keys (no legacy `mobileTitle`).
        expect(Object.keys(JSON.parse(stored!)).sort()).toEqual(["filters", "subtitle", "title"]);
        // Generated default == the board JSON on disk.
        const board = getBoard(locale, normalizeBoardSlug(slug));
        expect({
          title: board.page?.title,
          subtitle: board.page?.subtitle,
          filters: board.filters,
        }).toEqual(EXPECTED[slug][locale]);
        // The generated default is already canonical (validator is identity).
        expect(normalizeProductPagePayload(stored!)).toBe(stored);
      }
    });
  }

  it("DEFAULT_VALUES for all 3 boards are exactly { title, subtitle, filters }", () => {
    for (const slug of Object.keys(EXPECTED)) {
      const key = `${slug}#productPage/productPage`;
      for (const locale of ["ko", "en"] as const) {
        const stored = DEFAULT_VALUES[key][locale];
        expect(stored, `${key}/${locale}`).toBeDefined();
        const parsed = JSON.parse(stored!) as Record<string, unknown>;
        expect(Object.keys(parsed).sort()).toEqual(["filters", "subtitle", "title"]);
        expect(parsed.mobileTitle).toBeUndefined();
      }
    }
  });
});

/**
 * The generator's `LABELS.productPage`. Pinned here (the generator's LABELS is
 * not exported) so a label change that is not regenerated into the registry, or
 * a stray hand edit, is caught. Read against the generated defs below.
 */
const PRODUCT_PAGE_SECTION = { ko: "제품 페이지", en: "Product page" };

describe("product lane registry labels (parity)", () => {
  const PRODUCT_SLUGS = ["products.eco-wave", "products.clean-b", "products.flowell"];

  it("board name-def sections mirror the Boards-lane BOARD_LABELS (not humanized slug)", () => {
    for (const slug of PRODUCT_SLUGS) {
      const def = CONTENT_DEF_MAP[`${slug}#board/${slug}/name`];
      expect(def, slug).toBeDefined();
      expect(def.section).toEqual({
        ko: boardLabel(slug, "ko"),
        en: boardLabel(slug, "en"),
      });
    }
  });

  it("productPage sections use the distinct productPage label (no ` (2)` suffix)", () => {
    for (const slug of PRODUCT_SLUGS) {
      const def = CONTENT_DEF_MAP[`${slug}#productPage/productPage`];
      expect(def, slug).toBeDefined();
      expect(def.section).toEqual(PRODUCT_PAGE_SECTION);
      // Distinct from the board-name section on the same page, so
      // `disambiguateSectionNames` never appends a ` (2)` suffix.
      const boardDef = CONTENT_DEF_MAP[`${slug}#board/${slug}/name`];
      for (const locale of ["ko", "en"] as const) {
        expect(def.section[locale]).not.toBe(boardDef.section[locale]);
        expect(def.section[locale]).not.toContain("(2)");
      }
    }
  });
});
