import Link from "next/link";

import { getAdminLocale } from "../../_components/adminLocale";
import { getPrisma, isDbConfigured } from "@/lib/content/db";
import { adminDict } from "@/lib/admin/i18n";

export const metadata = { title: "Inquiries" };

type InquiryRow = {
  id: string;
  createdAt: Date;
  company: string;
  contact: string;
  phone: string;
  email: string;
  products: string[];
  oem: string[];
  fileName: string | null;
};

/**
 * `/admin/inquiries` — inquiry (public contact form) intake, newest first.
 *
 * Read-only; the (dashboard) layout already enforces `requireAdmin()`. With
 * `DATABASE_URL` unset the list stays empty and the graceful-degradation notice
 * is shown, matching `/admin`.
 */
export default async function InquiriesPage() {
  const locale = await getAdminLocale();
  const t = adminDict[locale].inquiries;
  const prisma = getPrisma();

  let rows: InquiryRow[] = [];
  if (prisma) {
    try {
      rows = await prisma.inquiry.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          createdAt: true,
          company: true,
          contact: true,
          phone: true,
          email: true,
          products: true,
          oem: true,
          fileName: true,
        },
      });
    } catch (error) {
      console.warn("[admin] inquiry list query failed", error);
    }
  }

  const fmt = new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const chip = "inline-block rounded-[3px] bg-soft px-2 py-0.5 text-[12px] text-body";

  return (
    <div className="mx-auto max-w-[1100px] p-8">
      <div className="min-w-0">
        <h1 className="text-[22px] font-bold tracking-tight text-ink">{t.title}</h1>
        <p className="mt-0.5 text-[13px] text-muted">{t.blurb}</p>
      </div>

      {!isDbConfigured() ? (
        <div
          role="status"
          className="mt-6 rounded-[4px] border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900"
        >
          {t.dbNotice}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="mt-6 rounded-[4px] border border-black/10 bg-white px-5 py-12 text-center text-[14px] text-muted">
          {t.empty}
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-[4px] border border-black/10 bg-white">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-black/10 text-[12px] text-muted">
                <th className="px-3 py-2 font-medium">{t.columns.received}</th>
                <th className="px-3 py-2 font-medium">{t.columns.company}</th>
                <th className="px-3 py-2 font-medium">{t.columns.contact}</th>
                <th className="px-3 py-2 font-medium">{t.columns.phone}</th>
                <th className="px-3 py-2 font-medium">{t.columns.email}</th>
                <th className="px-3 py-2 font-medium">{t.columns.products}</th>
                <th className="px-3 py-2 font-medium">{t.columns.file}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-black/5 align-top last:border-0 hover:bg-soft">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Link href={`/admin/inquiries/${row.id}`} className="text-accent hover:underline">
                      {fmt.format(row.createdAt)}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-medium text-ink">{row.company}</td>
                  <td className="px-3 py-2">{row.contact}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{row.phone}</td>
                  <td className="px-3 py-2">{row.email}</td>
                  <td className="px-3 py-2">
                    {row.products.length === 0 && row.oem.length === 0 ? (
                      <span className="text-muted">{t.none}</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {row.products.map((p) => (
                          <span key={`p-${p}`} className={chip}>
                            {p}
                          </span>
                        ))}
                        {row.oem.map((o) => (
                          <span key={`o-${o}`} className={chip}>
                            {o}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {row.fileName ? (
                      <span className="break-all">{row.fileName}</span>
                    ) : (
                      <span className="text-muted">{t.none}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
