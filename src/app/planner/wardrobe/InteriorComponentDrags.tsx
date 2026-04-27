"use client";

import { useEffect, useRef, useCallback, type RefObject } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useWardrobeStore } from "./store";
import { PANEL_THICKNESS, sectionLeftEdgeCm, shelfBoardWidthM } from "./data";

const CM = 0.01;
const PT = PANEL_THICKNESS * CM;
/** Distance (px) the pointer must travel before a click turns into a drag. */
const DRAG_START_THRESHOLD_PX = 4;
/** Minimum hit-volume height (m) so thin shelves still get a draggable strip. */
const MIN_GRIP_HEIGHT_M = 0.04;
/** Thickness (m) of the front-face drag hit volume; sits just past the drawer fronts. */
const HIT_DEPTH_M = 0.015;
/** Forward offset (m) from the wardrobe front face. Past doors & drawer fronts. */
const HIT_FRONT_OFFSET_M = 0.03;

interface InteriorComponentDragsProps {
  groupRef: RefObject<THREE.Group | null>;
}

/**
 * Draggable hit volumes on every interior component (shelves, drawers, rods…)
 * that move the item up/down the section. The store's
 * `moveComponent`/`repackComponentsVertical` enforce collision + bottom-up
 * packing, so dragging a shelf above another automatically swaps their
 * stack order (same model as the keyboard arrows / drag-to-reorder list).
 *
 * The hit volume extends across the full bay depth so the grip is reachable
 * from the front with doors hidden, and from the side in side view. A
 * pointerdown/pointermove delta below {@link DRAG_START_THRESHOLD_PX}
 * passes through as a plain selection click.
 */
