import { getSession } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/auth/guard";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!assertSameOrigin(req)) {
    return Response.json({ error: "Cross-origin request rejected" }, { status: 403 });
  }

  const session = await getSession();
  session.destroy();
  return Response.json({ ok: true });
}
