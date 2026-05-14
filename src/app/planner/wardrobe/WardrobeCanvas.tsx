"use client";

import { useRef, useEffect, useMemo, useState, type ComponentRef, type RefObject } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import * as THREE from "three";
import SectionDividerDrags from "./SectionDividerDrags";
import InteriorComponentDrags from "./InteriorComponentDrags";
import { Eye, EyeOff, RotateCw, Maximize2, ArrowRightLeft, Layers } from "lucide-react";
import { useWardrobeStore } from "./store";
import { useWardrobeSheetLayout } from "../sheet/useWardrobeSheetLayout";
import SheetViewerModal from "../sheet/SheetViewerModal";
import { sortPlacementsWardrobeFrontOrder } from "../sheet/wardrobeSheetPlacementSort";
import { wardrobePanelFrontOrderKey } from "../sheet/wardrobePanels";
import { buildPlannerFloorMaterialFromRoom, buildPlannerWallSurfaceMaterial, buildPlannerCeilingSurfaceMaterial } from "../roomFloorMaterial";
import WardrobeFrame3D from "./WardrobeFrame3D";
import WardrobeBase3D from "./WardrobeBase3D";
import WardrobeInterior3D from "./WardrobeInterior3D";
import WardrobeDoors3D from "./WardrobeDoors3D";
import { wardrobeBaseLiftCm, clampWardrobeBase, wardrobeConfigWithFrameWidth, wardrobeEmbedRowLayoutFromConfig } from "./data";
import SectionHighlights from "./SectionHighlights";
import DimensionAnnotations from "./DimensionAnnotations";
import type { ViewMode } from "./types";
import type { FloorOutlinePoint } from "../types";
import { ROOM_WALL_THICKNESS_M as WALL_T } from "../constants/roomGeometry";
import { edgeFrame } from "../utils/polygonWallCsg";
import {
  WARDROBE_LEG_GROUP_Z_BUMP_M,
  DEFAULT_PREVIEW_ROOM_HEIGHT_M,
  wardrobeBridgeLiftMeters,
  wardrobeCompositionWidthMeters,
  wardrobeLayoutInteractiveLegIndex,
  wardrobeLayoutGeometry,
  wardrobeLayoutLegItems,
  wardrobeRoomHalfExtents,
} from "./wardrobeSpaceLayout";
import { WardrobeLegLayoutProvider } from "./WardrobeLegLayoutContext";

const CM = 0.01;

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

/** CCW footprint: positive cross ⇒ convex vertex (outer corner). */
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

type WallName = "front" | "back" | "left" | "right";

function getWallsToHideFromCamera(
  camera: THREE.Camera,
  roomWidth: number,
  roomDepth: number,
): WallName[] {
  const cx = camera.position.x;
  const cz = camera.position.z;
  const hw = roomWidth / 2;
  const hd = roomDepth / 2;
  const walls: WallName[] = [];

  if (cz > hd) walls.push("front");
  if (cz < -hd) walls.push("back");
  if (cx < -hw) walls.push("left");
  if (cx > hw) walls.push("right");

  const isInside = cx >= -hw && cx <= hw && cz >= -hd && cz <= hd;
  if (isInside) {
    const angle = Math.atan2(cx, cz);
    const t = Math.PI / 8;
    const angleWalls: WallName[] =
      angle >= -t && angle < t ? ["front"]
      : angle >= t && angle < 3 * t ? ["front", "right"]
      : angle >= 3 * t && angle < 5 * t ? ["right"]
      : angle >= 5 * t && angle < 7 * t ? ["right", "back"]
      : angle >= 7 * t || angle < -7 * t ? ["back"]
      : angle >= -7 * t && angle < -5 * t ? ["back", "left"]
      : angle >= -5 * t && angle < -3 * t ? ["left"]
      : ["left", "front"];
    for (const w of angleWalls) if (!walls.includes(w)) walls.push(w);
  }
  return walls;
}

/* ── Room Environment (matches room planner) ─────────────────────── */

