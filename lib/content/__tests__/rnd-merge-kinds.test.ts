import { describe, expect, it } from "vitest";
import type { ColNode, Node, PageContent, RowNode, Section, WidgetNode } from "../../types";
import { CONTENT_DEFS, DEFAULT_VALUES } from "../registry";
import { applyPageOverrides } from "../merge";
import { sectionWidgets } from "../pair";
import { getPage } from "../read";

/**
 * Merge appliers for the structured R&D kinds: `techFeatures`
 * (rnd.technology §4/§5/§6), `patentSections` (rnd.patents §4) and
 * `facilitiesTable` (rnd.facilities §5).
 *
 * The hard guarantee: re-applying the UNCHANGED default payload reproduces the
 * authored markup (byte-identical where the authored tree permits; the patent
 * gallery's trailing empty placeholder is documented below).
 */

const TECH_KEY = "rnd.technology";
const PATENTS_KEY = "rnd.patents";
const FACILITIES_KEY = "rnd.facilities";
const FACILITIES_SECTION = "s20250829c25afe324e195";

const TECH_SECTIONS = [
  "s202509091799d895b62ea", // §4 rowspan heading + top-level image/text rows
  "s2025090972e449f7846e1", // §5 two item cols
  "s20250909b12fa8000068e", // §6 two item cols
] as const;
/** The ONE v2 techFeatures def: anchored at §4, three fixed blocks. */
const TECH_DEF_KEY = `rnd.technology#${TECH_SECTIONS[0]}/techFeatures/techFeatures`;
const PATENT_SECTION = "s202508114d9bc90ceb876";
const FACILITY_WIDGETS = [
  "w20250829bb21466f4e0f1",
  "w20250829370d74ba50fab",
  "w202508298781405b23d22",
  "w202508293b8acaf6df97a",
] as const;

const tech = getPage("ko", TECH_KEY);
const patents = getPage("ko", PATENTS_KEY);
const facilities = getPage("ko", FACILITIES_KEY);

function sectionOf(page: PageContent, id: string): Section {
  const section = page.sections.find((candidate) => candidate.id === id);
  if (!section) throw new Error(`section missing: ${id}`);
  return section;
}

function widgetOf(page: PageContent, sectionId: string, widgetId: string): WidgetNode {
  const widget = sectionWidgets(sectionOf(page, sectionId)).find((w) => w.id === widgetId);
  if (!widget) throw new Error(`widget missing: ${widgetId}`);
  return widget;
}

function nodesOf(node: Node): WidgetNode[] {
  if (node.kind === "widget") return [node];
  if (node.kind === "col") return (node.children ?? []).flatMap(nodesOf);
  return (node.cols ?? []).flatMap(nodesOf);
}

/** Top-level wrapper rows whose cols each wrap nested rows. */
function itemColsRows(section: Section): RowNode[] {
  return section.rows.filter(
    (node): node is RowNode =>
      node.kind === "row" &&
      node.cols.length > 0 &&
      node.cols.every((col) => (col.children ?? []).some((child) => child.kind === "row")),
  );
}

function keyOf(kind: string, pageKey: string): string {
  const def = CONTENT_DEFS.find((candidate) => candidate.kind === kind && candidate.pageKey === pageKey);
  if (!def) throw new Error(`no ${kind} def for ${pageKey}`);
  return def.key;
}

function defaultPayload(key: string): Record<string, unknown> {
  const raw = DEFAULT_VALUES[key]?.ko;
  if (!raw) throw new Error(`no default for ${key}`);
  return JSON.parse(raw) as Record<string, unknown>;
}

/** The emitted block→section configs, keyed by override key (mirrors resolved.ts). */
function techBlockConfigs(): Record<string, { sections: string[] }> {
  return Object.fromEntries(
    CONTENT_DEFS.filter((def) => def.techBlocks).map((def) => [
      def.key,
      def.techBlocks as { sections: string[] },
    ]),
  );
}

