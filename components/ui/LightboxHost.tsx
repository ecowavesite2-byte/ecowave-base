"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
 * The clicked image opens as a gallery of every eligible image on the page in
 * DOM order, with lightgallery prev/next arrows, ArrowLeft/ArrowRight keys and
 * a live counter. A single-image page degrades to the original plain viewer.
 *
 * Enhancements over the original: wheel zoom (1.2x/notch, cursor-anchored),
 * click-to-zoom / click-to-reset, and drag-to-pan while zoomed (scale 1..4).
 * The original's zoom mechanics are preserved: image `scale()` + wrap
 * `translate3d()` + `.lg-grab`/`.lg-grabbing`/`.lg-zoom-dragging` classes.
 *
 * Eligibility (same rules for the delegate and for item collection): not inside
 * `a` (links navigate), not the viewer itself, not header/footer chrome,
 * rendered at least 40x40, and not `visibility:hidden`. The full-size source is
 * `data-lightbox-src` when present (the imweb `_image_widget_lightbox` widget),
 * else the image's currentSrc/src.
 */
const MIN_SIZE = 40;
const MIN_SCALE = 1;
const MAX_SCALE = 4;
const WHEEL_FACTOR = 1.2;
const DRAG_THRESHOLD = 5;
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

type ViewerItem = { src: string; alt: string };
type Pan = { x: number; y: number };

function isEligible(img: HTMLImageElement): boolean {
  if (img.closest("a")) return false;
  if (img.closest(".lg-outer")) return false;
  if (img.closest("header, footer")) return false;
  const rect = img.getBoundingClientRect();
  if (rect.width < MIN_SIZE || rect.height < MIN_SIZE) return false;
  if (getComputedStyle(img).visibility === "hidden") return false;
  return true;
}

