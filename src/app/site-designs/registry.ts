import type { CSSProperties } from "react";
import type { Admin } from "@/lib/types";

export const DEFAULT_PUBLIC_SITE_LAYOUT = "tunzone-classic-light";

export type SiteDesign = {
  id: string;
  name: string;
  shellClass: string;
  headerClass: string;
  heroClass: string;
  cardClass: string;
  buttonClass: string;
  outlineButtonClass: string;
  footerClass: string;
  variables: CSSProperties;
};

export const siteDesigns: SiteDesign[] = [
  {
    id: "tunzone-classic-light",
    name: "Editorial Cream",
    shellClass: "bg-[#F5F1EB] text-[#1a1614]",
    headerClass: "bg-[#F5F1EB]/90 backdrop-blur-xl border-b border-[#d4cabc]",
    heroClass: "bg-[#F5F1EB]",
    cardClass: "bg-white border border-[#d4cabc] rounded-[20px] shadow-sm",
    buttonClass: "bg-[#c8622a] text-white rounded-full",
    outlineButtonClass: "bg-white border border-[#d4cabc] text-[#1a1614] rounded-full",
    footerClass: "bg-[#1a1614] text-[#f2eee7]",
    variables: {
      "--site-primary": "#c8622a",
      "--site-accent": "#e8772e",
      "--site-background": "#F5F1EB",
      "--site-foreground": "#1a1614",
    } as CSSProperties,
  },
  {
    id: "architect-black-white",
    name: "Brutalist Mono",
    shellClass: "bg-white text-black",
    headerClass: "bg-white border-b-2 border-black",
    heroClass: "bg-white",
    cardClass: "bg-white border-2 border-black rounded-none shadow-none",
    buttonClass: "bg-black text-white rounded-none uppercase tracking-wider text-sm font-bold",
    outlineButtonClass: "bg-white border-2 border-black text-black rounded-none uppercase tracking-wider text-sm font-bold",
    footerClass: "bg-black text-white",
    variables: {
      "--site-primary": "#000000",
      "--site-accent": "#555555",
      "--site-background": "#ffffff",
      "--site-foreground": "#000000",
    } as CSSProperties,
  },
  {
    id: "soft-pink-red",
    name: "Soft Botanica",
    shellClass: "bg-[#faf7f5] text-[#2d2926]",
    headerClass: "bg-[#faf7f5]/90 backdrop-blur-lg border-b border-[#e8ddd5]",
    heroClass: "bg-gradient-to-br from-[#faf7f5] via-[#fdf2f0] to-[#f0ebe4]",
    cardClass: "bg-white/80 border border-[#e8ddd5] rounded-[28px] shadow-sm",
    buttonClass: "bg-[#c45c6a] text-white rounded-full",
    outlineButtonClass: "bg-white border border-[#d4b5a0] text-[#2d2926] rounded-full",
    footerClass: "bg-[#2d2926] text-[#f5ede8]",
    variables: {
      "--site-primary": "#c45c6a",
      "--site-accent": "#d4956a",
      "--site-background": "#faf7f5",
      "--site-foreground": "#2d2926",
    } as CSSProperties,
  },
  {
    id: "luxury-dark-gold",
    name: "Dark Showroom",
    shellClass: "bg-[#0a0908] text-[#f0e8d8]",
    headerClass: "bg-[#0a0908]/95 backdrop-blur-xl border-b border-[#2a2318]",
    heroClass: "bg-[#0a0908]",
    cardClass: "bg-[#141210] border border-[#2a2318] rounded-xl shadow-lg",
    buttonClass: "bg-[#c9a54e] text-[#0a0908] rounded-full font-semibold",
    outlineButtonClass: "bg-transparent border border-[#c9a54e]/50 text-[#c9a54e] rounded-full",
    footerClass: "bg-black text-[#c9a54e]/80",
    variables: {
      "--site-primary": "#c9a54e",
      "--site-accent": "#e8d5a0",
      "--site-background": "#0a0908",
      "--site-foreground": "#f0e8d8",
    } as CSSProperties,
  },
  {
    id: "minimal-white-oak",
    name: "Scandinavian Light",
    shellClass: "bg-[#f8f9fa] text-[#2c3e50]",
    headerClass: "bg-white/80 backdrop-blur-lg border-b border-[#e2e8f0]",
    heroClass: "bg-[#f8f9fa]",
    cardClass: "bg-white border border-[#e2e8f0] rounded-lg shadow-sm",
    buttonClass: "bg-[#5b7a8a] text-white rounded-lg",
    outlineButtonClass: "bg-white border border-[#cbd5e1] text-[#2c3e50] rounded-lg",
    footerClass: "bg-[#1e293b] text-[#e2e8f0]",
    variables: {
      "--site-primary": "#5b7a8a",
      "--site-accent": "#94a3b8",
      "--site-background": "#f8f9fa",
      "--site-foreground": "#2c3e50",
    } as CSSProperties,
  },
  {
    id: "industrial-graphite",
    name: "Neo Industrial",
    shellClass: "bg-[#1a1d23] text-[#e4e4e7]",
    headerClass: "bg-[#1a1d23]/95 backdrop-blur border-b border-[#2e3138]",
    heroClass: "bg-[#1a1d23]",
    cardClass: "bg-[#22252b] border border-[#2e3138] rounded-[4px]",
    buttonClass: "bg-[#e87a2e] text-white rounded-[4px] uppercase tracking-wide text-sm font-semibold",
    outlineButtonClass: "bg-transparent border border-[#4a4d55] text-[#e4e4e7] rounded-[4px] uppercase tracking-wide text-sm",
    footerClass: "bg-[#0f1115] text-[#9ca3af]",
    variables: {
      "--site-primary": "#e87a2e",
      "--site-accent": "#f5a623",
      "--site-background": "#1a1d23",
      "--site-foreground": "#e4e4e7",
    } as CSSProperties,
  },
  {
    id: "warm-beige-studio",
    name: "Warm Terracotta",
    shellClass: "bg-[#f4ece3] text-[#3d2e22]",
    headerClass: "bg-[#f4ece3]/90 backdrop-blur-lg border-b border-[#ddd0c2]",
    heroClass: "bg-gradient-to-b from-[#f4ece3] to-[#efe5d8]",
    cardClass: "bg-white border border-[#ddd0c2] rounded-2xl shadow-sm",
    buttonClass: "bg-[#b85c3a] text-white rounded-full font-semibold",
    outlineButtonClass: "bg-white border border-[#c8a88a] text-[#3d2e22] rounded-full",
    footerClass: "bg-[#3d2e22] text-[#e8d8c8]",
    variables: {
      "--site-primary": "#b85c3a",
      "--site-accent": "#d4956a",
      "--site-background": "#f4ece3",
      "--site-foreground": "#3d2e22",
    } as CSSProperties,
  },
  {
    id: "blue-modern-tech",
    name: "Blue Modern",
    shellClass: "bg-[#f8fafc] text-[#0f172a]",
    headerClass: "bg-white/90 backdrop-blur-xl border-b border-[#e2e8f0]",
    heroClass: "bg-[#f8fafc]",
    cardClass: "bg-white border border-[#e2e8f0] rounded-xl shadow-sm",
    buttonClass: "bg-[#2563eb] text-white rounded-xl font-medium",
    outlineButtonClass: "bg-white border border-[#bfdbfe] text-[#1e40af] rounded-xl",
    footerClass: "bg-[#0f172a] text-[#94a3b8]",
    variables: {
      "--site-primary": "#2563eb",
      "--site-accent": "#60a5fa",
      "--site-background": "#f8fafc",
      "--site-foreground": "#0f172a",
    } as CSSProperties,
  },
  {
    id: "green-natural-home",
    name: "Natural Oak",
    shellClass: "bg-[#faf8f5] text-[#2c2418]",
    headerClass: "bg-[#faf8f5]/90 backdrop-blur-lg border-b border-[#e5ddd2]",
    heroClass: "bg-[#faf8f5]",
    cardClass: "bg-white border border-[#e5ddd2] rounded-xl shadow-sm",
    buttonClass: "bg-[#5c7a5c] text-white rounded-xl",
    outlineButtonClass: "bg-white border border-[#c8d4c0] text-[#2c2418] rounded-xl",
    footerClass: "bg-[#2c2418] text-[#d4c8b8]",
    variables: {
      "--site-primary": "#5c7a5c",
      "--site-accent": "#8faa7a",
      "--site-background": "#faf8f5",
      "--site-foreground": "#2c2418",
    } as CSSProperties,
  },
  {
    id: "premium-showroom",
    name: "Premium Slate",
    shellClass: "bg-[#0c1220] text-[#e8e4dc]",
    headerClass: "bg-[#0c1220]/95 backdrop-blur-xl border-b border-[#1e2a3e]",
    heroClass: "bg-[#0c1220]",
    cardClass: "bg-[#131d2e] border border-[#1e2a3e] rounded-[14px] shadow-lg",
    buttonClass: "bg-[#c4a265] text-[#0c1220] rounded-full font-semibold",
    outlineButtonClass: "bg-transparent border border-[#c4a265]/40 text-[#c4a265] rounded-full",
    footerClass: "bg-[#060a12] text-[#8896a8]",
    variables: {
      "--site-primary": "#c4a265",
      "--site-accent": "#e0cda0",
      "--site-background": "#0c1220",
      "--site-foreground": "#e8e4dc",
    } as CSSProperties,
  },
];