/** A v2 techFeatures payload / its blocks. */
type TechPayloadV2 = {
  blocks: Array<{
    items: Array<{ image: string; heading: string; rows: Array<{ label: string; body: string }> }>;
  }>;
};

/* ---------------- EN round-trips (positional KO↔EN pairing) ---------------- */

describe("structured R&D appliers: EN positional pairing", () => {
  const techEn = getPage("en", TECH_KEY);
  const patentsEn = getPage("en", PATENTS_KEY);
  const facilitiesEn = getPage("en", FACILITIES_KEY);

  const enIndex = (koId: string) => tech.sections.findIndex((s) => s.id === koId);

  for (const sectionId of TECH_SECTIONS) {
    it(`round-trips the default techFeatures payload (${sectionId}, EN)`, () => {
      const index = enIndex(sectionId);
      const baseEn = techEn.sections[index];
      const out = applyPageOverrides(techEn, { [TECH_DEF_KEY]: DEFAULT_VALUES[TECH_DEF_KEY].en! }, "en", {
        primaryPage: tech,
        techBlockConfigs: techBlockConfigs(),
      });
      expect(JSON.stringify(out.sections[index])).toBe(JSON.stringify(baseEn));
    });
  }

  it("keeps patent headings byte-identical (EN)", () => {
    const key = "rnd.patents#s202508114d9bc90ceb876/patentSections/patentSections";
    const index = patents.sections.findIndex((s) => s.id === PATENT_SECTION);
    const out = applyPageOverrides(patentsEn, { [key]: DEFAULT_VALUES[key].en! }, "en", {
      primaryPage: patents,
    });
    const headingsOf = (section: Section) =>
      sectionWidgets(section)
        .filter((w) => w.type === "text" && /text-table/.test(w.html ?? ""))
        .map((w) => w.html);
    expect(headingsOf(out.sections[index])).toEqual(headingsOf(patentsEn.sections[index]));
  });

  for (const widgetId of FACILITY_WIDGETS) {
    it(`round-trips the default facilitiesTable payload (${widgetId}, EN)`, () => {
      const key = `rnd.facilities#${FACILITIES_SECTION}/${widgetId}/facilitiesTable`;
      const index = facilities.sections.findIndex((s) => s.id === FACILITIES_SECTION);
      const paired = sectionWidgets(facilitiesEn.sections[index]).filter(
        (w) => !["padding", "hr", "code"].includes(w.type),
      );
      const koPaired = sectionWidgets(facilities.sections[index]).filter(
        (w) => !["padding", "hr", "code"].includes(w.type),
      );
      const widgetIndex = koPaired.findIndex((w) => w.id === widgetId);
      const enWidgetId = paired[widgetIndex].id;
      const enWidgetHtml = (page: PageContent) =>
        sectionWidgets(page.sections[index]).find((w) => w.id === enWidgetId)!.html;
      const out = applyPageOverrides(facilitiesEn, { [key]: DEFAULT_VALUES[key].en! }, "en", {
        primaryPage: facilities,
      });
      expect(enWidgetHtml(out)).toBe(enWidgetHtml(facilitiesEn));
    });
  }
});

/* ---------------- techFeatures ---------------- */

