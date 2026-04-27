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
