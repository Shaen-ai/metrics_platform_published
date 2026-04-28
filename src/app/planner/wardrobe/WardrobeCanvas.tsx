"use client";

import { useRef, useEffect, useMemo, useState, type ComponentRef } from "react";
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
import { createPlannerFloorMaterial } from "../laminateFloor";
import WardrobeFrame3D from "./WardrobeFrame3D";
import WardrobeBase3D from "./WardrobeBase3D";
import WardrobeInterior3D from "./WardrobeInterior3D";
import WardrobeDoors3D from "./WardrobeDoors3D";
import { wardrobeBaseLiftCm, clampWardrobeBase } from "./data";
import SectionHighlights from "./SectionHighlights";
import DimensionAnnotations from "./DimensionAnnotations";
import type { ViewMode } from "./types";
import { ROOM_WALL_THICKNESS_M as WALL_T } from "../constants/roomGeometry";

const CM = 0.01;

// Stable reference so Zustand selectors returning the fallback don't trip
// React's "getSnapshot should be cached" infinite-loop guard.
const EMPTY_ADDONS: import("./types").WardrobeAddon[] = [];

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function clamp255(v: number) {
  return Math.max(0, Math.min(255, Math.round(v)));
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
  const floorStyle = useWardrobeStore((s) => s.room.floorStyle);
  const { camera, invalidate } = useThree();

  const w = 6;
  const d = 5;
  const h = 3.2;
  const T = WALL_T;

  const [viewState, setViewState] = useState<{ wallsToHide: WallName[]; hideCeiling: boolean }>(() => ({
    wallsToHide: ["front"],
    hideCeiling: true,
  }));
  const { wallsToHide, hideCeiling } = viewState;

  const frameCount = useRef(0);
  useFrame(() => {
    frameCount.current += 1;
    if (frameCount.current % 6 !== 0) return;
    const cameraAboveCeiling = camera.position.y > h;
    const nextHideCeiling = cameraAboveCeiling;
    const nextWalls = getWallsToHideFromCamera(camera, w, d);
    setViewState((prev) => {
      const wallsChanged =
        nextWalls.length !== prev.wallsToHide.length ||
        nextWalls.some((wall, i) => prev.wallsToHide[i] !== wall);
      if (!wallsChanged && prev.hideCeiling === nextHideCeiling) return prev;
      return { wallsToHide: nextWalls, hideCeiling: nextHideCeiling };
    });
  });

  const edgeMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#f4f2ef", roughness: 0.9, metalness: 0 }),
    [],
  );

  const wallMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: wallColor, emissive: wallColor, emissiveIntensity: 0.3, roughness: 0.85, metalness: 0 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => {
    wallMaterial.color.set(wallColor);
    wallMaterial.emissive.set(wallColor);
  }, [wallColor, wallMaterial]);

  const wallMaterials = useMemo(
    () => [edgeMaterial, edgeMaterial, edgeMaterial, edgeMaterial, wallMaterial, wallMaterial],
    [wallMaterial, edgeMaterial],
  );

  const floorMaterial = useMemo(() => {
    return createPlannerFloorMaterial({
      floorStyle,
      repeat: [2.25, 2.25],
      onTextureUpdate: invalidate,
      toneMode: "color",
      roughness: 0.7,
      metalness: 0,
    });
  }, [floorStyle, invalidate]);

  const floorMaterials = useMemo(
    () => [edgeMaterial, edgeMaterial, floorMaterial, edgeMaterial, edgeMaterial, edgeMaterial],
    [floorMaterial, edgeMaterial],
  );

  const ceilingColor = useMemo(() => {
    const [r, g, b] = hexToRgb(wallColor);
    const f = 0.5;
    return `rgb(${clamp255(r + (255 - r) * f)},${clamp255(g + (255 - g) * f)},${clamp255(b + (255 - b) * f)})`;
  }, [wallColor]);

  const ceilingMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: ceilingColor, emissive: ceilingColor, emissiveIntensity: 0.35, roughness: 0.95, metalness: 0 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => {
    ceilingMaterial.color.set(ceilingColor);
    ceilingMaterial.emissive.set(ceilingColor);
    invalidate();
  }, [ceilingColor, ceilingMaterial, invalidate]);

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

  return (
    <group>
      {/* Floor slab */}
      <mesh position={[0, -T / 2, 0]} receiveShadow material={floorMaterials}>
        <boxGeometry args={[w + T * 2, T, d + T * 2]} />
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
            material={hidden ? invisibleShadowMat : wallMaterials}
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

/* ── Camera ───────────────────────────────────────────────────────── */

function CameraController() {
  const { camera } = useThree();
  const frame = useWardrobeStore((s) => s.config.frame);
  const base = useWardrobeStore((s) => s.config.base);
  const viewMode = useWardrobeStore((s) => s.ui.viewMode);
  const dividerDragActive = useWardrobeStore((s) => s.ui.dividerDragActive);
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);

  const W = frame.width * CM;
  const H = frame.height * CM;
  const D = frame.depth * CM;
  const liftM = wardrobeBaseLiftCm(clampWardrobeBase(base)) * CM;
  const cx = 0;
  const cy = liftM + H / 2;
  const wardrobeZ = -(2.5 - D / 2);

  useEffect(() => {
    const dist = Math.max(4, Math.max(W, H + liftM) * 1.8);

    if (viewMode === "front") {
      camera.position.set(cx, cy, wardrobeZ + dist);
    } else if (viewMode === "side") {
      camera.position.set(cx + dist, cy, wardrobeZ);
    } else {
      camera.position.set(cx, cy + dist * 0.15, wardrobeZ + dist * 1.4);
    }

    if (controlsRef.current) {
      controlsRef.current.target.set(cx, cy, wardrobeZ);
      controlsRef.current.update();
    }
  }, [viewMode, W, H, D, camera, cx, cy, wardrobeZ, liftM]);

  return (
    <OrbitControls
      ref={controlsRef}
      target={[cx, cy, wardrobeZ]}
      enableRotate={!dividerDragActive}
      enablePan={!dividerDragActive}
      enableZoom
      minDistance={0.3}
      maxDistance={12}
      maxPolarAngle={Math.PI / 2 - 0.05}
    />
  );
}

