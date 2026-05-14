"use client";

import type { ComponentType } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

/**
 * Photoreal vegetation for the outdoor planner. The actual GLB files live in
 * `public/planner/vegetation/` and are produced by the asset pipeline scripts:
 *
 *   1. `npm run download:vegetation` — fetches CC0 source models from Poly Haven
 *   2. `npm run optimize:vegetation` — Meshopt + WebP/KTX2 + simplify, writes one
 *      GLB per asset into the trees/ bushes/ grass/ folders.
 *
 * Loaders are configured with DRACO, Meshopt, and KTX2 decoders so that any
 * GLB produced by the optimize pipeline works without additional setup. If
 * an asset is missing, the consumer falls back to the procedural geometry in
 * `OutdoorSpaceMesh.tsx`.
 */
export const OUTDOOR_VEGETATION_GLB = {
  broadleafTrees: [
    "/planner/vegetation/trees/broadleaf-jacaranda.glb",
    "/planner/vegetation/trees/broadleaf-island-01.glb",
    "/planner/vegetation/trees/broadleaf-island-02.glb",
    "/planner/vegetation/trees/broadleaf-island-03.glb",
    "/planner/vegetation/trees/broadleaf-small.glb",
  ],
  coniferTrees: [
    "/planner/vegetation/trees/conifer-fir-sapling.glb",
  ],
  bushes: [
    "/planner/vegetation/bushes/shrub-01.glb",
    "/planner/vegetation/bushes/shrub-02.glb",
    "/planner/vegetation/bushes/shrub-03.glb",
    "/planner/vegetation/bushes/rooibos-bush.glb",
    "/planner/vegetation/bushes/fern.glb",
  ],
  grassTufts: [
    "/planner/vegetation/grass/grass-bermuda.glb",
    "/planner/vegetation/grass/grass-medium-01.glb",
    "/planner/vegetation/grass/grass-medium-02.glb",
  ],
} as const;

export const OUTDOOR_TREE_GLB_BROADLEAF = OUTDOOR_VEGETATION_GLB.broadleafTrees[0];
export const OUTDOOR_TREE_GLB_CONIFER = OUTDOOR_VEGETATION_GLB.coniferTrees[0];

export type OutdoorProceduralTreeProps = {
  seed: number;
  position: [number, number, number];
  rotationY: number;
  barkMap: THREE.Texture;
  /** Shared noise maps so procedural foliage matches the lawn/grass treatment */
  foliageMapBroadleaf?: THREE.Texture;
  foliageMapPine?: THREE.Texture;
};

export type OutdoorProceduralBushProps = {
  seed: number;
  position: [number, number, number];
  foliageMap?: THREE.Texture;
};

export type OutdoorVegetationTemplates = {
  broadleafTrees: (THREE.Group | null)[];
  coniferTrees: (THREE.Group | null)[];
  bushes: (THREE.Group | null)[];
  grassTufts: (THREE.Group | null)[];
};

/** External transcoders/decoders. Pulling decoder wasm from public CDNs keeps
 * the build step simple and avoids shipping large binaries from /public. */
const DRACO_DECODER_PATH = "https://www.gstatic.com/draco/v1/decoders/";
const KTX2_TRANSCODER_PATH = "https://www.gstatic.com/basis/v2.7.5/";

function fract01(n: number) {
  return n - Math.floor(n);
}

function rnd(seed: number) {
  return fract01(Math.sin(seed * 127.1 + 311.7) * 43758.5453123);
}

export function outdoorTreeIsConiferFromSeed(seed: number): boolean {
  return rnd(seed + 99) < 0.34;
}

/** Deterministic variant pick: same seed always resolves to the same template. */
export function pickVariant<T>(arr: readonly (T | null)[], seed: number): T | null {
  if (!arr.length) return null;
  const idx = Math.abs(Math.floor(rnd(seed + 53) * arr.length)) % arr.length;
  return arr[idx] ?? null;
}

/**
 * Heuristic: is this material the leafy / foliage part of a Poly Haven tree?
 * Poly Haven vegetation packs foliage into materials that carry an alpha-cutout
 * map (twigs/leaves) and bark/trunk into opaque materials. The material name
 * usually contains "twig" / "leaf" / "foliage" too. Either signal is enough.
 */
function isFoliageMaterial(m: THREE.Material): boolean {
  const std = m as THREE.MeshStandardMaterial;
  if (std.alphaMap) return true;
  if (std.transparent) return true;
  const name = (m.name || "").toLowerCase();
  return /twig|leaf|foliage|frond|needle/.test(name);
}

