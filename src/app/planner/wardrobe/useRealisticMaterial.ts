import { useMemo } from "react";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import { useWardrobeStore } from "./store";
import { getMaterial, type WardrobeMaterial } from "./data";
import {
  generateWoodTexture,
  generateWoodBumpTexture,
  generateSubtleTexture,
} from "./proceduralTextures";
import type { GrainDirection } from "./types";
import {
  applyGrainRotation,
  type PanelTextureRepeatOpts,
  setWoodMapRepeatForPanel,
} from "../textureRepeat";
import type { PanelRenderInfo } from "../sheet/useWardrobePanelPlacements";
import { publicApiUrl } from "@/lib/publicEnv";

export type { PanelTextureRepeatOpts };
export { setWoodMapRepeatForPanel };

const PLACEHOLDER_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";


/**
 * Route external image URLs through the backend proxy to avoid CORS issues
 * with third-party CDNs (e.g. cdn.egger.com). URLs already pointing at our
 * own backend are passed through unchanged.
 */
function proxyUrl(url: string): string {
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

function buildMaterial(
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

/**
 * Realistic PBR material for wardrobe frame & interior surfaces.
 * Generates procedural wood-grain or subtle noise textures and uses
 * MeshPhysicalMaterial with clearcoat for a lacquered-furniture look.
 */
export function useRealisticMaterial(
  matId: string,
  grainDirection: GrainDirection = "horizontal",
  /** When set (per-panel or from `useSheetPanelInfoForMaterial`), use the same catalog row + image as the sheet packer. */
  sheetInfo?: PanelRenderInfo | null,
) {
  const availableMaterials = useWardrobeStore((s) => s.availableMaterials);
  const mat = sheetInfo?.sheetMaterial ?? getMaterial(matId, availableMaterials);
  const imageSource = sheetInfo?.sheetImageUrl ?? mat.imageUrl;
  const textureUrl = imageSource ? proxyUrl(imageSource) : PLACEHOLDER_URL;
  const texture = useTexture(textureUrl);
  const externalTexture = imageSource ? texture : null;

  return useMemo(
    () => buildMaterial(mat, externalTexture, 0, grainDirection),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      matId,
      mat.id,
      mat.color,
      mat.roughness,
      mat.metalness,
      mat.surfaceType,
      externalTexture,
      grainDirection,
      sheetInfo?.materialId,
      sheetInfo?.sheetImageUrl,
    ],
  );
}

/**
 * Realistic PBR material for door panels.
 * Handles special cases: mirror (pure reflective), frosted glass
 * (physical transmission), smoked glass; falls back to buildMaterial
 * for wood/matte/gloss door panels.
 */
export function useRealisticDoorMaterial(
  matId: string,
  grainDirection: GrainDirection = "horizontal",
  /** When set, bitmap + PBR match `useWardrobeSheetLayout` / sheet viewer for that cut. */
  sheetInfo?: PanelRenderInfo | null,
) {
  const availableDoorMaterials = useWardrobeStore(
    (s) => s.availableDoorMaterials,
  );
  const mat = sheetInfo?.sheetMaterial ?? getMaterial(matId, availableDoorMaterials);
  const imageSource = sheetInfo?.sheetImageUrl ?? mat.imageUrl;
  const textureUrl = imageSource ? proxyUrl(imageSource) : PLACEHOLDER_URL;
  const texture = useTexture(textureUrl);
  const externalTexture = imageSource ? texture : null;

  return useMemo(() => {
    const st = mat.surfaceType ?? "matte";
    if (st === "mirror") {
      return new THREE.MeshPhysicalMaterial({
        color: "#e8eef2",
        roughness: 0.0,
        metalness: 1.0,
        envMapIntensity: 2.0,
        clearcoat: 1.0,
        clearcoatRoughness: 0.0,
      });
    }

    if (st === "frosted-glass") {
      return new THREE.MeshPhysicalMaterial({
        color: "#f0f4f7",
        roughness: 0.4,
        metalness: 0,
        transmission: 0.85,
        thickness: 0.5,
        ior: 1.5,
      });
    }

    if (st === "smoked-glass") {
      return new THREE.MeshPhysicalMaterial({
        color: "#4a545c",
        roughness: 0.08,
        metalness: 0,
        transmission: 0.7,
        thickness: 0.5,
        ior: 1.5,
      });
    }

    return buildMaterial(mat, externalTexture, 100, grainDirection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    matId,
    mat.id,
    mat.color,
    mat.roughness,
    mat.metalness,
    mat.surfaceType,
    externalTexture,
    grainDirection,
    sheetInfo?.materialId,
    sheetInfo?.sheetImageUrl,
  ]);
}
