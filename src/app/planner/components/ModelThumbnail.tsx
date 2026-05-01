"use client";

import { useEffect, useMemo, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import { publicApiUrl } from "@/lib/publicEnv";
import type { PlannerCatalogItem } from "../types";

interface ModelThumbnailProps {
  item: PlannerCatalogItem;
  className?: string;
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

function ThumbnailModel({ item }: { item: PlannerCatalogItem }) {
  const { invalidate } = useThree();
  const [sourceScene, setSourceScene] = useState<THREE.Group | null>(null);
  const url = item.modelUrl;

  useEffect(() => {
    if (!url) {
      setSourceScene(null);
      return;
    }
    let cancelled = false;
    const loader = new GLTFLoader();
    loader.load(
      plannerModelUrl(url),
      (gltf) => {
        if (cancelled) return;
        setSourceScene(gltf.scene);
        invalidate();
      },
      undefined,
      () => {
        if (!cancelled) setSourceScene(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [url, invalidate]);

  const scene = useMemo(() => (sourceScene ? (clone(sourceScene) as THREE.Group) : null), [sourceScene]);

  useEffect(() => {
    if (!scene) return;
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = false;
        child.receiveShadow = false;
      }
    });
    invalidate();
  }, [scene, invalidate]);

  const fit = useMemo(() => {
    if (!scene) return null;
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = maxDim > 0 ? 1.15 / maxDim : 1;
    return { center, scale, height: size.y };
  }, [scene]);

  if (!scene || !fit) return null;

  /** Slight raise so catalog thumbnails match card framing across aspect ratios */
  const yRaise = Math.max(fit.height * fit.scale * 0.065, 0.012);

  return (
    <group rotation={[0, -Math.PI / 5, 0]}>
      <primitive
        object={scene}
        position={[
          -fit.center.x * fit.scale,
          -fit.center.y * fit.scale + yRaise,
          -fit.center.z * fit.scale,
        ]}
        scale={fit.scale}
      />
    </group>
  );
}

function ThumbnailFallback({ color }: { color: string }) {
  return <div className="catalog-swatch-fallback" style={{ backgroundColor: color }} />;
}

export default function ModelThumbnail({ item, className }: ModelThumbnailProps) {
  if (item.imageUrl) {
    return (
      <div className={className} title={item.name}>
        <img src={item.imageUrl} alt={item.name} />
      </div>
    );
  }

  if (!item.modelUrl) {
    return (
      <div className={className}>
        <ThumbnailFallback color={item.color} />
      </div>
    );
  }

  return (
    <div className={className} title={item.name}>
      <Canvas
        frameloop="demand"
        orthographic
        camera={{ position: [2.2, 1.45, 2.4], zoom: 24, near: 0.1, far: 50 }}
        gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      >
        <ambientLight intensity={0.95} />
        <directionalLight position={[2, 3, 4]} intensity={1.1} />
        <ThumbnailModel item={item} />
      </Canvas>
    </div>
  );
}
