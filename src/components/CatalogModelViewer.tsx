"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import { Box, Loader2 } from "lucide-react";
import { toRelativeStorageUrl } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";

export default function CatalogModelViewer({
  src,
  alt,
  fallbackImage,
}: {
  src: string;
  alt: string;
  fallbackImage?: string;
}) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
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

    import("@google/model-viewer")
      .then(() => {
        if (cancelled || !containerRef.current) return;

        const mv = document.createElement("model-viewer") as HTMLElement;
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
        mv.style.minHeight = "160px";
        mv.style.transform = "translateY(-6%)";
        mv.style.setProperty("--progress-bar-height", "0px");

        const onError = () => {
          if (!cancelled) setStatus("failed");
        };
        const onLoad = () => {
          if (!cancelled) setStatus("ready");
        };

        mv.addEventListener("error", onError);
        mv.addEventListener("load", onLoad);

        containerRef.current.appendChild(mv);
      })
      .catch(() => {
        if (!cancelled) setStatus("failed");
      });

    return () => {
      cancelled = true;
      if (container) container.innerHTML = "";
    };
  }, [resolvedSrc, alt]);

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
    <div className="relative w-full h-full min-h-[320px] rounded-xl overflow-hidden bg-[var(--muted)]">
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      {status === "loading" && (
        <div className="flex flex-col items-center justify-center absolute inset-0 gap-2 bg-[var(--muted)] z-10">
          <Loader2 className="w-8 h-8 text-[var(--primary)] animate-spin" />
          <span className="text-xs text-[var(--muted-foreground)]">{t("catalog.loading3d")}</span>
        </div>
      )}
    </div>
  );
}
