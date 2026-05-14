import type { FabricObject } from "fabric";
import type { FurnitureIconKey } from "./furniturePresets";

type IconObject = FabricObject & {
  isSheetAnnotation?: boolean;
  sheetParentId?: string;
  sheetRole?: string;
};

type FabricModule = typeof import("fabric");

type IconSvgFactory = (w: number, h: number) => string;

const ICONS: Record<string, IconSvgFactory> = {
  "sofa-2": (w, h) => `
    <defs>
      <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#d4d0cb"/>
        <stop offset="100%" stop-color="#b8b4ae"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${w}" height="${h}" rx="6" fill="#c8c4be" stroke="#888" stroke-width="1.5"/>
    <rect x="0" y="0" width="${w}" height="${h * 0.28}" rx="5" fill="#a8a49e" stroke="#777" stroke-width="1"/>
    <rect x="0" y="${h * 0.28}" width="${w * 0.11}" height="${h * 0.58}" rx="4" fill="#a8a49e" stroke="#777" stroke-width="1"/>
    <rect x="${w * 0.89}" y="${h * 0.28}" width="${w * 0.11}" height="${h * 0.58}" rx="4" fill="#a8a49e" stroke="#777" stroke-width="1"/>
    <rect x="${w * 0.11}" y="${h * 0.32}" width="${w * 0.37}" height="${h * 0.52}" rx="4" fill="#d8d4ce" stroke="#aaa" stroke-width="1"/>
    <rect x="${w * 0.52}" y="${h * 0.32}" width="${w * 0.37}" height="${h * 0.52}" rx="4" fill="#d8d4ce" stroke="#aaa" stroke-width="1"/>
    <rect x="${w * 0.11}" y="${h * 0.82}" width="${w * 0.78}" height="${h * 0.12}" rx="3" fill="#b0aca6" stroke="#888" stroke-width="1"/>`,
  "sofa-3": (w, h) => `
    <rect x="0" y="0" width="${w}" height="${h}" rx="6" fill="#c8c4be" stroke="#888" stroke-width="1.5"/>
    <rect x="0" y="0" width="${w}" height="${h * 0.28}" rx="5" fill="#a8a49e" stroke="#777" stroke-width="1"/>
    <rect x="0" y="${h * 0.28}" width="${w * 0.09}" height="${h * 0.58}" rx="4" fill="#a8a49e" stroke="#777" stroke-width="1"/>
    <rect x="${w * 0.91}" y="${h * 0.28}" width="${w * 0.09}" height="${h * 0.58}" rx="4" fill="#a8a49e" stroke="#777" stroke-width="1"/>
    <rect x="${w * 0.09}" y="${h * 0.32}" width="${w * 0.25}" height="${h * 0.52}" rx="4" fill="#d8d4ce" stroke="#aaa" stroke-width="1"/>
    <rect x="${w * 0.375}" y="${h * 0.32}" width="${w * 0.25}" height="${h * 0.52}" rx="4" fill="#d8d4ce" stroke="#aaa" stroke-width="1"/>
    <rect x="${w * 0.66}" y="${h * 0.32}" width="${w * 0.25}" height="${h * 0.52}" rx="4" fill="#d8d4ce" stroke="#aaa" stroke-width="1"/>
    <rect x="${w * 0.09}" y="${h * 0.82}" width="${w * 0.82}" height="${h * 0.12}" rx="3" fill="#b0aca6" stroke="#888" stroke-width="1"/>`,
  "armchair": (w, h) => `
    <rect x="0" y="0" width="${w}" height="${h}" rx="6" fill="#c8c4be" stroke="#888" stroke-width="1.5"/>
    <rect x="0" y="0" width="${w}" height="${h * 0.28}" rx="5" fill="#a8a49e" stroke="#777" stroke-width="1"/>
    <rect x="0" y="${h * 0.28}" width="${w * 0.14}" height="${h * 0.58}" rx="4" fill="#a8a49e" stroke="#777" stroke-width="1"/>
    <rect x="${w * 0.86}" y="${h * 0.28}" width="${w * 0.14}" height="${h * 0.58}" rx="4" fill="#a8a49e" stroke="#777" stroke-width="1"/>
    <rect x="${w * 0.14}" y="${h * 0.32}" width="${w * 0.72}" height="${h * 0.52}" rx="4" fill="#d8d4ce" stroke="#aaa" stroke-width="1"/>
    <rect x="${w * 0.14}" y="${h * 0.82}" width="${w * 0.72}" height="${h * 0.12}" rx="3" fill="#b0aca6" stroke="#888" stroke-width="1"/>`,
  "coffee-table": (w, h) => `
    <rect x="${w * 0.04}" y="${h * 0.04}" width="${w * 0.92}" height="${h * 0.92}" rx="6" fill="#e8e4dc" stroke="#999" stroke-width="1.5"/>
    <rect x="${w * 0.10}" y="${h * 0.10}" width="${w * 0.80}" height="${h * 0.80}" rx="4" fill="none" stroke="#bbb" stroke-width="1"/>
    <circle cx="${w * 0.15}" cy="${h * 0.15}" r="${Math.min(w, h) * 0.04}" fill="#ccc" stroke="#aaa" stroke-width="1"/>
    <circle cx="${w * 0.85}" cy="${h * 0.15}" r="${Math.min(w, h) * 0.04}" fill="#ccc" stroke="#aaa" stroke-width="1"/>
    <circle cx="${w * 0.15}" cy="${h * 0.85}" r="${Math.min(w, h) * 0.04}" fill="#ccc" stroke="#aaa" stroke-width="1"/>
    <circle cx="${w * 0.85}" cy="${h * 0.85}" r="${Math.min(w, h) * 0.04}" fill="#ccc" stroke="#aaa" stroke-width="1"/>`,
  "tv-unit": (w, h) => `
    <rect x="0" y="0" width="${w}" height="${h}" rx="4" fill="#d8d4cc" stroke="#888" stroke-width="1.5"/>
    <rect x="${w * 0.03}" y="${h * 0.08}" width="${w * 0.94}" height="${h * 0.55}" rx="3" fill="#bbb8b2" stroke="#999" stroke-width="1"/>
    <rect x="${w * 0.03}" y="${h * 0.68}" width="${w * 0.94}" height="${h * 0.08}" rx="2" fill="#ccc9c2" stroke="#aaa" stroke-width="0.5"/>
    <rect x="${w * 0.03}" y="${h * 0.78}" width="${w * 0.94}" height="${h * 0.08}" rx="2" fill="#ccc9c2" stroke="#aaa" stroke-width="0.5"/>
    <circle cx="${w * 0.50}" cy="${h * 0.35}" r="${Math.min(w, h) * 0.06}" fill="#a0a09a" stroke="#888" stroke-width="1"/>`,
  "bookshelf": (w, h) => `
    <rect x="0" y="0" width="${w}" height="${h}" rx="3" fill="#ddd8d0" stroke="#888" stroke-width="1.5"/>
    <rect x="${w * 0.03}" y="${h * 0.06}" width="${w * 0.94}" height="${h * 0.20}" rx="2" fill="#e8e2d8" stroke="#aaa" stroke-width="0.5"/>
    <rect x="${w * 0.03}" y="${h * 0.30}" width="${w * 0.94}" height="${h * 0.20}" rx="2" fill="#e0dbd0" stroke="#aaa" stroke-width="0.5"/>
    <rect x="${w * 0.03}" y="${h * 0.54}" width="${w * 0.94}" height="${h * 0.20}" rx="2" fill="#e8e2d8" stroke="#aaa" stroke-width="0.5"/>
    <rect x="${w * 0.03}" y="${h * 0.78}" width="${w * 0.94}" height="${h * 0.17}" rx="2" fill="#e0dbd0" stroke="#aaa" stroke-width="0.5"/>
    <rect x="${w * 0.06}" y="${h * 0.08}" width="${w * 0.08}" height="${h * 0.16}" rx="1" fill="#c8a87a" stroke="none"/>
    <rect x="${w * 0.16}" y="${h * 0.08}" width="${w * 0.06}" height="${h * 0.16}" rx="1" fill="#a07850" stroke="none"/>
    <rect x="${w * 0.24}" y="${h * 0.08}" width="${w * 0.09}" height="${h * 0.16}" rx="1" fill="#b89060" stroke="none"/>
    <rect x="${w * 0.06}" y="${h * 0.32}" width="${w * 0.07}" height="${h * 0.16}" rx="1" fill="#8090b0" stroke="none"/>
    <rect x="${w * 0.15}" y="${h * 0.32}" width="${w * 0.10}" height="${h * 0.16}" rx="1" fill="#a0b090" stroke="none"/>`,
  "corner-shelf": (w, h) => `
    <polygon points="0,0 ${w},0 0,${h}" fill="#ddd8d0" stroke="#888" stroke-width="1.5"/>
    <polygon points="${w * 0.08},0 ${w * 0.85},0 0,${h * 0.85} 0,${h * 0.08}" fill="#e8e4dc" stroke="#aaa" stroke-width="1"/>
    <line x1="${w * 0.33}" y1="0" x2="0" y2="${h * 0.33}" stroke="#bbb" stroke-width="1"/>
    <line x1="${w * 0.66}" y1="0" x2="0" y2="${h * 0.66}" stroke="#bbb" stroke-width="1"/>`,
  "single-bed": (w, h) => `
    <rect x="0" y="0" width="${w}" height="${h}" rx="5" fill="#e0dcd8" stroke="#888" stroke-width="1.5"/>
    <rect x="0" y="0" width="${w}" height="${h * 0.16}" rx="5" fill="#b8b0a8" stroke="#777" stroke-width="1"/>
    <rect x="${w * 0.06}" y="${h * 0.02}" width="${w * 0.88}" height="${h * 0.12}" rx="4" fill="#ccc8c0" stroke="#999" stroke-width="0.5"/>
    <rect x="0" y="${h * 0.86}" width="${w}" height="${h * 0.14}" rx="4" fill="#c8c4c0" stroke="#888" stroke-width="1"/>
    <rect x="${w * 0.15}" y="${h * 0.19}" width="${w * 0.70}" height="${h * 0.64}" rx="4" fill="#f0ede8" stroke="#bbb" stroke-width="1"/>
    <rect x="${w * 0.20}" y="${h * 0.22}" width="${w * 0.60}" height="${h * 0.13}" rx="6" fill="#e8e4e0" stroke="#ccc" stroke-width="1"/>`,
  "double-bed": (w, h) => `
    <rect x="0" y="0" width="${w}" height="${h}" rx="5" fill="#e0dcd8" stroke="#888" stroke-width="1.5"/>
    <rect x="0" y="0" width="${w}" height="${h * 0.16}" rx="5" fill="#b8b0a8" stroke="#777" stroke-width="1"/>
    <rect x="${w * 0.04}" y="${h * 0.02}" width="${w * 0.92}" height="${h * 0.12}" rx="4" fill="#ccc8c0" stroke="#999" stroke-width="0.5"/>
    <rect x="0" y="${h * 0.86}" width="${w}" height="${h * 0.14}" rx="4" fill="#c8c4c0" stroke="#888" stroke-width="1"/>
    <rect x="${w * 0.04}" y="${h * 0.19}" width="${w * 0.92}" height="${h * 0.64}" rx="4" fill="#f0ede8" stroke="#bbb" stroke-width="1"/>
    <line x1="${w * 0.50}" y1="${h * 0.19}" x2="${w * 0.50}" y2="${h * 0.86}" stroke="#ddd" stroke-width="1"/>
    <rect x="${w * 0.07}" y="${h * 0.22}" width="${w * 0.38}" height="${h * 0.13}" rx="6" fill="#e8e4e0" stroke="#ccc" stroke-width="1"/>
    <rect x="${w * 0.55}" y="${h * 0.22}" width="${w * 0.38}" height="${h * 0.13}" rx="6" fill="#e8e4e0" stroke="#ccc" stroke-width="1"/>`,
  "king-bed": (w, h) => `
    <rect x="0" y="0" width="${w}" height="${h}" rx="5" fill="#e0dcd8" stroke="#888" stroke-width="1.5"/>
    <rect x="0" y="0" width="${w}" height="${h * 0.16}" rx="5" fill="#b8b0a8" stroke="#777" stroke-width="1"/>
    <rect x="${w * 0.04}" y="${h * 0.02}" width="${w * 0.92}" height="${h * 0.12}" rx="4" fill="#ccc8c0" stroke="#999" stroke-width="0.5"/>
    <rect x="0" y="${h * 0.86}" width="${w}" height="${h * 0.14}" rx="4" fill="#c8c4c0" stroke="#888" stroke-width="1"/>
    <rect x="${w * 0.04}" y="${h * 0.19}" width="${w * 0.92}" height="${h * 0.64}" rx="4" fill="#f0ede8" stroke="#bbb" stroke-width="1"/>
    <line x1="${w * 0.50}" y1="${h * 0.19}" x2="${w * 0.50}" y2="${h * 0.86}" stroke="#ddd" stroke-width="1"/>
    <rect x="${w * 0.06}" y="${h * 0.22}" width="${w * 0.40}" height="${h * 0.13}" rx="6" fill="#e8e4e0" stroke="#ccc" stroke-width="1"/>
    <rect x="${w * 0.54}" y="${h * 0.22}" width="${w * 0.40}" height="${h * 0.13}" rx="6" fill="#e8e4e0" stroke="#ccc" stroke-width="1"/>`,
  "nightstand": (w, h) => `
    <rect x="0" y="0" width="${w}" height="${h}" rx="4" fill="#ddd8d0" stroke="#888" stroke-width="1.5"/>
    <line x1="${w * 0.06}" y1="${h * 0.52}" x2="${w * 0.94}" y2="${h * 0.52}" stroke="#aaa" stroke-width="1"/>
    <rect x="${w * 0.30}" y="${h * 0.20}" width="${w * 0.40}" height="${h * 0.10}" rx="3" fill="#c8c4bc" stroke="#999" stroke-width="1"/>
    <rect x="${w * 0.30}" y="${h * 0.70}" width="${w * 0.40}" height="${h * 0.10}" rx="3" fill="#c8c4bc" stroke="#999" stroke-width="1"/>`,
  "dresser": (w, h) => `
    <rect x="0" y="0" width="${w}" height="${h}" rx="4" fill="#ddd8d0" stroke="#888" stroke-width="1.5"/>
    <rect x="${w * 0.04}" y="${h * 0.04}" width="${w * 0.92}" height="${h * 0.21}" rx="3" fill="#e8e2d8" stroke="#aaa" stroke-width="1"/>
    <rect x="${w * 0.04}" y="${h * 0.29}" width="${w * 0.92}" height="${h * 0.21}" rx="3" fill="#e0dbd0" stroke="#aaa" stroke-width="1"/>
    <rect x="${w * 0.04}" y="${h * 0.54}" width="${w * 0.92}" height="${h * 0.21}" rx="3" fill="#e8e2d8" stroke="#aaa" stroke-width="1"/>
    <rect x="${w * 0.04}" y="${h * 0.79}" width="${w * 0.92}" height="${h * 0.17}" rx="3" fill="#e0dbd0" stroke="#aaa" stroke-width="1"/>
    <rect x="${w * 0.38}" y="${h * 0.12}" width="${w * 0.24}" height="${h * 0.07}" rx="3" fill="#c0bbb5" stroke="#999" stroke-width="1"/>
    <rect x="${w * 0.38}" y="${h * 0.37}" width="${w * 0.24}" height="${h * 0.07}" rx="3" fill="#c0bbb5" stroke="#999" stroke-width="1"/>
    <rect x="${w * 0.38}" y="${h * 0.62}" width="${w * 0.24}" height="${h * 0.07}" rx="3" fill="#c0bbb5" stroke="#999" stroke-width="1"/>
    <rect x="${w * 0.38}" y="${h * 0.85}" width="${w * 0.24}" height="${h * 0.07}" rx="3" fill="#c0bbb5" stroke="#999" stroke-width="1"/>`,
  "wardrobe": (w, h) => `
    <rect x="0" y="0" width="${w}" height="${h}" rx="4" fill="#ddd8d0" stroke="#888" stroke-width="1.5"/>
    <line x1="${w * 0.50}" y1="${h * 0.03}" x2="${w * 0.50}" y2="${h * 0.97}" stroke="#aaa" stroke-width="1"/>
    <path d="M${w * 0.50},${h * 0.25} Q${w * 0.30},${h * 0.40} ${w * 0.10},${h * 0.50}" fill="none" stroke="#bbb" stroke-width="1"/>
    <path d="M${w * 0.50},${h * 0.25} Q${w * 0.70},${h * 0.40} ${w * 0.90},${h * 0.50}" fill="none" stroke="#bbb" stroke-width="1"/>
    <circle cx="${w * 0.38}" cy="${h * 0.52}" r="${Math.min(w, h) * 0.04}" fill="#c0bbb5" stroke="#999" stroke-width="1"/>
    <circle cx="${w * 0.62}" cy="${h * 0.52}" r="${Math.min(w, h) * 0.04}" fill="#c0bbb5" stroke="#999" stroke-width="1"/>`,
  "toilet": (w, h) => `
    <rect x="${w * 0.05}" y="0" width="${w * 0.90}" height="${h * 0.32}" rx="4" fill="#e8e8e8" stroke="#888" stroke-width="1.5"/>
    <rect x="${w * 0.10}" y="${h * 0.04}" width="${w * 0.80}" height="${h * 0.22}" rx="3" fill="#f0f0f0" stroke="#bbb" stroke-width="1"/>
    <ellipse cx="${w * 0.50}" cy="${h * 0.66}" rx="${w * 0.42}" ry="${h * 0.32}" fill="#f0f0f0" stroke="#888" stroke-width="1.5"/>
    <ellipse cx="${w * 0.50}" cy="${h * 0.66}" rx="${w * 0.34}" ry="${h * 0.26}" fill="#e0e0e0" stroke="#bbb" stroke-width="1"/>
    <ellipse cx="${w * 0.50}" cy="${h * 0.68}" rx="${w * 0.14}" ry="${h * 0.10}" fill="#d0d0d0" stroke="#aaa" stroke-width="0.5"/>`,
  "bathtub": (w, h) => `
    <rect x="0" y="0" width="${w}" height="${h}" rx="12" fill="#efefef" stroke="#888" stroke-width="1.5"/>
    <rect x="${w * 0.06}" y="${h * 0.10}" width="${w * 0.88}" height="${h * 0.80}" rx="10" fill="#e0e8f0" stroke="#bbb" stroke-width="1"/>
    <ellipse cx="${w * 0.50}" cy="${h * 0.50}" rx="${w * 0.30}" ry="${h * 0.24}" fill="#d0dce8" stroke="#bbb" stroke-width="0.5"/>
    <circle cx="${w * 0.50}" cy="${h * 0.88}" r="${Math.min(w, h) * 0.04}" fill="#bbb" stroke="#999" stroke-width="1"/>
    <circle cx="${w * 0.35}" cy="${h * 0.14}" r="${Math.min(w, h) * 0.04}" fill="#ccc" stroke="#aaa" stroke-width="1"/>
    <circle cx="${w * 0.65}" cy="${h * 0.14}" r="${Math.min(w, h) * 0.04}" fill="#ccc" stroke="#aaa" stroke-width="1"/>`,
  "shower": (w, h) => `
    <rect x="0" y="0" width="${w}" height="${h}" rx="4" fill="#f0f0f0" stroke="#888" stroke-width="1.5"/>
    <line x1="${w * 0.42}" y1="0" x2="${w * 0.42}" y2="${h}" stroke="#bbb" stroke-width="1.5" stroke-dasharray="5 3"/>
    <line x1="0" y1="${h * 0.42}" x2="${w}" y2="${h * 0.42}" stroke="#bbb" stroke-width="1.5" stroke-dasharray="5 3"/>
    <path d="M0,${h * 0.42} A${w * 0.42},${h * 0.42} 0 0,0 ${w * 0.42},0 L0,0 Z" fill="#d8eaf8" stroke="#88aacc" stroke-width="1"/>
    <circle cx="${w * 0.21}" cy="${h * 0.21}" r="${Math.min(w, h) * 0.12}" fill="none" stroke="#88aacc" stroke-width="1.5"/>
    <circle cx="${w * 0.21}" cy="${h * 0.21}" r="${Math.min(w, h) * 0.04}" fill="#88aacc" stroke="none"/>
    <line x1="${w * 0.21}" y1="${h * 0.09}" x2="${w * 0.21}" y2="${h * 0.04}" stroke="#88aacc" stroke-width="1.5"/>
    <line x1="${w * 0.21}" y1="${h * 0.33}" x2="${w * 0.21}" y2="${h * 0.38}" stroke="#88aacc" stroke-width="1.5"/>
    <line x1="${w * 0.09}" y1="${h * 0.21}" x2="${w * 0.04}" y2="${h * 0.21}" stroke="#88aacc" stroke-width="1.5"/>
    <line x1="${w * 0.33}" y1="${h * 0.21}" x2="${w * 0.38}" y2="${h * 0.21}" stroke="#88aacc" stroke-width="1.5"/>`,
  "sink-bathroom": (w, h) => `
    <rect x="0" y="0" width="${w}" height="${h}" rx="5" fill="#efefef" stroke="#888" stroke-width="1.5"/>
    <ellipse cx="${w * 0.50}" cy="${h * 0.55}" rx="${w * 0.38}" ry="${h * 0.36}" fill="#e0e8f0" stroke="#99aacc" stroke-width="1.5"/>
    <ellipse cx="${w * 0.50}" cy="${h * 0.55}" rx="${w * 0.26}" ry="${h * 0.24}" fill="#d4e0ec" stroke="#aabb" stroke-width="0.5"/>
    <circle cx="${w * 0.50}" cy="${h * 0.55}" r="${Math.min(w, h) * 0.05}" fill="#aaa" stroke="#888" stroke-width="1"/>
    <rect x="${w * 0.38}" y="${h * 0.06}" width="${w * 0.24}" height="${h * 0.12}" rx="4" fill="#ddd" stroke="#aaa" stroke-width="1"/>
    <circle cx="${w * 0.35}" cy="${h * 0.12}" r="${Math.min(w, h) * 0.04}" fill="#ccc" stroke="#aaa" stroke-width="1"/>
    <circle cx="${w * 0.65}" cy="${h * 0.12}" r="${Math.min(w, h) * 0.04}" fill="#ccc" stroke="#aaa" stroke-width="1"/>`,
  "vanity": (w, h) => `
    <rect x="0" y="0" width="${w}" height="${h}" rx="4" fill="#efefef" stroke="#888" stroke-width="1.5"/>
    <line x1="0" y1="${h * 0.18}" x2="${w}" y2="${h * 0.18}" stroke="#ccc" stroke-width="1"/>
    <ellipse cx="${w * 0.50}" cy="${h * 0.62}" rx="${w * 0.32}" ry="${h * 0.28}" fill="#e0e8f0" stroke="#99aacc" stroke-width="1.5"/>
    <circle cx="${w * 0.50}" cy="${h * 0.62}" r="${Math.min(w, h) * 0.05}" fill="#aaa" stroke="#888" stroke-width="1"/>
    <circle cx="${w * 0.34}" cy="${h * 0.09}" r="${Math.min(w, h) * 0.04}" fill="#ccc" stroke="#aaa" stroke-width="1"/>
    <circle cx="${w * 0.66}" cy="${h * 0.09}" r="${Math.min(w, h) * 0.04}" fill="#ccc" stroke="#aaa" stroke-width="1"/>`,
  "dining-table-4": (w, h) => `
    <rect x="${w * 0.16}" y="${h * 0.16}" width="${w * 0.68}" height="${h * 0.68}" rx="5" fill="#d8d0c4" stroke="#888" stroke-width="1.5"/>
    <rect x="${w * 0.20}" y="${h * 0.20}" width="${w * 0.60}" height="${h * 0.60}" rx="4" fill="#e4ddd4" stroke="#aaa" stroke-width="0.5"/>
    <rect x="${w * 0.33}" y="${h * 0.01}" width="${w * 0.34}" height="${h * 0.13}" rx="4" fill="#c8c4bc" stroke="#888" stroke-width="1"/>
    <rect x="${w * 0.33}" y="${h * 0.86}" width="${w * 0.34}" height="${h * 0.13}" rx="4" fill="#c8c4bc" stroke="#888" stroke-width="1"/>
    <rect x="${w * 0.01}" y="${h * 0.33}" width="${w * 0.13}" height="${h * 0.34}" rx="4" fill="#c8c4bc" stroke="#888" stroke-width="1"/>
    <rect x="${w * 0.86}" y="${h * 0.33}" width="${w * 0.13}" height="${h * 0.34}" rx="4" fill="#c8c4bc" stroke="#888" stroke-width="1"/>`,
  "dining-table-6": (w, h) => `
    <rect x="${w * 0.12}" y="${h * 0.14}" width="${w * 0.76}" height="${h * 0.72}" rx="5" fill="#d8d0c4" stroke="#888" stroke-width="1.5"/>
    <rect x="${w * 0.16}" y="${h * 0.18}" width="${w * 0.68}" height="${h * 0.64}" rx="4" fill="#e4ddd4" stroke="#aaa" stroke-width="0.5"/>
    <rect x="${w * 0.36}" y="${h * 0.01}" width="${w * 0.28}" height="${h * 0.11}" rx="3" fill="#c8c4bc" stroke="#888" stroke-width="1"/>
    <rect x="${w * 0.36}" y="${h * 0.88}" width="${w * 0.28}" height="${h * 0.11}" rx="3" fill="#c8c4bc" stroke="#888" stroke-width="1"/>
    <rect x="${w * 0.01}" y="${h * 0.20}" width="${w * 0.10}" height="${h * 0.18}" rx="3" fill="#c8c4bc" stroke="#888" stroke-width="1"/>
    <rect x="${w * 0.01}" y="${h * 0.62}" width="${w * 0.10}" height="${h * 0.18}" rx="3" fill="#c8c4bc" stroke="#888" stroke-width="1"/>
    <rect x="${w * 0.89}" y="${h * 0.20}" width="${w * 0.10}" height="${h * 0.18}" rx="3" fill="#c8c4bc" stroke="#888" stroke-width="1"/>
    <rect x="${w * 0.89}" y="${h * 0.62}" width="${w * 0.10}" height="${h * 0.18}" rx="3" fill="#c8c4bc" stroke="#888" stroke-width="1"/>`,
  "dining-chair": (w, h) => `
    <rect x="${w * 0.05}" y="0" width="${w * 0.90}" height="${h * 0.22}" rx="4" fill="#b8b4ae" stroke="#777" stroke-width="1.5"/>
    <rect x="${w * 0.08}" y="${h * 0.26}" width="${w * 0.84}" height="${h * 0.60}" rx="5" fill="#d0ccc6" stroke="#888" stroke-width="1.5"/>
    <rect x="${w * 0.14}" y="${h * 0.32}" width="${w * 0.72}" height="${h * 0.48}" rx="4" fill="#dcd8d2" stroke="#aaa" stroke-width="0.5"/>
    <rect x="${w * 0.08}" y="${h * 0.85}" width="${w * 0.84}" height="${h * 0.10}" rx="3" fill="#b8b4ae" stroke="#888" stroke-width="1"/>`,
  "desk": (w, h) => `
    <rect x="0" y="0" width="${w}" height="${h}" rx="4" fill="#ddd8d0" stroke="#888" stroke-width="1.5"/>
    <rect x="0" y="0" width="${w}" height="${h * 0.22}" rx="4" fill="#c8c4bc" stroke="#888" stroke-width="1"/>
    <rect x="${w * 0.30}" y="${h * 0.08}" width="${w * 0.40}" height="${h * 0.08}" rx="3" fill="#b8b4ae" stroke="#999" stroke-width="1"/>
    <rect x="${w * 0.04}" y="${h * 0.30}" width="${w * 0.92}" height="${h * 0.58}" rx="3" fill="#e8e4dc" stroke="#aaa" stroke-width="0.5"/>
    <rect x="${w * 0.35}" y="${h * 0.38}" width="${w * 0.30}" height="${h * 0.18}" rx="2" fill="#d0ccC4" stroke="#bbb" stroke-width="0.5"/>`,
  "l-desk": (w, h) => `
    <polygon points="0,0 ${w},0 ${w},${h * 0.52} ${w * 0.52},${h * 0.52} ${w * 0.52},${h} 0,${h}"
      fill="#ddd8d0" stroke="#888" stroke-width="1.5" stroke-linejoin="round"/>
    <polygon points="${w * 0.04},${h * 0.04} ${w * 0.96},${h * 0.04} ${w * 0.96},${h * 0.48} ${w * 0.56},${h * 0.48} ${w * 0.56},${h * 0.96} ${w * 0.04},${h * 0.96}"
      fill="none" stroke="#bbb" stroke-width="0.5"/>
    <line x1="${w * 0.52}" y1="${h * 0.04}" x2="${w * 0.52}" y2="${h * 0.52}" stroke="#aaa" stroke-width="1"/>
    <line x1="${w * 0.04}" y1="${h * 0.52}" x2="${w * 0.52}" y2="${h * 0.52}" stroke="#aaa" stroke-width="1"/>`,
  "office-chair": (w, h) => `
    <rect x="${w * 0.28}" y="${h * 0.02}" width="${w * 0.44}" height="${h * 0.20}" rx="5" fill="#b8b4ae" stroke="#777" stroke-width="1.5"/>
    <circle cx="${w * 0.50}" cy="${h * 0.52}" r="${Math.min(w, h) * 0.34}" fill="#c8c4be" stroke="#888" stroke-width="1.5"/>
    <circle cx="${w * 0.50}" cy="${h * 0.52}" r="${Math.min(w, h) * 0.22}" fill="#d8d4ce" stroke="#aaa" stroke-width="1"/>
    <line x1="${w * 0.50}" y1="${h * 0.86}" x2="${w * 0.50}" y2="${h * 0.96}" stroke="#888" stroke-width="2"/>
    <line x1="${w * 0.20}" y1="${h * 0.96}" x2="${w * 0.80}" y2="${h * 0.96}" stroke="#888" stroke-width="2"/>
    <circle cx="${w * 0.20}" cy="${h * 0.96}" r="${Math.min(w, h) * 0.03}" fill="#888" stroke="none"/>
    <circle cx="${w * 0.50}" cy="${h * 0.96}" r="${Math.min(w, h) * 0.03}" fill="#888" stroke="none"/>
    <circle cx="${w * 0.80}" cy="${h * 0.96}" r="${Math.min(w, h) * 0.03}" fill="#888" stroke="none"/>`,
  "filing-cabinet": (w, h) => `
    <rect x="0" y="0" width="${w}" height="${h}" rx="4" fill="#d0ccc8" stroke="#888" stroke-width="1.5"/>
    <rect x="${w * 0.04}" y="${h * 0.03}" width="${w * 0.92}" height="${h * 0.30}" rx="3" fill="#dcd8d4" stroke="#aaa" stroke-width="1"/>
    <rect x="${w * 0.04}" y="${h * 0.37}" width="${w * 0.92}" height="${h * 0.30}" rx="3" fill="#d8d4d0" stroke="#aaa" stroke-width="1"/>
    <rect x="${w * 0.04}" y="${h * 0.71}" width="${w * 0.92}" height="${h * 0.26}" rx="3" fill="#dcd8d4" stroke="#aaa" stroke-width="1"/>
    <rect x="${w * 0.36}" y="${h * 0.15}" width="${w * 0.28}" height="${h * 0.08}" rx="3" fill="#b8b4b0" stroke="#999" stroke-width="1"/>
    <rect x="${w * 0.36}" y="${h * 0.49}" width="${w * 0.28}" height="${h * 0.08}" rx="3" fill="#b8b4b0" stroke="#999" stroke-width="1"/>
    <rect x="${w * 0.36}" y="${h * 0.80}" width="${w * 0.28}" height="${h * 0.08}" rx="3" fill="#b8b4b0" stroke="#999" stroke-width="1"/>`,
  "base": (w, h) => `
    <rect x="0" y="0" width="${w}" height="${h}" rx="3" fill="#ddd8d0" stroke="#888" stroke-width="1.5"/>
    <line x1="${w * 0.50}" y1="0" x2="${w * 0.50}" y2="${h}" stroke="#bbb" stroke-width="1"/>
    <rect x="${w * 0.30}" y="${h * 0.44}" width="${w * 0.12}" height="${h * 0.12}" rx="2" fill="#b8b4ae" stroke="#999" stroke-width="1"/>
    <rect x="${w * 0.58}" y="${h * 0.44}" width="${w * 0.12}" height="${h * 0.12}" rx="2" fill="#b8b4ae" stroke="#999" stroke-width="1"/>`,
  "wall": (w, h) => `
    <rect x="0" y="0" width="${w}" height="${h}" rx="3" fill="#d8d4cc" stroke="#888" stroke-width="1.5"/>
    <line x1="${w * 0.50}" y1="0" x2="${w * 0.50}" y2="${h}" stroke="#bbb" stroke-width="1"/>
    <rect x="${w * 0.30}" y="${h * 0.35}" width="${w * 0.12}" height="${h * 0.14}" rx="2" fill="#b8b4ae" stroke="#999" stroke-width="1"/>
    <rect x="${w * 0.58}" y="${h * 0.35}" width="${w * 0.12}" height="${h * 0.14}" rx="2" fill="#b8b4ae" stroke="#999" stroke-width="1"/>`,
  "tall": (w, h) => `
    <rect x="0" y="0" width="${w}" height="${h}" rx="3" fill="#ddd8d0" stroke="#888" stroke-width="1.5"/>
    <line x1="${w * 0.50}" y1="0" x2="${w * 0.50}" y2="${h}" stroke="#bbb" stroke-width="1"/>
    <line x1="0" y1="${h * 0.33}" x2="${w}" y2="${h * 0.33}" stroke="#ccc" stroke-width="0.5"/>
    <line x1="0" y1="${h * 0.66}" x2="${w}" y2="${h * 0.66}" stroke="#ccc" stroke-width="0.5"/>
    <rect x="${w * 0.30}" y="${h * 0.44}" width="${w * 0.12}" height="${h * 0.08}" rx="2" fill="#b8b4ae" stroke="#999" stroke-width="1"/>
    <rect x="${w * 0.58}" y="${h * 0.44}" width="${w * 0.12}" height="${h * 0.08}" rx="2" fill="#b8b4ae" stroke="#999" stroke-width="1"/>`,
  "island": (w, h) => `
    <rect x="0" y="0" width="${w}" height="${h}" rx="5" fill="#e4e0d8" stroke="#888" stroke-width="1.5"/>
    <rect x="${w * 0.06}" y="${h * 0.06}" width="${w * 0.88}" height="${h * 0.88}" rx="4" fill="#eee9e0" stroke="#bbb" stroke-width="1"/>
    <circle cx="${w * 0.25}" cy="${h * 0.50}" r="${Math.min(w, h) * 0.06}" fill="none" stroke="#bbb" stroke-width="1.5"/>
    <circle cx="${w * 0.50}" cy="${h * 0.50}" r="${Math.min(w, h) * 0.06}" fill="none" stroke="#bbb" stroke-width="1.5"/>
    <circle cx="${w * 0.75}" cy="${h * 0.50}" r="${Math.min(w, h) * 0.06}" fill="none" stroke="#bbb" stroke-width="1.5"/>`,
  "sink-kitchen": (w, h) => `
    <rect x="0" y="0" width="${w}" height="${h}" rx="4" fill="#ddd8d0" stroke="#888" stroke-width="1.5"/>
    <rect x="${w * 0.06}" y="${h * 0.10}" width="${w * 0.40}" height="${h * 0.78}" rx="4" fill="#e8f0f8" stroke="#99aacc" stroke-width="1.5"/>
    <rect x="${w * 0.54}" y="${h * 0.10}" width="${w * 0.40}" height="${h * 0.78}" rx="4" fill="#e8f0f8" stroke="#99aacc" stroke-width="1.5"/>
    <circle cx="${w * 0.26}" cy="${h * 0.50}" r="${Math.min(w, h) * 0.05}" fill="#bbb" stroke="#999" stroke-width="1"/>
    <circle cx="${w * 0.74}" cy="${h * 0.50}" r="${Math.min(w, h) * 0.05}" fill="#bbb" stroke="#999" stroke-width="1"/>
    <rect x="${w * 0.44}" y="${h * 0.44}" width="${w * 0.12}" height="${h * 0.12}" rx="3" fill="#ccc" stroke="#aaa" stroke-width="1"/>`,
};

