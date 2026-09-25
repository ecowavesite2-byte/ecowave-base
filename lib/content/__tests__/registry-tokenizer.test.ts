import { describe, expect, it } from "vitest";
import { extractTextRuns } from "../text-runs";
import { sectionWidgets } from "../pair";
import { getPage } from "../read";
// The generator mirrors the tokenizer in plain .mjs (scripts/ is not TS), so a
// parity test is the drift guard: if either implementation changes, the `lines`
// defaults would silently stop round-tripping.
import { textRuns as generatorTextRuns } from "../../../scripts/gen-content-registry.mjs";

const FIXTURES = [
  `<p><span style="font-size: 48px;"><strong>건강하고 깨끗한 물, 에코웨이브가</strong></span></p>`,
  `<p><span>고객과 함께&nbsp;</span><span>더 나은 미래를 만들어갑니다.</span></p>`,
  `\n\n  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined" />\n`,
  `<div class="text_bg_color" style="background-color: #ffffff"><div class="text-table holder">KOR</div></div>`,
  `<div></div>`,
  ``,
];

describe("registry tokenizer parity (mirror drift guard)", () => {
  it("matches extractTextRuns on representative fixtures", () => {
    for (const html of FIXTURES) {
      expect(generatorTextRuns(html), html.slice(0, 40)).toEqual(extractTextRuns(html));
    }
  });

  it("matches on every home text widget", () => {
    for (const section of getPage("ko", "home").sections) {
      for (const widget of sectionWidgets(section)) {
        if (widget.type !== "text") continue;
        expect(generatorTextRuns(widget.html)).toEqual(extractTextRuns(widget.html));
      }
    }
  });
});
