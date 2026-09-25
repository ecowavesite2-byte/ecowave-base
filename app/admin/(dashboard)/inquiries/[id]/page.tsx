import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { getAdminLocale } from "../../../_components/adminLocale";
import { getPrisma } from "@/lib/content/db";
import { adminDict } from "@/lib/admin/i18n";

export const metadata = { title: "Inquiry" };

/**
 * `/admin/inquiries/<id>` — one inquiry (public contact form), read-only.
 *
 * The (dashboard) layout already enforces `requireAdmin()`. An unknown id (or an
 * unconfigured database) renders 404.
 */
export default async function InquiryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const locale = await getAdminLocale();
  const t = adminDict[locale].inquiries;
  const prisma = getPrisma();

  const row = prisma
    ? await prisma.inquiry.findUnique({ where: { id } }).catch((error) => {
        console.warn("[admin] inquiry detail query failed", error);
        return null;
      })
    : null;
  if (!row) notFound();

  const fmt = new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const rows: { label: string; value: ReactNode }[] = [
    { label: t.detail.company, value: row.company },
    { label: t.detail.contact, value: row.contact },
    { label: t.detail.phone, value: row.phone },
    {
      label: t.detail.email,
      value: (
        <a href={`mailto:${row.email}`} className="text-accent hover:underline">
          {row.email}
        </a>
      ),
    },
    { label: t.detail.address, value: row.address },
    { label: t.detail.products, value: row.products.join(", ") },
    { label: t.detail.productsEtc, value: row.productsEtc },
    { label: t.detail.oem, value: row.oem.join(", ") },
    {
      label: t.detail.message,
      value: row.message ? <span className="whitespace-pre-wrap">{row.message}</span> : null,
    },
    { label: t.detail.consent, value: row.consent ? t.detail.yes : t.detail.no },
    { label: t.detail.locale, value: row.locale },
    { label: t.detail.file, value: row.fileName },
    { label: t.detail.status, value: row.status },
    { label: t.detail.createdAt, value: fmt.format(row.createdAt) },
  ];

  return (
    <div className="mx-auto max-w-[760px] p-8">
      <Link
        href="/admin/inquiries"
        className="text-[13px] text-muted underline-offset-4 transition-colors hover:text-accent hover:underline"
      >
        ← {t.backLabel}
      </Link>

      <h1 className="mt-3 text-[22px] font-bold tracking-tight text-ink">{row.company}</h1>
      <p className="mt-0.5 text-[13px] text-muted">
        {fmt.format(row.createdAt)} · {row.email}
      </p>

      <dl className="mt-6 divide-y divide-black/5 rounded-[4px] border border-black/10 bg-white px-5">
        {rows.map((r) => (
          <div key={r.label} className="py-3">
            <dt className="text-[12px] text-muted">{r.label}</dt>
            <dd className="mt-1 break-words text-[14px] text-ink">
              {r.value ? r.value : <span className="text-muted">{t.none}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