function Room() {
  const wallColor = useWardrobeStore((s) => s.room.wallColor);
  const roomSettings = useWardrobeStore((s) => s.room);
  const { hw, hd } = wardrobeRoomHalfExtents(roomSettings);
  const w = hw * 2;
  const d = hd * 2;
  const outline = roomSettings.floorOutline;
  const openEdgeIndices = roomSettings.floorOpenEdgeIndices ?? [];
  const usePoly = Boolean(outline && outline.length >= 3);
  const { camera, invalidate } = useThree();

  const h = roomSettings.roomHeightM ?? DEFAULT_PREVIEW_ROOM_HEIGHT_M;
  const T = WALL_T;

  const [viewState, setViewState] = useState<{ wallsToHide: WallName[]; hideCeiling: boolean }>(() => ({
    wallsToHide: ["front"],
    hideCeiling: true,
  }));
  const { wallsToHide, hideCeiling } = viewState;
  const [polyHiddenDigest, setPolyHiddenDigest] = useState("");

  const frameCount = useRef(0);
  useFrame(() => {
    frameCount.current += 1;
    if (frameCount.current % 6 !== 0) return;
    const cameraAboveCeiling = camera.position.y > h;
    const nextHideCeiling = cameraAboveCeiling;
    if (usePoly && outline) {
      const nextDig = polygonWallHiddenDigest(outline, openEdgeIndices, camera);
      setPolyHiddenDigest((prev) => (prev !== nextDig ? nextDig : prev));
      setViewState((prev) =>
        prev.hideCeiling === nextHideCeiling ? prev : { ...prev, hideCeiling: nextHideCeiling },
      );
    } else {
      const nextWalls = getWallsToHideFromCamera(camera, w, d);
      setViewState((prev) => {
        const wallsChanged =
          nextWalls.length !== prev.wallsToHide.length ||
          nextWalls.some((wall, i) => prev.wallsToHide[i] !== wall);
        if (!wallsChanged && prev.hideCeiling === nextHideCeiling) return prev;
        return { wallsToHide: nextWalls, hideCeiling: nextHideCeiling };
      });
    }
  });

  const hiddenPolyEdgeSet = useMemo(() => {
    const s = new Set<number>();
    if (!polyHiddenDigest) return s;
    for (const part of polyHiddenDigest.split(",")) {
      const n = parseInt(part, 10);
      if (!Number.isNaN(n)) s.add(n);
    }
    return s;
  }, [polyHiddenDigest]);

  const openEdgeKey = openEdgeIndices.join(",");

  const rectangularFloorGeometry = useMemo(
    () => new THREE.BoxGeometry(w + T * 2, T, d + T * 2),
    [w, d, T],
  );

  useEffect(() => () => rectangularFloorGeometry.dispose(), [rectangularFloorGeometry]);

  const polyExtrude = useMemo(() => {
    if (!usePoly || !outline) {
      return { floor: null as THREE.ExtrudeGeometry | null, ceiling: null as THREE.ExtrudeGeometry | null };
    }
    const shape = createOutlineShapeXZ(outline);
    const floorGeom = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false });
    floorGeom.rotateX(Math.PI / 2);
    const ceilingGeom = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false });
    ceilingGeom.rotateX(Math.PI / 2);
    ceilingGeom.translate(0, h + 0.08, 0);
    return { floor: floorGeom, ceiling: ceilingGeom };
  }, [usePoly, outline, T, h]);

  useEffect(() => {
    return () => {
      polyExtrude.floor?.dispose();
      polyExtrude.ceiling?.dispose();
    };
  }, [polyExtrude.floor, polyExtrude.ceiling]);

  const polyFloorSlabMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#f4f2ef", roughness: 0.9, metalness: 0 }),
    [],
  );
  useEffect(() => () => polyFloorSlabMaterial.dispose(), [polyFloorSlabMaterial]);

  const polyFloorFinishGeometry = useMemo(() => {
    if (!usePoly || !outline || outline.length < 3) return null;
    const shape = createOutlineShapeXZ(outline);
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(Math.PI / 2);
    return g;
  }, [usePoly, outline]);
  useEffect(() => {
    return () => polyFloorFinishGeometry?.dispose();
  }, [polyFloorFinishGeometry]);

  const wallEdgeMetas = useMemo(() => {
    if (!outline || !usePoly) return [];
    const open = new Set(openEdgeIndices);
    const n = outline.length;
    const out: { edgeIndex: number; len: number; cx: number; cz: number; rotY: number }[] = [];
    for (let i = 0; i < n; i++) {
      if (open.has(i)) continue;
      const A = outline[i]!;
      const B = outline[(i + 1) % n]!;
      const { tx, tz, L, ox, oz } = edgeFrame(A.x, A.z, B.x, B.z);
      if (L < 1e-6) continue;
      const Mx = (A.x + B.x) / 2;
      const Mz = (A.z + B.z) / 2;
      const cx = Mx + ox * (T / 2);
      const cz = Mz + oz * (T / 2);
      const rotY = Math.atan2(-tz, tx);
      out.push({ edgeIndex: i, len: L, cx, cz, rotY });
    }
    return out;
  }, [outline, usePoly, openEdgeKey, T]);

  const wallCornerPosts = useMemo(() => {
    if (!outline || !usePoly) return [];
    const open = new Set(openEdgeIndices);
    const n = outline.length;
    const posts: { i: number; x: number; z: number }[] = [];
    for (let i = 0; i < n; i++) {
      const eIn = (i - 1 + n) % n;
      const eOut = i;
      if (open.has(eIn) || open.has(eOut)) continue;
      const prev = outline[eIn]!;
      const cur = outline[i]!;
      const next = outline[(i + 1) % n]!;
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
  }, [outline, usePoly, openEdgeIndices, T]);

  const polyWallH = h + T;
  const polyWallCY = (h - T) / 2;

  const edgeMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#f4f2ef", roughness: 0.9, metalness: 0 }),
    [],
  );

  const bbox = useMemo(() => ({ widthM: w, depthM: d, heightM: h }), [w, d, h]);

  const polyWallMatByEdge = useMemo(() => {
    const map = new Map<number, THREE.MeshStandardMaterial>();
    if (!usePoly || !outline?.length) return map;
    for (const wm of wallEdgeMetas) {
      map.set(
        wm.edgeIndex,
        buildPlannerWallSurfaceMaterial(roomSettings, bbox, wm.len, polyWallH, {
          onTextureUpdate: invalidate,
        }),
      );
    }
    return map;
  }, [
    usePoly,
    outline,
    wallEdgeMetas,
    bbox.widthM,
    bbox.depthM,
    bbox.heightM,
    polyWallH,
    wallColor,
    roomSettings.wallMaterialMode,
    roomSettings.wallCustomTextureUrl,
    roomSettings.wallUvRepeatX,
    roomSettings.wallUvRepeatY,
    roomSettings.wallUvRotationDeg,
    roomSettings.wallTileWidthCm,
    roomSettings.wallTileHeightCm,
    w,
    d,
    h,
    invalidate,
  ]);

  const polyCornerWallMat = useMemo(
    () =>
      buildPlannerWallSurfaceMaterial(roomSettings, bbox, T, polyWallH, {
        onTextureUpdate: invalidate,
      }),
    [
      wallColor,
      roomSettings.wallMaterialMode,
      roomSettings.wallCustomTextureUrl,
      roomSettings.wallUvRepeatX,
      roomSettings.wallUvRepeatY,
      roomSettings.wallUvRotationDeg,
      roomSettings.wallTileWidthCm,
      roomSettings.wallTileHeightCm,
      T,
      polyWallH,
      bbox.widthM,
      bbox.depthM,
      bbox.heightM,
      w,
      d,
      h,
      invalidate,
    ],
  );

  useEffect(() => {
    return () => {
      polyWallMatByEdge.forEach((m) => m.dispose());
      polyCornerWallMat.dispose();
    };
  }, [polyWallMatByEdge, polyCornerWallMat]);

  const wallMatWide = useMemo(
    () =>
      buildPlannerWallSurfaceMaterial(roomSettings, bbox, w, h, {
        onTextureUpdate: invalidate,
      }),
    [
      wallColor,
      roomSettings.wallMaterialMode,
      roomSettings.wallCustomTextureUrl,
      roomSettings.wallUvRepeatX,
      roomSettings.wallUvRepeatY,
      roomSettings.wallUvRotationDeg,
      roomSettings.wallTileWidthCm,
      roomSettings.wallTileHeightCm,
      w,
      d,
      h,
      invalidate,
    ],
  );

  const wallMatDeep = useMemo(
    () =>
      buildPlannerWallSurfaceMaterial(roomSettings, bbox, d, h, {
        onTextureUpdate: invalidate,
      }),
    [
      wallColor,
      roomSettings.wallMaterialMode,
      roomSettings.wallCustomTextureUrl,
      roomSettings.wallUvRepeatX,
      roomSettings.wallUvRepeatY,
      roomSettings.wallUvRotationDeg,
      roomSettings.wallTileWidthCm,
      roomSettings.wallTileHeightCm,
      w,
      d,
      h,
      invalidate,
    ],
  );

  const wallMaterialsWide = useMemo(
    () => [edgeMaterial, edgeMaterial, edgeMaterial, edgeMaterial, wallMatWide, wallMatWide],
    [edgeMaterial, wallMatWide],
  );

  const wallMaterialsDeep = useMemo(
    () => [edgeMaterial, edgeMaterial, edgeMaterial, edgeMaterial, wallMatDeep, wallMatDeep],
    [edgeMaterial, wallMatDeep],
  );

  const plannerFloorMat = useMemo(() => {
    const m = buildPlannerFloorMaterialFromRoom(roomSettings, [2.25, 2.25], {
      floorWidthM: w,
      floorDepthM: d,
      onTextureUpdate: invalidate,
      toneMode: "color",
      roughness: 0.7,
      metalness: 0,
    });
    m.polygonOffset = true;
    m.polygonOffsetFactor = -1;
    m.polygonOffsetUnits = -1;
    return m;
  }, [
    roomSettings.floorStyle,
    roomSettings.floorMaterialMode,
    roomSettings.floorCustomTextureUrl,
    roomSettings.floorUvRepeatX,
    roomSettings.floorUvRepeatY,
    roomSettings.floorTextureWidthCm,
    roomSettings.floorTextureHeightCm,
    roomSettings.floorTextureStartSide,
    roomSettings.floorLayoutPattern,
    roomSettings.floorUvRotationDeg,
    roomSettings.floorTileWidthCm,
    roomSettings.floorTileHeightCm,
    roomSettings.floorTileGroutCm,
    roomSettings.floorTileGroutColor,
    w,
    d,
    invalidate,
  ]);

  const floorSlabMaterials = useMemo(
    () => [edgeMaterial, edgeMaterial, edgeMaterial, edgeMaterial, edgeMaterial, edgeMaterial],
    [edgeMaterial],
  );

  const ceilingMaterial = useMemo(
    () =>
      buildPlannerCeilingSurfaceMaterial(roomSettings, bbox, {
        onTextureUpdate: invalidate,
      }),
    [
      wallColor,
      roomSettings.ceilingMaterialMode,
      roomSettings.ceilingCustomTextureUrl,
      roomSettings.ceilingUvRepeatX,
      roomSettings.ceilingUvRepeatY,
      roomSettings.ceilingUvRotationDeg,
      roomSettings.ceilingTileWidthCm,
      roomSettings.ceilingTileHeightCm,
      w,
      d,
      invalidate,
    ],
  );

  const ceilingMaterials = useMemo(
    () => [edgeMaterial, edgeMaterial, edgeMaterial, ceilingMaterial, edgeMaterial, edgeMaterial],
    [ceilingMaterial, edgeMaterial],
  );

  const trimMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#f0eeec", roughness: 0.6, metalness: 0 }),
    [],
  );
  const invisibleShadowMat = useMemo(
    () => new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide }),
    [],
  );

  const lightHousing = useMemo(() => new THREE.MeshStandardMaterial({ color: "#d8d8d8", roughness: 0.5, metalness: 0.3 }), []);
  const lightReflector = useMemo(() => new THREE.MeshStandardMaterial({ color: "#e8e8e8", roughness: 0.15, metalness: 0.7 }), []);
  const lightBulb = useMemo(() => new THREE.MeshBasicMaterial({ color: "#fffdf0" }), []);
  const lightGlow = useMemo(() => new THREE.MeshBasicMaterial({ color: "#fff8e8", transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }), []);

  const lightPositions = useMemo(() => {
    const pos: [number, number, number][] = [];
    const mx = w * 0.15, mz = d * 0.15;
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 2; j++)
        pos.push([-w / 2 + mx + i * ((w - 2 * mx) / 2), h, -d / 2 + mz + j * (d - 2 * mz)]);
    return pos;
  }, [w, d, h]);

  const wallDefs: { name: WallName; pos: [number, number, number]; rot: [number, number, number]; size: [number, number, number] }[] = useMemo(() => [
    { name: "back",  pos: [0, h / 2, -d / 2 - T / 2], rot: [0, 0, 0],              size: [w, h, T] },
    { name: "front", pos: [0, h / 2,  d / 2 + T / 2], rot: [0, Math.PI, 0],         size: [w, h, T] },
    { name: "left",  pos: [-w / 2 - T / 2, h / 2, 0], rot: [0, Math.PI / 2, 0],     size: [d, h, T] },
    { name: "right", pos: [ w / 2 + T / 2, h / 2, 0], rot: [0, -Math.PI / 2, 0],    size: [d, h, T] },
  ], [w, d, h, T]);

  const aoStrips: { name: WallName; pos: [number, number, number]; size: [number, number, number] }[] = useMemo(() => [
    { name: "back",  pos: [0, 0.01, -d / 2],      size: [w, 0.02, 0.015] },
    { name: "front", pos: [0, 0.01,  d / 2],      size: [w, 0.02, 0.015] },
    { name: "left",  pos: [-w / 2, 0.01, 0],      size: [0.015, 0.02, d] },
    { name: "right", pos: [ w / 2, 0.01, 0],      size: [0.015, 0.02, d] },
  ], [w, d]);

  const baseboards: { name: WallName; pos: [number, number, number]; size: [number, number, number] }[] = useMemo(() => [
    { name: "back",  pos: [0, 0.04, -d / 2 + 0.006],       size: [w, 0.08, 0.012] },
    { name: "front", pos: [0, 0.04,  d / 2 - 0.006],       size: [w, 0.08, 0.012] },
    { name: "left",  pos: [-w / 2 + 0.006, 0.04, 0],       size: [0.012, 0.08, d] },
    { name: "right", pos: [ w / 2 - 0.006, 0.04, 0],       size: [0.012, 0.08, d] },
  ], [w, d]);

  const crownMoldings: { name: WallName; pos: [number, number, number]; size: [number, number, number] }[] = useMemo(() => [
    { name: "back",  pos: [0, h - 0.025, -d / 2 + 0.0075],       size: [w, 0.05, 0.015] },
    { name: "front", pos: [0, h - 0.025,  d / 2 - 0.0075],       size: [w, 0.05, 0.015] },
    { name: "left",  pos: [-w / 2 + 0.0075, h - 0.025, 0],       size: [0.015, 0.05, d] },
    { name: "right", pos: [ w / 2 - 0.0075, h - 0.025, 0],       size: [0.015, 0.05, d] },
  ], [w, d, h]);

  const corners: [number, number, number][] = useMemo(() => [
    [-w / 2 - T / 2, h / 2, -d / 2 - T / 2],
    [ w / 2 + T / 2, h / 2, -d / 2 - T / 2],
    [-w / 2 - T / 2, h / 2,  d / 2 + T / 2],
    [ w / 2 + T / 2, h / 2,  d / 2 + T / 2],
  ], [w, d, h, T]);

  const cornerAdjacentWalls: [WallName, WallName][] = [
    ["back", "left"], ["back", "right"], ["front", "left"], ["front", "right"],
  ];

  if (usePoly && polyExtrude.floor && polyExtrude.ceiling && outline) {
    return (
      <group>
        <mesh geometry={polyExtrude.floor} material={polyFloorSlabMaterial} receiveShadow />
        {polyFloorFinishGeometry ? (
          <mesh
            position={[0, 0.004, 0]}
            geometry={polyFloorFinishGeometry}
            material={plannerFloorMat}
            receiveShadow
            renderOrder={1}
          />
        ) : null}
        {wallEdgeMetas.map((wm) => {
          const hideWall = hiddenPolyEdgeSet.has(wm.edgeIndex);
          return (
            <mesh
              key={wm.edgeIndex}
              position={[wm.cx, polyWallCY, wm.cz]}
              rotation={[0, wm.rotY, 0]}
              material={
                hideWall ? invisibleShadowMat : polyWallMatByEdge.get(wm.edgeIndex) ?? invisibleShadowMat
              }
              castShadow
              receiveShadow={!hideWall}
            >
              <boxGeometry args={[wm.len, polyWallH, T]} />
            </mesh>
          );
        })}
        {wallCornerPosts.map((p) => {
          const nV = outline.length;
          const eIn = (p.i - 1 + nV) % nV;
          const eOut = p.i;
          if (hiddenPolyEdgeSet.has(eIn) && hiddenPolyEdgeSet.has(eOut)) {
            return null;
          }
          return (
            <mesh key={`corner-${p.i}`} position={[p.x, polyWallCY, p.z]} material={polyCornerWallMat} castShadow receiveShadow>
              <boxGeometry args={[T, polyWallH, T]} />
            </mesh>
          );
        })}
        {!hideCeiling ? (
          <mesh geometry={polyExtrude.ceiling} material={ceilingMaterial} castShadow receiveShadow />
        ) : (
          <mesh geometry={polyExtrude.ceiling} material={invisibleShadowMat} castShadow />
        )}
        {!hideCeiling &&
          lightPositions.map((pos, i) => (
            <group key={i} position={pos}>
              <mesh position={[0, -0.03, 0]} material={lightHousing}>
                <cylinderGeometry args={[0.1, 0.1, 0.06, 32, 1, true]} />
              </mesh>
              <mesh position={[0, -0.03, 0]} material={lightReflector}>
                <cylinderGeometry args={[0.065, 0.09, 0.048, 32, 1, true]} />
              </mesh>
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} material={lightHousing}>
                <ringGeometry args={[0.092, 0.115, 32]} />
              </mesh>
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.058, 0]} material={lightBulb}>
                <circleGeometry args={[0.055, 24]} />
              </mesh>
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.003, 0]} material={lightGlow} renderOrder={-1}>
                <circleGeometry args={[0.35, 32]} />
              </mesh>
            </group>
          ))}
        {lightPositions.map((pos, i) => (
          <group key={`light-${i}`} position={pos}>
            <pointLight position={[0, -0.08, 0]} intensity={1.4} distance={h * 2.2} decay={2} color="#fff8ee" />
            <pointLight position={[0, -0.15, 0]} intensity={0.35} distance={h * 1.4} decay={2} color="#fffaf0" />
          </group>
        ))}
      </group>
    );
  }

  return (
    <group>
      {/* Floor slab */}
      <mesh geometry={rectangularFloorGeometry} position={[0, -T / 2, 0]} receiveShadow material={floorSlabMaterials} />
      <mesh
        position={[0, 0.004, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        material={plannerFloorMat}
        renderOrder={1}
      >
        <planeGeometry args={[w, d]} />
      </mesh>

      {/* AO strips — only when wall is visible */}
      {aoStrips.map((ao) =>
        !wallsToHide.includes(ao.name) && (
          <mesh key={ao.name} position={ao.pos} renderOrder={1}>
            <boxGeometry args={ao.size} />
            <meshBasicMaterial color="#000000" transparent opacity={0.12} depthWrite={false} />
          </mesh>
        )
      )}

      {/* Ceiling */}
      {!hideCeiling ? (
        <mesh position={[0, h + T / 2, 0]} material={ceilingMaterials} castShadow receiveShadow>
          <boxGeometry args={[w + T * 2, T, d + T * 2]} />
        </mesh>
      ) : (
        <mesh position={[0, h + T / 2, 0]} material={invisibleShadowMat} castShadow>
          <boxGeometry args={[w + T * 2, T, d + T * 2]} />
        </mesh>
      )}

      {/* Walls — visible or invisible shadow-caster */}
      {wallDefs.map((wd) => {
        const hidden = wallsToHide.includes(wd.name);
        return (
          <mesh
            key={wd.name}
            position={wd.pos}
            rotation={wd.rot}
            material={
              hidden
                ? invisibleShadowMat
                : wd.name === "back" || wd.name === "front"
                  ? wallMaterialsWide
                  : wallMaterialsDeep
            }
            castShadow
            receiveShadow={!hidden}
          >
            <boxGeometry args={wd.size} />
          </mesh>
        );
      })}

      {/* Corner columns — hidden when both adjacent walls hidden */}
      {corners.map((pos, i) => {
        const [a, b] = cornerAdjacentWalls[i];
        if (wallsToHide.includes(a) && wallsToHide.includes(b)) return null;
        return (
          <mesh key={i} position={pos} material={edgeMaterial}>
            <boxGeometry args={[T, h, T]} />
          </mesh>
        );
      })}

      {/* Baseboards — only on visible walls */}
      {baseboards.map((bb) =>
        !wallsToHide.includes(bb.name) && (
          <mesh key={bb.name} position={bb.pos} material={trimMaterial}>
            <boxGeometry args={bb.size} />
          </mesh>
        )
      )}

      {/* Crown molding — only on visible walls when ceiling visible */}
      {!hideCeiling && crownMoldings.map((cm) =>
        !wallsToHide.includes(cm.name) && (
          <mesh key={cm.name} position={cm.pos} material={trimMaterial}>
            <boxGeometry args={cm.size} />
          </mesh>
        )
      )}

      {/* Ceiling light fixtures — only when ceiling visible */}
      {!hideCeiling && lightPositions.map((pos, i) => (
        <group key={i} position={pos}>
          <mesh position={[0, -0.03, 0]} material={lightHousing}>
            <cylinderGeometry args={[0.1, 0.1, 0.06, 32, 1, true]} />
          </mesh>
          <mesh position={[0, -0.03, 0]} material={lightReflector}>
            <cylinderGeometry args={[0.065, 0.09, 0.048, 32, 1, true]} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} material={lightHousing}>
            <ringGeometry args={[0.092, 0.115, 32]} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.058, 0]} material={lightBulb}>
            <circleGeometry args={[0.055, 24]} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.003, 0]} material={lightGlow} renderOrder={-1}>
            <circleGeometry args={[0.35, 32]} />
          </mesh>
        </group>
      ))}

      {/* Point lights — always on so room stays lit even when ceiling hidden */}
      {lightPositions.map((pos, i) => (
        <group key={`light-${i}`} position={pos}>
          <pointLight position={[0, -0.08, 0]} intensity={1.4} distance={h * 2.2} decay={2} color="#fff8ee" />
          <pointLight position={[0, -0.15, 0]} intensity={0.35} distance={h * 1.4} decay={2} color="#fffaf0" />
        </group>
      ))}
    </group>
  );
}

