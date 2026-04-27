"use client";

import { useMemo, useCallback, useRef, useLayoutEffect } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useKitchenStore } from "./store";
import {
  TOTAL_BASE_HEIGHT,
  WALL_MOUNT_Y,
  WALL_CABINET_HEIGHT,
  PANEL_THICKNESS,
  HANDLE_COLORS,
  getEffectiveBaseDims,
  getEffectiveWallDims,
  DESIGN_REF_PRESETS,
  type KitchenMaterial,
} from "./data";
import { useHandleTexture } from "../useHandleTexture";
import { cloneBoxMaterialsWithWoodRepeat, setWoodMapRepeatForPanel, cloneMaterialFromPlacement } from "../textureRepeat";
import { useKitchenPanelPlacements, type KitchenPanelRenderInfo } from "../sheet/useKitchenPanelPlacements";
import type { GrainDirection } from "./types";
import type {
  KitchenModule,
  BaseModuleType,
  WallModuleType,
  CornerUnitConfig,
  DesignPlacement,
  DesignRefKind,
  KitchenCabinetDragRun,
  WallAlignGuide,
  FloorAlignGuide,
} from "./types";
import { useKitchenMaterial, useKitchenDoorMaterial } from "./useKitchenMaterial";

const CM = 0.01; // 1 cm = 0.01 m in Three.js units
const PT = PANEL_THICKNESS * CM;

function kitchenCabinetBoxMaterials(
  base: THREE.Material,
  boxW: number,
  boxH: number,
  boxD: number,
  refW_m: number,
  refH_m: number,
  grain: GrainDirection,
): THREE.Material | THREE.MeshPhysicalMaterial[] {
  if (base instanceof THREE.MeshPhysicalMaterial && base.map) {
    return cloneBoxMaterialsWithWoodRepeat(base, boxW, boxH, boxD, refW_m, refH_m, grain);
  }
  return base;
}

function kitchenDoorPanelMaterial(
  base: THREE.Material,
  panelW: number,
  panelH: number,
  refW_m: number,
  refH_m: number,
  grain: GrainDirection,
  /** When set, sample the material's sheet instead of refW/refH tiling. */
  placementInfo?: KitchenPanelRenderInfo | null,
): THREE.Material {
  if (!(base instanceof THREE.MeshPhysicalMaterial) || !base.map) return base;
  if (placementInfo) {
    return cloneMaterialFromPlacement(
      base,
      placementInfo.placement,
      placementInfo.sheet,
      placementInfo.textureRotated,
    );
  }
  const mat = base.clone() as THREE.MeshPhysicalMaterial;
  mat.map = base.map.clone();
  setWoodMapRepeatForPanel(mat.map, panelW, panelH, refW_m, refH_m, grain);
  return mat;
}

/**
 * Maps the `KitchenCabinetDragRun` discriminator to the panel-id prefix
 * used by `enumerateKitchenPanels`. Keeps the two in sync without the
 * caller plumbing an additional string prop.
 */
const DRAG_RUN_TO_PANEL_PREFIX: Record<string, string> = {
  "main-base": "main.base",
  "main-wall": "main.wall",
  "island-base": "island.base",
  "island-wall": "island.wall",
  "left-base": "left.base",
  "left-wall": "left.wall",
};

/** R3F does not reliably apply `userData` from JSX on `<group>` — set on the THREE.Group for native raycasts (KitchenCabinetDragController). */
function useKitchenDragGroupUserData(
  ref: React.RefObject<THREE.Group | null>,
  payload: { run: KitchenCabinetDragRun; moduleId: string; index: number },
) {
  useLayoutEffect(() => {
    const g = ref.current;
    if (!g) return;
    g.userData.kitchenDrag = payload;
  }, [payload.run, payload.moduleId, payload.index]);
}

// Appliance face colors
const APPLIANCE_COLORS: Record<string, string> = {
  "oven-unit":                "#2a2a2a",
  "dishwasher-unit":          "#d0d0d0",
  "fridge-unit":              "#e8e8e8",
  "freestanding-fridge":      "#c8cdd4",
  "washing-machine-unit":     "#e4e8ec",
  "hood-unit":                "#888888",
  "sink-unit":                "#b0b8c0",
};

const APPLIANCE_ROUGHNESS: Record<string, number> = {
  "oven-unit":                0.2,
  "dishwasher-unit":          0.3,
  "fridge-unit":              0.25,
  "freestanding-fridge":      0.22,
  "washing-machine-unit":     0.35,
  "hood-unit":                0.3,
  "sink-unit":                0.15,
};

const APPLIANCE_METALNESS: Record<string, number> = {
  "oven-unit":                0.8,
  "dishwasher-unit":          0.5,
  "fridge-unit":              0.4,
  "freestanding-fridge":      0.55,
  "washing-machine-unit":     0.25,
  "hood-unit":                0.7,
  "sink-unit":                0.85,
};

function ApplianceFace({
  type,
  widthCm,
  heightCm,
}: {
  type: string;
  widthCm: number;
  heightCm: number;
}) {
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: APPLIANCE_COLORS[type] ?? "#888888",
        roughness: APPLIANCE_ROUGHNESS[type] ?? 0.4,
        metalness: APPLIANCE_METALNESS[type] ?? 0.5,
      }),
    [type],
  );

  const W = widthCm * CM;
  const H = heightCm * CM;
  const margin = 0.01;

  return (
    <group>
      <mesh position={[0, 0, 0.001]} material={mat}>
        <boxGeometry args={[W - margin * 2, H - margin * 2, 0.002]} />
      </mesh>
      {type === "freestanding-fridge" && (
        <mesh position={[0, 0, 0.002]} material={mat}>
          <boxGeometry args={[0.004, H - margin * 2, 0.002]} />
        </mesh>
      )}
    </group>
  );
}

/**
 * Cabinet handle geometry. CapsuleGeometry is aligned along Y by default; we rotate
 * 90° around Z so the bar runs horizontally (along X) on door/drawer fronts.
 */
function Handle({
  style,
  panelWidthM,
  panelHeightM,
  variant,
  handleFinish,
}: {
  style: string;
  panelWidthM: number;
  panelHeightM: number;
  variant: "door" | "drawer";
  handleFinish?: KitchenMaterial | null;
}) {
  const tex = useHandleTexture(handleFinish?.imageUrl);
  const showMap = Boolean(tex);
  const base =
    HANDLE_COLORS[style as keyof typeof HANDLE_COLORS] ?? HANDLE_COLORS["bar-steel"];
  const pbr = handleFinish
    ? {
        color: handleFinish.color,
        roughness: handleFinish.roughness,
        metalness: handleFinish.metalness,
      }
    : base;
  const matColor = showMap ? "#ffffff" : pbr.color;

  if (style === "recessed") return null;

  const isKnob = style.startsWith("knob");
  /** Typical horizontal bar length (~⅓–½ of panel width, capped) */
  const barLen = Math.min(Math.max(panelWidthM * 0.38, 0.06), 0.16);
  const radius = 0.005;

  if (isKnob) {
    const xOff = variant === "door" ? Math.min(panelWidthM * 0.28, 0.12) : 0;
    const yOff =
      variant === "door"
        ? -panelHeightM * 0.22
        : 0;
    return (
      <mesh position={[xOff, yOff, 0.014]}>
        <sphereGeometry args={[0.011, 14, 14]} />
        <meshStandardMaterial
          color={matColor}
          map={tex ?? undefined}
          roughness={pbr.roughness}
          metalness={pbr.metalness}
        />
      </mesh>
    );
  }

  // Horizontal bar: rotate capsule (Y-axis) → X-axis in panel space
  const yOff =
    variant === "door"
      ? -panelHeightM * 0.28
      : 0;

  return (
    <mesh position={[0, yOff, 0.016]} rotation={[0, 0, Math.PI / 2]}>
      <capsuleGeometry args={[radius, barLen, 8, 16]} />
      <meshStandardMaterial
        color={matColor}
        map={tex ?? undefined}
        roughness={pbr.roughness}
        metalness={pbr.metalness}
      />
    </mesh>
  );
}

