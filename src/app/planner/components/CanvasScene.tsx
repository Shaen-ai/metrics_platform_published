"use client";

import { useRef, useCallback, useEffect, useState, Suspense, type ComponentRef, type MutableRefObject } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { usePlannerStore } from "../store/usePlannerStore";
import { usePlannerType } from "../context";
import RoomMesh from "../scene/RoomMesh";
import RoomCornerLabels from "../scene/RoomCornerLabels";
import FurnitureMesh from "../scene/FurnitureMesh";
import ItemDistanceAnnotations from "../scene/ItemDistanceAnnotations";
import { PlacementDragController } from "@/hooks/useDragAndDrop";
// FloorGrid removed — wooden floor uses realistic plank texture only

type PlannerOrbitControls = ComponentRef<typeof OrbitControls>;

// ─── Camera controller ──────────────────────────────────────────────

function CameraController({
  controlsRef,
}: {
  controlsRef: MutableRefObject<PlannerOrbitControls | null>;
}) {
  const plannerConfig = usePlannerType();
  const topView = usePlannerStore((s) => s.ui.topView);
  const isDragging = usePlannerStore((s) => s.isDragging);
  const room = usePlannerStore((s) => s.room);
  const showRoomDesigner = usePlannerStore((s) => s.showRoomDesigner);
  const { camera, invalidate } = useThree();

  // Scale orbit zoom limits with room size so the full room always fits
  const roomDiagonal = Math.hypot(room.width, room.depth);
  const minDist = Math.max(0.5, roomDiagonal * 0.15);
  const maxDist = Math.max(12, roomDiagonal * 1.5);

  // Reposition camera only when switching top/perspective or opening/closing Room Designer.
  // Do not depend on the full `room` object — beam/slope/floor/opening edits call setRoom and
  // would otherwise reset orbit and feel like the view "jumps" on every settings tweak.
  useEffect(() => {
    const { room: r } = usePlannerStore.getState();
    if (topView) {
      const maxDim = Math.max(r.width, r.depth);
      camera.position.set(0, maxDim * 1.3, 0.01);
      camera.lookAt(0, 0, 0);
      if (controlsRef.current) {
        controlsRef.current.target.set(0, 0, 0);
        controlsRef.current.update();
      }
    } else {
      // Scale camera position with room so the full room is visible
      const outdoor = plannerConfig?.id === "outdoor";
      const span = Math.max(r.width, r.depth);
      let cx = r.width * 0.7;
      let cy = outdoor ? Math.max(2.35, span * 0.5) : r.height * 1.4;
      let cz = r.depth * 1.1;
      let tx = 0;
      const ty = outdoor ? 0.85 : 1.3;
      const tz = 0;

      if (showRoomDesigner) {
        // Drawer sits on the right: shift orbit target +X so the room sits a bit left on
        // screen, and pull the camera closer for a slight zoom-in.
        tx += Math.min(r.width * 0.11, 0.42);
        const zoom = 0.86;
        cx = tx + (cx - tx) * zoom;
        cy = ty + (cy - ty) * zoom;
        cz = tz + (cz - tz) * zoom;
      }

      camera.position.set(cx, cy, cz);
      camera.lookAt(tx, ty, tz);
      if (controlsRef.current) {
        controlsRef.current.target.set(tx, ty, tz);
        controlsRef.current.update();
      }
    }
    invalidate();
  }, [topView, showRoomDesigner, camera, controlsRef, invalidate, plannerConfig?.id]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enabled={!isDragging}
      enableDamping={false}
      enablePan
      enableRotate={!topView}
      maxPolarAngle={topView ? 0 : Math.PI / 2 - 0.05}
      minDistance={minDist}
      maxDistance={maxDist}
    />
  );
}

// ─── Store → invalidate bridge ──────────────────────────────────────
// With frameloop="demand" the canvas only repaints on invalidate().
// This component watches Zustand state that affects visuals and
// requests a new frame whenever it changes (delete, select, rotate…).

function StoreInvalidator() {
  const { invalidate } = useThree();
  const placedItems = usePlannerStore((s) => s.placedItems);
  const selectedItemId = usePlannerStore((s) => s.selectedItemId);
  const showDimensions = usePlannerStore((s) => s.ui.showDimensions);
  const plinthEnabled = usePlannerStore((s) => s.room.plinthEnabled);

  useEffect(() => {
    invalidate();
  }, [placedItems, selectedItemId, showDimensions, plinthEnabled, invalidate]);

  return null;
}

// ─── Scene content ──────────────────────────────────────────────────