function WardrobeLegComposition({
  liftM,
  addonTransforms,
  baseX,
  interactive,
  wardrobeGroupRef,
}: {
  liftM: number;
  addonTransforms: { id: string; xM: number; yM: number }[];
  baseX: number;
  interactive: boolean;
  wardrobeGroupRef: RefObject<THREE.Group | null>;
}) {
  return (
    <group position={[baseX, 0, WARDROBE_LEG_GROUP_Z_BUMP_M]}>
      <WardrobeBase3D />
      <group ref={wardrobeGroupRef} position={[0, liftM, 0]}>
        <WardrobeFrame3D />
        <WardrobeInterior3D />
        <WardrobeDoors3D />
        {interactive && (
          <>
            <SectionHighlights />
            <DimensionAnnotations />
            <SectionDividerDrags groupRef={wardrobeGroupRef} />
            <InteriorComponentDrags groupRef={wardrobeGroupRef} />
          </>
        )}
      </group>
      {addonTransforms.map((t) => (
        <group key={t.id} position={[t.xM, 0, 0]}>
          <WardrobeBase3D />
          <group position={[0, liftM + t.yM, 0]}>
            <WardrobeFrame3D />
            <WardrobeInterior3D />
            <WardrobeDoors3D />
          </group>
        </group>
      ))}
    </group>
  );
}

