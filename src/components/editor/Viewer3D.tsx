"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, Environment } from "@react-three/drei";
import { CanvasObject, RoomSettings } from "@/lib/types";

interface Viewer3DProps {
  objects: CanvasObject[];
  viewMode?: "dollhouse" | "top" | "side";
  roomSettings?: RoomSettings;
  selectedFurnitureId?: string | null;
  onFurnitureSelect?: (id: string | null) => void;
}

function Object3D({ obj, selected, onSelect }: { obj: CanvasObject; selected: boolean; onSelect: () => void }) {
  // Convert 2D position to 3D (scale down and center)
  // Assuming dimensions are in cm, convert to meters for 3D (divide by 100)
  // Then scale for visualization (divide by 2 for better view)
  const scale = 0.02; // Convert cm to 3D units
  const x = (obj.x - 400) * scale;
  const z = (obj.y - 300) * scale;
  const width = obj.width * scale;
  const height = obj.height * scale;
  const depth = (obj.depth || 30) * scale;

  if (obj.type === "rect") {
    return (
      <group position={[x, depth / 2, z]} rotation={[0, (obj.rotation * Math.PI) / 180, 0]}>
        <mesh
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            document.body.style.cursor = "default";
          }}
        >
          <boxGeometry args={[width, depth, height]} />
          <meshStandardMaterial 
            color={selected ? "#3b82f6" : obj.color}
            emissive={selected ? "#3b82f6" : "#000000"}
            emissiveIntensity={selected ? 0.2 : 0}
          />
        </mesh>
        {/* Selection indicator - white circle overlay */}
        {selected && (
          <mesh position={[0, height / 2 + 0.1, 0]}>
            <circleGeometry args={[width / 3, 32]} />
            <meshStandardMaterial color="#ffffff" transparent opacity={0.8} />
          </mesh>
        )}
      </group>
    );
  }

  if (obj.type === "circle") {
    return (
      <group position={[x, depth / 2, z]} rotation={[0, (obj.rotation * Math.PI) / 180, 0]}>
        <mesh
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            document.body.style.cursor = "default";
          }}
        >
          <cylinderGeometry args={[width / 2, width / 2, depth, 32]} />
          <meshStandardMaterial 
            color={selected ? "#3b82f6" : obj.color}
            emissive={selected ? "#3b82f6" : "#000000"}
            emissiveIntensity={selected ? 0.2 : 0}
          />
        </mesh>
        {/* Selection indicator */}
        {selected && (
          <mesh position={[0, depth / 2 + 0.1, 0]}>
            <circleGeometry args={[width / 3, 32]} />
            <meshStandardMaterial color="#ffffff" transparent opacity={0.8} />
          </mesh>
        )}
      </group>
    );
  }

  return null;
}

export default function Viewer3D({ objects, viewMode = "dollhouse", roomSettings, selectedFurnitureId, onFurnitureSelect }: Viewer3DProps) {
  const roomWidth = roomSettings?.width ? roomSettings.width * 0.02 : 8; // Convert cm to 3D units
  const roomHeight = roomSettings?.height ? roomSettings.height * 0.02 : 6;
  const roomDiagonal = Math.hypot(roomWidth, roomHeight);

  // Camera distance scales with room size so the full room is always visible
  const baseDistance = Math.max(12, roomDiagonal * 0.8);
  const minDist = Math.max(5, roomDiagonal * 0.3);
  const maxDist = Math.max(35, roomDiagonal * 1.5);

  // Calculate camera position based on view mode (scaled to room size)
  const getCameraPosition = () => {
    switch (viewMode) {
      case "top":
        return [0, baseDistance, 0] as [number, number, number];
      case "side":
        return [baseDistance, baseDistance * 0.4, 0] as [number, number, number];
      case "dollhouse":
      default:
        return [baseDistance, baseDistance, baseDistance] as [number, number, number];
    }
  };

  const cameraPosition = getCameraPosition();

  const floorMaterial = useMemo(() => {
    const loader = new THREE.TextureLoader();
    const color = loader.load("/textures/wood/color.jpg");
    const normal = loader.load("/textures/wood/normal.jpg");
    const roughness = loader.load("/textures/wood/roughness.jpg");

    [color, normal, roughness].forEach((t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(6, 6);
    });
    color.colorSpace = THREE.SRGBColorSpace;

    return new THREE.MeshStandardMaterial({
      map: color,
      normalMap: normal,
      roughnessMap: roughness,
      roughness: 0.7,
      metalness: 0,
    });
  }, []);

  return (
    <Canvas shadows>
      <PerspectiveCamera makeDefault position={cameraPosition} fov={50} />
      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        minDistance={minDist}
        maxDistance={maxDist}
        target={[0, -0.4, 0]}
      />

      {/* Lighting */}
      <hemisphereLight args={[0xffffff, 0x444444, 1]} />
      <directionalLight
        position={[10, 10, 5]}
        intensity={1}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-10, 10, -5]} intensity={0.3} />

      {/* Environment */}
      <Environment preset="apartment" environmentIntensity={0.55} />

      {/* Room Floor - Realistic wooden parquet */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow material={floorMaterial}>
        <planeGeometry args={[roomWidth, roomHeight]} />
      </mesh>

      {/* Room Walls - IKEA Style */}
      {roomSettings && (
        <>
          {/* Back Wall */}
          <mesh position={[0, 1.5, -roomHeight / 2]} receiveShadow>
            <boxGeometry args={[roomWidth, 3, 0.15]} />
            <meshStandardMaterial color="#e5e5e5" />
          </mesh>
          {/* Left Wall */}
          <mesh position={[-roomWidth / 2, 1.5, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
            <boxGeometry args={[roomHeight, 3, 0.15]} />
            <meshStandardMaterial color="#e5e5e5" />
          </mesh>
          {/* Right Wall */}
          <mesh position={[roomWidth / 2, 1.5, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
            <boxGeometry args={[roomHeight, 3, 0.15]} />
            <meshStandardMaterial color="#e5e5e5" />
          </mesh>
        </>
      )}

      {/* Render objects */}
      {objects.map((obj) => (
        <Object3D 
          key={obj.id} 
          obj={obj} 
          selected={selectedFurnitureId === obj.id}
          onSelect={() => onFurnitureSelect?.(obj.id)}
        />
      ))}

      {/* Empty state message */}
      {objects.length === 0 && (
        <mesh position={[0, 1, 0]}>
          <boxGeometry args={[0.1, 0.1, 0.1]} />
          <meshStandardMaterial color="#ccc" transparent opacity={0} />
        </mesh>
      )}
    </Canvas>
  );
}
