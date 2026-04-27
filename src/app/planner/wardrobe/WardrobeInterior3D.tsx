"use client";

import { useContext, useMemo } from "react";
import type React from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useWardrobeStore } from "./store";
import { WardrobeRoomContext } from "./WardrobeRoomContext";
import {
  PANEL_THICKNESS,
  HANDLE_COLORS,
  doorFrontExtraWidthCm,
  wardrobeDoorPanelMaterialIdForSection,
  wardrobeDoorPanelGrainForSection,
  WARDROBE_FRONT_FACE_ROTATION_Z,
  shelfBoardWidthM,
  shelfBoardDepthM,
  shelfDepthOffsetM,
  clampWardrobeBase,
  DEFAULT_WARDROBE_BASE,
  wardrobePlinthFrontDropCm,
  type WardrobeMaterial,
} from "./data";
import { useHandleTexture } from "../useHandleTexture";
import {
  useRealisticMaterial,
  useRealisticDoorMaterial,
  setWoodMapRepeatForPanel,
} from "./useRealisticMaterial";
import {
  useWardrobePanelPlacements,
  useSheetPanelInfoForMaterial,
} from "../sheet/useWardrobePanelPlacements";
import { boxMaterialsForPanel, planarMaterialForPanel } from "../sheet/renderHelpers";
import {
  drawerFrontLayoutM,
  type DrawerFrontVisibleHeightOptions,
} from "../sheet/wardrobePanels";
import type { WardrobeComponent, WardrobeSection, GrainDirection } from "./types";

const CM = 0.01;
const PT = PANEL_THICKNESS * CM;
/** Match WardrobeDoors3D — drawer fronts share the door plane and thickness. */
const DOOR_THICKNESS = 0.018;
const DOOR_GAP = 0.0006;
/** Match WardrobeDoors3D — flush to outer frame front; polygon offset on drawer fronts avoids z-fighting. */
const DOOR_FRONT_Z_EPSILON = DOOR_GAP;

function applyDrawerFrontPolygonOffset(m: THREE.MeshPhysicalMaterial): THREE.MeshPhysicalMaterial {
  m.polygonOffset = true;
  m.polygonOffsetFactor = -1;
  m.polygonOffsetUnits = -2;
  return m;
}
const HIGHLIGHT_COLOR = "#5090e0";

interface SectionInteriorProps {
  section: WardrobeSection;
  sectionIndex: number;
  sectionCount: number;
  sectionX: number;
  frameWidth: number;
  frameHeight: number;
  frameDepth: number;
  selectedComponentId: string | null;
  onClickComponent: (compId: string) => void;
  interiorMaterial: THREE.Material;
  highlightMaterial: THREE.Material;
  doorMatId: string;
  doorGrain: GrainDirection;
  interiorGrain: GrainDirection;
  handleColor: string;
  handleRoughness: number;
  handleMetalness: number;
  handleFinish: WardrobeMaterial | null;
}

/**
 * Box mesh for interior parts (shelves, shoe racks).
 * When `panelId` matches a sheeted-material placement, the texture samples
 * that sheet sub-rect. Otherwise it falls back to legacy refW/refH tiling
 * so non-image / non-sheeted materials keep their existing appearance.
 */
function InteriorTexturedBox({
  baseMat,
  grain,
  refW,
  refH,
  boxW,
  boxH,
  boxD,
  panelId,
  ...meshProps
}: Omit<React.ComponentProps<"mesh">, "material"> & {
  baseMat: THREE.MeshPhysicalMaterial;
  grain: GrainDirection;
  refW: number;
  refH: number;
  boxW: number;
  boxH: number;
  boxD: number;
  panelId?: string;
}) {
  const placements = useWardrobePanelPlacements();
  const info = panelId ? placements.get(panelId) : null;
  const mats = useMemo(
    () =>
      boxMaterialsForPanel(baseMat, info, {
        boxW,
        boxH,
        boxD,
        refW,
        refH,
        grain,
      }),
    [baseMat, info, boxW, boxH, boxD, refW, refH, grain],
  );
  return <mesh {...meshProps} material={mats} />;
}

/**
 * Laminated shelf volume: one material on the whole box (not a 6-entry
 * `material` array). Per-face material arrays on `BoxGeometry` have been
 * seen to render fully transparent in the browser; a single
 * `MeshPhysicalMaterial` is reliable. Texture repeat follows the top face
 * (width × depth); edges share the same map.
 */
