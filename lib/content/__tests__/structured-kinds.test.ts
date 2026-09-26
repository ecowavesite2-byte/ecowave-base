import { describe, expect, it } from "vitest";
import type { ColNode, Node, PageContent, RowNode, Section, WidgetNode } from "../../types";
import { CONTENT_DEFS, DEFAULT_VALUES } from "../registry";
import { applyPageOverrides } from "../merge";
import { collectWidgets, sectionWidgets } from "../pair";
import { getPage } from "../read";
// The generator's structured parsers are plain .mjs; import them directly (the
// module's `main()` is guarded so importing has no side effects).
import {
  findBranchRow,
  parseBranchCol,
  parseEraLabel,
  parseEraSection,
  parseEraYears,
  parseHqSection,
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
const globalEn = getPage("en", GLOBAL_KEY);

const locationsBaselineEn = DEFAULT_VALUES[locationsDef.key].en;
if (!locationsBaselineEn) throw new Error("EN locations default missing");

const HQ_SECTION_ID = "s20250828182272ec01906";
const BRANCHES_SECTION_ID = "s202508286e01c87027ecf";

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

  it("parses the HQ section (item 0) with name/contacts/map fields", () => {
    const hq = parseHqSection(global.sections, BRANCHES_SECTION_ID);
    expect(hq).not.toBeNull();
    expect(hq!.nameWidget).not.toBeNull();
    expect(hq!.contactsWidget).not.toBeNull();
    expect(hq!.mapWidget).not.toBeNull();

    expect(hq!.location.badge).toBe("에코웨이브 본사");
    // Authored HQ name has 2 runs (chip + address): city stays empty.
    expect(hq!.location.city).toBe("");
    expect(hq!.location.address).toContain("인천광역시 남동구");
    expect(hq!.location.phone).toBe("+82-32-812-1800");
    expect(hq!.location.fax).toBe("+82-32-812-1804");
    expect(hq!.location.email).toBe("abc@naver.com");
    expect(hq!.location.mapSrc).toContain("google.com/maps");
  });

  it("parses the 2 branch columns (items 1+) with all 7 fields", () => {
    const branches = global.sections.find((section) => section.id === BRANCHES_SECTION_ID);
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
      // Contact fields only exist on the HQ item.
      expect(location.phone).toBe("");
      expect(location.fax).toBe("");
      expect(location.email).toBe("");
    }
  });

  it("builds the default payload as [HQ, China, Cambodia] in both locales", () => {
    for (const [locale, baseline] of [
      ["ko", locationsBaseline],
      ["en", locationsBaselineEn],
    ] as const) {
      const items = JSON.parse(baseline) as Array<Record<string, string>>;
      expect(items, locale).toHaveLength(3);
      expect(items[0].phone.length, `${locale} HQ phone`).toBeGreaterThan(0);
      expect(items[0].fax.length, `${locale} HQ fax`).toBeGreaterThan(0);
      expect(items[0].email.length, `${locale} HQ email`).toBeGreaterThan(0);
      expect(items[1].badge.length, `${locale} branch 1`).toBeGreaterThan(0);
      expect(items[2].badge.length, `${locale} branch 2`).toBeGreaterThan(0);
      expect(items[1].phone, `${locale} branch phone`).toBe("");
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

describe("locations merge applier (page-level: HQ + branches)", () => {
  const hqSectionOf = (page: PageContent) =>
    page.sections.find((section) => section.id === HQ_SECTION_ID)!;
  const branchSectionOf = (page: PageContent) =>
    page.sections.find((section) => section.id === BRANCHES_SECTION_ID)!;

  const widgetsOf = (nodes: Node[]): WidgetNode[] => {
    const out: WidgetNode[] = [];
    collectWidgets(nodes, out);
    return out;
  };
  /** Branch container rows: a row whose subtree holds an iframe text widget. */
  const containerRowsOf = (page: PageContent): RowNode[] =>
    branchSectionOf(page).rows
      .filter((node): node is RowNode => node.kind === "row")
      .filter((row) =>
        row.cols.some((col) =>
          widgetsOf(col.children).some(
            (w) => w.type === "text" && typeof w.html === "string" && /<iframe\b/i.test(w.html),
          ),
        ),
      );
  const branchColsOf = (page: PageContent): ColNode[] =>
    containerRowsOf(page).flatMap((row) => row.cols);
  /** `[["6","6"],["12"]]` — the grid of every container row's cols, in order. */
  const layoutOf = (page: PageContent): string[][] =>
    containerRowsOf(page).map((row) => row.cols.map((col) => col.grid));
  /** The branch card's name text widget (no iframe) at a flattened col index. */
  const branchNameOf = (page: PageContent, colIndex: number): WidgetNode => {
    const col = branchColsOf(page)[colIndex];
    if (!col) throw new Error(`branch col missing at index ${colIndex}`);
    const name = widgetsOf(col.children).find(
      (w) => w.type === "text" && typeof w.html === "string" && !/<iframe\b/i.test(w.html),
    );
    if (!name) throw new Error(`branch name widget missing at col ${colIndex}`);
    return name;
  };
  const parsedDefault = (): Array<Record<string, string>> =>
    JSON.parse(locationsBaseline) as Array<Record<string, string>>;
  /** HQ + `branchCount` branches (extra branches carry unique `__LOC_EXTRA_i__`). */
  const payloadWithBranches = (branchCount: number): string => {
    const base = parsedDefault().slice(0, 1 + branchCount);
    const extra = Array.from({ length: Math.max(0, branchCount - 2) }, (_, i) => ({
      badge: `__LOC_EXTRA_${i}__`,
      city: `__LOC_EXTRA_${i}__`,
      address: `__LOC_EXTRA_${i}__`,
      phone: "",
      fax: "",
      email: "",
      mapSrc: "",
    }));
    return JSON.stringify([...base, ...extra]);
  };

  it("is a byte-parity no-op when the default payload is re-applied (KO)", () => {
    const out = applyPageOverrides(global, { [locationsDef.key]: locationsBaseline }, "ko");
    // HQ name/contacts/map and the whole branches section are unchanged.
    expect(JSON.stringify(hqSectionOf(out))).toBe(JSON.stringify(hqSectionOf(global)));
    expect(JSON.stringify(branchSectionOf(out))).toBe(JSON.stringify(branchSectionOf(global)));
  });

  it("is a byte-parity no-op when the default payload is re-applied (EN)", () => {
    const out = applyPageOverrides(globalEn, { [locationsDef.key]: locationsBaselineEn }, "en", {
      primaryPage: global,
    });
    expect(JSON.stringify(out)).toBe(JSON.stringify(globalEn));
  });

  it("lays out 0-4 branches at max 2 per row (lone item full width)", () => {
    const cases: Array<{ n: number; layout: string[][]; rowCount: number }> = [
      { n: 0, layout: [], rowCount: 0 },
      { n: 1, layout: [["12"]], rowCount: 1 },
      { n: 2, layout: [["6", "6"]], rowCount: 1 },
      { n: 3, layout: [["6", "6"], ["12"]], rowCount: 2 },
      { n: 4, layout: [["6", "6"], ["6", "6"]], rowCount: 2 },
    ];
    for (const c of cases) {
      const out = applyPageOverrides(global, { [locationsDef.key]: payloadWithBranches(c.n) }, "ko");
      expect(layoutOf(out), `branches=${c.n}`).toEqual(c.layout);
      expect(containerRowsOf(out), `branches=${c.n}`).toHaveLength(c.rowCount);
      // Clone rows keep the authored container row's h/pad (min-height alignment).
      for (const row of containerRowsOf(out)) {
        expect(row.h, `branches=${c.n} row h`).toBe(658);
        expect(row.pad, `branches=${c.n} row pad`).toBe(15);
      }
    }
  });

  it("keeps the branch item order across the row groups", () => {
    const base = parsedDefault();
    const marker = "__LOC_EXTRA_ORDER__";
    const extra = { badge: marker, city: marker, address: marker, phone: "", fax: "", email: "", mapSrc: "" };
    const out = applyPageOverrides(
      global,
      { [locationsDef.key]: JSON.stringify([...base, extra]) },
      "ko",
    );

    expect(layoutOf(out)).toEqual([["6", "6"], ["12"]]);
    expect(branchNameOf(out, 0).html).toContain(base[1].badge);
    expect(branchNameOf(out, 1).html).toContain(base[2].badge);
    expect(branchNameOf(out, 2).html).toContain(marker);
    // The new card's cloned widget ids are suffixed so they stay unique.
    expect(widgetsOf(branchColsOf(out)[2].children).every((w) => /__loc2$/.test(w.id))).toBe(true);
  });

  it("add→remove cycles restore the authored layout", () => {
    const added = applyPageOverrides(global, { [locationsDef.key]: payloadWithBranches(4) }, "ko");
    expect(layoutOf(added)).toEqual([["6", "6"], ["6", "6"]]);

    const removed = applyPageOverrides(added, { [locationsDef.key]: locationsBaseline }, "ko");
    expect(layoutOf(removed)).toEqual([["6", "6"]]);
    expect(JSON.stringify(branchSectionOf(removed))).toBe(JSON.stringify(branchSectionOf(global)));

    // 0 branches removes every container row but keeps the pad rows.
    const emptied = applyPageOverrides(
      added,
      { [locationsDef.key]: JSON.stringify([parsedDefault()[0]]) },
      "ko",
    );
    expect(containerRowsOf(emptied)).toHaveLength(0);
    expect(branchSectionOf(emptied).rows).toHaveLength(2);
  });

  it("removes a branch and makes the single remaining card full width", () => {
    const parsed = JSON.parse(locationsBaseline) as unknown[];
    const out = applyPageOverrides(
      global,
      { [locationsDef.key]: JSON.stringify([parsed[0], parsed[1]]) },
      "ko",
    );
    expect(layoutOf(out)).toEqual([["12"]]);
  });

  it("appends an idempotent contact block when phone/fax/email are set, and clears it", () => {
    const parsed = JSON.parse(locationsBaseline) as Array<Record<string, string>>;
    const withContacts = parsed.map((item, index) =>
      index === 1 ? { ...item, phone: "+1-555", fax: "FAX-9", email: "a@b.c" } : item,
    );

    const out = applyPageOverrides(
      global,
      { [locationsDef.key]: JSON.stringify(withContacts) },
      "ko",
    );
    const name = branchNameOf(out, 0);
    expect(name.html).toContain("<!--loc-contacts-->");
    expect(name.html).toContain("<p style=\"line-height:2\"><span style=\"font-size:18px\">TEL +1-555</span></p>");
    expect(name.html).toContain("FAX FAX-9");
    expect(name.html).toContain("EMAIL a@b.c");
    expect(name.html).toContain("<!--/loc-contacts-->");

    // Re-applying the same payload keeps exactly one contact block.
    const again = applyPageOverrides(out, { [locationsDef.key]: JSON.stringify(withContacts) }, "ko");
    const againName = branchNameOf(again, 0);
    expect((againName.html?.match(/<!--loc-contacts-->/g) ?? []).length).toBe(1);
    expect(againName.html).toContain("TEL +1-555");

    // Clearing every contact field removes the block entirely.
    const cleared = withContacts.map((item, index) =>
      index === 1 ? { ...item, phone: "", fax: "", email: "" } : item,
    );
    const out2 = applyPageOverrides(
      global,
      { [locationsDef.key]: JSON.stringify(cleared) },
      "ko",
    );
    expect(branchNameOf(out2, 0).html).not.toContain("loc-contacts");
    // ... and the rest of the card is back to the authored bytes.
    expect(branchNameOf(out2, 0).html).toBe(branchNameOf(global, 0).html);
  });

  it("keeps the contact block on a cloned (3rd) branch card", () => {
    const base = parsedDefault();
    const marker = "__LOC_CLONE_CONTACT__";
    const extra = { badge: marker, city: marker, address: marker, phone: "TEL-C", fax: "", email: "", mapSrc: "" };
    const out = applyPageOverrides(
      global,
      { [locationsDef.key]: JSON.stringify([...base, extra]) },
      "ko",
    );
    expect(layoutOf(out)).toEqual([["6", "6"], ["12"]]);
    const cloned = branchNameOf(out, 2);
    expect(cloned.html).toContain("<!--loc-contacts-->");
    expect(cloned.html).toContain("TEL TEL-C");
  });

  it("updates the HQ contacts without touching the branch cards", () => {
    const parsed = JSON.parse(locationsBaseline) as Array<Record<string, string>>;
    const changed = parsed.map((item, index) =>
      index === 0 ? { ...item, phone: "TEL-NEW", email: "new@ecowave.com" } : item,
    );
    const out = applyPageOverrides(global, { [locationsDef.key]: JSON.stringify(changed) }, "ko");
    const hq = hqSectionOf(out);
    const contacts = sectionWidgets(hq).find((w) => /<table\b/i.test(w.html ?? ""));
    expect(contacts?.html).toContain("TEL-NEW");
    expect(contacts?.html).toContain("new@ecowave.com");
    expect(JSON.stringify(branchSectionOf(out))).toBe(JSON.stringify(branchSectionOf(global)));
  });

  it("no-ops on malformed payloads", () => {
    for (const value of [
      "not json",
      "[]",
      "{}",
      "[{}]",
      '[{"badge":"a","city":"b","address":"c"}]',
      '[{"badge":1,"city":"b","address":"c","mapSrc":""}]',
      '[{"badge":"a","city":"b","address":"c","phone":1,"mapSrc":""}]',
    ]) {
      const out = applyPageOverrides(global, { [locationsDef.key]: value }, "ko");
      expect(JSON.stringify(out), value).toBe(JSON.stringify(global));
    }
  });
});
