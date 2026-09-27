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

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { applyBoardOverrides } from "../merge";
import { boardLabel, isProductBoard } from "../boards";
import { getResolvedBoard, getResolvedBoardName } from "../resolved";
import { getBoard } from "../read";
import {
  DB_NOT_CONFIGURED_MESSAGE,
  deleteBoardPost,
  listBoardRows,
  loadBoardPosts,
  replaceBoardPosts,
  seedBoardFromDefaults,
  updateBoardPost,
} from "../board-store";

interface Row {
  idx: string;
  title: string;
  category: string | null;
  excerpt: string;
  content: string;
  thumb: string | null;
  isNotice: boolean;
  date: string | null;
  views: number | null;
  files: unknown;
  sortOrder?: number;
}

function row(idx: string, extra: Partial<Row> = {}): Row {
  return {
    idx,
    title: `Title ${idx}`,
    category: null,
    excerpt: "",
    content: "",
    thumb: null,
    isNotice: false,
    date: null,
    views: null,
    files: [],
    ...extra,
  };
}

function makeFakePrisma(rows: Row[] = []) {
  const deleteMany = vi.fn(async (_args: { where?: unknown }) => ({ count: rows.length }));
  const createMany = vi.fn(async (args: { data?: unknown[] }) => ({
    count: args.data?.length ?? 0,
  }));
  const findMany = vi.fn(async (_args: { where?: unknown; orderBy?: unknown }) => rows);
  const findUnique = vi.fn(async (_args: { where?: unknown }) => rows[0] ?? null);
  const update = vi.fn(async (_args: { where?: unknown; data?: unknown }) => ({}));
  const tx = async (fn: (client: unknown) => Promise<unknown>) =>
    fn({ boardPost: { deleteMany, createMany } });
  const prisma = {
    boardPost: { deleteMany, createMany, findMany, findUnique, update },
    $transaction: vi.fn(tx),
  };
  return { prisma, deleteMany, createMany, findMany, findUnique, update };
}

const actor = "admin@example.com";

beforeEach(() => {
  vi.clearAllMocks();
  getPrismaMock.mockReturnValue(null);
  loadOverridesMock.mockResolvedValue({});
});

describe("board-store validation (no DB needed)", () => {
  it("rejects an unknown slug / bad locale / non-array", async () => {
    expect((await replaceBoardPosts({ slug: "nope", locale: "ko", posts: [], actor })).message).toContain(
      "Unknown board slug",
    );
    expect(
      (await replaceBoardPosts({ slug: "news", locale: "fr" as never, posts: [], actor })).message,
    ).toContain("locale must be ko or en");
    expect(
      (await replaceBoardPosts({ slug: "news", locale: "ko", posts: "x", actor })).message,
    ).toContain("posts must be an array");
  });

  it("requires a unique, non-empty idx", async () => {
    const empty = await replaceBoardPosts({
      slug: "news",
      locale: "ko",
      posts: [row("")],
      actor,
    });
    expect(empty.message).toContain("idx is required");

    const dup = await replaceBoardPosts({
      slug: "news",
      locale: "ko",
      posts: [row("a"), row("a")],
      actor,
    });
    expect(dup.message).toContain("duplicate post idx");
  });

  it("caps title/extract and validates thumb + file hrefs as media values", async () => {
    const longTitle = await replaceBoardPosts({
      slug: "news",
      locale: "ko",
      posts: [row("a", { title: "x".repeat(501) })],
      actor,
    });
    expect(longTitle.message).toContain("title exceeds");

    const badThumb = await replaceBoardPosts({
      slug: "news",
      locale: "ko",
      posts: [row("a", { thumb: "javascript:alert(1)" })],
      actor,
    });
    expect(badThumb.message).toContain("thumb must be");

    const badFile = await replaceBoardPosts({
      slug: "news",
      locale: "ko",
      posts: [row("a", { files: [{ name: "f.pdf", href: "not a url" }] })],
      actor,
    });
    expect(badFile.message).toContain("file 1 href must be");
  });

  it("rejects an invalid attachment size but accepts a valid one", async () => {
    const badSize = await replaceBoardPosts({
      slug: "news",
      locale: "ko",
      posts: [row("a", { files: [{ name: "f.pdf", href: "/files/f.pdf", size: -5 }] })],
      actor,
    });
    expect(badSize.message).toContain("size must be a non-negative number");

    const goodSize = await replaceBoardPosts({
      slug: "news",
      locale: "ko",
      posts: [row("a", { files: [{ name: "f.pdf", href: "/files/f.pdf", size: 14295 }] })],
      actor,
    });
    // No DB configured, but validation passes (message is the DB guard, not a validation error).
    expect(goodSize.message).toBe(DB_NOT_CONFIGURED_MESSAGE);
  });

  it("returns the not-configured message for valid writes when DATABASE_URL is unset", async () => {
    const result = await replaceBoardPosts({
      slug: "news",
      locale: "ko",
      posts: [row("a")],
      actor,
    });
    expect(result).toEqual({ ok: false, message: DB_NOT_CONFIGURED_MESSAGE });

    expect(
      (await seedBoardFromDefaults({ slug: "news", locale: "ko", actor })).message,
    ).toBe(DB_NOT_CONFIGURED_MESSAGE);
    expect(
      (await updateBoardPost({ slug: "news", locale: "ko", idx: "a", patch: {}, actor })).message,
    ).toBe(DB_NOT_CONFIGURED_MESSAGE);
    expect((await deleteBoardPost({ slug: "news", locale: "ko", idx: "a" })).message).toBe(
      DB_NOT_CONFIGURED_MESSAGE,
    );
  });
});

