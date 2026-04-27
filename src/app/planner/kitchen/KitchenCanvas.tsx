"use client";

import { useRef, useEffect, useMemo, useCallback, useState } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import * as THREE from "three";
import {
  Eye,
  EyeOff,
  RotateCw,
  Maximize2,
  AlignLeft,
  Layers,
} from "lucide-react";
import { useKitchenStore } from "./store";
import { useKitchenSheetLayout } from "../sheet/useKitchenSheetLayout";
import SheetViewerModal from "../sheet/SheetViewerModal";
import type { FloorOutlinePoint } from "../types";
import { FLOOR_STYLE_TINTS } from "../types";
import {
  bboxSizeFromOutline,
  outlineBoundingBox,
} from "../utils/kitchenFloorTemplates";
import { ROOM_WALL_THICKNESS_M as WALL_T } from "../constants/roomGeometry";
import { edgeFrame } from "../utils/polygonWallCsg";
import KitchenCabinets3D from "./KitchenCabinets3D";
import KitchenCabinetDragController from "./KitchenCabinetDragController";
import type { ViewMode } from "./types";
import { BASE_DEPTH, TOTAL_BASE_HEIGHT, getMaxBaseDepthCm } from "./data";

const CM = 0.01;
/** Minimum room depth (m) when footprint is very small. */
const MIN_ROOM_DEPTH_M = 2.5;
const EMPTY_EDGE_INDICES: number[] = [];

// Wood texture pre-loading
let _woodBaseImg: HTMLImageElement | null = null;
let _woodNormalImg: HTMLImageElement | null = null;
let _woodRoughImg: HTMLImageElement | null = null;
if (typeof window !== "undefined") {
  _woodBaseImg = new Image();
  _woodBaseImg.crossOrigin = "anonymous";
  _woodBaseImg.src = "/textures/wood/color.jpg";
  _woodNormalImg = new Image();
  _woodNormalImg.crossOrigin = "anonymous";
  _woodNormalImg.src = "/textures/wood/normal.jpg";
  _woodRoughImg = new Image();
  _woodRoughImg.crossOrigin = "anonymous";
  _woodRoughImg.src = "/textures/wood/roughness.jpg";
}

function texFromImage(
  img: HTMLImageElement | null,
  fallback: string,
  loader: THREE.TextureLoader,
  cb?: () => void,
): THREE.Texture {
  if (img?.complete && img.naturalWidth > 0) {
    const t = new THREE.Texture(img);
    t.needsUpdate = true;
    return t;
  }
  return loader.load(fallback, cb);
}

function clamp255(v: number) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

type KitchenWallName = "back" | "left";
type QuadrantWall = "front" | "back" | "left" | "right";

/** Same sector logic as wardrobe planner, but room is the x,z ≥ 0 quadrant; origin centered at (RW/2, RD/2). */
function getKitchenWallsToHideFromCamera(
  camera: THREE.Camera,
  RW: number,
  RD: number,
): KitchenWallName[] {
  const cx = camera.position.x;
  const cz = camera.position.z;
  const ux = cx - RW / 2;
  const uz = cz - RD / 2;
  const hw = RW / 2;
  const hd = RD / 2;
  const walls: KitchenWallName[] = [];

  if (uz < -hd) walls.push("back");
  if (ux < -hw) walls.push("left");

  const isInside = ux >= -hw && ux <= hw && uz >= -hd && uz <= hd;
  if (isInside) {
    const angle = Math.atan2(ux, uz);
    const t = Math.PI / 8;
    const sector: QuadrantWall[] =
      angle >= -t && angle < t ? ["front"]
      : angle >= t && angle < 3 * t ? ["front", "right"]
      : angle >= 3 * t && angle < 5 * t ? ["right"]
      : angle >= 5 * t && angle < 7 * t ? ["right", "back"]
      : angle >= 7 * t || angle < -7 * t ? ["back"]
      : angle >= -7 * t && angle < -5 * t ? ["back", "left"]
      : angle >= -5 * t && angle < -3 * t ? ["left"]
      : ["left", "front"];
    for (const w of sector) {
      if ((w === "back" || w === "left") && !walls.includes(w)) walls.push(w);
    }
  }
  return walls;
}

