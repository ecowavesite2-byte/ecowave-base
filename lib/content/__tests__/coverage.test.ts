import { describe, expect, it } from "vitest";
import type { PageContent } from "../../types";
import { CONTENT_DEFS } from "../registry";
import { applyBoardOverrides, applyPageOverrides, applySiteOverrides } from "../merge";
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
  "support#s20250811f489e3443bdbe/w20250811379e3dc61aa7f/html@en": NO_EN_COUNTERPART,
  "support#s20250811f489e3443bdbe/w202508114039c43732879/href@en": NO_EN_COUNTERPART,
  "support#s20250811f489e3443bdbe/w202508114039c43732879/text@en": NO_EN_COUNTERPART,
  "support#s20250811f489e3443bdbe/w20250811c8ba21c61f272/html@en": NO_EN_COUNTERPART,
  "support#s20250811f489e3443bdbe/w2025091955cb4ab654cac/html@en": NO_EN_COUNTERPART,
  "support#s20250811f489e3443bdbe/w2025091988816c09014e4/html@en": NO_EN_COUNTERPART,
  "support#s20250811f489e3443bdbe/w202509198aeb3bd046ac9/html@en": NO_EN_COUNTERPART,
  "support#s20250811f489e3443bdbe/w20250919b68d158c2925e/html@en": NO_EN_COUNTERPART,
  "support#s20250811f489e3443bdbe/w20250919e76996cca8992/html@en": NO_EN_COUNTERPART,
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
        let merged: unknown;

        try {
          if (kind === "board") {
            if (def.field !== "name") {
              failures.push(`${tag}: unexpected board field (${def.field}) not allowlisted`);
              continue;
            }
            merged = applyBoardOverrides(
              getBoard(locale, def.pageKey),
              { [def.key]: marker },
              def.pageKey,
              { fallbackName: "COV_FALLBACK" },
            );
          } else if (kind === "site") {
            merged = applySiteOverrides(getSite(locale), { [def.key]: marker }, locale);
          } else {
            const base = cachedPage(locale, def.pageKey);
            const primary = locale === "ko" ? null : cachedPage("ko", def.pageKey);
            merged = applyPageOverrides(base, { [def.key]: marker }, locale, {
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
    // 701 defs × 2 locales − 23 allowlisted applications (10 board-post + 13 EN).
    expect(allowlisted.length).toBe(23);
    expect(applied).toBe(CONTENT_DEFS.length * LOCALES.length - 23);
    expect(applied).toBe(1379);
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
});
