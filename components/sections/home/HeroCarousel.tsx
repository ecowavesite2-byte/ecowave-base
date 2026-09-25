"use client";

import { useEffect, useState } from "react";
import RichText from "@/components/ui/RichText";

export type HeroSlide = { bg: string | null; bgColor: string | null; html: string };

/**
 * Full-screen hero carousel (imweb visual_section) with auto-fade slides.
 * Desktop fills the viewport; the original mobile visual section is a fixed
 * 356px band at 390px (measured), so the section height is per-breakpoint.
 * Since the single-source migration there is ONE slide list (the canonical
 * desktop set); it renders at every width, with the display type downscaled
 * below 992 by the `.hero-carousel` rule in `app/globals.css` (85/75/72 -> 26,
 * 24 -> 16) and the desktop image cropped into the 356px band.
 *
 * The `.hero-slide.is-active` hook (see `app/globals.css`) drives the desktop
 * text entrance (`visualAnimation` on `.font1`/`.font2`). The class is toggled
 * by `idx`, so it is removed and re-added on every slide change — which restarts
 * the CSS animation, reproducing the original's re-run on each change and on
 * first load. The whole block is `min-width:992px` scoped (the original's rule
 * is on the desktop hero section id), so the mobile hero stays animation-free.
 */
export default function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (slides.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % slides.length), 6000);
    return () => clearInterval(t);
  }, [slides.length]);

  return (
    <section className="hero-carousel relative h-[356px] w-full overflow-hidden min-[992px]:h-[100svh] min-[992px]:min-h-[560px]">
      {slides.map((s, i) => (
        <div
          key={i}
          className={`hero-slide absolute inset-0 transition-opacity duration-700 ease-[ease] ${
            i === idx ? "is-active opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          {s.bgColor && <div className="absolute inset-0" style={{ backgroundColor: s.bgColor }} aria-hidden />}
          {s.bg && (
            <div
              // item 6 — the authored mobile band crops the desktop image; nudge
              // the cover position above the vertical centre at mobile so the
              // subject is not clipped out of the short 356px band. Desktop keeps
              // the measured `center` framing.
              className="absolute inset-0 bg-cover bg-[center_38%] min-[992px]:bg-center"
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