/* ── Camera ───────────────────────────────────────────────────────── */

function CameraController() {
  const { camera } = useThree();
  const config = useWardrobeStore((s) => s.config);
  const frame = config.frame;
  const base = config.base;
  const room = useWardrobeStore((s) => s.room);
  const viewMode = useWardrobeStore((s) => s.ui.viewMode);
  const dividerDragActive = useWardrobeStore((s) => s.ui.dividerDragActive);
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);

  const H = frame.height * CM;
  const D = frame.depth * CM;
  const liftM = wardrobeBaseLiftCm(clampWardrobeBase(base)) * CM;
  const Wtot = wardrobeCompositionWidthMeters(config);

  const legItems = useMemo(() => wardrobeLayoutLegItems(room, Wtot, D), [room, Wtot, D]);
  const tcx = legItems.reduce((acc, l) => acc + l.xM, 0) / Math.max(1, legItems.length);
  const tcz = legItems.reduce((acc, l) => acc + l.zM, 0) / Math.max(1, legItems.length);
  const bridgeY = wardrobeLayoutGeometry(room) === "bridge" ? wardrobeBridgeLiftMeters(room) : 0;
  const cy = liftM + H / 2 + bridgeY;

  const { hw, hd } = wardrobeRoomHalfExtents(room);
  const span = Math.max(hw * 2, hd * 2, Wtot, 4);

  useEffect(() => {
    const dist = Math.max(4.8, Math.max(Wtot, H + liftM + bridgeY) * 1.85, span * 1.05);

    if (viewMode === "front") {
      camera.position.set(tcx, cy, tcz + dist);
    } else if (viewMode === "side") {
      camera.position.set(tcx + dist, cy, tcz);
    } else {
      camera.position.set(tcx, cy + dist * 0.15, tcz + dist * 1.35);
    }

    if (controlsRef.current) {
      controlsRef.current.target.set(tcx, cy, tcz);
      controlsRef.current.update();
    }
  }, [viewMode, H, Wtot, camera, tcx, tcz, cy, liftM, bridgeY, span]);

  return (
    <OrbitControls
      ref={controlsRef}
      target={[tcx, cy, tcz]}
      enableRotate={!dividerDragActive}
      enablePan={!dividerDragActive}
      enableZoom
      minDistance={0.3}
      maxDistance={14}
      maxPolarAngle={Math.PI / 2 - 0.05}
    />
  );
}

