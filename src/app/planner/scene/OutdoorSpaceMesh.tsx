"use client";

import { useMemo, useEffect, useRef, useState, useLayoutEffect } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { Sky } from "@react-three/drei";
import { usePlannerStore } from "../store/usePlannerStore";
import { buildPlannerFloorMaterialFromRoom } from "../roomFloorMaterial";
import { ROOM_WALL_THICKNESS_M as WALL_THICKNESS } from "../constants/roomGeometry";
import {
  bucketPlacementsByVariant,
  InstancedVegetationVariant,
  OutdoorBushInstance,
  OutdoorTreeInstance,
  outdoorTreeIsConiferFromSeed,
  useOutdoorVegetationGlbTemplates,
  type InstancedVegetationPlacement,
} from "./outdoorTreeGlb";
import OutdoorGrassBlades, { pickBladeDensityScale } from "./OutdoorGrassBlades";

function fract01(n: number): number {
  return n - Math.floor(n);
}

/** Stable pseudo-random in [0, 1) for placement from integer seeds */
function rnd(seed: number): number {
  return fract01(Math.sin(seed * 127.1 + 311.7) * 43758.5453123);
}

const smoothNoise = (
  cx: number,
  cy: number,
  freq: number,
  ox: number,
  oy: number
): number => {
  const x = cx * freq + ox;
  const y = cy * freq + oy;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const xf = x - x0;
  const yf = y - y0;
  const hash = (i: number, j: number) => fract01(Math.sin(i * 72.1 + j * 39.2) * 9919);

  const v00 = hash(x0, y0);
  const v10 = hash(x0 + 1, y0);
  const v01 = hash(x0, y0 + 1);
  const v11 = hash(x0 + 1, y0 + 1);
  const ax = xf * xf * (3 - 2 * xf);
  const ay = yf * yf * (3 - 2 * yf);
  const x1 = v00 * (1 - ax) + v10 * ax;
  const x2 = v01 * (1 - ax) + v11 * ax;
  return x1 * (1 - ay) + x2 * ay;
};

