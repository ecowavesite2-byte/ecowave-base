import path from "node:path";
import { config as dotenvConfig } from "dotenv";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 config (no `url` in prisma/schema.prisma).
 *
 * Mirrors the mcell pattern: env files are loaded here, then the datasource URL
 * is resolved from a `ECOWAVE_`-prefixed override first, falling back to the
 * plain name. Prefer the direct/unpooled connection for migrations.
 *
 * Deviation from the literal mcell expression: mcell falls back through
 * `env("DATABASE_URL")`, but `env()` throws when the variable is unset, which
 * makes `prisma generate` (and any schema-only command) impossible before a
 * database exists. `prefixed("DATABASE_URL")` already reads the plain name, so
 * the fallback is `directUrl ?? databaseUrl` — same precedence when set, no
 * throw when unset. Migration commands still fail later, as intended.
 */

dotenvConfig({ path: [".env.local", ".env.development.local"], quiet: true });

/** `ECOWAVE_<name>` wins over the bare `<name>` (lets one machine host several apps). */
function prefixed(name: string): string | undefined {
  return process.env[`ECOWAVE_${name}`] ?? process.env[name];
}

const directUrl =
  prefixed("DIRECT_URL_UNPOOLED") ??
  prefixed("DATABASE_URL_UNPOOLED") ??
  prefixed("DIRECT_URL");
const databaseUrl = prefixed("DATABASE_URL");

export default defineConfig({
  schema: path.posix.join("prisma", "schema.prisma"),
  migrations: {
    path: path.posix.join("prisma", "migrations"),
  },
  datasource: {
    url: directUrl ?? databaseUrl,
  },
});