const iconImageCache = new Map<string, HTMLImageElement>();

function normalizeIconType(iconKey: FurnitureIconKey): string {
  if (iconKey === "cabinet" || iconKey === "kitchen-cabinet") return "base";
  if (iconKey === "kitchen-island") return "island";
  if (iconKey === "kitchen-sink") return "sink-kitchen";
  if (iconKey === "sink") return "sink-bathroom";
  if (iconKey === "bed") return "double-bed";
  if (iconKey === "drawers") return "dresser";
  return iconKey;
}

function normalizeHexColor(color: string) {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#e0e0e0";
}

function renderIconToCanvas(
  ctx: CanvasRenderingContext2D,
  type: string,
  x: number,
  y: number,
  w: number,
  h: number,
  _baseColor: string,
  requestRedraw?: () => void
) {
  const iconFn = ICONS[type];
  if (!iconFn) return;
  const cacheKey = `${type}:${Math.round(w)}:${Math.round(h)}`;
  const cached = iconImageCache.get(cacheKey);
  if (cached?.complete) {
    ctx.drawImage(cached, x, y, w, h);
    return;
  }
  if (cached) return;

  const innerSVG = iconFn(w, h);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${innerSVG}</svg>`;
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  iconImageCache.set(cacheKey, img);
  img.onload = () => {
    URL.revokeObjectURL(url);
    requestRedraw?.();
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    iconImageCache.delete(cacheKey);
  };
  img.src = url;
}

export function createFurnitureIcon(input: {
  fabric: FabricModule;
  iconKey: FurnitureIconKey;
  parentId: string;
  left: number;
  top: number;
  width: number;
  height: number;
  angle: number;
  color: string;
}): FabricObject | null {
  const { fabric, parentId, width: W, height: H, angle, iconKey } = input;
  if (W <= 0 || H <= 0) return null;
  const type = normalizeIconType(iconKey);
  const color = normalizeHexColor(input.color);
  const icon = new fabric.Rect({
    left: input.left,
    top: input.top,
    width: W,
    height: H,
    originX: "center",
    originY: "center",
    angle,
    fill: "transparent",
    stroke: "",
    strokeWidth: 0,
    selectable: false,
    evented: false,
    objectCaching: false,
  }) as IconObject & { _render: (ctx: CanvasRenderingContext2D) => void };
  icon._render = (ctx: CanvasRenderingContext2D) => {
    renderIconToCanvas(ctx, type, -W / 2, -H / 2, W, H, color, () => icon.canvas?.requestRenderAll());
  };
  icon.isSheetAnnotation = true;
  icon.sheetParentId = parentId;
  icon.sheetRole = "furniture-icon";
  return icon;
}
