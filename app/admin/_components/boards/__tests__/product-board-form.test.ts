import { describe, expect, it } from "vitest";
import type { PostForm as PostFormShape } from "@/lib/content/board-form";
import type { BoardPost } from "@/lib/types";
import {
  normalizeDateInput,
  previewThumbFromHtml,
  productPostFromForm,
} from "../product-board-form";

/**
 * Pure product-board form helpers (no DOM, no DB). They had zero coverage before
 * — these lock the date-preservation, server-derived-field clearing and
 * preview-thumb rules that the product admin form depends on.
 */

function form(overrides: Partial<PostFormShape> = {}): PostFormShape {
  return {
    idx: "p1",
    title: "Eco Wave",
    category: "f-abc12345",
    excerpt: "stale excerpt",
    content: "<p>body</p>",
    thumb: "/stale.jpg",
    date: "2025.09.18",
    isNotice: true,
    views: "12",
    files: [{ name: "spec.pdf", href: "/files/spec.pdf", size: 100 }],
    ...overrides,
  };
}

describe("normalizeDateInput", () => {
  it("converts dot and slash dates to yyyy-mm-dd, zero-padding", () => {
    expect(normalizeDateInput("2025.09.18")).toBe("2025-09-18");
    expect(normalizeDateInput("2025/9/8")).toBe("2025-09-08");
    expect(normalizeDateInput("2025-09-18")).toBe("2025-09-18");
    expect(normalizeDateInput("2025.9.8")).toBe("2025-09-08");
  });

  it("keeps empty input empty", () => {
    expect(normalizeDateInput("")).toBe("");
    expect(normalizeDateInput("   ")).toBe("");
  });

  it("collapses an unrecognized non-empty value to blank for the picker", () => {
    expect(normalizeDateInput("September 18, 2025")).toBe("");
    expect(normalizeDateInput("18.09.2025")).toBe("");
    expect(normalizeDateInput("2025")).toBe("");
  });
});

describe("productPostFromForm", () => {
  it("clears the server-derived thumb/excerpt and passes every other field through", () => {
    const post = productPostFromForm(form());

    expect(post.thumb).toBeNull();
    expect(post.excerpt).toBe("");
    expect(post.title).toBe("Eco Wave");
    expect(post.category).toBe("f-abc12345");
    expect(post.content).toBe("<p>body</p>");
    expect(post.isNotice).toBe(true);
    expect(post.views).toBe(12);
    expect(post.files).toEqual([{ name: "spec.pdf", href: "/files/spec.pdf", size: 100 }]);
  });

  it("preserves a raw, non-ISO stored date into the payload", () => {
    expect(productPostFromForm(form({ date: "2025.09.18" })).date).toBe("2025.09.18");
  });

  it("treats a blank date as unset", () => {
    expect(productPostFromForm(form({ date: "   " })).date).toBeNull();
  });

  it("clears thumb/excerpt even when a base post carries stale values", () => {
    const base: BoardPost = {
      idx: "p1",
      href: "/products/eco-wave/p1",
      title: "Old",
      excerpt: "old excerpt",
      thumb: "/old.jpg",
      isNotice: false,
      date: null,
      views: null,
      files: [],
    };
    const post = productPostFromForm(form(), base);
    expect(post.thumb).toBeNull();
    expect(post.excerpt).toBe("");
    // `href` survives from the base (formToPost preserves it).
    expect(post.href).toBe("/products/eco-wave/p1");
  });
});

describe("previewThumbFromHtml", () => {
  it("returns the first image, quoted or not", () => {
    expect(previewThumbFromHtml('<p>x</p><img src="/a.jpg"><img src="/b.jpg">')).toBe("/a.jpg");
    expect(previewThumbFromHtml("<img src='/c.png' alt=''>")).toBe("/c.png");
    expect(previewThumbFromHtml("<img src=/d.webp>")).toBe("/d.webp");
  });

  it("returns null when there is no image", () => {
    expect(previewThumbFromHtml("<p>no image here</p>")).toBeNull();
    expect(previewThumbFromHtml("")).toBeNull();
  });
});
