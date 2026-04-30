/**
 * Shared PBR builder for planner swatches (wardrobe interior, GLB catalog overrides).
 */
import * as THREE from "three";
import type { WardrobeMaterial } from "../wardrobe/data";
import {
  generateWoodTexture,
  generateWoodBumpTexture,
  generateSubtleTexture,
} from "../wardrobe/proceduralTextures";
import type { GrainDirection } from "../wardrobe/types";
import { applyGrainRotation } from "../textureRepeat";
import { publicApiUrl } from "@/lib/publicEnv";

const PLACEHOLDER_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

const WOOD_PARAMS: Record<
  string,
  { grainCount: number; grainContrast: number; warpStrength: number }
> = {
  birch: { grainCount: 40, grainContrast: 0.14, warpStrength: 0.08 },
  "natural-oak": { grainCount: 28, grainContrast: 0.28, warpStrength: 0.18 },
  "light-oak": { grainCount: 30, grainContrast: 0.22, warpStrength: 0.15 },
  walnut: { grainCount: 24, grainContrast: 0.22, warpStrength: 0.22 },
  "black-brown": { grainCount: 30, grainContrast: 0.1, warpStrength: 0.12 },
};

/**
 * Route external image URLs through the backend proxy to avoid CORS issues
 * with third-party CDNs (e.g. cdn.egger.com). URLs already pointing at our
 * own backend are passed through unchanged.
 */
export function proxyTextureUrl(url: string): string {
  if (url.startsWith("data:") || url.startsWith("blob:")) {
    return url;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return url;
    }
    const apiOrigin = new URL(publicApiUrl).origin;
    if (parsed.origin === apiOrigin || parsed.origin === window.location.origin) {
      return url;
    }
    return `${publicApiUrl}/image-proxy?url=${encodeURIComponent(url)}`;
  } catch {
    return url;
  }
}

export { PLACEHOLDER_URL };

/**
 * Build Three.js MeshPhysicalMaterial from a wardrobe-style swatch and optional loaded texture.
 */
export function buildMaterialFromSwatch(
  mat: WardrobeMaterial,
  externalTexture: THREE.Texture | null,
  seedOffset = 0,
  grainDirection: GrainDirection = "horizontal",
): THREE.MeshPhysicalMaterial {
  const surface = mat.surfaceType ?? "matte";

  if (externalTexture) {
    const tex = externalTexture.clone();
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 1);
    tex.anisotropy = 16;
    tex.colorSpace = THREE.SRGBColorSpace;
    applyGrainRotation(tex, grainDirection);
    const cc = surface === "gloss" ? 0.8 : surface === "wood" ? 0.3 : 0.1;
    return new THREE.MeshPhysicalMaterial({
      map: tex,
      roughness: mat.roughness,
      metalness: mat.metalness,
      clearcoat: cc,
      clearcoatRoughness: surface === "gloss" ? 0.05 : 0.3,
    });
  }

  if (surface === "wood") {
    const p = WOOD_PARAMS[mat.id] ?? {
      grainCount: 30,
      grainContrast: 0.2,
      warpStrength: 0.15,
    };
    const seedVal = mat.id.charCodeAt(0) + seedOffset;
    const cached = generateWoodTexture(mat.color, {
      ...p,
      seed: seedVal,
    });
    const tex = cached.clone();
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 1);
    tex.anisotropy = 16;
    applyGrainRotation(tex, grainDirection);

    const bumpCached = generateWoodBumpTexture(mat.color, {
      ...p,
      width: 512,
      height: 512,
      seed: seedVal,
    });
    const bump = bumpCached.clone();
    bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
    bump.repeat.set(1, 1);
    bump.anisotropy = 16;
    applyGrainRotation(bump, grainDirection);

    return new THREE.MeshPhysicalMaterial({
      map: tex,
      bumpMap: bump,
      bumpScale: 0.0015,
      roughness: mat.roughness,
      metalness: 0,
      clearcoat: 0.35,
      clearcoatRoughness: 0.25,
    });
  }

  if (surface === "gloss") {
    const tex = generateSubtleTexture(mat.color, { amount: 0.008 });
    return new THREE.MeshPhysicalMaterial({
      map: tex,
      roughness: 0.08,
      metalness: 0.05,
      clearcoat: 1.0,
      clearcoatRoughness: 0.03,
      reflectivity: 0.5,
    });
  }

  const tex = generateSubtleTexture(mat.color, { amount: 0.02 });
  return new THREE.MeshPhysicalMaterial({
    map: tex,
    roughness: mat.roughness,
    metalness: mat.metalness,
    clearcoat: 0.05,
    clearcoatRoughness: 0.5,
  });
}
