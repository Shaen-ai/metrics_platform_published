import type { Metadata } from "next";
import "./globals.css";
import { loadPublicBootstrap } from "@/lib/loadPublicBootstrap";
import { getStorefrontLogoSrc } from "@/lib/brandLogo";
import { PublishedTenantProvider } from "@/contexts/PublishedTenantProvider";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { PublishedBodyTheme } from "@/components/PublishedBodyTheme";
import { getPublishedThemeBodyStyle } from "@/app/site-designs/registry";

const GOOGLE_FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,300..600;1,300..600&family=Inter+Tight:wght@400;500;600;700&display=swap";

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
    <html lang={initialLang} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href={GOOGLE_FONTS_URL} rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('tz-pub-theme');if(t!=='light'&&t!=='dark'){var h=new Date().getHours();t=h>=7&&h<19?'light':'dark'}document.documentElement.dataset.theme=t;document.cookie='tz-pub-theme='+t+';path=/;max-age=31536000;SameSite=Lax';}catch(e){}})();` }} />
      </head>
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