function ShelfVolumeMesh({
  interiorPhy,
  interiorGrain,
  refW,
  refH,
  shelfW,
  shelfH,
  shelfD,
  cx,
  y,
  zOffset = 0,
}: {
  interiorPhy: THREE.MeshPhysicalMaterial;
  interiorGrain: GrainDirection;
  refW: number;
  refH: number;
  shelfW: number;
  shelfH: number;
  shelfD: number;
  cx: number;
  y: number;
  zOffset?: number;
}) {
  const mat = useMemo(() => {
    const m = interiorPhy.clone() as THREE.MeshPhysicalMaterial;
    m.transparent = false;
    m.opacity = 1;
    m.transmission = 0;
    m.thickness = 0;
    if (m.map) {
      m.map = m.map.clone();
      setWoodMapRepeatForPanel(m.map, shelfW, shelfD, refW, refH, interiorGrain);
    }
    if (m.bumpMap) {
      m.bumpMap = m.bumpMap.clone();
      setWoodMapRepeatForPanel(m.bumpMap, shelfW, shelfD, refW, refH, interiorGrain);
    }
    if (m.normalMap) {
      m.normalMap = m.normalMap.clone();
      setWoodMapRepeatForPanel(m.normalMap, shelfW, shelfD, refW, refH, interiorGrain);
    }
    if (m.roughnessMap) {
      m.roughnessMap = m.roughnessMap.clone();
      setWoodMapRepeatForPanel(m.roughnessMap, shelfW, shelfD, refW, refH, interiorGrain);
    }
    m.needsUpdate = true;
    return m;
  }, [interiorPhy, shelfW, shelfD, refW, refH, interiorGrain]);

  return (
    <mesh position={[cx, y + shelfH / 2, zOffset]} material={mat} castShadow receiveShadow>
      <boxGeometry args={[shelfW, shelfH, shelfD]} />
    </mesh>
  );
}

function SectionInterior(props: SectionInteriorProps) {
  const { section, sectionX, sectionIndex } = props;
  const SW = section.width * CM;
  /** Interior working depth (inset from outer box) — shelves, drawer boxes, etc. */
  const D = props.frameDepth * CM - 0.02;
  /** Outer carcass depth (m) — drawer/door fronts must align with WardrobeFrame3D / WardrobeDoors3D at z = D/2. */
  const outerDepthM = props.frameDepth * CM;

  return (
    <group position={[sectionX, 0, 0]}>
      {section.components.map((comp, cIdx) => (
        <ComponentWithMaterial
          key={comp.id}
          comp={comp}
          sectionComponents={section.components}
          sectionIndex={sectionIndex}
          sectionCount={props.sectionCount}
          componentIndex={cIdx}
          sectionWidth={SW}
          depth={D}
          outerDepthM={outerDepthM}
          frameWidth={props.frameWidth}
          frameHeight={props.frameHeight}
          selected={comp.id === props.selectedComponentId}
          onClick={() => props.onClickComponent(comp.id)}
          interiorMaterial={props.interiorMaterial}
          highlightMaterial={props.highlightMaterial}
          doorMatId={props.doorMatId}
          doorGrain={props.doorGrain}
          interiorGrain={props.interiorGrain}
          handleColor={props.handleColor}
          handleRoughness={props.handleRoughness}
          handleMetalness={props.handleMetalness}
          handleFinish={props.handleFinish}
          frameDepthCm={props.frameDepth}
        />
      ))}
    </group>
  );
}

interface ComponentWithMaterialProps {
  comp: WardrobeComponent;
  sectionComponents: WardrobeComponent[];
  sectionIndex: number;
  sectionCount: number;
  componentIndex: number;
  sectionWidth: number;
  depth: number;
  /** Frame depth (cm) — shelf board depth & placement. */
  frameDepthCm: number;
  /** Full frame depth (m), same as WardrobeDoors3D `D` — for front panels only. */
  outerDepthM: number;
  frameWidth: number;
  frameHeight: number;
  selected: boolean;
  onClick: () => void;
  interiorMaterial: THREE.Material;
  highlightMaterial: THREE.Material;
  doorMatId: string;
  doorGrain: GrainDirection;
  interiorGrain: GrainDirection;
  handleColor: string;
  handleRoughness: number;
  handleMetalness: number;
  handleFinish: WardrobeMaterial | null;
}

