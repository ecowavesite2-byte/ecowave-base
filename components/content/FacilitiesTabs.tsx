"use client";

import { useState } from "react";

export type FacilitiesTab = { id: string; name: string; images: string[] };

/**
 * Facilities tab gallery (rnd/facilities).
 *
 * Replaces the raw imweb `code` widget, whose three tab panes all rendered
 * because the original `.tab-content{display:none}` + `.active{display:block}`
 * CSS and the `.img_rendering.grid_01` gallery grid never existed locally.
 * Only one pane is mounted at a time.
 *
 * Geometry mirrors the live original: three pill tabs 250x51 (15px gap,
 * centred) and a 5-column x 2-row image grid, 1250px wide, 234x349 cells
 * with 20px gaps. Below 992px the grid drops to 2 columns with ~347px cells
 * (mobile original), still one pane at a time.
 */
export default function FacilitiesTabs({ tabs }: { tabs: FacilitiesTab[] }) {
  const [active, setActive] = useState(0);
  if (tabs.length === 0) return null;
  const current = tabs[Math.min(active, tabs.length - 1)];

  return (
    <div className="w-full">
      <div className="flex flex-wrap justify-center gap-[15px]">
        {tabs.map((t, i) => {
          const isActive = i === active;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActive(i)}
              aria-pressed={isActive}
              className={`h-[51px] w-[250px] rounded-full border border-accent text-[18px] transition-colors ${
                isActive
                  ? "bg-accent text-white"
                  : "bg-[#F9F9F9] text-accent hover:bg-white"
              }`}
            >
              {t.name}
            </button>
          );
        })}
      </div>

      <div className="mx-auto mb-[16px] mt-[69px] grid max-w-[1250px] grid-cols-2 gap-5 px-5 py-[10px] min-[992px]:grid-cols-5 min-[992px]:px-0">
        {current.images.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${current.id}-${i}`}
            src={src}
            alt=""
            loading="lazy"
            className="h-auto w-full object-cover min-[992px]:h-[349px]"
          />
        ))}
      </div>
    </div>
  );
}
