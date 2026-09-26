import { describe, expect, it } from "vitest";
import { CONTENT_DEFS } from "../registry";
import { getPage } from "../read";
import { PAGE_ALIASES, resolvePageAlias } from "../paths";
import { channelOf } from "../shared-intro";
import { PAGE_KEY_TO_ROUTE } from "../../routes";
import type { Locale } from "../../i18n";

/**
 * WS1 — company channel root alias + nav-order emission.
 *
 * `/company` (the crawled pageKey `company`) is an alias that serves the CEO
 * greeting page's content with no redirect; the root JSON stays a crawl artifact
 * and emits no registry defs, so the admin Company group shows exactly the six
 * subpages in nav order.
 */

const LOCALES: Locale[] = ["ko", "en"];

const ALIAS_KEY = "company";
const CANONICAL_KEY = "company.ceo";

/** The real company subpages (`company` excluded), in nav/route order. */
const COMPANY_NAV_ORDER = Object.keys(PAGE_KEY_TO_ROUTE).filter(
  (key) => channelOf(key) === "company" && !PAGE_ALIASES[key],
);

const SHARED_BAND_KEY =
  "company.ceo#s202508206321c39177601/w20250820e1c08ac226481/html";

describe("company root alias", () => {
  it("is declared as company → company.ceo", () => {
    expect(PAGE_ALIASES[ALIAS_KEY]).toBe(CANONICAL_KEY);
    expect(resolvePageAlias(ALIAS_KEY)).toBe(CANONICAL_KEY);
  });

  it("resolves every non-alias key to itself", () => {
    for (const key of ["home", "company.about", "company.global", "rnd.patents", "news"]) {
      expect(resolvePageAlias(key), key).toBe(key);
    }
  });

  it("serves /company from the company.ceo tree in both locales", () => {
    for (const locale of LOCALES) {
      expect(getPage(locale, ALIAS_KEY), locale).toEqual(getPage(locale, CANONICAL_KEY));
    }
  });

  it("emits no registry def for the aliased root pageKey", () => {
    expect(CONTENT_DEFS.filter((def) => def.pageKey === ALIAS_KEY)).toEqual([]);
  });

  it("emits company pages in nav/route order", () => {
    const emitted = [
      ...new Set(
        CONTENT_DEFS.filter((def) => channelOf(def.pageKey) === "company").map(
          (def) => def.pageKey,
        ),
      ),
    ];
    expect(emitted).toEqual(COMPANY_NAV_ORDER);
    expect(emitted).toEqual([
      "company.ceo",
      "company.about",
      "company.philosophy",
      "company.history",
      "company.organization",
      "company.global",
    ]);
  });

  it("revalidates the /company alias for every company.ceo def", () => {
    const ceoDefs = CONTENT_DEFS.filter((def) => def.pageKey === CANONICAL_KEY);
    expect(ceoDefs.length).toBeGreaterThan(0);
    for (const def of ceoDefs) {
      expect(def.revalidate, def.key).toContain("/company");
      expect(def.revalidate, def.key).toContain("/en/company");
    }
  });

  it("canonicalizes the shared intro band onto company.ceo", () => {
    const sharedDefs = CONTENT_DEFS.filter((def) => def.shared);
    expect(sharedDefs).toHaveLength(1);
    expect(sharedDefs[0]?.pageKey).toBe(CANONICAL_KEY);
    expect(sharedDefs[0]?.key).toBe(SHARED_BAND_KEY);
    expect(sharedDefs[0]?.shared).toBe(true);
  });
});
