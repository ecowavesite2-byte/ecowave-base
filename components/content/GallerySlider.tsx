"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** imweb owl `paging_type_line` pager caps out at five indicators */
const MAX_DOTS = 5;
const GAP = 5;

/**
 * D13: owl-carousel-style pager for the `layout:"slide"` galleries. Keeps the
 * native snap scroll strip but adds the measured `paging_type_line` dot row
 * (39x12 indicators) and round prev/next arrows; a dot jumps to its page and
 * the arrows step one item, mirroring the original owl behaviour measured on
 * company.about (`container_w20250918692bb854e97af` 2 dots,
 * `container_w20250918b0ab58de4000e` 5 dots + `custom_nav nav_round`).
 */
export default function GallerySlider({ count, children }: { count: number; children: ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const [perView, setPerView] = useState(1);
  const [active, setActive] = useState(0);

  const step = () => {
    const el = track.current;
    const first = el?.firstElementChild as HTMLElement | null | undefined;
    return first ? first.offsetWidth + GAP : el?.clientWidth || 1;
  };
  const dotCount = Math.min(MAX_DOTS, Math.max(1, Math.ceil(count / perView)));

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const measure = () => {
      const first = el.firstElementChild as HTMLElement | null;
      const s = first ? first.offsetWidth + GAP : el.clientWidth;
      setPerView(Math.max(1, Math.round(el.clientWidth / Math.max(s, 1))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [count]);

  const goTo = (page: number) => {
    const el = track.current;
    if (!el) return;
    const p = Math.max(0, Math.min(dotCount - 1, page));
    const target = el.children[p * perView] as HTMLElement | undefined;
    if (target) el.scrollTo({ left: target.offsetLeft - el.offsetLeft, behavior: "smooth" });
    setActive(p);
  };

  const nudge = (dir: -1 | 1) => {
    track.current?.scrollBy({ left: dir * step(), behavior: "smooth" });
  };

  const arrow =
    "pointer-events-auto flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-[#ddd] text-body transition duration-300 hover:border-accent hover:text-accent";

  return (
    <div className="relative">
      <div
        ref={track}
        onScroll={() => {
          const el = track.current;
          if (el) setActive(Math.min(dotCount - 1, Math.round(el.scrollLeft / Math.max(step() * perView, 1))));
        }}
        className="flex snap-x gap-[5px] overflow-x-auto"
      >
        {children}
      </div>
      {dotCount > 1 && (
        // MB2/D13: the original owl nav (`.owl-nav`/`.owl-dots`) is an absolute
        // overlay pinned to the bottom of the carousel, so it adds ZERO flow
        // height. Anchor the pager inside the gallery container instead of
        // `mt-5` in-flow (which was +54px desktop / +~40-130px mobile per
        // gallery). The container is `relative`; the strip itself is not, so
        // the pager is not clipped by the track's `overflow-x-auto`. Only the
        // controls take pointer events so the strip keeps its swipe target.
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center justify-center gap-5">
          <button type="button" aria-label="이전" onClick={() => nudge(-1)} className={arrow}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div className="flex items-center justify-center">
            {Array.from({ length: dotCount }, (_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`${i + 1}`}
                aria-current={i === active ? "true" : undefined}
                onClick={() => goTo(i)}
                className={`pointer-events-auto flex h-[12px] w-[39px] items-center justify-center ${
                  i === active ? "opacity-100" : "opacity-50"
                }`}
              >
                <span className="h-[2px] w-full bg-[#363636]" />
              </button>
            ))}
          </div>
          <button type="button" aria-label="다음" onClick={() => nudge(1)} className={arrow}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
