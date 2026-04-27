"use client";

import { useContext, useMemo } from "react";
import * as THREE from "three";
import { useWardrobeStore } from "./store";
import { WardrobeRoomContext } from "./WardrobeRoomContext";
import {
  PANEL_THICKNESS,
  HANDLE_COLORS,
  getMaterial,
  INTERNAL_RENDER_FALLBACK,
  doorFrontExtraHeightCm,
  slidingDoorPanelWidthsCm,
  WARDROBE_FRONT_FACE_ROTATION_Z,
  hingedDoorCountForSection,
  hingedDoorsForSection,
  hingedSubdoorHandleSide,
  clampWardrobeBase,
  DEFAULT_WARDROBE_BASE,
  wardrobePlinthFrontDropCm,
  type WardrobeMaterial,
} from "./data";
import { useHandleTexture } from "../useHandleTexture";
import { useRealisticDoorMaterial, setWoodMapRepeatForPanel } from "./useRealisticMaterial";
import {
  useWardrobePanelPlacements,
  useSheetPanelInfoForMaterial,
} from "../sheet/useWardrobePanelPlacements";
import { planarMaterialForPanel } from "../sheet/renderHelpers";
import { hingedDoorPanelVerticalCm } from "../sheet/wardrobePanels";
import type { GrainDirection, HandleStyle, WardrobeSection } from "./types";

const CM = 0.01;
const PT = PANEL_THICKNESS * CM;
const DOOR_THICKNESS = 0.018;
/** In-plane clearance between door panels; slightly larger helps depth buffer at vertical seams. */
const DOOR_GAP = 0.0006;
/** Flush with the frame front face (z = D/2); polygon offset on door materials avoids z-fighting. */
const DOOR_FRONT_Z_EPSILON = DOOR_GAP;

function applyDoorPolygonOffset(m: THREE.MeshPhysicalMaterial): THREE.MeshPhysicalMaterial {
  m.polygonOffset = true;
  m.polygonOffsetFactor = -3;
  m.polygonOffsetUnits = -6;
  return m;
}

/** Break coplanar inner faces between adjacent hinged doors (same Z → shimmer at section seams). */
const HINGED_DOOR_Z_STAGGER_M = 0.00045;

const FRONT_TYPES = new Set(["drawer", "empty-section"]);

/** No drawer/empty-section fronts — matches a plain bay for shared handle height. */
const HINGED_HANDLE_REF_SECTION: WardrobeSection = {
  id: "__hinged-handle-ref__",
  width: 0,
  components: [],
};

function computeDoorReduction(section: WardrobeSection): number {
  let extent = 0;
  for (const comp of section.components) {
    if (FRONT_TYPES.has(comp.type)) {
      extent = Math.max(extent, comp.yPosition + comp.height);
    }
  }
  return extent * CM;
}

function hingedHandleSide(section: WardrobeSection, sectionIndex: number): "left" | "right" {
  if (section.hingedDoorHandleSide === "left") return "left";
  if (section.hingedDoorHandleSide === "right") return "right";
  return sectionIndex % 2 === 0 ? "right" : "left";
}

