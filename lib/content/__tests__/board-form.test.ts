import { describe, expect, it } from "vitest";
import {
  blankPost,
  formToPost,
  formatFileSize,
  generatePostIdx,
  imageTag,
  insertHtmlAtCaret,
  normalizeAttachments,
  toPostForm,
  type PostForm,
} from "../board-form";
import type { BoardPost } from "../../types";

const post: BoardPost = {
  idx: "167290728",
  href: "/x",
  title: "Title",
  category: "필터",
  excerpt: "Excerpt",
  thumb: "/images/a.jpg",
  isNotice: true,
  date: "2026-01-01",
  views: 12,
  content: "<p>c</p>",
  files: [{ name: "f.pdf", href: "/files/f.pdf", size: 14295 }],
};

describe("board-form", () => {
  it("blankPost starts empty with the given idx", () => {
    const blank = blankPost("new-1");
    expect(blank.idx).toBe("new-1");
    expect(blank.title).toBe("");
    expect(blank.category).toBeUndefined();
    expect(blank.thumb).toBeNull();
    expect(blank.isNotice).toBe(false);
    expect(blank.files).toEqual([]);
  });

  it("round-trips a post through the form, preserving files/href/size", () => {
    const form = toPostForm(post);
    expect(form).toEqual({
      idx: "167290728",
      title: "Title",
      category: "필터",
      excerpt: "Excerpt",
      content: "<p>c</p>",
      thumb: "/images/a.jpg",
      date: "2026-01-01",
      isNotice: true,
      views: "12",
      files: [{ name: "f.pdf", href: "/files/f.pdf", size: 14295 }],
    });

    expect(formToPost(form, post)).toEqual(post);
  });

  it("trims and nulls empty optional fields", () => {
    const form: PostForm = {
      idx: "  a  ",
      title: "  T  ",
      category: "   ",
      excerpt: "",
      content: "",
      thumb: "   ",
      date: "  ",
      isNotice: false,
      views: "",
      files: [],
    };
    const result = formToPost(form);
    expect(result.idx).toBe("a");
    expect(result.title).toBe("T");
    expect(result.category).toBeUndefined();
    expect(result.thumb).toBeNull();
    expect(result.date).toBeNull();
    expect(result.views).toBeNull();
    expect(result.files).toEqual([]);
  });

  it("parses views and rejects non-numeric input", () => {
    const base: PostForm = {
      idx: "a",
      title: "T",
      category: "",
      excerpt: "",
      content: "",
      thumb: "",
      date: "",
      isNotice: false,
      views: "42",
      files: [],
    };
    expect(formToPost(base).views).toBe(42);
    expect(formToPost({ ...base, views: "abc" }).views).toBeNull();
  });

  it("generates unique new idxs", () => {
    const first = generatePostIdx();
    expect(first.startsWith("new-")).toBe(true);

    const second = generatePostIdx([first]);
    expect(second).not.toBe(first);
    expect(generatePostIdx(["a", "b"])).not.toBe("a");
  });
});

describe("normalizeAttachments", () => {
  it("trims names/hrefs, drops blank rows, floors sizes", () => {
    expect(
      normalizeAttachments([
        { name: "  a.pdf ", href: " /files/a.pdf ", size: 2048.9 },
        { name: "", href: "/files/b.pdf" },
        { name: "c.pdf", href: "" },
      ]),
    ).toEqual([{ name: "a.pdf", href: "/files/a.pdf", size: 2048 }]);
  });

  it("keeps legacy entries without a size and drops invalid sizes", () => {
    expect(
      normalizeAttachments([
        { name: "a.pdf", href: "/a.pdf" },
        { name: "b.pdf", href: "/b.pdf", size: -1 },
      ]),
    ).toEqual([{ name: "a.pdf", href: "/a.pdf" }, { name: "b.pdf", href: "/b.pdf" }]);
  });

  it("tolerates undefined/non-array input", () => {
    expect(normalizeAttachments(undefined)).toEqual([]);
    expect(normalizeAttachments("nope" as never)).toEqual([]);
  });
});

describe("caret insert helpers", () => {
  it("inserts at the caret and returns the offset after the snippet", () => {
    const result = insertHtmlAtCaret("hello world", "<img/>", 5, 5);
    expect(result.value).toBe("hello<img/> world");
    expect(result.caret).toBe(11);
  });

  it("replaces the selected range", () => {
    const result = insertHtmlAtCaret("abcdef", "X", 1, 4);
    expect(result.value).toBe("aXef");
    expect(result.caret).toBe(2);
  });

  it("clamps out-of-range or inverted offsets", () => {
    expect(insertHtmlAtCaret("abc", "X", 99, 99)).toEqual({ value: "abcX", caret: 4 });
    expect(insertHtmlAtCaret("abc", "X", 3, 1)).toEqual({ value: "abcX", caret: 4 });
    expect(insertHtmlAtCaret("abc", "X", -5, -1)).toEqual({ value: "Xabc", caret: 1 });
  });

  it("builds an escaped <img> tag", () => {
    expect(imageTag("/files/a.png")).toBe('<img src="/files/a.png" alt=""/>');
    expect(imageTag("/x.png", 'a"b')).toBe('<img src="/x.png" alt="a&quot;b"/>');
  });

  it("formats byte sizes as KB", () => {
    expect(formatFileSize(14295)).toBe("14KB");
    expect(formatFileSize(1)).toBe("1KB");
    expect(formatFileSize(0)).toBe("1KB");
    expect(formatFileSize(2 * 1024 * 1024)).toBe("2,048KB");
  });
});