/* ── Scene ────────────────────────────────────────────────────────── */

function Scene() {
  const config = useWardrobeStore((s) => s.config);
  const frame = config.frame;
  const base = config.base;
  const room = useWardrobeStore((s) => s.room);
  const D = frame.depth * CM;
  const liftM = wardrobeBaseLiftCm(clampWardrobeBase(base)) * CM;
  const wardrobeGroupRef = useRef<THREE.Group>(null);
  const noopGroupRef = useRef<THREE.Group>(null);

  const Wtot = wardrobeCompositionWidthMeters(config);

  const legItems = useMemo(() => wardrobeLayoutLegItems(room, Wtot, D), [room, Wtot, D]);
  const interactiveLegIdx = useMemo(
    () => wardrobeLayoutInteractiveLegIndex(room, legItems),
    [room, legItems],
  );

  const bridgeExtraY = wardrobeLayoutGeometry(room) === "bridge" ? wardrobeBridgeLiftMeters(room) : 0;

  return (
    <>
      <ambientLight intensity={0.35} color="#fff8f0" />
      <Environment preset="apartment" environmentIntensity={0.15} />

      <Room />

      {legItems.map((leg, legIdx) => {
        const legCfg = wardrobeConfigWithFrameWidth(config, leg.frameWidthCm);
        const row = wardrobeEmbedRowLayoutFromConfig(legCfg);
        return (
          <group
            key={`${leg.label}-${legIdx}`}
            position={[leg.xM, bridgeExtraY, leg.zM]}
            rotation={[0, leg.rotationY, 0]}
          >
            <WardrobeLegLayoutProvider frameWidthCm={leg.frameWidthCm}>
              <WardrobeLegComposition
                liftM={liftM}
                addonTransforms={row.addonTransforms}
                baseX={row.baseX}
                interactive={legIdx === interactiveLegIdx}
                wardrobeGroupRef={legIdx === interactiveLegIdx ? wardrobeGroupRef : noopGroupRef}
              />
            </WardrobeLegLayoutProvider>
          </group>
        );
      })}

      <CameraController />
    </>
  );
}