function DoorHandle({
  handleStyle,
  doorHeight,
  doorWidth,
  z,
  side,
  handleFinish,
}: {
  handleStyle: HandleStyle;
  doorHeight: number;
  doorWidth: number;
  z: number;
  side: "left" | "right" | "center";
  handleFinish?: WardrobeMaterial | null;
}) {
  if (handleStyle === "none") return null;
  const baseHw =
    HANDLE_COLORS[handleStyle as Exclude<HandleStyle, "none">] ?? HANDLE_COLORS["bar-steel"];
  const pbr = handleFinish
    ? {
        color: handleFinish.color,
        roughness: handleFinish.roughness,
        metalness: handleFinish.metalness,
      }
    : baseHw;
  const tex = useHandleTexture(handleFinish?.imageUrl);
  const showMap = Boolean(tex);
  const matColor = showMap ? "#ffffff" : pbr.color;
  const isKnob = handleStyle.startsWith("knob");
  const handleZ = z + 0.006;

  const xOffset =
    side === "left"
      ? -doorWidth / 2 + 0.025
      : side === "right"
        ? doorWidth / 2 - 0.025
        : 0;

  if (isKnob) {
    return (
      <group position={[xOffset, 0, handleZ]}>
        <mesh>
          <sphereGeometry args={[0.012, 16, 16]} />
          <meshPhysicalMaterial
            color={matColor}
            map={tex ?? undefined}
            roughness={pbr.roughness}
            metalness={pbr.metalness}
            clearcoat={0.4}
            clearcoatRoughness={0.1}
          />
        </mesh>
        <mesh position={[0, 0, -0.006]}>
          <cylinderGeometry args={[0.005, 0.006, 0.012, 12]} />
          <meshPhysicalMaterial
            color={matColor}
            map={tex ?? undefined}
            roughness={pbr.roughness}
            metalness={pbr.metalness}
          />
        </mesh>
      </group>
    );
  }

  const barLength = Math.min(doorHeight * 0.18, 0.22);

  return (
    <group position={[xOffset, 0, handleZ]}>
      <mesh rotation={[0, 0, 0]}>
        <cylinderGeometry args={[0.005, 0.005, barLength, 12]} />
        <meshPhysicalMaterial
          color={matColor}
          map={tex ?? undefined}
          roughness={pbr.roughness}
          metalness={pbr.metalness}
          clearcoat={0.4}
          clearcoatRoughness={0.1}
        />
      </mesh>
      <mesh position={[0, barLength / 2, -0.008]}>
        <boxGeometry args={[0.006, 0.006, 0.018]} />
        <meshPhysicalMaterial
          color={matColor}
          map={tex ?? undefined}
          roughness={pbr.roughness}
          metalness={pbr.metalness}
        />
      </mesh>
      <mesh position={[0, -barLength / 2, -0.008]}>
        <boxGeometry args={[0.006, 0.006, 0.018]} />
        <meshPhysicalMaterial
          color={matColor}
          map={tex ?? undefined}
          roughness={pbr.roughness}
          metalness={pbr.metalness}
        />
      </mesh>
    </group>
  );
}

function HingedDoorPanelRow({
  panelId,
  materialId,
  doorGrain,
  refW,
  refH,
  dw,
  dh,
  doorX,
  doorY,
  frontZ,
  handleStyle,
  handleSide,
  handleYOffset,
  handleFinish,
}: {
  panelId: string;
  materialId: string;
  doorGrain: GrainDirection;
  refW: number;
  refH: number;
  dw: number;
  dh: number;
  doorX: number;
  doorY: number;
  frontZ: number;
  handleStyle: HandleStyle;
  handleSide: "left" | "right";
  handleYOffset: number;
  handleFinish?: WardrobeMaterial | null;
}) {
  const placements = useWardrobePanelPlacements();
  const panelInfo = placements.get(panelId);
  const materialSheetHint = useSheetPanelInfoForMaterial(materialId);
  const sheetSource = panelInfo ?? materialSheetHint;
  const baseMaterial = useRealisticDoorMaterial(materialId, doorGrain, sheetSource);
  const panelMat = useMemo(() => {
    if (dh <= 0.01) return baseMaterial;

    // Sheet-UV sampling when the finish is a laminate/wood/worktop with an image.
    const info = panelInfo;
    if (info) {
      return applyDoorPolygonOffset(
        planarMaterialForPanel(baseMaterial as THREE.MeshPhysicalMaterial, info),
      );
    }

    // Legacy ref-based repeat for non-sheeted finishes (flat colors, glass,
    // mirror etc.) — preserves existing look.
    const mat = baseMaterial.clone() as THREE.MeshPhysicalMaterial;
    if (mat.map) {
      mat.map = mat.map.clone();
      setWoodMapRepeatForPanel(mat.map, dw, dh, refW, refH, doorGrain);
    }
    if (mat.bumpMap) {
      mat.bumpMap = mat.bumpMap.clone();
      setWoodMapRepeatForPanel(mat.bumpMap, dw, dh, refW, refH, doorGrain);
    }
    return applyDoorPolygonOffset(mat);
  }, [baseMaterial, panelInfo, dh, dw, refW, refH, doorGrain]);

  if (dh <= 0.01) return null;

  return (
    <group position={[doorX, doorY, frontZ]}>
      <group rotation={WARDROBE_FRONT_FACE_ROTATION_Z}>
        <mesh castShadow material={panelMat}>
          <boxGeometry args={[dw, dh, DOOR_THICKNESS]} />
        </mesh>
      </group>
      <group position={[0, handleYOffset, 0]}>
        <DoorHandle
          handleStyle={handleStyle}
          doorHeight={dh}
          doorWidth={dw}
          z={DOOR_THICKNESS / 2}
          side={handleSide}
          handleFinish={handleFinish}
        />
      </group>
    </group>
  );
}