export default function LightboxHost() {
  const [items, setItems] = useState<ViewerItem[]>([]);
  const [index, setIndex] = useState(0);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [visible, setVisible] = useState(false);

  const outerRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // latest view values for the imperative pointer/wheel handlers
  const scaleRef = useRef(1);
  const panRef = useRef<Pan>({ x: 0, y: 0 });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    panX: number;
    panY: number;
  } | null>(null);
  const movedRef = useRef(false);
  const suppressClickUntilRef = useRef(0);

  // image layout box (transform-independent) + wrap viewport box
  const getMetrics = useCallback(() => {
    const img = imgRef.current;
    const wrap = wrapRef.current;
    if (!img || !wrap) return null;
    return {
      fitW: img.offsetWidth,
      fitH: img.offsetHeight,
      wrapW: wrap.clientWidth,
      wrapH: wrap.clientHeight,
    };
  }, []);

  // pan range: max = max(0, (fitSize*scale - wrapSize)/2), clamped to ±max
  const clampPan = useCallback(
    (p: Pan, s: number): Pan => {
      if (s <= 1) return { x: 0, y: 0 };
      const m = getMetrics();
      if (!m) return p;
      const maxX = Math.max(0, (m.fitW * s - m.wrapW) / 2);
      const maxY = Math.max(0, (m.fitH * s - m.wrapH) / 2);
      return {
        x: Math.max(-maxX, Math.min(maxX, p.x)),
        y: Math.max(-maxY, Math.min(maxY, p.y)),
      };
    },
    [getMetrics],
  );

  // single writer for scale+pan: clamp, mirror into refs, then commit state
  const commit = useCallback(
    (nextScale: number, nextPan: Pan) => {
      const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale));
      const p = clampPan(nextPan, s);
      scaleRef.current = s;
      panRef.current = p;
      setScale(s);
      setPan(p);
    },
    [clampPan],
  );

  const resetView = useCallback(() => {
    dragRef.current = null;
    movedRef.current = false;
    setDragging(false);
    commit(1, { x: 0, y: 0 });
  }, [commit]);

  // toolbar zoom: rescale pan proportionally (pan * newScale/oldScale), clamp
  const zoomTo = useCallback(
    (nextScale: number) => {
      const s = scaleRef.current;
      const p = panRef.current;
      const f = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale)) / s;
      commit(nextScale, { x: p.x * f, y: p.y * f });
    },
    [commit],
  );

  // anchored zoom (wheel / click): keep the point under (c) fixed.
  //   pan' = c - (c - pan) * s'/s   where c = cursor offset from the viewer center
  const zoomAt = useCallback(
    (nextScale: number, c: Pan) => {
      const s = scaleRef.current;
      const p = panRef.current;
      const ns = Math.max(MIN_SCALE, Math.min(MAX_SCALE, nextScale));
      commit(ns, { x: c.x - (c.x - p.x) * (ns / s), y: c.y - (c.y - p.y) * (ns / s) });
    },
    [commit],
  );

  // cursor position relative to the untransformed viewer center (the wrap is
  // translated by `pan`, so measure against `.lg-outer`, not the wrap itself)
  const cursorOffset = useCallback((clientX: number, clientY: number): Pan => {
    const el = outerRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return { x: clientX - (rect.left + rect.width / 2), y: clientY - (rect.top + rect.height / 2) };
  }, []);

  const open = useCallback(
    (nextItems: ViewerItem[], start: number, opener: HTMLElement) => {
      prevFocusRef.current = document.activeElement as HTMLElement | null;
      openerRef.current = opener;
      resetView();
      setItems(nextItems);
      setIndex(start);
      setVisible(false);
    },
    [resetView],
  );

  const close = useCallback(() => {
    resetView();
    setVisible(false);
    setItems([]);
    document.body.classList.remove("lg-on");
    // clear the viewer hash without a navigation
    history.replaceState(null, "", location.pathname + location.search);
  }, [resetView]);

  // lightgallery loop semantics
  const next = useCallback(() => {
    resetView();
    setIndex((i) => (i + 1) % items.length);
  }, [items.length, resetView]);

  const prev = useCallback(() => {
    resetView();
    setIndex((i) => (i - 1 + items.length) % items.length);
  }, [items.length, resetView]);

  // document-level delegate: clicking an eligible image opens the page gallery
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const clicked = target?.closest("img");
      if (!clicked || !isEligible(clicked)) return;
      const els = Array.from(document.querySelectorAll("img")).filter(isEligible);
      const start = els.indexOf(clicked);
      if (start < 0) return;
      const nextItems = els.map((img) => ({
        src: img.getAttribute("data-lightbox-src") || img.currentSrc || img.src,
        alt: img.alt || "",
      }));
      if (!nextItems[start].src) return;
      e.preventDefault();
      open(nextItems, start, clicked);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);

  // open side effects: lock scroll, fade in next frame, move focus into dialog,
  // and make the rest of the page inert behind the viewer
  useEffect(() => {
    if (items.length === 0) return;
    document.body.classList.add("lg-on");
    const raf = requestAnimationFrame(() => setVisible(true));
    outerRef.current?.focus();
    // StrictMode-idempotent: collect this run's inerted nodes, unwrap on cleanup
    const inerted: HTMLElement[] = [];
    for (const child of Array.from(document.body.children)) {
      if (!(child instanceof HTMLElement)) continue;
      if (child.classList.contains("lg-backdrop") || child.classList.contains("lg-outer")) continue;
      if (["SCRIPT", "STYLE", "LINK", "TEMPLATE", "NEXTJS-PORTAL"].includes(child.tagName)) continue;
      child.setAttribute("inert", "");
      inerted.push(child);
    }
    return () => {
      cancelAnimationFrame(raf);
      document.body.classList.remove("lg-on");
      for (const el of inerted) el.removeAttribute("inert");
      // prefer the opener (or its focusable wrapper); fall back to the prior focus
      const opener = openerRef.current;
      const target = opener?.closest?.("a, button, [tabindex]") as HTMLElement | null;
      if (target?.isConnected) {
        target.focus();
      } else if (opener?.isConnected) {
        opener.setAttribute("tabindex", "-1");
        opener.focus();
        opener.addEventListener("blur", () => opener.removeAttribute("tabindex"), { once: true });
      } else {
        const prev = prevFocusRef.current;
        if (prev && prev.isConnected) prev.focus();
      }
    };
  }, [items.length]);

  // reflect the current slide in the hash (open + every navigation)
  useEffect(() => {
    if (items.length === 0) return;
    history.replaceState(null, "", "#lg=img_lg&slide=" + index);
  }, [items.length, index]);

  // re-clamp the pan when the viewport changes (window resize / orientation)
  useEffect(() => {
    if (items.length === 0) return;
    const onResize = () => commit(scaleRef.current, panRef.current);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [items.length, commit]);

  // wheel zoom — non-passive so preventDefault works; attached while open.
  // Delta magnitude is normalized (line/page modes) and exponent-scaled so a
  // trackpad's many small deltas do not run away.
  const onWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      if (!imgRef.current || !imgRef.current.naturalWidth) return;
      const px =
        e.deltaMode === 1
          ? e.deltaY * 16
          : e.deltaMode === 2
            ? e.deltaY * (outerRef.current?.clientHeight ?? 800)
            : e.deltaY;
      const factor = Math.min(1.5, Math.max(1 / 1.5, Math.pow(WHEEL_FACTOR, -px / 100)));
      zoomAt(scaleRef.current * factor, cursorOffset(e.clientX, e.clientY));
    },
    [zoomAt, cursorOffset],
  );
  useEffect(() => {
    if (items.length === 0) return;
    const el = outerRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [items.length, onWheel]);

  // keyboard: Escape closes, arrows navigate, Tab is trapped in the dialog
  useEffect(() => {
    if (items.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key === "ArrowLeft" && items.length > 1) {
        e.preventDefault();
        prev();
        return;
      }
      if (e.key === "ArrowRight" && items.length > 1) {
        e.preventDefault();
        next();
        return;
      }
      if (e.key === "Tab") {
        const root = outerRef.current;
        if (!root) return;
        const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
          (n) => !n.hasAttribute("disabled"),
        );
        if (nodes.length === 0) {
          e.preventDefault();
          outerRef.current?.focus();
          return;
        }
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        const active = document.activeElement as HTMLElement | null;
        const inside = !!active && root.contains(active);
        if (e.shiftKey) {
          if (!inside || active === first || active === outerRef.current) {
            e.preventDefault();
            last.focus();
          }
        } else if (!inside || active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [items.length, close, next, prev]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (scaleRef.current <= 1 || e.button !== 0) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      panX: panRef.current.x,
      panY: panRef.current.y,
    };
    movedRef.current = false;
    setDragging(true);
    wrap.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) movedRef.current = true;
    commit(scaleRef.current, { x: d.panX + dx, y: d.panY + dy });
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    // a real drag also fires a trailing click; suppress it by timestamp so a
    // quick next click is never swallowed (covers pointercancel too)
    if (movedRef.current) suppressClickUntilRef.current = Date.now() + 250;
    dragRef.current = null;
    setDragging(false);
    const wrap = wrapRef.current;
    if (wrap?.hasPointerCapture(e.pointerId)) wrap.releasePointerCapture(e.pointerId);
  };

  // click-to-zoom at scale 1, click-to-reset at scale > 1; suppressed after a pan.
  // Bound to the wrap, not the img: while zoomed the wrap captures the pointer,
  // so the img never receives the click. Hit-test the image's visual rect so
  // clicks on the surrounding backdrop stay inert.
  const onWrapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (Date.now() < suppressClickUntilRef.current) return;
    const img = imgRef.current;
    if (!img) return;
    const r = img.getBoundingClientRect();
    const insideImg =
      e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!insideImg) return;
    if (scaleRef.current <= 1) zoomAt(2, cursorOffset(e.clientX, e.clientY));
    else commit(1, { x: 0, y: 0 });
  };

  const current = items[index];
  if (items.length === 0 || !current) return null;

  const zoomed = scale > 1;
  const outerClass = `lg-outer${visible ? " lg-visible" : ""}${zoomed ? " lg-zoomed" : ""}${
    zoomed ? (dragging ? " lg-grabbing lg-zoom-dragging" : " lg-grab") : ""
  }`;

  return createPortal(
    <>
      <div className="lg-backdrop in" />
      <div
        ref={outerRef}
        className={outerClass}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-label={current.alt || "Image viewer"}
      >
        <div className="lg">
          <div className="lg-inner">
            <div className="lg-item lg-loaded lg-current lg-complete lg-zoomable">
              <div
                ref={wrapRef}
                className="lg-img-wrap"
                style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0)` }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onClick={onWrapClick}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={current.src}
                  ref={imgRef}
                  className="lg-object lg-image"
                  src={current.src}
                  alt={current.alt}
                  style={{ transform: `scale(${scale})` }}
                  draggable={false}
                />
              </div>
            </div>
          </div>
          <div className="sr-only" aria-live="polite">
            Image {index + 1} of {items.length}
          </div>
        </div>
        {items.length > 1 && (
          <div className="lg-actions">
            <button type="button" className="lg-next lg-icon" aria-label="Next image" onClick={next} />
            <button type="button" className="lg-prev lg-icon" aria-label="Previous image" onClick={prev} />
          </div>
        )}
        <div className="lg-toolbar">
          <button type="button" className="lg-close lg-icon" aria-label="Close" onClick={close} />
          <button
            type="button"
            id="lg-zoom-in"
            className="lg-icon"
            aria-label="Zoom in"
            onClick={() => zoomTo(scaleRef.current * 2)}
          />
          <button
            type="button"
            id="lg-zoom-out"
            className="lg-icon"
            aria-label="Zoom out"
            disabled={scale <= 1}
            onClick={() => zoomTo(scaleRef.current / 2)}
          />
          <button
            type="button"
            id="lg-actual-size"
            className="lg-icon"
            aria-label="Actual size"
            onClick={() => commit(1, { x: 0, y: 0 })}
          />
          <div id="lg-counter" aria-hidden="true">
            <span id="lg-counter-current">{index + 1}</span> /{" "}
            <span id="lg-counter-all">{items.length}</span>
          </div>
        </div>
        <div className="lg-sub-html">
          <h4></h4>
        </div>
      </div>
    </>,
    document.body,
  );
}
