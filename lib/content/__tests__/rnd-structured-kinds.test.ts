import { describe, expect, it } from "vitest";
import type { PageContent, Section, WidgetNode } from "../../types";
import { CONTENT_DEFS, DEFAULT_VALUES } from "../registry";
import { PAIR_IGNORED_TYPES, sectionWidgets } from "../pair";
import { getPage } from "../read";
// The generator's structured parsers are plain .mjs; import them directly (the
// module's `main()` is guarded so importing has no side effects).
import {
  FACILITIES_TABLES,
  PATENT_SECTIONS,
  TECH_FEATURE_BLOCKS,
  cellText,
  parseFacilitiesTable,
  parsePatentSections,
  parseTableRows,
  parseTechFeatureSection,
  parseTechTable,
} from "../../../scripts/gen-content-registry.mjs";

/**
 * Structured R&D kinds: `techFeatures` (rnd.technology §4/§5/§6),
 * `patentSections` (rnd.patents §4) and `facilitiesTable` (rnd.facilities §5).
 *
 * Covers the generator parsers on the real content and the round-trip guarantee
 * (re-serializing the parsed structure must byte-equal the emitted default).
 */

const TECH_KEY = "rnd.technology";
const TECH_SECTIONS = TECH_FEATURE_BLOCKS.sections;
const TECH_DEF_KEY = `${TECH_KEY}#${TECH_SECTIONS[0]}/techFeatures/techFeatures`;
const PATENTS_KEY = "rnd.patents";
const FACILITIES_KEY = "rnd.facilities";

const koPage = (key: string) => getPage("ko", key);
const enPage = (key: string) => getPage("en", key);

function sectionOf(page: PageContent, id: string): Section {
  const section = page.sections.find((candidate) => candidate.id === id);
  if (!section) throw new Error(`section missing: ${page.title}/${id}`);
  return section;
}

const widgetOf = (section: Section, id: string): WidgetNode | null =>
  sectionWidgets(section).find((widget) => widget.id === id) ?? null;

/**
 * The EN section positionally paired with a KO section (EN ids differ). Used to
 * mirror the generator's KO→EN index alignment when reading EN fixtures.
 */
function enSectionFor(ko: PageContent, en: PageContent, koSectionId: string): Section {
  const index = ko.sections.findIndex((section) => section.id === koSectionId);
  if (index < 0) throw new Error(`KO section missing: ${koSectionId}`);
  const section = en.sections[index];
  if (!section) throw new Error(`EN section missing at index ${index}`);
  return section;
}

/**
 * The positional KO↔EN widget pairing the generator uses (contentless widget
 * types ignored). Keys are KO widget ids.
 */
function pairMapOf(koSection: Section, enSection: Section): Map<string, WidgetNode | null> {
  const koPaired = sectionWidgets(koSection).filter((w) => !PAIR_IGNORED_TYPES.has(w.type));
  const enPaired = sectionWidgets(enSection).filter((w) => !PAIR_IGNORED_TYPES.has(w.type));
  return new Map(koPaired.map((w, i) => [w.id, enPaired[i] ?? null]));
}

