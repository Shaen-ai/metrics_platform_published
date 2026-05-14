"use client";

import { useRef, useEffect, useLayoutEffect, useMemo, useState, memo } from "react";
import * as THREE from "three";
import { Edges, useTexture } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { PlacedItem, PlannerCatalogItem } from "../types";
import { useStore } from "@/lib/store";
import { useResolvedAdmin } from "@/contexts/PublishedTenantProvider";
import {
  filterMaterialsForPlanner,
  materialsFromStore,
  upholsteryMaterialsFromStore,
  isBoardFinishMaterial,
  isWardrobeBoardFinishMaterial,
  mergeDefaultBoardMaterialsWhenMissing,
} from "@/lib/plannerMaterials";
import { publicApiUrl } from "@/lib/publicEnv";
import {
  materialsFromStore as wardrobeMaterialsFromStore,
  doorFrontMaterialsFromStore,
  slidingMechanismsFromStore,
  handleMaterialsFromStore,
  withDefaultWardrobeDoorFinishes,
} from "../wardrobe/data";
import { WardrobeModulesInRoom } from "../wardrobe/WardrobeModulesInRoom";
import type { WardrobeRoomEmbedValue } from "../wardrobe/WardrobeRoomContext";
import {
  wardrobeLayoutLegCountForConfig,
  wardrobeLayoutLegWidthsFromConfig,
} from "../wardrobe/wardrobeSpaceLayout";
import { usePlannerType } from "../context";
import {
  getGlbTextureMode,
  plannerSwatchToWardrobeMaterial,
} from "../glbTextureMode";
import { catalogItemIsSoftFurnitureMode } from "@/lib/catalogItemCategories";
import {
  buildMaterialFromSwatch,
  proxyTextureUrl,
  PLACEHOLDER_URL,
} from "../shared/buildPhysicalMaterialFromSwatch";
import { OutdoorCushionMeshes } from "../outdoor/OutdoorCushionMeshes";
import { usePlannerStore } from "../store/usePlannerStore";
import { applyUpholsteryFabricClone, resolveUpholsteryFabricMetrics } from "./upholsteryGlbRepeat";

function catalogNeedsPlacementSurfaceTop(cat: PlannerCatalogItem): {
  surfaceType: "table" | "shelf" | "countertop";
} | null {
  const blob = [cat.category, cat.subCategory ?? "", cat.name].join(" ").toLowerCase();
  if (/counter|cabinet\s*top|worktop|island/i.test(blob)) return { surfaceType: "countertop" };
  if (/shelf|bookcase|storage|sideboard/i.test(blob)) return { surfaceType: "shelf" };
  if (/table|desk|nightstand|coffee\s*table/i.test(blob)) return { surfaceType: "table" };
  return null;
}

interface FurnitureMeshProps {
  item: PlacedItem;
  catalogItem: PlannerCatalogItem;
  isSelected: boolean;
  isLocked?: boolean;
}

function plannerModelUrl(url: string): string {
  if (typeof window === "undefined") return url;
  try {
    const apiOrigin = new URL(publicApiUrl).origin;
    const parsed = new URL(url, window.location.origin);
    if (
      parsed.origin === apiOrigin &&
      (parsed.pathname.startsWith("/storage/") || parsed.pathname.startsWith("/files/"))
    ) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return parsed.href;
  } catch {
    return url;
  }
}

function meshShouldReceiveGlbOverride(mesh: THREE.Mesh): boolean {
  const n = mesh.name?.toLowerCase() ?? "";
  if (/glass|mirror|chrome|handle|knob|hardware|wheel/i.test(n)) return false;
  const m = mesh.material;
  const mats = Array.isArray(m) ? m : [m];
  for (const mat of mats) {
    if (!(mat instanceof THREE.MeshStandardMaterial) && !(mat instanceof THREE.MeshPhysicalMaterial)) {
      return false;
    }
    if (mat.transparent && mat.opacity < 0.95) return false;
    if (mat instanceof THREE.MeshPhysicalMaterial && (mat.transmission ?? 0) > 0.5) return false;
  }
  return true;
}

// ── Fallback box renderer (items without a model) ──────────────────────

const BoxFallback = memo(function BoxFallback({
  item,
  catalogItem,
  isSelected,
  isLocked,
}: FurnitureMeshProps) {
  const width = item.width ?? catalogItem.width;
  const depth = item.depth ?? catalogItem.depth;
  const height = item.height ?? catalogItem.height;
  const color = item.color ?? catalogItem.color;
  const plannerType = usePlannerType();
  const surfZone = plannerType?.id === "outdoor" ? "outdoor" : "indoor";

  const yPos = (item.positionY ?? 0) + height / 2;
  const surfaceTop = catalogNeedsPlacementSurfaceTop(catalogItem);

  return (
    <group
      position={[item.position.x, yPos, item.position.z]}
      rotation={[0, item.rotationY, 0]}
    >
      {surfaceTop ? (
        <mesh
          position={[0, height / 2 + 0.015, 0]}
          userData={{
            surfaceType: surfaceTop.surfaceType,
            zone: surfZone,
            ...(surfZone === "outdoor" ? { patioType: "covered" } : {}),
          }}
        >
          <boxGeometry args={[width * 0.88, 0.02, depth * 0.88]} />
          <meshBasicMaterial transparent opacity={0.12} depthWrite={false} color="#88aaff" />
        </mesh>
      ) : null}
      <mesh castShadow receiveShadow userData={{ itemId: item.id }}>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial
          color={color}
          transparent={isSelected}
          opacity={isSelected ? 0.85 : 1}
        />
        {isLocked && (
          <>
            <Edges scale={1.02} threshold={15} color="#F44336" lineWidth={4} />
            <Edges scale={1.015} threshold={15} color="#E57373" lineWidth={2} />
          </>
        )}
      </mesh>
    </group>
  );
});