// ── Single base cabinet module ────────────────────────────────────────

function BaseModule({
  module,
  xOffset,
  isSelected,
  onClick,
  onCabinetPointerDown,
  dragMeta,
  baseCabinetMat,
  baseDoorMat,
  cabinetGrain,
  doorGrain,
  refW_m,
  refH_m,
  handleStyle,
  handleFinish,
}: {
  module: KitchenModule;
  xOffset: number;
  isSelected: boolean;
  onClick: () => void;
  /** Disables OrbitControls for this gesture so drag does not rotate the room (native canvas listeners). */
  onCabinetPointerDown: (e: ThreeEvent<PointerEvent>) => void;
  /** Enables 3D drag-to-reorder along the run (KitchenCabinetDragController). */
  dragMeta: { run: Extract<KitchenCabinetDragRun, "main-base" | "island-base" | "left-base">; index: number };
  baseCabinetMat: THREE.Material;
  baseDoorMat: THREE.Material;
  cabinetGrain: GrainDirection;
  doorGrain: GrainDirection;
  /** Reference outer run width × body height (m) for consistent laminate scale. */
  refW_m: number;
  refH_m: number;
  handleStyle: string;
  handleFinish: KitchenMaterial | null;
}) {
  const dim = getEffectiveBaseDims(module);
  const W = dim.w * CM;
  const cabinetH = dim.h * CM;
  const D = dim.d * CM;
  const hasFreePos = module.xCm !== undefined;
  const X = hasFreePos ? module.xCm! * CM : xOffset * CM + W / 2;

  const isAppliancePanel =
    module.type === "oven-unit" ||
    module.type === "dishwasher-unit" ||
    module.type === "fridge-unit" ||
    module.type === "washing-machine-unit" ||
    module.type === "freestanding-fridge";

  const isSink = module.type === "sink-unit";

  const selectionMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#1a73e8",
        transparent: true,
        opacity: 0.15,
        depthWrite: false,
      }),
    [],
  );

  const frontW = W - PT * 2;
  const frontH = cabinetH - PT * 2;
  const frontZ = D / 2 + 0.003;
  const centerZ = D / 2;

  const cabinetMeshMaterial = useMemo(
    () => kitchenCabinetBoxMaterials(baseCabinetMat, W, cabinetH, D, refW_m, refH_m, cabinetGrain),
    [baseCabinetMat, W, cabinetH, D, refW_m, refH_m, cabinetGrain],
  );

  const placements = useKitchenPanelPlacements();
  const panelIdPrefix = DRAG_RUN_TO_PANEL_PREFIX[dragMeta.run];
  const doorPlacement = panelIdPrefix
    ? placements.get(`${panelIdPrefix}.${module.id}.door`)
    : null;

  const doorPanelMaterial = useMemo(
    () =>
      kitchenDoorPanelMaterial(
        baseDoorMat,
        frontW,
        frontH,
        refW_m,
        refH_m,
        doorGrain,
        doorPlacement,
      ),
    [baseDoorMat, frontW, frontH, refW_m, refH_m, doorGrain, doorPlacement],
  );

  const drawerFrontMat = useMemo(() => {
    if (module.type !== "drawer-unit") return doorPanelMaterial;
    const dh = frontH / 3 - 0.004;
    // Drawer-unit module still uses the single "door" panel id — the
    // carcass-level packing treats the whole front as one piece.
    return kitchenDoorPanelMaterial(
      baseDoorMat,
      frontW,
      dh,
      refW_m,
      refH_m,
      doorGrain,
      doorPlacement,
    );
  }, [module.type, baseDoorMat, frontW, frontH, refW_m, refH_m, doorGrain, doorPanelMaterial, doorPlacement]);

  const dragGroupRef = useRef<THREE.Group>(null);
  useKitchenDragGroupUserData(dragGroupRef, {
    run: dragMeta.run,
    moduleId: module.id,
    index: dragMeta.index,
  });

  return (
    <group
      ref={dragGroupRef}
      position={[X, cabinetH / 2, centerZ]}
      onPointerDown={onCabinetPointerDown}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <mesh material={cabinetMeshMaterial} castShadow>
        <boxGeometry args={[W, cabinetH, D]} />
      </mesh>

      {isSelected && (
        <mesh material={selectionMat}>
          <boxGeometry args={[W + 0.005, cabinetH + 0.005, D + 0.005]} />
        </mesh>
      )}

      {!isAppliancePanel && module.type !== "drawer-unit" && (
        <group position={[0, 0, frontZ]}>
          <mesh material={doorPanelMaterial} castShadow>
            <boxGeometry args={[frontW, frontH, 0.018]} />
          </mesh>
          {!isSink && (
            <Handle
              style={handleStyle}
              panelWidthM={frontW}
              panelHeightM={frontH}
              variant="door"
              handleFinish={handleFinish}
            />
          )}
        </group>
      )}

      {module.type === "drawer-unit" && (
        <group position={[0, 0, frontZ]}>
          {[0, 1, 2].map((i) => {
            const drawerH = frontH / 3;
            const drawerY = frontH / 2 - drawerH * (i + 0.5);
            return (
              <group key={i} position={[0, drawerY, 0.001]}>
                <mesh material={drawerFrontMat}>
                  <boxGeometry args={[frontW, drawerH - 0.004, 0.016]} />
                </mesh>
                <mesh
                  position={[0, -drawerH / 2, 0]}
                  material={new THREE.MeshStandardMaterial({ color: "#cccccc" })}
                >
                  <boxGeometry args={[frontW, 0.002, 0.016]} />
                </mesh>
                <Handle
                  style={handleStyle}
                  panelWidthM={frontW}
                  panelHeightM={Math.max(drawerH - 0.004, 0.04)}
                  variant="drawer"
                  handleFinish={handleFinish}
                />
              </group>
            );
          })}
        </group>
      )}

      {isAppliancePanel && (
        <group position={[0, 0, frontZ]}>
          <ApplianceFace
            type={module.type}
            widthCm={dim.w}
            heightCm={dim.h}
          />
        </group>
      )}

      {isSink && (
        <mesh
          position={[0, cabinetH / 2 - 0.04, 0]}
          material={
            new THREE.MeshStandardMaterial({
              color: "#c8d0d8",
              roughness: 0.12,
              metalness: 0.88,
            })
          }
        >
          <boxGeometry args={[W - 0.06, 0.04, D - 0.08]} />
        </mesh>
      )}
    </group>
  );
}