function SlidingDoorPanelRow({
  panelId,
  materialId,
  doorGrain,
  refW,
  refH,
  slidePanelW,
  dh,
  position,
  handleStyle,
  handleFinish,
  slidingStripIndex,
  slidingStripCount,
}: {
  panelId: string;
  materialId: string;
  doorGrain: GrainDirection;
  refW: number;
  refH: number;
  slidePanelW: number;
  dh: number;
  position: [number, number, number];
  handleStyle: HandleStyle;
  handleFinish?: WardrobeMaterial | null;
  /** 0-based index for equal-width strip texture phase (door 1 → index 0). */
  slidingStripIndex: number;
  /** Total sliding doors when widths match (enables continuous grain). */
  slidingStripCount: number;
}) {
  const placements = useWardrobePanelPlacements();
  const panelInfo = placements.get(panelId);
  const materialSheetHint = useSheetPanelInfoForMaterial(materialId);
  const sheetSource = panelInfo ?? materialSheetHint;
  const baseMaterial = useRealisticDoorMaterial(materialId, doorGrain, sheetSource);
  const panelMat = useMemo(() => {
    if (dh <= 0.01) return baseMaterial;

    const info = panelInfo;
    if (info) {
      return applyDoorPolygonOffset(
        planarMaterialForPanel(baseMaterial as THREE.MeshPhysicalMaterial, info),
      );
    }

    const mat = baseMaterial.clone() as THREE.MeshPhysicalMaterial;
    const stripOpts =
      slidingStripCount > 1 && slidingStripIndex >= 0
        ? { slidingStripIndex, slidingStripCount }
        : undefined;
    if (mat.map) {
      mat.map = mat.map.clone();
      setWoodMapRepeatForPanel(mat.map, slidePanelW, dh, refW, refH, doorGrain, stripOpts);
    }
    if (mat.bumpMap) {
      mat.bumpMap = mat.bumpMap.clone();
      setWoodMapRepeatForPanel(mat.bumpMap, slidePanelW, dh, refW, refH, doorGrain, stripOpts);
    }
    return applyDoorPolygonOffset(mat);
  }, [
    baseMaterial,
    panelInfo,
    dh,
    slidePanelW,
    refW,
    refH,
    doorGrain,
    slidingStripIndex,
    slidingStripCount,
  ]);

  if (dh <= 0.01) return null;

  return (
    <group position={position}>
      <group rotation={WARDROBE_FRONT_FACE_ROTATION_Z}>
        <mesh castShadow material={panelMat}>
          <boxGeometry args={[slidePanelW, dh, DOOR_THICKNESS]} />
        </mesh>
      </group>
      <DoorHandle
        handleStyle={handleStyle}
        doorHeight={dh}
        doorWidth={slidePanelW}
        z={DOOR_THICKNESS / 2}
        side="center"
        handleFinish={handleFinish}
      />
    </group>
  );
}

