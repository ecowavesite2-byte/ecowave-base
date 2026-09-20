import crypto from "node:crypto";
import { redirect } from "next/navigation";
import type { IronSession } from "iron-session";
import { getSession, type SessionData } from "./session";

/**
 * Authoritative auth boundary. Middleware does NOT protect /admin, so every
 * server component and route handler must go through this module.
 */

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const BASE_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes after the 5th failure
const MAX_LOCKOUT_MS = 24 * 60 * 60 * 1000; // 24h cap on exponential lockout

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

export function checkRateLimit(ip: string): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const entry = rateStore.get(ip);
  if (!entry) return { allowed: true, retryAfterMs: 0 };
  if (entry.lockedUntil > now) {
    return { allowed: false, retryAfterMs: entry.lockedUntil - now };
  }
  if (now - entry.windowStart > WINDOW_MS) {
    rateStore.delete(ip);
    return { allowed: true, retryAfterMs: 0 };
  }
  return { allowed: true, retryAfterMs: 0 };
}

export function recordFailure(ip: string): void {
  const now = Date.now();
  const existing = rateStore.get(ip);
  const expired =
    existing !== undefined &&
    (now - existing.windowStart > WINDOW_MS ||
      (existing.lockedUntil !== 0 && existing.lockedUntil <= now));

  const entry: RateEntry =
    existing === undefined || expired
      ? { count: 0, windowStart: now, lockedUntil: 0 }
      : existing;

  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    const over = entry.count - MAX_ATTEMPTS;
    entry.lockedUntil = now + Math.min(BASE_LOCKOUT_MS * 2 ** over, MAX_LOCKOUT_MS);
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
