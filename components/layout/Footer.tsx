import Link from "next/link";
import Image from "next/image";
import { getSite } from "@/lib/content";
import { localeHref, type Locale } from "@/lib/i18n";
import { routeForSource } from "@/lib/routes";

export default function Footer({ locale }: { locale: Locale }) {
  const site = getSite(locale);
  const f = site.footer;
  return (
      <footer className="bg-black py-20 text-white">
      <div className="mx-auto max-w-[1440px] px-5 lg:px-10">
        <div className="flex flex-col gap-10 lg:flex-row lg:justify-between">
          <div>
            {f.logo && (
              <Image
                src={f.logo}
                alt="ECOWAVE"
                width={238}
                height={52}
                className="mb-7 h-[52px] w-auto brightness-0 invert"
              />
            )}
            <ul className="space-y-1.5 text-[14px] leading-[2] text-[#959595]">
              {f.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
              <li className="pt-2">{f.copyright}</li>
            </ul>
          </div>
          <div className="flex flex-col items-start gap-8 lg:items-end">
            <Link
              href="#"
              aria-label="맨 위로"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/25 text-white/70 transition-colors hover:border-white hover:text-white"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 15l-6-6-6 6" />
              </svg>
            </Link>
            <nav aria-label="사이트맵">
              <ul className="grid grid-cols-2 gap-x-12 gap-y-2 lg:grid-cols-5 lg:gap-x-8">
                {site.nav.map((item) => (
                  <li key={item.url}>
                    <Link
                      href={localeHref(locale, routeForSource(item.url))}
                      className="text-[14px] font-semibold text-white hover:text-accent"
                    >
                      {item.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>
      </div>
    </footer>
  );
}
