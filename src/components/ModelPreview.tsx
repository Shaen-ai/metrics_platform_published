"use client";

import { Component, Suspense, useMemo, useRef, useState, useEffect, ReactNode } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF, Environment, ContactShadows } from "@react-three/drei";
import { Box, AlertTriangle } from "lucide-react";

/**
 * Rewrite backend storage URLs to same-origin so they go through
 * the Next.js rewrite proxy and avoid CORS issues.
 * Handles any origin (not just the configured one) by extracting the pathname.
 */
function toLocalUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.pathname.startsWith("/storage/")) {
      return u.pathname + u.search + u.hash;
    }
  } catch {
    // not an absolute URL — already relative
  }
  return url;
}

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const groupRef = useRef<THREE.Group>(null);

  const { cloned, bottomY } = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map((m) => m.clone());
        } else if (mesh.material) {
          mesh.material = mesh.material.clone();
        }
      }
    });

    const bbox = new THREE.Box3().setFromObject(clone);
    const size = bbox.getSize(new THREE.Vector3());
    const center = bbox.getCenter(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = maxDim > 0.001 ? 2 / maxDim : 1;

    clone.scale.setScalar(scale);
    clone.position.set(
      -center.x * scale,
      -center.y * scale,
      -center.z * scale
    );

    return { cloned: clone, bottomY: -(size.y * scale) / 2 };
  }, [scene]);

  return (
    <group ref={groupRef}>
      <primitive object={cloned} />
      <ContactShadows
        position={[0, bottomY - 0.01, 0]}
        opacity={0.3}
        scale={5}
        blur={2}
      />
    </group>
  );
}

function LoadingSpinner() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-2">
      <Box className="w-12 h-12 text-emerald-500 animate-pulse" />
      <span className="text-xs font-medium text-emerald-600">Loading 3D...</span>
    </div>
  );
}

function CanvasLoadingFallback() {
  return (
    <mesh>
      <boxGeometry args={[0.5, 0.5, 0.5]} />
      <meshStandardMaterial color="#10b981" wireframe />
    </mesh>
  );
}

class ErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function ErrorFallback() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-2">
      <AlertTriangle className="w-10 h-10 text-amber-500" />
      <span className="text-xs font-medium text-[var(--muted-foreground)]">Failed to load 3D model</span>
    </div>
  );
}

interface ModelPreviewProps {
  modelUrl: string;
  className?: string;
}

export default function ModelPreview({ modelUrl, className }: ModelPreviewProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let revoked = false;
    const localUrl = toLocalUrl(modelUrl);

    fetch(localUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (!revoked) setBlobUrl(URL.createObjectURL(blob));
      })
      .catch(() => {
        if (!revoked) setError(true);
      });

    return () => {
      revoked = true;
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [modelUrl]);

  if (error) return <ErrorFallback />;
  if (!blobUrl) return <LoadingSpinner />;

  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <div className={className} style={{ width: "100%", height: "100%" }}>
        <Canvas
          camera={{ position: [3, 2.5, 3], fov: 35, near: 0.1, far: 100 }}
          gl={{ antialias: true, alpha: true }}
          style={{ background: "transparent" }}
        >
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 8, 5]} intensity={1} castShadow />
          <directionalLight position={[-3, 4, -2]} intensity={0.3} />

          <Suspense fallback={<CanvasLoadingFallback />}>
            <Model url={blobUrl} />
            <Environment preset="apartment" />
          </Suspense>

          <OrbitControls
            enablePan={false}
            enableZoom={false}
            autoRotate
            autoRotateSpeed={2}
            minPolarAngle={Math.PI / 4}
            maxPolarAngle={Math.PI / 2 - 0.05}
          />
        </Canvas>
      </div>
    </ErrorBoundary>
  );
}