/** Static aerial grass: soil patches, blade streaks, natural color variation (no animation). */
function buildGrassTextureData(size = 768): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const d = img.data;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const nx = px / size;
      const ny = py / size;
      const n1 = smoothNoise(nx, ny, 5.5, 0, 0);
      const n2 = smoothNoise(nx, ny, 18, 13.2, 8.1);
      const n3 = smoothNoise(nx, ny, 42, 5.1, 21.7);
      const n4 = smoothNoise(nx * 1.3, ny * 1.3, 96, 2.2, 9.4);

      const streak =
        Math.sin((px * 0.11 + py * 0.07) + n2 * 7.2) * 0.5 +
        Math.sin((px * -0.09 + py * 0.13) + n3 * 5.1) * 0.35;
      const streakMix = streak * 0.12 + 0.88;

      const blend = n1 * 0.42 + n2 * 0.32 + n3 * 0.18 + n4 * 0.08;
      const soil = n4 < 0.28 ? (0.28 - n4) * 1.35 : 0;

      const hueShift = (blend - 0.5) * 18 + streak * 6;
      let g = (62 + blend * 58 + hueShift * 0.28) * streakMix;
      let r = (28 + blend * 32 + Math.max(0, hueShift) * 0.45) * streakMix;
      let b = (32 + blend * 26) * streakMix;

      g += soil * -22;
      r += soil * 18;
      b += soil * 8;

      const sun = Math.max(0, streak * 0.5 + 0.2);
      g += sun * 8;
      r += sun * 5;

      const idx = (py * size + px) * 4;
      d[idx] = Math.min(255, r);
      d[idx + 1] = Math.min(255, g);
      d[idx + 2] = Math.min(255, b);
      d[idx + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Shared bark — vertical grain, static (one texture for all trunks). */
function buildBarkTexture(size = 256): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const d = img.data;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const nx = px / size;
      const ny = py / size;
      const grain = smoothNoise(nx, ny * 3.2, 22, 0, 0);
      const ridge = Math.sin(px * 0.35 + grain * 4) * 0.5 + 0.5;
      const dark = 42 + grain * 38 + ridge * 22;
      const idx = (py * size + px) * 4;
      d[idx] = dark * 1.05;
      d[idx + 1] = dark * 0.72;
      d[idx + 2] = dark * 0.48;
      d[idx + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Leaf mottling for broadleaf crowns — matches the grass texture philosophy (noise, not flat color). */
function buildBroadleafFoliageTexture(size = 384): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const d = img.data;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const nx = px / size;
      const ny = py / size;
      const n1 = smoothNoise(nx, ny, 11, 0, 0);
      const n2 = smoothNoise(nx, ny, 38, 12.2, 9.1);
      const n3 = smoothNoise(nx, ny, 72, 4.4, 16.8);
      const vein =
        Math.sin(px * 0.22 + py * 0.15 + n2 * 5) * 0.5 +
        Math.sin(px * -0.18 + py * 0.24 + n3 * 4) * 0.35;

      const blend = n1 * 0.45 + n2 * 0.35 + n3 * 0.2;
      const spot = vein * 0.14 + 0.86;

      let g = (48 + blend * 95 + vein * 12) * spot;
      let r = (22 + blend * 48 + Math.max(0, vein) * 10) * spot;
      const b = (28 + blend * 38) * spot;

      const dry = n3 > 0.72 ? (n3 - 0.72) * 55 : 0;
      r += dry * 1.1;
      g += dry * -0.35;

      const idx = (py * size + px) * 4;
      d[idx] = Math.min(255, r);
      d[idx + 1] = Math.min(255, g);
      d[idx + 2] = Math.min(255, b);
      d[idx + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Finer blue-green needle noise for conifer layers. */
function buildPineFoliageTexture(size = 320): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const d = img.data;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const nx = px / size;
      const ny = py / size;
      const n1 = smoothNoise(nx, ny, 28, 0, 0);
      const n2 = smoothNoise(nx, ny, 68, 19.1, 7.4);
      const n3 = smoothNoise(nx * 1.4, ny * 1.4, 112, 3.2, 11.3);
      const grain = n1 * 0.5 + n2 * 0.32 + n3 * 0.18;
      const tip = Math.sin(px * 0.55 + py * 0.48 + grain * 8) * 0.5 + 0.5;

      const g = 32 + grain * 58 + tip * 18;
      const r = 12 + grain * 28 + tip * 8;
      const b = 38 + grain * 42 + tip * 12;

      const idx = (py * size + px) * 4;
      d[idx] = Math.min(255, r);
      d[idx + 1] = Math.min(255, g);
      d[idx + 2] = Math.min(255, b);
      d[idx + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function pointOutsideDeck(
  x: number,
  z: number,
  cx: number,
  cz: number,
  halfW: number,
  halfD: number,
  pad: number
): boolean {
  return Math.abs(x - cx) > halfW + pad || Math.abs(z - cz) > halfD + pad;
}

const _vBranchStart = new THREE.Vector3();
const _vBranchEnd = new THREE.Vector3();
const _vBranchDir = new THREE.Vector3();
const _vBranchMid = new THREE.Vector3();
const _qBranch = new THREE.Quaternion();
const _yUp = new THREE.Vector3(0, 1, 0);

/** Tapered limb along a segment (thick at trunk end). */
function BranchMesh({
  ax,
  ay,
  az,
  bx,
  by,
  bz,
  thick,
  thin,
  material,
}: {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  thick: number;
  thin: number;
  material: THREE.MeshStandardMaterial;
}) {
  const transform = useMemo(() => {
    _vBranchStart.set(ax, ay, az);
    _vBranchEnd.set(bx, by, bz);
    _vBranchDir.copy(_vBranchEnd).sub(_vBranchStart);
    const len = Math.max(0.05, _vBranchDir.length());
    _vBranchDir.multiplyScalar(1 / len);
    _vBranchMid.copy(_vBranchStart).add(_vBranchEnd).multiplyScalar(0.5);
    _qBranch.setFromUnitVectors(_yUp, _vBranchDir);
    return {
      mid: _vBranchMid.clone(),
      quat: _qBranch.clone(),
      len,
    };
  }, [ax, ay, az, bx, by, bz]);

  return (
    <mesh castShadow receiveShadow position={transform.mid} quaternion={transform.quat} material={material}>
      {/* radiusTop (+Y / tip) thin, radiusBottom (-Y / trunk) thick */}
      <cylinderGeometry args={[thin, thick, transform.len, 8]} />
    </mesh>
  );
}

/** Organic silhouette: irregular ellipsoid masses + bark limbs — avoids glossy bubble crowns. */
function NaturalTree({
  seed,
  position,
  rotationY,
  barkMap,
  foliageMapBroadleaf,
  foliageMapPine,
}: {
  seed: number;
  position: [number, number, number];
  rotationY: number;
  barkMap: THREE.Texture;
  foliageMapBroadleaf?: THREE.Texture;
  foliageMapPine?: THREE.Texture;
}) {
  const isPine = rnd(seed + 99) < 0.34;
  const trunkH = isPine ? 1.35 + rnd(seed) * 1.85 : 1.05 + rnd(seed) * 1.6;
  const trunkR = (isPine ? 0.058 : 0.068) + rnd(seed + 17) * (isPine ? 0.048 : 0.054);
  const rootH = Math.min(0.34, trunkH * 0.22);
  const stemH = trunkH - rootH;

  const leanX = (rnd(seed + 401) - 0.5) * 0.09;
  const leanZ = (rnd(seed + 403) - 0.5) * 0.09;

  const trunkMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: barkMap,
        color: new THREE.Color("#ffffff").multiplyScalar(0.62 + rnd(seed + 3) * 0.28),
        roughness: 0.94,
        metalness: 0,
      }),
    [barkMap, seed]
  );

  const pineMats = useMemo(() => {
    const deep = new THREE.Color("#153824").offsetHSL(rnd(seed + 5) * 0.02 - 0.01, rnd(seed + 7) * 0.04, rnd(seed + 9) * 0.03);
    const mid = deep.clone().offsetHSL(0.02, -0.03, 0.055);
    const map = foliageMapPine;
    return [
      new THREE.MeshStandardMaterial({ color: deep, map, roughness: 0.88, metalness: 0 }),
      new THREE.MeshStandardMaterial({ color: mid, map, roughness: 0.82, metalness: 0 }),
    ];
  }, [seed, foliageMapPine]);

  const canopyMats = useMemo(() => {
    const base = new THREE.Color("#284d31").offsetHSL(rnd(seed + 211) * 0.025 - 0.012, rnd(seed + 213) * 0.05, rnd(seed + 215) * 0.04);
    const sunlit = base.clone().offsetHSL(-0.02, -0.05, 0.07);
    const shaded = base.clone().offsetHSL(0.03, 0.06, -0.08);
    const deep = base.clone().offsetHSL(0.02, 0.04, -0.12);
    const map = foliageMapBroadleaf;
    return [
      new THREE.MeshStandardMaterial({ color: sunlit, map, roughness: 0.88, metalness: 0 }),
      new THREE.MeshStandardMaterial({ color: base, map, roughness: 0.84, metalness: 0 }),
      new THREE.MeshStandardMaterial({ color: shaded, map, roughness: 0.86, metalness: 0 }),
      new THREE.MeshStandardMaterial({ color: deep, map, roughness: 0.9, metalness: 0 }),
    ];
  }, [seed, foliageMapBroadleaf]);

  if (isPine) {
    const layers = 5 + Math.floor(rnd(seed + 44) * 2);
    const subsPerLayer = 3;

    return (
      <group position={position} rotation={[leanX, rotationY, leanZ]}>
        <mesh castShadow receiveShadow position={[0, rootH * 0.5, 0]} material={trunkMat}>
          <cylinderGeometry args={[trunkR * 1.28, trunkR * 1.42, rootH, 14]} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, rootH + stemH * 0.5, 0]} material={trunkMat}>
          <cylinderGeometry args={[trunkR * 0.74, trunkR * 1.08, stemH, 14]} />
        </mesh>
        {Array.from({ length: layers }).map((_, li) => {
          const t = layers <= 1 ? 0 : li / (layers - 1);
          const yBase = trunkH * (0.34 + t * 0.54);
          const radScale = (1.14 - t * 0.66) * (0.36 + rnd(seed + li * 17) * 0.22);
          const h = 0.48 + rnd(seed + li * 23) * 0.42;

          return Array.from({ length: subsPerLayer }).map((_, sj) => {
            const spin = (sj / subsPerLayer) * Math.PI * 2 + rnd(seed + li * 91 + sj) * 0.55;
            const ox = Math.cos(spin) * radScale * 0.26;
            const oz = Math.sin(spin) * radScale * 0.26;
            const tipLean = (rnd(seed + li * 113 + sj) - 0.5) * 0.11;
            const tipTwist = (rnd(seed + li * 127 + sj) - 0.5) * 0.09;
            const sx = 0.92 + rnd(seed + li * 139 + sj) * 0.22;
            const sz = 0.88 + rnd(seed + li * 151 + sj) * 0.26;
            const mat = pineMats[(li + sj) % pineMats.length];

            return (
              <mesh
                key={`${li}-${sj}`}
                castShadow
                receiveShadow
                position={[ox, yBase + h * 0.48, oz]}
                rotation={[tipLean, spin * 0.18 + rnd(seed + li * 163 + sj) * 0.2, tipTwist]}
                scale={[sx, 1, sz]}
                material={mat}
              >
                <coneGeometry args={[radScale, h, 16]} />
              </mesh>
            );
          });
        })}
      </group>
    );
  }

  const crownSpread = 0.52 + rnd(seed + 51) * 0.52;
  const nMass = 10 + Math.floor(rnd(seed + 12) * 5);

  type Mass = {
    ox: number;
    oy: number;
    oz: number;
    sx: number;
    sy: number;
    sz: number;
    rot: [number, number, number];
    matIdx: number;
  };

  const masses: Mass[] = [];
  for (let bi = 0; bi < nMass; bi++) {
    const theta = rnd(seed + bi * 11) * Math.PI * 2;
    const radDist = crownSpread * (0.35 + rnd(seed + bi * 19) * 0.72);
    const lift = trunkH * (0.68 + rnd(seed + bi * 29) * 0.58);
    const outward = 0.65 + rnd(seed + bi * 31) * 0.55;

    const ox = Math.cos(theta) * radDist * outward;
    const oz = Math.sin(theta) * radDist * outward;
    const oy = lift + (rnd(seed + bi * 37) - 0.35) * crownSpread * 0.42;

    const baseR = (0.22 + rnd(seed + bi * 41) * 0.38) * (0.72 + crownSpread * 0.2);
    const sx = baseR * (1.05 + rnd(seed + bi * 43) * 0.55);
    const sy = baseR * (0.38 + rnd(seed + bi * 47) * 0.28);
    const sz = baseR * (0.82 + rnd(seed + bi * 53) * 0.48);

    const matIdx =
      oy > trunkH * 1.05 ? Math.floor(rnd(seed + bi * 59) * 2) : 2 + Math.floor(rnd(seed + bi * 61) * 2);

    masses.push({
      ox,
      oy,
      oz,
      sx,
      sy,
      sz,
      rot: [
        (rnd(seed + bi * 163) - 0.5) * 0.52,
        rnd(seed + bi * 167) * Math.PI * 2,
        (rnd(seed + bi * 173) - 0.5) * 0.52,
      ],
      matIdx: Math.min(3, Math.max(0, matIdx)),
    });
  }

  const branchEnds = masses.slice(0, Math.min(6, masses.length));

  return (
    <group position={position} rotation={[leanX, rotationY, leanZ]}>
      <mesh castShadow receiveShadow position={[0, rootH * 0.5, 0]} material={trunkMat}>
        <cylinderGeometry args={[trunkR * 1.22, trunkR * 1.38, rootH, 16]} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, rootH + stemH * 0.5, 0]} material={trunkMat}>
        <cylinderGeometry args={[trunkR * 0.82, trunkR * 1.04, stemH, 16]} />
      </mesh>

      {branchEnds.map((tgt, bi) => {
        const ang = (bi / Math.max(1, branchEnds.length)) * Math.PI * 2 + rnd(seed + bi * 191) * 0.5;
        const ring = trunkR * (0.92 + rnd(seed + bi * 197) * 0.18);
        const startY = trunkH * (0.46 + rnd(seed + bi * 203) * 0.22);
        const ax = Math.cos(ang) * ring;
        const az = Math.sin(ang) * ring;
        const bx = tgt.ox * 0.62 + (rnd(seed + bi * 211) - 0.5) * 0.12;
        const by = tgt.oy * 0.72 + rnd(seed + bi * 217) * 0.08;
        const bz = tgt.oz * 0.62 + (rnd(seed + bi * 223) - 0.5) * 0.12;
        return (
          <BranchMesh
            key={`br-${bi}`}
            ax={ax}
            ay={startY}
            az={az}
            bx={bx}
            by={by}
            bz={bz}
            thick={trunkR * (0.42 + rnd(seed + bi * 229) * 0.22)}
            thin={trunkR * (0.06 + rnd(seed + bi * 233) * 0.06)}
            material={trunkMat}
          />
        );
      })}

      {masses.map((m, bi) => (
        <mesh
          key={`m-${bi}`}
          castShadow
          receiveShadow
          position={[m.ox, m.oy, m.oz]}
          rotation={m.rot}
          scale={[m.sx, m.sy, m.sz]}
          material={canopyMats[m.matIdx]}
        >
          <sphereGeometry args={[1, 18, 16]} />
        </mesh>
      ))}
    </group>
  );
}