function kitchenWallSetsEqual(a: KitchenWallName[], b: KitchenWallName[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort().join();
  const sb = [...b].sort().join();
  return sa === sb;
}

/** Wizard footprints are bbox-centered; cabinet scene uses the +X,+Z quadrant from the origin. */
function outlineToKitchenQuadrant(outline: FloorOutlinePoint[]): FloorOutlinePoint[] {
  const bb = outlineBoundingBox(outline);
  return outline.map((p) => ({ x: p.x - bb.minX, z: p.z - bb.minZ }));
}

function createOutlineShapeXZ(outline: FloorOutlinePoint[]): THREE.Shape {
  const shape = new THREE.Shape();
  const p0 = outline[0]!;
  shape.moveTo(p0.x, p0.z);
  for (let i = 1; i < outline.length; i++) {
    const p = outline[i]!;
    shape.lineTo(p.x, p.z);
  }
  shape.closePath();
  return shape;
}

/** CCW footprint: positive cross ⇒ convex vertex (outer corner); negative ⇒ reflex (inner notch). */
function isConvexVertexCCW(
  prev: FloorOutlinePoint,
  cur: FloorOutlinePoint,
  next: FloorOutlinePoint,
): boolean {
  const ax = cur.x - prev.x;
  const az = cur.z - prev.z;
  const bx = next.x - cur.x;
  const bz = next.z - cur.z;
  return ax * bz - az * bx > 1e-8;
}

function polygonWallHiddenDigest(
  outlineQ: FloorOutlinePoint[],
  openEdgeIndices: number[],
  camera: THREE.Camera,
): string {
  const open = new Set(openEdgeIndices);
  const n = outlineQ.length;
  const hidden: number[] = [];
  for (let i = 0; i < n; i++) {
    if (open.has(i)) continue;
    const A = outlineQ[i]!;
    const B = outlineQ[(i + 1) % n]!;
    const { ox, oz, L } = edgeFrame(A.x, A.z, B.x, B.z);
    if (L < 1e-6) continue;
    const mx = (A.x + B.x) / 2;
    const mz = (A.z + B.z) / 2;
    const vx = camera.position.x - mx;
    const vz = camera.position.z - mz;
    if (vx * ox + vz * oz > 0.08) hidden.push(i);
  }
  hidden.sort((a, b) => a - b);
  return hidden.join(",");
}

// ── Kitchen room: floor + back wall + side wall (cabinets sit z = 0 … base depth) ──

function KitchenRoom({ totalWidthCm, leftWallDepthCm = 0 }: { totalWidthCm: number; leftWallDepthCm?: number }) {
  const wallColor = useKitchenStore((s) => s.room.wallColor);
  const floorStyle = useKitchenStore((s) => s.room.floorStyle);
  const footprintWidthM = useKitchenStore((s) => s.room.footprintWidthM);
  const footprintDepthM = useKitchenStore((s) => s.room.footprintDepthM);
  const floorOutline = useKitchenStore((s) => s.room.floorOutline);
  const floorOpenEdgeIndices = useKitchenStore((s) => s.room.floorOpenEdgeIndices) ?? EMPTY_EDGE_INDICES;
  const { camera, invalidate } = useThree();

  const { fpW, fpD } = useMemo(() => {
    if (floorOutline && floorOutline.length >= 3) {
      const bb = bboxSizeFromOutline(floorOutline);
      return { fpW: bb.width, fpD: bb.depth };
    }
    return { fpW: footprintWidthM, fpD: footprintDepthM };
  }, [floorOutline, footprintWidthM, footprintDepthM]);

  // Width must fit the cabinet run (plus margin), never shrink below chosen footprint or product minimum.
  const RW = Math.max(totalWidthCm * CM + 1.6, fpW, 3.5);
  const leftWallRunM = leftWallDepthCm * CM + 0.8;
  const RD = Math.max(fpD, MIN_ROOM_DEPTH_M, leftWallRunM);
  const RH = 3.0;
  const T = WALL_T;
  const floorW = RW + 2 * T;
  const floorD = RD + 2 * T;
  const floorCx = RW / 2;
  const floorCz = RD / 2;

  const outlineQ = useMemo(() => {
    if (!floorOutline || floorOutline.length < 3) return null;
    return outlineToKitchenQuadrant(floorOutline);
  }, [floorOutline]);

  const openEdgeKey = floorOpenEdgeIndices.join(",");

  const polyExtrude = useMemo(() => {
    if (!outlineQ) {
      return { floor: null as THREE.ExtrudeGeometry | null, ceiling: null as THREE.ExtrudeGeometry | null };
    }
    const shape = createOutlineShapeXZ(outlineQ);
    /**
     * Shape lives in XY; extrusion is +Z. rotateX(+π/2) maps outline (x,y)=(world x,z) so horizontal
     * positions become (x, 0, z) — matching wall boxes. rotateX(-π/2) would mirror world Z (floor vs walls).
     */
    const floorGeom = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false });
    floorGeom.rotateX(Math.PI / 2);
    const ceilingGeom = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false });
    ceilingGeom.rotateX(Math.PI / 2);
    ceilingGeom.translate(0, RH + 0.08, 0);
    return { floor: floorGeom, ceiling: ceilingGeom };
  }, [outlineQ, T, RH]);

  useEffect(() => {
    return () => {
      polyExtrude.floor?.dispose();
      polyExtrude.ceiling?.dispose();
    };
  }, [polyExtrude.floor, polyExtrude.ceiling]);

  /** Same placement + Y rotation as `createPolygonWallSegmentWithHoles` (polygon room planner). */
  const wallEdgeMetas = useMemo(() => {
    if (!outlineQ) return [];
    const open = new Set(floorOpenEdgeIndices);
    const n = outlineQ.length;
    const out: {
      edgeIndex: number;
      len: number;
      cx: number;
      cz: number;
      rotY: number;
    }[] = [];
    for (let i = 0; i < n; i++) {
      if (open.has(i)) continue;
      const A = outlineQ[i]!;
      const B = outlineQ[(i + 1) % n]!;
      const { tx, tz, L, ox, oz } = edgeFrame(A.x, A.z, B.x, B.z);
      if (L < 1e-6) continue;
      const Mx = (A.x + B.x) / 2;
      const Mz = (A.z + B.z) / 2;
      const cx = Mx + ox * (T / 2);
      const cz = Mz + oz * (T / 2);
      const rotY = Math.atan2(-tz, tx);
      out.push({
        edgeIndex: i,
        len: L,
        cx,
        cz,
        rotY,
      });
    }
    return out;
  }, [outlineQ, openEdgeKey, T]);

  /** Vertical posts at convex corners where two solid edges meet — offset outward so inner face is flush with walls. */
  const wallCornerPosts = useMemo(() => {
    if (!outlineQ) return [];
    const open = new Set(floorOpenEdgeIndices);
    const n = outlineQ.length;
    const posts: { i: number; x: number; z: number }[] = [];
    for (let i = 0; i < n; i++) {
      const eIn = (i - 1 + n) % n;
      const eOut = i;
      if (open.has(eIn) || open.has(eOut)) continue;
      const prev = outlineQ[eIn]!;
      const cur = outlineQ[i]!;
      const next = outlineQ[(i + 1) % n]!;
      if (!isConvexVertexCCW(prev, cur, next)) continue;
      const fIn = edgeFrame(prev.x, prev.z, cur.x, cur.z);
      const fOut = edgeFrame(cur.x, cur.z, next.x, next.z);
      posts.push({
        i,
        x: cur.x + (fIn.ox + fOut.ox) * (T / 2),
        z: cur.z + (fIn.oz + fOut.oz) * (T / 2),
      });
    }
    return posts;
  }, [outlineQ, openEdgeKey, floorOpenEdgeIndices, T]);

  const [wallsToHide, setWallsToHide] = useState<KitchenWallName[]>([]);
  const [polyHiddenDigest, setPolyHiddenDigest] = useState("");
  const [hideCeiling, setHideCeiling] = useState(false);
  const frameCount = useRef(0);

  useFrame(() => {
    frameCount.current += 1;
    if (frameCount.current % 6 !== 0) return;
    const nextHideCeiling = camera.position.y > RH + T;
    setHideCeiling((prev) => (prev !== nextHideCeiling ? nextHideCeiling : prev));
    if (outlineQ) {
      const nextDig = polygonWallHiddenDigest(outlineQ, floorOpenEdgeIndices, camera);
      setPolyHiddenDigest((prev) => (prev !== nextDig ? nextDig : prev));
    } else {
      const nextWalls = getKitchenWallsToHideFromCamera(camera, RW, RD);
      setWallsToHide((prev) => {
        if (!kitchenWallSetsEqual(prev, nextWalls)) return nextWalls;
        return prev;
      });
    }
  });

  const hideBack = wallsToHide.includes("back");
  const hideLeft = wallsToHide.includes("left");

  const hiddenPolyEdgeSet = useMemo(() => {
    const s = new Set<number>();
    if (!polyHiddenDigest) return s;
    for (const p of polyHiddenDigest.split(",")) {
      const n = Number(p);
      if (!Number.isNaN(n)) s.add(n);
    }
    return s;
  }, [polyHiddenDigest]);

  const wallMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: wallColor,
        emissive: wallColor,
        emissiveIntensity: 0.25,
        roughness: 0.88,
        metalness: 0,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => {
    wallMat.color.set(wallColor);
    wallMat.emissive.set(wallColor);
  }, [wallColor, wallMat]);

  const floorMat = useMemo(() => {
    /** ~2.5 plank repeats across shorter side — reads closer to real laminate scale. */
    const repX = Math.max(1.45, floorW * 0.4);
    const repY = Math.max(1.45, floorD * 0.4);

    const loader = new THREE.TextureLoader();
    const onLoad = () => invalidate();
    const normal = texFromImage(_woodNormalImg, "/textures/wood/normal.jpg", loader, onLoad);
    const rough = texFromImage(_woodRoughImg, "/textures/wood/roughness.jpg", loader, onLoad);
    [normal, rough].forEach((t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repX, repY);
    });

    const { hue, lift, tint } =
      FLOOR_STYLE_TINTS[floorStyle] ?? { hue: "#c8a070", lift: 0, tint: "#ffffff" };
    let map: THREE.Texture;
    if (_woodBaseImg?.complete && _woodBaseImg.naturalWidth > 0) {
      const canvas = document.createElement("canvas");
      canvas.width = _woodBaseImg.width;
      canvas.height = _woodBaseImg.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(_woodBaseImg, 0, 0);
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = 0.34;
      ctx.fillStyle = hue;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      const liftSoft = lift * 0.5;
      if (liftSoft > 0) {
        ctx.fillStyle = `rgba(255,255,255,${liftSoft})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else if (liftSoft < 0) {
        ctx.fillStyle = `rgba(0,0,0,${-liftSoft})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      map = new THREE.CanvasTexture(canvas);
    } else {
      map = loader.load("/textures/wood/color.jpg", onLoad);
    }
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(repX, repY);
    map.colorSpace = THREE.SRGBColorSpace;
    const baseTint = new THREE.Color(tint);
    baseTint.lerp(new THREE.Color("#f6f4f0"), 0.38);
    return new THREE.MeshStandardMaterial({
      map,
      normalMap: normal,
      roughnessMap: rough,
      color: baseTint,
      side: THREE.DoubleSide,
      roughness: 0.78,
      metalness: 0.03,
      envMapIntensity: 0.55,
    });
  }, [floorStyle, floorW, floorD, invalidate]);

  const edgeMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#f4f2ef", roughness: 0.9, metalness: 0 }),
    [],
  );

  const floorMaterials = useMemo(
    () => [edgeMaterial, edgeMaterial, floorMat, edgeMaterial, edgeMaterial, edgeMaterial],
    [floorMat, edgeMaterial],
  );

  const ceilingColor = useMemo(() => {
    const [r, g, b] = hexToRgb(wallColor);
    const f = 0.5;
    return `rgb(${clamp255(r + (255 - r) * f)},${clamp255(g + (255 - g) * f)},${clamp255(b + (255 - b) * f)})`;
  }, [wallColor]);

  const ceilingMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: ceilingColor,
        emissive: ceilingColor,
        emissiveIntensity: 0.35,
        roughness: 0.95,
        metalness: 0,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => {
    ceilingMat.color.set(ceilingColor);
    ceilingMat.emissive.set(ceilingColor);
    invalidate();
  }, [ceilingColor, ceilingMat, invalidate]);

  const ceilingMaterials = useMemo(
    () => [edgeMaterial, edgeMaterial, edgeMaterial, ceilingMat, edgeMaterial, edgeMaterial],
    [ceilingMat, edgeMaterial],
  );

  const baseboardMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#f0eeec", roughness: 0.6, metalness: 0 }),
    [],
  );

  const aoT = 0.015;
  const aoY = 0.02;
  const aoRunW = Math.max(0.05, RW - 2 * aoT);
  const aoRunD = Math.max(0.05, RD - 2 * aoT);
  const floorJunctionAoMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#000000",
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
      }),
    [],
  );

  const invisibleShadowMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        colorWrite: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  );

  const polyWallH = RH + T;
  const polyWallCY = (RH - T) / 2;

  if (outlineQ && polyExtrude.floor && polyExtrude.ceiling) {
    return (
      <group>
        <mesh geometry={polyExtrude.floor} material={floorMat} receiveShadow />
        {wallEdgeMetas.map((w) => {
          const hideWall = hiddenPolyEdgeSet.has(w.edgeIndex);
          return (
            <mesh
              key={w.edgeIndex}
              position={[w.cx, polyWallCY, w.cz]}
              rotation={[0, w.rotY, 0]}
              material={hideWall ? invisibleShadowMat : wallMat}
              castShadow
              receiveShadow={!hideWall}
            >
              <boxGeometry args={[w.len, polyWallH, T]} />
            </mesh>
          );
        })}
        {wallCornerPosts.map((p) => {
          const nV = outlineQ.length;
          const eIn = (p.i - 1 + nV) % nV;
          const eOut = p.i;
          if (hiddenPolyEdgeSet.has(eIn) && hiddenPolyEdgeSet.has(eOut)) {
            return null;
          }
          return (
            <mesh
              key={`corner-${p.i}`}
              position={[p.x, polyWallCY, p.z]}
              material={wallMat}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[T, polyWallH, T]} />
            </mesh>
          );
        })}
        {!hideCeiling ? (
          <mesh geometry={polyExtrude.ceiling} material={ceilingMat} castShadow receiveShadow />
        ) : (
          <mesh geometry={polyExtrude.ceiling} material={invisibleShadowMat} castShadow />
        )}
      </group>
    );
  }

  return (
    <group>
      {/* Floor slab — same thickness / edge treatment as room & wardrobe planners (top y = 0) */}
      <mesh position={[floorCx, -T / 2, floorCz]} material={floorMaterials} receiveShadow>
        <boxGeometry args={[floorW, T, floorD]} />
      </mesh>

      {/* AO strips at back / left (open on right & front) */}
      {!hideBack && (
        <mesh position={[RW / 2, 0.01, -aoT / 2]} renderOrder={1} material={floorJunctionAoMaterial}>
          <boxGeometry args={[aoRunW, aoY, aoT]} />
        </mesh>
      )}
      {!hideLeft && (
        <mesh position={[-aoT / 2, 0.01, RD / 2]} renderOrder={1} material={floorJunctionAoMaterial}>
          <boxGeometry args={[aoT, aoY, aoRunD]} />
        </mesh>
      )}

      {/* Back wall — extends left to overlap with left wall at corner, down through floor, stops at ceiling bottom */}
      <mesh
        position={[(RW - T) / 2, (RH - T) / 2, -T / 2]}
        material={hideBack ? invisibleShadowMat : wallMat}
        castShadow
        receiveShadow={!hideBack}
      >
        <boxGeometry args={[RW + T, RH + T, T]} />
      </mesh>

      {/* Left wall — extends back to overlap with back wall at corner, down through floor, stops at ceiling bottom */}
      <mesh
        position={[-T / 2, (RH - T) / 2, (RD - T) / 2]}
        material={hideLeft ? invisibleShadowMat : wallMat}
        castShadow
        receiveShadow={!hideLeft}
      >
        <boxGeometry args={[T, RH + T, RD + T]} />
      </mesh>

      {/* Ceiling slab */}
      {!hideCeiling ? (
        <mesh position={[floorCx, RH + T / 2, floorCz]} material={ceilingMaterials} castShadow receiveShadow>
          <boxGeometry args={[floorW, T, floorD]} />
        </mesh>
      ) : (
        <mesh position={[floorCx, RH + T / 2, floorCz]} material={invisibleShadowMat} castShadow>
          <boxGeometry args={[floorW, T, floorD]} />
        </mesh>
      )}

      {/* Baseboards (inner face placement — matches WardrobeCanvas) */}
      {!hideBack && (
        <mesh position={[RW / 2, 0.04, 0.006]} material={baseboardMat}>
          <boxGeometry args={[RW, 0.08, 0.012]} />
        </mesh>
      )}
      {!hideLeft && (
        <mesh position={[0.006, 0.04, RD / 2]} material={baseboardMat}>
          <boxGeometry args={[0.012, 0.08, RD]} />
        </mesh>
      )}
    </group>
  );
}

