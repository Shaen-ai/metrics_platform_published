"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { BrandLogoImage } from "@/components/BrandLogoImage";
import {
  LayoutDashboard,
  CookingPot,
  Bath,
  Bed,
  Sofa,
  UtensilsCrossed,
  Monitor,
  Baby,
  DoorOpen,
  DoorClosed,
  ArrowRight,
  ArrowLeft,
  Home,
  PanelsTopLeft,
  Blocks,
  Sparkles,
  PencilRuler,
} from "lucide-react";
import { plannerConfigs } from "./config";
import { useStore } from "@/lib/store";
import { useResolvedAdmin } from "@/contexts/PublishedTenantProvider";
import { useTranslation } from "@/hooks/useTranslation";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { plannerTranslationKey } from "@/lib/translations";
import { getDesignVariables, getSiteDesign } from "../site-designs/registry";

const iconMap: Record<string, React.ReactNode> = {
  LayoutDashboard: <LayoutDashboard className="w-8 h-8" />,
  CookingPot: <CookingPot className="w-8 h-8" />,
  PanelsTopLeft: <PanelsTopLeft className="w-8 h-8" />,
  Blocks: <Blocks className="w-8 h-8" />,
  Sparkles: <Sparkles className="w-8 h-8" />,
  PencilRuler: <PencilRuler className="w-8 h-8" />,
  Bath: <Bath className="w-8 h-8" />,
  Bed: <Bed className="w-8 h-8" />,
  Sofa: <Sofa className="w-8 h-8" />,
  UtensilsCrossed: <UtensilsCrossed className="w-8 h-8" />,
  Monitor: <Monitor className="w-8 h-8" />,
  Baby: <Baby className="w-8 h-8" />,
  DoorOpen: <DoorOpen className="w-8 h-8" />,
  DoorClosed: <DoorClosed className="w-8 h-8" />,
};

export default function PlannersHubPage() {
  const { initializeStore } = useStore();
  const admin = useResolvedAdmin();
  const { t } = useTranslation();
  const design = getSiteDesign(admin);
  const brandName = admin?.companyName || "Tunzone";

  useEffect(() => {
    initializeStore();
  }, [initializeStore]);

  const visiblePlanners = useMemo(() => {
    const hubListed = plannerConfigs.filter((p) => p.hubVisible !== false);
    const allowed = admin?.selectedPlannerTypes;
    if (!allowed || allowed.length === 0) return hubListed;
    const allowedSet = new Set(allowed);
    return hubListed.filter((planner) => allowedSet.has(planner.id));
  }, [admin?.selectedPlannerTypes]);
  const plannersTitle = admin?.publicSiteTexts?.plannersTitle?.trim() || t("planners.heroTitle");
  const plannersSubtitle = admin?.publicSiteTexts?.plannersSubtitle?.trim() || t("planners.heroSubtitle");

  return (
    <div className={`min-h-screen ${design.shellClass}`} style={getDesignVariables(admin)}>
      {/* Header */}
      <header className={`sticky top-0 z-50 ${design.headerClass}`}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-2 hover:bg-[var(--muted)] rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2">
              <BrandLogoImage
                admin={admin}
                brandName={brandName}
                width={32}
                height={32}
                className="w-8 h-8 rounded-lg object-contain"
              />
              <span className="text-lg font-semibold">{t("planners.title")}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link href="/" className="p-2 hover:bg-[var(--muted)] rounded-full transition-colors">
              <Home className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h2 className="text-4xl lg:text-5xl mb-4">
            {plannersTitle}
          </h2>
          <p className="text-lg text-[var(--muted-foreground)] max-w-2xl mx-auto leading-relaxed">
            {plannersSubtitle}
          </p>
        </div>
      </section>

      {/* Planners Grid */}
      <main className="max-w-7xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {visiblePlanners.map((planner) => {
            const key = plannerTranslationKey(planner.id);
            return (
              <Link key={planner.id} href={`/planners/${planner.id}`}>
                <div className="group bg-white border border-[var(--border)] rounded-2xl p-6 h-full hover:border-[var(--primary)] hover:shadow-lg transition-all duration-200 cursor-pointer">
                  <div className={`w-14 h-14 rounded-xl ${planner.bgColor} flex items-center justify-center mb-4`}>
                    <span className={planner.color}>
                      {iconMap[planner.icon] ?? <LayoutDashboard className="w-8 h-8" />}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold">{t(`planner.${key}.name`)}</h3>
                    <ArrowRight className="w-4 h-4 text-[var(--muted-foreground)] group-hover:text-[var(--primary)] group-hover:translate-x-1 transition-all" />
                  </div>
                  <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
                    {t(`planner.${key}.desc`)}
                  </p>
                  {planner.categories.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-4">
                      {planner.categories.slice(0, 4).map((cat) => (
                        <span
                          key={cat}
                          className="text-[11px] px-2.5 py-0.5 rounded-full bg-[var(--muted)] text-[var(--muted-foreground)]"
                        >
                          {cat}
                        </span>
                      ))}
                      {planner.categories.length > 4 && (
                        <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[var(--muted)] text-[var(--muted-foreground)]">
                          +{planner.categories.length - 4}
                        </span>
                      )}
                    </div>
                  )}
                  {planner.categories.length === 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-4">
                      <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[var(--primary)]/10 text-[var(--primary)] font-medium">
                        {t("planners.fullCatalog")}
                      </span>
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] bg-white">
        <div className="max-w-7xl mx-auto px-6 py-6 text-center text-sm text-[var(--muted-foreground)]">
          <p>{t("planners.copyright")}</p>
        </div>
      </footer>
    </div>
  );
}
