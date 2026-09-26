import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPrismaMock } = vi.hoisted(() => ({ getPrismaMock: vi.fn() }));

vi.mock("../db", () => ({
  getPrisma: getPrismaMock,
  isDbConfigured: vi.fn(() => false),
  loadOverrides: vi.fn(async () => ({})),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// The company.global HQ map was the registry's only `embed` def and is now
// covered by the page-level `locations` def (item 0 `mapSrc`). Append a
// synthetic embed def so the embed media-validation path stays exercised.
const { SYNTHETIC_EMBED_DEF } = vi.hoisted(() => ({
  SYNTHETIC_EMBED_DEF: {
    key: "synthetic#embed/embed/iframe[0].src",
    group: "home",
    pageKey: "home",
    sectionId: "embed",
    widgetId: "embed",
    field: "iframe[0].src",
    kind: "embed",
    section: { ko: "합성 임베드", en: "Synthetic embed" },
    label: { ko: "임베드 주소", en: "Embed URL" },
    revalidate: [] as string[],
  },
}));

vi.mock("../registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../registry")>();
  const def = SYNTHETIC_EMBED_DEF as unknown as (typeof actual.CONTENT_DEFS)[number];
  return {
    ...actual,
    CONTENT_DEFS: [...actual.CONTENT_DEFS, def],
    CONTENT_DEF_MAP: { ...actual.CONTENT_DEF_MAP, [def.key]: def },
  };
});

import { revalidatePath } from "next/cache";
import { CONTENT_DEFS, MAX_LENGTH, type ContentDef } from "../registry";
import { DB_NOT_CONFIGURED_MESSAGE, saveContent } from "../save";

const revalidatePathMock = vi.mocked(revalidatePath);

type UpsertArgs = {
  where: { key_locale: { key: string; locale: string } };
  create: { key: string; locale: string; value: string; updatedBy: string | null };
  update: { value: string; updatedBy: string | null };
};
type DeleteManyArgs = { where: { key: string; locale: { in: string[] } } };

function makeFakePrisma() {
  const upsert = vi.fn(async (_args: UpsertArgs) => ({}));
  const deleteMany = vi.fn(async (_args: DeleteManyArgs) => ({ count: 0 }));
  return { upsert, deleteMany, prisma: { pageContent: { upsert, deleteMany } } };
}

function defOfKind(kind: ContentDef["kind"]): ContentDef {
  const def = CONTENT_DEFS.find((candidate) => candidate.kind === kind);
  if (!def) throw new Error(`No registry def of kind ${kind}`);
  return def;
}

const actor = "admin@example.com";

beforeEach(() => {
  vi.clearAllMocks();
  getPrismaMock.mockReturnValue(null);
});

describe("saveContent validation (no DB)", () => {
  it("rejects an unknown registry key", async () => {
    const result = await saveContent({
      key: "not#a/real/key",
      locale: "ko",
      value: "x",
      actor,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Unknown content key");
  });

  it("rejects an invalid locale", async () => {
    const def = defOfKind("text");
    const result = await saveContent({
      key: def.key,
      locale: "fr" as unknown as "ko",
      value: "x",
      actor,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("locale must be ko or en");
  });

  it("rejects a value over MAX_LENGTH for its kind", async () => {
    const def = defOfKind("text");
    const result = await saveContent({
      key: def.key,
      locale: "ko",
      value: "x".repeat(MAX_LENGTH.text + 1),
      actor,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("character limit");
  });

  it("rejects malformed image/url values", async () => {
    const imageDef = defOfKind("image");
    const bad = [
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      "//evil.example/x.png",
      "/has space.png",
      '<img src="x">',
      "relative/without/slash.png",
    ];
    for (const value of bad) {
      const result = await saveContent({ key: imageDef.key, locale: "ko", value, actor });
      expect(result.ok, `should reject: ${value}`).toBe(false);
      expect(result.message).toContain("Invalid image value");
    }
  });

  it("accepts a well-formed relative image path (then reports the missing DB)", async () => {
    const imageDef = defOfKind("image");
    const result = await saveContent({
      key: imageDef.key,
      locale: "ko",
      value: "/images/thumbnail/20250911/example.png",
      actor,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toBe(DB_NOT_CONFIGURED_MESSAGE);
  });

  it("returns the not-configured message when DATABASE_URL is unset", async () => {
    const def = defOfKind("lines");
    const result = await saveContent({ key: def.key, locale: "ko", value: "<p>hi</p>", actor });
    expect(result).toEqual({ ok: false, message: DB_NOT_CONFIGURED_MESSAGE });
  });

  it("returns the not-configured message for an empty (revert) value too", async () => {
    const def = defOfKind("lines");
    const result = await saveContent({ key: def.key, locale: "ko", value: "   ", actor });
    expect(result).toEqual({ ok: false, message: DB_NOT_CONFIGURED_MESSAGE });
  });
});

describe("saveContent structured payload validation (no DB)", () => {
  it("rejects malformed/empty slides payloads", async () => {
    const def = defOfKind("slides");
    const bad = [
      "[]", // empty list would blank the hero
      "{}", // not an array
      "not json",
      '[{"subtitle":"b"}]', // missing title
      '[{"title":"t","subtitle":"s"},{"title":5}]', // title not a string
      '[{"bg":1,"title":"t"}]', // bg neither null nor string
      '[{"title":"t","subtitle":["x"]}]', // subtitle not a string
    ];
    for (const value of bad) {
      const result = await saveContent({ key: def.key, locale: "ko", value, actor });
      expect(result.ok, `should reject: ${value}`).toBe(false);
      expect(result.message).toContain("Invalid slides payload");
    }
  });

  it("accepts a well-formed slides payload (then reports the missing DB)", async () => {
    const def = defOfKind("slides");
    const value = JSON.stringify([
      { bg: null, title: "Big", subtitle: "Small" },
      { bg: "/images/hero.jpg", title: "Title only", subtitle: "Sub" },
    ]);
    const result = await saveContent({ key: def.key, locale: "ko", value, actor });
    expect(result).toEqual({ ok: false, message: DB_NOT_CONFIGURED_MESSAGE });
  });

  it("rejects malformed/empty cards payloads", async () => {
    const def = defOfKind("cards");
    const bad = [
      "[]", // a cards list must not be emptied
      "{}", // not an array
      "not json",
      "[{}]", // missing lines
      '[{"lines":"x"}]', // lines not an array
      '[{"lines":[1]}]', // non-string line
    ];
    for (const value of bad) {
      const result = await saveContent({ key: def.key, locale: "ko", value, actor });
      expect(result.ok, `should reject: ${value}`).toBe(false);
      expect(result.message).toContain("Invalid cards payload");
    }
  });

  it("accepts a well-formed cards payload (then reports the missing DB)", async () => {
    const def = defOfKind("cards");
    const value = JSON.stringify([{ lines: ["KOR", "[KOREA]", "Incheon"] }]);
    const result = await saveContent({ key: def.key, locale: "ko", value, actor });
    expect(result).toEqual({ ok: false, message: DB_NOT_CONFIGURED_MESSAGE });
  });

  it("rejects malformed/empty picks payloads", async () => {
    const def = defOfKind("picks");
    const bad = [
      "{}", // missing board + idxs
      "not json",
      '{"board":"support","idxs":["1"]}', // unknown board
      '{"board":"news"}', // missing idxs
      '{"board":"news","idxs":[]}', // empty idxs
      '{"board":"notices","idxs":[{}]}', // non-string/number idx
    ];
    for (const value of bad) {
      const result = await saveContent({ key: def.key, locale: "ko", value, actor });
      expect(result.ok, `should reject: ${value}`).toBe(false);
      expect(result.message).toContain("Invalid picks payload");
    }
  });

  it("accepts a well-formed picks payload (then reports the missing DB)", async () => {
    const def = defOfKind("picks");
    const value = JSON.stringify({ board: "news", idxs: ["101", "102"] });
    const result = await saveContent({ key: def.key, locale: "ko", value, actor });
    expect(result).toEqual({ ok: false, message: DB_NOT_CONFIGURED_MESSAGE });
  });

  it("rejects malformed/empty eras payloads", async () => {
    const def = defOfKind("eras");
    const bad = [
      "[]", // an eras list must not be emptied
      "{}", // not an array
      "not json",
      "[{}]", // missing everything
      '[{"range":1}]', // range not a string
      '[{"range":"r","tagline":"t","image":"i"}]', // missing years
      '[{"range":"r","tagline":"t","image":"i","years":[{"year":"y"}]}]', // missing items
      '[{"range":"r","tagline":"t","image":"i","years":[{"year":"y","items":[1]}]}]', // non-string item
    ];
    for (const value of bad) {
      const result = await saveContent({ key: def.key, locale: "ko", value, actor });
      expect(result.ok, `should reject: ${value}`).toBe(false);
      expect(result.message).toContain("Invalid eras payload");
    }
  });

  it("accepts a well-formed eras payload (then reports the missing DB)", async () => {
    const def = defOfKind("eras");
    const value = JSON.stringify([
      {
        range: "2020 - 2023",
        tagline: "line one\nline two",
        image: "/images/era.jpg",
        years: [
          { year: "2023", items: ["founded"] },
          { year: "2022", items: ["grew", "shipped"] },
        ],
      },
    ]);
    const result = await saveContent({ key: def.key, locale: "ko", value, actor });
    expect(result).toEqual({ ok: false, message: DB_NOT_CONFIGURED_MESSAGE });
  });

  it("rejects malformed/empty locations payloads", async () => {
    const def = defOfKind("locations");
    const bad = [
      "[]", // a locations list must not be emptied
      "{}", // not an array
      "not json",
      "[{}]", // missing everything
      '[{"badge":"a","city":"b","address":"c"}]', // missing mapSrc
      '[{"badge":1,"city":"b","address":"c","mapSrc":""}]', // badge not a string
      '[{"badge":"a","city":"b","address":"c","mapSrc":"javascript:alert(1)"}]', // invalid media
      '[{"badge":"a","city":"b","address":"c","mapSrc":"https://x/a b"}]', // invalid media
    ];
    for (const value of bad) {
      const result = await saveContent({ key: def.key, locale: "ko", value, actor });
      expect(result.ok, `should reject: ${value}`).toBe(false);
      expect(result.message).toContain("Invalid locations payload");
    }
  });

  it("accepts well-formed locations payloads, including an empty mapSrc", async () => {
    const def = defOfKind("locations");
    for (const mapSrc of ["/images/map.png", "", "https://www.google.com/maps/embed?pb=x"]) {
      const value = JSON.stringify([{ badge: "a", city: "b", address: "c", mapSrc }]);
      const result = await saveContent({ key: def.key, locale: "ko", value, actor });
      expect(result, mapSrc).toEqual({ ok: false, message: DB_NOT_CONFIGURED_MESSAGE });
    }
  });

  it("accepts locations payloads with missing contact fields (normalized) and 7-field ones", async () => {
    const def = defOfKind("locations");
    const legacy = JSON.stringify([{ badge: "a", city: "b", address: "c", mapSrc: "" }]);
    const full = JSON.stringify([
      {
        badge: "a",
        city: "b",
        address: "c",
        phone: "1",
        fax: "2",
        email: "e@x.y",
        mapSrc: "",
      },
    ]);
    for (const value of [legacy, full]) {
      const result = await saveContent({ key: def.key, locale: "ko", value, actor });
      expect(result, value).toEqual({ ok: false, message: DB_NOT_CONFIGURED_MESSAGE });
    }
  });

  it("rejects non-string contact fields in locations payloads", async () => {
    const def = defOfKind("locations");
    for (const field of ["phone", "fax", "email"]) {
      const value = JSON.stringify([
        { badge: "a", city: "b", address: "c", mapSrc: "", [field]: 5 },
      ]);
      const result = await saveContent({ key: def.key, locale: "ko", value, actor });
      expect(result.ok, field).toBe(false);
      expect(result.message).toContain("Invalid locations payload");
    }
  });
});

describe("saveContent facilityTabs validation (no DB)", () => {
  it("rejects >3 tabs, empty images, invalid media and empty names", async () => {
    const def = defOfKind("facilityTabs");
    const bad = [
      "[]", // at least one tab
      "{}", // not an array
      "not json",
      '[{"name":"a","images":["/images/a.png"]},{"name":"b","images":["/images/b.png"]},{"name":"c","images":["/images/c.png"]},{"name":"d","images":["/images/d.png"]}]', // 4 tabs
      '[{"name":"a","images":[]}]', // empty images
      '[{"name":"a","images":[""]}]', // empty media string
      '[{"name":"a","images":["javascript:alert(1)"]}]', // invalid media
      '[{"name":"a","images":["relative/x.png"]}]', // invalid media (no leading slash)
      '[{"name":"  ","images":["/images/a.png"]}]', // blank name
      '[{"name":1,"images":["/images/a.png"]}]', // name not a string
      "[{}]", // missing fields
    ];
    for (const value of bad) {
      const result = await saveContent({ key: def.key, locale: "ko", value, actor });
      expect(result.ok, `should reject: ${value}`).toBe(false);
      expect(result.message).toContain("Invalid facilityTabs payload");
    }
  });

  it("stores a valid payload normalized (names trimmed, unknown fields dropped)", async () => {
    const { upsert, prisma } = makeFakePrisma();
    getPrismaMock.mockReturnValue(prisma as never);
    const def = defOfKind("facilityTabs");
    const value = JSON.stringify([
      { name: "  생산설비  ", images: ["/images/a.png"], extra: "ignored" },
      { name: "검사설비", images: ["https://example.com/b.png"] },
    ]);

    const result = await saveContent({ key: def.key, locale: "ko", value, actor });

    expect(result).toEqual({ ok: true });
    expect(upsert).toHaveBeenCalledTimes(1);
    const stored = upsert.mock.calls[0][0].create.value;
    expect(JSON.parse(stored)).toEqual([
      { name: "생산설비", images: ["/images/a.png"] },
      { name: "검사설비", images: ["https://example.com/b.png"] },
    ]);
  });
});

describe("saveContent structured R&D payload validation (no DB)", () => {
  it("rejects malformed techFeatures payloads", async () => {
    const def = defOfKind("techFeatures");
    const item = (over: Record<string, unknown> = {}) => ({
      image: "/a.jpg",
      heading: "h",
      rows: [{ label: "l", body: "" }],
      ...over,
    });
    const blocksOf = (b0: unknown, b1: unknown, b2: unknown) =>
      JSON.stringify({ blocks: [{ items: [b0] }, { items: [b1] }, { items: [b2] }] });
    const ok = item();
    const bad = [
      "not json",
      "{}",
      '[{"items":[]}]', // array, not object
      '{"items":[]}', // legacy v1 shape
      '{"blocks":[]}',
      `{"blocks":[{"items":[${JSON.stringify(ok)}]}]}`, // only one block
      JSON.stringify({ blocks: [{ items: [] }, { items: [ok] }, { items: [ok] }] }), // empty block
      JSON.stringify({ blocks: [{ items: [ok] }, { items: [ok] }] }), // two blocks
      JSON.stringify({
        blocks: [{ items: [ok] }, { items: [ok] }, { items: [ok] }, { items: [ok] }],
      }), // four blocks
      blocksOf(item({ image: "" }), ok, ok), // empty media
      blocksOf(item({ image: "javascript:alert(1)" }), ok, ok),
      blocksOf(item({ heading: "  " }), ok, ok), // blank heading
      blocksOf(item({ rows: [] }), ok, ok), // no rows
      blocksOf({ image: "/a.jpg", heading: "h", rows: [{ label: "", body: "" }] }, ok, ok), // blank label
      blocksOf({ image: "/a.jpg", heading: "h", rows: [{ label: "l" }] }, ok, ok), // body missing
    ];
    for (const value of bad) {
      const result = await saveContent({ key: def.key, locale: "ko", value, actor });
      expect(result.ok, `should reject: ${value}`).toBe(false);
      expect(result.message).toContain("Invalid techFeatures payload");
    }

    // Per-block cap: 13 items in one block is rejected.
    const over = JSON.stringify({
      blocks: [{ items: Array.from({ length: 13 }, () => ok) }, { items: [ok] }, { items: [ok] }],
    });
    const capped = await saveContent({ key: def.key, locale: "ko", value: over, actor });
    expect(capped.ok).toBe(false);
    expect(capped.message).toContain("Invalid techFeatures payload");
  });

  it("stores a techFeatures payload normalized (trimmed, internal newlines kept)", async () => {
    const { upsert, prisma } = makeFakePrisma();
    getPrismaMock.mockReturnValue(prisma as never);
    const def = defOfKind("techFeatures");
    const simple = { image: "/b.jpg", heading: "h", rows: [{ label: "l", body: "" }] };
    const value = JSON.stringify({
      blocks: [
        {
          items: [
            {
              image: "  /images/a.jpg  ",
              heading: "  line1\nline2  ",
              rows: [{ label: "  label  ", body: "  body1\nbody2  ", extra: "ignored" }],
            },
          ],
        },
        { items: [simple] },
        { items: [simple] },
      ],
    });

    const result = await saveContent({ key: def.key, locale: "ko", value, actor });

    expect(result).toEqual({ ok: true });
    expect(JSON.parse(upsert.mock.calls[0][0].create.value)).toEqual({
      blocks: [
        {
          items: [
            {
              image: "/images/a.jpg",
              heading: "line1\nline2",
              rows: [{ label: "label", body: "body1\nbody2" }],
            },
          ],
        },
        { items: [simple] },
        { items: [simple] },
      ],
    });
  });

  it("rejects malformed patentSections payloads", async () => {
    const def = defOfKind("patentSections");
    const bad = [
      "not json",
      "{}",
      '{"sections":[]}',
      '{"sections":[{}]}',
      '{"sections":[{"title":"t","items":[]}]}',
      '{"sections":[{"title":"","items":[{"image":"/a.jpg","caption":"c"}]}]}',
      '{"sections":[{"title":"t","items":[{"image":"","caption":"c"}]}]}',
      '{"sections":[{"title":"t","items":[{"image":"/a.jpg","caption":1}]}]}',
    ];
    for (const value of bad) {
      const result = await saveContent({ key: def.key, locale: "ko", value, actor });
      expect(result.ok, `should reject: ${value}`).toBe(false);
      expect(result.message).toContain("Invalid patentSections payload");
    }
  });

  it("stores a patentSections payload normalized", async () => {
    const { upsert, prisma } = makeFakePrisma();
    getPrismaMock.mockReturnValue(prisma as never);
    const def = defOfKind("patentSections");
    const value = JSON.stringify({
      sections: [{ title: "  인증 현황  ", items: [{ image: " /images/c.jpg ", caption: " 인증서 " }] }],
    });

    const result = await saveContent({ key: def.key, locale: "ko", value, actor });

    expect(result).toEqual({ ok: true });
    expect(JSON.parse(upsert.mock.calls[0][0].create.value)).toEqual({
      sections: [{ title: "인증 현황", items: [{ image: "/images/c.jpg", caption: "인증서" }] }],
    });
  });

  it("rejects malformed facilitiesTable payloads", async () => {
    const def = defOfKind("facilitiesTable");
    const bad = [
      "not json",
      "{}",
      '{"header":["a"],"rows":[["x","y"]]}',
      '{"header":["a",""],"rows":[["x","y"]]}',
      '{"header":["a","b"],"rows":[]}',
      '{"header":["a","b"],"rows":[["x"]]}',
      '{"header":["a","b"],"rows":[["x","y","z"]]}',
      '{"header":["a","b"],"rows":[[1,"y"]]}',
    ];
    for (const value of bad) {
      const result = await saveContent({ key: def.key, locale: "ko", value, actor });
      expect(result.ok, `should reject: ${value}`).toBe(false);
      expect(result.message).toContain("Invalid facilitiesTable payload");
    }
  });

  it("stores a facilitiesTable payload normalized (cells trimmed)", async () => {
    const { upsert, prisma } = makeFakePrisma();
    getPrismaMock.mockReturnValue(prisma as never);
    const def = defOfKind("facilitiesTable");
    const value = JSON.stringify({
      header: ["  설비명  ", " 대 수 "],
      rows: [[" 회전융착기 ", " 3 "], ["공압검사기", ""]],
    });

    const result = await saveContent({ key: def.key, locale: "ko", value, actor });

    expect(result).toEqual({ ok: true });
    expect(JSON.parse(upsert.mock.calls[0][0].create.value)).toEqual({
      header: ["설비명", "대 수"],
      rows: [["회전융착기", "3"], ["공압검사기", ""]],
    });
  });
});

describe("saveContent embed validation (no DB)", () => {
  it("accepts an https embed URL (then reports the missing DB)", async () => {
    const def = defOfKind("embed");
    const result = await saveContent({
      key: def.key,
      locale: "ko",
      value: "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d792.25!2d126.69!3d37.41",
      actor,
    });
    expect(result).toEqual({ ok: false, message: DB_NOT_CONFIGURED_MESSAGE });
  });

  it("accepts a relative embed path (then reports the missing DB)", async () => {
    const def = defOfKind("embed");
    const result = await saveContent({
      key: def.key,
      locale: "en",
      value: "/images/embed/map.png",
      actor,
    });
    expect(result).toEqual({ ok: false, message: DB_NOT_CONFIGURED_MESSAGE });
  });

  it("rejects javascript:, spaces and quotes", async () => {
    const def = defOfKind("embed");
    const bad = [
      "javascript:alert(1)",
      "https://example.com/a b",
      'https://example.com/"x"',
      "data:text/html;base64,AAAA",
    ];
    for (const value of bad) {
      const result = await saveContent({ key: def.key, locale: "ko", value, actor });
      expect(result.ok, `should reject: ${value}`).toBe(false);
      expect(result.message).toContain("Invalid embed value");
    }
  });
});

describe("saveContent writes (fake Prisma)", () => {
  it("writes both locales for a `url` field", async () => {
    const { upsert, prisma } = makeFakePrisma();
    getPrismaMock.mockReturnValue(prisma as never);
    const def = defOfKind("url");

    const result = await saveContent({
      key: def.key,
      locale: "ko",
      value: "https://example.com/",
      actor,
    });

    expect(result).toEqual({ ok: true });
    expect(upsert).toHaveBeenCalledTimes(2);
    const locales = upsert.mock.calls
      .map((call) => call[0].where.key_locale.locale)
      .sort();
    expect(locales).toEqual(["en", "ko"]);
    expect(upsert.mock.calls[0][0].create.updatedBy).toBe(actor);
  });

  it("deletes both locales for an empty `url` value", async () => {
    const { deleteMany, prisma } = makeFakePrisma();
    getPrismaMock.mockReturnValue(prisma as never);
    const def = defOfKind("url");

    const result = await saveContent({ key: def.key, locale: "ko", value: "  ", actor });

    expect(result).toEqual({ ok: true });
    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(deleteMany.mock.calls[0][0].where.locale.in.slice().sort()).toEqual(["en", "ko"]);
  });

  it("writes only the given locale for non-url fields", async () => {
    const { upsert, prisma } = makeFakePrisma();
    getPrismaMock.mockReturnValue(prisma as never);
    const def = defOfKind("lines");

    const result = await saveContent({ key: def.key, locale: "en", value: "<p>x</p>", actor });

    expect(result).toEqual({ ok: true });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0].where.key_locale).toEqual({ key: def.key, locale: "en" });
  });

  it("revalidates the def routes after a successful write", async () => {
    const { prisma } = makeFakePrisma();
    getPrismaMock.mockReturnValue(prisma as never);
    const def = defOfKind("lines");

    await saveContent({ key: def.key, locale: "ko", value: "<p>x</p>", actor });

    for (const path of def.revalidate) {
      expect(revalidatePathMock).toHaveBeenCalledWith(path, "page");
    }
  });

  it("revalidates the root layout for site/nav keys", async () => {
    const { prisma } = makeFakePrisma();
    getPrismaMock.mockReturnValue(prisma as never);
    const navDef = CONTENT_DEFS.find((def) => def.pageKey === "site");
    expect(navDef).toBeDefined();

    await saveContent({ key: navDef!.key, locale: "ko", value: "새 이름", actor });

    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
  });
});
