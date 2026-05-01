/** Imperative fly-to-cart chip; no React tree (append/remove on document.body). */

export type FlyToCartTone = "primary" | "light";

export function prefersFlyAnimationReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function fallbackCartIconRect(): DOMRect {
  const edge = 24;
  const size = 22;
  const cx = window.innerWidth - edge - 42;
  const cy = window.innerHeight - edge - 26;
  return new DOMRect(cx - size / 2, cy - size / 2, size, size);
}

const PLUS_SVG_PRIMARY = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>`;

export function runFlyToCartAnimation(opts: {
  startRect: DOMRect;
  endRect: DOMRect | null;
  tone: FlyToCartTone;
  onComplete?: () => void;
}): void {
  const { startRect, endRect, tone, onComplete } = opts;
  const end = endRect && endRect.width > 0 && endRect.height > 0 ? endRect : fallbackCartIconRect();

  const root = document.documentElement;
  const primary =
    getComputedStyle(root).getPropertyValue("--primary").trim() || "hsl(221 83% 53%)";

  const size = Math.round(
    Math.min(48, Math.max(32, Math.max(startRect.width, startRect.height))),
  );

  const x0 = startRect.left + startRect.width / 2 - size / 2;
  const y0 = startRect.top + startRect.height / 2 - size / 2;
  const x1 = end.left + end.width / 2 - size / 2;
  const y1 = end.top + end.height / 2 - size / 2;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const arc = Math.min(100, Math.hypot(dx, dy) * 0.32);

  const wrap = document.createElement("div");
  wrap.setAttribute("aria-hidden", "true");
  wrap.style.cssText = [
    "position:fixed",
    "left:0",
    "top:0",
    "z-index:99999",
    "pointer-events:none",
    "border-radius:12px",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "box-shadow:0 8px 24px rgba(0,0,0,0.18)",
    `width:${size}px`,
    `height:${size}px`,
    `transform:translate(${x0}px,${y0}px)`,
  ].join(";");

  if (tone === "light") {
    wrap.style.background = "#fff";
    wrap.style.border = `2px solid color-mix(in srgb, ${primary} 35%, transparent)`;
    wrap.innerHTML = PLUS_SVG_PRIMARY(primary);
  } else {
    wrap.style.background = primary;
    wrap.innerHTML = PLUS_SVG_PRIMARY("#fff");
  }

  document.body.appendChild(wrap);

  const midX = dx * 0.42;
  const midY = dy * 0.42 - arc;

  const anim = wrap.animate(
    [
      { transform: `translate(${x0}px, ${y0}px) scale(1)`, opacity: 1 },
      { transform: `translate(${x0 + midX}px, ${y0 + midY}px) scale(0.88)`, opacity: 1 },
      { transform: `translate(${x0 + dx}px, ${y0 + dy}px) scale(0.3)`, opacity: 0.15 },
    ],
    { duration: 620, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" },
  );

  anim.finished
    .then(() => {
      wrap.remove();
      onComplete?.();
    })
    .catch(() => {
      wrap.remove();
      onComplete?.();
    });
}
