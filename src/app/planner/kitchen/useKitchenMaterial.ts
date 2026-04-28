import { useMemo } from "react";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import { useKitchenStore } from "./store";
import {
  getMaterial,
  NEUTRAL_KITCHEN_MATERIAL_ID,
  resolveCountertopKitchenMaterial,
  type KitchenMaterial,
} from "./data";
import type { CountertopConfig } from "./types";
import {
  generateWoodTexture,
  generateSubtleTexture,
} from "../wardrobe/proceduralTextures";
import { applyGrainRotation, type GrainDirection } from "../textureRepeat";
import { publicApiUrl } from "@/lib/publicEnv";

const PLACEHOLDER_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";


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
  birch:         { grainCount: 40, grainContrast: 0.14, warpStrength: 0.08 },
  "natural-oak": { grainCount: 28, grainContrast: 0.28, warpStrength: 0.18 },
  "light-oak":   { grainCount: 30, grainContrast: 0.22, warpStrength: 0.15 },
  walnut:        { grainCount: 24, grainContrast: 0.22, warpStrength: 0.22 },
};

function buildKitchenMaterial(
  mat: KitchenMaterial,
  externalTexture: THREE.Texture | null,
  seedOffset = 0,
  grainDirection: GrainDirection = "horizontal",
): THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial {
  if (mat.id === NEUTRAL_KITCHEN_MATERIAL_ID) {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(mat.color),
      roughness: mat.roughness,
      metalness: mat.metalness,
    });
  }

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
    const p = WOOD_PARAMS[mat.id] ?? { grainCount: 30, grainContrast: 0.2, warpStrength: 0.15 };
    const cached = generateWoodTexture(mat.color, {
      ...p,
      seed: mat.id.charCodeAt(0) + seedOffset,
    });
    const tex = cached.clone();
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 1);
    tex.anisotropy = 16;
    applyGrainRotation(tex, grainDirection);
    return new THREE.MeshPhysicalMaterial({
      map: tex,
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

  if (surface === "stone") {
    const tex = generateSubtleTexture(mat.color, { amount: 0.035 });
    return new THREE.MeshPhysicalMaterial({
      map: tex,
      roughness: mat.roughness,
      metalness: mat.metalness,
      clearcoat: 0.15,
      clearcoatRoughness: 0.35,
    });
  }

  if (surface === "metal") {
    return new THREE.MeshPhysicalMaterial({
      color: mat.color,
      roughness: mat.roughness,
      metalness: mat.metalness,
      clearcoat: 0.3,
      clearcoatRoughness: 0.1,
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

/** PBR material for kitchen cabinet carcass */
export function useKitchenMaterial(matId: string, grainDirection: GrainDirection = "horizontal") {
  const availableMaterials = useKitchenStore((s) => s.availableMaterials);
  const mat = getMaterial(matId, availableMaterials);
  const textureUrl = mat.imageUrl ? proxyUrl(mat.imageUrl) : PLACEHOLDER_URL;
  const texture = useTexture(textureUrl);
  const externalTexture = mat.imageUrl ? texture : null;

  return useMemo(
    () => buildKitchenMaterial(mat, externalTexture, 0, grainDirection),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mat.id, mat.color, mat.roughness, mat.metalness, mat.surfaceType, externalTexture, grainDirection],
  );
}

/** PBR material for door/drawer fronts */
export function useKitchenDoorMaterial(matId: string, grainDirection: GrainDirection = "horizontal") {
  const availableDoorMaterials = useKitchenStore((s) => s.availableDoorMaterials);
  const mat = getMaterial(matId, availableDoorMaterials);
  const textureUrl = mat.imageUrl ? proxyUrl(mat.imageUrl) : PLACEHOLDER_URL;
  const texture = useTexture(textureUrl);
  const externalTexture = mat.imageUrl ? texture : null;

  return useMemo(
    () => buildKitchenMaterial(mat, externalTexture, 50, grainDirection),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mat.id, mat.color, mat.roughness, mat.metalness, mat.surfaceType, externalTexture, grainDirection],
  );
}

/** PBR material for worktop — built-in presets or admin catalog (`adminMaterialId` on config). */
export function useCountertopResolvedMaterial(countertop: CountertopConfig) {
  const adminWorktops = useKitchenStore((s) => s.availableWorktopMaterials);
  const mat = useMemo(
    () => resolveCountertopKitchenMaterial(countertop, adminWorktops),
    [countertop, adminWorktops],
  );
  const textureUrl = mat.imageUrl ? proxyUrl(mat.imageUrl) : PLACEHOLDER_URL;
  const texture = useTexture(textureUrl);
  const externalTexture = mat.imageUrl ? texture : null;

  return useMemo(
    () => buildKitchenMaterial(mat, externalTexture, 100, "horizontal"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mat.id, mat.color, mat.roughness, mat.metalness, mat.surfaceType, externalTexture],
  );
}

export type { GrainDirection } from "../textureRepeat";