// ── Single wall cabinet module ────────────────────────────────────────

function WallModule({
  module,
  xOffset,
  isSelected,
  onClick,
  onCabinetPointerDown,
  dragMeta,
  baseCabinetMat,
  baseDoorMat,
  cabinetGrain,
  doorGrain,
  refW_m,
  refH_m,
  handleStyle,
  handleFinish,
}: {
  module: KitchenModule;
  xOffset: number;
  isSelected: boolean;
  onClick: () => void;
  onCabinetPointerDown: (e: ThreeEvent<PointerEvent>) => void;
  dragMeta: { run: Extract<KitchenCabinetDragRun, "main-wall" | "island-wall" | "left-wall">; index: number };
  baseCabinetMat: THREE.Material;
  baseDoorMat: THREE.Material;
  cabinetGrain: GrainDirection;
  doorGrain: GrainDirection;
  refW_m: number;
  refH_m: number;
  handleStyle: string;
  handleFinish: KitchenMaterial | null;
}) {
  const dim = getEffectiveWallDims(module);
  const W = dim.w * CM;
  const H = dim.h * CM;
  const D = dim.d * CM;
  const hasFreePos = module.xCm !== undefined && module.yCm !== undefined;
  const X = hasFreePos ? module.xCm! * CM : xOffset * CM + W / 2;
  const Y = hasFreePos ? module.yCm! * CM : WALL_MOUNT_Y * CM + H / 2;

  const isHood = module.type === "hood-unit";
  const isOpen = module.type === "wall-open";

  const frontW = W - PT * 2;
  const frontH = H - PT * 2;
  const frontZ = D / 2 + 0.003;

  const cabinetMeshMaterial = useMemo(
    () => kitchenCabinetBoxMaterials(baseCabinetMat, W, H, D, refW_m, refH_m, cabinetGrain),
    [baseCabinetMat, W, H, D, refW_m, refH_m, cabinetGrain],
  );

  const placements = useKitchenPanelPlacements();
  const panelIdPrefix = DRAG_RUN_TO_PANEL_PREFIX[dragMeta.run];
  const doorPlacement = panelIdPrefix
    ? placements.get(`${panelIdPrefix}.${module.id}.door`)
    : null;

  const doorPanelMaterial = useMemo(
    () =>
      kitchenDoorPanelMaterial(
        baseDoorMat,
        frontW,
        frontH,
        refW_m,
        refH_m,
        doorGrain,
        doorPlacement,
      ),
    [baseDoorMat, frontW, frontH, refW_m, refH_m, doorGrain, doorPlacement],
  );

  const selectionMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#1a73e8",
        transparent: true,
        opacity: 0.15,
        depthWrite: false,
      }),
    [],
  );

  const hoodDepth = D * 0.72;
  const wallCenterZ = D / 2;

  const dragGroupRef = useRef<THREE.Group>(null);
  useKitchenDragGroupUserData(dragGroupRef, {
    run: dragMeta.run,
    moduleId: module.id,
    index: dragMeta.index,
  });

  if (isHood) {
    const hoodH = H * 0.55;
    const hoodY = hasFreePos ? module.yCm! * CM : WALL_MOUNT_Y * CM + hoodH / 2;
    return (
      <group
        ref={dragGroupRef}
        position={[X, hoodY, hoodDepth / 2]}
        onPointerDown={onCabinetPointerDown}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        <mesh
          material={
            new THREE.MeshStandardMaterial({
              color: "#888888",
              roughness: 0.25,
              metalness: 0.75,
            })
          }
          castShadow
        >
          <boxGeometry args={[W * 0.9, hoodH, hoodDepth]} />
        </mesh>
        {isSelected && (
          <mesh material={selectionMat}>
            <boxGeometry args={[W * 0.9 + 0.005, hoodH + 0.005, hoodDepth + 0.005]} />
          </mesh>
        )}
      </group>
    );
  }

  return (
    <group
      ref={dragGroupRef}
      position={[X, Y, wallCenterZ]}
      onPointerDown={onCabinetPointerDown}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <mesh material={cabinetMeshMaterial} castShadow>
        <boxGeometry args={[W, H, D]} />
      </mesh>

      {isSelected && (
        <mesh material={selectionMat}>
          <boxGeometry args={[W + 0.005, H + 0.005, D + 0.005]} />
        </mesh>
      )}

      {!isOpen && (
        <group position={[0, 0, frontZ]}>
          <mesh material={doorPanelMaterial} castShadow>
            <boxGeometry args={[frontW, frontH, 0.018]} />
          </mesh>
          <Handle
            style={handleStyle}
            panelWidthM={frontW}
            panelHeightM={frontH}
            variant="door"
            handleFinish={handleFinish}
          />
        </group>
      )}

      {isOpen && (
        <mesh
          position={[0, 0, D / 2 - 0.005]}
          material={new THREE.MeshStandardMaterial({ color: "#d0ccc4", roughness: 0.8 })}
        >
          <boxGeometry args={[W - PT * 2, PT * 1.5, 0.01]} />
        </mesh>
      )}
    </group>
  );
}

// ── Dimension annotations (2D canvas text) ───────────────────────────

function DimensionLabel({
  text,
  position,
}: {
  text: string;
  position: [number, number, number];
}) {
  const canvas = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.roundRect(4, 4, 248, 56, 8);
    ctx.fill();
    ctx.fillStyle = "#333";
    ctx.font = "bold 28px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 128, 36);
    return c;
  }, [text]);

  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [canvas]);

  return (
    <mesh position={position}>
      <planeGeometry args={[0.32, 0.08]} />
      <meshBasicMaterial map={texture} transparent side={THREE.DoubleSide} />
    </mesh>
  );
}

/** Solid appliance-style front + silhouette details for layout aids (ghost body stays translucent). */
const DESIGN_AID_FRONT: Record<
  DesignRefKind,
  { color: string; roughness: number; metalness: number }
> = {
  fridge: { color: "#eef1f4", roughness: 0.42, metalness: 0.22 },
  sink: { color: "#b4bcc6", roughness: 0.34, metalness: 0.58 },
  range: { color: "#1f2126", roughness: 0.14, metalness: 0.32 },
  dishwasher: { color: "#d6dadf", roughness: 0.4, metalness: 0.36 },
};

