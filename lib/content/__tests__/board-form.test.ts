import { describe, expect, it } from "vitest";
import { blankPost, formToPost, generatePostIdx, toPostForm, type PostForm } from "../board-form";
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
  files: [{ name: "f.pdf", href: "/files/f.pdf" }],
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

  it("round-trips a post through the form, preserving files/href", () => {
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
