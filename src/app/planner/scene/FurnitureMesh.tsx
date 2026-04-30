"use client";

import { useRef, useEffect, useLayoutEffect, useMemo, useState, memo } from "react";
import * as THREE from "three";
import { Edges, useTexture } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { PlacedItem, PlannerCatalogItem } from "../types";
import { useStore } from "@/lib/store";
import { useResolvedAdmin } from "@/contexts/PublishedTenantProvider";
import {
  filterMaterialsForPlanner,
  materialsFromStore,
  upholsteryMaterialsFromStore,
} from "@/lib/plannerMaterials";
import { publicApiUrl } from "@/lib/publicEnv";
import {
  materialsFromStore as wardrobeMaterialsFromStore,
  doorFrontMaterialsFromStore,
  slidingMechanismsFromStore,
  handleMaterialsFromStore,
  withDefaultWardrobeDoorFinishes,
} from "../wardrobe/data";
import { WardrobeModulesInRoom } from "../wardrobe/WardrobeModulesInRoom";
import type { WardrobeRoomEmbedValue } from "../wardrobe/WardrobeRoomContext";
import { usePlannerType } from "../context";
import {
  getGlbTextureMode,
  plannerSwatchToWardrobeMaterial,
} from "../glbTextureMode";
import {
  buildMaterialFromSwatch,
  proxyTextureUrl,
  PLACEHOLDER_URL,
} from "../shared/buildPhysicalMaterialFromSwatch";

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
    if (
      parsed.origin === apiOrigin &&
      (parsed.pathname.startsWith("/storage/") || parsed.pathname.startsWith("/files/"))
    ) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return parsed.href;
  } catch {
    return url;
  }
}

function meshShouldReceiveGlbOverride(mesh: THREE.Mesh): boolean {
  const n = mesh.name?.toLowerCase() ?? "";
  if (/glass|mirror|chrome|handle|knob|hardware|wheel/i.test(n)) return false;
  const m = mesh.material;
  const mats = Array.isArray(m) ? m : [m];
  for (const mat of mats) {
    if (!(mat instanceof THREE.MeshStandardMaterial) && !(mat instanceof THREE.MeshPhysicalMaterial)) {
      return false;
    }
    if (mat.transparent && mat.opacity < 0.95) return false;
    if (mat instanceof THREE.MeshPhysicalMaterial && (mat.transmission ?? 0) > 0.5) return false;
  }
  return true;
}

// ── Fallback box renderer (items without a model) ──────────────────────

const BoxFallback = memo(function BoxFallback({
  item,
  catalogItem,
  isSelected,
  isLocked,
}: FurnitureMeshProps) {
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
        {isLocked && (
          <>
            <Edges scale={1.02} threshold={15} color="#F44336" lineWidth={4} />
            <Edges scale={1.015} threshold={15} color="#E57373" lineWidth={2} />
          </>
        )}
      </mesh>
    </group>
  );
});

type Fit = {
  box: THREE.Box3;
  center: THREE.Vector3;
  scale: number;
};