function DesignPlacementFrontDetails({
  kind,
  hx,
  hy,
  hz,
  panelT,
}: {
  kind: DesignRefKind;
  hx: number;
  hy: number;
  hz: number;
  panelT: number;
}) {
  const zSurf = hz / 2 + panelT + 0.006;
  const handleMat = "#5c636d";

  if (kind === "fridge") {
    return (
      <>
        <mesh position={[0, 0, zSurf]}>
          <boxGeometry args={[0.0045, hy * 0.9, 0.022]} />
          <meshStandardMaterial color={handleMat} roughness={0.5} metalness={0.45} />
        </mesh>
        <mesh position={[-hx * 0.22, hy * 0.05, zSurf + 0.012]}>
          <capsuleGeometry args={[0.0045, hy * 0.34, 6, 10]} />
          <meshStandardMaterial color={handleMat} roughness={0.45} metalness={0.5} />
        </mesh>
        <mesh position={[hx * 0.22, hy * 0.05, zSurf + 0.012]}>
          <capsuleGeometry args={[0.0045, hy * 0.34, 6, 10]} />
          <meshStandardMaterial color={handleMat} roughness={0.45} metalness={0.5} />
        </mesh>
      </>
    );
  }

  if (kind === "sink") {
    const r = Math.min(hx, hy) * 0.34;
    return (
      <>
        <mesh position={[0, -hy * 0.06, zSurf + 0.012]}>
          <ringGeometry args={[r * 0.55, r * 0.95, 40]} />
          <meshStandardMaterial color="#8a939e" roughness={0.35} metalness={0.65} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, -hy * 0.06, zSurf + 0.008]}>
          <circleGeometry args={[r * 0.52, 32]} />
          <meshStandardMaterial color="#4a5560" roughness={0.55} metalness={0.35} side={THREE.DoubleSide} />
        </mesh>
      </>
    );
  }

  if (kind === "range") {
    const br = Math.max(0.012, Math.min(hx, hy) * 0.14);
    const ox = Math.min(hx * 0.22, 0.09);
    const oy = Math.min(hy * 0.26, 0.045);
    const burner = (
      x: number,
      y: number,
    ) => (
      <mesh key={`${x}-${y}`} position={[x, y, zSurf + 0.014]}>
        <circleGeometry args={[br, 20]} />
        <meshStandardMaterial color="#0d0d0f" roughness={0.85} metalness={0.15} />
      </mesh>
    );
    return (
      <>
        {burner(-ox, oy)}
        {burner(ox, oy)}
        {burner(-ox, -oy)}
        {burner(ox, -oy)}
      </>
    );
  }

  // dishwasher
  return (
    <mesh position={[0, -hy * 0.14, zSurf + 0.012]}>
      <boxGeometry args={[hx * 0.44, 0.007, 0.016]} />
      <meshStandardMaterial color={handleMat} roughness={0.45} metalness={0.55} />
    </mesh>
  );
}

function DesignPlacementBlock({ p }: { p: DesignPlacement }) {
  const preset = DESIGN_REF_PRESETS[p.kind];
  const hx = preset.widthCm * CM;
  const hy = preset.heightCm * CM;
  const hz = preset.depthCm * CM;
  const panelT = 0.018;
  const front = DESIGN_AID_FRONT[p.kind];

  return (
    <group
      position={[p.xCm * CM, hy / 2, p.zCm * CM]}
      rotation={[0, p.rotationYRad, 0]}
    >
      <mesh>
        <boxGeometry args={[hx, hy, hz]} />
        <meshStandardMaterial
          color="#5b7aa5"
          transparent
          opacity={0.16}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, 0, hz / 2 + panelT / 2]}>
        <boxGeometry args={[hx * 0.96, hy * 0.96, panelT]} />
        <meshStandardMaterial
          color={front.color}
          roughness={front.roughness}
          metalness={front.metalness}
        />
      </mesh>
      <DesignPlacementFrontDetails kind={p.kind} hx={hx} hy={hy} hz={hz} panelT={panelT} />
    </group>
  );
}

// ── Per-module distance annotations (shown when a module is selected) ─

const MIN_DIST_CM = 1;

function SmallDimensionLabel({
  text,
  position,
  color = "#333",
  bgColor = "rgba(255,255,255,0.9)",
}: {
  text: string;
  position: [number, number, number];
  color?: string;
  bgColor?: string;
}) {
  const canvas = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 200;
    c.height = 48;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = bgColor;
    ctx.roundRect(3, 3, 194, 42, 6);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.font = "bold 24px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 100, 27);
    return c;
  }, [text, color, bgColor]);

  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [canvas]);

  return (
    <mesh position={position} renderOrder={999}>
      <planeGeometry args={[0.24, 0.06]} />
      <meshBasicMaterial map={texture} transparent side={THREE.DoubleSide} depthTest={false} />
    </mesh>
  );
}

function GuideLine({
  from,
  to,
  color = "#1a73e8",
}: {
  from: [number, number, number];
  to: [number, number, number];
  color?: string;
}) {
  const mat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.6,
        depthTest: false,
      }),
    [color],
  );

  const geo = useMemo(() => {
    const pts = [
      new THREE.Vector3(...from),
      new THREE.Vector3(...to),
    ];
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [from, to]);

  return <lineSegments geometry={geo} material={mat} renderOrder={998} />;
}

function SelectedModuleDistances({
  modules,
  offsets,
  selectedId,
  totalWidth,
  runType,
  runStartOffset,
  maxDepthCm,
}: {
  modules: KitchenModule[];
  offsets: number[];
  selectedId: string | null;
  totalWidth: number;
  runType: "base" | "wall";
  runStartOffset: number;
  maxDepthCm: number;
}) {
  if (!selectedId) return null;

  const idx = modules.findIndex((m) => m.id === selectedId);
  if (idx < 0) return null;

  const mod = modules[idx];
  const dim =
    runType === "base"
      ? getEffectiveBaseDims(mod)
      : getEffectiveWallDims(mod);

  const xOffset = offsets[idx];
  const modW = mod.width;
  const distLeft = xOffset;
  const distRight = totalWidth - xOffset - modW;

  const hasWallFreePos = runType === "wall" && mod.xCm !== undefined && mod.yCm !== undefined;
  const hasBaseFreePos = runType === "base" && mod.xCm !== undefined;
  const hasFreePos = hasWallFreePos || hasBaseFreePos;
  const modLeftX = hasFreePos
    ? (mod.xCm! - dim.w / 2) * CM
    : (runStartOffset + xOffset) * CM;
  const modRightX = hasFreePos
    ? (mod.xCm! + dim.w / 2) * CM
    : (runStartOffset + xOffset + modW) * CM;
  const modCenterX = (modLeftX + modRightX) / 2;

  const runLeftX = runStartOffset * CM;
  const runRightX = (runStartOffset + totalWidth) * CM;

  const depthM = maxDepthCm * CM;
  const floorY = 0.005;

  const actualDistLeft = (modLeftX - runLeftX) / CM;
  const actualDistRight = (runRightX - modRightX) / CM;

  if (runType === "base") {
    const cabinetH = dim.h * CM;
    return (
      <group>
        {/* Module width */}
        <SmallDimensionLabel
          text={`${modW} cm`}
          position={[modCenterX, cabinetH + 0.06, depthM / 2]}
        />

        {/* Distance from left of run */}
        {actualDistLeft > MIN_DIST_CM && (
          <>
            <GuideLine
              from={[runLeftX, floorY, depthM + 0.06]}
              to={[modLeftX, floorY, depthM + 0.06]}
            />
            <SmallDimensionLabel
              text={`${Math.round(actualDistLeft)} cm`}
              position={[(runLeftX + modLeftX) / 2, floorY, depthM + 0.06]}
            />
          </>
        )}

        {/* Distance from right of run */}
        {actualDistRight > MIN_DIST_CM && (
          <>
            <GuideLine
              from={[modRightX, floorY, depthM + 0.06]}
              to={[runRightX, floorY, depthM + 0.06]}
            />
            <SmallDimensionLabel
              text={`${Math.round(actualDistRight)} cm`}
              position={[(modRightX + runRightX) / 2, floorY, depthM + 0.06]}
            />
          </>
        )}
      </group>
    );
  }

  // Wall module
  const isHood = mod.type === "hood-unit";
  const wallH = dim.h * CM;
  const bottomY = hasFreePos
    ? mod.yCm! * CM - wallH / 2
    : isHood
      ? WALL_MOUNT_Y * CM
      : WALL_MOUNT_Y * CM;
  const topY = hasFreePos
    ? mod.yCm! * CM + wallH / 2
    : isHood
      ? WALL_MOUNT_Y * CM + dim.h * 0.55 * CM
      : WALL_MOUNT_Y * CM + wallH;
  const countertopTopY = TOTAL_BASE_HEIGHT * CM;

  const sideX = modLeftX - 0.06;

  return (
    <group>
      {/* Module width */}
      <SmallDimensionLabel
        text={`${modW} cm`}
        position={[modCenterX, topY + 0.06, depthM / 2]}
      />

      {/* Distance from floor to bottom of wall cabinet */}
      <GuideLine
        from={[sideX, 0, depthM / 2]}
        to={[sideX, bottomY, depthM / 2]}
        color="#e67e22"
      />
      <SmallDimensionLabel
        text={`${Math.round(bottomY / CM)} cm`}
        position={[sideX, bottomY / 2, depthM / 2]}
        color="#c65d00"
      />

      {/* Gap from countertop to wall cabinet bottom */}
      {bottomY > countertopTopY + 0.01 && (
        <>
          <GuideLine
            from={[sideX + 0.08, countertopTopY, depthM / 2]}
            to={[sideX + 0.08, bottomY, depthM / 2]}
            color="#27ae60"
          />
          <SmallDimensionLabel
            text={`${Math.round((bottomY - countertopTopY) / CM)} cm`}
            position={[sideX + 0.08, (countertopTopY + bottomY) / 2, depthM / 2]}
            color="#1a7a42"
          />
        </>
      )}

      {/* Distance from left of wall run */}
      {actualDistLeft > MIN_DIST_CM && (
        <>
          <GuideLine
            from={[runLeftX, bottomY - 0.03, depthM / 2]}
            to={[modLeftX, bottomY - 0.03, depthM / 2]}
          />
          <SmallDimensionLabel
            text={`${Math.round(actualDistLeft)} cm`}
            position={[(runLeftX + modLeftX) / 2, bottomY - 0.03, depthM / 2]}
          />
        </>
      )}

      {/* Distance from right of wall run */}
      {actualDistRight > MIN_DIST_CM && (
        <>
          <GuideLine
            from={[modRightX, bottomY - 0.03, depthM / 2]}
            to={[runRightX, bottomY - 0.03, depthM / 2]}
          />
          <SmallDimensionLabel
            text={`${Math.round(actualDistRight)} cm`}
            position={[(modRightX + runRightX) / 2, bottomY - 0.03, depthM / 2]}
          />
        </>
      )}
    </group>
  );
}

