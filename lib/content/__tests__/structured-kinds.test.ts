import { describe, expect, it } from "vitest";
import type { PageContent, RowNode, Section } from "../../types";
import { CONTENT_DEFS, DEFAULT_VALUES } from "../registry";
import { applyPageOverrides } from "../merge";
import { sectionWidgets } from "../pair";
import { getPage } from "../read";
// The generator's structured parsers are plain .mjs; import them directly (the
// module's `main()` is guarded so importing has no side effects).
import {
  findBranchRow,
  parseBranchCol,
  parseEraLabel,
  parseEraSection,
  parseEraYears,
} from "../../../scripts/gen-content-registry.mjs";

/**
 * WS2 — structured `eras` (company.history) and `locations` (company.global).
 * Covers the generator parsers, the merge appliers and the round-trip/parity
 * guarantees (unchanged content must render byte-identically).
 */

const HISTORY_KEY = "company.history";
const GLOBAL_KEY = "company.global";

const erasDef = CONTENT_DEFS.find((def) => def.kind === "eras");
const locationsDef = CONTENT_DEFS.find((def) => def.kind === "locations");
if (!erasDef || !locationsDef) throw new Error("structured defs missing from the registry");

const erasBaseline = DEFAULT_VALUES[erasDef.key].ko;
const locationsBaseline = DEFAULT_VALUES[locationsDef.key].ko;
if (!erasBaseline || !locationsBaseline) throw new Error("structured defaults missing");

/** A company.history era section (`side_left` with a non-empty aside). */
function isEraStructural(section: Section): boolean {
  return (
    /\bside_left\b/.test(section.cls || "") &&
    Array.isArray(section.aside?.items) &&
    section.aside.items.length > 0
  );
}

/** Widget content of every era section (id/type/html/src), ignoring section cls. */
function eraWidgetSignatures(page: PageContent) {
  return page.sections.filter(isEraStructural).map((section) =>
    sectionWidgets(section).map((w) => ({ id: w.id, type: w.type, html: w.html, src: w.src })),
  );
}

const history = getPage("ko", HISTORY_KEY);
const global = getPage("ko", GLOBAL_KEY);

describe("generator parsing (real KO content)", () => {
  it("parses the 3 history eras with exact label runs", () => {
    const eraSections = history.sections.filter(isEraStructural);
    expect(eraSections).toHaveLength(3);

    const first = parseEraSection(eraSections[0]);
    expect(first.labelWidget).not.toBeNull();
    expect(first.yearsWidget).not.toBeNull();
    expect(first.imageWidget).not.toBeNull();

    const label = parseEraLabel(first.labelWidget!.html);
    expect(label.range).toBe("2020 - 2023");
    // `fr-marker` spans fragment the design lines — runs are kept exact.
    expect(label.tagline).toBe("에코웨이브의\n지속적\n인 혁\n신\n과\n성장");

    for (const section of eraSections) {
      const parsed = parseEraSection(section);
      const years = parseEraYears(parsed.yearsWidget!.html);
      expect(years).toHaveLength(5);
      expect(years.every((year) => year.items.length > 0)).toBe(true);
    }
  });

  it("parses the 2 branch columns with all 4 fields", () => {
    const branches = global.sections.find((section) => section.id === "s202508286e01c87027ecf");
    expect(branches).toBeDefined();
    const row = findBranchRow(branches!);
    expect(row).not.toBeNull();
    expect(row!.cols).toHaveLength(2);

    for (const col of row!.cols) {
      const { location } = parseBranchCol(col);
      expect(location.badge.length).toBeGreaterThan(0);
      expect(location.city.length).toBeGreaterThan(0);
      expect(location.address.length).toBeGreaterThan(0);
      expect(location.mapSrc).toContain("google.com/maps");
    }
  });
});