type Fit = {
  box: THREE.Box3;
  center: THREE.Vector3;
  scale: number;
  /** Outdoor: trust glTF metre scale only for tiny placeholder catalogue boxes; sync dims once. */
  preferNativeGlbMeters?: boolean;
  nativeDimsM?: { w: number; h: number; d: number };
};

/** Union bbox of visible meshes only, excluding Meshy-style huge thin ground/backdrop planes. */
function approximateFurnitureGeometryBox(root: THREE.Object3D): THREE.Box3 {
  const acc = new THREE.Box3();
  let any = false;
  const meshBox = new THREE.Box3();
  const meshSize = new THREE.Vector3();
  const rootInverseWorld = new THREE.Matrix4();
  const meshToRoot = new THREE.Matrix4();

  root.updateWorldMatrix(true, true);
  rootInverseWorld.copy(root.matrixWorld).invert();
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || mesh.visible === false) return;
    const geom = mesh.geometry;
    if (!geom?.getAttribute) return;
    const posAttr = geom.getAttribute("position");
    if (!posAttr || posAttr.count < 1) return;

    try {
      if (posAttr instanceof THREE.BufferAttribute) {
        meshBox.setFromBufferAttribute(posAttr);
      } else {
        if (!geom.boundingBox) geom.computeBoundingBox();
        if (!geom.boundingBox || geom.boundingBox.isEmpty()) return;
        meshBox.copy(geom.boundingBox);
      }
    } catch {
      if (!geom.boundingBox) geom.computeBoundingBox();
      if (!geom.boundingBox || geom.boundingBox.isEmpty()) return;
      meshBox.copy(geom.boundingBox);
    }

    meshToRoot.multiplyMatrices(rootInverseWorld, mesh.matrixWorld);
    meshBox.applyMatrix4(meshToRoot);
    meshBox.getSize(meshSize);
    const vol = meshSize.x * meshSize.y * meshSize.z;
    if (!(vol > 1e-12)) return;

    const maxE = Math.max(meshSize.x, meshSize.y, meshSize.z);
    const minE = Math.min(meshSize.x, meshSize.y, meshSize.z);
    if (meshSize.y < 0.04 && maxE > 1.2 && minE > 1e-5 && maxE / minE > 12) return;

    if (!any) {
      acc.copy(meshBox);
      any = true;
    } else {
      acc.union(meshBox);
    }
  });

  if (!any || acc.isEmpty()) {
    acc.setFromObject(root);
  }
  return acc;
}

function meshContributesToFurnitureSampling(
  mesh: THREE.Mesh,
  rootInverseWorld: THREE.Matrix4,
): boolean {
  const geom = mesh.geometry;
  if (!geom?.getAttribute) return false;
  const posAttr = geom.getAttribute("position");
  if (!posAttr || posAttr.count < 1) return false;
  const meshBox = new THREE.Box3();
  const meshSize = new THREE.Vector3();
  const meshToRoot = new THREE.Matrix4();
  try {
    if (posAttr instanceof THREE.BufferAttribute) {
      meshBox.setFromBufferAttribute(posAttr);
    } else {
      if (!geom.boundingBox) geom.computeBoundingBox();
      if (!geom.boundingBox || geom.boundingBox.isEmpty()) return false;
      meshBox.copy(geom.boundingBox);
    }
  } catch {
    if (!geom.boundingBox) geom.computeBoundingBox();
    if (!geom.boundingBox || geom.boundingBox.isEmpty()) return false;
    meshBox.copy(geom.boundingBox);
  }
  meshToRoot.multiplyMatrices(rootInverseWorld, mesh.matrixWorld);
  meshBox.applyMatrix4(meshToRoot);
  meshBox.getSize(meshSize);
  const vol = meshSize.x * meshSize.y * meshSize.z;
  if (!(vol > 1e-12)) return false;
  const maxE = Math.max(meshSize.x, meshSize.y, meshSize.z);
  const minE = Math.min(meshSize.x, meshSize.y, meshSize.z);
  if (meshSize.y < 0.04 && maxE > 1.2 && minE > 1e-5 && maxE / minE > 12) return false;
  return true;
}

/**
 * Seat slab = lower–mid height band of visible mesh. Trimmed X/Z spans approximate where people sit
 * vs full bbox (asymmetric / off-centre GLBs). Returns cushion-group offsets in the same space as
 * the centred scaled mesh, optional seat-run width (m), and seat mid Z in world space for back detection.
 */
