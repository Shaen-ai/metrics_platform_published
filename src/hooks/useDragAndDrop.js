"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Html, Line } from "@react-three/drei";
import { usePlannerStore } from "@/app/planner/store/usePlannerStore";
import {
  snapToSurface,
  isValidPlacement,
  constrainMovement,
  checkClearance,
  autoAlign,
} from "@/systems/PlacementManager";
import { resolvePlacementRuleId } from "@/config/placementRules";
import { clampFurnitureToRoom, snapToGrid } from "@/app/planner/utils/math";
import { placementFootprintDims } from "@/app/planner/utils/placementFootprint";

const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _target = new THREE.Vector3();

function collectPlacementMeshes(scene) {
  const meshes = [];
  scene.traverse((obj) => {
    const m = /** @type {THREE.Mesh} */ (obj);
    if (!m.isMesh || m.visible === false) return;
    if (!m.userData?.surfaceType) return;
    meshes.push(m);
  });
  return meshes;
}

function syntheticFloorHit(point, zone) {
  const obj = {
    userData: {
      surfaceType: "floor",
      zone,
      surfaceTopY: 0,
    },
  };
  return { object: obj, point: point.clone(), face: null };
}

const YAW_PRESERVING_SURFACES = new Set(["floor", "ground", "countertop", "table", "shelf"]);

function placementSurfaceType(hit) {
  return String(hit?.object?.userData?.surfaceType ?? "");
}

function shouldPreserveYawForDrag(hit) {
  return YAW_PRESERVING_SURFACES.has(placementSurfaceType(hit));
}

/**
 * Prefer a placement intersection that satisfies the active rule instead of blindly using the nearest mesh
 * (outdoor fence/exterior shells are often nearer than deck along oblique rays).
 *
 * @param {THREE.Raycaster} raycaster
 * @param {THREE.Mesh[]} placementMeshes
 * @param {*} item
 * @param {*} catalogItem
 * @param {*} room
 * @returns {THREE.Intersection|null}
 */
function pickFirstValidPlacementHit(raycaster, placementMeshes, item, catalogItem, room) {
  if (!item || !catalogItem) return null;
  const hits = raycaster.intersectObjects(placementMeshes, false);
  const ruleId = item.placementRuleId ?? resolvePlacementRuleId(catalogItem);
  const { w: widthM } = placementFootprintDims(item, catalogItem);
  for (const hit of hits) {
    const { valid } = isValidPlacement(item, hit, room, ruleId, { widthM });
    if (valid) return hit;
  }
  return null;
}

/**
 * @param {THREE.Ray} ray
 * @param {*} room
 * @param {string} plannerType
 * @param {*} item
 * @param {*} catalogItem
 */
function syntheticFloorHitIfValid(ray, room, plannerType, item, catalogItem) {
  if (!item || !catalogItem) return null;
  if (!ray.intersectPlane(_plane, _target)) return null;
  const zone = plannerType === "outdoor" ? "outdoor" : "indoor";
  const hit = syntheticFloorHit(_target, zone);
  const ruleId = item.placementRuleId ?? resolvePlacementRuleId(catalogItem);
  const { w: widthM } = placementFootprintDims(item, catalogItem);
  if (!isValidPlacement(item, hit, room, ruleId, { widthM }).valid) return null;
  return hit;
}

/**
 * Pointer-driven placement + drag (multi-surface raycast).
 * @param {{ controlsRef: React.MutableRefObject<unknown> }} props
 */
