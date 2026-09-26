import { describe, expect, it } from "vitest";
import { extractRunSizes, extractTextRuns, injectTextRuns } from "../text-runs";

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

  it("keeps authored inline HTML but escapes bare angle brackets", () => {
    const out = injectTextRuns("<p><span>x</span></p>", "<b>bold</b> & pH < 7");
    expect(out).toContain("<b>bold</b>");
    expect(out).toContain("&amp; pH &lt; 7");
  });

  it("injects into a run range and leaves the other runs untouched", () => {
    const html = `<p><span>A</span></p><p><span>B</span></p><p><span>C</span></p>`;
    const titleOnly = injectTextRuns(html, "TITLE", { start: 0, end: 0 });
    expect(extractTextRuns(titleOnly)).toEqual(["TITLE", "B", "C"]);

    const descOnly = injectTextRuns(html, "D1\nD2", { start: 1 });
    expect(extractTextRuns(descOnly)).toEqual(["A", "D1", "D2"]);

    // extra range lines fold into the last in-range run
    const folded = injectTextRuns(html, "D1\nD2\nD3", { start: 1, end: 1 });
    expect(extractTextRuns(folded)).toEqual(["A", "D1 D2 D3", "C"]);
  });

  it("infers per-run font sizes for slide title/subtitle splits", () => {
    const html =
      `<p><span style="font-size: 85px;"><strong>BIG</strong></span></p>` +
      `<p><span style="font-size: 24px;">small one</span><span style="font-size: 24px;">small two</span></p>`;
    expect(extractRunSizes(html)).toEqual([85, 24, 24]);
    expect(extractTextRuns(html)).toEqual(["BIG", "small one", "small two"]);
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

  it("drops zero-width-only text nodes from the run list", () => {
    const html = `<p><span>A</span></p><p><span>\u200B</span></p>`;
    expect(extractTextRuns(html)).toEqual(["A"]);
    // same for a ZWNJ/ZWJ/BOM node
    expect(extractTextRuns("<p><span>\u200C\u200D\uFEFF</span></p>")).toEqual([]);
  });

  it("strips trailing zero-width characters from a run", () => {
    expect(extractTextRuns("<p><span>건강\u200B</span></p>")).toEqual(["건강"]);
    expect(extractTextRuns("<p><span>\u200B깨끗한 물</span></p>")).toEqual(["깨끗한 물"]);
  });

  it("injects into the real run while leaving the zero-width node in the markup", () => {
    const html = `<p><span>A</span></p><p><span>\u200B</span></p>`;
    const out = injectTextRuns(html, "X\nY");
    // the ZWSP-only node stays in the markup (never injected/cleared)...
    expect(out).toContain("\u200B");
    // ...and the extra line folds into the single real run.
    expect(extractTextRuns(out)).toEqual(["X Y"]);
    expect(tagsOf(out)).toEqual(tagsOf(html));
  });
});
