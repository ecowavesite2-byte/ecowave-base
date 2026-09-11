import Link from "next/link";
import HeroCarousel from "@/components/sections/home/HeroCarousel";
import RichText from "@/components/ui/RichText";
import SectionRenderer from "@/components/content/SectionRenderer";
import { getPage, getBoard } from "@/lib/content";
import { isLocale, defaultLocale, localeHref, type Locale } from "@/lib/i18n";
import type { PageContent, Section, WidgetNode } from "@/lib/types";

const FOOTER_SECTION_ID = "s20250811f489e3443bdbe";

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

const texts = (sec: Section) => widgetsOf(sec).filter((w) => w.type === "text");
const images = (sec: Section) =>
  widgetsOf(sec).filter((w) => w.type === "image");

const QUICK_LINKS = [
  {
    label: { ko: "Company", en: "Company" },
    title: { ko: "회사소개", en: "Company" },
    route: "/company",
    img: "/images/thumbnail/20250811/c3512c9a0cd58.jpg",
  },
  {
    label: { ko: "R&D", en: "R&D" },
    title: { ko: "연구개발", en: "R&D" },
    route: "/rnd",
    img: "/images/thumbnail/20250811/e67827527be17.jpg",
  },
  {
    label: { ko: "Products", en: "Products" },
    title: { ko: "제품소개", en: "Products" },
    route: "/products",
    img: "/images/thumbnail/20250811/49a097a7d0ffc.jpg",
  },
  {
    label: { ko: "PR Center", en: "PR Center" },
    title: { ko: "홍보센터", en: "PR Center" },
    route: "/notices",
    img: "/images/thumbnail/20250811/bd400cb7e2ba9.jpg",
  },
];

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const l = isLocale(locale) ? locale : defaultLocale;
  const page: PageContent = getPage(l, "home");

  const desktop = page.sections.filter(
    (s) => !/mobile_section/.test(s.cls || ""),
  );
  const heroSec = desktop.find((s) => s.visual);
  const rest = desktop.filter((s) => !s.visual && s.id !== FOOTER_SECTION_ID);

  const visionSec = rest.find((s) => s.id === "s20250811004ea868d7376"); // heading + quick links
  const bannerSec = rest.find((s) => s.id === "s202508116d15f8202cd82"); // bg banner
  const pillarsHeadingSec = rest.find((s) => s.id === "s20250811611f0c372c57a"); // 친환경 기술혁신
  const pillarsSec = rest.find((s) => s.id === "s20250811e48a3b857667a"); // 3 pillars
  const ctaSec = rest.find((s) => s.id === "s20250811b220484e22b98"); // CTA video
  const globalSec = rest.find((s) => s.id === "s202508112787439deffdb"); // global map
  const tickerSec = rest.find((s) => s.id === "s2025081139ff276cae8d6"); // notice ticker
  const other = rest.filter(
    (s) =>
      ![
        visionSec?.id,
        bannerSec?.id,
        pillarsHeadingSec?.id,
        pillarsSec?.id,
        ctaSec?.id,
        globalSec?.id,
        tickerSec?.id,
      ].includes(s.id),
  );

  const news = getBoard(l, "news");

  return (
    <main>
      {/* hero */}
      {heroSec?.visual && <HeroCarousel slides={heroSec.visual} />}

      {/* vision + quick links */}
      {visionSec && (
        <section className="relative">
          <div className="mx-auto max-w-[1440px] px-5 pt-24 pb-16 text-center lg:px-10 lg:pt-28">
            {widgetsOf(visionSec)
              .filter((w) => w.type === "text")
              .map((w, i) => (
                <RichText key={i} html={w.html} />
              ))}
            <div className="mt-14 grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-[15px]">
              {QUICK_LINKS.map((q) => (
                <Link
                  key={q.route}
                  href={localeHref(l, q.route)}
                  className="group relative block h-[200px] overflow-hidden lg:h-[319px]"
                >
                  <div
                    className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                    style={{ backgroundImage: `url(${q.img})` }}
                    aria-hidden
                  />
                  <div
                    className="absolute inset-0 bg-black/25 transition-colors duration-300 group-hover:bg-black/40"
                    aria-hidden
                  />
                  <div className="absolute inset-0 flex flex-col items-start justify-end p-6 text-left">
                    <p className="text-[13px] font-medium tracking-wide text-white/85 lg:text-[15px]">
                      {q.label[l]}
                    </p>
                    <h3 className="mt-1 text-[20px] font-bold text-white lg:text-[25px]">
                      {q.title[l]}
                    </h3>
                    <span className="mt-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/50 text-white/90 transition-colors group-hover:bg-white group-hover:text-ink">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* generic crawled sections (banner, pillars heading, pillars, CTA, global) */}
      <SectionRenderer
        sections={[
          ...(bannerSec ? [bannerSec] : []),
          ...(pillarsHeadingSec ? [pillarsHeadingSec] : []),
          ...(pillarsSec ? [pillarsSec] : []),
          ...(ctaSec ? [ctaSec] : []),
          ...(globalSec ? [globalSec] : []),
        ]}
      />

      {/* notice ticker */}
      {tickerSec && (
        <section className="bg-soft">
          <div className="mx-auto max-w-[1440px] px-5 py-24 lg:px-10 lg:py-28">
            <div className="flex items-end justify-between">
              <div>
                <RichText
                  html={
                    widgetsOf(tickerSec).find((w) => w.type === "text")?.html
                  }
                />
              </div>
              <Link
                href={localeHref(l, "/news")}
                className="hidden shrink-0 items-center gap-2 rounded-full border border-[#ddd] px-6 py-3 text-[14px] text-body transition-colors hover:border-accent hover:text-accent lg:inline-flex"
              >
                {l === "ko" ? "더보기" : "More"}
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </Link>
            </div>
            <div className="mt-10 grid grid-cols-1 gap-[15px] sm:grid-cols-2 lg:grid-cols-4">
              {news.posts.slice(0, 4).map((p) => (
                <Link
                  key={p.idx}
                  href={localeHref(l, `/news/${p.idx}`)}
                  className="group block"
                >
                  <div className="relative h-[150px] w-full overflow-hidden bg-white lg:h-[183px]">
                    {p.thumb && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.thumb}
                        alt={p.title}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                    )}
                  </div>
                  <div className="bg-white p-4">
                    <h3 className="truncate text-[15px] font-semibold text-ink transition-colors hover:text-accent">
                      {p.title}
                    </h3>
                    {p.excerpt && (
                      <p className="mt-1.5 line-clamp-1 text-[13px] text-muted">
                        {p.excerpt}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* anything else crawled (hidden/empty sections) */}
      <SectionRenderer sections={other} />
    </main>
  );
}