function analyzeOutdoorSeatSlabInGroupSpace(
  root: THREE.Object3D,
  box: THREE.Box3,
  center: THREE.Vector3,
  scale: number,
  meshFootprintW: number,
): {
  offsetX: number;
  offsetZ: number;
  seatPanW: number | undefined;
  seatMidZWorld: number;
} {
  let seatMidZWorld = center.z;

  const minY = box.min.y;
  const h = box.max.y - minY;
  if (h < 1e-4 || !(scale > 0) || !(meshFootprintW > 0)) {
    return { offsetX: 0, offsetZ: 0, seatPanW: undefined, seatMidZWorld };
  }

  const y0 = minY + h * 0.14;
  const y1 = minY + h * 0.58;

  root.updateWorldMatrix(true, true);
  const v = new THREE.Vector3();
  const xs: number[] = [];
  const zs: number[] = [];
  const rootInverseWorld = new THREE.Matrix4();
  rootInverseWorld.copy(root.matrixWorld).invert();

  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || mesh.visible === false) return;
    if (!meshContributesToFurnitureSampling(mesh, rootInverseWorld)) return;

    const geom = mesh.geometry;
    const posAttr = geom.getAttribute("position");
    if (!posAttr || posAttr.count < 1) return;
    if (!(posAttr instanceof THREE.BufferAttribute)) return;

    const step = Math.max(1, Math.floor(posAttr.count / 2400));
    for (let i = 0; i < posAttr.count; i += step) {
      v.fromBufferAttribute(posAttr, i);
      v.applyMatrix4(mesh.matrixWorld);
      v.applyMatrix4(rootInverseWorld);
      if (v.y >= y0 && v.y <= y1) {
        xs.push(v.x);
        zs.push(v.z);
      }
    }
  });

  const n = xs.length;
  if (n < 28) {
    return { offsetX: 0, offsetZ: 0, seatPanW: undefined, seatMidZWorld };
  }

  xs.sort((a, b) => a - b);
  zs.sort((a, b) => a - b);
  const lo = Math.floor(n * 0.06);
  const hi = Math.min(Math.ceil(n * 0.94) - 1, n - 1);
  const xLo = xs[lo];
  const xHi = xs[hi];
  const zLo = zs[lo];
  const zHi = zs[hi];

  seatMidZWorld = (zLo + zHi) / 2;

  const trimmedSpanX = (xHi - xLo) * scale;
  const midX = (xLo + xHi) / 2;
  const midZ = seatMidZWorld;

  let offsetX = (midX - center.x) * scale;
  let offsetZ = (midZ - center.z) * scale;

  const boxSz = new THREE.Vector3();
  box.getSize(boxSz);
  const maxOffX = Math.max(0.02, boxSz.x * scale * 0.26);
  const maxOffZ = Math.max(0.02, boxSz.z * scale * 0.22);
  offsetX = Math.min(maxOffX, Math.max(-maxOffX, offsetX));
  offsetZ = Math.min(maxOffZ, Math.max(-maxOffZ, offsetZ));

  if (trimmedSpanX < 0.11) {
    return { offsetX, offsetZ, seatPanW: undefined, seatMidZWorld };
  }

  const seatPanW = Math.min(meshFootprintW * 0.96, Math.max(0.15, trimmedSpanX * 0.96));
  if (seatPanW < meshFootprintW * 0.28) {
    return { offsetX, offsetZ, seatPanW: undefined, seatMidZWorld };
  }

  return { offsetX, offsetZ, seatPanW, seatMidZWorld };
}

function outdoorRegressionSlopeZOnY(
  yDisp: number[],
  zDisp: number[],
): number | undefined {
  const n = yDisp.length;
  if (n < 16) return undefined;
  let my = 0;
  let mz = 0;
  for (let i = 0; i < n; i++) {
    my += yDisp[i];
    mz += zDisp[i];
  }
  my /= n;
  mz /= n;
  let syy = 0;
  let syz = 0;
  for (let i = 0; i < n; i++) {
    const dy = yDisp[i] - my;
    const dz = zDisp[i] - mz;
    syy += dy * dy;
    syz += dy * dz;
  }
  if (syy < 1e-10) return undefined;
  return syz / syy;
}

/**
 * Upper rear slab: backrest width and lean (rotation around X) from fitted mesh geometry.
 */