function BushCluster({
  seed,
  position,
  foliageMap,
}: {
  seed: number;
  position: [number, number, number];
  foliageMap?: THREE.Texture;
}) {
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#3f7d47").offsetHSL(rnd(seed) * 0.06 - 0.03, rnd(seed + 1) * 0.12, rnd(seed + 2) * 0.08),
        map: foliageMap,
        roughness: 0.92,
        metalness: 0,
      }),
    [seed, foliageMap]
  );
  const spheres = 4 + Math.floor(rnd(seed + 3) * 3);
  return (
    <group position={position}>
      {Array.from({ length: spheres }).map((_, i) => {
        const rx = (rnd(seed + i * 11) - 0.5) * 0.55;
        const rz = (rnd(seed + i * 17) - 0.5) * 0.55;
        const ry = rnd(seed + i * 23) * 0.12;
        const sc = 0.22 + rnd(seed + i * 31) * 0.16;
        return (
          <mesh key={i} castShadow receiveShadow position={[rx, ry + 0.14, rz]} material={mat}>
            <sphereGeometry args={[sc, 12, 10]} />
          </mesh>
        );
      })}
    </group>
  );
}

/** Open patio / deck: sky, sun, lawn and woodland skirt — no enclosing room shell. */
export default function OutdoorSpaceMesh() {
  const room = usePlannerStore((s) => s.room);
  const { invalidate } = useThree();
  const vegetationGlbs = useOutdoorVegetationGlbTemplates();

  const { width: w, depth: d } = room;
  const T = WALL_THICKNESS;

  const sunPos = useMemo(() => new THREE.Vector3(w * 0.92, Math.max(w, d) * 1.35, d * 0.88), [w, d]);

  const fogNear = Math.max(8.5, Math.max(w, d) * 3.8 * 0.3);
  const fogFar = Math.max(34, Math.max(w, d) * 4.2);

  const floorMaterial = useMemo(() => {
    const floorInput = {
      ...room,
      floorStyle: room.floorStyle ?? "laminate-weathered-oak",
    };
    const m = buildPlannerFloorMaterialFromRoom(floorInput, [2.35, 2.35], {
      floorWidthM: w,
      floorDepthM: d,
      onTextureUpdate: invalidate,
      toneMode: "color",
      roughness: 0.78,
      metalness: 0,
    });
    m.polygonOffset = true;
    m.polygonOffsetFactor = -1;
    m.polygonOffsetUnits = -1;
    return m;
  }, [
    room.floorStyle,
    room.floorMaterialMode,
    room.floorCustomTextureUrl,
    room.floorUvRepeatX,
    room.floorUvRepeatY,
    room.floorTextureWidthCm,
    room.floorTextureHeightCm,
    room.floorTextureStartSide,
    room.floorLayoutPattern,
    room.floorUvRotationDeg,
    room.floorTileWidthCm,
    room.floorTileHeightCm,
    room.floorTileGroutCm,
    room.floorTileGroutColor,
    w,
    d,
    invalidate,
  ]);

  const edgeMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#aeb5aa",
        roughness: 0.92,
        metalness: 0,
      }),
    []
  );

  const deckSlabMaterials = useMemo(
    () => [edgeMaterial, edgeMaterial, edgeMaterial, edgeMaterial, edgeMaterial, edgeMaterial],
    [edgeMaterial],
  );

  const grassTexture = useMemo(() => {
    const tex = buildGrassTextureData(768);
    const span = Math.max(60, Math.max(w, d) * 5);
    const repeat = Math.max(3.2, span / 14);
    tex.repeat.set(repeat, repeat);
    tex.needsUpdate = true;
    return tex;
  }, [w, d]);
  const barkTexture = useMemo(() => {
    const t = buildBarkTexture(256);
    t.repeat.set(1.6, 3.4);
    t.needsUpdate = true;
    return t;
  }, []);
  const foliageTextureBroadleaf = useMemo(() => {
    const t = buildBroadleafFoliageTexture(384);
    t.repeat.set(2.4, 2.4);
    t.needsUpdate = true;
    return t;
  }, []);
  const foliageTexturePine = useMemo(() => {
    const t = buildPineFoliageTexture(320);
    t.repeat.set(3.2, 2.6);
    t.needsUpdate = true;
    return t;
  }, []);

  useEffect(() => {
    return () => {
      grassTexture.dispose();
      barkTexture.dispose();
      foliageTextureBroadleaf.dispose();
      foliageTexturePine.dispose();
    };
  }, [grassTexture, barkTexture, foliageTextureBroadleaf, foliageTexturePine]);

  const grassMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      map: grassTexture,
      // Procedural fallback — texture skews yellow/dusty; multiply toward fresh green.
      color: new THREE.Color(0.7, 1.05, 0.66),
      roughness: 0.97,
      metalness: 0,
    });
  }, [grassTexture]);

  /**
   * PBR ground material from the WebP texture set in `public/planner/vegetation/ground/`.
   * Falls back to the procedural canvas grass material if any map is missing.
   */
  const [pbrGroundMaterial, setPbrGroundMaterial] = useState<THREE.MeshStandardMaterial | null>(null);
  useEffect(() => {
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    const loadOne = (url: string) =>
      new Promise<THREE.Texture | null>((resolve) => {
        loader.load(
          url,
          (tex) => resolve(tex),
          undefined,
          () => resolve(null)
        );
      });
    Promise.all([
      loadOne("/planner/vegetation/ground/grass_albedo.webp"),
      loadOne("/planner/vegetation/ground/grass_normal.webp"),
      loadOne("/planner/vegetation/ground/grass_roughness.webp"),
      loadOne("/planner/vegetation/ground/grass_ao.webp"),
    ]).then(([albedo, normal, rough, ao]) => {
      if (cancelled || !albedo || !normal || !rough || !ao) return;
      const span = Math.max(60, Math.max(w, d) * 5);
      const repeat = Math.max(3.5, span / 6);
      [albedo, normal, rough, ao].forEach((t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(repeat, repeat);
        t.anisotropy = 8;
        t.needsUpdate = true;
      });
      albedo.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshStandardMaterial({
        map: albedo,
        normalMap: normal,
        roughnessMap: rough,
        aoMap: ao,
        roughness: 1,
        metalness: 0,
        // Subtle green lift on top of the already-lush `leafy_grass` texture.
        color: new THREE.Color(0.92, 1.04, 0.88),
      });
      setPbrGroundMaterial(mat);
      invalidate();
    });
    return () => {
      cancelled = true;
    };
  }, [w, d, invalidate]);

  useEffect(() => {
    return () => {
      pbrGroundMaterial?.map?.dispose();
      pbrGroundMaterial?.normalMap?.dispose();
      pbrGroundMaterial?.roughnessMap?.dispose();
      pbrGroundMaterial?.aoMap?.dispose();
      pbrGroundMaterial?.dispose();
    };
  }, [pbrGroundMaterial]);

  const lawnMaterial = pbrGroundMaterial ?? grassMaterial;
  const bladeDensity = useMemo(() => pickBladeDensityScale(), []);

  const dirRef = useRef<THREE.DirectionalLight>(null);
  useEffect(() => {
    const light = dirRef.current;
    if (!light) return;
    const cam = light.shadow.camera as THREE.OrthographicCamera;
    const extent = Math.max(10, Math.max(w, d) * 1.55);
    cam.left = -extent;
    cam.right = extent;
    cam.top = extent;
    cam.bottom = -extent;
    cam.near = 0.25;
    cam.far = extent * 12;
    cam.updateProjectionMatrix();
    invalidate();
  }, [w, d, invalidate]);

  const grassSpan = Math.max(72, Math.max(w, d) * 5.5);
  const grassY = -0.012;

  const floorMinX = -w / 2 - T;
  const floorMaxX = w / 2 + T;
  const floorMinZ = -d / 2 - T;
  const floorMaxZ = d / 2 + T;
  const floorW = floorMaxX - floorMinX;
  const floorD = floorMaxZ - floorMinZ;
  const floorCx = (floorMinX + floorMaxX) / 2;
  const floorCz = (floorMinZ + floorMaxZ) / 2;
  const halfW = floorW / 2;
  const halfD = floorD / 2;
  const deckHalfDiagonal = Math.sqrt(halfW * halfW + halfD * halfD);

  const deckMeshRef = useRef<THREE.Mesh>(null);
  const deckFinishMeshRef = useRef<THREE.Mesh>(null);
  const grassMeshRef = useRef<THREE.Mesh>(null);

  const deckFloorGeometry = useMemo(() => new THREE.BoxGeometry(floorW, T, floorD), [floorW, floorD, T]);

  useEffect(() => () => deckFloorGeometry.dispose(), [deckFloorGeometry]);

  const deckFinishY = 0.004;

  const fenceHitMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    []
  );

  useLayoutEffect(() => {
    const slab = deckMeshRef.current;
    if (slab) {
      slab.name = "floor-slab";
    }
    const deck = deckFinishMeshRef.current;
    if (deck) {
      deck.userData.surfaceType = "floor";
      deck.userData.zone = "outdoor";
      deck.userData.surfaceTopY = 0;
      deck.userData.patioType = "covered";
    }
    const grass = grassMeshRef.current;
    if (grass) {
      grass.userData.surfaceType = "ground";
      grass.userData.zone = "outdoor";
      grass.userData.surfaceTopY = grassY + 0.002;
    }
  }, [grassY, deckFloorGeometry, deckFinishY]);

  type TreePlacement = InstancedVegetationPlacement & { seed: number; isConifer: boolean };
  type BushPlacement = InstancedVegetationPlacement & { seed: number };
  type GrassClumpPlacement = InstancedVegetationPlacement & { seed: number };

  const trees = useMemo<TreePlacement[]>(() => {
    const out: TreePlacement[] = [];
    const maxTrees = 52;
    const pad = 0.35;

    for (let i = 0; i < maxTrees; i++) {
      const ring = 1 + Math.floor(rnd(i * 997) * 3);
      const baseR = deckHalfDiagonal + 1.35 + ring * 2.1 + rnd(i * 541) * 3.8;
      const angle = rnd(i * 223) * Math.PI * 2 + i * 0.6180339887 * Math.PI * 2;

      let x = floorCx + Math.cos(angle) * baseR;
      let z = floorCz + Math.sin(angle) * baseR;

      if (!pointOutsideDeck(x, z, floorCx, floorCz, halfW, halfD, pad)) {
        const bump = halfW + halfD + rnd(i * 661) * 4;
        x = floorCx + Math.sign(Math.cos(angle)) * (halfW + pad + bump * (0.35 + rnd(i * 773)));
        z = floorCz + Math.sign(Math.sin(angle)) * (halfD + pad + bump * (0.35 + rnd(i * 881)));
      }

      const edgeDist = Math.min(
        grassSpan * 0.48 - Math.abs(x - floorCx),
        grassSpan * 0.48 - Math.abs(z - floorCz)
      );
      if (edgeDist < 1.2) continue;

      const seed = 9000 + i * 17;
      const isConifer = outdoorTreeIsConiferFromSeed(seed);
      // Full-canopy broadleaf scans look best at 5-9 m. Conifers stay tall.
      const baseH = isConifer ? 5.0 + rnd(seed) * 4.2 : 5.2 + rnd(seed) * 3.4;
      const jitter = 0.82 + rnd(seed + 2) * 0.34;
      out.push({
        seed,
        isConifer,
        position: [x, grassY, z],
        rotationY: rnd(i * 409) * Math.PI * 2,
        scale: baseH * jitter,
      });
    }
    return out;
  }, [deckHalfDiagonal, floorCx, floorCz, grassSpan, halfW, halfD, grassY]);

  const bushes = useMemo<BushPlacement[]>(() => {
    const out: BushPlacement[] = [];
    const count = 38;
    const pad = 0.22;

    for (let i = 0; i < count; i++) {
      const t = i / count;
      const side = Math.floor(rnd(i * 331) * 4);
      const along = (rnd(i * 557) - 0.5) * 0.92;

      let x = floorCx;
      let z = floorCz;
      const offset = 0.55 + rnd(i * 419) * 0.95 + (t % 0.22) * 0.4;

      if (side === 0) {
        x = floorCx + halfW + pad + offset;
        z = floorCz + along * floorD * 0.45;
      } else if (side === 1) {
        x = floorCx - halfW - pad - offset;
        z = floorCz + along * floorD * 0.45;
      } else if (side === 2) {
        z = floorCz + halfD + pad + offset;
        x = floorCx + along * floorW * 0.45;
      } else {
        z = floorCz - halfD - pad - offset;
        x = floorCx + along * floorW * 0.45;
      }

      if (!pointOutsideDeck(x, z, floorCx, floorCz, halfW, halfD, pad * 0.5)) continue;

      const seed = 12000 + i * 31;
      out.push({
        seed,
        position: [x, grassY, z],
        rotationY: rnd(seed + 71) * Math.PI * 2,
        scale: 0.42 + rnd(seed + 23) * 0.32,
      });
    }
    return out;
  }, [floorCx, floorCz, floorW, floorD, halfW, halfD, grassY]);

  const grassClumps = useMemo<GrassClumpPlacement[]>(() => {
    const out: GrassClumpPlacement[] = [];
    // Reduced from 150 to 30 — the dense camera-following blade disk now does
    // the heavy lifting for ground cover; keep a few GLB tufts near the deck
    // for silhouette interest.
    const count = 30;
    const pad = 0.18;

    for (let i = 0; i < count; i++) {
      const side = Math.floor(rnd(i * 911) * 4);
      const along = (rnd(i * 521) - 0.5) * 1.12;
      const offset = 0.38 + rnd(i * 733) * 2.6;
      let x = floorCx;
      let z = floorCz;

      if (side === 0) {
        x = floorCx + halfW + pad + offset;
        z = floorCz + along * floorD * 0.54;
      } else if (side === 1) {
        x = floorCx - halfW - pad - offset;
        z = floorCz + along * floorD * 0.54;
      } else if (side === 2) {
        z = floorCz + halfD + pad + offset;
        x = floorCx + along * floorW * 0.54;
      } else {
        z = floorCz - halfD - pad - offset;
        x = floorCx + along * floorW * 0.54;
      }

      if (!pointOutsideDeck(x, z, floorCx, floorCz, halfW, halfD, pad)) continue;

      const seed = 16000 + i * 19;
      out.push({
        seed,
        position: [x, grassY, z],
        rotationY: rnd(i * 409) * Math.PI * 2,
        scale: 0.22 + rnd(seed + 31) * 0.22,
      });
    }

    return out;
  }, [floorCx, floorCz, floorW, floorD, halfW, halfD, grassY]);

  const wildflowers = useMemo(() => {
    const out: { key: number; position: [number, number, number]; color: string }[] = [];
    for (let i = 0; i < 120; i++) {
      const angle = rnd(i * 911) * Math.PI * 2;
      const r = deckHalfDiagonal + 0.85 + rnd(i * 613) * (halfW + halfD + 5);
      const x = floorCx + Math.cos(angle) * r;
      const z = floorCz + Math.sin(angle) * r;
      if (!pointOutsideDeck(x, z, floorCx, floorCz, halfW, halfD, 0.2)) continue;
      const palette = ["#f5e6a8", "#ffd4e5", "#e8d4ff", "#fff8f0", "#c8e6ff"];
      const color = palette[Math.floor(rnd(i * 719) * palette.length)];
      out.push({
        key: i,
        position: [x, grassY + 0.018, z],
        color,
      });
    }
    return out;
  }, [deckHalfDiagonal, floorCx, floorCz, halfW, halfD, grassY]);

  return (
    <group>
      <fog attach="fog" args={["#cfe8d4", fogNear, fogFar]} />
      <Sky
        distance={480000}
        sunPosition={sunPos}
        mieCoefficient={0.0036}
        mieDirectionalG={0.74}
        rayleigh={1.05}
        turbidity={2.4}
      />

      {/* Sky is a saturated blue, ground bounce is lush green — pulls every
          surface toward "summer meadow" instead of "warm desert". */}
      <hemisphereLight args={["#aedcff", "#5fa867", 0.78]} />
      <ambientLight intensity={0.36} color="#e8f6ec" />

      <directionalLight
        ref={dirRef}
        position={[sunPos.x, sunPos.y, sunPos.z]}
        intensity={1.32}
        color="#fefbf2"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.00006}
        shadow-normalBias={0.02}
      />

      {/* Meadow ground */}
      <mesh
        ref={grassMeshRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, grassY, 0]}
        receiveShadow
        material={lawnMaterial}
      >
        <planeGeometry args={[grassSpan, grassSpan, 64, 64]} />
      </mesh>

      {/* Dense camera-following blade ground cover (procedural, instanced). */}
      {bladeDensity > 0 && (
        <OutdoorGrassBlades
          groundY={grassY + 0.001}
          innerRadius={8}
          outerRadius={18}
          tint="#7ec85a"
          densityScale={bladeDensity}
        />
      )}

      {/* Soft flower dots (billboards would be nicer; tiny meshes read OK at planner distance) */}
      <group>
        {wildflowers.map((fl) => (
          <mesh key={fl.key} position={fl.position} rotation={[-Math.PI / 2, 0, rnd(fl.key * 13) * 0.5]}>
            <circleGeometry args={[0.035 + rnd(fl.key * 7) * 0.022, 6]} />
            <meshBasicMaterial color={fl.color} transparent opacity={0.92} depthWrite={false} />
          </mesh>
        ))}
      </group>

      {/* Grass tufts: instanced GLB tufts where templates are loaded; otherwise no tufts. */}
      {(() => {
        const tuftTemplates = vegetationGlbs.grassTufts.filter((t): t is THREE.Group => !!t);
        if (tuftTemplates.length === 0) return null;
        const buckets = bucketPlacementsByVariant(grassClumps, tuftTemplates.length);
        return tuftTemplates.map((tpl, vi) => (
          <InstancedVegetationVariant
            key={`gtuft-${vi}`}
            template={tpl}
            placements={buckets[vi] ?? []}
            castShadow={false}
          />
        ));
      })()}

      {/* Bushes: instanced when GLB templates are loaded, fallback to procedural BushCluster otherwise. */}
      {(() => {
        const bushTemplates = vegetationGlbs.bushes.filter((t): t is THREE.Group => !!t);
        if (bushTemplates.length === 0) {
          return bushes.map((b, idx) => (
            <OutdoorBushInstance
              key={`bush-${idx}`}
              seed={b.seed}
              position={b.position}
              templates={vegetationGlbs.bushes}
              foliageMap={foliageTextureBroadleaf}
              Fallback={BushCluster}
            />
          ));
        }
        const buckets = bucketPlacementsByVariant(bushes, bushTemplates.length);
        return bushTemplates.map((tpl, vi) => (
          <InstancedVegetationVariant
            key={`bush-${vi}`}
            template={tpl}
            placements={buckets[vi] ?? []}
          />
        ));
      })()}

      {/* Trees: split by conifer / broadleaf, instance per variant. */}
      {(() => {
        const broadleafTemplates = vegetationGlbs.broadleafTrees.filter(
          (t): t is THREE.Group => !!t
        );
        const coniferTemplates = vegetationGlbs.coniferTrees.filter(
          (t): t is THREE.Group => !!t
        );
        const broadleafPlacements = trees.filter((t) => !t.isConifer);
        const coniferPlacements = trees.filter((t) => t.isConifer);

        const out: React.ReactNode[] = [];
        if (broadleafTemplates.length > 0) {
          const buckets = bucketPlacementsByVariant(broadleafPlacements, broadleafTemplates.length);
          broadleafTemplates.forEach((tpl, vi) => {
            out.push(
              <InstancedVegetationVariant
                key={`tree-bl-${vi}`}
                template={tpl}
                placements={buckets[vi] ?? []}
              />
            );
          });
        } else {
          broadleafPlacements.forEach((t, idx) => {
            out.push(
              <OutdoorTreeInstance
                key={`tree-bl-fallback-${idx}`}
                seed={t.seed}
                position={t.position}
                rotationY={t.rotationY}
                barkMap={barkTexture}
                foliageMapBroadleaf={foliageTextureBroadleaf}
                foliageMapPine={foliageTexturePine}
                broadleafTemplates={vegetationGlbs.broadleafTrees}
                coniferTemplates={vegetationGlbs.coniferTrees}
                Fallback={NaturalTree}
              />
            );
          });
        }
        if (coniferTemplates.length > 0) {
          const buckets = bucketPlacementsByVariant(coniferPlacements, coniferTemplates.length);
          coniferTemplates.forEach((tpl, vi) => {
            out.push(
              <InstancedVegetationVariant
                key={`tree-co-${vi}`}
                template={tpl}
                placements={buckets[vi] ?? []}
              />
            );
          });
        } else {
          coniferPlacements.forEach((t, idx) => {
            out.push(
              <OutdoorTreeInstance
                key={`tree-co-fallback-${idx}`}
                seed={t.seed}
                position={t.position}
                rotationY={t.rotationY}
                barkMap={barkTexture}
                foliageMapBroadleaf={foliageTextureBroadleaf}
                foliageMapPine={foliageTexturePine}
                broadleafTemplates={vegetationGlbs.broadleafTrees}
                coniferTemplates={vegetationGlbs.coniferTrees}
                Fallback={NaturalTree}
              />
            );
          });
        }
        return out;
      })()}

      {/* Deck: neutral slab under walls + finish plane on inner footprint only */}
      <mesh
        ref={deckMeshRef}
        geometry={deckFloorGeometry}
        position={[floorCx, -T / 2, floorCz]}
        receiveShadow
        castShadow
        name="deck-slab"
        material={deckSlabMaterials}
      />
      <mesh
        ref={deckFinishMeshRef}
        position={[floorCx, deckFinishY, floorCz]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        castShadow
        name="floor"
        material={floorMaterial}
        renderOrder={1}
      >
        <planeGeometry args={[w, d]} />
      </mesh>

      {/* Placement helpers: fence + exterior shell (invisible hits) */}
      <group name="outdoor-placement-shell">
        <mesh
          position={[floorCx, 0.55, floorCz - halfD - 0.06]}
          material={fenceHitMaterial}
          userData={{
            surfaceType: "fence",
            zone: "outdoor",
            surfaceTopY: 0.25,
          }}
        >
          <boxGeometry args={[floorW, 1.1, 0.06]} />
        </mesh>
        <mesh
          position={[floorCx, 0.55, floorCz + halfD + 0.06]}
          material={fenceHitMaterial}
          userData={{
            surfaceType: "fence",
            zone: "outdoor",
            surfaceTopY: 0.25,
          }}
        >
          <boxGeometry args={[floorW, 1.1, 0.06]} />
        </mesh>
        <mesh
          position={[floorCx - halfW - 0.06, 0.55, floorCz]}
          material={fenceHitMaterial}
          userData={{
            surfaceType: "fence",
            zone: "outdoor",
            surfaceTopY: 0.25,
          }}
        >
          <boxGeometry args={[0.06, 1.1, floorD]} />
        </mesh>
        <mesh
          position={[floorCx + halfW + 0.06, 0.55, floorCz]}
          material={fenceHitMaterial}
          userData={{
            surfaceType: "fence",
            zone: "outdoor",
            surfaceTopY: 0.25,
          }}
        >
          <boxGeometry args={[0.06, 1.1, floorD]} />
        </mesh>
        {/* Exterior-facing wall hits (beyond deck) */}
        {(
          [
            [floorCx, 1.25, floorCz - halfD - 0.35, 0, 1, floorW, 2.5, 0.1],
            [floorCx, 1.25, floorCz + halfD + 0.35, 0, -1, floorW, 2.5, 0.1],
            [floorCx - halfW - 0.35, 1.25, floorCz, 1, 0, 0.1, 2.5, floorD],
            [floorCx + halfW + 0.35, 1.25, floorCz, -1, 0, 0.1, 2.5, floorD],
          ] as const
        ).map(([x, y, z, nnx, nnz, gw, gh, gd], i) => (
          <mesh
            key={`ext-${i}`}
            position={[x, y, z]}
            material={fenceHitMaterial}
            userData={{
              surfaceType: "wall",
              zone: "exterior",
              wallNormalArr: [nnx, 0, nnz],
            }}
          >
            <boxGeometry args={[gw, gh, gd]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