describe("techFeatures merge applier (rnd.technology §4/§5/§6)", () => {
  const applyTech = (value: string) =>
    applyPageOverrides(tech, { [TECH_DEF_KEY]: value }, "ko", {
      techBlockConfigs: techBlockConfigs(),
    });

  for (const sectionId of TECH_SECTIONS) {
    it(`round-trips the default payload byte-identically (${sectionId})`, () => {
      const out = applyTech(DEFAULT_VALUES[TECH_DEF_KEY].ko!);
      expect(JSON.stringify(sectionOf(out, sectionId))).toBe(
        JSON.stringify(sectionOf(tech, sectionId)),
      );
    });
  }

  it("applies block k to section k (each block hits its own section)", () => {
    const payload = defaultPayload(TECH_DEF_KEY) as TechPayloadV2;
    payload.blocks[0].items[0].heading = "MARK_S4";
    payload.blocks[1].items[0].heading = "MARK_S5";
    payload.blocks[2].items[0].heading = "MARK_S6";
    const out = applyTech(JSON.stringify(payload));
    const htmlOf = (sectionId: string) =>
      sectionWidgets(sectionOf(out, sectionId))
        .filter((w) => w.type === "text")
        .map((w) => w.html ?? "")
        .join("");
    expect(htmlOf(TECH_SECTIONS[0])).toContain("MARK_S4");
    expect(htmlOf(TECH_SECTIONS[0])).not.toContain("MARK_S5");
    expect(htmlOf(TECH_SECTIONS[1])).toContain("MARK_S5");
    expect(htmlOf(TECH_SECTIONS[2])).toContain("MARK_S6");
  });

  it("edits copy while preserving the authored table skeleton (§4)", () => {
    const payload = defaultPayload(TECH_DEF_KEY) as TechPayloadV2;
    payload.blocks[0].items[0].heading = "새 헤딩\n두 번째 줄";
    payload.blocks[0].items[0].rows[0].label = "새 라벨";
    payload.blocks[0].items[0].rows[0].body = "새 본문\n둘째 줄";

    const out = applyTech(JSON.stringify(payload));
    const section = sectionOf(out, TECH_SECTIONS[0]);
    const text = sectionWidgets(section).find((w) => w.type === "text")!;
    const html = text.html ?? "";
    expect(html).toContain("새 헤딩");
    expect(html).toContain("두 번째 줄");
    expect(html).toContain("새 라벨");
    expect(html).toContain("새 본문");
    expect(html).toContain("둘째 줄");
    // The authored table wrapper + rowspan skeleton stays.
    expect(html).toContain('rowspan="3"');
    expect(html).toContain('class="table-responsive"');
  });

  it("updates the rowspan when rows are added/removed (§4)", () => {
    const payload = defaultPayload(TECH_DEF_KEY) as TechPayloadV2;
    payload.blocks[0].items[0].rows = [
      { label: "A", body: "a" },
      { label: "B", body: "b" },
    ];
    const out = applyTech(JSON.stringify(payload));
    const html = sectionWidgets(sectionOf(out, TECH_SECTIONS[0])).find((w) => w.type === "text")!.html;
    expect(html).toContain('rowspan="2"');
    expect(html).not.toContain('rowspan="3"');

    payload.blocks[0].items[0].rows = [
      { label: "A", body: "a" },
      { label: "B", body: "b" },
      { label: "C", body: "c" },
      { label: "D", body: "d" },
    ];
    const out2 = applyTech(JSON.stringify(payload));
    const html2 = sectionWidgets(sectionOf(out2, TECH_SECTIONS[0])).find((w) => w.type === "text")!.html;
    expect(html2).toContain('rowspan="4"');
    expect((html2?.match(/<tr>/g) ?? []).length).toBe(4);
  });

  it("wraps a second §4 item into a 50/50 wrapper row", () => {
    const payload = defaultPayload(TECH_DEF_KEY) as TechPayloadV2;
    payload.blocks[0].items.push({
      image: "/images/tech-extra.jpg",
      heading: "EXTRA",
      rows: [{ label: "L", body: "B" }],
    });
    const out = applyTech(JSON.stringify(payload));
    const section = sectionOf(out, TECH_SECTIONS[0]);
    const wrappers = itemColsRows(section);
    expect(wrappers).toHaveLength(1);
    expect(wrappers[0].cols.map((col) => col.grid)).toEqual(["6", "6"]);
    // Two items, each an [image row, text row] pair.
    expect(wrappers[0].cols[1].children.filter((c) => c.kind === "row")).toHaveLength(2);
    expect(JSON.stringify(out)).toContain("EXTRA");
    // The new item's cloned widget ids are suffixed so they stay unique.
    expect(nodesOf(wrappers[0].cols[1]).every((w) => /__tech1$/.test(w.id))).toBe(true);
  });

  it("adds a 3rd §5 item (two per wrapper row, lone item full width)", () => {
    const payload = defaultPayload(TECH_DEF_KEY) as TechPayloadV2;
    payload.blocks[1].items.push({
      image: "/images/tech-extra.jpg",
      heading: "EXTRA",
      rows: [{ label: "L", body: "B" }],
    });
    const out = applyTech(JSON.stringify(payload));
    const wrappers = itemColsRows(sectionOf(out, TECH_SECTIONS[1]));
    expect(wrappers).toHaveLength(2);
    expect(wrappers.map((row) => row.cols.map((col) => col.grid))).toEqual([["6", "6"], ["12"]]);

    const again = applyTech(JSON.stringify(payload));
    // Re-applying the same payload is a fixed point (adds are not duplicated).
    expect(itemColsRows(sectionOf(again, TECH_SECTIONS[1]))).toHaveLength(2);
  });

  it("removes a §5 item and makes the remaining one full width", () => {
    const payload = defaultPayload(TECH_DEF_KEY) as TechPayloadV2;
    payload.blocks[1].items = payload.blocks[1].items.slice(0, 1);
    const out = applyTech(JSON.stringify(payload));
    const wrappers = itemColsRows(sectionOf(out, TECH_SECTIONS[1]));
    expect(wrappers).toHaveLength(1);
    expect(wrappers[0].cols.map((col) => col.grid)).toEqual(["12"]);
  });

  it("falls back to the anchor section when no block config is supplied", () => {
    // Only block 0 (§4) should change; §5/§6 stay authored.
    const out = applyPageOverrides(tech, { [TECH_DEF_KEY]: DEFAULT_VALUES[TECH_DEF_KEY].ko! }, "ko");
    expect(JSON.stringify(sectionOf(out, TECH_SECTIONS[0]))).toBe(
      JSON.stringify(sectionOf(tech, TECH_SECTIONS[0])),
    );
  });

  it("no-ops on malformed payloads", () => {
    const item = '{"image":"/a.jpg","heading":"h","rows":[{"label":"l","body":""}]}';
    for (const value of [
      "not json",
      "{}",
      '{"items":[]}',
      '{"blocks":[]}',
      `{"blocks":[{"items":[${item}]}]}`, // only one block
      `{"blocks":[{"items":[]},{"items":[${item}]},{"items":[${item}]}]}`, // empty block
      `{"blocks":[{"items":[{}]},{"items":[${item}]},{"items":[${item}]}]}`,
      `{"blocks":[{"items":[{"image":"","heading":"h","rows":[{"label":"l","body":""}]}]},{"items":[${item}]},{"items":[${item}]}]}`,
      `{"blocks":[{"items":[{"image":"/a.jpg","heading":"h","rows":[]}]},{"items":[${item}]},{"items":[${item}]}]}`,
    ]) {
      const out = applyTech(value);
      expect(JSON.stringify(out), value).toBe(JSON.stringify(tech));
    }
  });
});