/* ── Canvas Overlay ───────────────────────────────────────────────── */

const VIEW_MODES: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
  { id: "perspective", label: "3D", icon: <RotateCw size={14} /> },
  { id: "front", label: "Front", icon: <Maximize2 size={14} /> },
  { id: "side", label: "Side", icon: <ArrowRightLeft size={14} /> },
];

function CanvasOverlay() {
  const config = useWardrobeStore((s) => s.config);
  const viewMode = useWardrobeStore((s) => s.ui.viewMode);
  const showDoors = useWardrobeStore((s) => s.ui.showDoors);
  const setViewMode = useWardrobeStore((s) => s.setViewMode);
  const toggleDoors = useWardrobeStore((s) => s.toggleDoors);
  const sheetPlacementOverrides = useWardrobeStore((s) => s.sheetPlacementOverrides);
  const setSheetPlacementOverrides = useWardrobeStore((s) => s.setSheetPlacementOverrides);
  const bumpSheetManualExtraSheets = useWardrobeStore((s) => s.bumpSheetManualExtraSheets);
  const wardrobeSheetSizeOverrideCm = useWardrobeStore((s) => s.wardrobeSheetSizeOverrideCm);
  const setWardrobeSheetSizeOverride = useWardrobeStore((s) => s.setWardrobeSheetSizeOverride);
  const [showSheets, setShowSheets] = useState(false);
  const sheetLayout = useWardrobeSheetLayout();

  const wardrobePlacementOrderByPanelId = useMemo(() => {
    const m = new Map<string, string>();
    for (const mp of sheetLayout.byMaterial) {
      for (const p of mp.panels) {
        m.set(p.id, wardrobePanelFrontOrderKey(p));
      }
    }
    return m;
  }, [sheetLayout]);

  const sortWardrobeSheetPlacements = useMemo(
    () => (placements: Parameters<typeof sortPlacementsWardrobeFrontOrder>[0]) =>
      sortPlacementsWardrobeFrontOrder(placements, wardrobePlacementOrderByPanelId),
    [wardrobePlacementOrderByPanelId],
  );

  return (
    <>
      <div className="canvas-controls">
        {VIEW_MODES.map((vm) => (
          <button
            key={vm.id}
            className={`canvas-ctrl-btn ${viewMode === vm.id ? "active" : ""}`}
            onClick={() => setViewMode(vm.id)}
          >
            {vm.icon}
            {vm.label}
          </button>
        ))}
        {config.doors.type !== "none" && (
          <>
            <span className="canvas-ctrl-sep" />
            <button
              className="canvas-ctrl-icon"
              onClick={toggleDoors}
              title={showDoors ? "Hide doors" : "Show doors"}
            >
              {showDoors ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </>
        )}
        <span className="canvas-ctrl-sep" />
        <button
          className="canvas-ctrl-btn"
          onClick={() => setShowSheets(true)}
          title="View sheet layout — how pieces are cut from the laminate sheets"
        >
          <Layers size={14} />
          Sheets
          {sheetLayout.totalOverflow > 0 && (
            <span
              className="ml-1 inline-block w-2 h-2 rounded-full bg-red-500"
              aria-label={`${sheetLayout.totalOverflow} pieces do not fit`}
            />
          )}
        </button>
      </div>

      <SheetViewerModal
        open={showSheets}
        onClose={() => setShowSheets(false)}
        layout={sheetLayout}
        title="Wardrobe sheet layout"
        portalClassName="wardrobe-sheet-viewer"
        sortPlacements={sortWardrobeSheetPlacements}
        allowManualAdjust
        placementOverrides={sheetPlacementOverrides}
        setPlacementOverrides={setSheetPlacementOverrides}
        colorizeBySection
        onAddManualSheet={bumpSheetManualExtraSheets}
        wardrobeSheetSizeControl={{
          value: wardrobeSheetSizeOverrideCm,
          onChange: setWardrobeSheetSizeOverride,
        }}
        enableSheetPieceExport
      />
    </>
  );
}

/* ── Export ────────────────────────────────────────────────────────── */

export default function WardrobeCanvas() {
  return (
    <div className="wardrobe-canvas-wrapper">
      <Canvas
        shadows
        gl={{
          antialias: true,
          logarithmicDepthBuffer: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.05,
          preserveDrawingBuffer: true,
        }}
        camera={{ fov: 40, near: 0.12, far: 50, position: [0, 2, 4] }}
        onPointerMissed={() => {
          useWardrobeStore.getState().selectSection(null);
          useWardrobeStore.getState().selectComponent(null);
        }}
      >
        <Scene />
      </Canvas>
      <CanvasOverlay />
    </div>
  );
}
