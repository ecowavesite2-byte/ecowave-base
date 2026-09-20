import { describe, expect, it } from "vitest";
import type { SiteData } from "../../types";
import { hasLogoIndex, hasNavPath, setLogo, setNavLabel } from "../site-strings";

const base: SiteData = {
  nav: [
    { name: "Company", url: "15", children: [{ name: "CEO", url: "16" }] },
    { name: "R&D", url: "21", children: [] },
  ],
  logos: [{ src: "/a.png", cls: "normal", parentCls: "" }],
  footer: { logo: null, lines: [], copyright: "" },
  bodyFont: "x",
  bodyColor: "y",
  bodyBg: "z",
};

describe("site-strings setters", () => {
  it("renames a top-level nav label immutably, preserving the url", () => {
    const next = setNavLabel(base, { index: 0 }, "회사");
    expect(next.nav[0].name).toBe("회사");
    expect(next.nav[0].url).toBe("15");
    expect(base.nav[0].name).toBe("Company");
  });

  it("renames a child nav label and keeps its route url", () => {
    const next = setNavLabel(base, { index: 0, childIndex: 0 }, "대표인사");
    expect(next.nav[0].children[0].name).toBe("대표인사");
    expect(next.nav[0].children[0].url).toBe("16");
  });

  it("throws clear errors for out-of-range paths", () => {
    expect(() => setNavLabel(base, { index: 5 }, "x")).toThrow(/out of range/);
    expect(() => setNavLabel(base, { index: 0, childIndex: 9 }, "x")).toThrow(/out of range/);
    expect(() => setLogo(base, 3, "/x.png")).toThrow(/out of range/);
  });

  it("reports path existence", () => {
    expect(hasNavPath(base, { index: 1 })).toBe(true);
    expect(hasNavPath(base, { index: 9 })).toBe(false);
    expect(hasNavPath(base, { index: 1, childIndex: 0 })).toBe(false);
    expect(hasLogoIndex(base, 0)).toBe(true);
    expect(hasLogoIndex(base, 1)).toBe(false);
  });

  it("sets a logo src immutably", () => {
    const next = setLogo(base, 0, "/b.png");
    expect(next.logos[0].src).toBe("/b.png");
    expect(base.logos[0].src).toBe("/a.png");
  });
});
