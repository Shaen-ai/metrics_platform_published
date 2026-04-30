const FALLBACK_ADMIN_SLUG = "demo";
const RESERVED_SUBDOMAINS = new Set(["admin", "api", "published", "www"]);

function getEnvAdminSlug(): string | undefined {
  return process.env.NEXT_PUBLIC_ADMIN_SLUG?.trim() || undefined;
}

/**
 * Resolve tenant slug from Host header (SSR) or browser hostname.
 * Aligns with `getPublishedAdminSlug()` for client-only resolution.
 */
export function getPublishedAdminSlugFromHost(host: string): string {
  const h = host.split(":")[0]?.toLowerCase() || "";
  const envSlug = getEnvAdminSlug();
  if (!h || h === "localhost" || h === "127.0.0.1") {
    return envSlug || FALLBACK_ADMIN_SLUG;
  }

  const parts = h.split(".");
  const [subdomain] = parts;
  const isTunzoneSubdomain =
    parts.length >= 3 && parts.at(-2) === "tunzone" && parts.at(-1) === "com";
  if (isTunzoneSubdomain && subdomain && !RESERVED_SUBDOMAINS.has(subdomain)) {
    return subdomain;
  }

  return envSlug || FALLBACK_ADMIN_SLUG;
}

export function getPublishedAdminSlug(): string {
  if (typeof window === "undefined") return FALLBACK_ADMIN_SLUG;

  return getPublishedAdminSlugFromHost(window.location.host);
}
