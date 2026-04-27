"use client";

import { useEffect, useRef, useCallback, type RefObject } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useWardrobeStore } from "./store";
import { PANEL_THICKNESS, sectionLeftEdgeCm, dividerCenterCm } from "./data";

const CM = 0.01;
const PT = PANEL_THICKNESS * CM;

interface SectionDividerDragsProps {
  groupRef: RefObject<THREE.Group | null>;
}

/**
 * Draggable hit volumes on vertical section dividers — move left/right to resize adjacent bays.
 */
export default function SectionDividerDrags({ groupRef }: SectionDividerDragsProps) {
  const frame = useWardrobeStore((s) => s.config.frame);
  const sections = useWardrobeStore((s) => s.config.sections);
  const adjustSectionDivider = useWardrobeStore((s) => s.adjustSectionDivider);
  const setDividerDragActive = useWardrobeStore((s) => s.setDividerDragActive);

  const { camera, gl, invalidate } = useThree();

  const dragRef = useRef<{ dividerIndex: number } | null>(null);
  const raycaster = useRef(new THREE.Raycaster());
  const pointer = useRef(new THREE.Vector2());
  const hitVec = useRef(new THREE.Vector3());

  const W = frame.width * CM;
  const H = frame.height * CM;
  const D = frame.depth * CM;

  const updateFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const d = dragRef.current;
      const g = groupRef.current;
      if (!d || !g) return;

      const sections = useWardrobeStore.getState().config.sections;

      const rect = gl.domElement.getBoundingClientRect();
      pointer.current.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.current.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.current.setFromCamera(pointer.current, camera);

      g.updateMatrixWorld(true);
      const pFrontLocal = new THREE.Vector3(W / 2, H / 2, D / 2 + 0.02);
      const pFrontWorld = pFrontLocal.clone().applyMatrix4(g.matrixWorld);

      const localNormal = new THREE.Vector3(0, 0, 1);
      const worldNormal = localNormal.clone().transformDirection(g.matrixWorld).normalize();

      const plane = new THREE.Plane();
      plane.setFromNormalAndCoplanarPoint(worldNormal, pFrontWorld);

      if (!raycaster.current.ray.intersectPlane(plane, hitVec.current)) return;

      const local = g.worldToLocal(hitVec.current.clone());
      const localXCmm = local.x / CM;

      const i = d.dividerIndex;
      const bayLeftCm = sectionLeftEdgeCm(sections, i);
      const newWi = localXCmm - bayLeftCm;
      adjustSectionDivider(i, newWi);
      invalidate();
    },
    [adjustSectionDivider, camera, D, gl.domElement, groupRef, H, invalidate, W],
  );

  useEffect(() => {
    const onUp = () => {
      if (dragRef.current) {
        dragRef.current = null;
        setDividerDragActive(false);
        gl.domElement.style.cursor = "";
      }
    };
    const onMove = (e: PointerEvent) => {
      if (dragRef.current) {
        e.preventDefault();
        updateFromClient(e.clientX, e.clientY);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [gl.domElement, setDividerDragActive, updateFromClient]);

  if (sections.length < 2) return null;

  return (
    <>
      {sections.slice(0, -1).map((_, dividerIndex) => {
        const cx = dividerCenterCm(sections, dividerIndex) * CM;

        return (
          <mesh
            key={dividerIndex}
            position={[cx, H / 2, D / 2 + 0.03]}
            onPointerDown={(e) => {
              e.stopPropagation();
              gl.domElement.setPointerCapture(e.pointerId);
              dragRef.current = { dividerIndex };
              setDividerDragActive(true);
              gl.domElement.style.cursor = "ew-resize";
              updateFromClient(e.nativeEvent.clientX, e.nativeEvent.clientY);
            }}
            onPointerOver={() => {
              if (!dragRef.current) gl.domElement.style.cursor = "ew-resize";
            }}
            onPointerOut={() => {
              if (!dragRef.current) gl.domElement.style.cursor = "";
            }}
          >
            <boxGeometry args={[0.05, Math.max(0.05, H - PT * 2 - 0.04), D * 0.92]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        );
      })}
    </>
  );
}