function analyzeOutdoorBackSlabInGroupSpace(
  root: THREE.Object3D,
  box: THREE.Box3,
  center: THREE.Vector3,
  scale: number,
  meshFootprintW: number,
  seatMidZWorld: number,
): { backPanW: number | undefined; backLeanRad: number | undefined; backSideZSign: -1 | 1 } {
  const minY = box.min.y;
  const h = box.max.y - minY;
  const backSideZSign: -1 | 1 = seatMidZWorld >= center.z ? -1 : 1;
  if (h < 1e-4 || !(scale > 0)) {
    return { backPanW: undefined, backLeanRad: undefined, backSideZSign };
  }

  const y0 = minY + h * 0.36;
  const y1 = minY + h * 0.93;

  const dz = Math.max(1e-4, box.max.z - box.min.z);
  const zGate = dz * 0.1;
  const rearSide = (z: number) =>
    backSideZSign < 0 ? z < seatMidZWorld - zGate * 0.2 : z > seatMidZWorld + zGate * 0.2;

  root.updateWorldMatrix(true, true);
  const v = new THREE.Vector3();
  const xs: number[] = [];
  const yzLean: { y: number; z: number }[] = [];
  const rootInverseWorld = new THREE.Matrix4();
  rootInverseWorld.copy(root.matrixWorld).invert();

  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || mesh.visible === false) return;
    if (!meshContributesToFurnitureSampling(mesh, rootInverseWorld)) return;

    const geom = mesh.geometry;
    const posAttr = geom.getAttribute("position");
    if (!posAttr || posAttr.count < 1) return;
    if (!(posAttr instanceof THREE.BufferAttribute)) return;

    const step = Math.max(1, Math.floor(posAttr.count / 2200));
    for (let i = 0; i < posAttr.count; i += step) {
      v.fromBufferAttribute(posAttr, i);
      v.applyMatrix4(mesh.matrixWorld);
      v.applyMatrix4(rootInverseWorld);
      if (v.y >= y0 && v.y <= y1 && rearSide(v.z)) {
        xs.push(v.x);
        yzLean.push({ y: v.y, z: v.z });
      }
    }
  });

  if (xs.length < 18) {
    return { backPanW: undefined, backLeanRad: undefined, backSideZSign };
  }

  xs.sort((a, b) => a - b);
  const n = xs.length;
  const lo = Math.floor(n * 0.08);
  const hi = Math.min(Math.ceil(n * 0.92) - 1, n - 1);
  const xLo = xs[lo];
  const xHi = xs[hi];

  const trimmedSpanX = (xHi - xLo) * scale;
  if (trimmedSpanX < 0.09) {
    return { backPanW: undefined, backLeanRad: undefined, backSideZSign };
  }

  let backPanW: number | undefined = Math.min(meshFootprintW * 0.96, Math.max(0.13, trimmedSpanX * 0.96));
  if (backPanW < meshFootprintW * 0.22) {
    backPanW = undefined;
  }

  let backLeanRad: number | undefined;
  if (yzLean.length >= 28) {
    const yDisp = yzLean.map((p) => (p.y - center.y) * scale);
    const zDisp = yzLean.map((p) => (p.z - center.z) * scale);
    const b = outdoorRegressionSlopeZOnY(yDisp, zDisp);
    if (b !== undefined && Number.isFinite(b)) {
      let lean = Math.atan2(b, 1);
      if (Math.abs(b) < 0.028) lean = 0;
      lean = Math.max(-0.55, Math.min(0.06, lean));
      backLeanRad = lean;
    }
  }

  return {
    backPanW,
    backLeanRad,
    backSideZSign,
  };
}

function combineOutdoorCushionSlabAnalysis(
  root: THREE.Object3D,
  box: THREE.Box3,
  center: THREE.Vector3,
  scale: number,
  meshFootprintW: number,
) {
  const seat = analyzeOutdoorSeatSlabInGroupSpace(root, box, center, scale, meshFootprintW);
  const back = analyzeOutdoorBackSlabInGroupSpace(
    root,
    box,
    center,
    scale,
    meshFootprintW,
    seat.seatMidZWorld,
  );
  return {
    offsetX: seat.offsetX,
    offsetZ: seat.offsetZ,
    seatPanW: seat.seatPanW,
    backPanW: back.backPanW,
    backLeanRad: back.backLeanRad,
    backSideZSign: back.backSideZSign,
  };
}

/**
 * Many GLBs are authored in cm/mm (100+ units) while the planner catalog is in meters.
 * If we treat those raw units as meters, every axis scale becomes tiny. Shrink spans first
 * when the mesh is clearly not meter-sized relative to the catalogue box.
 */
function normalizeGlbExtentsTowardMeters(
  size: THREE.Vector3,
  catW: number,
  catD: number,
  catH: number,
): THREE.Vector3 {
  const meshMax = Math.max(size.x, size.y, size.z, 1e-9);
  const catMax = Math.max(catW, catD, catH, 1e-9);
  const ratio = catMax / meshMax;
  const out = size.clone();
  if (meshMax >= 250 && catMax <= 10 && ratio < 0.02) {
    out.multiplyScalar(0.001);
  } else if (meshMax >= 15 && catMax <= 10 && ratio < 0.08) {
    out.multiplyScalar(0.01);
  }
  return out;
}

/**
 * Outdoor: merchants often enter a tiny placeholder box (e.g. 25×25×25 cm) for a full-size
 * chair GLB (~1–2 m). Fitting to the catalogue then shrinks the mesh to a speck. If the
 * mesh bbox is clearly larger than the stated box, trust native glTF units as meters.
 */
const OUTDOOR_TRUST_CATALOG_MAX_M = 0.55;
const OUTDOOR_TRUST_MESH_VS_CATALOG = 3.5;

function shouldTrustNativeGlbMetersOutdoor(
  meshMax: number,
  catW: number,
  catD: number,
  catH: number,
  wallMounted: boolean | undefined,
): boolean {
  if (wallMounted) return false;
  const catMax = Math.max(catW, catD, catH, 1e-9);
  return catMax < OUTDOOR_TRUST_CATALOG_MAX_M && meshMax > catMax * OUTDOOR_TRUST_MESH_VS_CATALOG;
}