/**
 * Push a Poly Haven photoscan toward a lush, green look without losing texture
 * detail: multiply the diffuse `color` (Three.js multiplies it with the map at
 * shade time) by a slight green-leaning tint, and gently saturate. Applied
 * only to leaves/twigs so bark/trunks stay believably brown.
 *
 * The tint is intentionally *subtle* — it nudges desaturated coastal/dry
 * scans toward green, but doesn't crush species-specific color (e.g. the
 * purple flowers on `jacaranda_tree`).
 *
 * Tint defaults to a forest green pull. Pass `null` to disable.
 */
function applyVegetationTint(root: THREE.Object3D, tint: THREE.Color | null) {
  if (!tint) return;
  const hsl = { h: 0, s: 0, l: 0 };
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const apply = (m: THREE.Material) => {
      if (!isFoliageMaterial(m)) return;
      const std = m as THREE.MeshStandardMaterial;
      if (!std.color) return;
      // Multiply the diffuse base color by the tint. Both colors live in
      // linear space when the renderer composes; .multiply handles that.
      std.color.multiply(tint);
      // Mild saturation lift — Poly Haven photoscans are often desaturated.
      std.color.getHSL(hsl);
      hsl.s = Math.min(1, hsl.s * 1.08);
      std.color.setHSL(hsl.h, hsl.s, hsl.l);
    };
    const mat = mesh.material as THREE.Material | THREE.Material[];
    if (Array.isArray(mat)) mat.forEach(apply);
    else if (mat) apply(mat);
  });
}

// Subtle green nudge: keeps photo character intact for already-lush trees
// (jacaranda flowers, island_03 canopy) while still lifting drier scans.
const DEFAULT_FOLIAGE_TINT = new THREE.Color(0.9, 1.02, 0.84);

function applyVegetationShadows(root: THREE.Object3D, castShadow = true) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      const mat = mesh.material as THREE.Material | THREE.Material[];
      const ensureFoliage = (m: THREE.Material) => {
        const std = m as THREE.MeshStandardMaterial;
        // Photoscanned vegetation usually exports leaves with alpha cutout maps.
        // Force alphaTest + double-sided so foliage doesn't render as solid blocks.
        if (std.transparent || std.alphaMap) {
          std.transparent = false;
          std.alphaTest = 0.5;
          std.side = THREE.DoubleSide;
        }
      };
      if (Array.isArray(mat)) mat.forEach(ensureFoliage);
      else if (mat) ensureFoliage(mat);
    }
  });
}

/**
 * Normalize a loaded GLB template in-place so its bounding box has height 1m
 * with bottom at y=0. After this, instancing/cloning only needs to scale by
 * the target height in meters to position correctly on the ground.
 */
function normalizeTemplateInPlace(template: THREE.Object3D, targetH = 1) {
  template.scale.set(1, 1, 1);
  template.position.set(0, 0, 0);
  template.rotation.set(0, 0, 0);
  template.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(template);
  const size = box.getSize(new THREE.Vector3());
  const sy = Math.max(size.y, 0.02);
  const k = targetH / sy;
  template.scale.setScalar(k);
  template.position.y = -box.min.y * k;
  template.updateMatrixWorld(true);
}

/** Scale so world-space height ≈ targetHeightM and bottom sits at local y = 0. */
export function normalizeOutdoorVegetationClone(root: THREE.Object3D, targetHeightM: number) {
  root.scale.set(1, 1, 1);
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const sy = Math.max(size.y, 0.02);
  root.scale.setScalar(targetHeightM / sy);

  root.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(root);
  root.position.y -= box2.min.y;
}

export const normalizeOutdoorTreeClone = normalizeOutdoorVegetationClone;

function cloneVegetationTemplate(template: THREE.Group | null, targetHeightM: number, castShadow = true) {
  if (!template) return null;
  const g = template.clone(true);
  normalizeOutdoorVegetationClone(g, targetHeightM);
  applyVegetationShadows(g, castShadow);
  return g;
}

/**
 * One shared GLTFLoader for the whole hook lifecycle, configured with all
 * compressed-mesh decoders supported by the asset pipeline.
 */
function createConfiguredLoader(renderer: THREE.WebGLRenderer): GLTFLoader {
  const loader = new GLTFLoader();

  const draco = new DRACOLoader();
  draco.setDecoderPath(DRACO_DECODER_PATH);
  loader.setDRACOLoader(draco);

  const ktx2 = new KTX2Loader();
  ktx2.setTranscoderPath(KTX2_TRANSCODER_PATH);
  ktx2.detectSupport(renderer);
  loader.setKTX2Loader(ktx2);

  loader.setMeshoptDecoder(MeshoptDecoder);

  return loader;
}