// ── Alignment guide lines (shown during wall drag) ────────────────────

const GUIDE_Z = 0.005;
const GUIDE_LINE_EXTENT = 6;

function WallAlignGuides({ guides }: { guides: WallAlignGuide[] }) {
  const mat = useMemo(
    () =>
      new THREE.LineBasicMaterial({ color: "#1a73e8", transparent: true, opacity: 0.6, depthTest: false }),
    [],
  );

  if (guides.length === 0) return null;

  return (
    <group renderOrder={999}>
      {guides.map((g, i) => {
        const pts =
          g.axis === "h"
            ? [new THREE.Vector3(-GUIDE_LINE_EXTENT, g.posCm * CM, GUIDE_Z), new THREE.Vector3(GUIDE_LINE_EXTENT, g.posCm * CM, GUIDE_Z)]
            : [new THREE.Vector3(g.posCm * CM, -GUIDE_LINE_EXTENT, GUIDE_Z), new THREE.Vector3(g.posCm * CM, GUIDE_LINE_EXTENT, GUIDE_Z)];
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        return <lineSegments key={`${g.axis}-${g.posCm}-${i}`} geometry={geo} material={mat} />;
      })}
    </group>
  );
}

// ── Floor↔wall vertical alignment guide lines (shown during base module drag) ─

function FloorAlignGuidesComponent({ guides }: { guides: FloorAlignGuide[] }) {
  const mat = useMemo(
    () =>
      new THREE.LineBasicMaterial({ color: "#1a73e8", transparent: true, opacity: 0.55, depthTest: false }),
    [],
  );

  if (guides.length === 0) return null;

  const BOTTOM_Y = 0;
  const TOP_Y = (WALL_MOUNT_Y + WALL_CABINET_HEIGHT) * CM;

  return (
    <group renderOrder={999}>
      {guides.map((g, i) => {
        const xM = g.xCm * CM;
        const pts = [
          new THREE.Vector3(xM, BOTTOM_Y, 0.005),
          new THREE.Vector3(xM, TOP_Y, 0.005),
        ];
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        return <lineSegments key={`floor-${g.xCm}-${i}`} geometry={geo} material={mat} />;
      })}
    </group>
  );
}

// ── Corner unit (L-shaped body at back/left wall junction) ────────────

