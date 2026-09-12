"use client";

import { useEffect, useState } from "react";
import RichText from "@/components/ui/RichText";

export type HeroSlide = { bg: string | null; bgColor: string | null; html: string };

/** Full-screen hero carousel (imweb visual_section) with auto-fade slides. */
export default function HeroCarousel({ slides }: { slides: { bg: string | null; bgColor: string | null; html: string }[] }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (slides.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % slides.length), 6000);
    return () => clearInterval(t);
  }, [slides.length]);

  return (
    <section className="relative h-[100svh] min-h-[560px] w-full overflow-hidden">
      {slides.map((s, i) => (
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
          <div className="relative flex h-full items-center justify-center px-6 pt-[88px]">
            <RichText html={s.html} className="max-w-[1200px] text-center [&_p]:text-center [&_span]:text-white [&_strong]:text-white [&_h6_span]:!text-white [&_h6]:text-white" />
          </div>
        </div>
      ))}
      {slides.length > 1 && (
        <div className="absolute bottom-[26px] left-1/2 z-10 flex -translate-x-1/2">
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
