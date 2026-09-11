import type { NextConfig } from "next";

/** 301 redirects from the original imweb numeric URLs to semantic routes */
const numericRedirects: Record<string, string> = {
  "/15": "/company",
  "/16": "/company/ceo",
  "/17": "/company/about",
  "/18": "/company/philosophy",
  "/19": "/company/history",
  "/31": "/company/organization",
  "/20": "/company/global",
  "/21": "/rnd",
  "/22": "/rnd/technology",
  "/23": "/rnd/patents",
  "/24": "/rnd/facilities",
  "/32": "/products",
  "/37": "/products/eco-wave",
  "/38": "/products/clean-b",
  "/36": "/products/flowell",
  "/26": "/newsroom",
  "/29": "/news",
  "/28": "/support",
  "/27": "/notices",
};

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    const plain = Object.entries(numericRedirects).map(([source, destination]) => ({
      source,
      destination,
      permanent: true,
    }));
    // post detail URLs (?idx=...) map to the new post detail routes
    const boardDest: Record<string, string> = {
      "/29": "/news",
      "/27": "/notices",
      "/37": "/products/eco-wave",
      "/38": "/products/clean-b",
      "/36": "/products/flowell",
    };
    const posts = Object.entries(boardDest).map(([source, destination]) => ({
      source,
      destination: `${destination}/:idx`,
      has: [{ type: "query" as const, key: "idx" }],
      permanent: true,
    }));
    return [...posts, ...plain];
  },
};

export default nextConfig;