export function useOutdoorVegetationGlbTemplates(): OutdoorVegetationTemplates {
  const { gl } = useThree();
  const [templates, setTemplates] = useState<OutdoorVegetationTemplates>({
    broadleafTrees: [],
    coniferTrees: [],
    bushes: [],
    grassTufts: [],
  });
  const loaderRef = useRef<GLTFLoader | null>(null);

  useEffect(() => {
    if (!loaderRef.current) {
      loaderRef.current = createConfiguredLoader(gl);
    }
    const loader = loaderRef.current;
    let cancelled = false;

    const loadOne = (url: string) =>
      new Promise<THREE.Group | null>((resolve) => {
        loader.load(
          url,
          (gltf) => {
            const scene = gltf.scene;
            normalizeTemplateInPlace(scene, 1);
            applyVegetationShadows(scene, true);
            applyVegetationTint(scene, DEFAULT_FOLIAGE_TINT);
            resolve(scene);
          },
          undefined,
          () => resolve(null)
        );
      });

    const loadAll = (urls: readonly string[]) => Promise.all(urls.map(loadOne));

    Promise.all([
      loadAll(OUTDOOR_VEGETATION_GLB.broadleafTrees),
      loadAll(OUTDOOR_VEGETATION_GLB.coniferTrees),
      loadAll(OUTDOOR_VEGETATION_GLB.bushes),
      loadAll(OUTDOOR_VEGETATION_GLB.grassTufts),
    ]).then(([broadleafTrees, coniferTrees, bushes, grassTufts]) => {
      if (cancelled) return;
      setTemplates({ broadleafTrees, coniferTrees, bushes, grassTufts });
    });

    return () => {
      cancelled = true;
    };
  }, [gl]);

  return templates;
}

/** Backwards-compat shim for any callers that only need the legacy two-tree shape. */
export function useOutdoorTreeGlbTemplates() {
  const { broadleafTrees, coniferTrees } = useOutdoorVegetationGlbTemplates();
  return { broadleaf: broadleafTrees[0] ?? null, conifer: coniferTrees[0] ?? null };
}

export function OutdoorTreeInstance({
  seed,
  position,
  rotationY,
  barkMap,
  foliageMapBroadleaf,
  foliageMapPine,
  broadleafTemplates,
  coniferTemplates,
  Fallback,
}: {
  seed: number;
  position: [number, number, number];
  rotationY: number;
  barkMap: THREE.Texture;
  foliageMapBroadleaf?: THREE.Texture;
  foliageMapPine?: THREE.Texture;
  broadleafTemplates: readonly (THREE.Group | null)[];
  coniferTemplates: readonly (THREE.Group | null)[];
  Fallback: ComponentType<OutdoorProceduralTreeProps>;
}) {
  const wantConifer = outdoorTreeIsConiferFromSeed(seed);
  const variants = wantConifer ? coniferTemplates : broadleafTemplates;
  const template = pickVariant(variants, seed);

  const clone = useMemo(() => {
    const baseH = wantConifer ? 4.4 + rnd(seed) * 4.2 : 3.4 + rnd(seed) * 3.2;
    const jitter = 0.76 + rnd(seed + 2) * 0.38;
    return cloneVegetationTemplate(template, baseH * jitter);
  }, [template, seed, wantConifer]);

  if (!clone) {
    return (
      <Fallback
        seed={seed}
        position={position}
        rotationY={rotationY}
        barkMap={barkMap}
        foliageMapBroadleaf={foliageMapBroadleaf}
        foliageMapPine={foliageMapPine}
      />
    );
  }

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <primitive object={clone} />
    </group>
  );
}

export function OutdoorBushInstance({
  seed,
  position,
  templates,
  foliageMap,
  Fallback,
}: {
  seed: number;
  position: [number, number, number];
  templates: readonly (THREE.Group | null)[];
  foliageMap?: THREE.Texture;
  Fallback: ComponentType<OutdoorProceduralBushProps>;
}) {
  const template = pickVariant(templates, seed);
  const clone = useMemo(() => {
    const h = 0.42 + rnd(seed + 23) * 0.32;
    return cloneVegetationTemplate(template, h);
  }, [template, seed]);

  if (!clone) {
    return <Fallback seed={seed} position={position} foliageMap={foliageMap} />;
  }

  return (
    <group position={position} rotation={[0, rnd(seed + 71) * Math.PI * 2, 0]}>
      <primitive object={clone} />
    </group>
  );
}

export function OutdoorGrassClumpInstance({
  seed,
  position,
  rotationY,
  templates,
}: {
  seed: number;
  position: [number, number, number];
  rotationY: number;
  templates: readonly (THREE.Group | null)[];
}) {
  const template = pickVariant(templates, seed);
  const clone = useMemo(() => {
    const h = 0.22 + rnd(seed + 31) * 0.22;
    return cloneVegetationTemplate(template, h, false);
  }, [template, seed]);

  if (!clone) return null;

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <primitive object={clone} />
    </group>
  );
}