function SceneContent() {
  const plannerConfig = usePlannerType();
  const placedItems = usePlannerStore((s) => s.placedItems);
  const catalog = usePlannerStore((s) => s.catalog);
  const selectedItemId = usePlannerStore((s) => s.selectedItemId);
  const showDimensions = usePlannerStore((s) => s.ui.showDimensions);
  const room = usePlannerStore((s) => s.room);

  const controlsRef = useRef<PlannerOrbitControls | null>(null);

  return (
    <>
      {/* Invalidate the frame whenever Zustand visual state changes */}
      <StoreInvalidator />

      {/* Indoor: neutral fill + ceiling lights in RoomMesh. Outdoor: sun + sky in OutdoorSpaceMesh. */}
      {plannerConfig?.id !== "outdoor" && (
        <>
          <hemisphereLight args={[0xfff8f0, 0x4a4844, 0.35]} />
          <ambientLight intensity={0.22} color="#faf8f5" />
        </>
      )}

      {/* Camera */}
      <CameraController controlsRef={controlsRef} />

      {/* Smart placement drag (walls, floor, ceiling, helpers) */}
      <PlacementDragController controlsRef={controlsRef} />

      {/* Room */}
      <RoomMesh />

      {/* A–D corner markers when Room Designer is open */}
      <RoomCornerLabels />

      {/* Furniture items */}
      <Suspense fallback={null}>
        {placedItems.map((item) => {
          const catalogItem = catalog.find((c) => c.id === item.catalogId);
          if (!catalogItem) return null;
          const isSelected = item.id === selectedItemId;
          return (
            <group key={item.id}>
              <FurnitureMesh
                item={item}
                catalogItem={catalogItem}
                isSelected={isSelected}
                isLocked={item.movable === false}
              />
              {isSelected && showDimensions && (
                <ItemDistanceAnnotations
                  item={item}
                  catalogItem={catalogItem}
                  room={room}
                  allItems={placedItems}
                  catalog={catalog}
                />
              )}
            </group>
          );
        })}
      </Suspense>
    </>
  );
}

// ─── Context loss handler ──────────────────────────────────────────────
// Listens for both webglcontextlost and webglcontextrestored.
// On loss we call preventDefault() so the browser will attempt automatic
// restoration.  When the context is restored we clear the flag and
// re-render the scene — no page reload required.

function ContextLossHandler() {
  const { gl, invalidate } = useThree();
  const setWebglContextLost = usePlannerStore((s) => s.setWebglContextLost);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const canvas = gl.domElement;

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      fallbackTimerRef.current = setTimeout(() => {
        setWebglContextLost(true);
      }, 3000);
    };

    const handleContextRestored = () => {
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
      setWebglContextLost(false);
      invalidate();
    };

    canvas.addEventListener("webglcontextlost", handleContextLost, false);
    canvas.addEventListener("webglcontextrestored", handleContextRestored, false);

    return () => {
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
    };
  }, [gl, invalidate, setWebglContextLost]);

  return null;
}

// ─── Context lost overlay ─────────────────────────────────────────────
// Shown when the WebGL context is lost.  The primary action remounts
// the Canvas (creating a fresh GL context) which is fast and preserves
// all application state.  A full page reload is offered as a fallback.

function ContextLostOverlay({
  onRemount,
}: {
  onRemount: () => void;
}) {
  const webglContextLost = usePlannerStore((s) => s.webglContextLost);
  if (!webglContextLost) return null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(30, 30, 35, 0.9)",
        color: "#e8e6e3",
        fontSize: 14,
        zIndex: 10,
      }}
    >
      <p style={{ margin: "0 0 12px" }}>WebGL context was lost.</p>
      <p style={{ margin: "0 0 20px", opacity: 0.8 }}>
        This can happen when switching tabs, during hot reload, or under GPU
        memory pressure. Attempting to recover&hellip;
      </p>
      <div style={{ display: "flex", gap: 10 }}>
        <button
          type="button"
          onClick={() => {
            usePlannerStore.getState().setWebglContextLost(false);
            onRemount();
          }}
          style={{
            padding: "10px 20px",
            background: "#4a90d9",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          Try again
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            padding: "10px 20px",
            background: "transparent",
            color: "#e8e6e3",
            border: "1px solid rgba(255,255,255,0.25)",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          Refresh page
        </button>
      </div>
    </div>
  );
}

// ─── Canvas wrapper ─────────────────────────────────────────────────
// A `canvasKey` counter is used so we can force-remount the <Canvas>
// (and therefore create a brand-new WebGL context) without reloading
// the entire page.  All Zustand state is preserved across remounts.

export default function CanvasScene() {
  const [canvasKey, setCanvasKey] = useState(0);

  const handleRemount = useCallback(() => {
    setCanvasKey((k) => k + 1);
  }, []);

  return (
    <div className="planner-canvas-wrapper" style={{ position: "relative" }}>
      <ContextLostOverlay onRemount={handleRemount} />
      <Canvas
        key={canvasKey}
        frameloop="demand"
        shadows
        gl={{
          antialias: true,
          powerPreference: "high-performance",
          stencil: false,
          logarithmicDepthBuffer: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.1,
          /** Required so `canvas.toDataURL()` / screenshots retain the last frame (WebGL default clears after present). */
          preserveDrawingBuffer: true,
        }}
        onCreated={({ invalidate }) => invalidate()}
        camera={{
          fov: 50,
          near: 0.1,
          far: 100,
          position: [5, 5, 7],
        }}
        style={{ touchAction: "none", userSelect: "none" }}
      >
        <ContextLossHandler />
        <SceneContent />
      </Canvas>
    </div>
  );
}
