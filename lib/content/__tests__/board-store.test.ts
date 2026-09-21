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
import { getResolvedBoard } from "../resolved";
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
