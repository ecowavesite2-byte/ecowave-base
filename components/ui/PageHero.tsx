import Link from "next/link";

export type HeroTab = { label: string; href: string; active?: boolean };

/**
 * Subpage hero: white band with the big page title on the left and the
 * section's sibling-page tabs on the right (imweb menu_title + sub_menu).
 */
export default function PageHero({
  title,
  tabs = [],
  big = false,
}: {
  title: string;
  tabs?: HeroTab[];
  big?: boolean;
}) {
  return (
    <section className="bg-white pt-[105px]">
      <div className="mx-auto flex h-[210px] max-w-[1440px] flex-col justify-center px-5 pb-10 pt-6 lg:h-[210px] lg:flex-row lg:items-end lg:justify-between lg:px-10">
        <h1 className={`font-bold leading-[1.25] tracking-[-0.02em] text-ink ${big ? "text-[40px] lg:text-[72px]" : "text-[38px] lg:text-[65px]"}`}>
          {title}
        </h1>
        {tabs.length > 0 && (
          <nav className="mt-4 lg:mt-0 lg:pb-3" aria-label="섹션 메뉴">
            <ul className="flex flex-wrap gap-x-7 gap-y-2">
              {tabs.map((t) => (
                <li key={t.href + t.label}>
                  <Link
                    href={t.href}
                    className={`inline-block border-b-2 pb-1.5 text-[16px] lg:text-[18px] transition-colors ${
                      t.active ? "border-accent font-semibold text-ink" : "border-transparent text-[rgba(54,54,54,0.7)] hover:text-ink"
                    }`}
                  >
                    {t.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </section>
  );
}
