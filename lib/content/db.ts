import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma";

/**
 * Runtime Prisma client factory for the Postgres override store.
 *
 * Server-only: this module and everything it imports (Prisma client + pg
 * adapter) must never be pulled into a client bundle.
 *
 * The client is created lazily and cached on `globalThis` so Next.js hot reload
 * does not open a new pool on every module evaluation. When `DATABASE_URL` is
 * unset the whole DB lane degrades gracefully to file-backed defaults.
 */

const globalForPrisma = globalThis as unknown as {
  __ecowavePrisma?: PrismaClient;
};

/** True when a Postgres connection string is present in the environment. */
export function isDbConfigured(): boolean {
  return typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.length > 0;
}

/**
 * The shared Prisma client, or `null` when no `DATABASE_URL` is configured.
 * Never throws at import time / before a connection is attempted.
 */
export function getPrisma(): PrismaClient | null {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;

  if (!globalForPrisma.__ecowavePrisma) {
    globalForPrisma.__ecowavePrisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
    });
  }
  return globalForPrisma.__ecowavePrisma;
}

let warned = false;

/** One warning per process is enough — a down DB should not spam the logs. */
function warnOnce(error: unknown): void {
  if (warned) return;
  warned = true;
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[content/db] override lookup failed; using file defaults: ${message}`);
}

/**
 * Load `page_content` overrides for a locale as `{ key: value }`.
 *
 * Returns `{}` (and never throws) when the DB is unconfigured or the query
 * fails, so callers can always fall back to the generated defaults.
 */
export async function loadOverrides(
  locale: "ko" | "en",
  keys?: string[],
): Promise<Record<string, string>> {
  const prisma = getPrisma();
  if (!prisma) return {};

  try {
    const rows = await prisma.pageContent.findMany({
      where: {
        locale,
        ...(keys && keys.length > 0 ? { key: { in: keys } } : {}),
      },
      select: { key: true, value: true },
    });

    const overrides: Record<string, string> = {};
    for (const row of rows) overrides[row.key] = row.value;
    return overrides;
  } catch (error) {
    warnOnce(error);
    return {};
  }
}