export default function InteriorComponentDrags({
  groupRef,
}: InteriorComponentDragsProps) {
  const frame = useWardrobeStore((s) => s.config.frame);
  const sections = useWardrobeStore((s) => s.config.sections);
  const doorsType = useWardrobeStore((s) => s.config.doors.type);
  const showDoors = useWardrobeStore((s) => s.ui.showDoors);
  const moveComponent = useWardrobeStore((s) => s.moveComponent);
  const selectComponent = useWardrobeStore((s) => s.selectComponent);
  const setDividerDragActive = useWardrobeStore((s) => s.setDividerDragActive);

  const { camera, gl, invalidate } = useThree();

  const dragRef = useRef<{
    sectionId: string;
    componentId: string;
    grabLocalYM: number;
    compYCmAtGrab: number;
    startClientX: number;
    startClientY: number;
    moved: boolean;
  } | null>(null);
  const raycaster = useRef(new THREE.Raycaster());
  const pointer = useRef(new THREE.Vector2());
  const hitVec = useRef(new THREE.Vector3());

  const D = frame.depth * CM;

  /**
   * Project the client pointer onto the wardrobe's front plane (z = D/2)
   * and return the ray's Y coordinate in the carcass-local space (meters
   * from the carcass bottom). Falls back to null if the ray misses.
   */
  const localYMFromClient = useCallback(
    (clientX: number, clientY: number): number | null => {
      const g = groupRef.current;
      if (!g) return null;

      const rect = gl.domElement.getBoundingClientRect();
      pointer.current.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.current.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.current.setFromCamera(pointer.current, camera);

      g.updateMatrixWorld(true);
      const pFrontLocal = new THREE.Vector3(0, 0, D / 2 + 0.02);
      const pFrontWorld = pFrontLocal.clone().applyMatrix4(g.matrixWorld);
      const localNormal = new THREE.Vector3(0, 0, 1);
      const worldNormal = localNormal
        .clone()
        .transformDirection(g.matrixWorld)
        .normalize();

      const plane = new THREE.Plane();
      plane.setFromNormalAndCoplanarPoint(worldNormal, pFrontWorld);
      if (!raycaster.current.ray.intersectPlane(plane, hitVec.current)) {
        return null;
      }
      const local = g.worldToLocal(hitVec.current.clone());
      return local.y;
    },
    [camera, D, gl.domElement, groupRef],
  );

  const updateFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const d = dragRef.current;
      if (!d) return;
      const localYM = localYMFromClient(clientX, clientY);
      if (localYM == null) return;

      const deltaYM = localYM - d.grabLocalYM;
      const newYCm = d.compYCmAtGrab + deltaYM / CM;
      moveComponent(d.sectionId, d.componentId, newYCm);
      invalidate();
    },
    [invalidate, localYMFromClient, moveComponent],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (!d.moved) {
        const dx = e.clientX - d.startClientX;
        const dy = e.clientY - d.startClientY;
        if (dx * dx + dy * dy < DRAG_START_THRESHOLD_PX * DRAG_START_THRESHOLD_PX) {
          return;
        }
        d.moved = true;
        setDividerDragActive(true);
        gl.domElement.style.cursor = "ns-resize";
      }
      e.preventDefault();
      updateFromClient(e.clientX, e.clientY);
    };
    const onUp = () => {
      const d = dragRef.current;
      if (!d) return;
      if (!d.moved) {
        // Treated as a click — act as selection so the whole component
        // still behaves like the existing interior meshes.
        selectComponent(d.componentId);
      } else {
        setDividerDragActive(false);
      }
      dragRef.current = null;
      gl.domElement.style.cursor = "";
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [gl.domElement, selectComponent, setDividerDragActive, updateFromClient]);

  if (sections.length === 0) return null;
  // Doors block the interior visually; hide drags so users can still click
  // through to the door panels. They come back the moment doors are hidden
  // or the wardrobe is open (doors.type === "none").
  if (doorsType !== "none" && showDoors) return null;

  /** Front face Z (m) — just past any drawer/door front so dragging works
      from front-elevation views, not just perspective. */
  const frontZ = D / 2 + HIT_FRONT_OFFSET_M;

  return (
    <>
      {sections.map((section, sIdx) => {
        const sectionLeftCm = sectionLeftEdgeCm(sections, sIdx);
        const cx = (sectionLeftCm + section.width / 2) * CM;
        const sectionW = section.width * CM;
        /** Trim a bit from the section width so the hit volume doesn't cover dividers. */
        const defaultHitW = Math.max(0.05, sectionW - 0.02);

        return section.components.map((comp) => {
          const hitW =
            comp.type === "shelf"
              ? Math.max(
                  0.05,
                  shelfBoardWidthM(section.width, comp.shelfWidthCm) + 0.008,
                )
              : defaultHitW;
          const yBottomM = PT + comp.yPosition * CM;
          const centerYM = yBottomM + (comp.height * CM) / 2;
          const hitH = Math.max(MIN_GRIP_HEIGHT_M, comp.height * CM);
          return (
            <mesh
              key={`${section.id}.${comp.id}`}
              position={[cx, centerYM, frontZ]}
              onPointerDown={(e) => {
                e.stopPropagation();
                const localYM = localYMFromClient(
                  e.nativeEvent.clientX,
                  e.nativeEvent.clientY,
                );
                if (localYM == null) return;
                gl.domElement.setPointerCapture(e.pointerId);
                dragRef.current = {
                  sectionId: section.id,
                  componentId: comp.id,
                  grabLocalYM: localYM,
                  compYCmAtGrab: comp.yPosition,
                  startClientX: e.nativeEvent.clientX,
                  startClientY: e.nativeEvent.clientY,
                  moved: false,
                };
              }}
              onPointerOver={() => {
                if (!dragRef.current) gl.domElement.style.cursor = "ns-resize";
              }}
              onPointerOut={() => {
                if (!dragRef.current) gl.domElement.style.cursor = "";
              }}
            >
              <boxGeometry args={[hitW, hitH, HIT_DEPTH_M]} />
              <meshBasicMaterial
                transparent
                opacity={0}
                depthWrite={false}
                side={THREE.DoubleSide}
              />
            </mesh>
          );
        });
      })}
    </>
  );
}
