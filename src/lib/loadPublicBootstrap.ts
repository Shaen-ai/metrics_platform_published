import { cookies, headers } from "next/headers";
import { publicApiUrl } from "@/lib/publicEnv";
import {
  PUBLIC_LANG_COOKIE,
  normalizeLanguageCode,
  type LanguageCode,
} from "@/lib/translations";
import type { Admin } from "@/lib/types";
import { getPublishedAdminSlugFromHost } from "@/lib/tenant";

/** Fetches tenant + language hint for SSR (brand name + correct translations on first paint). */
export async function loadPublicBootstrap(): Promise<{
  admin: Admin | null;
  initialLang: LanguageCode;
}> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const slug = getPublishedAdminSlugFromHost(host);

  let admin: Admin | null = null;
  try {
    const res = await fetch(`${publicApiUrl}/public/${encodeURIComponent(slug)}`, {
      next: { revalidate: 60 },
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
}