/* ---------------- patentSections ---------------- */

describe("patentSections merge applier (rnd.patents §4)", () => {
  const key = "rnd.patents#s202508114d9bc90ceb876/patentSections/patentSections";

  it("round-trips the default payload (headings byte-identical)", () => {
    const out = applyPageOverrides(patents, { [key]: DEFAULT_VALUES[key].ko! }, "ko");
    const base = sectionOf(patents, PATENT_SECTION);
    const merged = sectionOf(out, PATENT_SECTION);
    // Row structure (heading/gallery/padding interleave) is untouched.
    expect(merged.rows.length).toBe(base.rows.length);

    const groups = merged.rows.filter(
      (node) => node.kind === "row" && nodesOf(node).some((w) => w.type === "text"),
    );
    const baseGroups = base.rows.filter(
      (node) => node.kind === "row" && nodesOf(node).some((w) => w.type === "text"),
    );
    expect(JSON.stringify(groups)).toBe(JSON.stringify(baseGroups));
  });

  it("drops the authored trailing empty gallery placeholder (render-equivalent)", () => {
    const out = applyPageOverrides(patents, { [key]: DEFAULT_VALUES[key].ko! }, "ko");
    const payload = defaultPayload(key) as {
      sections: Array<{ title: string; items: Array<{ image: string; caption: string }> }>;
    };
    const section = sectionOf(out, PATENT_SECTION);
    const galleries = sectionWidgets(section).filter((w) => w.type === "gallery2");
    expect(galleries).toHaveLength(3);
    galleries.forEach((gallery, i) => {
      expect(gallery.items).toEqual(
        payload.sections[i].items.map((item) => ({
          org: item.image,
          thumb: item.image,
          title: item.caption,
          desc: "",
        })),
      );
      // The authored tree carried one extra empty (org:null) placeholder that the
      // renderer filters out (`SectionRenderer` filters `org || thumb`), so the
      // 13 vs 14 item count renders identically.
      expect(gallery.items!.every((it) => it.org || it.thumb)).toBe(true);
    });
  });

  it("edits a heading and gallery caption", () => {
    const payload = defaultPayload(key) as {
      sections: Array<{ title: string; items: Array<{ image: string; caption: string }> }>;
    };
    payload.sections[0].title = "새 제목";
    payload.sections[0].items[0].caption = "새 캡션";
    const out = applyPageOverrides(patents, { [key]: JSON.stringify(payload) }, "ko");
    const section = sectionOf(out, PATENT_SECTION);
    const headings = sectionWidgets(section).filter(
      (w) => w.type === "text" && /text-table/.test(w.html ?? ""),
    );
    expect(headings[0].html).toContain("새 제목");
    const gallery = sectionWidgets(section).filter((w) => w.type === "gallery2")[0];
    expect(gallery.items![0].title).toBe("새 캡션");
  });

  it("adds a 4th section by cloning the first group", () => {
    const payload = defaultPayload(key) as {
      sections: Array<{ title: string; items: Array<{ image: string; caption: string }> }>;
    };
    payload.sections.push({
      title: "EXTRA_SECTION",
      items: [{ image: "/images/patent-extra.jpg", caption: "EXTRA_CAP" }],
    });
    const out = applyPageOverrides(patents, { [key]: JSON.stringify(payload) }, "ko");
    const section = sectionOf(out, PATENT_SECTION);
    const galleries = sectionWidgets(section).filter((w) => w.type === "gallery2");
    expect(galleries).toHaveLength(4);
    expect(JSON.stringify(out)).toContain("EXTRA_SECTION");
    expect(JSON.stringify(out)).toContain("EXTRA_CAP");
    // The clone's widget ids are suffixed so they stay unique.
    expect(galleries[3].id).toMatch(/__pat3$/);
    expect(galleries[3].items).toHaveLength(1);
  });

  it("removes trailing sections and their separators", () => {
    const payload = defaultPayload(key) as {
      sections: Array<{ title: string; items: Array<{ image: string; caption: string }> }>;
    };
    payload.sections = payload.sections.slice(0, 1);
    const out = applyPageOverrides(patents, { [key]: JSON.stringify(payload) }, "ko");
    const section = sectionOf(out, PATENT_SECTION);
    expect(sectionWidgets(section).filter((w) => w.type === "gallery2")).toHaveLength(1);
    // Leading padding + one group + trailing padding only.
    expect(section.rows).toHaveLength(4);
    const paddingRows = section.rows.filter(
      (node) => node.kind === "row" && nodesOf(node).every((w) => w.type === "padding"),
    );
    expect(paddingRows).toHaveLength(2);
  });

  it("no-ops on malformed payloads", () => {
    for (const value of [
      "not json",
      "{}",
      '{"sections":[]}',
      '{"sections":[{}]}',
      '{"sections":[{"title":"t","items":[]}]}',
      '{"sections":[{"title":"t","items":[{"image":"","caption":"c"}]}]}',
    ]) {
      const out = applyPageOverrides(patents, { [key]: value }, "ko");
      expect(JSON.stringify(out), value).toBe(JSON.stringify(patents));
    }
  });
});

