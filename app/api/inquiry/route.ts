import { z } from "zod";
import { getPrisma } from "@/lib/content/db";

export const runtime = "nodejs";

/**
 * Public inquiry (contact form) intake.
 *
 * POST a JSON body → zod-validate → persist an `Inquiry` row. The form is a
 * static client rebuild with no server action, so this route is its only writer
 * and carries no auth guard. Checkbox groups arrive as string arrays; the
 * attachment is recorded by file NAME only (no binary upload).
 */

const LOCALES = ["ko", "en"] as const;

/** Reject oversized payloads before JSON.parse (public, unauthenticated route). */
const MAX_BODY_BYTES = 100_000;

/** Per-field caps keep a public write path from persisting unbounded blobs. */
const InquirySchema = z.object({
  company: z.string().trim().min(1).max(200),
  contact: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(1).max(50),
  email: z.string().trim().email().max(254),
  address: z.string().trim().max(500).optional(),
  products: z.array(z.string().max(100)).max(20).optional(),
  productsEtc: z.string().trim().max(200).optional(),
  oem: z.array(z.string().max(100)).max(20).optional(),
  message: z.string().trim().max(5000).optional(),
  fileName: z.string().trim().max(255).optional(),
  locale: z.enum(LOCALES).optional(),
  // the consent checkbox is required on the client; validate it here too so a
  // stored row always reflects a real user action (never a hard-coded true)
  consent: z.literal(true),
});

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return jsonError("Payload too large", 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const parsed = InquirySchema.safeParse(body);
  if (!parsed.success) {
    // log details server-side; never echo paths/messages back to a public client
    console.warn("[api/inquiry] rejected payload", parsed.error.issues);
    return jsonError("Invalid request", 400);
  }

  const data = parsed.data;

  try {
    const prisma = getPrisma();
    if (!prisma) throw new Error("DATABASE_URL is not configured");
    await prisma.inquiry.create({
      data: {
        locale: data.locale ?? "ko",
        company: data.company,
        contact: data.contact,
        phone: data.phone,
        email: data.email,
        address: data.address || null,
        products: data.products ?? [],
        productsEtc: data.productsEtc || null,
        oem: data.oem ?? [],
        message: data.message || null,
        fileName: data.fileName || null,
        consent: data.consent,
        status: "new",
      },
    });
  } catch (error) {
    console.error("[api/inquiry] failed to save inquiry", error);
    return jsonError("Failed to save inquiry", 500);
  }

  return Response.json({ ok: true });
}