function ComponentWithMaterial(props: ComponentWithMaterialProps) {
  const doorsType = useWardrobeStore((s) => s.config.doors.type);
  const sectionsAll = useWardrobeStore((s) => s.config.sections);
  const wardrobeBase = useWardrobeStore((s) => s.config.base);
  const drawerFrontOpts: DrawerFrontVisibleHeightOptions = useMemo(() => {
    let slidingMax = 0;
    if (doorsType === "sliding") {
      for (const sec of sectionsAll) {
        for (const c of sec.components) {
          if (c.type === "drawer" || c.type === "empty-section") {
            slidingMax = Math.max(slidingMax, c.yPosition + c.height);
          }
        }
      }
    }
    return {
      frameHeightCm: props.frameHeight,
      doorsType,
      slidingMaxFrontExtentCm: slidingMax,
      plinthFrontDropCm: wardrobePlinthFrontDropCm(clampWardrobeBase(wardrobeBase ?? DEFAULT_WARDROBE_BASE)),
    };
  }, [props.frameHeight, doorsType, sectionsAll, wardrobeBase]);

  const drawerHandleYOffset = useMemo(() => {
    if (props.comp.type !== "drawer") return 0;
    const refIdx = sectionsAll.findIndex((sec) => sec.components.some((c) => c.type === "drawer"));
    if (refIdx < 0 || refIdx === props.sectionIndex) return 0;

    const opts = drawerFrontOpts;
    const refSec = sectionsAll[refIdx]!;
    const refDrawers = refSec.components
      .map((c, i) => ({ c, i }))
      .filter((x): x is { c: WardrobeComponent; i: number } => x.c.type === "drawer")
      .sort((a, b) => a.c.yPosition - b.c.yPosition || a.i - b.i);
    const myDrawers = props.sectionComponents
      .map((c, i) => ({ c, i }))
      .filter((x): x is { c: WardrobeComponent; i: number } => x.c.type === "drawer")
      .sort((a, b) => a.c.yPosition - b.c.yPosition || a.i - b.i);
    const tier = myDrawers.findIndex((x) => x.i === props.componentIndex);
    if (tier < 0 || tier >= refDrawers.length) return 0;

    const refEntry = refDrawers[tier]!;
    const { bottomFrontM: rbf, frontHM: rh } = drawerFrontLayoutM(
      refSec.components,
      refEntry.i,
      opts,
    );
    const { bottomFrontM: mbf, frontHM: mh } = drawerFrontLayoutM(
      props.sectionComponents,
      props.componentIndex,
      opts,
    );
    return rbf + rh / 2 - (mbf + mh / 2);
  }, [
    props.comp.type,
    props.sectionIndex,
    props.componentIndex,
    props.sectionComponents,
    sectionsAll,
    drawerFrontOpts,
  ]);

  // Match `wardrobePanels.ts` effectiveFrontGrain: hinged + vertical section grain
  // forces drawer fronts to use the section door grain so sheet strips map 1:1 in 3D.
  const defaultGrain = props.comp.grainDirection ?? props.doorGrain;
  const grain =
    props.comp.type === "drawer" &&
    doorsType === "hinged" &&
    props.doorGrain === "vertical"
      ? props.doorGrain
      : defaultGrain;
  const placements = useWardrobePanelPlacements();
  const drawerPanelId = `interior.drawer.${props.sectionIndex}.${props.componentIndex}`;
  const drawerPanelInfo =
    props.comp.type === "drawer" ? placements.get(drawerPanelId) : null;
  const doorMaterialSheetHint = useSheetPanelInfoForMaterial(props.doorMatId);
  const doorSheetSource = drawerPanelInfo ?? doorMaterialSheetHint;
  const baseMaterial = useRealisticDoorMaterial(props.doorMatId, grain, doorSheetSource);

  const drawerFrontMaterial = useMemo(() => {
    if (props.comp.type !== "drawer") return baseMaterial;

    // Prefer sheet-UV sampling when a packer placement exists — each drawer
    // front then samples a unique sub-rect of the material's virtual sheet.
    const info = drawerPanelInfo;
    if (info) {
      return applyDrawerFrontPolygonOffset(
        planarMaterialForPanel(baseMaterial as THREE.MeshPhysicalMaterial, info),
      );
    }

    // Legacy path for non-sheeted materials (no image or type outside the
    // sheet-cut allow-list): keep the previous ref-based repeat.
    const mat = baseMaterial.clone() as THREE.MeshPhysicalMaterial;
    const refW = (props.frameWidth - PANEL_THICKNESS * 2) * CM;
    const refH = (props.frameHeight - PANEL_THICKNESS * 2) * CM;
    const extraW = doorFrontExtraWidthCm(props.sectionIndex, props.sectionCount) * CM;
    const frontW = props.sectionWidth + PT - DOOR_GAP * 2 + extraW;
    const { frontHM } = drawerFrontLayoutM(
      props.sectionComponents,
      props.componentIndex,
      drawerFrontOpts,
    );
    const frontH = frontHM;
    // Same repeat scale as hinged doors (WardrobeDoors3D). Old drawer-only
    // width/height multipliers over-stretched UVs and made the laminate look soft.
    if (mat.map) {
      mat.map = mat.map.clone();
      setWoodMapRepeatForPanel(mat.map, frontW, frontH, refW, refH, grain);
    }
    if (mat.bumpMap) {
      mat.bumpMap = mat.bumpMap.clone();
      setWoodMapRepeatForPanel(mat.bumpMap, frontW, frontH, refW, refH, grain);
    }
    return applyDrawerFrontPolygonOffset(mat);
  }, [
    baseMaterial,
    grain,
    props.comp.height,
    props.comp.type,
    props.frameHeight,
    props.frameWidth,
    props.sectionWidth,
    props.sectionIndex,
    props.sectionCount,
    props.componentIndex,
    props.sectionComponents,
    drawerPanelInfo,
    drawerFrontOpts,
  ]);

  return (
    <ComponentMesh
      comp={props.comp}
      sectionComponents={props.sectionComponents}
      sectionIndex={props.sectionIndex}
      sectionCount={props.sectionCount}
      componentIndex={props.componentIndex}
      sectionWidth={props.sectionWidth}
      depth={props.depth}
      frameDepthCm={props.frameDepthCm}
      outerDepthM={props.outerDepthM}
      selected={props.selected}
      onClick={props.onClick}
      interiorMaterial={props.interiorMaterial}
      drawerFrontMaterial={drawerFrontMaterial}
      highlightMaterial={props.highlightMaterial}
      interiorGrain={props.interiorGrain}
      frameWidth={props.frameWidth}
      frameHeight={props.frameHeight}
      drawerFrontOpts={drawerFrontOpts}
      handleColor={props.handleColor}
      handleRoughness={props.handleRoughness}
      handleMetalness={props.handleMetalness}
      handleFinish={props.handleFinish}
      drawerHandleYOffset={drawerHandleYOffset}
    />
  );
}

