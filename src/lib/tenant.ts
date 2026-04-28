const FALLBACK_ADMIN_SLUG = "demo";

/**
 * Resolve tenant slug from Host header (SSR) or browser hostname.
 * Aligns with `getPublishedAdminSlug()` for client-only resolution.
 */
export function getPublishedAdminSlugFromHost(host: string): string {
  const envSlug = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_ADMIN_SLUG?.trim() : undefined;
  if (envSlug) return envSlug;
  const h = host.split(":")[0]?.toLowerCase() || "";
  if (!h || h === "localhost" || h === "127.0.0.1") return FALLBACK_ADMIN_SLUG;

  const [subdomain] = h.split(".");
  if (!subdomain || subdomain === "www" || subdomain === "tunzone") return FALLBACK_ADMIN_SLUG;

  return subdomain;
}

export function getPublishedAdminSlug(): string {
  const envSlug = process.env.NEXT_PUBLIC_ADMIN_SLUG?.trim();
  if (envSlug) return envSlug;

  if (typeof window === "undefined") return FALLBACK_ADMIN_SLUG;

  return getPublishedAdminSlugFromHost(window.location.host);
}
