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

const baseVariables = {
  "--site-primary": "#E8772E",
  "--site-accent": "#F59E0B",
  "--site-background": "#FFF8F0",
  "--site-foreground": "#1A1A1A",
} as CSSProperties;

export const siteDesigns: SiteDesign[] = [
  {
    id: "tunzone-classic-light",
    name: "Tunzone Classic Light",
    shellClass: "bg-[var(--site-background)] text-[var(--site-foreground)]",
    headerClass: "bg-white/80 backdrop-blur-lg border-b border-[var(--border)]",
    heroClass: "bg-transparent",
    cardClass: "bg-white border border-[var(--border)] rounded-2xl",
    buttonClass: "bg-[var(--site-primary)] text-white rounded-full",
    outlineButtonClass: "bg-white border border-[var(--border)] text-[var(--site-foreground)] rounded-full",
    footerClass: "bg-[#1A1A1A] text-white",
    variables: baseVariables,
  },
  {
    id: "architect-black-white",
    name: "Architect Black & White",
    shellClass: "bg-white text-zinc-950",
    headerClass: "bg-white/90 backdrop-blur border-b border-zinc-200",
    heroClass: "bg-gradient-to-br from-white via-zinc-50 to-zinc-200",
    cardClass: "bg-white border border-zinc-300 rounded-none",
    buttonClass: "bg-black text-white rounded-none",
    outlineButtonClass: "bg-white border border-black text-black rounded-none",
    footerClass: "bg-black text-white",
    variables: { ...baseVariables, "--site-primary": "#000000", "--site-accent": "#737373" } as CSSProperties,
  },
  {
    id: "soft-pink-red",
    name: "Soft Pink & Red",
    shellClass: "bg-rose-50 text-rose-950",
    headerClass: "bg-rose-50/90 backdrop-blur border-b border-rose-200",
    heroClass: "bg-gradient-to-br from-rose-50 via-pink-50 to-red-100",
    cardClass: "bg-white/90 border border-rose-200 rounded-3xl",
    buttonClass: "bg-rose-600 text-white rounded-full",
    outlineButtonClass: "bg-white border border-rose-300 text-rose-900 rounded-full",
    footerClass: "bg-rose-950 text-rose-50",
    variables: { ...baseVariables, "--site-primary": "#E11D48", "--site-accent": "#FB7185" } as CSSProperties,
  },
  {
    id: "luxury-dark-gold",
    name: "Luxury Dark Gold",
    shellClass: "bg-stone-950 text-amber-50",
    headerClass: "bg-stone-950/90 backdrop-blur border-b border-amber-500/20",
    heroClass: "bg-gradient-to-br from-stone-950 via-stone-900 to-amber-950",
    cardClass: "bg-stone-900 border border-amber-500/25 rounded-2xl",
    buttonClass: "bg-amber-500 text-stone-950 rounded-full",
    outlineButtonClass: "bg-transparent border border-amber-400 text-amber-100 rounded-full",
    footerClass: "bg-black text-amber-50",
    variables: { ...baseVariables, "--site-primary": "#D6A84F", "--site-accent": "#F8F0DF", "--site-background": "#11100E", "--site-foreground": "#F8F0DF" } as CSSProperties,
  },
  {
    id: "minimal-white-oak",
    name: "Minimal White Oak",
    shellClass: "bg-stone-50 text-stone-900",
    headerClass: "bg-stone-50/90 backdrop-blur border-b border-stone-200",
    heroClass: "bg-gradient-to-br from-stone-50 to-amber-100/60",
    cardClass: "bg-white border border-stone-200 rounded-2xl",
    buttonClass: "bg-amber-700 text-white rounded-full",
    outlineButtonClass: "bg-white border border-stone-300 text-stone-900 rounded-full",
    footerClass: "bg-stone-900 text-stone-100",
    variables: { ...baseVariables, "--site-primary": "#B88A57", "--site-accent": "#F5E9DA" } as CSSProperties,
  },
  {
    id: "industrial-graphite",
    name: "Industrial Graphite",
    shellClass: "bg-slate-900 text-slate-100",
    headerClass: "bg-slate-900/90 backdrop-blur border-b border-slate-700",
    heroClass: "bg-gradient-to-br from-slate-900 via-slate-800 to-orange-950",
    cardClass: "bg-slate-800 border border-slate-700 rounded-xl",
    buttonClass: "bg-orange-500 text-white rounded-lg",
    outlineButtonClass: "bg-transparent border border-slate-500 text-slate-100 rounded-lg",
    footerClass: "bg-slate-950 text-slate-200",
    variables: { ...baseVariables, "--site-primary": "#F97316", "--site-accent": "#94A3B8", "--site-background": "#1F2937", "--site-foreground": "#E5E7EB" } as CSSProperties,
  },
  {
    id: "warm-beige-studio",
    name: "Warm Beige Studio",
    shellClass: "bg-orange-50 text-stone-900",
    headerClass: "bg-orange-50/90 backdrop-blur border-b border-orange-200",
    heroClass: "bg-gradient-to-br from-orange-50 via-amber-50 to-stone-100",
    cardClass: "bg-white/80 border border-orange-200 rounded-3xl",
    buttonClass: "bg-orange-700 text-white rounded-full",
    outlineButtonClass: "bg-white border border-orange-300 text-stone-900 rounded-full",
    footerClass: "bg-stone-800 text-orange-50",
    variables: { ...baseVariables, "--site-primary": "#C47A3A", "--site-accent": "#F5E9DA" } as CSSProperties,
  },
  {
    id: "blue-modern-tech",
    name: "Blue Modern Tech",
    shellClass: "bg-blue-50 text-blue-950",
    headerClass: "bg-blue-50/90 backdrop-blur border-b border-blue-200",
    heroClass: "bg-gradient-to-br from-blue-50 via-white to-sky-100",
    cardClass: "bg-white border border-blue-200 rounded-2xl",
    buttonClass: "bg-blue-600 text-white rounded-xl",
    outlineButtonClass: "bg-white border border-blue-300 text-blue-950 rounded-xl",
    footerClass: "bg-blue-950 text-blue-50",
    variables: { ...baseVariables, "--site-primary": "#2563EB", "--site-accent": "#60A5FA" } as CSSProperties,
  },
  {
    id: "green-natural-home",
    name: "Green Natural Home",
    shellClass: "bg-green-50 text-green-950",
    headerClass: "bg-green-50/90 backdrop-blur border-b border-green-200",
    heroClass: "bg-gradient-to-br from-green-50 via-emerald-50 to-lime-100",
    cardClass: "bg-white/90 border border-green-200 rounded-3xl",
    buttonClass: "bg-green-600 text-white rounded-full",
    outlineButtonClass: "bg-white border border-green-300 text-green-950 rounded-full",
    footerClass: "bg-green-950 text-green-50",
    variables: { ...baseVariables, "--site-primary": "#16A34A", "--site-accent": "#86EFAC" } as CSSProperties,
  },
  {
    id: "premium-showroom",
    name: "Premium Showroom",
    shellClass: "bg-slate-50 text-slate-950",
    headerClass: "bg-white/90 backdrop-blur-xl border-b border-violet-100",
    heroClass: "bg-gradient-to-br from-white via-violet-50 to-slate-100",
    cardClass: "bg-white border border-violet-100 rounded-[2rem] shadow-sm",
    buttonClass: "bg-violet-600 text-white rounded-full",
    outlineButtonClass: "bg-white border border-violet-200 text-violet-950 rounded-full",
    footerClass: "bg-slate-950 text-white",
    variables: { ...baseVariables, "--site-primary": "#7C3AED", "--site-accent": "#C4B5FD" } as CSSProperties,
  },
];

const bespokeDesigns: Record<string, SiteDesign> = {
  "bespoke-black-label": {
    ...siteDesigns.find((design) => design.id === "luxury-dark-gold")!,
    id: "bespoke-black-label",
    name: "Bespoke Black Label",
    heroClass: "bg-[radial-gradient(circle_at_top_right,rgba(214,168,79,0.28),transparent_34%),linear-gradient(135deg,#050505,#17120b)]",
    cardClass: "bg-black/50 border border-amber-400/30 rounded-[2rem] shadow-2xl",
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
