"use client";

import { useRef, useEffect, useMemo, useState, memo } from "react";
import * as THREE from "three";
import { Edges } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { PlacedItem, PlannerCatalogItem } from "../types";
import { useStore } from "@/lib/store";
import { useResolvedAdmin } from "@/contexts/PublishedTenantProvider";
import { publicApiUrl } from "@/lib/publicEnv";
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

interface FurnitureMeshProps {
  item: PlacedItem;
  catalogItem: PlannerCatalogItem;
  isSelected: boolean;
  isLocked?: boolean;
}

function plannerModelUrl(url: string): string {
  if (typeof window === "undefined") return url;
  try {
    const apiOrigin = new URL(publicApiUrl).origin;
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin === apiOrigin && (parsed.pathname.startsWith("/storage/") || parsed.pathname.startsWith("/files/"))) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return parsed.href;
  } catch {
    return url;
  }
}

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

const CatalogModelMesh = memo(function CatalogModelMesh(props: FurnitureMeshProps) {
  const { item, catalogItem, isSelected, isLocked } = props;
  const [model, setModel] = useState<{ url?: string; scene: THREE.Group | null; failed: boolean }>({
    url: catalogItem.modelUrl,
    scene: null,
    failed: false,
  });
  const width = item.width ?? catalogItem.width;
  const depth = item.depth ?? catalogItem.depth;
  const height = item.height ?? catalogItem.height;
  const url = catalogItem.modelUrl;

  useEffect(() => {
    if (!url) return;
    let cancelled = false;

    const loader = new GLTFLoader();
    loader.load(
      plannerModelUrl(url),
      (gltf) => {
        if (cancelled) return;
        setModel({ url, scene: gltf.scene.clone(true), failed: false });
      },
      undefined,
      () => {
        if (!cancelled) setModel({ url, scene: null, failed: true });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [url]);

  const scene = model.url === url ? model.scene : null;
  const failed = model.url === url ? model.failed : false;

  useEffect(() => {
    if (!scene) return;
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.userData.itemId = item.id;
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, [item.id, scene]);

  const fit = useMemo(() => {
    if (!scene) return null;
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const sx = size.x > 0 ? width / size.x : 1;
    const sy = size.y > 0 ? height / size.y : 1;
    const sz = size.z > 0 ? depth / size.z : 1;
    const scale = Math.min(sx, sy, sz);
    return { box, center, scale: Number.isFinite(scale) && scale > 0 ? scale : 1 };
  }, [depth, height, scene, width]);

  if (!url || failed || !scene || !fit) {
    return <BoxFallback {...props} />;
  }

  const yPos = item.positionY ?? 0;

  return (
    <group
      position={[item.position.x, yPos, item.position.z]}
      rotation={[0, item.rotationY, 0]}
    >
      <primitive
        object={scene}
        position={[
          -fit.center.x * fit.scale,
          -fit.box.min.y * fit.scale,
          -fit.center.z * fit.scale,
        ]}
        scale={fit.scale}
      />
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

// ── User-designed wardrobe (procedural) ─────────────────────────────────

const PlacedWardrobeMesh = memo(function PlacedWardrobeMesh({
  item,
  catalogItem,
  isSelected,
  isLocked,
}: FurnitureMeshProps) {
  const groupRef = useRef<THREE.Group>(null);
  const rawMaterials = useStore((s) => s.materials);
  const admin = useResolvedAdmin();
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
  if (props.catalogItem.modelUrl) {
    return <CatalogModelMesh {...props} />;
  }
  return <BoxFallback {...props} />;
});
