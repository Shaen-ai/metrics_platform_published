import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { loadPublicBootstrap } from "@/lib/loadPublicBootstrap";
import { PublishedTenantProvider } from "@/contexts/PublishedTenantProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tunzone - Design Furniture, Build Dreams",
  description:
    "The all-in-one platform for furniture manufacturers. Create planners, publish your catalog, and let customers design their perfect rooms.",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/logo.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { admin, initialLang } = await loadPublicBootstrap();

  return (
    <html lang={initialLang} className={inter.variable} suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <PublishedTenantProvider bootstrapAdmin={admin} initialLang={initialLang}>
          {children}
        </PublishedTenantProvider>
      </body>
    </html>
  );
}
