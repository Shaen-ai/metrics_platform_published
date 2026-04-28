"use client";

import { useRef, useCallback, useEffect, useState, Suspense } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { usePlannerStore } from "../store/usePlannerStore";
import { computeDragPosition } from "../utils/math";
import RoomMesh from "../scene/RoomMesh";
import RoomCornerLabels from "../scene/RoomCornerLabels";
import FurnitureMesh from "../scene/FurnitureMesh";
import ItemDistanceAnnotations from "../scene/ItemDistanceAnnotations";
// FloorGrid removed — wooden floor uses realistic plank texture only

const DEG15 = (15 * Math.PI) / 180;

// ─── Drag controller using native DOM events ────────────────────────
// R3F's onPointerDown on meshes is unreliable with OrbitControls.
// Instead we attach native pointerdown/move/up to the <canvas> element
// and do our own raycasting.  This is the same pattern IKEA uses.

function DragController({
  controlsRef,
}: {
  controlsRef: React.MutableRefObject<any>;
}) {
  const { camera, scene, gl, invalidate } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const pointer = useRef(new THREE.Vector2());
  const dragOffset = useRef({ x: 0, z: 0 });
  const floorPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)); // Y=0

  // Helper: get the canvas-relative NDC from a DOM PointerEvent
  const getNDC = useCallback(
    (e: PointerEvent) => {
      const rect = gl.domElement.getBoundingClientRect();
      pointer.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    },
    [gl]
  );

  // Helper: intersect a point on the Y=0 floor plane
  const hitFloor = useCallback((): THREE.Vector3 | null => {
    raycaster.current.setFromCamera(pointer.current, camera);
    const target = new THREE.Vector3();
    const hit = raycaster.current.ray.intersectPlane(floorPlane.current, target);
    return hit;
  }, [camera]);

  // Helper: find the first furniture mesh under the pointer
  const hitFurniture = useCallback((): string | null => {
    raycaster.current.setFromCamera(pointer.current, camera);
    // Collect all meshes that have a userData.itemId
    const meshes: THREE.Mesh[] = [];
    scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh && obj.userData?.itemId) {
        meshes.push(obj as THREE.Mesh);
      }
    });
    const hits = raycaster.current.intersectObjects(meshes, false);
    if (hits.length > 0) {
      return hits[0].object.userData.itemId as string;
    }
    return null;
  }, [camera, scene]);

  useEffect(() => {
    const canvas = gl.domElement;

    const onPointerDown = (e: PointerEvent) => {
      // Only handle left mouse button
      if (e.button !== 0) return;

      getNDC(e);

      const itemId = hitFurniture();

      if (itemId) {
        // ── Select and start drag ──
        e.stopPropagation();
        e.preventDefault();

        const store = usePlannerStore.getState();
        
        // Select the item first (for visual feedback)
        store.selectItem(itemId);
        
        const item = store.placedItems.find((i) => i.id === itemId);
        if (!item) return;

        // Locked items can be selected but not dragged
        if (item.movable === false) return;

        // Compute grab offset so item doesn't jump
        const floor = hitFloor();
        if (floor) {
          dragOffset.current = {
            x: floor.x - item.position.x,
            z: floor.z - item.position.z,
          };
        } else {
          dragOffset.current = { x: 0, z: 0 };
        }

        // Disable OrbitControls immediately
        if (controlsRef.current) {
          controlsRef.current.enabled = false;
        }

        // Visual feedback: change cursor
        canvas.style.cursor = "grabbing";

        store.startDrag(itemId);
      } else {
        // Clicked on empty space → deselect
        usePlannerStore.getState().selectItem(null);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const store = usePlannerStore.getState();

      // Change cursor on hover over furniture (when not dragging)
      if (!store.isDragging) {
        getNDC(e);
        const hoveredId = hitFurniture();
        if (hoveredId) {
          const hovered = store.placedItems.find((i) => i.id === hoveredId);
          canvas.style.cursor = hovered?.movable === false ? "not-allowed" : "grab";
        } else {
          canvas.style.cursor = "";
        }
        return;
      }

      if (!store.dragItemId) return;

      getNDC(e);
      const floor = hitFloor();
      if (!floor) return;

      const { x, z } = computeDragPosition(
        floor.x,
        floor.z,
        dragOffset.current.x,
        dragOffset.current.z
      );
      store.updateItemPosition(store.dragItemId, x, z);
      // Trigger a Three.js re-render so shadow updates in real time
      invalidate();
    };

    const onPointerUp = () => {
      const store = usePlannerStore.getState();
      if (!store.isDragging) return;

      store.endDrag();
      invalidate();

      // Reset cursor
      canvas.style.cursor = "";

      // Re-enable OrbitControls
      if (controlsRef.current) {
        controlsRef.current.enabled = true;
        controlsRef.current.enablePan = true;
        controlsRef.current.enableRotate =
          !usePlannerStore.getState().ui.topView;
        controlsRef.current.enableZoom = true;
      }
    };

    // Use capture phase to intercept before OrbitControls
    canvas.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [gl, getNDC, hitFloor, hitFurniture, controlsRef, scene, invalidate]);

  return null; // this component renders nothing
}

// ─── Camera controller ──────────────────────────────────────────────

function CameraController({
  controlsRef,
}: {
  controlsRef: React.MutableRefObject<any>;
}) {
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
      let cx = r.width * 0.7;
      let cy = r.height * 1.4;
      let cz = r.depth * 1.1;
      let tx = 0;
      const ty = 1.3;
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
  }, [topView, showRoomDesigner, camera, controlsRef, invalidate]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enabled={!isDragging}
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

  useEffect(() => {
    invalidate();
  }, [placedItems, selectedItemId, showDimensions, invalidate]);

  return null;
}

