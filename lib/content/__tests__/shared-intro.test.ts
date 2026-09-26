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

/** Every REAL rnd page key (`rnd.technology`, …) — the `rnd` root is an alias. */
const RND_PAGE_KEYS = Object.keys(PAGE_KEY_TO_ROUTE).filter(
  (key) => channelOf(key) === "rnd" && !PAGE_ALIASES[key],
);

describe("shared channel intro bands", () => {
  it("keeps the lib and generator SHARED_INTROS configs identical", () => {
    expect(generatorSharedIntros).toEqual(SHARED_INTROS);
  });

  it("keeps the lib and generator PAGE_ALIASES configs identical", () => {
    expect(generatorPageAliases).toEqual(PAGE_ALIASES);
  });

  it("maps both slash and dot company pageKey forms to the company.ceo source", () => {
    expect(sharedIntroFor("company.ceo")?.canonicalPageKey).toBe("company.ceo");
    expect(sharedIntroFor("company/about")?.canonicalPageKey).toBe("company.ceo");
    // The aliased root key belongs to the channel too, so it resolves to the
    // canonical source (the read funnel already serves it from `company.ceo`).
    expect(sharedIntroFor("company")?.canonicalPageKey).toBe("company.ceo");
    // non-shared channels have no intro band
    expect(sharedIntroFor("home")).toBeNull();
    expect(sharedIntroFor("news")).toBeNull();
  });

  it("maps both slash and dot rnd pageKey forms to the rnd.technology source", () => {
    expect(sharedIntroFor("rnd.technology")?.canonicalPageKey).toBe("rnd.technology");
    expect(sharedIntroFor("rnd/patents")?.canonicalPageKey).toBe("rnd.technology");
    expect(sharedIntroFor("rnd/facilities")?.canonicalPageKey).toBe("rnd.technology");
    // The aliased root key belongs to the channel too (served from rnd.technology).
    expect(sharedIntroFor("rnd")?.canonicalPageKey).toBe("rnd.technology");
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

  it("has exactly one band on every real rnd page, both locales", () => {
    expect(RND_PAGE_KEYS).toEqual(["rnd.technology", "rnd.patents", "rnd.facilities"]);
    for (const pageKey of RND_PAGE_KEYS) {
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