interface ComponentMeshProps {
  comp: WardrobeComponent;
  sectionComponents: WardrobeComponent[];
  sectionIndex: number;
  sectionCount: number;
  componentIndex: number;
  sectionWidth: number;
  depth: number;
  frameDepthCm: number;
  outerDepthM: number;
  selected: boolean;
  onClick: () => void;
  interiorMaterial: THREE.Material;
  drawerFrontMaterial: THREE.Material;
  highlightMaterial: THREE.Material;
  interiorGrain: GrainDirection;
  frameWidth: number;
  frameHeight: number;
  drawerFrontOpts: DrawerFrontVisibleHeightOptions;
  handleColor: string;
  handleRoughness: number;
  handleMetalness: number;
  handleFinish: WardrobeMaterial | null;
  drawerHandleYOffset: number;
}

function ComponentMesh({
  comp,
  sectionComponents,
  sectionIndex,
  sectionCount,
  componentIndex,
  sectionWidth,
  depth,
  frameDepthCm,
  outerDepthM,
  selected,
  onClick,
  interiorMaterial,
  drawerFrontMaterial,
  highlightMaterial,
  interiorGrain,
  frameWidth,
  frameHeight,
  drawerFrontOpts,
  handleColor,
  handleRoughness,
  handleMetalness,
  handleFinish,
  drawerHandleYOffset,
}: ComponentMeshProps) {
  const handleTex = useHandleTexture(handleFinish?.imageUrl);
  const showHandleMap = Boolean(handleTex);
  const y = PT + comp.yPosition * CM;
  const cx = sectionWidth / 2;
  const refW = (frameWidth - PANEL_THICKNESS * 2) * CM;
  const refH = (frameHeight - PANEL_THICKNESS * 2) * CM;
  const interiorPhy = interiorMaterial as THREE.MeshPhysicalMaterial;
  const frontMat = selected ? highlightMaterial : drawerFrontMaterial;
  const rodColor = selected ? "#6cb0f0" : "#b0b0b0";
  const wireColor = selected ? HIGHLIGHT_COLOR : "#999";
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onClick();
  };

  switch (comp.type) {
    /* ── Shelf ─────────────────────────────────────────── */
    case "shelf": {
      const shelfH = comp.height * CM;
      const sectionWidthCm = sectionWidth / CM;
      const shelfW = shelfBoardWidthM(sectionWidthCm, comp.shelfWidthCm);
      const shelfD = shelfBoardDepthM(depth, frameDepthCm, comp.shelfDepthCm);
      const zOff = shelfDepthOffsetM(depth, shelfD, comp.shelfDepthPlacement);
      return (
        <group onClick={handleClick}>
          {selected ? (
            <mesh
              position={[cx, y + shelfH / 2, zOff]}
              material={highlightMaterial}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[shelfW, shelfH, shelfD]} />
            </mesh>
          ) : (
            <ShelfVolumeMesh
              interiorPhy={interiorPhy}
              interiorGrain={interiorGrain}
              refW={refW}
              refH={refH}
              shelfW={shelfW}
              shelfH={shelfH}
              shelfD={shelfD}
              cx={cx}
              y={y}
              zOffset={zOff}
            />
          )}
        </group>
      );
    }

    /* ── Drawer ────────────────────────────────────────── */
    case "drawer": {
      const h = comp.height * CM;
      const boxW = sectionWidth - 0.005;
      /** Span interior back to just behind the drawer front inner face (same plane as hinged doors). */
      const boxD = outerDepthM - 0.012 + DOOR_FRONT_Z_EPSILON;
      const boxH = h - 0.003;
      /** Laminated side / back panel thickness (matches carcass PANEL_THICKNESS). */
      const wingW = PT;
      const innerFloorW = Math.max(boxW - 2 * wingW, 0.02);
      const { bottomFrontM: bottomFrontY, frontHM } = drawerFrontLayoutM(
        sectionComponents,
        componentIndex,
        drawerFrontOpts,
      );
      const frontH = frontHM;
      const handleY = bottomFrontY + frontH / 2 + drawerHandleYOffset;
      /** Same overlay width as hinged doors — outer stiles + vertical dividers. */
      const extraW = doorFrontExtraWidthCm(sectionIndex, sectionCount) * CM;
      const frontW = sectionWidth + PT - DOOR_GAP * 2 + extraW;
      const frontZ = outerDepthM / 2 + DOOR_THICKNESS / 2 + DOOR_FRONT_Z_EPSILON;
      const handleW = Math.min(frontW * 0.4, 0.12);
      const handleZ = frontZ + DOOR_THICKNESS / 2 + 0.003;
      const hp = handleFinish
        ? {
            color: handleFinish.color,
            roughness: handleFinish.roughness,
            metalness: handleFinish.metalness,
          }
        : { color: handleColor, roughness: handleRoughness, metalness: handleMetalness };
      const hMatColor = showHandleMap ? "#ffffff" : hp.color;
      /** Center Z so drawer box spans from interior back to front opening (U-shaped carcass). */
      const drawerZ = -depth / 2 + boxD / 2 + 0.001;
      const drawerY = y + boxH / 2 + 0.001;
      /** Back panel sits flush with interior back; thin in Z. */
      const backZ = drawerZ - boxD / 2 + wingW / 2;
      const boxShellMat = selected ? highlightMaterial : interiorMaterial;

      return (
        <group onClick={handleClick}>
          {/* Drawer box: left / right sides + back */}
          <mesh
            position={[cx - boxW / 2 + wingW / 2, drawerY, drawerZ]}
            material={boxShellMat}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[wingW, boxH, boxD]} />
          </mesh>
          <mesh
            position={[cx + boxW / 2 - wingW / 2, drawerY, drawerZ]}
            material={boxShellMat}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[wingW, boxH, boxD]} />
          </mesh>
          <mesh position={[cx, drawerY, backZ]} material={boxShellMat} castShadow receiveShadow>
            <boxGeometry args={[innerFloorW, boxH, wingW]} />
          </mesh>
          {/* Drawer bottom — laminated panel in the interior finish. */}
          <mesh
            position={[cx, y + 0.001, drawerZ]}
            material={selected ? highlightMaterial : interiorMaterial}
            receiveShadow
          >
            <boxGeometry args={[innerFloorW - 0.002, 0.003, boxD - 0.002]} />
          </mesh>
          {/* Front panel — BoxGeometry like doors; π around Z flips L↔R on the face without touching UV/material. */}
          <group position={[cx, bottomFrontY + frontH / 2, frontZ]} rotation={WARDROBE_FRONT_FACE_ROTATION_Z}>
            <mesh material={frontMat} castShadow receiveShadow>
              <boxGeometry args={[frontW, frontH, DOOR_THICKNESS]} />
            </mesh>
          </group>
          {/* Handle bar */}
          <mesh position={[cx, handleY, handleZ]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.003, 0.003, handleW, 12]} />
            <meshPhysicalMaterial
              color={hMatColor}
              map={handleTex ?? undefined}
              roughness={hp.roughness}
              metalness={hp.metalness}
              clearcoat={0.4}
              clearcoatRoughness={0.1}
            />
          </mesh>
          {/* Handle brackets */}
          <mesh position={[cx - handleW / 2, handleY, handleZ - 0.005]}>
            <boxGeometry args={[0.004, 0.004, 0.012]} />
            <meshPhysicalMaterial
              color={hMatColor}
              map={handleTex ?? undefined}
              roughness={hp.roughness}
              metalness={hp.metalness}
            />
          </mesh>
          <mesh position={[cx + handleW / 2, handleY, handleZ - 0.005]}>
            <boxGeometry args={[0.004, 0.004, 0.012]} />
            <meshPhysicalMaterial
              color={hMatColor}
              map={handleTex ?? undefined}
              roughness={hp.roughness}
              metalness={hp.metalness}
            />
          </mesh>
        </group>
      );
    }

    /* ── Hanging Rod ───────────────────────────────────── */
    case "hanging-rod": {
      const rodY = y + comp.height * CM / 2;
      const rodLen = sectionWidth - 0.008;
      const bracketW = 0.008;
      const bracketH = 0.028;
      const bracketD = 0.035;

      return (
        <group onClick={handleClick}>
          {/* Chrome rod */}
          <mesh position={[cx, rodY, 0.01]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.012, 0.012, rodLen, 24]} />
            <meshPhysicalMaterial
              color={rodColor}
              roughness={0.12}
              metalness={0.92}
              clearcoat={0.6}
              clearcoatRoughness={0.05}
            />
          </mesh>
          {/* Left U-bracket */}
          <group position={[0.004, rodY, 0.01]}>
            <mesh position={[0, bracketH / 2 + 0.012, 0]}>
              <boxGeometry args={[bracketW, 0.004, bracketD]} />
              <meshPhysicalMaterial color={rodColor} roughness={0.15} metalness={0.9} />
            </mesh>
            <mesh position={[0, bracketH / 2 - 0.002, bracketD / 2]}>
              <boxGeometry args={[bracketW, bracketH, 0.003]} />
              <meshPhysicalMaterial color={rodColor} roughness={0.15} metalness={0.9} />
            </mesh>
          </group>
          {/* Right U-bracket */}
          <group position={[sectionWidth - 0.004, rodY, 0.01]}>
            <mesh position={[0, bracketH / 2 + 0.012, 0]}>
              <boxGeometry args={[bracketW, 0.004, bracketD]} />
              <meshPhysicalMaterial color={rodColor} roughness={0.15} metalness={0.9} />
            </mesh>
            <mesh position={[0, bracketH / 2 - 0.002, bracketD / 2]}>
              <boxGeometry args={[bracketW, bracketH, 0.003]} />
              <meshPhysicalMaterial color={rodColor} roughness={0.15} metalness={0.9} />
            </mesh>
          </group>
          {/* Simple hangers */}
          {Array.from({ length: Math.min(Math.floor(rodLen / 0.025), 8) }).map((_, i) => {
            const hx = 0.02 + i * (rodLen / Math.min(Math.floor(rodLen / 0.025), 8));
            return (
              <group key={i} position={[hx, rodY, 0.01]}>
                {/* Hook */}
                <mesh position={[0, 0.015, 0]} rotation={[0, 0, Math.PI / 2]}>
                  <torusGeometry args={[0.006, 0.001, 6, 12, Math.PI]} />
                  <meshStandardMaterial color="#888" roughness={0.3} metalness={0.6} />
                </mesh>
                {/* Hanger bar */}
                <mesh position={[0, 0.002, 0]} rotation={[0, 0, 0.15]}>
                  <boxGeometry args={[0.018, 0.002, 0.002]} />
                  <meshStandardMaterial color="#888" roughness={0.3} metalness={0.6} />
                </mesh>
                <mesh position={[0, 0.002, 0]} rotation={[0, 0, -0.15]}>
                  <boxGeometry args={[0.018, 0.002, 0.002]} />
                  <meshStandardMaterial color="#888" roughness={0.3} metalness={0.6} />
                </mesh>
              </group>
            );
          })}
        </group>
      );
    }

    /* ── Pull-out Tray / Wire Basket ──────────────────── */
    case "pull-out-tray": {
      const h = comp.height * CM;
      const basketW = sectionWidth - 0.008;
      const basketD = depth - 0.016;
      const wireR = 0.0012;

      return (
        <group onClick={handleClick}>
          {/* Bottom mesh (grid) */}
          <mesh position={[cx, y + 0.003, 0]} castShadow>
            <boxGeometry args={[basketW, 0.002, basketD]} />
            <meshPhysicalMaterial color={wireColor} roughness={0.25} metalness={0.6} clearcoat={0.2} />
          </mesh>
          {/* Left side */}
          <mesh position={[cx - basketW / 2, y + h / 2, 0]}>
            <boxGeometry args={[0.002, h, basketD]} />
            <meshPhysicalMaterial color={wireColor} roughness={0.25} metalness={0.6} />
          </mesh>
          {/* Right side */}
          <mesh position={[cx + basketW / 2, y + h / 2, 0]}>
            <boxGeometry args={[0.002, h, basketD]} />
            <meshPhysicalMaterial color={wireColor} roughness={0.25} metalness={0.6} />
          </mesh>
          {/* Front rail */}
          <mesh position={[cx, y + h - 0.002, basketD / 2]}>
            <boxGeometry args={[basketW, 0.003, 0.002]} />
            <meshPhysicalMaterial color={wireColor} roughness={0.25} metalness={0.6} />
          </mesh>
          {/* Back rail */}
          <mesh position={[cx, y + h - 0.002, -basketD / 2]}>
            <boxGeometry args={[basketW, 0.003, 0.002]} />
            <meshPhysicalMaterial color={wireColor} roughness={0.25} metalness={0.6} />
          </mesh>
          {/* Top front wire */}
          <mesh position={[cx, y + h, basketD / 2]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[wireR, wireR, basketW, 8]} />
            <meshPhysicalMaterial color={wireColor} roughness={0.2} metalness={0.7} />
          </mesh>
          {/* Wire cross-bars (bottom grid) */}
          {Array.from({ length: 5 }).map((_, i) => {
            const zPos = -basketD / 2 + (i + 1) * (basketD / 6);
            return (
              <mesh key={i} position={[cx, y + 0.004, zPos]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[wireR, wireR, basketW - 0.004, 6]} />
                <meshPhysicalMaterial color={wireColor} roughness={0.2} metalness={0.7} />
              </mesh>
            );
          })}
          {/* Slide rails */}
          <mesh position={[cx - basketW / 2 - 0.004, y + h * 0.4, 0]}>
            <boxGeometry args={[0.006, 0.006, basketD + 0.01]} />
            <meshPhysicalMaterial color="#777" roughness={0.3} metalness={0.5} />
          </mesh>
          <mesh position={[cx + basketW / 2 + 0.004, y + h * 0.4, 0]}>
            <boxGeometry args={[0.006, 0.006, basketD + 0.01]} />
            <meshPhysicalMaterial color="#777" roughness={0.3} metalness={0.5} />
          </mesh>
        </group>
      );
    }

    /* ── Empty Section (open space, dashed outline) ───── */
    case "empty-section": {
      const h = comp.height * CM;
      const esW = sectionWidth - 0.004;
      const esD = depth - 0.006;
      const edgeColor = selected ? HIGHLIGHT_COLOR : "#ccc";

      return (
        <group onClick={handleClick}>
          {/* Bottom edge */}
          <mesh position={[cx, y + 0.001, 0]}>
            <boxGeometry args={[esW, 0.002, esD]} />
            <meshStandardMaterial color={edgeColor} roughness={0.8} transparent opacity={0.5} />
          </mesh>
          {/* Top edge */}
          <mesh position={[cx, y + h - 0.001, 0]}>
            <boxGeometry args={[esW, 0.002, esD]} />
            <meshStandardMaterial color={edgeColor} roughness={0.8} transparent opacity={0.5} />
          </mesh>
          {/* Left edge */}
          <mesh position={[cx - esW / 2, y + h / 2, 0]}>
            <boxGeometry args={[0.002, h, 0.002]} />
            <meshStandardMaterial color={edgeColor} roughness={0.8} transparent opacity={0.4} />
          </mesh>
          {/* Right edge */}
          <mesh position={[cx + esW / 2, y + h / 2, 0]}>
            <boxGeometry args={[0.002, h, 0.002]} />
            <meshStandardMaterial color={edgeColor} roughness={0.8} transparent opacity={0.4} />
          </mesh>
        </group>
      );
    }

    /* ── Shoe Rack ─────────────────────────────────────── */
    case "shoe-rack": {
      const h = comp.height * CM;
      const rackW = sectionWidth - 0.006;
      const rackD = depth * 0.6;
      const railColor = selected ? HIGHLIGHT_COLOR : "#888";

      return (
        <group onClick={handleClick}>
          {/* Angled shelf panel */}
          {selected ? (
            <mesh position={[cx, y + h / 2, 0.015]} rotation={[0.25, 0, 0]} material={highlightMaterial} castShadow>
              <boxGeometry args={[rackW, 0.01, rackD]} />
            </mesh>
          ) : (
            <group position={[cx, y + h / 2, 0.015]} rotation={[0.25, 0, 0]}>
              <InteriorTexturedBox
                baseMat={interiorPhy}
                grain={interiorGrain}
                refW={refW}
                refH={refH}
                boxW={rackW}
                boxH={0.01}
                boxD={rackD}
                castShadow
              />
            </group>
          )}
          {/* Front lip rail */}
          <mesh
            position={[cx, y + h * 0.8, rackD / 2 + 0.01]}
            rotation={[0, 0, Math.PI / 2]}
          >
            <cylinderGeometry args={[0.003, 0.003, rackW - 0.008, 8]} />
            <meshPhysicalMaterial color={railColor} roughness={0.25} metalness={0.65} />
          </mesh>
          {/* Side support left */}
          <mesh position={[cx - rackW / 2 + 0.002, y + h / 2, 0.01]}>
            <boxGeometry args={[0.003, h, 0.003]} />
            <meshPhysicalMaterial color={railColor} roughness={0.25} metalness={0.65} />
          </mesh>
          {/* Side support right */}
          <mesh position={[cx + rackW / 2 - 0.002, y + h / 2, 0.01]}>
            <boxGeometry args={[0.003, h, 0.003]} />
            <meshPhysicalMaterial color={railColor} roughness={0.25} metalness={0.65} />
          </mesh>
        </group>
      );
    }

    default:
      return null;
  }
}

