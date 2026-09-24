"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * imweb lightgallery image viewer (design/audit/viewer-spec.md §2/§3).
 *
 * Mounted once per public page tree. Renders nothing until a content image is
 * clicked, then portals the viewer overlay into <body> (no layout-affecting
 * markup when closed). A single document-level `click` delegate drives it, so
 * both crawled rich-text images and bespoke `ImageWidget` markup open the
 * viewer without touching the server components' trees.
 *
 * Skips: linked images (a > img → navigate), the viewer's own image/overlay,
 * header/footer chrome, and any image smaller than 40x40 (icons, spacers).
 * The full-size source is `data-lightbox-src` when present (the imweb
 * `_image_widget_lightbox` widget), else the image's currentSrc/src.
 */
const MIN_SIZE = 40;

export default function LightboxHost() {
  const [src, setSrc] = useState<string | null>(null);
  const [alt, setAlt] = useState("");
  const [zoomed, setZoomed] = useState(false);
  const [visible, setVisible] = useState(false);

  const open = useCallback((nextSrc: string, nextAlt: string) => {
    setAlt(nextAlt);
    setZoomed(false);
    setVisible(false);
    setSrc(nextSrc);
  }, []);

  const close = useCallback(() => {
    setZoomed(false);
    setVisible(false);
    setSrc(null);
    document.body.classList.remove("lg-on");
    // clear the viewer hash without a navigation
    history.replaceState(null, "", location.pathname + location.search);
  }, []);

  // document-level delegate: every non-link content image opens the viewer
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const img = target?.closest("img");
      if (!img) return;
      if (img.closest("a")) return;
      if (img.closest(".lg-outer")) return;
      if (img.closest("header, footer")) return;
      const rect = img.getBoundingClientRect();
      if (rect.width < MIN_SIZE || rect.height < MIN_SIZE) return;
      const el = img as HTMLImageElement;
      const nextSrc = el.getAttribute("data-lightbox-src") || el.currentSrc || el.src;
      if (!nextSrc) return;
      e.preventDefault();
      open(nextSrc, el.alt || "");
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);

  // open side effects: lock scroll, set hash, fade the overlay in next frame
  useEffect(() => {
    if (!src) return;
    document.body.classList.add("lg-on");
    history.replaceState(null, "", "#lg=img_lg&slide=0");
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => {
      cancelAnimationFrame(raf);
      document.body.classList.remove("lg-on");
    };
  }, [src]);

  // Escape closes
  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [src, close]);

  if (!src) return null;

  return createPortal(
    <>
      <div className="lg-backdrop in" />
      <div className={`lg-outer${visible ? " lg-visible" : ""}${zoomed ? " lg-zoomed" : ""}`}>
        <div className="lg" role="dialog" aria-modal="true" aria-label={alt || "Image viewer"}>
          <div className="lg-inner">
            <div className="lg-item lg-loaded lg-current lg-complete lg-zoomable">
              <div className="lg-img-wrap">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="lg-object lg-image"
                  src={src}
                  alt={alt}
                  style={{ transform: zoomed ? "scale(2)" : "scale(1)" }}
                />
              </div>
            </div>
          </div>
          <div className="lg-toolbar">
            <span className="lg-close lg-icon" role="button" aria-label="Close" onClick={close} />
            <span
              id="lg-zoom-in"
              className="lg-icon"
              role="button"
              aria-label="Zoom in"
              onClick={() => setZoomed(true)}
            />
            <span
              id="lg-zoom-out"
              className="lg-icon"
              role="button"
              aria-label="Zoom out"
              onClick={() => setZoomed(false)}
            />
            <span
              id="lg-actual-size"
              className="lg-icon"
              role="button"
              aria-label="Actual size"
              onClick={() => setZoomed(false)}
            />
            <div id="lg-counter" aria-hidden="true">
              <span id="lg-counter-current">1</span> / <span id="lg-counter-all">1</span>
            </div>
          </div>
          <div className="lg-sub-html">
            <h4></h4>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