describe("techFeatures parser (rnd.technology §4/§5/§6)", () => {
  it("parses §4: rowspan heading cell + row0 label/body included", () => {
    const section = sectionOf(koPage(TECH_KEY), TECH_SECTIONS[0]);
    const items = parseTechFeatureSection(
      TECH_FEATURE_BLOCKS.bySection[TECH_SECTIONS[0]],
      (id) => widgetOf(section, id),
    );

    expect(items).toHaveLength(1);
    expect(items[0].image).toBe("/images/thumbnail/20250911/cacef61fc2561.jpg");
    // The rowspan heading's two design lines join with `\n`.
    expect(items[0].heading).toBe("친환경·프리미엄\n수처리 기술력");
    // Row 0 carries its own label/body, so there are three data rows.
    expect(items[0].rows).toHaveLength(3);
    expect(items[0].rows.map((row) => row.label)).toEqual([
      "다단계 정수 시스템",
      "미네랄·알칼리 기능성 필터",
      "비데·샤워·생활가전 필터",
    ]);
    expect(items[0].rows[0].body).toBe(
      "세디먼트, 프리카본, UF/RO/NF 멤브레인, 포스트카본 등 다양한 조합으로 현지 수질에 최적화된 맞춤형 필터 제공",
    );
  });

  it("parses §5/§6: colspan heading cell + two label/body rows per block", () => {
    const section = sectionOf(koPage(TECH_KEY), TECH_SECTIONS[1]);
    const items = parseTechFeatureSection(
      TECH_FEATURE_BLOCKS.bySection[TECH_SECTIONS[1]],
      (id) => widgetOf(section, id),
    );
    expect(items).toHaveLength(2);
    expect(items[0].heading).toBe("OEM/글로벌 협업 역량");
    expect(items[0].rows).toHaveLength(2);
    expect(items[1].heading).toBe("첨단 검사 및 품질 관리 체계");
    expect(items[1].rows).toHaveLength(3);
  });

  it("round-trips an authored <br> inside a body as a newline", () => {
    const section = sectionOf(koPage(TECH_KEY), TECH_SECTIONS[2]);
    const items = parseTechFeatureSection(
      TECH_FEATURE_BLOCKS.bySection[TECH_SECTIONS[2]],
      (id) => widgetOf(section, id),
    );
    // §6 block 1 body authors two <br>-separated lines.
    expect(items[0].rows[0].body).toBe(
      "물을 전기분해해 염소를 발생시키고,\n정수기·비데·탱크 내부를 살균 가능.",
    );
    // A <span>-wrapped <br> sequence in §6 block 2 splits into three lines.
    expect(items[1].rows[0].body).toBe(
      "월 25만 개 생산 가능,\n자동화 라인과 전문 인력으로\n대규모 OEM 수요 대응 가능.",
    );
  });

  it("emits ONE def whose techBlocks mapping matches the three section ids", () => {
    const defs = CONTENT_DEFS.filter((candidate) => candidate.kind === "techFeatures");
    expect(defs).toHaveLength(1);
    const def = defs[0];
    expect(def.key).toBe(TECH_DEF_KEY);
    expect(def.techBlocks).toEqual({
      sections: [
        "s202509091799d895b62ea",
        "s2025090972e449f7846e1",
        "s20250909b12fa8000068e",
      ],
    });
    expect(def.techBlocks!.sections).toEqual([...TECH_SECTIONS]);
  });

  it("emits a default byte-identical to the parsed KO and positionally-paired EN", () => {
    const def = CONTENT_DEFS.find((candidate) => candidate.kind === "techFeatures")!;
    const ko = koPage(TECH_KEY);
    const en = enPage(TECH_KEY);

    const koBlocks = TECH_SECTIONS.map((sectionId) => {
      const koSection = sectionOf(ko, sectionId);
      return {
        items: parseTechFeatureSection(
          TECH_FEATURE_BLOCKS.bySection[sectionId],
          (id) => widgetOf(koSection, id),
        ),
      };
    });
    expect(JSON.parse(DEFAULT_VALUES[def.key].ko!)).toEqual({ blocks: koBlocks });
    // Exactly three fixed blocks: §4 → 1 item, §5 → 2, §6 → 2.
    expect(koBlocks.map((block) => block.items.length)).toEqual([1, 2, 2]);

    const enBlocks = TECH_SECTIONS.map((sectionId) => {
      const koSection = sectionOf(ko, sectionId);
      const enSection = enSectionFor(ko, en, sectionId);
      const pairs = pairMapOf(koSection, enSection);
      return {
        items: parseTechFeatureSection(
          TECH_FEATURE_BLOCKS.bySection[sectionId],
          (id) => pairs.get(id) ?? null,
        ),
      };
    });
    expect(JSON.parse(DEFAULT_VALUES[def.key].en!)).toEqual({ blocks: enBlocks });
  });

  it("leaves no per-widget def for a covered image/text widget", () => {
    const covered = TECH_SECTIONS.flatMap((sectionId) =>
      TECH_FEATURE_BLOCKS.bySection[sectionId].items.flatMap((item) => [
        item.imageWidget,
        item.textWidget,
      ]),
    );
    const keys = covered.map(
      (widgetId) => CONTENT_DEFS.some((def) => def.widgetId === widgetId),
    );
    expect(keys).toEqual(covered.map(() => false));
    // §4 (1 item) + §5 (2) + §6 (2) = 5 items → 10 widgets.
    expect(covered).toHaveLength(10);
  });
});