const CatalogGltfScenePrimitive = memo(function CatalogGltfScenePrimitive({
  scene,
  fit,
  item,
  catalogItem,
  width,
  depth,
  height,
  isLocked,
}: {
  scene: THREE.Group;
  fit: Fit;
  item: PlacedItem;
  catalogItem: PlannerCatalogItem;
  width: number;
  depth: number;
  height: number;
  isLocked?: boolean;
}) {
  const admin = useResolvedAdmin();
  const rawMaterials = useStore((s) => s.materials);
  const plannerType = usePlannerType();
  const materials = useMemo(
    () => filterMaterialsForPlanner(rawMaterials, admin?.plannerMaterialIds),
    [rawMaterials, admin?.plannerMaterialIds],
  );

  const boardSwatches = useMemo(
    () =>
      materialsFromStore(materials, admin?.companyName, {
        forWardrobe: plannerType?.id !== "kitchen",
      }),
    [materials, admin?.companyName, plannerType?.id],
  );

  const upholSwatches = useMemo(
    () => upholsteryMaterialsFromStore(materials, admin?.companyName),
    [materials, admin?.companyName],
  );

  const mode = useMemo(() => getGlbTextureMode(catalogItem), [catalogItem]);
  const activeList = mode === "upholstery" ? upholSwatches : boardSwatches;
  const finishId = item.gltfFinishMaterialId;
  const swatch = finishId ? activeList.find((s) => s.id === finishId) : undefined;

  const wm = useMemo(
    () => (swatch ? plannerSwatchToWardrobeMaterial(swatch) : null),
    [swatch],
  );

  const imageSource = swatch?.imageUrl;
  const textureUrl = wm ? (imageSource ? proxyTextureUrl(imageSource) : PLACEHOLDER_URL) : PLACEHOLDER_URL;
  const texture = useTexture(textureUrl);
  const externalTexture = wm && imageSource ? texture : null;

  const overrideMaterial = useMemo(() => {
    if (!wm || !finishId) return null;
    return buildMaterialFromSwatch(wm, externalTexture, 0, "horizontal");
  }, [wm, externalTexture, finishId]);

  const originalsRef = useRef<Map<THREE.Mesh, THREE.Material | THREE.Material[]>>(new Map());
  const disposedOverrideRef = useRef<THREE.MeshPhysicalMaterial | null>(null);

  useLayoutEffect(() => {
    originalsRef.current.clear();
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        originalsRef.current.set(mesh, mesh.material);
      }
    });
  }, [scene]);

  useLayoutEffect(() => {
    if (disposedOverrideRef.current) {
      disposedOverrideRef.current.dispose();
      disposedOverrideRef.current = null;
    }

    if (!overrideMaterial) {
      originalsRef.current.forEach((orig, mesh) => {
        mesh.material = orig;
      });
      return;
    }

    disposedOverrideRef.current = overrideMaterial;
    originalsRef.current.forEach((orig, mesh) => {
      if (meshShouldReceiveGlbOverride(mesh)) {
        mesh.material = overrideMaterial;
      } else {
        mesh.material = orig;
      }
    });

    return () => {
      if (disposedOverrideRef.current) {
        disposedOverrideRef.current.dispose();
        disposedOverrideRef.current = null;
      }
      originalsRef.current.forEach((orig, mesh) => {
        mesh.material = orig;
      });
    };
  }, [overrideMaterial, finishId, scene]);

  useEffect(() => {
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.userData.itemId = item.id;
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, [item.id, scene]);

  return (
    <group>
      <primitive
        object={scene}
        position={[
          -fit.center.x * fit.scale,
          -fit.box.min.y * fit.scale,
          -fit.center.z * fit.scale,
        ]}
        scale={fit.scale}
      />
      {isLocked && (
        <group position={[0, height / 2, 0]}>
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(width, height, depth)]} />
            <lineBasicMaterial color="#F44336" />
          </lineSegments>
        </group>
      )}
    </group>
  );
});

const CatalogModelMesh = memo(function CatalogModelMesh(props: FurnitureMeshProps) {
  const { item, catalogItem, isLocked } = props;
  const [model, setModel] = useState<{
    url?: string;
    scene: THREE.Group | null;
    failed: boolean;
  }>({
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
    <group position={[item.position.x, yPos, item.position.z]} rotation={[0, item.rotationY, 0]}>
      <CatalogGltfScenePrimitive
        scene={scene}
        fit={fit}
        item={item}
        catalogItem={catalogItem}
        width={width}
        depth={depth}
        height={height}
        isLocked={isLocked}
      />
    </group>
  );
});

// ── User-designed wardrobe (procedural) ─────────────────────────────────

const PlacedWardrobeMesh = memo(function PlacedWardrobeMesh(props: FurnitureMeshProps) {
  const { item, catalogItem, isLocked } = props;
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
      availableMaterials: wardrobeMaterialsFromStore(materials, admin?.companyName),
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
    return <BoxFallback {...props} />;
  }

  return (
    <group
      ref={groupRef}
      position={[item.position.x, yPos, item.position.z]}
      rotation={[0, item.rotationY, 0]}
    >
      <WardrobeModulesInRoom value={embed} />
      {isLocked && (
        <group position={[0, height / 2, 0]}>
          <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(width, height, depth)]} />
            <lineBasicMaterial color="#F44336" />
          </lineSegments>
        </group>
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