// ── Camera ───────────────────────────────────────────────────────────

interface CameraRigProps {
  targetX: number;
  targetZ: number;
  viewMode: ViewMode;
}

function CameraRig({ targetX, targetZ, viewMode }: CameraRigProps) {
  const { camera } = useThree();
  const eyeY = TOTAL_BASE_HEIGHT * CM * 0.55 + 0.85;

  useEffect(() => {
    const lookY = TOTAL_BASE_HEIGHT * CM * 0.45 + 0.15;
    if (viewMode === "front") {
      camera.position.set(targetX, lookY + 0.15, targetZ + 3.8);
    } else {
      camera.position.set(targetX + 1.1, eyeY, targetZ + 3.5);
    }
    camera.lookAt(targetX, lookY, targetZ);
  }, [camera, targetX, targetZ, viewMode]);

  return null;
}

// ── Main canvas ──────────────────────────────────────────────────────

export default function KitchenCanvas() {
  const config = useKitchenStore((s) => s.config);
  const ui = useKitchenStore((s) => s.ui);
  const toggleDimensions = useKitchenStore((s) => s.toggleDimensions);
  const setViewMode = useKitchenStore((s) => s.setViewMode);
  const setOrbitControlsEnabled = useKitchenStore((s) => s.setOrbitControlsEnabled);

  useEffect(() => {
    const restoreOrbit = () => setOrbitControlsEnabled(true);
    window.addEventListener("pointerup", restoreOrbit);
    window.addEventListener("pointercancel", restoreOrbit);
    window.addEventListener("blur", restoreOrbit);
    return () => {
      window.removeEventListener("pointerup", restoreOrbit);
      window.removeEventListener("pointercancel", restoreOrbit);
      window.removeEventListener("blur", restoreOrbit);
    };
  }, [setOrbitControlsEnabled]);

  const totalBaseWidth = config.baseModules.reduce((sum, m) => sum + m.width, 0);
  const cornerBackW = config.cornerUnit.enabled ? config.cornerUnit.backWingWidthCm : 0;
  const cornerLeftW = config.cornerUnit.enabled ? config.cornerUnit.leftWingWidthCm : 0;
  const leftWallDepthCm = config.leftWall.enabled
    ? cornerLeftW + config.leftWall.baseModules.reduce((s, m) => s + m.width, 0)
    : cornerLeftW;
  /** World X (m) of center of main base run — matches KitchenCabinets3D island group anchor. */
  const mainCenterXM = ((totalBaseWidth + cornerBackW) * CM) / 2;
  const islandWidthCm = config.island.enabled
    ? config.island.baseModules.reduce((s, m) => s + m.width, 0)
    : 0;
  const spanCm = Math.max(
    totalBaseWidth + cornerBackW,
    islandWidthCm + Math.abs(config.island.offsetXCm),
  );
  const targetX = spanCm * CM / 2;
  const maxDepthCm = useMemo(
    () =>
      config.baseModules.length === 0
        ? BASE_DEPTH + config.countertop.overhang
        : getMaxBaseDepthCm(config.baseModules, config.countertop.overhang),
    [config.baseModules, config.countertop.overhang],
  );
  const islandZ = config.island.enabled ? config.island.offsetZCm * CM : 0;
  const targetZ = Math.max((maxDepthCm * CM) / 2, islandZ * 0.85);

  const orbitRef = useRef<React.ComponentRef<typeof OrbitControls>>(null);

  const resetCamera = useCallback(() => {
    if (!orbitRef.current) return;
    const lookY = TOTAL_BASE_HEIGHT * CM * 0.45 + 0.15;
    orbitRef.current.target.set(targetX, lookY, targetZ);
    orbitRef.current.reset();
  }, [targetX, targetZ]);

  const lookY = TOTAL_BASE_HEIGHT * CM * 0.45 + 0.15;
  const cameraProps =
    ui.viewMode === "front"
      ? { position: [targetX, lookY + 0.15, targetZ + 3.8] as [number, number, number], fov: 45 }
      : { position: [targetX + 1.1, TOTAL_BASE_HEIGHT * CM * 0.55 + 0.85, targetZ + 3.5] as [number, number, number], fov: 50 };

  return (
    <div className="kitchen-canvas-wrapper">
      <Canvas
        shadows
        camera={{ ...cameraProps, near: 0.05, far: 50 }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.1,
        }}
        onPointerMissed={() => {
          const st = useKitchenStore.getState();
          st.selectBaseModule(null);
          st.selectWallModule(null);
          st.selectIslandBaseModule(null);
          st.selectIslandWallModule(null);
          st.selectLeftBaseModule(null);
          st.selectLeftWallModule(null);
        }}
      >
        <CameraRig targetX={targetX} targetZ={targetZ} viewMode={ui.viewMode} />

        <ambientLight intensity={0.55} />
        <directionalLight
          position={[targetX + 2.2, 5, targetZ + 3.2]}
          intensity={1.75}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-near={0.1}
          shadow-camera-far={30}
          shadow-camera-left={-6}
          shadow-camera-right={6}
          shadow-camera-top={6}
          shadow-camera-bottom={-6}
        />
        <pointLight position={[targetX, 3.0, targetZ + 1.2]} intensity={0.4} color="#fff8f0" />
        <pointLight position={[targetX + 1.5, 0.9, targetZ + 0.6]} intensity={0.25} color="#fffaf5" />

        <Environment preset="apartment" />

        <KitchenRoom totalWidthCm={spanCm} leftWallDepthCm={leftWallDepthCm} />
        <KitchenCabinets3D />
        <KitchenCabinetDragController orbitRef={orbitRef} mainCenterXM={mainCenterXM} />

        <OrbitControls
          ref={orbitRef}
          enabled={ui.orbitControlsEnabled}
          target={[targetX, lookY, targetZ]}
          minDistance={1.2}
          maxDistance={14}
          maxPolarAngle={Math.PI / 2 - 0.05}
          enablePan
          panSpeed={0.6}
        />
      </Canvas>

      <div className="canvas-view-controls">
        <button
          type="button"
          className={`view-btn${ui.viewMode === "perspective" ? " active" : ""}`}
          onClick={() => setViewMode("perspective")}
          title="Perspective view"
        >
          <Maximize2 size={16} />
        </button>
        <button
          type="button"
          className={`view-btn${ui.viewMode === "front" ? " active" : ""}`}
          onClick={() => setViewMode("front")}
          title="Front view"
        >
          <AlignLeft size={16} />
        </button>
        <button type="button" className="view-btn" onClick={resetCamera} title="Reset camera">
          <RotateCw size={16} />
        </button>
        <button
          type="button"
          className="view-btn"
          onClick={toggleDimensions}
          title={ui.showDimensions ? "Hide dimensions" : "Show dimensions"}
        >
          {ui.showDimensions ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>
        <KitchenSheetViewerButton />
      </div>
    </div>
  );
}

function KitchenSheetViewerButton() {
  const [open, setOpen] = useState(false);
  const layout = useKitchenSheetLayout();
  return (
    <>
      <button
        type="button"
        className="view-btn"
        onClick={() => setOpen(true)}
        title="View sheet layout"
      >
        <Layers size={16} />
        {layout.totalOverflow > 0 && (
          <span
            className="ml-0.5 inline-block w-2 h-2 rounded-full bg-red-500"
            aria-label={`${layout.totalOverflow} pieces do not fit`}
          />
        )}
      </button>
      <SheetViewerModal
        open={open}
        onClose={() => setOpen(false)}
        layout={layout}
        title="Kitchen sheet layout"
      />
    </>
  );
}