describe("patentSections parser (rnd.patents §4)", () => {
  it("folds the three heading + gallery groups and drops the empty slot", () => {
    const section = sectionOf(koPage(PATENTS_KEY), PATENT_SECTIONS.sectionId);
    const parsed = parsePatentSections(
      PATENT_SECTIONS,
      (id) => widgetOf(section, id),
    );

    expect(parsed.sections).toHaveLength(3);
    expect(parsed.sections.map((s) => s.title)).toEqual([
      "인증 현황",
      "기업 인증 및 특허 현황",
      "국제 인증 및 위촉 현황",
    ]);
    // 14 authored slots, one empty trailing placeholder dropped.
    expect(parsed.sections[0].items).toHaveLength(13);
    expect(parsed.sections[0].items.every((item) => item.image && item.caption === "인증서")).toBe(
      true,
    );
    expect(parsed.sections[1].items).toHaveLength(4);
    expect(parsed.sections[2].items).toHaveLength(4);
  });

  it("emits a default byte-identical to the parsed KO and positionally-paired EN", () => {
    const def = CONTENT_DEFS.find((candidate) => candidate.kind === "patentSections")!;
    const ko = koPage(PATENTS_KEY);
    const en = enPage(PATENTS_KEY);
    const koSection = sectionOf(ko, PATENT_SECTIONS.sectionId);
    const enSection = enSectionFor(ko, en, PATENT_SECTIONS.sectionId);
    const pairs = pairMapOf(koSection, enSection);

    expect(JSON.parse(DEFAULT_VALUES[def.key].ko!)).toEqual(
      parsePatentSections(PATENT_SECTIONS, (id) => widgetOf(koSection, id)),
    );
    expect(JSON.parse(DEFAULT_VALUES[def.key].en!)).toEqual(
      parsePatentSections(PATENT_SECTIONS, (id) => pairs.get(id) ?? null),
    );
  });

  it("leaves no per-widget heading/gallery def for the covered section", () => {
    for (const { headingWidget, galleryWidget } of PATENT_SECTIONS.blocks) {
      expect(CONTENT_DEFS.some((def) => def.widgetId === headingWidget)).toBe(false);
      expect(CONTENT_DEFS.some((def) => def.widgetId === galleryWidget)).toBe(false);
    }
  });
});

describe("facilitiesTable parser (rnd.facilities §5)", () => {
  it("parses row0 as header and the rest as rows", () => {
    const section = sectionOf(koPage(FACILITIES_KEY), "s20250829c25afe324e195");
    const first = widgetOf(section, "w20250829bb21466f4e0f1")!;
    expect(parseFacilitiesTable(first)).toEqual({
      header: ["설비명", "대 수"],
      rows: [
        ["회전융착기", "3"],
        ["공압검사기", "2"],
        ["라벨부착기", "3"],
        ["수축포장기", "2"],
        ["잉크젯 인쇄기", "2"],
        ["Total", "12"],
      ],
    });
  });

  it("emits per-widget defaults byte-identical to the parsed KO/EN widgets", () => {
    const ko = koPage(FACILITIES_KEY);
    const en = enPage(FACILITIES_KEY);
    const koSection = sectionOf(ko, "s20250829c25afe324e195");
    const enSection = enSectionFor(ko, en, "s20250829c25afe324e195");
    const pairs = pairMapOf(koSection, enSection);

    for (const widgetId of Object.keys(FACILITIES_TABLES)) {
      const def = CONTENT_DEFS.find(
        (candidate) =>
          candidate.key ===
          `rnd.facilities#s20250829c25afe324e195/${widgetId}/facilitiesTable`,
      );
      expect(def, widgetId).toBeDefined();
      expect(JSON.parse(DEFAULT_VALUES[def!.key].ko!), widgetId).toEqual(
        parseFacilitiesTable(widgetOf(koSection, widgetId)),
      );
      expect(JSON.parse(DEFAULT_VALUES[def!.key].en!), widgetId).toEqual(
        parseFacilitiesTable(pairs.get(widgetId) ?? null),
      );
    }
  });

  it("leaves no legacy lines def for a covered table widget", () => {
    for (const widgetId of Object.keys(FACILITIES_TABLES)) {
      expect(CONTENT_DEFS.some((def) => def.widgetId === widgetId && def.kind === "lines")).toBe(
        false,
      );
    }
  });
});

describe("table helpers", () => {
  it("returns each row's cells and joins cell runs with newlines", () => {
    const html =
      '<table><tbody><tr><td colspan="2">Head</td></tr>' +
      "<tr><td>A<br>B</td><td>C</td></tr></tbody></table>";
    expect(parseTableRows(html)).toEqual([["Head"], ["A<br>B", "C"]]);
    expect(cellText("A<br>B")).toBe("A\nB");
  });

  it("parses a rowspan-heading table (row0 label/body counts as a data row)", () => {
    const html =
      '<table><tbody><tr><td rowspan="2">H1<br>H2</td><td>L0</td><td>B0</td></tr>' +
      "<tr><td>L1</td><td>B1</td></tr></tbody></table>";
    expect(parseTechTable(html)).toEqual({
      heading: "H1\nH2",
      rows: [
        { label: "L0", body: "B0" },
        { label: "L1", body: "B1" },
      ],
    });
  });

  it("parses a colspan-heading table (row0 is the heading only)", () => {
    const html =
      '<table><tbody><tr><td colspan="2">Head</td></tr>' +
      "<tr><td>L0</td><td>B0</td></tr></tbody></table>";
    expect(parseTechTable(html)).toEqual({
      heading: "Head",
      rows: [{ label: "L0", body: "B0" }],
    });
  });
});
