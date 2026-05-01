"use client";

import { useEffect } from "react";
import Link from "next/link";
import { BrandLogoImage } from "@/components/BrandLogoImage";
import { contactSupportEmail } from "@/lib/publicEnv";
import { useStore } from "@/lib/store";
import { useResolvedAdmin } from "@/contexts/PublishedTenantProvider";
import { useTranslation } from "@/hooks/useTranslation";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { getDesignVariables, getSiteDesign } from "./site-designs/registry";
import {
  ArrowRight,
  Play,
  LayoutGrid,
  Palette,
  Box,
  Eye,
  Zap,
  Shield,
  Sparkles,
  Package,
  Boxes,
  PenTool,
} from "lucide-react";

export default function HomePage() {
  const { initializeStore } = useStore();
  const admin = useResolvedAdmin();
  const { t } = useTranslation();
  const design = getSiteDesign(admin);
  const brandName = admin?.companyName || "Tunzone";
  const texts = admin?.publicSiteTexts || {};
  const copy = (key: keyof typeof texts, fallback: string) => {
    const value = texts[key];
    return value && value.trim().length > 0 ? value : fallback;
  };

  useEffect(() => {
    initializeStore();
  }, [initializeStore]);

  return (
    <div className={`min-h-screen ${design.shellClass}`} style={getDesignVariables(admin)}>
      {/* ─── Navbar ─── */}
      <header className={`sticky top-0 z-50 ${design.headerClass}`}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BrandLogoImage
              admin={admin}
              brandName={brandName}
              width={40}
              height={40}
              priority
              className="h-10 w-10 rounded-xl object-contain"
            />
            <span className="text-xl font-semibold tracking-tight">{brandName}</span>
          </div>

          <nav className="hidden md:flex items-center gap-8">
            <Link href="/catalog" className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">{t("nav.catalog")}</Link>
            <Link href="/planners" className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">{t("nav.planners")}</Link>
            <a href="#features" className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">{t("nav.features")}</a>
            <a href="#how-it-works" className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">{t("nav.howItWorks")}</a>
          </nav>

          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link
              href="/catalog"
              className={`hidden sm:inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 hover:brightness-110 transition-all shadow-sm hover:shadow-md ${design.buttonClass}`}
            >
              {t("nav.browseCatalog")}
            </Link>
          </div>
        </div>
      </header>

      {/* ─── Hero ─── */}
      <section className={`relative overflow-hidden ${design.heroClass}`}>
        <div className="max-w-7xl mx-auto px-6 py-20 lg:py-28">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="animate-fade-in">
              <div className="inline-flex items-center gap-2 bg-[var(--secondary)] text-[var(--primary)] text-xs font-semibold px-4 py-1.5 rounded-full mb-8">
                <span className="w-2 h-2 bg-[var(--site-primary)] rounded-full animate-pulse" />
                {t("hero.badge")}
              </div>

              <h1 className="text-5xl lg:text-6xl xl:text-7xl font-normal leading-[1.1] mb-6 tracking-tight">
                {copy("heroTitle", t("hero.title1"))}
                <br />
                <span className="text-[var(--site-primary)] italic">{t("hero.title2")}</span>
              </h1>

              <p className="text-lg text-[var(--muted-foreground)] max-w-lg mb-10 leading-relaxed">
                {copy("heroSubtitle", t("hero.subtitle"))}
              </p>

              <div className="flex flex-wrap items-center gap-4">
                <Link
                  href="/catalog"
                  className={`inline-flex items-center gap-2 font-semibold px-8 py-3.5 hover:brightness-110 transition-all shadow-md hover:shadow-lg text-base ${design.buttonClass}`}
                >
                  {copy("primaryCta", t("nav.browseCatalog"))}
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/planners"
                  className={`inline-flex items-center gap-3 font-medium px-6 py-3.5 hover:brightness-105 transition-all text-base ${design.outlineButtonClass}`}
                >
                  <span className="w-8 h-8 bg-[var(--muted)] rounded-full flex items-center justify-center">
                    <Play className="w-3.5 h-3.5 ml-0.5" />
                  </span>
                  {copy("secondaryCta", t("hero.tryPlanners"))}
                </Link>
              </div>
            </div>

            <div className="relative animate-slide-up hidden lg:block">
              <div className="relative rounded-3xl overflow-hidden shadow-2xl border border-[var(--border)] bg-white">
                <div className="aspect-[4/3] bg-gradient-to-br from-white via-[var(--site-accent)]/10 to-[var(--site-primary)]/20 flex items-center justify-center">
                  <div className="text-center p-8">
                    <div className="w-20 h-20 mx-auto mb-4 bg-[var(--primary)]/10 rounded-2xl flex items-center justify-center">
                      <Box className="w-10 h-10 text-[var(--primary)]" />
                    </div>
                    <p className="text-xl font-semibold text-[var(--foreground)] mb-2">{t("hero.roomPlanner")}</p>
                    <p className="text-sm text-[var(--muted-foreground)]">{t("hero.roomPlannerDesc")}</p>
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-4 -right-4 bg-white rounded-2xl shadow-xl border border-[var(--border)] px-5 py-3 animate-float">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[var(--primary)]/10 rounded-xl flex items-center justify-center">
                    <Eye className="w-5 h-5 text-[var(--primary)]" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{t("hero.roomPreview")}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">{t("hero.realTimeRendering")}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Quick Access ─── */}
      <section className="py-16 bg-white/70 border-y border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { href: "/catalog", titleKey: "quick.browseCatalog", descKey: "quick.browseCatalogDesc", icon: Package, color: "text-blue-600", bg: "bg-blue-50" },
              { href: "/builder", titleKey: "quick.buildModules", descKey: "quick.buildModulesDesc", icon: Boxes, color: "text-violet-600", bg: "bg-violet-50" },
              { href: "/materials", titleKey: "quick.selectMaterials", descKey: "quick.selectMaterialsDesc", icon: Palette, color: "text-emerald-600", bg: "bg-emerald-50" },
              { href: "/planners", titleKey: "quick.designPlanners", descKey: "quick.designPlannersDesc", icon: PenTool, color: "text-[var(--primary)]", bg: "bg-orange-50" },
            ].map((opt) => (
              <Link key={opt.href} href={opt.href}>
                <div className={`group h-full p-6 hover:border-[var(--site-primary)] hover:shadow-lg transition-all duration-200 cursor-pointer ${design.cardClass}`}>
                  <div className={`w-12 h-12 rounded-xl ${opt.bg} flex items-center justify-center mb-4`}>
                    <opt.icon className={`w-6 h-6 ${opt.color}`} />
                  </div>
                  <h3 className="font-semibold text-base mb-1 flex items-center justify-between">
                    {t(opt.titleKey)}
                    <ArrowRight className="w-4 h-4 text-[var(--muted-foreground)] group-hover:text-[var(--primary)] group-hover:translate-x-1 transition-all" />
                  </h3>
                  <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">{t(opt.descKey)}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features ─── */}
      <section id="features" className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-[var(--primary)] mb-3 tracking-wide uppercase">{t("features.label")}</p>
            <h2 className="text-4xl lg:text-5xl mb-4">{t("features.title")}</h2>
            <p className="text-lg text-[var(--muted-foreground)] max-w-2xl mx-auto">
              {t("features.subtitle")}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              { icon: LayoutGrid, titleKey: "features.productCatalog", descKey: "features.productCatalogDesc" },
              { icon: Box, titleKey: "features.roomPlanner", descKey: "features.roomPlannerDesc" },
              { icon: Palette, titleKey: "features.materialSelector", descKey: "features.materialSelectorDesc" },
              { icon: Zap, titleKey: "features.modularBuilder", descKey: "features.modularBuilderDesc" },
              { icon: Shield, titleKey: "features.orderManagement", descKey: "features.orderManagementDesc" },
              { icon: Sparkles, titleKey: "features.analyticsDashboard", descKey: "features.analyticsDashboardDesc" },
            ].map((feat, i) => (
              <div key={i} className={`p-8 hover:shadow-lg transition-all duration-300 group ${design.cardClass}`}>
                <div className="w-12 h-12 bg-[var(--secondary)] rounded-xl flex items-center justify-center mb-5 group-hover:bg-[var(--primary)]/10 transition-colors">
                  <feat.icon className="w-6 h-6 text-[var(--primary)]" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{t(feat.titleKey)}</h3>
                <p className="text-[var(--muted-foreground)] text-sm leading-relaxed">{t(feat.descKey)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How It Works ─── */}
      <section id="how-it-works" className="py-24 bg-white/70 border-y border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-[var(--primary)] mb-3 tracking-wide uppercase">{t("howItWorks.label")}</p>
            <h2 className="text-4xl lg:text-5xl mb-4">{t("howItWorks.title")}</h2>
            <p className="text-lg text-[var(--muted-foreground)] max-w-2xl mx-auto">
              {t("howItWorks.subtitle")}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-10">
            {[
              { step: "01", titleKey: "howItWorks.step1Title", descKey: "howItWorks.step1Desc" },
              { step: "02", titleKey: "howItWorks.step2Title", descKey: "howItWorks.step2Desc" },
              { step: "03", titleKey: "howItWorks.step3Title", descKey: "howItWorks.step3Desc" },
            ].map((step, i) => (
              <div key={i} className="text-center">
                <div className="w-16 h-16 bg-[var(--site-primary)] text-white rounded-2xl flex items-center justify-center text-2xl font-bold mx-auto mb-6 shadow-lg">
                  {step.step}
                </div>
                <h3 className="text-xl font-semibold mb-3">{t(step.titleKey)}</h3>
                <p className="text-[var(--muted-foreground)] leading-relaxed max-w-sm mx-auto">{t(step.descKey)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA Banner ─── */}
      <section className="py-24">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl lg:text-5xl mb-6">{t("cta.title")}</h2>
          <p className="text-lg text-[var(--muted-foreground)] mb-10 max-w-2xl mx-auto">
            {t("cta.subtitle")}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/catalog"
              className={`inline-flex items-center gap-2 font-semibold px-8 py-4 hover:brightness-110 transition-all shadow-lg hover:shadow-xl text-base ${design.buttonClass}`}
            >
              {copy("primaryCta", t("nav.browseCatalog"))}
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/planners"
              className={`inline-flex items-center gap-2 font-medium px-8 py-4 hover:brightness-105 transition-all text-base ${design.outlineButtonClass}`}
            >
              {t("cta.explorePlanners")}
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className={`${design.footerClass} py-6 sm:py-10 md:py-14 lg:py-16`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 gap-x-5 gap-y-5 mb-6 sm:gap-x-8 md:grid-cols-4 md:gap-8 md:gap-y-10 lg:gap-10 md:mb-10 lg:mb-12">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2">
                <BrandLogoImage
                  admin={admin}
                  brandName={brandName}
                  width={36}
                  height={36}
                  className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg sm:rounded-xl object-contain"
                />
                <span className="text-base font-semibold sm:text-lg">{brandName}</span>
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-xs mb-2 sm:text-sm md:mb-4">{t("footer.explore")}</h4>
              <ul className="space-y-1 text-xs text-gray-400 sm:space-y-2 sm:text-sm">
                <li><Link href="/catalog" className="hover:text-white transition-colors">{t("nav.catalog")}</Link></li>
                <li><Link href="/planners" className="hover:text-white transition-colors">{t("footer.roomPlanners")}</Link></li>
                <li><Link href="/materials" className="hover:text-white transition-colors">{t("footer.materials")}</Link></li>
                <li><Link href="/builder" className="hover:text-white transition-colors">{t("footer.moduleBuilder")}</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-xs mb-2 sm:text-sm md:mb-4">{t("footer.company")}</h4>
              <ul className="space-y-1 text-xs text-gray-400 sm:space-y-2 sm:text-sm">
                <li><a href="#" className="hover:text-white transition-colors">{t("footer.about")}</a></li>
                <li><a href="#" className="hover:text-white transition-colors">{t("footer.blog")}</a></li>
                <li><a href="#" className="hover:text-white transition-colors">{t("footer.careers")}</a></li>
                <li>
                  <a
                    href={`mailto:${contactSupportEmail}`}
                    className="hover:text-white transition-colors"
                  >
                    {t("footer.contact")}
                  </a>
                </li>
              </ul>
            </div>
            <div className="col-span-2 md:col-span-1">
              <h4 className="font-semibold text-xs mb-2 sm:text-sm md:mb-4">{t("footer.legal")}</h4>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400 sm:flex-col sm:gap-x-0 sm:space-y-2 sm:text-sm">
                <li><a href="#" className="hover:text-white transition-colors">{t("footer.privacy")}</a></li>
                <li><a href="#" className="hover:text-white transition-colors">{t("footer.terms")}</a></li>
                <li><a href="#" className="hover:text-white transition-colors">{t("footer.cookies")}</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-4 text-center md:pt-8">
            <p className="text-xs text-gray-500 sm:text-sm">{t("footer.copyright")}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