export function PlacementDragController({ controlsRef }) {
  const { camera, scene, gl, invalidate } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const pointer = useRef(new THREE.Vector2());
  const dragStartPose = useRef(null);
  const dragStartScreen = useRef(null);
  const dragMovedRef = useRef(false);
  /** Movable item pressed but drag not started until pointer moves past threshold (keeps OrbitControls stable on click). */
  const pendingDragRef = useRef(/** @type {{ itemId: string } | null} */ (null));
  const placementMeshesRef = useRef(/** @type {THREE.Mesh[]} */ ([]));

  /** Pixel distance the pointer must travel before a click becomes a drag. */
  const DRAG_THRESHOLD_PX = 4;

  const [preview, setPreview] = useState(null);

  const getNDC = useCallback(
    (e) => {
      const rect = gl.domElement.getBoundingClientRect();
      pointer.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    },
    [gl]
  );

  const hitFurniture = useCallback(() => {
    raycaster.current.setFromCamera(pointer.current, camera);
    const meshes = [];
    scene.traverse((obj) => {
      const m = /** @type {THREE.Mesh} */ (obj);
      if (!m.isMesh || !m.userData?.itemId) return;
      meshes.push(m);
    });
    const hits = raycaster.current.intersectObjects(meshes, false);
    if (hits.length > 0) return /** @type {string} */ (hits[0].object.userData.itemId);
    return null;
  }, [camera, scene]);

  const refreshPlacementMeshes = useCallback(() => {
    placementMeshesRef.current = collectPlacementMeshes(scene);
  }, [scene]);

  useEffect(() => {
    refreshPlacementMeshes();
  }, [scene, refreshPlacementMeshes]);

  useEffect(() => {
    const canvas = gl.domElement;

    const onPointerDown = (e) => {
      if (e.button !== 0) return;
      getNDC(e);
      const itemId = hitFurniture();
      if (itemId) {
        e.stopImmediatePropagation();
        e.preventDefault();
        const store = usePlannerStore.getState();
        store.selectItem(itemId);
        const item = store.placedItems.find((i) => i.id === itemId);
        if (!item || item.movable === false) return;
        dragStartPose.current = {
          position: { ...item.position },
          positionY: item.positionY ?? 0,
          rotationY: item.rotationY ?? 0,
        };
        dragStartScreen.current = { x: e.clientX, y: e.clientY };
        dragMovedRef.current = false;
        pendingDragRef.current = { itemId };
        setPreview(null);
      } else {
        pendingDragRef.current = null;
        usePlannerStore.getState().selectItem(null);
      }
    };

    const onPointerMove = (e) => {
      let store = usePlannerStore.getState();

      if (!store.isDragging && pendingDragRef.current && dragStartScreen.current) {
        const dx = e.clientX - dragStartScreen.current.x;
        const dy = e.clientY - dragStartScreen.current.y;
        if (dx * dx + dy * dy >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
          const pid = pendingDragRef.current.itemId;
          pendingDragRef.current = null;
          dragMovedRef.current = true;
          if (controlsRef.current) controlsRef.current.enabled = false;
          canvas.style.cursor = "grabbing";
          store.startDrag(pid);
          refreshPlacementMeshes();
          store = usePlannerStore.getState();
        }
      }

      if (!store.isDragging || !store.dragItemId) {
        getNDC(e);
        const h = hitFurniture();
        canvas.style.cursor = h
          ? store.placedItems.find((i) => i.id === h)?.movable === false
            ? "not-allowed"
            : "grab"
          : pendingDragRef.current
            ? "grabbing"
            : "";
        return;
      }

      if (!dragMovedRef.current && dragStartScreen.current) {
        const dx = e.clientX - dragStartScreen.current.x;
        const dy = e.clientY - dragStartScreen.current.y;
        if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
          return;
        }
        dragMovedRef.current = true;
      }

      getNDC(e);
      raycaster.current.setFromCamera(pointer.current, camera);
      const item = store.placedItems.find((i) => i.id === store.dragItemId);
      const cat = store.catalog.find((c) => c.id === item?.catalogId);
      if (!item || !cat) return;

      const ruleId = item.placementRuleId ?? resolvePlacementRuleId(cat);
      const { w, d } = placementFootprintDims(item, cat);
      const hgt = item.height ?? cat.height;

      let hit = pickFirstValidPlacementHit(
        raycaster.current,
        placementMeshesRef.current,
        item,
        cat,
        store.room,
      );

      if (!hit) {
        hit = syntheticFloorHitIfValid(raycaster.current.ray, store.room, store.plannerType, item, cat);
      }

      if (!hit) {
        setPreview(null);
        return;
      }

      const snap = snapToSurface(item, hit.point, hit, { width: w, depth: d, height: hgt }, store.room, ruleId);
      const { valid, reason } = isValidPlacement(item, hit, store.room, ruleId, { widthM: w });

      let sx = snap.position.x;
      let sz = snap.position.z;
      let sY = snap.positionY;
      let sRot = shouldPreserveYawForDrag(hit) ? item.rotationY ?? 0 : snap.rotationY;

      if (store.ui.snapToGrid) {
        sx = snapToGrid(sx, store.ui.gridSize);
        sz = snapToGrid(sz, store.ui.gridSize);
      }

      const clamped = clampFurnitureToRoom(sx, sz, w, d, sRot, store.room, hgt, sY ?? 0);

      store.updateItemPlacement(item.id, {
        position: clamped,
        positionY: sY,
        rotationY: sRot,
      });

      const mesh = /** @type {THREE.Mesh} */ (hit.object);
      const surfLabel = `${mesh.userData.surfaceType ?? "?"} · ${mesh.userData.zone ?? "?"}`;

      setPreview({
        valid,
        reason,
        surfaceLabel: surfLabel,
        wallMeasure:
          mesh.userData.surfaceType === "wall"
            ? {
                x: hit.point.x,
                z: hit.point.z,
                mountY: hit.point.y,
              }
            : null,
        ghostPos: [clamped.x, sY + hgt / 2, clamped.z],
        ghostColor: valid ? "#22c55e" : "#ef4444",
      });
      invalidate();
    };

    const onPointerUp = () => {
      const store = usePlannerStore.getState();

      if (pendingDragRef.current && !store.isDragging) {
        pendingDragRef.current = null;
        dragStartPose.current = null;
        dragStartScreen.current = null;
        dragMovedRef.current = false;
        setPreview(null);
        invalidate();
        canvas.style.cursor = "";
        return;
      }

      if (!store.isDragging || !store.dragItemId) return;
      const itemId = store.dragItemId;
      const item = store.placedItems.find((i) => i.id === itemId);
      const cat = item ? store.catalog.find((c) => c.id === item.catalogId) : null;

      raycaster.current.setFromCamera(pointer.current, camera);
      let hit = pickFirstValidPlacementHit(
        raycaster.current,
        placementMeshesRef.current,
        item,
        cat,
        store.room,
      );

      if (!hit) {
        hit = syntheticFloorHitIfValid(raycaster.current.ray, store.room, store.plannerType, item, cat);
      }

      const start = dragStartPose.current;
      dragStartPose.current = null;
      dragStartScreen.current = null;

      if (item && cat && hit && start) {
        const ruleId = item.placementRuleId ?? resolvePlacementRuleId(cat);
        const { w, d } = placementFootprintDims(item, cat);
        const hgt = item.height ?? cat.height;
        const snap = snapToSurface(item, hit.point, hit, { width: w, depth: d, height: hgt }, store.room, ruleId);
        let sx = snap.position.x;
        let sz = snap.position.z;
        let sY = snap.positionY;
        let sRot = shouldPreserveYawForDrag(hit) ? start.rotationY : snap.rotationY;
        if (store.ui.snapToGrid) {
          sx = snapToGrid(sx, store.ui.gridSize);
          sz = snapToGrid(sz, store.ui.gridSize);
        }
        const clamped = clampFurnitureToRoom(sx, sz, w, d, sRot, store.room, hgt, sY ?? 0);
        const { valid } = isValidPlacement(item, hit, store.room, ruleId, { widthM: w });

        if (!valid) {
          store.updateItemPlacement(item.id, {
            position: start.position,
            positionY: start.positionY,
            rotationY: start.rotationY,
            placementWarnings: undefined,
          });
        } else {
          let next = {
            ...item,
            position: clamped,
            positionY: sY,
            rotationY: sRot,
          };
          next = autoAlign(next, scene, store.placedItems, store.room, store.catalog, ruleId);
          const mesh = /** @type {THREE.Mesh} */ (hit.object);
          const surfaceMeta = {
            surfaceType: String(mesh.userData.surfaceType ?? ""),
            zone: String(mesh.userData.zone ?? ""),
            wallId: mesh.userData.wallId != null ? String(mesh.userData.wallId) : undefined,
          };
          const constraint = constrainMovement(next, hit, ruleId);
          const wallNormal = constraint.wallNormal;
          const movementConstraint = wallNormal
            ? {
                mode: constraint.mode,
                heightLocked: constraint.heightLocked,
                wallNormal: /** @type {[number, number, number]} */ ([
                  wallNormal.x,
                  wallNormal.y,
                  wallNormal.z,
                ]),
              }
            : {
                mode: constraint.mode,
                heightLocked: constraint.heightLocked,
              };

          const effectiveMovementConstraint = next.wardrobeConfig
            ? { mode: "floor", heightLocked: false }
            : movementConstraint;

          const { warnings } = checkClearance(next, scene, store.placedItems, store.room, store.catalog, ruleId);

          store.updateItemPlacement(item.id, {
            position: next.position,
            positionY: next.positionY,
            rotationY: next.rotationY,
            placementSurface: surfaceMeta,
            movementConstraint: effectiveMovementConstraint,
            placementWarnings: warnings.length ? warnings : undefined,
          });
        }
      }

      setPreview(null);
      store.endDrag();
      invalidate();
      canvas.style.cursor = "";
      if (controlsRef.current) {
        controlsRef.current.enabled = true;
        controlsRef.current.enablePan = true;
        controlsRef.current.enableRotate = !usePlannerStore.getState().ui.topView;
        controlsRef.current.enableZoom = true;
      }
    };

    canvas.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [gl, camera, scene, controlsRef, getNDC, hitFurniture, refreshPlacementMeshes, invalidate]);

  const isDragging = usePlannerStore((s) => s.isDragging);
  const plannerType = usePlannerStore((s) => s.plannerType);
  const selectedId = usePlannerStore((s) => s.selectedItemId);
  const placedItems = usePlannerStore((s) => s.placedItems);
  const catalog = usePlannerStore((s) => s.catalog);

  const selectedItem = placedItems.find((i) => i.id === selectedId) ?? null;
  const selectedCat = selectedItem ? catalog.find((c) => c.id === selectedItem.catalogId) : null;

  const warnY =
    selectedItem && selectedCat
      ? (selectedItem.positionY ?? 0) + (selectedItem.height ?? selectedCat.height) + 0.2
      : 0;

  return (
    <>
      {isDragging &&
      preview?.ghostPos &&
      plannerType !== "outdoor" &&
      preview.wallMeasure ? (
        <group>
          <Line
            points={[
              [preview.wallMeasure.x, 0.01, preview.wallMeasure.z],
              [preview.wallMeasure.x, preview.wallMeasure.mountY, preview.wallMeasure.z],
            ]}
            color="#94a3b8"
            dashed
            dashScale={10}
          />
          <Html
            position={[
              preview.wallMeasure.x,
              preview.wallMeasure.mountY * 0.5,
              preview.wallMeasure.z,
            ]}
          >
            <span style={{ fontSize: 11, color: "#475569", userSelect: "none" }}>
              {preview.wallMeasure.mountY.toFixed(2)} m
            </span>
          </Html>
        </group>
      ) : null}

      {selectedItem?.placementWarnings?.length ? (
        <Html
          position={[selectedItem.position.x, warnY, selectedItem.position.z]}
          center
        >
          <div
            style={{
              padding: "2px 6px",
              borderRadius: 4,
              fontSize: 11,
              background: "rgba(234,179,8,0.95)",
              color: "#1a1a1a",
              maxWidth: 220,
            }}
          >
            ⚠ {selectedItem.placementWarnings.join(" · ")}
          </div>
        </Html>
      ) : null}
    </>
  );
}

/**
 * Hook placeholder for modules that need drag state; main logic lives in {@link PlacementDragController}.
 */
export function useDragAndDrop() {
  return {};
}

export default PlacementDragController;