const bespokeDesigns: Record<string, SiteDesign> = {
  "bespoke-black-label": {
    ...siteDesigns.find((design) => design.id === "luxury-dark-gold")!,
    id: "bespoke-black-label",
    name: "Bespoke Black Label",
    heroClass: "bg-[radial-gradient(circle_at_top_right,rgba(201,165,78,0.28),transparent_34%),linear-gradient(135deg,#050505,#17120b)]",
    cardClass: "bg-black/50 border border-[#c9a54e]/30 rounded-[2rem] shadow-2xl",
  },
};

export function getSiteDesign(admin?: Admin | null): SiteDesign {
  const bespoke = admin?.customDesignKey ? bespokeDesigns[admin.customDesignKey] : null;
  const selected = siteDesigns.find((design) => design.id === admin?.publicSiteLayout);
  return bespoke || selected || siteDesigns[0];
}

export function getDesignVariables(admin?: Admin | null): CSSProperties {
  const design = getSiteDesign(admin);
  return {
    ...design.variables,
    ...(admin?.publicSiteTheme?.primaryColor ? { "--site-primary": admin.publicSiteTheme.primaryColor } : {}),
    ...(admin?.publicSiteTheme?.accentColor ? { "--site-accent": admin.publicSiteTheme.accentColor } : {}),
    ...(admin?.publicSiteTheme?.backgroundColor ? { "--site-background": admin.publicSiteTheme.backgroundColor } : {}),
    ...(admin?.publicSiteTheme?.textColor ? { "--site-foreground": admin.publicSiteTheme.textColor } : {}),
  } as CSSProperties;
}

