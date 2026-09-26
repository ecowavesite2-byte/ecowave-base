import { describe, expect, it } from "vitest";
import {
  SHARED_INTROS,
  channelOf,
  isSharedIntroSection,
  sharedIntroFor,
} from "../shared-intro";
import { PAGE_ALIASES } from "../paths";
import { getPage } from "../read";
import { PAGE_KEY_TO_ROUTE } from "../../routes";
import type { Locale } from "../../i18n";
// The generator mirrors the config in plain .mjs (scripts/ is not TS), so these
// parity assertions are the drift guard between the two definitions.
import {
  PAGE_ALIASES as generatorPageAliases,
  SHARED_INTROS as generatorSharedIntros,
} from "../../../scripts/gen-content-registry.mjs";

const LOCALES: Locale[] = ["ko", "en"];

/**
 * Every REAL company page key (`company.ceo`, …) in nav/route order. The root
 * `company` key is excluded: it is an alias that serves `company.ceo`, not an
 * independently editable page.
 */
const COMPANY_PAGE_KEYS = Object.keys(PAGE_KEY_TO_ROUTE).filter(
  (key) => channelOf(key) === "company" && !PAGE_ALIASES[key],
);

describe("shared company intro band", () => {
  it("keeps the lib and generator SHARED_INTROS configs identical", () => {
    expect(generatorSharedIntros).toEqual(SHARED_INTROS);
  });

  it("keeps the lib and generator PAGE_ALIASES configs identical", () => {
    expect(generatorPageAliases).toEqual(PAGE_ALIASES);
  });

  it("maps both slash and dot pageKey forms to the company.ceo source", () => {
    expect(sharedIntroFor("company.ceo")?.canonicalPageKey).toBe("company.ceo");
    expect(sharedIntroFor("company/about")?.canonicalPageKey).toBe("company.ceo");
    // The aliased root key belongs to the channel too, so it resolves to the
    // canonical source (the read funnel already serves it from `company.ceo`).
    expect(sharedIntroFor("company")?.canonicalPageKey).toBe("company.ceo");
    // non-company channels have no shared intro
    expect(sharedIntroFor("rnd.technology")).toBeNull();
    expect(sharedIntroFor("home")).toBeNull();
  });

  it("has exactly one band on every real company page, both locales", () => {
    expect(COMPANY_PAGE_KEYS).toEqual([
      "company.ceo",
      "company.about",
      "company.philosophy",
      "company.history",
      "company.organization",
      "company.global",
    ]);
    for (const pageKey of COMPANY_PAGE_KEYS) {
      const cfg = sharedIntroFor(pageKey);
      expect(cfg, pageKey).not.toBeNull();
      if (!cfg) continue;
      for (const locale of LOCALES) {
        const page = getPage(locale, pageKey);
        const matches = page.sections.filter((s) => isSharedIntroSection(s, cfg));
        expect(matches, `${pageKey} [${locale}]`).toHaveLength(1);
      }
    }
  });
});