export default function WardrobeDoors3D() {
  const embed = useContext(WardrobeRoomContext);
  const storeConfig = useWardrobeStore((s) => s.config);
  const config = embed?.config ?? storeConfig;
  const frame = config.frame;
  const sections = config.sections;
  const doors = config.doors;
  const showDoorsFromStore = useWardrobeStore((s) => s.ui.showDoors);
  const showDoors = embed ? true : showDoorsFromStore;
  const doorGrain = config.doorGrainDirection ?? "horizontal";
  const storeSliding = useWardrobeStore((s) => s.availableSlidingMechanisms);
  const storeHandleMats = useWardrobeStore((s) => s.availableHandleMaterials);
  const slidingMechanisms = embed?.availableSlidingMechanisms ?? storeSliding;
  const availableHandleMaterials = embed?.availableHandleMaterials ?? storeHandleMats;

  const handleFinish = useMemo((): WardrobeMaterial | null => {
    const id = doors.handleMaterialId;
    if (!id) return null;
    return availableHandleMaterials.find((m) => m.id === id) ?? null;
  }, [doors.handleMaterialId, availableHandleMaterials]);

  const panelMatIds = doors.doorPanelMaterialIds;
  const panelGrainDirs = doors.doorPanelGrainDirections;
  const grainForPanel = (idx: number) => panelGrainDirs[idx] ?? doorGrain;

  const isNeutralSlidingMechanism = doors.slidingMechanismId === INTERNAL_RENDER_FALLBACK.id;

  /** Brushed-aluminum look for the built-in neutral / default track (not beige matte). */
  const neutralHardwareMatProps = {
    color: "#b4b9c0",
    roughness: 0.36,
    metalness: 0.7,
  } as const;

  const plinthDropCm = wardrobePlinthFrontDropCm(clampWardrobeBase(config.base ?? DEFAULT_WARDROBE_BASE));

  const trackAppearance = useMemo(() => {
    if (isNeutralSlidingMechanism) {
      return neutralHardwareMatProps;
    }
    const m = getMaterial(doors.slidingMechanismId, slidingMechanisms);
    return {
      color: m.color,
      roughness: Math.min(m.roughness + 0.08, 0.48),
      metalness: Math.max(m.metalness, 0.42),
    };
  }, [doors.slidingMechanismId, slidingMechanisms, isNeutralSlidingMechanism]);

  const W = frame.width * CM;
  const H = frame.height * CM;
  const D = frame.depth * CM;
  const frontZ = D / 2 + DOOR_THICKNESS / 2 + DOOR_FRONT_Z_EPSILON;
  const refW = (frame.width - 2 * PANEL_THICKNESS) * CM;
  const refH = (frame.height - 2 * PANEL_THICKNESS) * CM;

  const hingedDoorCenterX = useMemo(() => {
    if (!showDoors || doors.type !== "hinged") return [];
    let xAcc = PT;
    return sections.map((section) => {
      const sw = section.width * CM;
      const cx = xAcc + sw / 2;
      xAcc += sw + PT;
      return cx;
    });
  }, [doors.type, sections, showDoors]);

  if (doors.type === "none" || !showDoors) return null;

  if (doors.type === "hinged") {
    const { doorCenterYCm: refDoorCenterYCm } = hingedDoorPanelVerticalCm(
      HINGED_HANDLE_REF_SECTION,
      frame.height,
      plinthDropCm,
    );
    /** World Y of handle center — same for every bay (sections with drawers used a different doorY + old offset). */
    const refDoorY = refDoorCenterYCm * CM;

    return (
      <group>
        {sections.map((section, idx) => {
          const sw = section.width * CM;
          const bayCenterX = hingedDoorCenterX[idx] ?? PT + sw / 2;
          const { dhCm, doorCenterYCm } = hingedDoorPanelVerticalCm(section, frame.height, plinthDropCm);
          const dh = dhCm * CM;
          const doorY = doorCenterYCm * CM;
          const handleYOffset = refDoorY - doorY;
          const matId =
            panelMatIds[idx] ?? panelMatIds[0] ?? INTERNAL_RENDER_FALLBACK.id;
          const zStagger =
            sections.length > 1 ? (idx % 2 === 0 ? 1 : -1) * HINGED_DOOR_Z_STAGGER_M : 0;

          const n = hingedDoorCountForSection(section.hingedDoorCount);
          const layout = hingedDoorsForSection(section.width, idx, sections.length, n);
          const dw = layout.doorWidthCm * CM;

          return (
            <group key={section.id}>
              {layout.doorCenterOffsetsCm.map((offsetCm, doorIdx) => {
                const doorX = bayCenterX + offsetCm * CM;
                const handleSide =
                  n === 1
                    ? hingedHandleSide(section, idx)
                    : hingedSubdoorHandleSide(doorIdx, n);
                return (
                  <HingedDoorPanelRow
                    key={`${section.id}.${doorIdx}`}
                    panelId={`door.hinged.${idx}.${doorIdx}`}
                    materialId={matId}
                    doorGrain={grainForPanel(idx)}
                    refW={refW}
                    refH={refH}
                    dw={dw}
                    dh={dh}
                    doorX={doorX}
                    doorY={doorY}
                    frontZ={frontZ + zStagger}
                    handleStyle={doors.handle}
                    handleSide={handleSide}
                    handleYOffset={handleYOffset}
                    handleFinish={handleFinish}
                  />
                );
              })}
            </group>
          );
        })}
      </group>
    );
  }

  // Sliding doors — reduce by the max front-height across sections
  const maxReduction = Math.max(...sections.map(computeDoorReduction));
  const doorCount = Math.max(2, panelMatIds.length);
  const layout = slidingDoorPanelWidthsCm(frame.width, doorCount);
  /** Full front span (outer stiles to outer stiles), same plane as hinged doors. */
  const spanW = layout.spanW * CM;
  const overlap = layout.overlap * CM;
  const doorW = layout.doorW * CM;
  const slidePanelW = layout.slidePanelW * CM;
  const panels: { x: number; z: number }[] = [];
  for (let i = 0; i < doorCount; i++) {
    const xPos = DOOR_GAP + slidePanelW / 2 + i * (doorW - overlap);
    const zOff = i % 2 === 0 ? 0 : DOOR_THICKNESS + 0.002;
    panels.push({ x: xPos, z: frontZ + zOff });
  }

  const maxReductionCm = maxReduction / CM;
  const { dhExtraCm: slideDhExtraCm, centerYShiftCm: slideCenterYShiftCm } =
    doorFrontExtraHeightCm(maxReductionCm);
  const slideDhExtra = slideDhExtraCm * CM;
  const slideDoorYShift = slideCenterYShiftCm * CM;
  const plinthSlideCm = plinthDropCm > 0 && maxReduction <= 1e-9 ? plinthDropCm : 0;
  const plinthSlideM = plinthSlideCm * CM;
  let dh = H - PT - DOOR_GAP * 2 - maxReduction + slideDhExtra + plinthSlideM;
  if (dh <= 0.01) return null;
  let slideDoorY = maxReduction / 2 + H / 2 + slideDoorYShift - plinthSlideM / 2;

  const maxTopM = H - DOOR_GAP;
  let topM = slideDoorY + dh / 2;
  if (topM > maxTopM + 1e-6) {
    const delta = topM - maxTopM;
    dh -= delta;
    slideDoorY -= delta / 2;
  }
  if (dh <= 0.01) return null;

  /** Top track only — recessed under the top panel, inside the carcass (not in front of doors). Visible from above, not from the front. */
  const trackZ = D / 2 - 0.038;
  const trackY = H - PT - 0.011;

  const doorTopY = slideDoorY + dh / 2;

  return (
    <group>
      <mesh position={[W / 2, trackY, trackZ]} castShadow>
        <boxGeometry args={[Math.max(0.05, spanW - 0.006), 0.022, 0.028]} />
        <meshStandardMaterial
          color={trackAppearance.color}
          roughness={trackAppearance.roughness}
          metalness={trackAppearance.metalness}
        />
      </mesh>
      {isNeutralSlidingMechanism && (
        <group>
          {/* Visible top rail along the opening — reads as neutral aluminum track from the front */}
          <mesh position={[W / 2, doorTopY + 0.006, frontZ]} castShadow>
            <boxGeometry args={[spanW - 0.016, 0.011, 0.02]} />
            <meshStandardMaterial
              color={neutralHardwareMatProps.color}
              roughness={neutralHardwareMatProps.roughness}
              metalness={neutralHardwareMatProps.metalness}
            />
          </mesh>
          {/* Small carriage / roller blocks at the top of each panel */}
          {panels.map((p, i) => (
            <mesh
              key={`neutral-hanger-${i}`}
              position={[p.x, doorTopY - 0.005, p.z + 0.003]}
              castShadow
            >
              <boxGeometry args={[Math.min(slidePanelW * 0.2, 0.035), 0.012, 0.014]} />
              <meshStandardMaterial
                color={neutralHardwareMatProps.color}
                roughness={neutralHardwareMatProps.roughness}
                metalness={neutralHardwareMatProps.metalness}
              />
            </mesh>
          ))}
        </group>
      )}
      {panels.map((p, i) => {
        const matId =
          panelMatIds[i] ?? panelMatIds[0] ?? INTERNAL_RENDER_FALLBACK.id;
        return (
          <SlidingDoorPanelRow
            key={i}
            panelId={`door.sliding.${i}`}
            materialId={matId}
            doorGrain={grainForPanel(i)}
            refW={refW}
            refH={refH}
            slidePanelW={slidePanelW}
            dh={dh}
            position={[p.x, slideDoorY, p.z]}
            handleStyle={doors.handle}
            handleFinish={handleFinish}
            slidingStripIndex={i}
            slidingStripCount={doorCount}
          />
        );
      })}
    </group>
  );
}
