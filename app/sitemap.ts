import type { MetadataRoute } from "next";

const ROUTES = [
  "/",
  "/company",
  "/company/ceo",
  "/company/about",
  "/company/philosophy",
  "/company/history",
  "/company/organization",
  "/company/global",
  "/rnd",
  "/rnd/technology",
  "/rnd/patents",
  "/rnd/facilities",
  "/products",
  "/products/eco-wave",
  "/products/clean-b",
  "/products/flowell",
  "/newsroom",
  "/news",
  "/support",
  "/notices",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.SITE_URL || "https://ecowavekorea.co.kr";
  const entries: MetadataRoute.Sitemap = [];
  for (const r of ROUTES) {
    entries.push({ url: base + (r === "/" ? "" : r), changeFrequency: "monthly", priority: r === "/" ? 1 : 0.7 });
    entries.push({ url: base + "/en" + (r === "/" ? "" : r), changeFrequency: "monthly", priority: 0.6 });
  }
  return entries;
}