function relativeLuminanceFromHex(hex: string): number | null {
  const raw = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(raw)) return null;
  const n = parseInt(raw, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export function getPublishedThemeBodyStyle(admin?: Admin | null): CSSProperties {
  const site = getDesignVariables(admin) as Record<string, string | number | undefined>;
  const background = String(site["--site-background"] ?? "#FFF8F0");
  const foreground = String(site["--site-foreground"] ?? "#1A1A1A");

  const lum = relativeLuminanceFromHex(background);
  const dark = lum !== null && lum < 0.42;

  return {
    ...site,
    "--primary": String(site["--site-primary"] ?? "#E8772E"),
    "--primary-foreground": "#ffffff",
    "--ring": String(site["--site-primary"] ?? "#E8772E"),
    "--foreground": foreground,
    "--background": background,
    "--secondary": "color-mix(in srgb, var(--site-primary) 14%, var(--site-background))",
    "--secondary-foreground": foreground,
    "--muted": "color-mix(in srgb, var(--site-primary) 10%, var(--site-background))",
    "--muted-foreground": dark ? "#A3A3A3" : "#6B7280",
    "--accent": "color-mix(in srgb, var(--site-accent) 18%, var(--site-background))",
    "--accent-foreground": foreground,
    "--card": dark
      ? "color-mix(in srgb, var(--site-foreground) 10%, var(--site-background))"
      : "#ffffff",
    "--card-foreground": foreground,
    "--border": "color-mix(in srgb, var(--site-foreground) 16%, var(--site-background))",
    "--input": "color-mix(in srgb, var(--site-foreground) 16%, var(--site-background))",
    "--font-serif": "Clash Display, Noto Serif Armenian, sans-serif",
    "--font-sans": "Satoshi, Noto Sans Armenian, system-ui, sans-serif",
  } as CSSProperties;
}

export function applyCssVariablesToElement(el: HTMLElement, vars: CSSProperties): void {
  for (const [key, rawVal] of Object.entries(vars)) {
    if (rawVal === undefined || rawVal === null) continue;
    const val = typeof rawVal === "number" ? `${rawVal}px` : String(rawVal);
    el.style.setProperty(key, val);
  }
}
