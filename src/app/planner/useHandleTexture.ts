"use client";

import { useEffect, useState } from "react";
import * as THREE from "three";

/**
 * Loads a catalog handle `imageUrl` for meshPhysicalMaterial.map.
 * Disposes previous textures when the URL changes or clears.
 */
export function useHandleTexture(imageUrl: string | undefined): THREE.Texture | null {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!imageUrl) {
      setTexture((prev) => {
        prev?.dispose();
        return null;
      });
      return;
    }
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.load(imageUrl, (t) => {
      if (cancelled) {
        t.dispose();
        return;
      }
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(2, 2);
      t.colorSpace = THREE.SRGBColorSpace;
      setTexture((prev) => {
        prev?.dispose();
        return t;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  return texture;
}
