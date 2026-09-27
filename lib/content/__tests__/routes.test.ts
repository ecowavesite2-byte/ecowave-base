import { describe, expect, it } from "vitest";
import { routeForSource } from "../../routes";

/**
 * `routeForSource` maps imweb numeric source URLs to semantic routes.
 * `SOURCE_TO_ROUTE` carries the KO map; EN swaps the three product children
 * (`/36`,`/37`,`/38`) because the EN crawl is ordered differently.
 */
describe("routeForSource (KO/default)", () => {
  it("maps the product source URLs to their KO routes", () => {
    expect(routeForSource("/36", "ko")).toBe("/products/flowell");
    expect(routeForSource("/37", "ko")).toBe("/products/eco-wave");
    expect(routeForSource("/38", "ko")).toBe("/products/clean-b");
  });

  it("defaults to KO when no locale is supplied", () => {
    expect(routeForSource("/36")).toBe("/products/flowell");
    expect(routeForSource("/37")).toBe("/products/eco-wave");
    expect(routeForSource("/38")).toBe("/products/clean-b");
  });
});

describe("routeForSource (EN product swap)", () => {
  it("maps the EN product sources to the swapped routes", () => {
    expect(routeForSource("/36", "en")).toBe("/products/eco-wave");
    expect(routeForSource("/37", "en")).toBe("/products/clean-b");
    expect(routeForSource("/38", "en")).toBe("/products/flowell");
  });

  it("leaves non-product sources identical across locales", () => {
    expect(routeForSource("/15", "en")).toBe("/company");
    expect(routeForSource("/29", "en")).toBe("/news");
    expect(routeForSource("/27", "en")).toBe("/notices");
    expect(routeForSource("/32", "en")).toBe("/products");
  });
});

describe("routeForSource pass-through", () => {
  it("adds a leading slash to bare paths and passes unknown paths through", () => {
    expect(routeForSource("999")).toBe("/999");
    expect(routeForSource("/999")).toBe("/999");
    expect(routeForSource("/company")).toBe("/company");
  });

  it("returns / for a missing url", () => {
    expect(routeForSource(undefined)).toBe("/");
    expect(routeForSource(null)).toBe("/");
    expect(routeForSource("")).toBe("/");
  });
});