/**
 * Uniform scale derived from bbox vs catalog W×D×H.
 * `Math.min(scaleX, scaleY, scaleZ)` is conservative: an understated catalogue *height*
 * dominates the minimum and shrinks footprint. For squat floor-standing pieces we may
 * relax to horizontal-only fit (capped).
 *
 * Outdoor planner (seating): fit catalogue **width and height** so the GLB matches listed
 * size. **`sz` is ignored** for squat pieces so a wrong depth does not shrink the chair.
 * The previous footprint-only rule matched W×D but could ignore height and oversize the
 * chair vertically. Tall non-squat outdoor items still use the full W×D×H box.
 */
const MAX_HORIZONTAL_RELAX_EXPAND = 6;

function catalogGlbUniformFitScale(
  size: THREE.Vector3,
  width: number,
  depth: number,
  height: number,
  wallMounted: boolean | undefined,
  preferNativeGlbMetersOutdoor: boolean,
  outdoorFootprintFirst: boolean,
): number {
  if (preferNativeGlbMetersOutdoor) return 1;

  const sx = size.x > 0 ? width / size.x : 1;
  const sy = size.y > 0 ? height / size.y : 1;
  const sz = size.z > 0 ? depth / size.z : 1;

  const sHoriz = Math.min(sx, sz);

  if (outdoorFootprintFirst && !wallMounted) {
    const catalogLooksSquatFloorItem =
      Number.isFinite(width) &&
      Number.isFinite(depth) &&
      Number.isFinite(height) &&
      Math.max(width, depth) >= 1e-4 &&
      height <= Math.max(width, depth) * 1.95;

    if (catalogLooksSquatFloorItem) {
      let scale = Number.isFinite(Math.min(sx, sy)) ? Math.min(sx, sy) : 1;
      if (!(scale > 0)) scale = 1;
      if (
        sy < sHoriz - 1e-7 &&
        sHoriz > scale &&
        sHoriz <= scale * MAX_HORIZONTAL_RELAX_EXPAND
      ) {
        scale = sHoriz;
      }
      return Number.isFinite(scale) && scale > 0 ? scale : 1;
    }

    let scale = Number.isFinite(Math.min(sx, sy, sz)) ? Math.min(sx, sy, sz) : 1;
    if (!(scale > 0)) scale = 1;
    return scale;
  }

  let scale = Number.isFinite(Math.min(sx, sy, sz)) ? Math.min(sx, sy, sz) : 1;
  if (!(scale > 0)) scale = 1;

  const catalogLooksSquatFloorItem =
    !wallMounted &&
    Number.isFinite(width) &&
    Number.isFinite(depth) &&
    Number.isFinite(height) &&
    Math.max(width, depth) >= 1e-4 &&
    height <= Math.max(width, depth) * 1.95;

  if (
    catalogLooksSquatFloorItem &&
    sy < sHoriz - 1e-7 &&
    sHoriz > scale &&
    sHoriz <= scale * MAX_HORIZONTAL_RELAX_EXPAND
  ) {
    scale = sHoriz;
  }

  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

const CatalogGltfScenePrimitive = memo(function CatalogGltfScenePrimitive({
  scene,
  fit,
  item,
  catalogItem,
  width,
  depth,
  height,
  isLocked,
}: {
  scene: THREE.Group;
  fit: Fit;
  item: PlacedItem;
  catalogItem: PlannerCatalogItem;
  width: number;
  depth: number;
  height: number;
  isLocked?: boolean;
}) {
  const admin = useResolvedAdmin();
  const rawMaterials = useStore((s) => s.materials);
  const plannerType = usePlannerType();
  const materials = useMemo(() => {
    const filtered = filterMaterialsForPlanner(rawMaterials, admin?.plannerMaterialIds);
    return mergeDefaultBoardMaterialsWhenMissing(
      filtered,
      admin?.id,
      plannerType?.id !== "kitchen" ? isWardrobeBoardFinishMaterial : isBoardFinishMaterial,
      admin?.plannerMaterialIds,
    );
  }, [rawMaterials, admin?.plannerMaterialIds, admin?.id, plannerType?.id]);

  const boardSwatches = useMemo(
    () =>
      materialsFromStore(materials, admin?.companyName, {
        forWardrobe: plannerType?.id !== "kitchen",
      }),
    [materials, admin?.companyName, plannerType?.id],
  );

  const upholSwatches = useMemo(
    () => upholsteryMaterialsFromStore(materials, admin?.companyName),
    [materials, admin?.companyName],
  );

  const modeBase = useMemo(() => getGlbTextureMode(catalogItem), [catalogItem]);
  const mode = item.outdoorCushionConfig?.enabled ? "board" : modeBase;

  // For fabric-customizable soft-furniture items without an explicit finish override, derive the effective
  // material from the first selected fabric part so the GLB body reflects the chosen fabric.
  const fabricDerivedFinishId = useMemo(() => {
    if (!catalogItem.isFabricCustomizable || !catalogItemIsSoftFurnitureMode(catalogItem)) return undefined;
    if (item.gltfFinishMaterialId) return undefined;
    const ids = item.fabricPartMaterialIds;
    if (!ids) return undefined;
    const parts = catalogItem.fabricParts ?? [];
    for (const part of parts) {
      const mid = ids[part.id];
      if (mid) return mid;
    }
    return undefined;
  }, [catalogItem, item.gltfFinishMaterialId, item.fabricPartMaterialIds]);

  const activeList = mode === "upholstery" ? upholSwatches : boardSwatches;
  const finishId = item.gltfFinishMaterialId ?? fabricDerivedFinishId;
  const swatch = finishId ? activeList.find((s) => s.id === finishId) : undefined;

  const wm = useMemo(
    () => (swatch ? plannerSwatchToWardrobeMaterial(swatch) : null),
    [swatch],
  );

  const imageSource = swatch?.imageUrl;
  const textureUrl = wm ? (imageSource ? proxyTextureUrl(imageSource) : PLACEHOLDER_URL) : PLACEHOLDER_URL;
  const texture = useTexture(textureUrl);
  const externalTexture = wm && imageSource ? texture : null;

  const overrideMaterial = useMemo(() => {
    if (!wm || !finishId) return null;
    return buildMaterialFromSwatch(wm, externalTexture, 0, "horizontal");
  }, [wm, externalTexture, finishId]);

  const meshFootprint = useMemo(() => {
    const sz = new THREE.Vector3();
    fit.box.getSize(sz);
    return {
      w: Math.max(0.02, sz.x * fit.scale),
      d: Math.max(0.02, sz.z * fit.scale),
      h: Math.max(0.02, sz.y * fit.scale),
    };
  }, [fit]);

  /** Slab analysis depends on mesh only; fabric edits must not re-run it (avoids cushion offset flicker). */
  const outdoorCushionSlabs = useMemo(() => {
    if (!item.outdoorCushionConfig?.enabled) {
      return {
        offsetX: 0,
        offsetZ: 0,
        seatPanW: undefined as number | undefined,
        backPanW: undefined as number | undefined,
        backLeanRad: undefined as number | undefined,
        backSideZSign: -1 as -1 | 1,
      };
    }
    return combineOutdoorCushionSlabAnalysis(scene, fit.box, fit.center, fit.scale, meshFootprint.w);
  }, [scene, fit, item.outdoorCushionConfig?.enabled, meshFootprint.w]);

  useEffect(() => {
    if (!item.outdoorCushionConfig?.enabled) {
      usePlannerStore.getState().setOutdoorMeshFootprint(item.id, null);
      return;
    }
    usePlannerStore.getState().setOutdoorMeshFootprint(item.id, {
      width: meshFootprint.w,
      depth: meshFootprint.d,
    });
  }, [item.id, item.outdoorCushionConfig?.enabled, meshFootprint.w, meshFootprint.d]);

  const originalsRef = useRef<Map<THREE.Mesh, THREE.Material | THREE.Material[]>>(new Map());
  const disposedOverrideRef = useRef<THREE.MeshPhysicalMaterial | null>(null);
  const upholsteredDisposableRef = useRef<THREE.MeshPhysicalMaterial[]>([]);

  useLayoutEffect(() => {
    originalsRef.current.clear();
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        originalsRef.current.set(mesh, mesh.material);
      }
    });
  }, [scene]);

  useLayoutEffect(() => {
    for (const m of upholsteredDisposableRef.current) {
      if (m.map) m.map.dispose();
      m.dispose();
    }
    upholsteredDisposableRef.current = [];

    if (disposedOverrideRef.current) {
      if (disposedOverrideRef.current.map) disposedOverrideRef.current.map.dispose();
      disposedOverrideRef.current.dispose();
      disposedOverrideRef.current = null;
    }

    if (!overrideMaterial) {
      originalsRef.current.forEach((orig, mesh) => {
        mesh.material = orig;
      });
      return;
    }

    const useFabricPerMesh =
      mode === "upholstery" && Boolean(externalTexture) && Boolean(overrideMaterial.map);

    disposedOverrideRef.current = overrideMaterial;

    const resolveTexDimsCm = (): { tw?: number | null; th?: number | null } => ({
      tw: swatch?.textureWidthCm ?? catalogItem.surfaceTextureWidthCm,
      th: swatch?.textureHeightCm ?? catalogItem.surfaceTextureHeightCm,
    });

    if (!useFabricPerMesh) {
      originalsRef.current.forEach((orig, mesh) => {
        mesh.material = meshShouldReceiveGlbOverride(mesh) ? overrideMaterial : orig;
      });
    } else {
      scene.updateMatrixWorld(true);
      const garmentBounds = new THREE.Box3().setFromObject(scene);
      const { tw, th } = resolveTexDimsCm();
      const metrics = resolveUpholsteryFabricMetrics(meshFootprint, tw, th);
      originalsRef.current.forEach((orig, mesh) => {
        if (!meshShouldReceiveGlbOverride(mesh)) {
          mesh.material = orig;
          return;
        }
        const mat = overrideMaterial.clone() as THREE.MeshPhysicalMaterial;
        if (overrideMaterial.map) mat.map = overrideMaterial.map.clone();
        applyUpholsteryFabricClone(
          mat,
          mesh,
          garmentBounds,
          metrics.repeatU,
          metrics.repeatV,
          metrics.motifWidthM,
          metrics.motifHeightM,
        );
        mesh.material = mat;
        upholsteredDisposableRef.current.push(mat);
      });
    }

    return () => {
      for (const m of upholsteredDisposableRef.current) {
        if (m.map) m.map.dispose();
        m.dispose();
      }
      upholsteredDisposableRef.current = [];

      if (disposedOverrideRef.current) {
        if (disposedOverrideRef.current.map) disposedOverrideRef.current.map.dispose();
        disposedOverrideRef.current.dispose();
        disposedOverrideRef.current = null;
      }
      originalsRef.current.forEach((orig, mesh) => {
        mesh.material = orig;
      });
    };
  }, [
    overrideMaterial,
    finishId,
    scene,
    mode,
    externalTexture,
    meshFootprint,
    swatch?.textureHeightCm,
    swatch?.textureWidthCm,
    catalogItem.surfaceTextureHeightCm,
    catalogItem.surfaceTextureWidthCm,
  ]);

  useEffect(() => {
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.userData.itemId = item.id;
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, [item.id, scene]);

  const c = item.outdoorCushionConfig?.enabled ?? false;
  const edgeW = c ? meshFootprint.w : width;
  const edgeD = c ? meshFootprint.d : depth;
  const edgeH = c ? meshFootprint.h : height;

  return (
    <group>
      <primitive
        object={scene}
        position={[
          -fit.center.x * fit.scale,
          -fit.box.min.y * fit.scale,
          -fit.center.z * fit.scale,
        ]}
        scale={fit.scale}
      />
      {c && (
        <OutdoorCushionMeshes
          item={item}
          width={meshFootprint.w}
          depth={meshFootprint.d}
          height={meshFootprint.h}
          swatches={upholSwatches}
          seatPanOffsetX={outdoorCushionSlabs.offsetX}
          seatPanOffsetZ={outdoorCushionSlabs.offsetZ}
          seatPanWidthOverrideM={outdoorCushionSlabs.seatPanW}
          backPanWidthOverrideM={outdoorCushionSlabs.backPanW}
          backRestLeanRad={outdoorCushionSlabs.backLeanRad}
          backSideZSign={outdoorCushionSlabs.backSideZSign}
        />
      )}
      {isLocked && (
        <group position={[0, edgeH / 2, 0]}>
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(edgeW, edgeH, edgeD)]} />
            <lineBasicMaterial color="#F44336" />
          </lineSegments>
        </group>
      )}
    </group>
  );
});

