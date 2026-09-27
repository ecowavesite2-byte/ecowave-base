import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Vitest runs the pure unit tests outside Next's bundler, which resolves the
 * `@/*` tsconfig path alias automatically. Vite does not read tsconfig `paths`,
 * so mirror the root `@` alias here; the more specific `@/generated/prisma`
 * entries in `tsconfig.json` are Next-only and untouched by these tests.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
});
