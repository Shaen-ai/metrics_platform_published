"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import { Box, Loader2 } from "lucide-react";
import { toRelativeStorageUrl } from "@/lib/utils";
import {
  tuneModelViewerVerticalCenter,
  type CatalogListingFraming,
  type ModelViewerFramingSubset,
} from "@/lib/modelViewerVerticalCenter";
import { useTranslation } from "@/hooks/useTranslation";

/** Ms without wheel before the next gesture gets a fresh zoom budget (trackpad inertia). */
const WHEEL_BURST_IDLE_MS = 180;
/** Approx. vertical wheel “pixels” per burst devoted to zoom before the page scrolls. */
const SCROLL_ZOOM_BURST_PX = 84;

function effectiveWheelDeltaY(e: WheelEvent): number {
  if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) return e.deltaY * 16;
  if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return e.deltaY * Math.max(400, typeof window !== "undefined" ? window.innerHeight * 0.85 : 600);
  }
  return e.deltaY;
}

function getVerticalScrollParent(start: HTMLElement | null): HTMLElement | null {
  let el: HTMLElement | null = start;
  while (el) {
    const { overflowY } = getComputedStyle(el);
    if (/(auto|scroll|overlay)/.test(overflowY) && el.scrollHeight > el.clientHeight + 1) {
      return el;
    }
    el = el.parentElement;
  }
  if (typeof document === "undefined") return null;
  return (document.scrollingElement ?? document.documentElement) as HTMLElement;
}

