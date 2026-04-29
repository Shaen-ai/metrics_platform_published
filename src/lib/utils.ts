import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(price: number, currency: string = "USD"): string {
  const code = (currency || "USD").trim().toUpperCase();
  const symbols: Record<string, string> = {
    USD: "$",
    EUR: "€",
    GBP: "£",
    AMD: "֏",
    RUB: "₽",
  };

  const symbol = symbols[code] || code;
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(price);

  if (code === "AMD" || code === "RUB") {
    return `${formatted} ${symbol}`;
  }

  return `${symbol}${formatted}`;
}

/**
 * Strip the backend origin from storage URLs so they load via Next rewrites (/storage, /files).
 * Avoids CORS/CORP issues for the model-viewer web component and related fetches.
 */
export function toRelativeStorageUrl(url: string | undefined): string {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("/")) return trimmed;
  try {
    const u = new URL(trimmed);
    if (u.pathname.startsWith("/storage/") || u.pathname.startsWith("/files/")) {
      return u.pathname + u.search + u.hash;
    }
  } catch {
    /* not absolute */
  }
  return trimmed;
}