/* ------------------------------------------------------------------------- */
/*  Instancing — one InstancedMesh per leaf mesh of a normalized template.   */
/*                                                                           */
/*  Templates returned from `useOutdoorVegetationGlbTemplates` are pre-      */
/*  normalized to 1 m world height with bottom at y=0, so per-instance       */
/*  `scale` is just the target height in meters.                             */
/* ------------------------------------------------------------------------- */

export type InstancedVegetationPlacement = {
  position: [number, number, number];
  rotationY: number;
  /** Target world-space height in meters (template is 1m tall, so scale == height). */
  scale: number;
};

type LeafCapture = {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  localMatrix: THREE.Matrix4;
};

function captureTemplateLeaves(template: THREE.Object3D): LeafCapture[] {
  template.updateMatrixWorld(true);
  const out: LeafCapture[] = [];
  template.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) {
      out.push({
        geometry: mesh.geometry,
        material: mesh.material,
        localMatrix: mesh.matrixWorld.clone(),
      });
    }
  });
  return out;
}

const _instTr = new THREE.Vector3();
const _instQuat = new THREE.Quaternion();
const _instEul = new THREE.Euler();
const _instSc = new THREE.Vector3();
const _instPlacement = new THREE.Matrix4();
const _instCombined = new THREE.Matrix4();

/**
 * Renders `placements.length` copies of `template` using one `InstancedMesh`
 * per leaf mesh of the GLB. Total draw calls per variant is independent of
 * placement count, so a yard with hundreds of trees costs the same as one.
 */
export function InstancedVegetationVariant({
  template,
  placements,
  castShadow = true,
}: {
  template: THREE.Group | null;
  placements: InstancedVegetationPlacement[];
  castShadow?: boolean;
}) {
  const leaves = useMemo(() => (template ? captureTemplateLeaves(template) : []), [template]);
  const meshRefs = useRef<(THREE.InstancedMesh | null)[]>([]);

  useEffect(() => {
    if (!leaves.length || !placements.length) return;
    placements.forEach((p, i) => {
      _instTr.set(p.position[0], p.position[1], p.position[2]);
      _instEul.set(0, p.rotationY, 0);
      _instQuat.setFromEuler(_instEul);
      _instSc.set(p.scale, p.scale, p.scale);
      _instPlacement.compose(_instTr, _instQuat, _instSc);
      for (let li = 0; li < leaves.length; li++) {
        _instCombined.multiplyMatrices(_instPlacement, leaves[li].localMatrix);
        meshRefs.current[li]?.setMatrixAt(i, _instCombined);
      }
    });
    for (let li = 0; li < leaves.length; li++) {
      const im = meshRefs.current[li];
      if (im) {
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
      }
    }
  }, [leaves, placements]);

  if (!template || !leaves.length || !placements.length) return null;

  return (
    <>
      {leaves.map((leaf, li) => (
        <instancedMesh
          key={li}
          ref={(el) => {
            meshRefs.current[li] = el;
          }}
          args={[leaf.geometry, leaf.material as THREE.Material, placements.length]}
          castShadow={castShadow}
          receiveShadow
          frustumCulled={false}
        />
      ))}
    </>
  );
}

/**
 * Group placements by which variant (deterministically from seed) each one
 * resolves to. Returns one bucket per variant index. Useful for feeding
 * `InstancedVegetationVariant` per variant.
 */
export function bucketPlacementsByVariant<P extends { seed: number }>(
  placements: P[],
  variantCount: number
): P[][] {
  const buckets: P[][] = Array.from({ length: variantCount }, () => []);
  if (variantCount === 0) return buckets;
  for (const p of placements) {
    const idx = Math.abs(Math.floor(rnd(p.seed + 53) * variantCount)) % variantCount;
    buckets[idx].push(p);
  }
  return buckets;
}

/* ------------------------------------------------------------------------- */
/*  TODO (deferred): billboard impostors for far trees.                      */
/*                                                                           */
/*  At ~52 placed trees, instancing already gives us a fixed sub-20 draw-    */
/*  call cost regardless of distance, so impostors aren't critical. If a    */
/*  future scene scales to hundreds of trees, the recommended approach is:   */
/*    1. At template load, render each variant into a 256×512 offscreen     */
/*       RenderTarget once (`renderer.render(impostorScene, impostorCam)`). */
/*    2. Build a shared `MeshBasicMaterial` per variant using that texture, */
/*       with `alphaTest` for the silhouette.                                */
/*    3. Add a `<TreeImpostorLOD>` component that holds two refs            */
/*       (full + billboard `InstancedMesh`) and updates instance counts /   */
/*       matrices every ~0.5 s based on `camera.position.distanceTo(p)`.    */
/*    4. Trees beyond ~25 m render as billboards; closer trees use the      */
/*       full GLB instances. Hysteresis (e.g. 23 m / 27 m) avoids popping.  */
/* ------------------------------------------------------------------------- */
