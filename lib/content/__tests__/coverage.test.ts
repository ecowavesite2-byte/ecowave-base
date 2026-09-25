import { describe, expect, it } from "vitest";
import type { PageContent } from "../../types";
import { CONTENT_DEFS } from "../registry";
import { applyBoardOverrides, applyPageOverrides, applySiteOverrides } from "../merge";
import { sectionWidgets } from "../pair";
import { getBoard, getPage, getSite } from "../read";

/**
 * Acceptance gate for the override appliers.
 *
 * Every registry def is exercised for BOTH locales with a unique marker: the
 * marker must actually show up in the merged content. This is what would have
 * caught the EN bug (registry keys are generated from the KO tree; EN ids
 * differ, so an id-only merge silently no-ops).
 *
 * Defs that legitimately cannot be applied yet are listed explicitly below with
 * a reason. Any other non-applying def fails the test.
 */

type Locale = "ko" | "en";
const LOCALES: Locale[] = ["ko", "en"];

const NO_EN_COUNTERPART =
  "no structurally paired EN widget (ko/en type mismatch recorded by the generator)";

/**
 * key (all locales) or `key@locale` → reason.
 *
 * Allowlisted classes:
 *  - board `posts` keys: posts are a COLLECTION override stored in `board_post`,
 *    not a `page_content` list value, so there is nothing for the appliers to do
 *    with this key (board `name` keys DO apply via `applyBoardOverrides`);
 *  - EN positions with no structurally paired widget: the generator pairs EN by
 *    index/type and recorded a ko/en type mismatch here, so no EN default exists
 *    and the EN side correctly inherits the KO default.
 */
const ALLOWLIST: Record<string, string> = {
  "news#board/news/posts": "posts are stored in board_post (collection override), not a page_content list value",
  "notices#board/notices/posts": "posts are stored in board_post (collection override), not a page_content list value",
  "products.clean-b#board/products.clean-b/posts": "posts are stored in board_post (collection override), not a page_content list value",
  "products.eco-wave#board/products.eco-wave/posts": "posts are stored in board_post (collection override), not a page_content list value",
  "products.flowell#board/products.flowell/posts": "posts are stored in board_post (collection override), not a page_content list value",

  // No structurally paired EN widget (ko/en type mismatch recorded by the generator).
  "company.about#s20250811457daf6e58a2c/w20250918684332dc780e7/html@en": NO_EN_COUNTERPART,
  "company.about#s20250918e40b7f78d4437/w20250918bf11a5c9a5e10/html@en": NO_EN_COUNTERPART,
  // company.philosophy: the EN twins of these PC sections omit their trailing
  // `code` widget (KO 8/5 widgets, EN 6/4) — no widget sits at the paired index.
  "company.philosophy#s202508119eca72dc669e0/w202508119eca72dc669e0lbl/html@en": NO_EN_COUNTERPART,
  "company.philosophy#s202508280e68f158799c2/w202508280e68f158799c2lbl/html@en": NO_EN_COUNTERPART,
  // notices: section `…68c46f` holds `code,form,padding` in KO but `form,code,padding`
  // in EN — the generator records code↔form type mismatches at both indices, so the
  // KO `code` widget has no positionally paired EN widget.
  "notices#s2025100213c204b68c46f/w20251002853d352b9298d/html@en": NO_EN_COUNTERPART,
  // support: the KO page has only 5 sections while EN has 8 (the EN tree adds the
  // two page-hero sections and a form/code section), so section indices 2/3 pair
  // against unrelated EN sections (`padding,text,padding` / `padding,board`) —
  // no widget sits at the paired index/type.
  "support#s2025091161e916b59099f/w202509110e7da42eec27c/href@en": NO_EN_COUNTERPART,
  "support#s2025091161e916b59099f/w20250911712afbc03dd48/html@en": NO_EN_COUNTERPART,
  "support#s202508251581659561ee1/w2025082575878708b2b14/html@en": NO_EN_COUNTERPART,
  "support#s2025091161e916b59099f/w202509110e7da42eec27c/alt@en": NO_EN_COUNTERPART,
  "support#s2025091161e916b59099f/w202509110e7da42eec27c/src@en": NO_EN_COUNTERPART,
};

