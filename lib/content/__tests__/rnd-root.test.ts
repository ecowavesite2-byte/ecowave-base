import { describe, expect, it } from "vitest";
import { CONTENT_DEFS, DEFAULT_VALUES } from "../registry";
import { getPage } from "../read";
import { PAGE_ALIASES, resolvePageAlias } from "../paths";
import { channelOf } from "../shared-intro";
import { PAGE_KEY_TO_ROUTE } from "../../routes";
import type { Locale } from "../../i18n";

/**
 * R&D channel root alias + structured R&D registry.
 *
 * `/rnd` (crawled pageKey `rnd`) is a byte-identical duplicate of the
 * `/rnd/technology` page, so it is an alias that serves `rnd.technology`'s
 * content with no redirect; the root JSON stays a crawl artifact and emits no
 * registry defs. The R&D galleries are structured `gallery` defs and
 * rnd.facilities carries one section-less `facilityTabs` def.
 */

const LOCALES: Locale[] = ["ko", "en"];

const ALIAS_KEY = "rnd";
const CANONICAL_KEY = "rnd.technology";

/** The real rnd subpages (`rnd` excluded), in nav/route order. */
const RND_NAV_ORDER = Object.keys(PAGE_KEY_TO_ROUTE).filter(
  (key) => channelOf(key) === "rnd" && !PAGE_ALIASES[key],
);

function defsFor(pageKey: string) {
  return CONTENT_DEFS.filter((def) => def.pageKey === pageKey);
}

describe("rnd root alias", () => {
  it("is declared as rnd → rnd.technology", () => {
    expect(PAGE_ALIASES[ALIAS_KEY]).toBe(CANONICAL_KEY);
    expect(resolvePageAlias(ALIAS_KEY)).toBe(CANONICAL_KEY);
  });

  it("resolves every non-alias key to itself", () => {
    for (const key of ["home", "company.ceo", "rnd.technology", "rnd.patents", "news"]) {
      expect(resolvePageAlias(key), key).toBe(key);
    }
  });

  it("serves /rnd from the rnd.technology tree in both locales", () => {
    for (const locale of LOCALES) {
      expect(getPage(locale, ALIAS_KEY), locale).toEqual(getPage(locale, CANONICAL_KEY));
    }
  });

  it("emits no registry def for the aliased root pageKey", () => {
    expect(defsFor(ALIAS_KEY)).toEqual([]);
  });

  it("emits rnd pages in nav/route order", () => {
    const emitted = [
      ...new Set(
        CONTENT_DEFS.filter((def) => channelOf(def.pageKey) === "rnd").map(
          (def) => def.pageKey,
        ),
      ),
    ];
    expect(emitted).toEqual(RND_NAV_ORDER);
    expect(emitted).toEqual(["rnd.technology", "rnd.patents", "rnd.facilities"]);
  });

  it("revalidates the /rnd alias for every rnd.technology def", () => {
    const canonicalDefs = defsFor(CANONICAL_KEY);
    expect(canonicalDefs.length).toBeGreaterThan(0);
    for (const def of canonicalDefs) {
      expect(def.revalidate, def.key).toContain("/rnd");
      expect(def.revalidate, def.key).toContain("/en/rnd");
    }
  });
});

