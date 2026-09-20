/**
 * Visual audit — shared page/viewport config
 * Maps every local route to its numeric imweb counterpart so the capture
 * pipeline can shoot identical pages on both sides.
 */
export const ORIG_BASE = "https://imweb8701032505.imweb.me";
export const DEFAULT_LOCAL_BASE = "http://localhost:3000";

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

export const PAGES = [
  { key: "home", orig: "/", local: "/" },
  { key: "company", orig: "/15", local: "/company" },
  { key: "company.ceo", orig: "/16", local: "/company/ceo" },
  { key: "company.about", orig: "/17", local: "/company/about" },
  { key: "company.philosophy", orig: "/18", local: "/company/philosophy" },
  { key: "company.history", orig: "/19", local: "/company/history" },
  { key: "company.organization", orig: "/31", local: "/company/organization" },
  { key: "company.global", orig: "/20", local: "/company/global" },
  { key: "rnd", orig: "/21", local: "/rnd" },
  { key: "rnd.technology", orig: "/22", local: "/rnd/technology" },
  { key: "rnd.patents", orig: "/23", local: "/rnd/patents" },
  { key: "rnd.facilities", orig: "/24", local: "/rnd/facilities" },
  { key: "products", orig: "/32", local: "/products" },
  { key: "products.eco-wave", orig: "/37", local: "/products/eco-wave" },
  { key: "products.clean-b", orig: "/38", local: "/products/clean-b" },
  { key: "products.flowell", orig: "/36", local: "/products/flowell" },
  { key: "newsroom", orig: "/26", local: "/newsroom" },
  { key: "news", orig: "/29", local: "/news" },
  { key: "support", orig: "/28", local: "/support" },
  { key: "notices", orig: "/27", local: "/notices" },
];