function CornerUnit3D({
  corner,
  baseCabinetMat,
  baseDoorMat,
  cabinetGrain,
  doorGrain,
  refW_m,
  refH_m,
  handleStyle,
  handleFinish,
  isSelected,
  onClick,
  onCabinetPointerDown,
}: {
  corner: CornerUnitConfig;
  baseCabinetMat: THREE.Material;
  baseDoorMat: THREE.Material;
  cabinetGrain: GrainDirection;
  doorGrain: GrainDirection;
  refW_m: number;
  refH_m: number;
  handleStyle: import("./types").HandleStyle;
  handleFinish: KitchenMaterial | null;
  isSelected: boolean;
  onClick: () => void;
  onCabinetPointerDown: (e: ThreeEvent<PointerEvent>) => void;
}) {
  const BW = corner.backWingWidthCm * CM;
  const LW = corner.leftWingWidthCm * CM;
  const H = corner.heightCm * CM;
  const D = corner.depthCm * CM;

  const backDoorW = BW - D;
  const leftDoorW = LW - D;
  const doorH = H - PT * 2;
  const DOOR_OFFSET = 0.003;

  const backWingCabinetMats = useMemo(
    () => kitchenCabinetBoxMaterials(baseCabinetMat, BW, H, D, refW_m, refH_m, cabinetGrain),
    [baseCabinetMat, BW, H, D, refW_m, refH_m, cabinetGrain],
  );
  const leftWingCabinetMats = useMemo(
    () => kitchenCabinetBoxMaterials(baseCabinetMat, D, H, LW, refW_m, refH_m, cabinetGrain),
    [baseCabinetMat, D, H, LW, refW_m, refH_m, cabinetGrain],
  );

  const backDoorMat = useMemo(
    () => kitchenDoorPanelMaterial(baseDoorMat, backDoorW - PT, doorH, refW_m, refH_m, doorGrain),
    [baseDoorMat, backDoorW, doorH, refW_m, refH_m, doorGrain],
  );
  const leftDoorMat = useMemo(
    () => kitchenDoorPanelMaterial(baseDoorMat, leftDoorW - PT, doorH, refW_m, refH_m, doorGrain),
    [baseDoorMat, leftDoorW, doorH, refW_m, refH_m, doorGrain],
  );

  const WH = corner.wallCornerHeightCm * CM;
  const WD = corner.wallCornerDepthCm * CM;
  const wallRefH_m = corner.wallCornerHeightCm * CM;
  const wWallBackDoorW = BW - WD;
  const wWallLeftDoorW = LW - WD;
  const wWallDoorH = WH - PT * 2;

  const wallBackWingCabinetMats = useMemo(
    () => kitchenCabinetBoxMaterials(baseCabinetMat, BW, WH, WD, refW_m, wallRefH_m, cabinetGrain),
    [baseCabinetMat, BW, WH, WD, refW_m, wallRefH_m, cabinetGrain],
  );
  const wallLeftWingCabinetMats = useMemo(
    () => kitchenCabinetBoxMaterials(baseCabinetMat, WD, WH, LW, refW_m, wallRefH_m, cabinetGrain),
    [baseCabinetMat, WD, WH, LW, refW_m, wallRefH_m, cabinetGrain],
  );
  const wallBackDoorPanelMat = useMemo(
    () =>
      kitchenDoorPanelMaterial(
        baseDoorMat,
        wWallBackDoorW - PT,
        wWallDoorH,
        refW_m,
        wallRefH_m,
        doorGrain,
      ),
    [baseDoorMat, wWallBackDoorW, wWallDoorH, refW_m, wallRefH_m, doorGrain],
  );
  const wallLeftDoorPanelMat = useMemo(
    () =>
      kitchenDoorPanelMaterial(
        baseDoorMat,
        wWallLeftDoorW - PT,
        wWallDoorH,
        refW_m,
        wallRefH_m,
        doorGrain,
      ),
    [baseDoorMat, wWallLeftDoorW, wWallDoorH, refW_m, wallRefH_m, doorGrain],
  );

  const selectionMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#1a73e8",
        transparent: true,
        opacity: 0.15,
        depthWrite: false,
      }),
    [],
  );

  return (
    <group
      onPointerDown={onCabinetPointerDown}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {/* Back wing body */}
      <mesh position={[BW / 2, H / 2, D / 2]} material={backWingCabinetMats} castShadow receiveShadow>
        <boxGeometry args={[BW, H, D]} />
      </mesh>
      {/* Left wing body (overlaps at corner square) */}
      <mesh position={[D / 2, H / 2, LW / 2]} material={leftWingCabinetMats} castShadow receiveShadow>
        <boxGeometry args={[D, H, LW]} />
      </mesh>
      {isSelected && (
        <>
          <mesh position={[BW / 2, H / 2, D / 2]} material={selectionMat}>
            <boxGeometry args={[BW + 0.005, H + 0.005, D + 0.005]} />
          </mesh>
          <mesh position={[D / 2, H / 2, LW / 2]} material={selectionMat}>
            <boxGeometry args={[D + 0.005, H + 0.005, LW + 0.005]} />
          </mesh>
        </>
      )}

      {/* Back wing door (+Z face, room-facing), offset 3mm in front of body to avoid z-fighting */}
      {backDoorW > 0.01 && (
        <group position={[D + backDoorW / 2, H / 2, D + DOOR_OFFSET]}>
          <mesh material={backDoorMat} castShadow>
            <boxGeometry args={[backDoorW - PT, doorH, 0.018]} />
          </mesh>
          <Handle
            style={handleStyle}
            panelWidthM={backDoorW}
            panelHeightM={H}
            variant="door"
            handleFinish={handleFinish}
          />
        </group>
      )}

      {/* Left wing door (+X face, room-facing), offset 3mm in front of body to avoid z-fighting */}
      {leftDoorW > 0.01 && (
        <group
          position={[D + DOOR_OFFSET, H / 2, D + leftDoorW / 2]}
          rotation={[0, Math.PI / 2, 0]}
        >
          <mesh material={leftDoorMat} castShadow>
            <boxGeometry args={[leftDoorW - PT, doorH, 0.018]} />
          </mesh>
          <Handle
            style={handleStyle}
            panelWidthM={leftDoorW}
            panelHeightM={H}
            variant="door"
            handleFinish={handleFinish}
          />
        </group>
      )}

      {/* Wall-level corner unit (same L-shape, mounted at WALL_MOUNT_Y) */}
      {corner.hasWallCorner && (
        <group position={[0, WALL_MOUNT_Y * CM, 0]}>
          {/* Back wing body */}
          <mesh position={[BW / 2, WH / 2, WD / 2]} material={wallBackWingCabinetMats} castShadow receiveShadow>
            <boxGeometry args={[BW, WH, WD]} />
          </mesh>
          {/* Left wing body */}
          <mesh position={[WD / 2, WH / 2, LW / 2]} material={wallLeftWingCabinetMats} castShadow receiveShadow>
            <boxGeometry args={[WD, WH, LW]} />
          </mesh>
          {isSelected && (
            <>
              <mesh position={[BW / 2, WH / 2, WD / 2]} material={selectionMat}>
                <boxGeometry args={[BW + 0.005, WH + 0.005, WD + 0.005]} />
              </mesh>
              <mesh position={[WD / 2, WH / 2, LW / 2]} material={selectionMat}>
                <boxGeometry args={[WD + 0.005, WH + 0.005, LW + 0.005]} />
              </mesh>
            </>
          )}
          {/* Back wing door */}
          {wWallBackDoorW > 0.01 && (
            <group position={[WD + wWallBackDoorW / 2, WH / 2, WD + DOOR_OFFSET]}>
              <mesh material={wallBackDoorPanelMat} castShadow>
                <boxGeometry args={[wWallBackDoorW - PT, wWallDoorH, 0.018]} />
              </mesh>
              <Handle
                style={handleStyle}
                panelWidthM={wWallBackDoorW}
                panelHeightM={WH}
                variant="door"
                handleFinish={handleFinish}
              />
            </group>
          )}
          {/* Left wing door */}
          {wWallLeftDoorW > 0.01 && (
            <group
              position={[WD + DOOR_OFFSET, WH / 2, WD + wWallLeftDoorW / 2]}
              rotation={[0, Math.PI / 2, 0]}
            >
              <mesh material={wallLeftDoorPanelMat} castShadow>
                <boxGeometry args={[wWallLeftDoorW - PT, wWallDoorH, 0.018]} />
              </mesh>
              <Handle
                style={handleStyle}
                panelWidthM={wWallLeftDoorW}
                panelHeightM={WH}
                variant="door"
                handleFinish={handleFinish}
              />
            </group>
          )}
        </group>
      )}
    </group>
  );
}

// ── Main composed component ───────────────────────────────────────────