interface SectionWithMaterialProps {
  section: WardrobeSection;
  sectionIndex: number;
  sectionCount: number;
  sectionX: number;
  frameWidth: number;
  frameHeight: number;
  frameDepth: number;
  selectedComponentId: string | null;
  onClickComponent: (compId: string) => void;
  highlightMaterial: THREE.Material;
  interiorMatId: string;
  doorMatId: string;
  globalInteriorGrain: GrainDirection;
  doorGrain: GrainDirection;
  handleColor: string;
  handleRoughness: number;
  handleMetalness: number;
  handleFinish: WardrobeMaterial | null;
}

function SectionWithMaterial(props: SectionWithMaterialProps) {
  const interiorSheetHint = useSheetPanelInfoForMaterial(props.interiorMatId);
  const interiorMaterial = useRealisticMaterial(
    props.interiorMatId,
    props.globalInteriorGrain,
    interiorSheetHint,
  );

  return (
    <SectionInterior
      section={props.section}
      sectionIndex={props.sectionIndex}
      sectionCount={props.sectionCount}
      sectionX={props.sectionX}
      frameWidth={props.frameWidth}
      frameHeight={props.frameHeight}
      frameDepth={props.frameDepth}
      selectedComponentId={props.selectedComponentId}
      onClickComponent={props.onClickComponent}
      interiorMaterial={interiorMaterial}
      highlightMaterial={props.highlightMaterial}
      doorMatId={props.doorMatId}
      doorGrain={props.doorGrain}
      interiorGrain={props.globalInteriorGrain}
      handleColor={props.handleColor}
      handleRoughness={props.handleRoughness}
      handleMetalness={props.handleMetalness}
      handleFinish={props.handleFinish}
    />
  );
}

