/**
 * Type declarations for the plain-JS registry generator.
 *
 * Only the tokenizer helpers are imported (by the mirror-drift parity test);
 * the script itself is `.mjs` and is not type-checked.
 */

export function textRuns(html: string | null | undefined): string[];
export function decodeEntities(value: string): string;
