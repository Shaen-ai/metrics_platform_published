const DEFAULT_DEV_API = "http://localhost:8000/api";
const DEFAULT_DEV_SITE = "http://localhost:3001";

function withoutTrailingSlashes(s: string): string {
  return s.replace(/\/+$/, "");
}

/** Laravel `/api` base URL, e.g. `https://api.tunzone.com/api` in production, localhost in dev. */
export function getPublicApiUrl(): string {
  return withoutTrailingSlashes(process.env.NEXT_PUBLIC_API_URL || DEFAULT_DEV_API);
}

export const publicApiUrl = getPublicApiUrl();

export function getPublishedSiteUrl(): string {
  return withoutTrailingSlashes(process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_DEV_SITE);
}

export const publishedSiteUrl = getPublishedSiteUrl();

const DEFAULT_SUPPORT_EMAIL = "support@tunzone.com";

/** Mailto target for “Contact” / support in the storefront footer. Override with NEXT_PUBLIC_CONTACT_SUPPORT_EMAIL. */
export function getContactSupportEmail(): string {
  return (
    process.env.NEXT_PUBLIC_CONTACT_SUPPORT_EMAIL?.trim() || DEFAULT_SUPPORT_EMAIL
  );
}

export const contactSupportEmail = getContactSupportEmail();