/* ── Scene ────────────────────────────────────────────────────────── */

function Scene() {
  const frame = useWardrobeStore((s) => s.config.frame);
  const base = useWardrobeStore((s) => s.config.base);
  const W = frame.width * CM;
  const H = frame.height * CM;
  const D = frame.depth * CM;
  const liftM = wardrobeBaseLiftCm(clampWardrobeBase(base)) * CM;
  const wardrobeGroupRef = useRef<THREE.Group>(null);
  const addons = useWardrobeStore((s) => s.config.addons ?? EMPTY_ADDONS);
  const seamStyle = useWardrobeStore((s) => s.config.seamStyle ?? "independent");
  const seamOffsetM = seamStyle === "shared" ? -0.018 : 0;

  // Cumulative offset per addon. "right" accumulates along +X; "top"
  // accumulates along +Y. The primary module always sits at (0, 0). Each
  // addon renders the same wardrobe carcass/interior/doors — identical copy
  // for now; the sheet viewer and cut-list multiply panels per addon.
  let rightCount = 0;
  let topCount = 0;
  const addonTransforms = addons.map((addon) => {
    if (addon.position === "right") {
      rightCount += 1;
      return { id: addon.id, xM: (W + seamOffsetM) * rightCount, yM: 0 };
    }
    topCount += 1;
    return { id: addon.id, xM: 0, yM: (H + seamOffsetM) * topCount };
  });
  const totalRightM = rightCount * (W + seamOffsetM);

  // Center the whole composition on X so added modules stay visible.
  const baseX = -(W + totalRightM) / 2;

  return (
    <>
      <ambientLight intensity={0.35} color="#fff8f0" />
      <Environment preset="apartment" environmentIntensity={0.15} />

      <Room />

      {/* Primary wardrobe against back wall, offset forward past the skirting board */}
      <group position={[baseX, 0, -(2.5 - D / 2) + 0.013]}>
        <WardrobeBase3D />
        <group ref={wardrobeGroupRef} position={[0, liftM, 0]}>
          <WardrobeFrame3D />
          <WardrobeInterior3D />
          <WardrobeDoors3D />
          <SectionHighlights />
          <DimensionAnnotations />
          <SectionDividerDrags groupRef={wardrobeGroupRef} />
          <InteriorComponentDrags groupRef={wardrobeGroupRef} />
        </group>

        {/* Addon modules — identical copies at computed offsets. Each reuses
            the primary wardrobe's carcass/interior/doors, so designers see
            the final composition at scale. */}
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