type DefKind = "page" | "site" | "board";

function kindOf(def: { sectionId: string }): DefKind {
  if (def.sectionId === "board") return "board";
  if (def.sectionId === "nav") return "site";
  return "page";
}

describe("override coverage (every CONTENT_DEFS key, both locales)", () => {
  it("applies a unique marker for every non-allowlisted def", () => {
    const failures: string[] = [];
    const allowlisted: string[] = [];
    let applied = 0;

    const pageCache = new Map<string, PageContent>();
    const cachedPage = (locale: Locale, key: string): PageContent => {
      const id = `${locale}|${key}`;
      const hit = pageCache.get(id);
      if (hit) return hit;
      const page = getPage(locale, key);
      pageCache.set(id, page);
      return page;
    };

    CONTENT_DEFS.forEach((def, index) => {
      for (const locale of LOCALES) {
        const tag = `${def.key} [${locale}]`;

        const reason = ALLOWLIST[`${def.key}@${locale}`] ?? ALLOWLIST[def.key];
        if (reason) {
          allowlisted.push(`${tag}: ${reason}`);
          continue;
        }

        const kind = kindOf(def);
        const marker = `__COV_${index}_${locale}__`;
        // Each kind has its own value contract:
        //  - `slides`: JSON array, marker in both bg and text;
        //  - `textarea`: raw HTML (code blocks are applied verbatim);
        //  - everything else (`lines`, text, image, url, list, gallery): plain.
        const value =
          def.kind === "slides"
            ? JSON.stringify([{ bg: `/${marker}.png`, html: marker }])
            : def.kind === "textarea"
              ? `<p>${marker}</p>`
              : marker;
        let merged: unknown;

        try {
          if (kind === "board") {
            if (def.field !== "name") {
              failures.push(`${tag}: unexpected board field (${def.field}) not allowlisted`);
              continue;
            }
            merged = applyBoardOverrides(
              getBoard(locale, def.pageKey),
              { [def.key]: value },
              def.pageKey,
              { fallbackName: "COV_FALLBACK" },
            );
          } else if (kind === "site") {
            merged = applySiteOverrides(getSite(locale), { [def.key]: value }, locale);
          } else {
            const base = cachedPage(locale, def.pageKey);
            const primary = locale === "ko" ? null : cachedPage("ko", def.pageKey);
            merged = applyPageOverrides(base, { [def.key]: value }, locale, {
              primaryPage: primary,
            });
          }
        } catch (error) {
          failures.push(
            `${tag}: threw ${error instanceof Error ? error.message : String(error)}`,
          );
          continue;
        }

        if (JSON.stringify(merged).includes(marker)) {
          applied += 1;
        } else {
          failures.push(`${tag}: field=${def.field} kind=${def.kind} group=${def.group}`);
        }
      }
    });

    const expectedApplied = CONTENT_DEFS.length * LOCALES.length - allowlisted.length;
    console.log(
      `[coverage] defs=${CONTENT_DEFS.length} · applied=${applied} · ` +
        `allowlisted=${allowlisted.length} · expected-applied=${expectedApplied} · ` +
        `failed=${failures.length}`,
    );
    if (failures.length > 0) {
      console.log(`[coverage] failures:\n${failures.join("\n")}`);
    }

    expect(failures).toEqual([]);
    // 586 defs × 2 locales − 20 allowlisted applications (10 board-post +
    // 10 EN positions with no structurally paired widget).
    // Dead sections are excluded from the registry by the generator: the footer
    // copies on non-home pages (SiteFooter renders home's) and the leading
    // page-title hero band of each channel (rebuilt as <PageHero> from nav).
    // Markup-only text widgets (logo/structure html with no text nodes) are also
    // excluded — a `lines` def there could only clobber the markup (Gate-2 F2).
    expect(allowlisted.length).toBe(20);
    expect(applied).toBe(CONTENT_DEFS.length * LOCALES.length - 20);
    expect(applied).toBe(1152);
    expect(applied).toBe(expectedApplied);
  });

  it("pairs an EN override positionally when the KO id is absent (reported bug)", () => {
    const key = "home#s202508116d15f8202cd82/w20250811b716fff52cc61/html";
    const ko = getPage("ko", "home");
    const en = getPage("en", "home");
    const marker = "__REGRESSION_EN__";

    // The KO widget id is unique to the KO tree — id lookup alone would no-op.
    expect(JSON.stringify(ko)).toContain("w20250811b716fff52cc61");
    expect(JSON.stringify(en)).not.toContain("w20250811b716fff52cc61");

    const mergedEn = applyPageOverrides(en, { [key]: marker }, "en", { primaryPage: ko });
    expect(JSON.stringify(mergedEn)).toContain(marker);

    // ko fast path still resolves by id with no primary tree.
    const mergedKo = applyPageOverrides(ko, { [key]: marker }, "ko");
    expect(JSON.stringify(mergedKo)).toContain(marker);
  });

  it("hero slides override replaces the list and supports added slides", () => {
    const ko = getPage("ko", "home");
    const key = "home#s20250811b5ffbb4730f67/visual/slides";
    const payload = JSON.stringify([
      { bg: "/a.jpg", html: "first" },
      { bg: "/b.jpg", html: "second" },
      { bg: "/c.jpg", html: "third" },
    ]);

    const merged = applyPageOverrides(ko, { [key]: payload }, "ko");
    const hero = merged.sections.find((s) => s.id === "s20250811b5ffbb4730f67");
    expect(hero?.visual?.map((s) => s.bg)).toEqual(["/a.jpg", "/b.jpg", "/c.jpg"]);
    expect(hero?.visual?.length).toBe(3);
    expect(hero?.visual?.[0].html).toContain("first");
    expect(hero?.visual?.[2].html).toContain("third");
    // an added slide reuses the last authored slide's styled template
    expect(hero?.visual?.[2].html).toContain("<span");
  });

  it("ignores empty or shapeless slides payloads (never blanks the hero)", () => {
    const ko = getPage("ko", "home");
    const key = "home#s20250811b5ffbb4730f67/visual/slides";
    const heroOf = (payload: string) =>
      applyPageOverrides(ko, { [key]: payload }, "ko").sections.find(
        (s) => s.id === "s20250811b5ffbb4730f67",
      );

    expect(heroOf("[]")?.visual?.length).toBe(2);
    expect(heroOf(JSON.stringify([1, 2, 3]))?.visual?.length).toBe(2);
    expect(heroOf("not json")?.visual?.length).toBe(2);
  });

  it("home ko/en structural parity", () => {
    // The registry keys are generated from KO and EN is paired positionally, so
    // a one-sided home edit (e.g. dropping a mobile-variant section from only one
    // locale) silently corrupts EN defaults. Guard the invariant directly.
    const ko = getPage("ko", "home");
    const en = getPage("en", "home");

    expect(en.sections.length).toBe(ko.sections.length);

    ko.sections.forEach((koSection, index) => {
      const enSection = en.sections[index];
      expect(enSection, `home sections diverge at index ${index}`).toBeDefined();

      // same section index → same widget kind/type sequence
      const koTypes = sectionWidgets(koSection).map((w) => w.type);
      const enTypes = sectionWidgets(enSection).map((w) => w.type);
      expect(enTypes, `home section ${index} widget types`).toEqual(koTypes);

      // hero slides are not widget nodes; they pair by index too
      const koSlides = koSection.visual?.length ?? 0;
      const enSlides = enSection.visual?.length ?? 0;
      expect(enSlides, `home section ${index} visual slide count`).toBe(koSlides);
    });
  });
});
