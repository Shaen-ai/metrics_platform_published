import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { loadPublicBootstrap } from "@/lib/loadPublicBootstrap";
import { getStorefrontLogoSrc } from "@/lib/brandLogo";
import { PublishedTenantProvider } from "@/contexts/PublishedTenantProvider";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { PublishedBodyTheme } from "@/components/PublishedBodyTheme";
import { getPublishedThemeBodyStyle } from "@/app/site-designs/registry";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const DEFAULT_TITLE = "Tunzone - Design Furniture, Build Dreams";
const DEFAULT_DESCRIPTION =
  "The all-in-one platform for furniture manufacturers. Create planners, publish your catalog, and let customers design their perfect rooms.";

export async function generateMetadata(): Promise<Metadata> {
  const { admin } = await loadPublicBootstrap();
  const hasCustomLogo = Boolean(admin?.logo?.trim());
  const brandIcon = hasCustomLogo ? getStorefrontLogoSrc(admin) : null;

  return {
    title: admin?.companyName?.trim() ? admin.companyName.trim() : DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    icons: brandIcon
      ? { icon: brandIcon, shortcut: brandIcon, apple: brandIcon }
      : { icon: "/favicon.png", shortcut: "/favicon.png", apple: "/logo.png" },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { admin, initialLang } = await loadPublicBootstrap();

  return (
    <html lang={initialLang} className={inter.variable} suppressHydrationWarning>
      <body
        className="antialiased"
        style={getPublishedThemeBodyStyle(admin)}
        suppressHydrationWarning
      >
        <GoogleAnalytics />
        <PublishedTenantProvider bootstrapAdmin={admin} initialLang={initialLang}>
          <PublishedBodyTheme />
          {children}
        </PublishedTenantProvider>
      </body>
    </html>
  );
}
