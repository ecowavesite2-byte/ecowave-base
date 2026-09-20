import Link from "next/link";

export const metadata = { title: "Dashboard" };

const CARDS = [
  {
    href: "/admin/pages",
    title: "Pages",
    body: "Edit text and images on all 19 pages, in Korean and English.",
  },
  {
    href: "/admin/boards",
    title: "Boards",
    body: "Manage news, notices, and product posts.",
  },
  {
    href: "/admin/media",
    title: "Media",
    body: "Browse and search the image library.",
  },
];

export default function AdminDashboardPage() {
  return (
    <div className="mx-auto max-w-[960px] p-8">
      <h1 className="text-[26px] font-bold tracking-tight text-ink">ECOWAVE Admin</h1>
      <p className="mt-1 text-[15px] text-[#6b7280]">
        Manage pages, boards, and media for the ECOWAVE site.
      </p>

      <div className="mt-8 rounded-xl border border-dashed border-line bg-white p-8 text-center">
        <p className="text-[16px] font-semibold text-ink">Continue editing — coming soon</p>
        <p className="mx-auto mt-2 max-w-[440px] text-[14px] leading-relaxed text-[#6b7280]">
          This is the Phase&nbsp;1 shell. The page, board, and media editors arrive in the next
          phases; the navigation below is already wired to their routes.
        </p>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group rounded-xl border border-line bg-white p-5 transition-colors hover:border-accent"
          >
            <span className="text-[15px] font-semibold text-ink transition-colors group-hover:text-accent">
              {card.title}
            </span>
            <span className="mt-1 block text-[13px] leading-relaxed text-[#6b7280]">
              {card.body}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
