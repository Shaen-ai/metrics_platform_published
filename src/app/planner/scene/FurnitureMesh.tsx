"use client";

import { Component, Suspense, useRef, useEffect, useMemo, memo, type ReactNode } from "react";
import * as THREE from "three";
import { useGLTF, Edges } from "@react-three/drei";
import { PlacedItem, PlannerCatalogItem } from "../types";
import { useStore } from "@/lib/store";
import { filterMaterialsForPlanner } from "@/lib/plannerMaterials";
import {
  materialsFromStore,
  doorFrontMaterialsFromStore,
  slidingMechanismsFromStore,
  handleMaterialsFromStore,
  withDefaultWardrobeDoorFinishes,
} from "../wardrobe/data";
import { WardrobeModulesInRoom } from "../wardrobe/WardrobeModulesInRoom";
import type { WardrobeRoomEmbedValue } from "../wardrobe/WardrobeRoomContext";

class ModelErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("[FurnitureMesh] Model failed to load, using box fallback:", error);
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

interface FurnitureMeshProps {
  item: PlacedItem;
  catalogItem: PlannerCatalogItem;
  isSelected: boolean;
  isLocked?: boolean;
}

// ── GLB Model renderer ─────────────────────────────────────────────────

const GlbModel = memo(function GlbModel({ item, catalogItem, isSelected, isLocked }: FurnitureMeshProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF(catalogItem.modelPath!);
  const width = item.width ?? catalogItem.width;
  const depth = item.depth ?? catalogItem.depth;
  const height = item.height ?? catalogItem.height;

  // Clone the scene and scale it to match catalog dimensions
  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);

    // Deep-clone materials so each instance can be independent
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map((m) => m.clone());
        } else if (mesh.material) {
          mesh.material = mesh.material.clone();
        }
      }
    });

    // Compute bounding box of the original model
    const bbox = new THREE.Box3().setFromObject(clone);
    const size = bbox.getSize(new THREE.Vector3());
    const center = bbox.getCenter(new THREE.Vector3());

    // Scale to match catalog dimensions
    const scaleX = size.x > 0.001 ? width / size.x : 1;
    const scaleY = size.y > 0.001 ? height / size.y : 1;
    const scaleZ = size.z > 0.001 ? depth / size.z : 1;

    clone.scale.set(scaleX, scaleY, scaleZ);

    // Center horizontally, bottom at Y=0
    clone.position.set(
      -center.x * scaleX,
      -bbox.min.y * scaleY,
      -center.z * scaleZ
    );

    return clone;
  }, [scene, width, depth, height]);

  // Precompute edge geometries from every mesh in the model so we can
  // render the real contour of the furniture when selected.
  const edgeGeometries = useMemo(() => {
    // Force matrix computation on the detached scene graph
    clonedScene.updateMatrixWorld(true);

    const edges: THREE.BufferGeometry[] = [];
    clonedScene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry) {
          const edgeGeo = new THREE.EdgesGeometry(mesh.geometry, 15);
          // Bake the mesh's world transform so edges align with the model
          edgeGeo.applyMatrix4(mesh.matrixWorld);
          edges.push(edgeGeo);
        }
      }
    });

    return edges;
  }, [clonedScene]);

  // Tag every child mesh with the item ID so the DragController raycaster
  // can identify which furniture piece was clicked/dragged.
  useEffect(() => {
    if (!groupRef.current) return;
    groupRef.current.traverse((child) => {
      child.userData.itemId = item.id;
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, [item.id, clonedScene]);

  const yPos = item.positionY ?? 0;

  return (
    <group
      position={[item.position.x, yPos, item.position.z]}
      rotation={[0, item.rotationY, 0]}
    >
      <group ref={groupRef}>
        <primitive object={clonedScene} />

        {/* ── Selection / lock outline following actual model contour ── */}
        {(isSelected || isLocked) &&
          edgeGeometries.map((geo, i) => (
            <lineSegments key={i} geometry={geo}>
              <lineBasicMaterial
                color={isLocked ? "#F44336" : "#FFC107"}
                transparent
                opacity={isSelected ? 0.8 : 0.4}
              />
            </lineSegments>
          ))}
      </group>

      {/* Direction indicator (front arrow) */}
      {isSelected && (
        <mesh position={[0, 0.003, -depth / 2 - 0.08]}>
          <coneGeometry args={[0.06, 0.12, 3]} />
          <meshBasicMaterial color={isLocked ? "#F44336" : "#FFC107"} />
        </mesh>
      )}
    </group>
  );
});

// ── Fallback box renderer (items without a model) ──────────────────────

const BoxFallback = memo(function BoxFallback({ item, catalogItem, isSelected, isLocked }: FurnitureMeshProps) {
  const width = item.width ?? catalogItem.width;
  const depth = item.depth ?? catalogItem.depth;
  const height = item.height ?? catalogItem.height;
  const color = item.color ?? catalogItem.color;

  const yPos = (item.positionY ?? 0) + height / 2;

  return (
    <group
      position={[item.position.x, yPos, item.position.z]}
      rotation={[0, item.rotationY, 0]}
    >
      <mesh castShadow receiveShadow userData={{ itemId: item.id }}>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial
          color={color}
          transparent={isSelected}
          opacity={isSelected ? 0.85 : 1}
        />
        {(isSelected || isLocked) && (
          <>
            <Edges scale={1.02} threshold={15} color={isLocked ? "#F44336" : "#FFC107"} lineWidth={4} />
            <Edges scale={1.015} threshold={15} color={isLocked ? "#E57373" : "#FFD700"} lineWidth={2} />
          </>
        )}
      </mesh>

      {/* Direction indicator (front arrow) */}
      {isSelected && (
        <mesh position={[0, -height / 2 + 0.003, -depth / 2 - 0.05]}>
          <coneGeometry args={[0.06, 0.12, 3]} />
          <meshBasicMaterial color={isLocked ? "#F44336" : "#FFC107"} />
        </mesh>
      )}
    </group>
  );
});

// ── User-designed wardrobe (procedural) ─────────────────────────────────

const PlacedWardrobeMesh = memo(function PlacedWardrobeMesh({
  item,
  catalogItem,
  isSelected,
  isLocked,
}: FurnitureMeshProps) {
  const groupRef = useRef<THREE.Group>(null);
  const rawMaterials = useStore((s) => s.materials);
  const admin = useStore((s) => s.admin);
  const materials = useMemo(
    () => filterMaterialsForPlanner(rawMaterials, admin?.plannerMaterialIds),
    [rawMaterials, admin?.plannerMaterialIds],
  );

  const embed: WardrobeRoomEmbedValue | null = useMemo(() => {
    if (!item.wardrobeConfig) return null;
    return {
      config: item.wardrobeConfig,
      availableMaterials: materialsFromStore(materials, admin?.companyName),
      availableDoorMaterials: withDefaultWardrobeDoorFinishes(
        doorFrontMaterialsFromStore(materials, admin?.companyName),
      ),
      availableSlidingMechanisms: slidingMechanismsFromStore(materials, admin?.companyName),
      availableHandleMaterials: handleMaterialsFromStore(materials, admin?.companyName),
    };
  }, [item.wardrobeConfig, materials, admin?.companyName]);

  useEffect(() => {
    if (!groupRef.current) return;
    groupRef.current.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.userData.itemId = item.id;
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, [item.id, embed, item.wardrobeConfig]);

  const yPos = item.positionY ?? 0;
  const width = item.width ?? catalogItem.width;
  const depth = item.depth ?? catalogItem.depth;
  const height = item.height ?? catalogItem.height;

  if (!embed) {
    return <BoxFallback item={item} catalogItem={catalogItem} isSelected={isSelected} isLocked={isLocked} />;
  }

  return (
    <group
      ref={groupRef}
      position={[item.position.x, yPos, item.position.z]}
      rotation={[0, item.rotationY, 0]}
    >
      <WardrobeModulesInRoom value={embed} />
      {(isSelected || isLocked) && (
        <group position={[0, height / 2, 0]}>
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(width, height, depth)]} />
            <lineBasicMaterial color={isLocked ? "#F44336" : "#FFC107"} />
          </lineSegments>
        </group>
      )}
      {isSelected && (
        <mesh position={[0, 0.003, -depth / 2 - 0.08]}>
          <coneGeometry args={[0.06, 0.12, 3]} />
          <meshBasicMaterial color={isLocked ? "#F44336" : "#FFC107"} />
        </mesh>
      )}
    </group>
  );
});

// ── Entry point: pick model renderer or fallback ───────────────────────

export default memo(function FurnitureMesh(props: FurnitureMeshProps) {
  if (props.item.wardrobeConfig) {
    return <PlacedWardrobeMesh {...props} />;
  }
  if (props.catalogItem.modelPath) {
    return (
      <ModelErrorBoundary fallback={<BoxFallback {...props} />}>
        <Suspense fallback={<BoxFallback {...props} />}>
          <GlbModel {...props} />
        </Suspense>
      </ModelErrorBoundary>
    );
  }
  return <BoxFallback {...props} />;
});