function noopSelect(_id: string | null) {}

export default function WardrobeInterior3D() {
  const embed = useContext(WardrobeRoomContext);
  const storeConfig = useWardrobeStore((s) => s.config);
  const config = embed?.config ?? storeConfig;
  const frame = config.frame;
  const sections = config.sections;
  const selectedFromStore = useWardrobeStore((s) => s.ui.selectedComponentId);
  const selectFromStore = useWardrobeStore((s) => s.selectComponent);
  const selectedComponentId = embed ? null : selectedFromStore;
  const selectComponent = embed ? noopSelect : selectFromStore;
  const interiorMatId = config.interiorMaterial;
  const doors = config.doors;
  const doorGrainFallback = config.doorGrainDirection ?? "horizontal";
  const handleStyle = config.doors.handle;
  const interiorGrainDirection = config.interiorGrainDirection ?? "horizontal";
  const storeHandleMats = useWardrobeStore((s) => s.availableHandleMaterials);
  const availableHandleMaterials = embed?.availableHandleMaterials ?? storeHandleMats;

  const handleFinish = useMemo((): WardrobeMaterial | null => {
    const id = doors.handleMaterialId;
    if (!id) return null;
    return availableHandleMaterials.find((m) => m.id === id) ?? null;
  }, [doors.handleMaterialId, availableHandleMaterials]);

  // Handle style "none" has no color entry — fall back to bar-steel so
  // downstream code sees a valid color (the "none" case is gated at render
  // time inside DoorHandle).
  const hw =
    handleStyle === "none"
      ? HANDLE_COLORS["bar-steel"]
      : (HANDLE_COLORS[handleStyle] ?? HANDLE_COLORS["bar-steel"]);

  const highlightMaterial = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: HIGHLIGHT_COLOR,
        roughness: 0.5,
        clearcoat: 0.2,
        emissive: new THREE.Color(HIGHLIGHT_COLOR),
        emissiveIntensity: 0.15,
      }),
    [],
  );

  const sectionXPositions = useMemo(() => {
    const positions: number[] = [];
    let x = PT;
    for (const section of sections) {
      positions.push(x);
      x += section.width * CM + PT;
    }
    return positions;
  }, [sections]);

  return (
    <group>
      {sections.map((section, i) => (
        <SectionWithMaterial
          key={section.id}
          section={section}
          sectionIndex={i}
          sectionCount={sections.length}
          sectionX={sectionXPositions[i]}
          frameWidth={frame.width}
          frameHeight={frame.height}
          frameDepth={frame.depth}
          selectedComponentId={selectedComponentId}
          onClickComponent={selectComponent}
          highlightMaterial={highlightMaterial}
          interiorMatId={interiorMatId}
          doorMatId={wardrobeDoorPanelMaterialIdForSection(doors, i)}
          globalInteriorGrain={interiorGrainDirection}
          doorGrain={wardrobeDoorPanelGrainForSection(doors, doorGrainFallback, i)}
          handleColor={hw.color}
          handleRoughness={hw.roughness}
          handleMetalness={hw.metalness}
          handleFinish={handleFinish}
        />
      ))}
    </group>
  );
}