describe("eras merge applier", () => {
  it("is a byte-parity no-op when the default payload is re-applied", () => {
    const out = applyPageOverrides(history, { [erasDef.key]: erasBaseline }, "ko");
    expect(eraWidgetSignatures(out)).toEqual(eraWidgetSignatures(history));
  });

  it("adds a 4th era with its own text and suffixed ids", () => {
    const marker = "__ERA_ADD__";
    const parsed = JSON.parse(erasBaseline) as unknown[];
    const payload = JSON.stringify([
      ...parsed,
      {
        range: "2005 - 2009",
        tagline: marker,
        image: `/${marker}.jpg`,
        years: [{ year: "2005", items: [marker] }],
      },
    ]);

    const out = applyPageOverrides(history, { [erasDef.key]: payload }, "ko");
    const eras = out.sections.filter(isEraStructural);
    expect(eras).toHaveLength(4);

    const added = eras[3];
    expect(added.id).toMatch(/__era3$/);
    expect(JSON.stringify(added)).toContain(marker);
    // Every widget id inside the clone is suffixed so it stays unique.
    expect(sectionWidgets(added).every((w) => /__era3$/.test(w.id))).toBe(true);

    // A cloned spacer separates the new era from the following section.
    expect(out.sections.some((section) => /__era_gap3$/.test(section.id))).toBe(true);
  });

  it("removes trailing eras and their dangling spacers", () => {
    const parsed = JSON.parse(erasBaseline) as unknown[];
    const out = applyPageOverrides(history, { [erasDef.key]: JSON.stringify([parsed[0]]) }, "ko");

    const eras = out.sections.filter(isEraStructural);
    expect(eras).toHaveLength(1);
    // The second/third era sections are gone entirely.
    expect(out.sections.some((section) => section.id === "s20250828fe85691f33b65")).toBe(false);
    expect(out.sections.some((section) => section.id === "s2025082848202431448dd")).toBe(false);
  });

  it("round-trips: added era then the baseline restores the authored content", () => {
    const parsed = JSON.parse(erasBaseline) as unknown[];
    const added = applyPageOverrides(
      history,
      {
        [erasDef.key]: JSON.stringify([
          ...parsed,
          { range: "2005", tagline: "x", image: "/x.jpg", years: [{ year: "2005", items: ["x"] }] },
        ]),
      },
      "ko",
    );
    expect(added.sections.filter(isEraStructural)).toHaveLength(4);

    const restored = applyPageOverrides(added, { [erasDef.key]: erasBaseline }, "ko");
    expect(restored.sections.filter(isEraStructural)).toHaveLength(3);
    expect(eraWidgetSignatures(restored)).toEqual(eraWidgetSignatures(history));
  });

  it("no-ops on malformed payloads", () => {
    for (const value of [
      "not json",
      "[]",
      "{}",
      "[{}]",
      '[{"range":1}]',
      '[{"range":"r","tagline":"t","image":"i"}]',
      '[{"range":"r","tagline":"t","image":"i","years":[{"year":"y"}]}]',
      '[{"range":"r","tagline":"t","image":"i","years":[{"year":"y","items":[1]}]}]',
    ]) {
      const out = applyPageOverrides(history, { [erasDef.key]: value }, "ko");
      expect(JSON.stringify(out), value).toBe(JSON.stringify(history));
    }
  });
});

describe("locations merge applier", () => {
  const branchSectionOf = (page: PageContent) =>
    page.sections.find((section) => section.id === "s202508286e01c87027ecf")!;
  // Authored row order is [padding row, branches row, padding row]; the applier
  // never splices rows, so index 1 stays the branches row at any column count
  // (findBranchRow only matches >= 2 iframe columns, so it cannot see a 1-col
  // state).
  const branchRowOf = (page: PageContent) => branchSectionOf(page).rows[1] as RowNode;

  it("is a byte-parity no-op when the default payload is re-applied", () => {
    const out = applyPageOverrides(global, { [locationsDef.key]: locationsBaseline }, "ko");
    expect(JSON.stringify(branchSectionOf(out))).toBe(JSON.stringify(branchSectionOf(global)));
  });

  it("adds a branch column, suffixes its ids and re-grids to 4", () => {
    const marker = "__LOC_ADD__";
    const parsed = JSON.parse(locationsBaseline) as unknown[];
    const payload = JSON.stringify([
      ...parsed,
      { badge: marker, city: marker, address: marker, mapSrc: `https://example.com/${marker}` },
    ]);

    const out = applyPageOverrides(global, { [locationsDef.key]: payload }, "ko");
    const row = findBranchRow(branchSectionOf(out));
    expect(row).not.toBeNull();
    expect(row!.cols).toHaveLength(3);
    expect(row!.cols.every((col) => col.grid === "4")).toBe(true);
    expect(JSON.stringify(row!.cols[2])).toContain(marker);
  });

  it("removes extra columns and re-grids a single location to full width", () => {
    const parsed = JSON.parse(locationsBaseline) as unknown[];
    const out = applyPageOverrides(global, { [locationsDef.key]: JSON.stringify([parsed[0]]) }, "ko");
    const row = branchRowOf(out);
    expect(row.cols).toHaveLength(1);
    expect(row.cols[0].grid).toBe("12");
  });

  it("keeps the authored 2-column grid unchanged when the count is unchanged", () => {
    const out = applyPageOverrides(global, { [locationsDef.key]: locationsBaseline }, "ko");
    const row = branchRowOf(out);
    expect(row.cols).toHaveLength(2);
    expect(row.cols.every((col) => col.grid === "6")).toBe(true);
  });

  it("no-ops on malformed payloads", () => {
    for (const value of [
      "not json",
      "[]",
      "{}",
      "[{}]",
      '[{"badge":"a","city":"b","address":"c"}]',
      '[{"badge":1,"city":"b","address":"c","mapSrc":""}]',
    ]) {
      const out = applyPageOverrides(global, { [locationsDef.key]: value }, "ko");
      expect(JSON.stringify(out), value).toBe(JSON.stringify(global));
    }
  });
});
