import { cache } from "react";
import { cookies, headers } from "next/headers";
import { publicApiUrl } from "@/lib/publicEnv";
import {
  PUBLIC_LANG_COOKIE,
  normalizeLanguageCode,
  type LanguageCode,
} from "@/lib/translations";
import type { Admin } from "@/lib/types";
import { getPublishedAdminSlugFromHost } from "@/lib/tenant";

/**
 * Fetches tenant + language hint for SSR (brand name, theme on `<body>`, translations).
 * `cache: "no-store"` avoids a stale `publicSiteLayout` / theme for up to 60s after changes
 * (orange Tunzone flash then correct colors). Request-scoped `cache()` dedupes the fetch when
 * `generateMetadata` and `RootLayout` both call this in the same render.
 */
export const loadPublicBootstrap = cache(async (): Promise<{
  admin: Admin | null;
  initialLang: LanguageCode;
}> => {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const slug = getPublishedAdminSlugFromHost(host);

  let admin: Admin | null = null;
  try {
    const res = await fetch(`${publicApiUrl}/public/${encodeURIComponent(slug)}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const json = (await res.json()) as { data?: Admin };
      admin = json.data ?? null;
    }
  } catch {
    /* API unreachable during SSR — client will hydrate from initializeStore */
  }

  const jar = await cookies();
  const cookieLang = jar.get(PUBLIC_LANG_COOKIE)?.value;
  let initialLang: LanguageCode = "en";
  if (cookieLang === "ru" || cookieLang === "en") {
    initialLang = cookieLang;
  } else if (admin?.language) {
    initialLang = normalizeLanguageCode(admin.language);
  }

  return { admin, initialLang };
});
