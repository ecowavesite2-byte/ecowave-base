import { describe, expect, it } from "vitest";
import { extractTextRuns, injectTextRuns } from "../text-runs";

/**
 * The `lines` kind stores one plain-text line per styled text node. These tests
 * pin the two invariants the admin editor relies on: extraction is one line per
 * run, and injection never touches the tags/styles.
 */

const VISION =
  `<p class="font1" style="text-align: center; line-height: 1.5;">` +
  `<span style="font-size: 48px;"><strong>건강하고 깨끗한 물, 에코웨이브가</strong></span></p>` +
  `<p class="font1" style="text-align: center;">` +
  `<span style="font-size: 48px;"><strong>고객과 함께&nbsp;</strong></span>` +
  `<span style="font-size: 48px; color: rgb(52,101,222);"><strong>더 나은 미래를 만들어갑니다.</strong></span></p>`;

const tagsOf = (html: string) => html.match(/<[^>]*>/g) ?? [];

describe("text-runs", () => {
  it("extracts one decoded run per styled text node", () => {
    expect(extractTextRuns(VISION)).toEqual([
      "건강하고 깨끗한 물, 에코웨이브가",
      "고객과 함께",
      "더 나은 미래를 만들어갑니다.",
    ]);
  });

  it("injects lines while preserving every tag and style", () => {
    const out = injectTextRuns(VISION, "A\nB\nC");
    expect(tagsOf(out)).toEqual(tagsOf(VISION));
    expect(out).toContain(">A<");
    // the `&nbsp;` boundary of run 2 is preserved (Gate-2 F1)
    expect(out).toContain(">B&nbsp;<");
    expect(out).toContain(">C<");
    expect(out).not.toContain("건강하고 깨끗한 물");
    expect(extractTextRuns(out)).toEqual(["A", "B", "C"]);
  });

  it("preserves entity whitespace at run boundaries (Gate-2 F1)", () => {
    const html = `<p><span>고객과 함께&nbsp;</span><span>보다 건강하고</span></p>`;
    const out = injectTextRuns(html, "고객과 함께\n보다 건강하고");
    // exact: a lost `&nbsp;` would concatenate the two styled spans
    expect(out).toBe(html);
    expect(extractTextRuns(out)).toEqual(["고객과 함께", "보다 건강하고"]);
  });

  it("clears remaining runs when fewer lines are given", () => {
    const out = injectTextRuns(VISION, "only");
    expect(extractTextRuns(out)).toEqual(["only"]);
    expect(tagsOf(out)).toEqual(tagsOf(VISION));
  });

  it("appends extra lines to the last run instead of dropping them", () => {
    const out = injectTextRuns(VISION, "A\nB\nC\nD");
    expect(extractTextRuns(out)).toEqual(["A", "B", "C D"]);
  });

  it("escapes markup so plain text can never inject tags", () => {
    const out = injectTextRuns("<p><span>x</span></p>", "<script> & y");
    expect(out).toContain("&lt;script&gt; &amp; y");
    expect(out).not.toContain("<script>");
  });

  it("round-trips the crawled markup exactly", () => {
    const plain = extractTextRuns(VISION).join("\n");
    const out = injectTextRuns(VISION, plain);
    expect(out).toBe(VISION);
  });

  it("leaves markup-only templates untouched; escapes tag-free fallbacks", () => {
    expect(injectTextRuns("", "hello & bye")).toBe("hello &amp; bye");
    // a markup-only widget (logo/structure html) must never be replaced by text
    expect(injectTextRuns("<div></div>", "a\nb")).toBe("<div></div>");
  });
});
