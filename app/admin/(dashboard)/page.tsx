import Link from "next/link";

export const metadata = { title: "Dashboard" };

const CARDS = [
  {
    href: "/admin/content",
    title: "Content",
    body: "Edit site text and images, in Korean and English.",
  },
  {
    href: "/admin/boards",
    title: "Boards",
    body: "Manage news, notices, and product posts.",
  },
];

export default function AdminDashboardPage() {
  return (
    <div className="mx-auto max-w-[960px] p-8">
      <h1 className="text-[26px] font-bold tracking-tight text-ink">ECOWAVE Admin</h1>
      <p className="mt-1 text-[15px] text-[#6b7280]">
        Manage content and boards for the ECOWAVE site.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
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
