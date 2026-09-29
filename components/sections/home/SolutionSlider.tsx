"use client";

import { useEffect, useRef, useState } from "react";

export type SolutionSlide = { img: string; title: string; lines: string[] };

/**
 * Home §생활환경 솔루션 mobile carousel (≤991 only; the caller hides it at ≥992
 * and shows the authored pc composition).
 *
 * The original mobile twin (`s20250911db56ac49110f4`) is an owl carousel showing
 * exactly ONE full-width slide per view (image + left-aligned heading + up to 3
 * body lines) with a 3-dash `paging_type_line` pager. The previous build reused
 * `GallerySlider`, whose native `overflow-x:auto` strip is shifted by Chromium's
 * beyond-viewport full-page capture, leaving the strip mid-slide and exposing
 * two clipped columns in the audit screenshot. This deck is transform-driven
 * instead: no horizontal scroll container, so exactly one slide is ever visible.
 *
 * Geometry mirrors the original (measured at 390): section 567.39 =
 * 7.5 top band + item (2.5 pad + 360 image + 122.4 caption + 2.5 pad) + 18
 * container padding + 54.5 tail; the dash row is `absolute bottom-0` of the
 * 18px-padded container (the original dot bottom sits 512.89 from the section
 * top). Dots use the same measured geometry as `GallerySlider`: a 32×12 button
 * with a 24×2 bar.
 */
export default function SolutionSlider({
  slides,
  autoplayMs = 5000,
}: {
  slides: SolutionSlide[];
  /** owl `auto_change` interval (the original twin autoplays one slide / 5s) */
  autoplayMs?: number;
}) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;
  const activeRef = useRef(0);
  activeRef.current = active;

  useEffect(() => {
    if (!autoplayMs || count <= 1) return;
    if (paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setActive((a) => (a + 1) % count), autoplayMs);
    return () => clearInterval(t);
  }, [autoplayMs, count, paused]);

  if (count === 0) return null;

  return (
    <div
      className="relative min-[992px]:hidden"
      data-home-solutions="1"
      data-gs="home-solutions"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="mx-[15px] pt-[7.5px] pb-[54.5px]">
        {/* -2.5px bleed + 2.5px item padding keep the image at the authored 360px */}
        <div className="relative -mx-[2.5px] pb-[18px]">
          <div className="overflow-hidden">
            <div
              className="flex"
              style={{ transform: `translateX(-${active * 100}%)`, transition: "transform 0.2s ease" }}
            >
              {slides.map((s, i) => (
                <figure key={i} className="w-full shrink-0 p-[2.5px]" aria-hidden={i !== active}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.img} alt="" className="aspect-square w-full object-cover" loading="lazy" />
                  <figcaption className="px-[10px] pt-[6px] pb-[14px]">
                    {s.title && <p className="text-[19px] font-bold leading-[30.4px] text-black">{s.title}</p>}
                    {s.lines.length > 0 && (
                      <p className="text-[15px] leading-[24px] text-body">{s.lines.join(" ")}</p>
                    )}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
          {count > 1 && (
            <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-center">
              {slides.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`${i + 1}`}
                  aria-current={i === active ? "true" : undefined}
                  onClick={() => setActive(i)}
                  className={`flex h-[12px] w-[32px] cursor-pointer items-center justify-center ${
                    i === active ? "opacity-100" : "opacity-50"
                  }`}
                >
                  <span className="h-[2px] w-[24px] bg-[#363636]" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
