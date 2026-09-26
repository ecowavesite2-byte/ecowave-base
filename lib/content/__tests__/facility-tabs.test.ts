import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPrismaMock, loadOverridesMock } = vi.hoisted(() => ({
  getPrismaMock: vi.fn(),
  loadOverridesMock: vi.fn(async () => ({}) as Record<string, string>),
}));

vi.mock("../db", () => ({
  getPrisma: getPrismaMock,
  isDbConfigured: vi.fn(() => false),
  loadOverrides: loadOverridesMock,
}));

import { CONTENT_DEF_MAP } from "../registry";
import { getResolvedFacilitiesTabs } from "../resolved";
import { normalizeFacilityTabsPayload } from "../save";

/**
 * rnd.facilities `facilityTabs`: the shared save validator plus the resolved
 * file-default/override funnel. No live DB — `loadOverrides` is mocked.
 */

const FACILITY_TABS_KEY = "rnd.facilities#facilityTabs/facilityTabs";

beforeEach(() => {
  vi.clearAllMocks();
  getPrismaMock.mockReturnValue(null);
  loadOverridesMock.mockResolvedValue({});
  // The resolver warns once on an invalid override; keep the test output clean.
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("facilityTabs registry def", () => {
  it("exposes the derived key (pageKey rnd.facilities, kind facilityTabs)", () => {
    const def = Object.values(CONTENT_DEF_MAP).find(
      (candidate) => candidate.pageKey === "rnd.facilities" && candidate.kind === "facilityTabs",
    );
    expect(def).toBeDefined();
    expect(def!.key).toBe(FACILITY_TABS_KEY);
  });
});

describe("normalizeFacilityTabsPayload", () => {
  it("accepts 1..3 tabs and trims the name (dropping unknown fields)", () => {
    const value = JSON.stringify([
      { name: "  생산설비  ", images: ["/images/a.png"], extra: 1 },
      { name: "검사설비", images: ["https://example.com/b.png"] },
    ]);
    expect(normalizeFacilityTabsPayload(value)).toBe(
      JSON.stringify([
        { name: "생산설비", images: ["/images/a.png"] },
        { name: "검사설비", images: ["https://example.com/b.png"] },
      ]),
    );
  });

  it("rejects malformed payloads", () => {
    const bad = [
      "[]",
      "{}",
      "not json",
      "[{}]",
      "[null]",
      '[[{"name":"a","images":["/images/a.png"]}]]', // entry not an object
      '[{"name":"","images":["/images/a.png"]}]', // empty name
      '[{"name":"   ","images":["/images/a.png"]}]', // blank name
      '[{"name":1,"images":["/images/a.png"]}]', // name not a string
      '[{"name":"a"}]', // missing images
      '[{"name":"a","images":[]}]', // empty images
      '[{"name":"a","images":[""]}]', // empty media
      '[{"name":"a","images":["javascript:alert(1)"]}]', // invalid media
      '[{"name":"a","images":["relative/x.png"]}]', // invalid media (no slash)
      '[{"name":"a","images":["/images/a.png",""]}]', // one bad image
    ];
    for (const value of bad) {
      expect(normalizeFacilityTabsPayload(value), value).toBeNull();
    }
  });

  it("rejects a 4th tab (max 3)", () => {
    const tabs = Array.from({ length: 4 }, (_, i) => ({
      name: `t${i}`,
      images: [`/images/${i}.png`],
    }));
    expect(normalizeFacilityTabsPayload(JSON.stringify(tabs))).toBeNull();
  });
});

describe("getResolvedFacilitiesTabs", () => {
  it("returns the file defaults per locale with stripped &quot; and stable ids", async () => {
    const ko = await getResolvedFacilitiesTabs("ko");
    expect(ko).toHaveLength(3);
    expect(ko.map((tab) => tab.id)).toEqual(["tab1", "tab2", "tab3"]);
    expect(ko[0].name).toBe("생산설비");
    expect(ko.every((tab) => tab.images.length > 0)).toBe(true);
    expect(
      ko.every((tab) => tab.images.every((src) => src.startsWith("/images/") && !src.includes("&quot;"))),
    ).toBe(true);

    const en = await getResolvedFacilitiesTabs("en");
    expect(en).toHaveLength(3);
    expect(en[0].name).toBe("Production facilities");
    expect(en.map((tab) => tab.id)).toEqual(["tab1", "tab2", "tab3"]);
    expect(en.every((tab) => tab.images.every((src) => src.startsWith("/images/")))).toBe(true);
  });

  it("applies a valid override (normalized) on top of the file defaults", async () => {
    loadOverridesMock.mockResolvedValue({
      [FACILITY_TABS_KEY]: JSON.stringify([
        { name: "  Only tab  ", images: ["/images/x.png", "/images/y.png"] },
      ]),
    });

    const resolved = await getResolvedFacilitiesTabs("ko");
    expect(resolved).toEqual([
      { id: "tab1", name: "Only tab", images: ["/images/x.png", "/images/y.png"] },
    ]);
  });

  it("falls back to the file defaults when the override is invalid", async () => {
    const base = await getResolvedFacilitiesTabs("ko");
    loadOverridesMock.mockResolvedValue({
      [FACILITY_TABS_KEY]: JSON.stringify([{ name: "a", images: ["javascript:alert(1)"] }]),
    });

    const resolved = await getResolvedFacilitiesTabs("ko");
    expect(resolved).toEqual(base);
  });

  it("ignores an empty/whitespace override value", async () => {
    const base = await getResolvedFacilitiesTabs("ko");
    loadOverridesMock.mockResolvedValue({ [FACILITY_TABS_KEY]: "   " });
    expect(await getResolvedFacilitiesTabs("ko")).toEqual(base);
  });
});
