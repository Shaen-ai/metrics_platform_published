import type { Admin } from "@/lib/types";
import { getPublicApiUrl } from "@/lib/publicEnv";

const FALLBACK_LOGO = "/logo.png";

function apiStorageBaseUrl(): string {
  return getPublicApiUrl().replace(/\/api\/?$/, "") || "http://localhost:8000";
}

function loopbackHost(h: string): boolean {
  const n = h.toLowerCase();
  return n === "localhost" || n === "127.0.0.1" || n === "::1";
}

function sameLoopback(a: string, b: string): boolean {
  return loopbackHost(a) && loopbackHost(b);
}

function defaultPort(protocol: string): string {
  return protocol === "https:" ? "443" : "80";
}

function normalizedPort(u: URL): string {
  return u.port || defaultPort(u.protocol);
}

/**
 * If the logo is served from our Laravel `public` disk (`/storage/...`), prefer a site-relative
 * URL so `next.config` rewrites proxy to the API and `next/image` loads reliably in dev
 * (avoids optimizer fetching another origin).
 */
export function normalizePublishedLogoUrl(logoUrl: string): string {
  const trimmed = logoUrl.trim();
  if (!trimmed) return FALLBACK_LOGO;
  if (trimmed.startsWith("/storage/")) return trimmed;

  let absolute: URL;
  try {
    absolute = new URL(trimmed);
  } catch {
    return trimmed;
  }

  if (!absolute.pathname.startsWith("/storage/")) return trimmed;

  let api: URL;
  try {
    api = new URL(apiStorageBaseUrl());
  } catch {
    return trimmed;
  }

  if (absolute.protocol !== api.protocol) return trimmed;

  const hostMatch =
    absolute.hostname.toLowerCase() === api.hostname.toLowerCase() ||
    sameLoopback(absolute.hostname, api.hostname);

  if (!hostMatch) return trimmed;

  if (normalizedPort(absolute) !== normalizedPort(api)) return trimmed;

  return `${absolute.pathname}${absolute.search}`;
}

/** Public storefront logo: admin upload or platform default. */
export function getStorefrontLogoSrc(admin: Admin | null | undefined): string {
  const url = admin?.logo?.trim();
  if (!url) return FALLBACK_LOGO;
  return normalizePublishedLogoUrl(url);
}
