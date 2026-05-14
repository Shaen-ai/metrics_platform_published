import { getPublishedSiteUrl, publicApiUrl } from "./publicEnv";

/**
 * Turn API material `imageUrl` into an absolute URL (handles `/storage/...` etc.).
 */
export function resolveMaterialImageUrl(raw: string | undefined): string | undefined {
  const u = raw?.trim();
  if (!u) return undefined;
  if (u.startsWith("http://") || u.startsWith("https://") || u.startsWith("data:") || u.startsWith("blob:")) {
    return u;
  }
  if (u.startsWith("/")) {
    return `${new URL(publicApiUrl).origin}${u}`;
  }
  return u;
}

/**
 * Browser-safe swatch URL: same-origin / API URLs unchanged; external CDNs via image-proxy
 * (matches planner `proxyTextureUrl` without pulling Three.js).
 */
export function materialThumbnailSrc(raw: string | undefined): string | undefined {
  const url = resolveMaterialImageUrl(raw);
  if (!url) return undefined;
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return url;
    const apiOrigin = new URL(publicApiUrl).origin;
    const siteOrigin =
      typeof window !== "undefined" ? window.location.origin : new URL(getPublishedSiteUrl()).origin;
    if (parsed.origin === apiOrigin || parsed.origin === siteOrigin) {
      return url;
    }
    return `/api/image-proxy?url=${encodeURIComponent(url)}`;
  } catch {
    return url;
  }
}
