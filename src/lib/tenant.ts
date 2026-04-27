const FALLBACK_ADMIN_SLUG = "demo";

export function getPublishedAdminSlug(): string {
  const envSlug = process.env.NEXT_PUBLIC_ADMIN_SLUG?.trim();
  if (envSlug) return envSlug;

  if (typeof window === "undefined") return FALLBACK_ADMIN_SLUG;

  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return FALLBACK_ADMIN_SLUG;

  const [subdomain] = host.split(".");
  if (!subdomain || subdomain === "www" || subdomain === "tunzone") return FALLBACK_ADMIN_SLUG;

  return subdomain;
}