describe("board-store collection semantics", () => {
  beforeEach(() => {
    const { prisma } = makeFakePrisma();
    getPrismaMock.mockReturnValue(prisma as never);
  });

  it("loadBoardPosts returns null for zero rows (render defaults)", async () => {
    const { prisma } = makeFakePrisma([]);
    getPrismaMock.mockReturnValue(prisma as never);
    expect(await loadBoardPosts("ko", "news")).toBeNull();
  });

  it("loadBoardPosts maps stored rows", async () => {
    const { prisma } = makeFakePrisma([row("a"), row("b")]);
    getPrismaMock.mockReturnValue(prisma as never);
    const posts = await loadBoardPosts("ko", "news");
    expect(posts?.map((p) => p.idx)).toEqual(["a", "b"]);
    expect(posts?.[0].files).toEqual([]);
  });

  it("loadBoardPosts normalizes a slash slug for the Prisma query", async () => {
    const { prisma, findMany } = makeFakePrisma([]);
    getPrismaMock.mockReturnValue(prisma as never);
    await loadBoardPosts("ko", "products/eco-wave");
    expect(findMany).toHaveBeenCalledWith({
      where: { slug: "products.eco-wave", locale: "ko" },
      orderBy: [{ sortOrder: "asc" }, { idx: "asc" }],
    });
  });

  it("round-trips attachments (name/href/size) through replace + load", async () => {
    const { prisma, createMany } = makeFakePrisma();
    getPrismaMock.mockReturnValue(prisma as never);

    const files = [
      { name: "spec.pdf", href: "https://blob.example/spec.pdf", size: 14295 },
      { name: "photo.png", href: "/files/photo.png" },
    ];
    const result = await replaceBoardPosts({
      slug: "news",
      locale: "ko",
      posts: [row("a", { files })],
      actor,
    });
    expect(result).toEqual({ ok: true });

    const data = createMany.mock.calls[0][0].data as Array<{ files: unknown }>;
    expect(data[0].files).toEqual(files);

    // And a stored row reads back with the same values (extra size preserved).
    const stored = makeFakePrisma([row("a", { files })]);
    getPrismaMock.mockReturnValue(stored.prisma as never);
    const posts = await loadBoardPosts("ko", "news");
    expect(posts?.[0].files).toEqual(files);
  });

  it("replaceBoardPosts deletes then creates the whole list in one transaction (sortOrder = index)", async () => {
    const { prisma, deleteMany, createMany } = makeFakePrisma();
    getPrismaMock.mockReturnValue(prisma as never);

    const result = await replaceBoardPosts({
      slug: "news",
      locale: "ko",
      posts: [row("a"), row("b")],
      actor,
    });

    expect(result).toEqual({ ok: true });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(deleteMany).toHaveBeenCalledWith({ where: { slug: "news", locale: "ko" } });
    const data = createMany.mock.calls[0][0].data as Array<{
      idx: string;
      sortOrder: number;
      updatedBy: string;
    }>;
    expect(data.map((d) => d.idx)).toEqual(["a", "b"]);
    expect(data.map((d) => d.sortOrder)).toEqual([0, 1]);
    expect(data[0].updatedBy).toBe(actor);
  });

  it("replaceBoardPosts writes the canonical dot slug when given a slash slug", async () => {
    const { prisma, deleteMany, createMany } = makeFakePrisma();
    getPrismaMock.mockReturnValue(prisma as never);

    const result = await replaceBoardPosts({
      slug: "products/eco-wave",
      locale: "ko",
      posts: [row("a")],
      actor,
    });

    expect(result).toEqual({ ok: true });
    expect(deleteMany).toHaveBeenCalledWith({
      where: { slug: "products.eco-wave", locale: "ko" },
    });
    const data = createMany.mock.calls[0][0].data as Array<{ slug: string }>;
    expect(data[0].slug).toBe("products.eco-wave");
  });

  it("replaceBoardPosts with an empty list clears the collection (revert to defaults)", async () => {
    const { prisma, deleteMany, createMany } = makeFakePrisma();
    getPrismaMock.mockReturnValue(prisma as never);

    const result = await replaceBoardPosts({ slug: "news", locale: "ko", posts: [], actor });
    expect(result).toEqual({ ok: true });
    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("seedBoardFromDefaults copies the crawled defaults", async () => {
    const { prisma, createMany } = makeFakePrisma();
    getPrismaMock.mockReturnValue(prisma as never);

    const result = await seedBoardFromDefaults({ slug: "news", locale: "ko", actor });
    expect(result).toEqual({ ok: true });
    const data = createMany.mock.calls[0][0].data as unknown[];
    expect(data.length).toBe(getBoard("ko", "news").posts.length);
  });

  it("updateBoardPost requires an existing row, then patches it", async () => {
    const missing = makeFakePrisma([]);
    getPrismaMock.mockReturnValue(missing.prisma as never);
    expect(
      (await updateBoardPost({ slug: "news", locale: "ko", idx: "a", patch: { title: "X" }, actor }))
        .message,
    ).toContain("not in the override set");

    const found = makeFakePrisma([row("a")]);
    getPrismaMock.mockReturnValue(found.prisma as never);
    const result = await updateBoardPost({
      slug: "news",
      locale: "ko",
      idx: "a",
      patch: { title: "New" },
      actor,
    });
    expect(result).toEqual({ ok: true });
    const data = found.update.mock.calls[0][0].data as { title: string };
    expect(data.title).toBe("New");
  });

  it("updateBoardPost rejects an idx rename and still applies a normal patch", async () => {
    const found = makeFakePrisma([row("a")]);
    getPrismaMock.mockReturnValue(found.prisma as never);

    const renamed = await updateBoardPost({
      slug: "news",
      locale: "ko",
      idx: "a",
      patch: { idx: "b", title: "X" },
      actor,
    });
    expect(renamed).toEqual({
      ok: false,
      message: 'idx is immutable (got "b" for post "a")',
    });
    expect(found.update).not.toHaveBeenCalled();

    // A patch that repeats the request idx is a no-op for identity, so the
    // normal edit path still works.
    const normal = await updateBoardPost({
      slug: "news",
      locale: "ko",
      idx: "a",
      patch: { idx: "a", title: "New" },
      actor,
    });
    expect(normal).toEqual({ ok: true });
    const data = found.update.mock.calls[0][0].data as { idx: string; title: string };
    expect(data.idx).toBe("a");
    expect(data.title).toBe("New");
  });

  it("updateBoardPost preserves the row's sortOrder", async () => {
    const found = makeFakePrisma([row("a", { sortOrder: 2 })]);
    getPrismaMock.mockReturnValue(found.prisma as never);
    const result = await updateBoardPost({
      slug: "news",
      locale: "ko",
      idx: "a",
      patch: { title: "New" },
      actor,
    });
    expect(result).toEqual({ ok: true });
    const data = found.update.mock.calls[0][0].data as { sortOrder: number; title: string };
    expect(data.sortOrder).toBe(2);
    expect(data.title).toBe("New");
  });

  it("deleteBoardPost succeeds only when a row is removed", async () => {
    const none = makeFakePrisma([]);
    getPrismaMock.mockReturnValue(none.prisma as never);
    expect((await deleteBoardPost({ slug: "news", locale: "ko", idx: "a" })).message).toContain(
      "not in the override set",
    );

    const one = makeFakePrisma([row("a")]);
    getPrismaMock.mockReturnValue(one.prisma as never);
    expect(await deleteBoardPost({ slug: "news", locale: "ko", idx: "a" })).toEqual({ ok: true });
  });

  it("listBoardRows returns the locale rows", async () => {
    const { prisma } = makeFakePrisma([row("a")]);
    getPrismaMock.mockReturnValue(prisma as never);
    expect((await listBoardRows("ko")).map((p) => p.idx)).toEqual(["a"]);
  });
});

describe("board-store product-post derivation", () => {
  interface Derived {
    idx: string;
    thumb: string | null;
    excerpt: string;
  }

  async function replaceProduct(posts: Row[]): Promise<Derived[]> {
    const { prisma, createMany } = makeFakePrisma();
    getPrismaMock.mockReturnValue(prisma as never);
    const result = await replaceBoardPosts({
      slug: "products.eco-wave",
      locale: "en",
      posts,
      actor,
    });
    expect(result).toEqual({ ok: true });
    return createMany.mock.calls[0][0].data as Derived[];
  }

  it("derives thumb from the first <img> and ignores the client-provided value", async () => {
    const data = await replaceProduct([
      row("p1", {
        // Neither of these client values may survive: the board is a product board.
        thumb: "javascript:alert(1)",
        excerpt: "client excerpt",
        content:
          '<p>first</p><img src="/images/upload/a.jpg"><img src="/images/upload/b.jpg">',
      }),
    ]);
    expect(data[0].thumb).toBe("/images/upload/a.jpg");
    expect(data[0].excerpt).toBe("first");
  });

  it("restricts a derived thumb to relative paths and Vercel Blob public URLs", async () => {
    const data = await replaceProduct([
      row("rel", { content: '<img src="/images/upload/a.jpg">' }),
      row("blob", {
        content:
          '<img src="https://store123.public.blob.vercel-storage.com/upload/b.jpg">',
      }),
      row("external", { content: '<img src="https://example.com/c.jpg">' }),
      row("lookalike", {
        content: '<img src="https://cdn.public.blob.vercel-storage.com.evil.com/d.jpg">',
      }),
      row("protocol-relative", { content: '<img src="//evil.example/e.jpg">' }),
      row("data", { content: '<img src="data:image/png;base64,AAAA">' }),
    ]);
    const byIdx = Object.fromEntries(data.map((d) => [d.idx, d.thumb]));
    expect(byIdx.rel).toBe("/images/upload/a.jpg");
    expect(byIdx.blob).toBe("https://store123.public.blob.vercel-storage.com/upload/b.jpg");
    expect(byIdx.external).toBeNull();
    expect(byIdx.lookalike).toBeNull();
    expect(byIdx["protocol-relative"]).toBeNull();
    expect(byIdx.data).toBeNull();
  });

  it("strips tags and entities and collapses whitespace for the excerpt", async () => {
    const data = await replaceProduct([
      row("p1", {
        content:
          '<div><p>Tom &amp; Jerry&nbsp;&lt;hi&gt;</p>\n\n  <p>line   two</p></div>',
      }),
    ]);
    expect(data[0].excerpt).toBe("Tom & Jerry <hi> line two");
  });

  it("falls back to the title and leaves thumb null when the body has no image/text", async () => {
    const data = await replaceProduct([
      row("p1", { title: "Only the title", content: "<div></div>" }),
    ]);
    expect(data[0].excerpt).toBe("Only the title");
    expect(data[0].thumb).toBeNull();
  });

  it("clips a long excerpt to ~160 chars on a word boundary", async () => {
    const long = "alpha beta gamma ".repeat(20).trim();
    const data = await replaceProduct([row("p1", { content: `<p>${long}</p>` })]);
    const excerpt = data[0].excerpt;
    expect(long.length).toBeGreaterThan(160);
    expect(excerpt.length).toBeLessThanOrEqual(160);
    expect(long.slice(0, excerpt.length)).toBe(excerpt);
    // The cut lands on a word boundary (the next source char is the space it cut at).
    expect(long[excerpt.length]).toBe(" ");
  });

  it("disambiguates a duplicate excerpt with the post idx and re-checks", async () => {
    const data = await replaceProduct([
      row("111", { content: "<p>Same body</p>" }),
      row("222", { content: "<p>Same body</p>" }),
      row("333", { content: "<p>Same body</p>" }),
    ]);
    expect(data.map((d) => d.excerpt)).toEqual([
      "Same body",
      "Same body … (#222)",
      "Same body … (#333)",
    ]);
  });

  it("derives on the update path too, unique against the board's other rows", async () => {
    const target = row("target", {
      title: "Edited",
      content: '<p>updated body</p><img src="/images/upload/new.jpg">',
      excerpt: "old excerpt",
      thumb: "/old.jpg",
    });
    const sibling = row("sibling", { excerpt: "updated body" });
    const found = makeFakePrisma([target, sibling]);
    getPrismaMock.mockReturnValue(found.prisma as never);

    const result = await updateBoardPost({
      slug: "products.eco-wave",
      locale: "en",
      idx: "target",
      patch: { title: "Edited", content: target.content },
      actor,
    });
    expect(result).toEqual({ ok: true });
    const data = found.update.mock.calls[0][0].data as unknown as Derived;
    expect(data.thumb).toBe("/images/upload/new.jpg");
    expect(data.excerpt).toBe("updated body … (#target)");
  });

  it("leaves a non-product board's client thumb/excerpt untouched", async () => {
    const { prisma, createMany } = makeFakePrisma();
    getPrismaMock.mockReturnValue(prisma as never);
    const result = await replaceBoardPosts({
      slug: "news",
      locale: "ko",
      posts: [
        row("n1", {
          thumb: "/client.jpg",
          excerpt: "client excerpt",
          content: '<p>body</p><img src="/images/upload/a.jpg">',
        }),
      ],
      actor,
    });
    expect(result).toEqual({ ok: true });
    const data = createMany.mock.calls[0][0].data as Derived[];
    expect(data[0].thumb).toBe("/client.jpg");
    expect(data[0].excerpt).toBe("client excerpt");
  });
});

describe("getResolvedBoard", () => {
  it("returns the cached base object when there are no rows and no name override", async () => {
    const base = getBoard("ko", "news");
    const resolved = await getResolvedBoard("ko", "news");
    expect(resolved).toBe(base);
  });

  it("applies the stored name override (precedence over the label)", async () => {
    loadOverridesMock.mockResolvedValue({ "news#board/news/name": "CUSTOM NAME" });
    const resolved = await getResolvedBoard("ko", "news");
    expect(resolved.name).toBe("CUSTOM NAME");
  });

  it("replaces the whole post list with stored rows and uses boardLabel for the name", async () => {
    const { prisma } = makeFakePrisma([row("stored-1"), row("stored-2", { isNotice: true })]);
    getPrismaMock.mockReturnValue(prisma as never);

    const base = getBoard("ko", "news");
    const resolved = await getResolvedBoard("ko", "news");

    expect(resolved).not.toBe(base);
    expect(resolved.name).toBe("뉴스");
    expect(resolved.posts.map((p) => p.idx)).toEqual(["stored-1", "stored-2"]);
    expect(resolved.count).toBe(2);
    // Replacement, not a merge: the crawled posts are gone.
    expect(resolved.posts.some((p) => base.posts.some((b) => b.idx === p.idx))).toBe(false);
  });

  it("normalizes a slash slug for the stored name override key", async () => {
    loadOverridesMock.mockResolvedValue({
      "products.eco-wave#board/products.eco-wave/name": "CUSTOM NAME",
    });
    const resolved = await getResolvedBoard("ko", "products/eco-wave");
    expect(resolved.name).toBe("CUSTOM NAME");
  });

  it("uses the normalized boardLabel as the fallback name for a slash slug", async () => {
    const { prisma } = makeFakePrisma([row("stored-1")]);
    getPrismaMock.mockReturnValue(prisma as never);

    const resolved = await getResolvedBoard("ko", "products/eco-wave");
    expect(resolved.name).toBe("에코웨이브");
    expect(resolved.posts.map((p) => p.idx)).toEqual(["stored-1"]);
  });
});

describe("getResolvedBoardName (override provenance)", () => {
  /**
   * The crawled `board.name` per board/locale — deliberately equal to the
   * chosen override for news/notices, reproducing the bug where a stored
   * override that matches the crawled string was discarded by the old
   * `resolved !== crawled` comparison.
   */
  const CASES: {
    slug: string;
    key: string;
    label: { ko: string; en: string };
    stored: { ko: string; en: string };
  }[] = [
    {
      slug: "news",
      key: "news#board/news/name",
      label: { ko: "뉴스", en: "News" },
      stored: { ko: "공지사항", en: "notice" }, // == crawled base
    },
    {
      slug: "notices",
      key: "notices#board/notices/name",
      label: { ko: "공지사항", en: "Notices" },
      stored: { ko: "뉴스", en: "news" }, // == crawled base
    },
    {
      slug: "products/eco-wave",
      key: "products.eco-wave#board/products.eco-wave/name",
      label: { ko: "에코웨이브", en: "Eco wave" },
      stored: { ko: "에코웨이브", en: "Eco wave" },
    },
  ];

  for (const c of CASES) {
    for (const locale of ["ko", "en"] as const) {
      it(`${c.slug}/${locale}: a stored override wins, even when equal to the crawled base`, async () => {
        loadOverridesMock.mockResolvedValue({ [c.key]: c.stored[locale] });
        expect(await getResolvedBoardName(locale, c.slug)).toEqual({
          name: c.stored[locale],
          fromOverride: true,
        });
      });

      it(`${c.slug}/${locale}: no override → boardLabel, fromOverride false`, async () => {
        loadOverridesMock.mockResolvedValue({});
        expect(await getResolvedBoardName(locale, c.slug)).toEqual({
          name: c.label[locale],
          fromOverride: false,
        });
      });
    }
  }

  it("treats a whitespace-only stored value as no override", async () => {
    loadOverridesMock.mockResolvedValue({ "news#board/news/name": "   " });
    expect(await getResolvedBoardName("ko", "news")).toEqual({
      name: boardLabel("news", "ko"),
      fromOverride: false,
    });
  });
});

describe("board labels normalize the slug", () => {
  it("boardLabel resolves a slash slug", () => {
    expect(boardLabel("products/eco-wave", "ko")).toBe("에코웨이브");
    expect(boardLabel("products/eco-wave", "en")).toBe("Eco wave");
  });

  it("isProductBoard recognizes a slash slug", () => {
    expect(isProductBoard("products/eco-wave")).toBe(true);
    expect(isProductBoard("news")).toBe(false);
  });
});

describe("applyBoardOverrides (pure)", () => {
  it("is non-mutating and replaces posts without merging", () => {
    const base = getBoard("ko", "news");
    const originalLength = base.posts.length;
    const next = applyBoardOverrides(
      base,
      { "news#board/news/name": "N" },
      "news",
      { fallbackName: "L", posts: [base.posts[0]] },
    );

    expect(next).not.toBe(base);
    expect(next.name).toBe("N");
    expect(next.posts).toHaveLength(1);
    expect(next.count).toBe(1);
    expect(base.name).not.toBe("N");
    expect(base.posts).toHaveLength(originalLength);
  });

  it("falls back to the label when no stored name exists", () => {
    const next = applyBoardOverrides(getBoard("ko", "news"), {}, "news", {
      fallbackName: "LABEL",
    });
    expect(next.name).toBe("LABEL");
  });
});
