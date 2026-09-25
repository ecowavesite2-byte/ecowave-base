import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { PageContent, SiteData } from "../../types";
import { CONTENT_DEFS, DEFAULT_VALUES } from "../registry";
import { applyPageOverrides, applySiteOverrides, parseRegistryKey } from "../merge";

const ROOT = process.cwd();

function readPage(pageKey: string): PageContent | null {
  const file = path.join(ROOT, "content", "ko", "pages", `${pageKey}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as PageContent;
}

const home = readPage("home") as PageContent;

describe("parseRegistryKey", () => {
  it("parses every key shape emitted by the registry", () => {
    expect(parseRegistryKey("company.ceo#s1/w1/html")).toEqual({
      pageKey: "company.ceo",
      sectionId: "s1",
      widgetId: "w1",
      field: "html",
    });
    expect(parseRegistryKey("home#s1/w1/items[3].desc")).toEqual({
      pageKey: "home",
      sectionId: "s1",
      widgetId: "w1",
      field: "items[3].desc",
    });
    expect(parseRegistryKey("news#board/news/posts")).toEqual({
      pageKey: "news",
      sectionId: "board",
      widgetId: "news",
      field: "posts",
    });
    expect(parseRegistryKey("site#nav/nav[0].children[2]/name")).toEqual({
      pageKey: "site",
      sectionId: "nav",
      widgetId: "nav[0].children[2]",
      field: "name",
    });
  });

  it("returns null for malformed keys instead of throwing", () => {
    for (const bad of ["", "no-hash", "#/a/b", "a#b", "a#b/c", "a#b/c/d/e", "a#//d"]) {
      expect(parseRegistryKey(bad)).toBeNull();
    }
  });
});

describe("applyPageOverrides", () => {
  it("is a strict no-op for empty overrides (pixel-parity guarantee)", () => {
    const out = applyPageOverrides(home, {}, "ko");
    expect(out).toEqual(home);
    expect(JSON.stringify(out)).toBe(JSON.stringify(home));
    expect(out).not.toBe(home);
    expect(out.sections).not.toBe(home.sections);
  });

  it("changes exactly the targeted field and keeps the rest identical", () => {
    // Use a scalar (image src) def: its value applies verbatim, so reverting it
    // reproduces the input byte-for-byte — proof that no other node moved.
    // (`lines` defs are deliberately NOT byte-exact on revert: the plain text is
    // re-injected into the crawl markup, normalising entities/whitespace — see
    // text-runs.test.ts for that contract.)
    const def = CONTENT_DEFS.find(
      (d) =>
        d.pageKey === "home" &&
        d.kind === "image" &&
        typeof DEFAULT_VALUES[d.key]?.ko === "string" &&
        (DEFAULT_VALUES[d.key]?.ko?.length ?? 0) > 0,
    );
    expect(def).toBeDefined();

    const original = DEFAULT_VALUES[def!.key].ko as string;
    const before = JSON.stringify(home);

    const out = applyPageOverrides(home, { [def!.key]: "/patched.jpg" }, "ko");
    expect(JSON.stringify(out)).not.toBe(before);

    // Reverting the one field through the same merge reproduces the input
    // exactly — proof that no other node moved.
    const restored = applyPageOverrides(out, { [def!.key]: original }, "ko");
    expect(restored).toEqual(home);

    // The source page was never mutated (deep clone).
    expect(JSON.stringify(home)).toBe(before);
  });

  it("round-trips html, src, alt, text, href and gallery item fields", () => {
    const fields = [
      /^html$/,
      /^src$/,
      /^alt$/,
      /^text$/,
      /^href$/,
      /^items\[\d+\]\.title$/,
      /^items\[\d+\]\.desc$/,
      /^items\[\d+\]\.org$/,
      /^items\[\d+\]\.thumb$/,
    ];

    for (const pattern of fields) {
      const def = CONTENT_DEFS.find(
        (d) =>
          pattern.test(d.field) &&
          typeof DEFAULT_VALUES[d.key]?.ko === "string" &&
          readPage(d.pageKey) !== null &&
          // `html` now spans two contracts: raw `textarea` (code blocks, applied
          // verbatim) and `lines` (plain text injected into the crawl markup).
          // Byte-round-trip the raw one here; the `lines` contract is covered by
          // text-runs.test.ts and the coverage marker test.
          (pattern.source !== "^html$" ||
            (d.kind === "textarea" && DEFAULT_VALUES[d.key].ko!.includes("<"))),
      );
      expect(def, `no registry def for ${pattern}`).toBeDefined();

      const page = readPage(def!.pageKey) as PageContent;
      const original = DEFAULT_VALUES[def!.key].ko as string;
      const before = JSON.stringify(page);

      const patched = applyPageOverrides(page, { [def!.key]: `${original}__patched__` }, "ko");
      expect(JSON.stringify(patched), `${def!.key} was not applied`).not.toBe(before);

      const restored = applyPageOverrides(patched, { [def!.key]: original }, "ko");
      expect(restored, `${def!.key} round-trip`).toEqual(page);
      expect(JSON.stringify(page), `${def!.key} mutated input`).toBe(before);
    }
  });

  it("uses the def kind to choose raw HTML vs plain-text injection (Gate-2 F4)", () => {
    const linesKey = "home#s20250811004ea868d7376/w202508116077d50475951/html";
    const codeKey = "home#s20250811004ea868d7376/w2025081108d44efc92e85/html";

    // A `lines` value containing "<" is plain text: it is injected/escaped, not
    // applied as markup, and the authored 48px span survives.
    const lines = applyPageOverrides(home, { [linesKey]: "pH < 7" }, "ko", {
      kinds: { [linesKey]: "lines" },
    });
    const linesJson = JSON.stringify(lines);
    expect(linesJson).toContain("pH &lt; 7");
    expect(linesJson).toContain("font-size: 48px");

    // A `textarea` (code) value is raw HTML and wins verbatim.
    const raw = applyPageOverrides(home, { [codeKey]: "<p>raw</p>" }, "ko", {
      kinds: { [codeKey]: "textarea" },
    });
    expect(JSON.stringify(raw)).toContain("<p>raw</p>");
  });

  it("ignores unknown, malformed and out-of-range keys", () => {
    const out = applyPageOverrides(
      home,
      {
        "not-a-key": "x",
        "home#does-not-exist/w1/html": "x",
        "home#sX/wX/not-a-field": "x",
        "other.page#sX/wX/html": "x",
      },
      "ko",
    );
    expect(out).toEqual(home);
  });

  it("ignores board keys (boards are a later phase)", () => {
    const def = CONTENT_DEFS.find((d) => d.pageKey === "news" && d.field === "posts");
    expect(def).toBeDefined();
    const out = applyPageOverrides(home, { [def!.key]: "[]" }, "ko");
    expect(out).toEqual(home);
  });
});

describe("applySiteOverrides", () => {
  const siteFixture: SiteData = {
    nav: [
      { name: "회사", url: "15", children: [{ name: "CEO인사말", url: "16" }] },
      { name: "연구개발", url: "21", children: [] },
    ],
    logos: [],
    footer: { logo: null, lines: [], copyright: "" },
    bodyFont: "sans-serif",
    bodyColor: "rgb(0,0,0)",
    bodyBg: "rgb(255,255,255)",
  };

  it("is a no-op for empty overrides", () => {
    const out = applySiteOverrides(siteFixture, {}, "ko");
    expect(out).toEqual(siteFixture);
    expect(out).not.toBe(siteFixture);
  });

  it("renames top-level and child nav labels without mutating input", () => {
    const out = applySiteOverrides(
      siteFixture,
      {
        "site#nav/nav[0]/name": "Company",
        "site#nav/nav[0].children[0]/name": "Greeting",
        "site#nav/nav[9]/name": "out-of-range",
        "site#nav/nav[0]/url": "should-be-ignored",
        "news#board/news/name": "should-be-ignored",
      },
      "ko",
    );

    expect(out.nav[0].name).toBe("Company");
    expect(out.nav[0].children[0].name).toBe("Greeting");
    expect(out.nav[1].name).toBe("연구개발");
    expect(out.nav[0].url).toBe("15");
    // input untouched
    expect(siteFixture.nav[0].name).toBe("회사");
    expect(siteFixture.nav[0].children[0].name).toBe("CEO인사말");
  });
});
