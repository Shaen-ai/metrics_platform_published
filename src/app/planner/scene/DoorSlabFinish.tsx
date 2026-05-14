"use client";

import { Suspense, useEffect, useMemo } from "react";
import { useTexture, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { proxyTextureUrl } from "../shared/buildPhysicalMaterialFromSwatch";

type DoorSlabFinishProps = {
  slabW: number;
  slabH: number;
  doorThick: number;
  textureUrl?: string;
  modelUrl?: string;
  fallbackMaterial: THREE.Material;
};

function DoorSlabBox({
  slabW,
  slabH,
  doorThick,
  textureUrl,
  fallbackMaterial,
}: Omit<DoorSlabFinishProps, "modelUrl">) {
  const texture = textureUrl ? useTexture(proxyTextureUrl(textureUrl)) : null;
  const material = useMemo(() => {
    if (!texture) return fallbackMaterial;
    const map = texture.clone();
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(Math.max(1, slabW * 0.8), Math.max(1, slabH * 0.45));
    map.colorSpace = THREE.SRGBColorSpace;
    map.needsUpdate = true;
    return new THREE.MeshStandardMaterial({
      map,
      color: "#ffffff",
      roughness: 0.58,
      metalness: 0,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 4,
    });
  }, [fallbackMaterial, texture, slabW, slabH]);

  useEffect(() => {
    return () => {
      if (material !== fallbackMaterial) material.dispose();
    };
  }, [fallbackMaterial, material]);

  return (
    <mesh material={material} castShadow receiveShadow>
      <boxGeometry args={[slabW, slabH, doorThick]} />
    </mesh>
  );
}

function DoorSlabModel({
  slabW,
  slabH,
  doorThick,
  modelUrl,
}: Required<Pick<DoorSlabFinishProps, "slabW" | "slabH" | "doorThick" | "modelUrl">>) {
  const gltf = useGLTF(proxyTextureUrl(modelUrl));
  const { scene, scale, offset } = useMemo(() => {
    const cloned = gltf.scene.clone(true);
    cloned.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    const box = new THREE.Box3().setFromObject(cloned);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const sx = size.x > 0 ? slabW / size.x : 1;
    const sy = size.y > 0 ? slabH / size.y : 1;
    const sz = size.z > 0 ? doorThick / size.z : 1;
    const fittedScale = Math.min(sx, sy, sz);

    return {
      scene: cloned,
      scale: fittedScale,
      offset: center.multiplyScalar(-fittedScale),
    };
  }, [doorThick, gltf.scene, slabH, slabW]);

  return <primitive object={scene} scale={scale} position={offset} />;
}

export function DoorSlabFinish(props: DoorSlabFinishProps) {
  if (!props.modelUrl) {
    return <DoorSlabBox {...props} />;
  }

  return (
    <Suspense fallback={<DoorSlabBox {...props} />}>
      <DoorSlabModel
        slabW={props.slabW}
        slabH={props.slabH}
        doorThick={props.doorThick}
        modelUrl={props.modelUrl}
      />
    </Suspense>
  );
}
