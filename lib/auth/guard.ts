import crypto from "node:crypto";
import { redirect } from "next/navigation";
import type { IronSession } from "iron-session";
import { getSession, type SessionData } from "./session";

/**
 * Authoritative auth boundary. Middleware does NOT protect /admin, so every
 * server component and route handler must go through this module.
 */

/**
 * Login throttling. `ADMIN_LOGIN_MAX_FAILS` (default 5) and
 * `ADMIN_LOGIN_WINDOW_MIN` (default 15, also the base lockout) are env-tunable;
 * the lockout grows exponentially per extra failure, capped at 24h.
 */
const DEFAULT_MAX_FAILS = 5;
const DEFAULT_WINDOW_MIN = 15;
const MAX_LOCKOUT_MS = 24 * 60 * 60 * 1000; // 24h cap on the exponential lockout

function maxFails(): number {
  const raw = Number(process.env.ADMIN_LOGIN_MAX_FAILS);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : DEFAULT_MAX_FAILS;
}

function windowMs(): number {
  const raw = Number(process.env.ADMIN_LOGIN_WINDOW_MIN);
  const minutes = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_WINDOW_MIN;
  return minutes * 60 * 1000;
}

type RateEntry = {
  count: number;
  windowStart: number;
  lockedUntil: number;
};

/** In-memory, dependency-free. Resets on server restart (acceptable for a single admin). */
const rateStore = new Map<string, RateEntry>();

/** Client IP for throttling; behind a proxy prefer the first x-forwarded-for hop. */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return "local";
}

let lastSweep = 0;

/** Drop entries whose window elapsed and that are not currently locked out. */
function sweepStale(now: number): void {
  const window = windowMs();
  if (now - lastSweep < window) return;
  lastSweep = now;
  for (const [ip, entry] of rateStore) {
    if (entry.lockedUntil <= now && now - entry.windowStart > window) rateStore.delete(ip);
  }
}

export function checkRateLimit(ip: string): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  sweepStale(now);
  const entry = rateStore.get(ip);
  if (!entry) return { allowed: true, retryAfterMs: 0 };
  if (entry.lockedUntil > now) {
    return { allowed: false, retryAfterMs: entry.lockedUntil - now };
  }
  if (now - entry.windowStart > windowMs()) {
    rateStore.delete(ip);
    return { allowed: true, retryAfterMs: 0 };
  }
  return { allowed: true, retryAfterMs: 0 };
}

export function recordFailure(ip: string): void {
  const now = Date.now();
  sweepStale(now);
  const window = windowMs();
  const max = maxFails();
  const existing = rateStore.get(ip);
  const expired =
    existing !== undefined &&
    (now - existing.windowStart > window ||
      (existing.lockedUntil !== 0 && existing.lockedUntil <= now));

  const entry: RateEntry =
    existing === undefined || expired
      ? { count: 0, windowStart: now, lockedUntil: 0 }
      : existing;

  entry.count += 1;
  if (entry.count >= max) {
    const over = entry.count - max;
    entry.lockedUntil = now + Math.min(window * 2 ** over, MAX_LOCKOUT_MS);
  }
  rateStore.set(ip, entry);
}

export function resetRateLimit(ip: string): void {
  rateStore.delete(ip);
}

/**
 * CSRF guard for mutations: the Origin header host must equal the request host.
 * Missing/unparseable Origin is rejected (browser same-origin POST always sends it).
 */
export function assertSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }

  const hostHeader = req.headers.get("host");
  let requestHost: string;
  if (hostHeader) {
    requestHost = hostHeader;
  } else {
    try {
      requestHost = new URL(req.url).host;
    } catch {
      return false;
    }
  }

  return originHost.toLowerCase() === requestHost.toLowerCase();
}

/**
 * Constant-time credential check. If any credential env var is unset the
 * function always returns false — there are no default credentials.
 */
export function verifyCredentials(email: string, password: string): boolean {
  const expectedEmail = process.env.ADMIN_EMAIL;
  const hashHex = process.env.ADMIN_PASSWORD_HASH;
  const saltHex = process.env.ADMIN_PASSWORD_SALT;
  if (!expectedEmail || !hashHex || !saltHex) return false;

  const expectedHash = Buffer.from(hashHex, "hex");
  const salt = Buffer.from(saltHex, "hex");
  if (expectedHash.length !== 64 || salt.length === 0) return false;

  // Always hash (even on email mismatch) so failure timing does not leak the email.
  const actual = crypto.scryptSync(password ?? "", salt, 64);
  const passwordOk = crypto.timingSafeEqual(actual, expectedHash);
  const emailOk = email.trim().toLowerCase() === expectedEmail.trim().toLowerCase();
  return emailOk && passwordOk;
}

/** A session proven to have an `admin` payload (requireAdmin's return type). */
export type AdminSession = IronSession<SessionData> & {
  admin: NonNullable<SessionData["admin"]>;
};

/** Server component guard: redirects unauthenticated visitors to the login page. */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await getSession();
  if (!session.admin) {
    redirect("/admin/login");
  }
  return session as AdminSession;
}

/** Route handler guard: returns `{ session }` or `null` (caller responds 401). */
export async function requireAdminApi(
  req: Request,
): Promise<{ session: IronSession<SessionData> } | null> {
  void req;
  const session = await getSession();
  if (!session.admin) return null;
  return { session };
}