export default function CatalogModelViewer({
  src,
  alt,
  fallbackImage,
  listingFraming = "compact",
  scrollFriendly = false,
}: {
  src: string;
  alt: string;
  fallbackImage?: string;
  /** Stronger framing lift for shallow / wide thumbnails (catalog layout). */
  listingFraming?: CatalogListingFraming;
  /** Hybrid wheel: small zoom budget then scroll the page (catalog tiles). */
  scrollFriendly?: boolean;
}) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const framingRef = useRef(listingFraming);
  framingRef.current = listingFraming;
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

  const resolvedSrc = toRelativeStorageUrl(src);

  useLayoutEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container || !resolvedSrc) {
      if (!resolvedSrc) setStatus("failed");
      return;
    }

    setStatus("loading");

    let mv: ModelViewerFramingSubset | null = null;
    let resizeDebounce: number | undefined;
    let followUpTune: number | undefined;
    let ro: ResizeObserver | null = null;
    let wheelTarget: HTMLElement | null = null;
    let wheelHandler: ((e: WheelEvent) => void) | null = null;

    let burstRemainingPx = SCROLL_ZOOM_BURST_PX;
    let lastWheelTime = -Infinity;

    const tune = () =>
      mv && mv.loaded
        ? tuneModelViewerVerticalCenter(mv, framingRef.current)
        : Promise.resolve();

    import("@google/model-viewer")
      .then(() => {
        if (cancelled || !containerRef.current) return;

        mv = document.createElement("model-viewer") as ModelViewerFramingSubset;
        mv.setAttribute("src", resolvedSrc);
        mv.setAttribute("alt", alt);
        mv.setAttribute("camera-controls", "");
        mv.setAttribute("auto-rotate", "");
        mv.setAttribute("camera-orbit", "0deg 70deg 152%");
        mv.setAttribute("field-of-view", "42deg");
        mv.setAttribute("min-field-of-view", "18deg");
        mv.setAttribute("max-field-of-view", "55deg");
        mv.setAttribute("min-camera-orbit", "auto 22.5deg 112%");
        mv.setAttribute("max-camera-orbit", "auto 90deg 400%");
        mv.setAttribute("shadow-intensity", "0.5");
        mv.setAttribute("exposure", "1");
        mv.setAttribute("loading", "eager");
        mv.style.width = "100%";
        mv.style.height = "100%";
        mv.style.display = "block";
        mv.style.minHeight = "0";
        mv.style.setProperty("--progress-bar-height", "0px");

        const scheduleResizeTune = () => {
          clearTimeout(resizeDebounce);
          resizeDebounce = window.setTimeout(() => {
            resizeDebounce = undefined;
            void tune();
          }, 48);
        };

        ro = new ResizeObserver(() => {
          if (!cancelled) scheduleResizeTune();
        });

        const root = containerRef.current!;
        root.innerHTML = "";

        if (scrollFriendly) {
          const inner = document.createElement("div");
          inner.className = "relative size-full min-h-0 overflow-hidden";
          wheelTarget = inner;

          wheelHandler = (e: WheelEvent) => {
            if (cancelled || !mv) return;
            if (e.ctrlKey || e.metaKey) return;
            if (e.deltaY === 0) return;

            const now = performance.now();
            if (now - lastWheelTime > WHEEL_BURST_IDLE_MS) {
              burstRemainingPx = SCROLL_ZOOM_BURST_PX;
            }
            lastWheelTime = now;

            const dy = effectiveWheelDeltaY(e);
            const abs = Math.abs(dy);
            const sign = Math.sign(dy);

            let towardZoom = 0;
            let towardScroll = dy;

            if (burstRemainingPx > 0 && abs > 0) {
              const take = Math.min(abs, burstRemainingPx);
              towardZoom = sign * take;
              towardScroll = dy - towardZoom;
              burstRemainingPx -= take;
            }

            e.preventDefault();
            e.stopPropagation();

            if (towardZoom !== 0 && mv.loaded) {
              const presses = Math.max(-8, Math.min(8, Math.round(towardZoom / 30)));
              if (presses !== 0) {
                mv.zoom(presses);
              }
            }

            if (towardScroll !== 0) {
              const scrollEl = getVerticalScrollParent(wheelTarget);
              if (scrollEl) scrollEl.scrollTop += towardScroll;
            }
          };

          inner.addEventListener("wheel", wheelHandler, { capture: true, passive: false });
          inner.appendChild(mv);
          root.appendChild(inner);
          ro.observe(inner);
        } else {
          root.appendChild(mv);
          ro.observe(root);
        }

        const onError = () => {
          if (!cancelled) setStatus("failed");
        };
        const onLoad = () => {
          if (cancelled || !mv) return;
          void (async () => {
            await tune();
            clearTimeout(followUpTune);
            followUpTune = window.setTimeout(() => {
              if (!cancelled) void tune();
            }, 220);
            if (!cancelled) setStatus("ready");
          })();
        };

        mv.addEventListener("error", onError);
        mv.addEventListener("load", onLoad);
      })
      .catch(() => {
        if (!cancelled) setStatus("failed");
      });

    return () => {
      cancelled = true;
      clearTimeout(resizeDebounce);
      clearTimeout(followUpTune);
      ro?.disconnect();
      if (wheelTarget && wheelHandler) {
        wheelTarget.removeEventListener("wheel", wheelHandler, { capture: true });
      }
      wheelTarget = null;
      wheelHandler = null;
      mv = null;
      if (container) container.innerHTML = "";
    };
  }, [resolvedSrc, alt, listingFraming, scrollFriendly]);

  if (status === "failed") {
    if (fallbackImage) {
      return (
        <Image
          src={fallbackImage}
          alt={alt}
          fill
          className="object-cover object-[center_38%]"
        />
      );
    }
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[240px] gap-2 text-[var(--muted-foreground)] bg-[var(--muted)]">
        <Box className="w-12 h-12 opacity-50" />
        <span className="text-sm">3D unavailable</span>
      </div>
    );
  }

  return (
    <div className="relative size-full min-h-0 overflow-hidden rounded-xl bg-[var(--muted)]">
      <div ref={containerRef} className="absolute inset-0 size-full min-h-0" />
      {status === "loading" && (
        <div className="flex flex-col items-center justify-center absolute inset-0 gap-2 bg-[var(--muted)] z-10">
          <Loader2 className="w-8 h-8 text-[var(--primary)] animate-spin" />
          <span className="text-xs text-[var(--muted-foreground)]">{t("catalog.loading3d")}</span>
        </div>
      )}
    </div>
  );
}