/* ---------------- facilitiesTable ---------------- */

describe("facilitiesTable merge applier (rnd.facilities §5)", () => {
  const keyFor = (widgetId: string) =>
    `rnd.facilities#${FACILITIES_SECTION}/${widgetId}/facilitiesTable`;

  for (const widgetId of FACILITY_WIDGETS) {
    it(`round-trips the default payload byte-identically (${widgetId})`, () => {
      const key = keyFor(widgetId);
      const out = applyPageOverrides(facilities, { [key]: DEFAULT_VALUES[key].ko! }, "ko");
      expect(widgetOf(out, FACILITIES_SECTION, widgetId).html).toBe(
        widgetOf(facilities, FACILITIES_SECTION, widgetId).html,
      );
    });
  }

  it("rebuilds cells, preserving the blue header row", () => {
    const key = keyFor(FACILITY_WIDGETS[0]);
    const payload = defaultPayload(key) as {
      header: [string, string];
      rows: Array<[string, string]>;
    };
    payload.header = ["설비", "수량"];
    payload.rows = [["장비A", "9"]];
    const out = applyPageOverrides(facilities, { [key]: JSON.stringify(payload) }, "ko");
    const html = widgetOf(out, FACILITIES_SECTION, FACILITY_WIDGETS[0]).html ?? "";
    expect(html).toContain("설비");
    expect(html).toContain("수량");
    expect(html).toContain("장비A");
    expect(html).toContain("9");
    // Header cells keep the authored blue background.
    expect(html).toContain("background-color: rgb(52, 101, 222)");
    expect((html.match(/<tr>/g) ?? []).length).toBe(2);
  });

  it("adds rows by cloning the last authored data row", () => {
    const key = keyFor(FACILITY_WIDGETS[0]);
    const payload = defaultPayload(key) as {
      header: [string, string];
      rows: Array<[string, string]>;
    };
    payload.rows = [...payload.rows, ["EXTRA_ROW", "42"], ["EXTRA_ROW_2", "43"]];
    const out = applyPageOverrides(facilities, { [key]: JSON.stringify(payload) }, "ko");
    const html = widgetOf(out, FACILITIES_SECTION, FACILITY_WIDGETS[0]).html ?? "";
    expect((html.match(/<tr>/g) ?? []).length).toBe(payload.rows.length + 1);
    expect(html).toContain("EXTRA_ROW");
    expect(html).toContain("EXTRA_ROW_2");
    // Cloned data cells keep the authored striped background.
    expect(html).toContain("background-color: rgb(249, 249, 249)");
  });

  it("removes rows down to the header", () => {
    const key = keyFor(FACILITY_WIDGETS[0]);
    const payload = defaultPayload(key) as {
      header: [string, string];
      rows: Array<[string, string]>;
    };
    payload.rows = [["ONLY", "1"]];
    const out = applyPageOverrides(facilities, { [key]: JSON.stringify(payload) }, "ko");
    const html = widgetOf(out, FACILITIES_SECTION, FACILITY_WIDGETS[0]).html ?? "";
    expect((html.match(/<tr>/g) ?? []).length).toBe(2);
    expect(html).toContain("ONLY");
  });

  it("no-ops on malformed payloads", () => {
    const key = keyFor(FACILITY_WIDGETS[0]);
    for (const value of [
      "not json",
      "{}",
      '{"header":["a"]}',
      '{"header":["a","b"],"rows":[]}',
      '{"header":["a","b"],"rows":[["x"]]}',
      '{"header":["a"],"rows":[["x","y"]]}',
    ]) {
      const out = applyPageOverrides(facilities, { [key]: value }, "ko");
      expect(widgetOf(out, FACILITIES_SECTION, FACILITY_WIDGETS[0]).html, value).toBe(
        widgetOf(facilities, FACILITIES_SECTION, FACILITY_WIDGETS[0]).html,
      );
    }
  });
});