describe("structured R&D defs", () => {
  it("has the expected per-page def counts", () => {
    expect(defsFor(ALIAS_KEY)).toHaveLength(0);
    expect(defsFor(CANONICAL_KEY)).toHaveLength(5);
    expect(defsFor("rnd.patents")).toHaveLength(1);
    expect(defsFor("rnd.facilities")).toHaveLength(12);
  });

  it("marks the rnd.technology sub-hero banner as the shared R&D intro def", () => {
    const def = defsFor(CANONICAL_KEY).find(
      (candidate) =>
        candidate.key ===
        "rnd.technology#s20250909caaa8544e0e70/w20250909b16e1f0580760/html",
    );
    expect(def).toBeDefined();
    expect(def!.shared).toBe(true);
    expect(def!.section).toEqual({
      ko: "연구개발 소개 인트로 (모든 R&D 서브페이지 공통)",
      en: "R&D intro (shared by all R&D subpages)",
    });
    // Editing the one def re-renders every R&D route (both locales).
    for (const route of ["/rnd/technology", "/rnd", "/rnd/patents", "/rnd/facilities"]) {
      expect(def!.revalidate, route).toContain(route);
      expect(def!.revalidate, `/en${route}`).toContain(`/en${route}`);
    }
    // The per-page copies are dead: the patents/facilities banner defs disappear
    // (their sections are excluded by the generator's shared-band rule).
    expect(
      defsFor("rnd.patents").some((d) => d.sectionId === "s2025082027290aa48803c"),
    ).toBe(false);
    expect(
      defsFor("rnd.facilities").some((d) => d.sectionId === "s202508207ea6e772a48a0"),
    ).toBe(false);
  });

  it("exposes the rnd.technology USP gallery with its label and cap", () => {
    const galleries = defsFor(CANONICAL_KEY).filter((def) => def.kind === "gallery");
    expect(galleries).toHaveLength(1);
    const def = galleries[0];
    expect(def.key).toBe(
      "rnd.technology#s2025090979d4f02da9a4c/w20250909f44806a14d131/gallery",
    );
    expect(def.widgetId).toBe("w20250909f44806a14d131");
    expect(def.gallery).toEqual({ fields: ["image"], maxItems: 5 });
    expect(def.label).toEqual({ ko: "핵심 USP", en: "Core USP" });
    const items = JSON.parse(DEFAULT_VALUES[def.key].ko!) as Array<{ image: string }>;
    expect(items).toHaveLength(5);
    expect(items.every((item) => item.image.length > 0)).toBe(true);
  });

  it("exposes ONE rnd.technology techFeatures def with three fixed blocks", () => {
    const features = defsFor(CANONICAL_KEY).filter((def) => def.kind === "techFeatures");
    expect(features).toHaveLength(1);
    const def = features[0];
    expect(def.key).toBe("rnd.technology#s202509091799d895b62ea/techFeatures/techFeatures");
    expect(def.sectionId).toBe("s202509091799d895b62ea");
    expect(def.label).toEqual({ ko: "기술 블록", en: "Technology block" });
    // The def config carries the fixed block→section mapping (block 0 → §4,
    // block 1 → §5, block 2 → §6) so the applier never hardcodes crawl ids.
    expect(def.techBlocks).toEqual({
      sections: [
        "s202509091799d895b62ea",
        "s2025090972e449f7846e1",
        "s20250909b12fa8000068e",
      ],
    });

    const payload = JSON.parse(DEFAULT_VALUES[def.key].ko!) as {
      blocks: Array<{ items: Array<{ image: string; heading: string; rows: unknown[] }> }>;
    };
    expect(payload.blocks).toHaveLength(3);
    // §4 → 1 item, §5 → 2, §6 → 2.
    expect(payload.blocks.map((block) => block.items.length)).toEqual([1, 2, 2]);
    for (const block of payload.blocks) {
      expect(block.items.every((item) => item.image.length > 0)).toBe(true);
      expect(block.items.every((item) => item.heading.length > 0)).toBe(true);
    }
    // EN mirrors the KO block/item/row shape positionally.
    const en = JSON.parse(DEFAULT_VALUES[def.key].en!) as typeof payload;
    expect(en.blocks).toHaveLength(3);
    expect(en.blocks.map((block) => block.items.length)).toEqual(
      payload.blocks.map((block) => block.items.length),
    );
    expect(en.blocks.map((block) => block.items.map((item) => item.rows.length))).toEqual(
      payload.blocks.map((block) => block.items.map((item) => item.rows.length)),
    );
  });

  it("exposes the rnd.patents patentSections def (headings + galleries folded)", () => {
    const def = defsFor("rnd.patents").find((candidate) => candidate.kind === "patentSections");
    expect(def).toBeDefined();
    expect(def!.key).toBe("rnd.patents#s202508114d9bc90ceb876/patentSections/patentSections");
    expect(def!.sectionId).toBe("s202508114d9bc90ceb876");
    expect(def!.label).toEqual({ ko: "인증 섹션 목록", en: "Certification sections" });

    const payload = JSON.parse(DEFAULT_VALUES[def!.key].ko!) as {
      sections: Array<{ title: string; items: Array<{ image: string; caption: string }> }>;
    };
    expect(payload.sections).toHaveLength(3);
    expect(payload.sections.map((section) => section.title)).toEqual([
      "인증 현황",
      "기업 인증 및 특허 현황",
      "국제 인증 및 위촉 현황",
    ]);
    // The 14-item first gallery drops its authored empty trailing slot.
    expect(payload.sections[0].items).toHaveLength(13);
    expect(payload.sections[1].items).toHaveLength(4);
    expect(payload.sections[2].items).toHaveLength(4);
    expect(
      payload.sections.every((section) =>
        section.items.every((item) => item.image.length > 0 && item.caption === "인증서"),
      ),
    ).toBe(true);
    // The per-heading lines and per-gallery defs are superseded.
    expect(defsFor("rnd.patents").some((candidate) => candidate.kind === "gallery")).toBe(false);
  });

  it("exposes the four rnd.facilities facilitiesTable defs", () => {
    const tables = defsFor("rnd.facilities").filter((def) => def.kind === "facilitiesTable");
    expect(tables).toHaveLength(4);
    const expected = [
      { widgetId: "w20250829bb21466f4e0f1", rows: 6 },
      { widgetId: "w20250829370d74ba50fab", rows: 8 },
      { widgetId: "w202508298781405b23d22", rows: 4 },
      { widgetId: "w202508293b8acaf6df97a", rows: 3 },
    ] as const;
    for (const want of expected) {
      const def = tables.find((candidate) => candidate.widgetId === want.widgetId);
      expect(def, want.widgetId).toBeDefined();
      expect(def!.key).toBe(
        `rnd.facilities#s20250829c25afe324e195/${want.widgetId}/facilitiesTable`,
      );
      expect(def!.label).toEqual({ ko: "설비 표", en: "Equipment table" });
      const payload = JSON.parse(DEFAULT_VALUES[def!.key].ko!) as {
        header: string[];
        rows: string[][];
      };
      expect(payload.header, want.widgetId).toHaveLength(2);
      expect(payload.rows, want.widgetId).toHaveLength(want.rows);
      expect(payload.rows.every((row) => row.length === 2)).toBe(true);
    }
  });

  it("emits exactly one section-less facilityTabs def on rnd.facilities", () => {
    const tabsDefs = CONTENT_DEFS.filter((def) => def.kind === "facilityTabs");
    expect(tabsDefs).toHaveLength(1);
    const def = tabsDefs[0];
    expect(def.key).toBe("rnd.facilities#facilityTabs/facilityTabs");
    expect(def.pageKey).toBe("rnd.facilities");
    expect(def.group).toBe("rnd");
    expect(def.field).toBe("facilityTabs");
    expect(def.section).toEqual({ ko: "생산설비 탭", en: "Facilities tabs" });
    expect(def.revalidate).toContain("/rnd/facilities");
  });

  it("normalizes the facilityTabs default (no id, no &quot;, name + images)", () => {
    const def = CONTENT_DEFS.find((candidate) => candidate.kind === "facilityTabs")!;
    for (const locale of LOCALES) {
      const value = DEFAULT_VALUES[def.key][locale];
      expect(value, locale).toBeTruthy();
      const tabs = JSON.parse(value!) as Array<{ name: string; images: string[] }>;
      expect(tabs, locale).toHaveLength(3);
      for (const tab of tabs) {
        expect(Object.keys(tab).sort(), locale).toEqual(["images", "name"]);
        expect(tab.name.length, locale).toBeGreaterThan(0);
        expect(tab.images.length, locale).toBeGreaterThan(0);
        expect(tab.images.every((image) => image.startsWith("/images/")), locale).toBe(true);
        expect(tab.images.some((image) => image.includes("&quot;")), locale).toBe(false);
      }
    }
  });
});