const CatalogModelMesh = memo(function CatalogModelMesh(props: FurnitureMeshProps) {
  const { item, catalogItem, isLocked } = props;
  const plannerType = usePlannerType();
  const surfZone = plannerType?.id === "outdoor" ? "outdoor" : "indoor";
  const nativeDimsSyncedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    return () => {
      nativeDimsSyncedRef.current.delete(item.id);
    };
  }, [item.id]);

  const [model, setModel] = useState<{
    url?: string;
    scene: THREE.Group | null;
    failed: boolean;
  }>({
    url: catalogItem.modelUrl,
    scene: null,
    failed: false,
  });
  const width = item.width ?? catalogItem.width;
  const depth = item.depth ?? catalogItem.depth;
  const height = item.height ?? catalogItem.height;
  const url = catalogItem.modelUrl;

  useEffect(() => {
    if (!url) return;
    let cancelled = false;

    const loader = new GLTFLoader();
    loader.load(
      plannerModelUrl(url),
      (gltf) => {
        if (cancelled) return;
        setModel({ url, scene: gltf.scene.clone(true), failed: false });
      },
      undefined,
      () => {
        if (!cancelled) setModel({ url, scene: null, failed: true });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [url]);

  const scene = model.url === url ? model.scene : null;
  const failed = model.url === url ? model.failed : false;

  const fit = useMemo(() => {
    if (!scene) return null;
    const box = approximateFurnitureGeometryBox(scene);
    const sizeRaw = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const size = normalizeGlbExtentsTowardMeters(sizeRaw, width, depth, height);
    const meshMax = Math.max(size.x, size.y, size.z);
    const preferNative =
      plannerType?.id === "outdoor" &&
      shouldTrustNativeGlbMetersOutdoor(meshMax, width, depth, height, catalogItem.wallMounted);
    const outdoorFootprintFirst = plannerType?.id === "outdoor" && !preferNative;
    const scale = catalogGlbUniformFitScale(
      size,
      width,
      depth,
      height,
      catalogItem.wallMounted,
      preferNative,
      outdoorFootprintFirst,
    );

    let nativeDimsM: { w: number; h: number; d: number } | undefined;
    if (preferNative) {
      nativeDimsM = {
        w: size.x * scale,
        h: size.y * scale,
        d: size.z * scale,
      };
    }

    return { box, center, scale, preferNativeGlbMeters: preferNative, nativeDimsM };
  }, [catalogItem.wallMounted, depth, height, plannerType?.id, scene, width]);

  useEffect(() => {
    if (!fit?.preferNativeGlbMeters || !fit.nativeDimsM) return;
    const { w, h, d } = fit.nativeDimsM;
    const cw = item.width ?? catalogItem.width;
    const ch = item.height ?? catalogItem.height;
    const cd = item.depth ?? catalogItem.depth;
    const matches =
      Math.abs(cw - w) <= 0.04 && Math.abs(ch - h) <= 0.04 && Math.abs(cd - d) <= 0.04;
    if (matches) {
      nativeDimsSyncedRef.current.add(item.id);
      return;
    }
    nativeDimsSyncedRef.current.delete(item.id);
    usePlannerStore.getState().updateItemDimensions(item.id, { width: w, height: h, depth: d });
  }, [
    fit,
    item.id,
    item.width,
    item.height,
    item.depth,
    catalogItem.width,
    catalogItem.height,
    catalogItem.depth,
  ]);

  if (!url || failed || !scene || !fit) {
    return <BoxFallback {...props} />;
  }

  const yPos = item.positionY ?? 0;

  const surfaceTop = catalogNeedsPlacementSurfaceTop(catalogItem);

  return (
    <group
      position={[item.position.x, yPos, item.position.z]}
      rotation={[0, item.rotationY, 0]}
    >
      <CatalogGltfScenePrimitive
        scene={scene}
        fit={fit}
        item={item}
        catalogItem={catalogItem}
        width={width}
        depth={depth}
        height={height}
        isLocked={isLocked}
      />
      {surfaceTop ? (
        <mesh
          position={[0, height + 0.015, 0]}
          userData={{
            surfaceType: surfaceTop.surfaceType,
            zone: surfZone,
            ...(surfZone === "outdoor" ? { patioType: "covered" } : {}),
          }}
        >
          <boxGeometry args={[width * 0.88, 0.02, depth * 0.88]} />
          <meshBasicMaterial transparent opacity={0.12} depthWrite={false} color="#88aaff" />
        </mesh>
      ) : null}
    </group>
  );
});

// ── User-designed wardrobe (procedural) ─────────────────────────────────

const PlacedWardrobeMesh = memo(function PlacedWardrobeMesh(props: FurnitureMeshProps) {
  const { item, catalogItem, isLocked } = props;
  const groupRef = useRef<THREE.Group>(null);
  const rawMaterials = useStore((s) => s.materials);
  const admin = useResolvedAdmin();
  const materials = useMemo(() => {
    const filtered = filterMaterialsForPlanner(rawMaterials, admin?.plannerMaterialIds);
    return mergeDefaultBoardMaterialsWhenMissing(
      filtered,
      admin?.id,
      isWardrobeBoardFinishMaterial,
      admin?.plannerMaterialIds,
    );
  }, [rawMaterials, admin?.plannerMaterialIds, admin?.id]);

  const embed: WardrobeRoomEmbedValue | null = useMemo(() => {
    if (!item.wardrobeConfig) return null;
    return {
      config: item.wardrobeConfig,
      availableMaterials: wardrobeMaterialsFromStore(materials, admin?.companyName),
      availableDoorMaterials: withDefaultWardrobeDoorFinishes(
        doorFrontMaterialsFromStore(materials, admin?.companyName),
      ),
      availableSlidingMechanisms: slidingMechanismsFromStore(materials, admin?.companyName),
      availableHandleMaterials: handleMaterialsFromStore(materials, admin?.companyName),
      layoutLegCount: item.wardrobePlannerRoom && item.wardrobeConfig
        ? wardrobeLayoutLegCountForConfig(item.wardrobePlannerRoom, item.wardrobeConfig)
        : undefined,
      plannerRoom: item.wardrobePlannerRoom,
    };
  }, [item.wardrobeConfig, item.wardrobePlannerRoom, materials, admin?.companyName]);

  useEffect(() => {
    if (!groupRef.current) return;
    groupRef.current.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.userData.itemId = item.id;
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, [item.id, embed, item.wardrobeConfig]);

  const yPos = item.positionY ?? 0;
  const width = item.width ?? catalogItem.width;
  const depth = item.depth ?? catalogItem.depth;
  const height = item.height ?? catalogItem.height;

  if (!embed) {
    return <BoxFallback {...props} />;
  }

  return (
    <group
      ref={groupRef}
      position={[item.position.x, yPos, item.position.z]}
      rotation={[0, item.rotationY, 0]}
    >
      <WardrobeModulesInRoom value={embed} />
      {isLocked && (
        <group position={[0, height / 2, 0]}>
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(width, height, depth)]} />
            <lineBasicMaterial color="#F44336" />
          </lineSegments>
        </group>
      )}
    </group>
  );
});

// ── Entry point: pick model renderer or fallback ───────────────────────

export default memo(function FurnitureMesh(props: FurnitureMeshProps) {
  if (props.item.wardrobeConfig) {
    return <PlacedWardrobeMesh {...props} />;
  }
  if (props.catalogItem.modelUrl) {
    return <CatalogModelMesh {...props} />;
  }
  return <BoxFallback {...props} />;
});
