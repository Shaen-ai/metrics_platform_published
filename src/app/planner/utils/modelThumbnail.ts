"use client";

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const THUMB_SIZE = 72;
const cache = new Map<string, string>();
const queue: Array<{
  modelPath: string;
  width: number;
  depth: number;
  height: number;
  resolve: (url: string) => void;
  reject: (err: Error) => void;
}> = [];
let isProcessing = false;

let sharedCanvas: HTMLCanvasElement | null = null;
let sharedRenderer: THREE.WebGLRenderer | null = null;
let sharedScene: THREE.Scene | null = null;
let sharedCamera: THREE.PerspectiveCamera | null = null;

function getOrCreateRenderer() {
  if (!sharedCanvas) {
    sharedCanvas = document.createElement("canvas");
    sharedCanvas.width = THUMB_SIZE;
    sharedCanvas.height = THUMB_SIZE;
  }
  if (!sharedRenderer) {
    sharedRenderer = new THREE.WebGLRenderer({
      canvas: sharedCanvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    sharedRenderer.setSize(THUMB_SIZE, THUMB_SIZE);
    sharedRenderer.setClearColor(0xf5f5f5, 1);
  }
  if (!sharedScene) {
    sharedScene = new THREE.Scene();
  }
  if (!sharedCamera) {
    sharedCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  }
  return { canvas: sharedCanvas, renderer: sharedRenderer, scene: sharedScene, camera: sharedCamera };
}

function processNext() {
  if (queue.length === 0) {
    isProcessing = false;
    return;
  }
  const job = queue.shift()!;
  const loader = new GLTFLoader();
  loader.load(
    job.modelPath,
    (gltf) => {
      try {
        const { renderer, scene, camera } = getOrCreateRenderer();
        scene.clear();

        const clone = gltf.scene.clone(true);
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

        const bbox = new THREE.Box3().setFromObject(clone);
        const size = bbox.getSize(new THREE.Vector3());
        const center = bbox.getCenter(new THREE.Vector3());
        const { width, depth, height } = job;

        const scaleX = size.x > 0.001 ? width / size.x : 1;
        const scaleY = size.y > 0.001 ? height / size.y : 1;
        const scaleZ = size.z > 0.001 ? depth / size.z : 1;
        clone.scale.set(scaleX, scaleY, scaleZ);
        clone.position.set(
          -center.x * scaleX,
          -bbox.min.y * scaleY,
          -center.z * scaleZ
        );

        scene.add(clone);

        const light1 = new THREE.DirectionalLight(0xffffff, 1);
        light1.position.set(2, 3, 2);
        scene.add(light1);
        const light2 = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(light2);

        const maxDim = Math.max(width, depth, height);
        const distance = maxDim * 2.2;
        camera.position.set(distance * 0.6, distance * 0.7, distance * 0.6);
        camera.lookAt(0, height / 2, 0);
        camera.updateProjectionMatrix();

        renderer.render(scene, camera);

        const dataUrl = sharedCanvas!.toDataURL("image/png");
        cache.set(job.modelPath, dataUrl);
        job.resolve(dataUrl);
      } finally {
        processNext();
      }
    },
    undefined,
    (err) => {
      job.reject(err instanceof Error ? err : new Error(String(err)));
      processNext();
    }
  );
}

/**
 * Generate a thumbnail image for a furniture model. Returns a data URL.
 * Uses a single shared canvas and processes requests in a queue.
 */
export function getModelThumbnail(
  modelPath: string,
  width: number,
  depth: number,
  height: number
): Promise<string> {
  const cached = cache.get(modelPath);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve, reject) => {
    queue.push({ modelPath, width, depth, height, resolve, reject });
    if (!isProcessing) {
      isProcessing = true;
      processNext();
    }
  });
}
