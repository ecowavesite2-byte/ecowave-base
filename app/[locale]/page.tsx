import Link from "next/link";
import HeroCarousel from "@/components/sections/home/HeroCarousel";
import RichText from "@/components/ui/RichText";
import Reveal from "@/components/ui/Reveal";
import SectionRenderer from "@/components/content/SectionRenderer";
import { getPage, getBoard } from "@/lib/content";
import { isLocale, defaultLocale, localeHref, type Locale } from "@/lib/i18n";
import type { PageContent, Section, WidgetNode } from "@/lib/types";

const FOOTER_SECTION_ID = "s20250811f489e3443bdbe";
const TICKER_SECTION_ID = "s2025081139ff276cae8d6";

function widgetsOf(sec: Section): WidgetNode[] {
  const out: WidgetNode[] = [];
  (function ws(rows: Section["rows"]) {
    rows.forEach((r) => {
      if (r.kind === "widget") out.push(r);
      if (r.kind === "row") r.cols.forEach((c) => ws(c.children));
    });
  })(sec.rows);
  return out;
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const l = isLocale(locale) ? locale : defaultLocale;
  const page: PageContent = getPage(l, "home");
  const news = getBoard(l, "news");

  const desktop = page.sections.filter((s) => !/mobile_section/.test(s.cls || ""));
  const heroSec = desktop.find((s) => s.visual);
  const tickerSec = desktop.find((s) => s.id === TICKER_SECTION_ID);
  const rest = desktop.filter((s) => !s.visual && s.id !== TICKER_SECTION_ID && s.id !== FOOTER_SECTION_ID);

  return (
    <main>
      {/* hero */}
      {heroSec?.visual && <HeroCarousel slides={heroSec.visual} />}

      {/* all content sections from the crawl (row widths, hover cards, reveal anims) */}
      <SectionRenderer sections={rest} locale={l} />

      {/* notice ticker */}
      {tickerSec && (
        <section className="relative bg-soft">
          <div className="mx-auto max-w-[1070px] px-[15px] py-24 lg:py-28">
            <div className="flex items-end justify-between">
              <Reveal>
                <div>
                  {widgetsOf(tickerSec)
                    .filter((w) => w.type === "text")
                    .map((w, i) => (
                      <RichText key={i} html={w.html} />
                    ))}
                </div>
              </Reveal>
              <Reveal anim="Left" className="hidden lg:block">
                <Link
                  href={localeHref(l, "/news")}
                  className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[#ddd] px-6 py-3 text-[14px] text-body transition-colors hover:border-accent hover:text-accent"
                >
                  {l === "ko" ? "더보기" : "More"}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </Link>
              </Reveal>
            </div>
            <div className="mt-10 grid grid-cols-1 gap-[15px] sm:grid-cols-2 lg:grid-cols-4">
              {news.posts.slice(0, 4).map((p, i) => (
                <Reveal key={p.idx} delay={i * 0.12}>
                  <Link href={localeHref(l, `/news/${p.idx}`)} className="group block">
                    <div className="relative h-[150px] w-full overflow-hidden bg-white lg:h-[183px]">
                      {p.thumb && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.thumb} alt={p.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
                      )}
                    </div>
                    <div className="bg-white p-4">
                      <h3 className="truncate text-[15px] font-semibold text-ink transition-colors hover:text-accent">{p.title}</h3>
                      {p.excerpt && <p className="mt-1.5 line-clamp-1 text-[13px] text-muted">{p.excerpt}</p>}
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
