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

function readLocalePage(locale: "ko" | "en", pageKey: string): PageContent | null {
  const file = path.join(ROOT, "content", locale, "pages", `${pageKey}.json`);
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

  it("round-trips src, alt, text and gallery item fields", () => {
    const fields = [
      /^src$/,
      /^alt$/,
      /^text$/,
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
          // `html` is no longer a raw field (code defs were removed); `alt`
          // now exists only as the raw `overlay` kind.
          (pattern.source !== "^alt$" || d.kind === "overlay"),
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
    const titleDef = CONTENT_DEFS.find((d) => d.pageKey === "home" && d.field === "title");
    const overlayDef = CONTENT_DEFS.find((d) => d.pageKey === "home" && d.kind === "overlay");
    expect(titleDef).toBeDefined();
    expect(overlayDef).toBeDefined();

    // A `lines` value containing "<" is plain text: it is injected/escaped, not
    // applied as markup.
    const lines = applyPageOverrides(home, { [titleDef!.key]: "pH < 7" }, "ko", {
      kinds: { [titleDef!.key]: "lines" },
    });
    const linesJson = JSON.stringify(lines);
    expect(linesJson).toContain("pH &lt; 7");

    // An `overlay` value is raw alt markup and wins verbatim.
    const raw = applyPageOverrides(home, { [overlayDef!.key]: '<p class="x">raw</p>' }, "ko", {
      kinds: { [overlayDef!.key]: "overlay" },
    });
    expect(JSON.stringify(raw)).toContain('<p class=\\"x\\">raw</p>');
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

describe("applyPageOverrides embedded media (img/iframe src)", () => {
  const imgDef = CONTENT_DEFS.find(
    (d) => d.pageKey === "company.about" && /^img\[\d+\]\.src$/.test(d.field),
  );
  const iframeDef = CONTENT_DEFS.find(
    (d) => d.pageKey === "company.global" && /^iframe\[\d+\]\.src$/.test(d.field),
  );

  it("replaces the nth img src for ko and for en (positional primary pairing)", () => {
    expect(imgDef).toBeDefined();
    const ko = readLocalePage("ko", "company.about") as PageContent;
    const en = readLocalePage("en", "company.about") as PageContent;

    const marker = "/patched-embed.png";
    const mergedKo = applyPageOverrides(ko, { [imgDef!.key]: marker }, "ko");
    expect(JSON.stringify(mergedKo)).toContain(marker);
    expect(JSON.stringify(mergedKo)).not.toBe(JSON.stringify(ko));

    // The KO widget id is absent from the EN tree; pairing must still land it.
    const mergedEn = applyPageOverrides(en, { [imgDef!.key]: marker }, "en", {
      primaryPage: ko,
    });
    expect(JSON.stringify(mergedEn)).toContain(marker);
    expect(JSON.stringify(en)).not.toContain(marker);
  });

  it("coexists with the widget's `lines` html override in either order", () => {
    expect(imgDef).toBeDefined();
    const ko = readLocalePage("ko", "company.about") as PageContent;
    const htmlKey = imgDef!.key.replace(/img\[\d+\]\.src$/, "html");
    expect(CONTENT_DEFS.some((d) => d.key === htmlKey)).toBe(true);

    const embed = "/coexist-embed.png";
    const copy = "COEXIST COPY";

    const embedFirst = applyPageOverrides(ko, { [imgDef!.key]: embed }, "ko");
    const bothA = applyPageOverrides(embedFirst, { [htmlKey]: copy }, "ko", {
      kinds: { [htmlKey]: "lines" },
    });
    expect(JSON.stringify(bothA)).toContain(embed);
    expect(JSON.stringify(bothA)).toContain(copy);

    const linesFirst = applyPageOverrides(ko, { [htmlKey]: copy }, "ko", {
      kinds: { [htmlKey]: "lines" },
    });
    const bothB = applyPageOverrides(linesFirst, { [imgDef!.key]: embed }, "ko");
    expect(JSON.stringify(bothB)).toContain(embed);
    expect(JSON.stringify(bothB)).toContain(copy);
    // injectTextRuns never rewrites tags, so the embed survives the lines pass.
    expect(bothB).toEqual(bothA);
  });

  it("applies an iframe src override", () => {
    expect(iframeDef).toBeDefined();
    const ko = readLocalePage("ko", "company.global") as PageContent;
    const marker = "https://example.com/embed";
    const merged = applyPageOverrides(ko, { [iframeDef!.key]: marker }, "ko");
    expect(JSON.stringify(merged)).toContain(marker);
  });

  it("no-ops for an out-of-range embed index", () => {
    expect(imgDef).toBeDefined();
    const ko = readLocalePage("ko", "company.about") as PageContent;
    const outOfRange = imgDef!.key.replace(/img\[(\d+)\]\.src$/, "img[99].src");
    const out = applyPageOverrides(ko, { [outOfRange]: "/never.png" }, "ko");
    expect(out).toEqual(ko);
    expect(JSON.stringify(out)).not.toContain("/never.png");
  });

  it("gives a markup-only iframe widget an iframe def but no lines def", () => {
    expect(iframeDef).toBeDefined();
    const widgetDefs = CONTENT_DEFS.filter((d) => d.widgetId === iframeDef!.widgetId);
    expect(widgetDefs.map((d) => d.field)).toEqual(["iframe[0].src"]);
    expect(widgetDefs.some((d) => d.field === "html")).toBe(false);
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