// ─── Scene content ──────────────────────────────────────────────────

function SceneContent() {
  const placedItems = usePlannerStore((s) => s.placedItems);
  const catalog = usePlannerStore((s) => s.catalog);
  const selectedItemId = usePlannerStore((s) => s.selectedItemId);
  const deleteSelected = usePlannerStore((s) => s.deleteSelected);
  const rotateItem = usePlannerStore((s) => s.rotateItem);
  const selectItem = usePlannerStore((s) => s.selectItem);
  const toggleItemMovable = usePlannerStore((s) => s.toggleItemMovable);
  const toggleShowGrid = usePlannerStore((s) => s.toggleShowGrid);
  const toggleSnapToGrid = usePlannerStore((s) => s.toggleSnapToGrid);
  const toggleShowDimensions = usePlannerStore((s) => s.toggleShowDimensions);
  const setTopView = usePlannerStore((s) => s.setTopView);
  const topView = usePlannerStore((s) => s.ui.topView);
  const showDimensions = usePlannerStore((s) => s.ui.showDimensions);
  const room = usePlannerStore((s) => s.room);

  const controlsRef = useRef<any>(null);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      switch (e.key) {
        case "Delete":
        case "Backspace":
          deleteSelected();
          break;
        case "q":
        case "Q":
          if (selectedItemId) rotateItem(selectedItemId, -DEG15);
          break;
        case "e":
        case "E":
          if (selectedItemId) rotateItem(selectedItemId, DEG15);
          break;
        case "t":
        case "T":
          setTopView(!topView);
          break;
        case "g":
        case "G":
          toggleShowGrid();
          break;
        case "s":
        case "S":
          toggleSnapToGrid();
          break;
        case "d":
        case "D":
          toggleShowDimensions();
          break;
        case "l":
        case "L":
          if (selectedItemId) toggleItemMovable(selectedItemId);
          break;
        case "Escape":
          selectItem(null);
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    selectedItemId,
    deleteSelected,
    rotateItem,
    toggleItemMovable,
    setTopView,
    topView,
    toggleShowGrid,
    toggleSnapToGrid,
    toggleShowDimensions,
    selectItem,
  ]);

  return (
    <>
      {/* Invalidate the frame whenever Zustand visual state changes */}
      <StoreInvalidator />

      {/* Soft indoor fill only — room is lit by ceiling point lights in RoomMesh (no sun / no IBL). */}
      <hemisphereLight args={[0xfff8f0, 0x4a4844, 0.35]} />
      <ambientLight intensity={0.22} color="#faf8f5" />

      {/* Camera */}
      <CameraController controlsRef={controlsRef} />

      {/* Drag system (native DOM events) */}
      <DragController controlsRef={controlsRef} />

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
