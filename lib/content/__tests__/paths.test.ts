import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertSafeKey,
  boardPath,
  CONTENT_ROOT,
  isValidBoardSlug,
  isValidPageKey,
  pagePath,
} from "../paths";

describe("assertSafeKey", () => {
  it("rejects parent traversal", () => {
    expect(() => assertSafeKey("../secret")).toThrow(/traversal/i);
    expect(() => assertSafeKey("a/../b")).toThrow(/traversal/i);
  });

  it("rejects backslashes, colons and absolute paths", () => {
    expect(() => assertSafeKey("a\\b")).toThrow(/backslash/i);
    expect(() => assertSafeKey("C:evil")).toThrow(/colon|drive/i);
    expect(() => assertSafeKey("/etc/passwd")).toThrow(/absolute/i);
  });

  it("rejects reserved Windows device names", () => {
    expect(() => assertSafeKey("CON")).toThrow(/reserved/i);
    expect(() => assertSafeKey("nul.json")).toThrow(/reserved/i);
  });

  it("rejects trailing dot/space segments", () => {
    expect(() => assertSafeKey("home.")).toThrow(/trailing/i);
    expect(() => assertSafeKey("a /b")).toThrow(/trailing/i);
  });

  it("accepts dotted and slashed keys", () => {
    expect(assertSafeKey("company.ceo")).toBe("company.ceo");
    expect(assertSafeKey("products/eco-wave")).toBe("products/eco-wave");
  });

  it("enforces containment under CONTENT_ROOT when a file is supplied", () => {
    const inside = path.join(CONTENT_ROOT, "ko", "pages", "home.json");
    expect(() => assertSafeKey("home", inside)).not.toThrow();

    const outside = path.join(process.cwd(), "outside.json");
    expect(() => assertSafeKey("home", outside)).toThrow(/CONTENT_ROOT/);
  });
});

describe("content allowlists and path builders", () => {
  it("recognises page keys and board slugs", () => {
    expect(isValidPageKey("company.ceo")).toBe(true);
    expect(isValidPageKey("products.eco-wave")).toBe(false);
    expect(isValidBoardSlug("products.eco-wave")).toBe(true);
    expect(isValidBoardSlug("nope")).toBe(false);
  });

  it("builds paths under CONTENT_ROOT", () => {
    expect(pagePath("ko", "home")).toBe(path.join(CONTENT_ROOT, "ko", "pages", "home.json"));
    expect(pagePath("en", "company.ceo")).toBe(
      path.join(CONTENT_ROOT, "en", "pages", "company.ceo.json"),
    );
    expect(boardPath("en", "products.eco-wave")).toBe(
      path.join(CONTENT_ROOT, "en", "boards", "products.eco-wave.json"),
    );
  });
});
