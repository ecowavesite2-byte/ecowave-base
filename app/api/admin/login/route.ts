import { getSession } from "@/lib/auth/session";
import {
  assertSameOrigin,
  checkRateLimit,
  clientIp,
  recordFailure,
  resetRateLimit,
  verifyCredentials,
} from "@/lib/auth/guard";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!assertSameOrigin(req)) {
    return Response.json({ error: "Cross-origin request rejected" }, { status: 403 });
  }

  const ip = clientIp(req);
  const limit = checkRateLimit(ip);
  if (!limit.allowed) {
    const retryAfterSeconds = Math.ceil(limit.retryAfterMs / 1000);
    return Response.json(
      { error: "Too many failed attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
    );
  }

  let payload: { email?: unknown; password?: unknown } = {};
  try {
    payload = (await req.json()) as { email?: unknown; password?: unknown };
  } catch {
    // fall through with empty credentials → 401
  }
  const email = typeof payload.email === "string" ? payload.email : "";
  const password = typeof payload.password === "string" ? payload.password : "";

  if (!verifyCredentials(email, password)) {
    recordFailure(ip);
    return Response.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const session = await getSession();
  session.admin = { email: email.trim().toLowerCase(), loggedInAt: Date.now() };
  await session.save();
  resetRateLimit(ip);
  return Response.json({ ok: true });
}
