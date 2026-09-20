"use client";

import { useEffect, useRef, useState } from "react";

/**
 * imweb-style scroll reveal: fades/slides content in the first time it
 * enters the viewport (data-widget-anim="fadeInUp" / "fadeIn").
 *
 * When the user agent prefers reduced motion, skip the IntersectionObserver
 * and render the final (visible) state immediately with no transition. This
 * matches the original site's forced end-state (its `wg_animated` widgets are
 * revealed) and keeps content visible instead of stuck at opacity:0.
 */
export default function Reveal({
  anim = "fadeInUp",
  duration = 0.7,
  delay = 0,
  className = "",
  children,
}: {
  anim?: string;
  duration?: number;
  delay?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReduced(true);
      setShown(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // animate.css from-states: fadeInUp translate3d(0,60%,0) is the default;
  // fadeIn is opacity-only; Left/Right slide a full viewport width.
  const from =
    anim === "fadeIn"
      ? "translateY(0)"
      : anim === "fadeInDown"
        ? "translateY(-100%)"
        : anim === "Left" || anim === "fadeInLeft"
          ? "translateX(-100%)"
          : anim === "Right" || anim === "fadeInRight"
            ? "translateX(100%)"
            : "translateY(60%)";

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0) translateX(0)" : from,
        transition: reduced
          ? "none"
          : `opacity ${duration}s ease ${delay}s, transform ${duration}s ease ${delay}s`,
        willChange: shown ? undefined : "opacity, transform",
      }}
    >
      {children}
    </div>
  );
}