export default function KitchenCabinets3D() {
  const config = useKitchenStore((s) => s.config);
  const ui = useKitchenStore((s) => s.ui);
  const selectBaseModule = useKitchenStore((s) => s.selectBaseModule);
  const selectWallModule = useKitchenStore((s) => s.selectWallModule);
  const selectIslandBaseModule = useKitchenStore((s) => s.selectIslandBaseModule);
  const selectIslandWallModule = useKitchenStore((s) => s.selectIslandWallModule);
  const selectLeftBaseModule = useKitchenStore((s) => s.selectLeftBaseModule);
  const selectLeftWallModule = useKitchenStore((s) => s.selectLeftWallModule);
  const selectCornerUnit = useKitchenStore((s) => s.selectCornerUnit);
  const setOrbitControlsEnabled = useKitchenStore((s) => s.setOrbitControlsEnabled);
  const availableHandleMaterials = useKitchenStore((s) => s.availableHandleMaterials);

  const handleFinish = useMemo((): KitchenMaterial | null => {
    const id = config.doors.handleMaterialId;
    if (!id) return null;
    return availableHandleMaterials.find((m) => m.id === id) ?? null;
  }, [config.doors.handleMaterialId, availableHandleMaterials]);

  const onCabinetPointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setOrbitControlsEnabled(false);
    },
    [setOrbitControlsEnabled],
  );

  const cabinetGrain = config.cabinetGrainDirection ?? "horizontal";
  const doorGrain = config.doorGrainDirection ?? "horizontal";
  const baseCabinetMat = useKitchenMaterial(config.cabinetMaterial, cabinetGrain);
  const baseDoorMat = useKitchenDoorMaterial(config.doors.material, doorGrain);

  const cu = config.cornerUnit;
  const lw = config.leftWall;
  const cornerBackW = cu.enabled ? cu.backWingWidthCm : 0;
  const cornerLeftW = cu.enabled ? cu.leftWingWidthCm : 0;

  // Calculate cumulative x offsets for base modules (shifted right when corner is enabled)
  const baseOffsets = useMemo(() => {
    const offsets: number[] = [];
    let x = cornerBackW;
    for (const m of config.baseModules) {
      offsets.push(x);
      x += m.width;
    }
    return offsets;
  }, [config.baseModules, cornerBackW]);

  const totalBaseWidth = useMemo(
    () => config.baseModules.reduce((sum, m) => sum + m.width, 0) + cornerBackW,
    [config.baseModules, cornerBackW],
  );

  // Wall modules: align them so their center matches base center
  const wallOffsets = useMemo(() => {
    const offsets: number[] = [];
    let x = cornerBackW;
    for (const m of config.wallModules) {
      offsets.push(x);
      x += m.width;
    }
    return offsets;
  }, [config.wallModules, cornerBackW]);

  // Left wall base/wall offsets (run along +Z starting after corner left wing)
  const leftBaseOffsets = useMemo(() => {
    if (!lw.enabled) return [] as number[];
    const o: number[] = [];
    let x = 0;
    for (const m of lw.baseModules) {
      o.push(x);
      x += m.width;
    }
    return o;
  }, [lw.baseModules, lw.enabled]);
  const leftWallOffsets = useMemo(() => {
    if (!lw.enabled) return [] as number[];
    const o: number[] = [];
    let x = 0;
    for (const m of lw.wallModules) {
      o.push(x);
      x += m.width;
    }
    return o;
  }, [lw.wallModules, lw.enabled]);
  const leftBaseW = lw.enabled ? lw.baseModules.reduce((s, m) => s + m.width, 0) : 0;
  const leftWallW = lw.enabled ? lw.wallModules.reduce((s, m) => s + m.width, 0) : 0;
  const leftWallStart = lw.enabled ? (leftBaseW - leftWallW) / 2 : 0;

  const totalWallWidth = useMemo(
    () => config.wallModules.reduce((sum, m) => sum + m.width, 0),
    [config.wallModules],
  );

  const wallStartOffset = (totalBaseWidth - totalWallWidth) / 2;

  const isl = config.island;
  const islandBaseW = isl.enabled
    ? isl.baseModules.reduce((s, m) => s + m.width, 0)
    : 0;
  const islandWallW = isl.enabled
    ? isl.wallModules.reduce((s, m) => s + m.width, 0)
    : 0;
  const islandBaseOffsets = useMemo(() => {
    if (!config.island.enabled) return [] as number[];
    const o: number[] = [];
    let x = 0;
    for (const m of config.island.baseModules) {
      o.push(x);
      x += m.width;
    }
    return o;
  }, [config.island.baseModules, config.island.enabled]);
  const islandWallOffsets = useMemo(() => {
    if (!config.island.enabled) return [] as number[];
    const o: number[] = [];
    let x = 0;
    for (const m of config.island.wallModules) {
      o.push(x);
      x += m.width;
    }
    return o;
  }, [config.island.wallModules, config.island.enabled]);
  const islandWallStart =
    isl.enabled ? (islandBaseW - islandWallW) / 2 : 0;

  const mainBaseRef = useMemo(
    () => ({
      refW_m: Math.max(totalBaseWidth * CM, 1e-6),
      refH_m: TOTAL_BASE_HEIGHT * CM,
    }),
    [totalBaseWidth],
  );

  const mainWallRef = useMemo(
    () => ({
      refW_m: Math.max(totalBaseWidth * CM, 1e-6),
      refH_m: WALL_CABINET_HEIGHT * CM,
    }),
    [totalBaseWidth],
  );

  const islandBaseRef = useMemo(
    () => ({
      refW_m: Math.max(islandBaseW * CM, 1e-6),
      refH_m: TOTAL_BASE_HEIGHT * CM,
    }),
    [islandBaseW],
  );

  const islandWallRef = useMemo(
    () => ({
      refW_m: Math.max(islandBaseW * CM, 1e-6),
      refH_m: WALL_CABINET_HEIGHT * CM,
    }),
    [islandBaseW],
  );

  const leftBaseRef = useMemo(
    () => ({
      refW_m: Math.max(leftBaseW * CM, 1e-6),
      refH_m: TOTAL_BASE_HEIGHT * CM,
    }),
    [leftBaseW],
  );

  const leftWallRef = useMemo(
    () => ({
      refW_m: Math.max(Math.max(leftWallW, leftBaseW) * CM, 1e-6),
      refH_m: WALL_CABINET_HEIGHT * CM,
    }),
    [leftWallW, leftBaseW],
  );

  const cornerTexRef = useMemo(
    () => ({
      refW_m: Math.max(Math.max(cu.backWingWidthCm, cu.leftWingWidthCm) * CM, 1e-6),
      refH_m: Math.max(cu.heightCm * CM, 1e-6),
    }),
    [cu.backWingWidthCm, cu.heightCm, cu.leftWingWidthCm],
  );

  const mainCenterX = (totalBaseWidth * CM) / 2;

  return (
    <group>
      {/* Base modules */}
      {config.baseModules.map((module, i) => (
        <BaseModule
          key={module.id}
          module={module}
          xOffset={baseOffsets[i]}
          isSelected={ui.selectedBaseModuleId === module.id}
          onClick={() => selectBaseModule(module.id)}
          onCabinetPointerDown={onCabinetPointerDown}
          dragMeta={{ run: "main-base", index: i }}
          baseCabinetMat={baseCabinetMat}
          baseDoorMat={baseDoorMat}
          cabinetGrain={cabinetGrain}
          doorGrain={doorGrain}
          refW_m={mainBaseRef.refW_m}
          refH_m={mainBaseRef.refH_m}
          handleStyle={config.doors.handle}
          handleFinish={handleFinish}
        />
      ))}

      {/* Wall modules */}
      {config.hasWallCabinets &&
        config.wallModules.map((module, i) => (
          <WallModule
            key={module.id}
            module={module}
            xOffset={wallStartOffset + wallOffsets[i]}
            isSelected={ui.selectedWallModuleId === module.id}
            onClick={() => selectWallModule(module.id)}
            onCabinetPointerDown={onCabinetPointerDown}
            dragMeta={{ run: "main-wall", index: i }}
            baseCabinetMat={baseCabinetMat}
            baseDoorMat={baseDoorMat}
            cabinetGrain={cabinetGrain}
            doorGrain={doorGrain}
            refW_m={mainWallRef.refW_m}
            refH_m={mainWallRef.refH_m}
            handleStyle={config.doors.handle}
            handleFinish={handleFinish}
          />
        ))}

      {/* Island run */}
      {isl?.enabled && isl.baseModules.length > 0 && (
        <group
          position={[
            mainCenterX + isl.offsetXCm * CM,
            0,
            isl.offsetZCm * CM,
          ]}
          rotation={[0, isl.rotationYRad, 0]}
        >
          {isl.baseModules.map((module, i) => (
            <BaseModule
              key={module.id}
              module={module}
              xOffset={islandBaseOffsets[i] ?? 0}
              isSelected={ui.selectedIslandBaseModuleId === module.id}
              onClick={() => selectIslandBaseModule(module.id)}
              onCabinetPointerDown={onCabinetPointerDown}
              dragMeta={{ run: "island-base", index: i }}
              baseCabinetMat={baseCabinetMat}
              baseDoorMat={baseDoorMat}
              cabinetGrain={cabinetGrain}
              doorGrain={doorGrain}
              refW_m={islandBaseRef.refW_m}
              refH_m={islandBaseRef.refH_m}
              handleStyle={config.doors.handle}
              handleFinish={handleFinish}
            />
          ))}
          {isl.hasWallCabinets &&
            isl.wallModules.map((module, i) => (
              <WallModule
                key={module.id}
                module={module}
                xOffset={islandWallStart + islandWallOffsets[i]}
                isSelected={ui.selectedIslandWallModuleId === module.id}
                onClick={() => selectIslandWallModule(module.id)}
                onCabinetPointerDown={onCabinetPointerDown}
                dragMeta={{ run: "island-wall", index: i }}
                baseCabinetMat={baseCabinetMat}
                baseDoorMat={baseDoorMat}
                cabinetGrain={cabinetGrain}
                doorGrain={doorGrain}
                refW_m={islandWallRef.refW_m}
                refH_m={islandWallRef.refH_m}
                handleStyle={config.doors.handle}
                handleFinish={handleFinish}
              />
            ))}
        </group>
      )}

      {/* Corner unit (L-shaped body at origin) */}
      {cu.enabled && (
        <CornerUnit3D
          corner={cu}
          baseCabinetMat={baseCabinetMat}
          baseDoorMat={baseDoorMat}
          cabinetGrain={cabinetGrain}
          doorGrain={doorGrain}
          refW_m={cornerTexRef.refW_m}
          refH_m={cornerTexRef.refH_m}
          handleStyle={config.doors.handle}
          handleFinish={handleFinish}
          isSelected={ui.selectedCornerUnit}
          onClick={() => selectCornerUnit()}
          onCabinetPointerDown={onCabinetPointerDown}
        />
      )}

      {/* Left wall cabinet run — two nested groups to map local +X→world +Z (stacking away
         from back wall) and local +Z→world +X (doors face into the room).
         Outer scale={[-1,1,1]} mirrors the inner rotation so both axes end up correct. */}
      {lw.enabled && lw.baseModules.length > 0 && (
        <group position={[0, 0, cornerLeftW * CM]} scale={[-1, 1, 1]}>
          <group rotation={[0, -Math.PI / 2, 0]}>
            {lw.baseModules.map((module, i) => (
              <BaseModule
                key={module.id}
                module={module}
                xOffset={leftBaseOffsets[i] ?? 0}
                isSelected={ui.selectedLeftBaseModuleId === module.id}
                onClick={() => selectLeftBaseModule(module.id)}
                onCabinetPointerDown={onCabinetPointerDown}
                dragMeta={{ run: "left-base", index: i }}
                baseCabinetMat={baseCabinetMat}
                baseDoorMat={baseDoorMat}
                cabinetGrain={cabinetGrain}
                doorGrain={doorGrain}
                refW_m={leftBaseRef.refW_m}
                refH_m={leftBaseRef.refH_m}
                handleStyle={config.doors.handle}
                handleFinish={handleFinish}
              />
            ))}
            {lw.hasWallCabinets &&
              lw.wallModules.map((module, i) => (
                <WallModule
                  key={module.id}
                  module={module}
                  xOffset={leftWallStart + leftWallOffsets[i]}
                  isSelected={ui.selectedLeftWallModuleId === module.id}
                  onClick={() => selectLeftWallModule(module.id)}
                  onCabinetPointerDown={onCabinetPointerDown}
                  dragMeta={{ run: "left-wall", index: i }}
                  baseCabinetMat={baseCabinetMat}
                  baseDoorMat={baseDoorMat}
                  cabinetGrain={cabinetGrain}
                  doorGrain={doorGrain}
                  refW_m={leftWallRef.refW_m}
                  refH_m={leftWallRef.refH_m}
                  handleStyle={config.doors.handle}
                  handleFinish={handleFinish}
                />
              ))}
          </group>
        </group>
      )}

      {/* Layout-only reference blocks (not priced) — body ghost + solid appliance front */}
      {config.designPlacements.map((p) => (
        <DesignPlacementBlock key={p.id} p={p} />
      ))}

      {/* Dimension labels */}
      {ui.showDimensions && totalBaseWidth > 0 && (
        <>
          <DimensionLabel
            text={`${totalBaseWidth} cm`}
            position={[
              totalBaseWidth * CM / 2,
              -0.12,
              Math.max(
                ...config.baseModules.map((m) => getEffectiveBaseDims(m).d * CM),
              ) + 0.08,
            ]}
          />
          <DimensionLabel
            text={`${TOTAL_BASE_HEIGHT} cm`}
            position={[
              -0.22,
              TOTAL_BASE_HEIGHT * CM / 2,
              Math.max(
                ...config.baseModules.map((m) => getEffectiveBaseDims(m).d * CM),
              ) / 2,
            ]}
          />
        </>
      )}

      {/* Per-module distance annotations for selected cabinets */}
      {ui.showDimensions && (
        <>
          <SelectedModuleDistances
            modules={config.baseModules}
            offsets={baseOffsets}
            selectedId={ui.selectedBaseModuleId}
            totalWidth={totalBaseWidth}
            runType="base"
            runStartOffset={0}
            maxDepthCm={Math.max(
              ...config.baseModules.map((m) => getEffectiveBaseDims(m).d),
              0,
            )}
          />
          {config.hasWallCabinets && (
            <SelectedModuleDistances
              modules={config.wallModules}
              offsets={wallOffsets}
              selectedId={ui.selectedWallModuleId}
              totalWidth={totalWallWidth}
              runType="wall"
              runStartOffset={wallStartOffset}
              maxDepthCm={Math.max(
                ...config.wallModules.map((m) => getEffectiveWallDims(m).d),
                0,
              )}
            />
          )}
        </>
      )}

      {/* Alignment guide lines while dragging wall items */}
      <WallAlignGuides guides={ui.wallAlignGuides} />
      <FloorAlignGuidesComponent guides={ui.floorAlignGuides} />
    </group>
  );
}
