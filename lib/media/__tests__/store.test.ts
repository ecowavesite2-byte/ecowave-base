import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let root: string;
let originalRoot: string | undefined;

/** Load store.ts against a fixed MEDIA_ROOT (no files are written here). */
async function loadStore() {
  vi.resetModules();
  process.env.MEDIA_ROOT = root;
  return import("../store");
}

beforeEach(() => {
  originalRoot = process.env.MEDIA_ROOT;
  root = path.join(process.cwd(), "data", "__test-media__");
});

afterEach(() => {
  if (originalRoot === undefined) delete process.env.MEDIA_ROOT;
  else process.env.MEDIA_ROOT = originalRoot;
});

describe("media path safety", () => {
  it("rejects traversal, backslashes, absolute and trailing dot/space", async () => {
    const { assertSafeMediaPath } = await loadStore();
    expect(() => assertSafeMediaPath("../x.webp")).toThrow();
    expect(() => assertSafeMediaPath("a/../b.webp")).toThrow();
    expect(() => assertSafeMediaPath("a\\b.webp")).toThrow();
    expect(() => assertSafeMediaPath("/etc/passwd")).toThrow();
    expect(() => assertSafeMediaPath("a/b.")).toThrow();
    expect(() => assertSafeMediaPath("a/b ")).toThrow();
    expect(() => assertSafeMediaPath("C:evil.webp")).toThrow();
  });

  it("accepts content-hashed filenames", async () => {
    const { assertSafeMediaPath } = await loadStore();
    expect(assertSafeMediaPath("0123456789abcdef.webp")).toBe("0123456789abcdef.webp");
    expect(assertSafeMediaPath("sub/0123456789abcdef-1.webp")).toContain("-1.webp");
  });

  it("resolves safe paths under MEDIA_ROOT and blocks escapes", async () => {
    const store = await loadStore();
    const file = store.resolveMediaFile("ab12.webp");
    expect(file.startsWith(path.resolve(root))).toBe(true);
    expect(() => store.resolveMediaFile("../escape.webp")).toThrow();
  });

  it("builds /media URLs and content types", async () => {
    const store = await loadStore();
    expect(store.mediaUrl("ab12.webp")).toBe("/media/ab12.webp");
    expect(store.contentTypeFor("ab12.webp")).toBe("image/webp");
    expect(store.contentTypeFor("ab12.png")).toBe("image/png");
    expect(store.contentTypeFor("ab12.bin")).toBe("application/octet-stream");
  });
});
