"use client";

import { useEffect, useState } from "react";
import RichText from "@/components/ui/RichText";

export type HeroSlide = { bg: string | null; bgColor: string | null; html: string };

/**
 * Full-screen hero carousel (imweb visual_section) with auto-fade slides.
 * Desktop fills the viewport; the original mobile visual section is a fixed
 * 356px band at 390px (measured), so the section height is per-breakpoint.
 * The crawl holds separate desktop + mobile visual sections — slides are
 * paired by index and each layer only renders on its breakpoint, so mobile
 * shows the 26px mobile copy and desktop the 85px copy.
 */
export default function HeroCarousel({
  slides,
  mobileSlides = [],
}: {
  slides: HeroSlide[];
  mobileSlides?: HeroSlide[];
}) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (slides.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % slides.length), 6000);
    return () => clearInterval(t);
  }, [slides.length]);

  const layers: { cls: string; items: HeroSlide[] }[] = [
    { cls: "hidden min-[992px]:block", items: slides },
    {
      cls: "min-[992px]:hidden",
      items: slides.map((s, i) => mobileSlides[i] || s),
    },
  ];

  return (
    <section className="relative h-[356px] w-full overflow-hidden min-[992px]:h-[100svh] min-[992px]:min-h-[560px]">
      {layers.map((layer) => (
        <div key={layer.cls} className={`absolute inset-0 ${layer.cls}`}>
          {layer.items.map((s, i) => (
            <div
              key={i}
              className={`absolute inset-0 transition-opacity duration-1000 ${i === idx ? "opacity-100" : "pointer-events-none opacity-0"}`}
            >
              {s.bgColor && <div className="absolute inset-0" style={{ backgroundColor: s.bgColor }} aria-hidden />}
              {s.bg && (
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: `url(${s.bg})` }}
                  aria-hidden
                />
              )}
              {/* slide dim overlay, matches the original .op layer */}
              <div className="absolute inset-0" style={{ backgroundColor: "rgba(0,0,0,0.19)" }} aria-hidden />
              <div className="relative flex h-full items-start justify-center px-6 pt-[87px] min-[992px]:items-center min-[992px]:pt-[88px]">
                <RichText
                  html={s.html}
                  className="max-w-[1200px] text-center [&_p]:text-center [&_p]:text-white [&_span]:text-white [&_strong]:text-white [&_h6_span]:!text-white [&_h6]:text-white"
                />
              </div>
            </div>
          ))}
        </div>
      ))}
      {slides.length > 1 && (
        <div className="absolute bottom-[27px] left-1/2 z-10 flex -translate-x-1/2">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIdx(i)}
              aria-label={`슬라이드 ${i + 1}`}
              className="flex h-[12px] w-[39px] items-center justify-center"
            >
              <span
                className={`h-[2px] w-[25px] bg-white transition-opacity ${i === idx ? "opacity-100" : "opacity-50"}`}
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
