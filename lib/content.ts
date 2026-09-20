/**
 * Backwards-compatible content entry point.
 *
 * The reader moved to `lib/content/read.ts` in Phase 2; this shim keeps every
 * existing `@/lib/content` import (`getSite`, `getPage`, `getBoard`,
 * `getBoardPost`, `PRODUCT_BOARDS`) working without touching call sites.
 */
export * from "./content/read";
