import { cookies } from "next/headers";
import { getIronSession, type IronSession, type SessionOptions } from "iron-session";

/**
 * iron-session config for the single-admin dashboard.
 *
 * The cookie is the only auth state: signed + encrypted (iron-session), httpOnly,
 * SameSite=Strict, Secure in production. `SESSION_SECRET` must be >= 32 chars.
 */
export interface SessionData {
  admin?: {
    email: string;
    loggedInAt: number;
  };
}

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET ?? "",
  cookieName: "ecowave_admin",
  ttl: THIRTY_DAYS_SECONDS,
  cookieOptions: {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  },
};

/**
 * Fail closed when the auth env is incomplete. Logs + throws a readable
 * server-side error instead of ever defaulting to a known credential.
 */
export function assertAuthConfigured(): void {
  const problems: string[] = [];
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    problems.push("SESSION_SECRET is not set");
  } else if (secret.length < 32) {
    problems.push("SESSION_SECRET must be at least 32 characters");
  }
  if (!process.env.ADMIN_EMAIL) problems.push("ADMIN_EMAIL is not set");
  if (!process.env.ADMIN_PASSWORD_HASH) problems.push("ADMIN_PASSWORD_HASH is not set");
  if (!process.env.ADMIN_PASSWORD_SALT) problems.push("ADMIN_PASSWORD_SALT is not set");

  if (problems.length > 0) {
    const message =
      `Admin auth is not configured (${problems.join("; ")}). ` +
      "Refusing to authenticate — set the admin env vars in .env.local (see .env.example).";
    console.error(`[admin-auth] ${message}`);
    throw new Error(message);
  }
}

/** Read the current admin session from the async Next 15 cookie store. */
export async function getSession(): Promise<IronSession<SessionData>> {
  assertAuthConfigured();
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}
