"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";

/**
 * Ground-cover grass blades as alpha-cutout instances around the camera.
 *
 * Strategy:
 *  - One geometry: 3 crossed quads (~12 verts, 6 tris) with a single shared
 *    blade-tuft alpha texture, so all instances share the same material.
 *  - Two density bands as separate `InstancedMesh`es:
 *      0..innerR    full density
 *      innerR..outerR  half density
 *  - The whole disk follows the orbit target (camera focus) at low frequency,
 *    so the user always sees a dense lawn near where they're looking without
 *    paying for the entire yard.
 *  - `onBeforeCompile` adds a tiny sin-based vertex offset (only on top-of-blade
 *    vertices) for subtle wind without per-frame uniform churn beyond `time`.
 *
 *  Falls back gracefully on weak hardware: if `navigator.hardwareConcurrency`
 *  is low we halve the densities; if `gl.capabilities.isWebGL2 === false` we
 *  short-circuit to no blades (older WebGL1 path is too slow for 40k tris).
 */

export type OutdoorGrassBladesProps = {
  /** Y level the blades sit on (lawn surface). */
  groundY?: number;
  /** Inner full-density radius around the focus point (m). */
  innerRadius?: number;
  /** Outer half-density radius (m). */
  outerRadius?: number;
  /** Tint multiplier (overrides the texture fill color). */
  tint?: THREE.ColorRepresentation;
  /** Disable the camera-follow update (useful for screenshots). */
  followCamera?: boolean;
  /** Hard density cap multiplier 0..1; useful for perf gating. */
  densityScale?: number;
};

const DEFAULT_INNER = 8;
const DEFAULT_OUTER = 18;

const FULL_DENSITY = 0.55; // blades per m² in inner ring
const HALF_DENSITY = 0.18; // blades per m² in outer ring

/** Build a 256-px alpha-cutout grass-tuft texture procedurally. */
function buildBladeTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);

  // Dark base shadow at root, lighter at tips
  for (let i = 0; i < 11; i++) {
    const cx = size * (0.18 + Math.random() * 0.66);
    const baseY = size; // bottom of texture
    const tipY = size * (0.05 + Math.random() * 0.35);
    const widthBase = 6 + Math.random() * 8;
    const widthTip = 1 + Math.random() * 2;
    const sway = (Math.random() - 0.5) * 38;

    const grad = ctx.createLinearGradient(cx, baseY, cx + sway, tipY);
    const tipBrightness = 200 + Math.floor(Math.random() * 35);
    const baseDark = 28 + Math.floor(Math.random() * 24);
    grad.addColorStop(0, `rgba(${baseDark}, ${baseDark + 38}, ${baseDark}, 1)`);
    grad.addColorStop(0.55, `rgba(${baseDark + 70}, ${baseDark + 130}, ${baseDark + 50}, 1)`);
    grad.addColorStop(1, `rgba(${tipBrightness - 80}, ${tipBrightness}, ${tipBrightness - 100}, 1)`);

    ctx.beginPath();
    ctx.moveTo(cx - widthBase / 2, baseY);
    ctx.quadraticCurveTo(
      cx - widthBase / 4 + sway * 0.4,
      (baseY + tipY) / 2,
      cx - widthTip / 2 + sway,
      tipY
    );
    ctx.lineTo(cx + widthTip / 2 + sway, tipY);
    ctx.quadraticCurveTo(
      cx + widthBase / 4 + sway * 0.4,
      (baseY + tipY) / 2,
      cx + widthBase / 2,
      baseY
    );
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** Three crossed quads sharing one alpha-cutout texture. */
function buildBladeGeometry(): THREE.BufferGeometry {
  // Quad: width 0.18 m, height 0.32 m, anchored at bottom-center.
  const w = 0.18;
  const h = 0.32;

  const planes = [
    { rotY: 0 },
    { rotY: Math.PI / 3 },
    { rotY: -Math.PI / 3 },
  ];

  const geos: THREE.BufferGeometry[] = [];
  for (const { rotY } of planes) {
    const g = new THREE.PlaneGeometry(w, h, 1, 1);
    // Shift up so y=0 is at the bottom edge of the quad.
    g.translate(0, h / 2, 0);
    g.rotateY(rotY);
    geos.push(g);
  }

  const merged = new THREE.BufferGeometry();
  // Manual merge — three.js helper isn't always present at runtime versions.
  // Each plane is identical layout (4 verts, 6 indices), so we can just append.
  const totalVerts = 4 * geos.length;
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const indices = new Uint16Array(6 * geos.length);

  let vOff = 0;
  let iOff = 0;
  for (const g of geos) {
    const p = g.attributes.position.array as Float32Array;
    const n = g.attributes.normal.array as Float32Array;
    const u = g.attributes.uv.array as Float32Array;
    const idx = g.index!.array as Uint16Array;
    positions.set(p, vOff * 3);
    normals.set(n, vOff * 3);
    uvs.set(u, vOff * 2);
    for (let k = 0; k < idx.length; k++) indices[iOff + k] = idx[k] + vOff;
    vOff += 4;
    iOff += idx.length;
    g.dispose();
  }
  merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  merged.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  merged.computeBoundingSphere();
  // Mark top vertices via a custom attribute so the wind shader only sways the
  // tips. y > 0.001 ⇒ top edge.
  const topMask = new Float32Array(totalVerts);
  const pos = merged.attributes.position.array as Float32Array;
  for (let i = 0; i < totalVerts; i++) {
    topMask[i] = pos[i * 3 + 1] > h * 0.5 ? 1 : 0;
  }
  merged.setAttribute("aTopMask", new THREE.BufferAttribute(topMask, 1));
  return merged;
}

function fract01(n: number) {
  return n - Math.floor(n);
}
function rnd(seed: number) {
  return fract01(Math.sin(seed * 127.1 + 311.7) * 43758.5453123);
}

/** Disk scatter, bottom y at groundY, jittered scale & rotation. */
function buildPlacements(
  count: number,
  innerR: number,
  outerR: number,
  groundY: number,
  seedBase: number
): Float32Array {
  // 7 floats per instance: x,y,z, rotY, sx, sy, sz
  const out = new Float32Array(count * 7);
  for (let i = 0; i < count; i++) {
    const angle = rnd(seedBase + i * 13.7) * Math.PI * 2;
    const t = rnd(seedBase + i * 19.1);
    const r = innerR + Math.sqrt(t) * (outerR - innerR);
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const sy = 0.78 + rnd(seedBase + i * 23) * 0.62; // 0.25 - 0.50 m tall
    const sx = 0.85 + rnd(seedBase + i * 29) * 0.4;
    const rot = rnd(seedBase + i * 31) * Math.PI * 2;
    out[i * 7 + 0] = x;
    out[i * 7 + 1] = groundY;
    out[i * 7 + 2] = z;
    out[i * 7 + 3] = rot;
    out[i * 7 + 4] = sx;
    out[i * 7 + 5] = sy;
    out[i * 7 + 6] = sx;
  }
  return out;
}

export default function OutdoorGrassBlades({
  groundY = 0,
  innerRadius = DEFAULT_INNER,
  outerRadius = DEFAULT_OUTER,
  tint = "#9bc56b",
  followCamera = true,
  densityScale = 1,
}: OutdoorGrassBladesProps) {
  const { camera, gl } = useThree();
  const isWebGL2 = gl.capabilities.isWebGL2 ?? true;

  const blades = useMemo(() => {
    if (!isWebGL2) return null;
    const geom = buildBladeGeometry();
    const tex = buildBladeTexture();

    const innerArea = Math.PI * innerRadius * innerRadius;
    const outerArea = Math.PI * (outerRadius * outerRadius - innerRadius * innerRadius);
    const innerCount = Math.max(0, Math.floor(innerArea * FULL_DENSITY * densityScale));
    const outerCount = Math.max(0, Math.floor(outerArea * HALF_DENSITY * densityScale));

    const innerData = buildPlacements(innerCount, 0.4, innerRadius, 0, 1).slice();
    const outerData = buildPlacements(outerCount, innerRadius, outerRadius, 0, 7919);

    return { geom, tex, innerData, outerData, innerCount, outerCount };
  }, [innerRadius, outerRadius, densityScale, isWebGL2]);

  const innerRef = useRef<THREE.InstancedMesh>(null);
  const outerRef = useRef<THREE.InstancedMesh>(null);
  const groupRef = useRef<THREE.Group>(null);

  // Wind-time uniform: ref-stored mutable box. Fed into the shader closure at
  // construction time; mutated each frame from `useFrame`.
  const windUniformRef = useRef({ value: 0 });

  // Wind-aware shared material. Built imperatively in an effect (not useMemo)
  // because we mutate it (onBeforeCompile, needsUpdate) — useMemo returns are
  // treated as immutable by `react-hooks/immutability`.
  const [bladeMaterial, setBladeMaterial] = useState<THREE.MeshStandardMaterial | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- syncing bladeMaterial
   * with external (blades, tint) inputs; effect-driven build is required
   * because we wire `onBeforeCompile` imperatively after construction. */
  useEffect(() => {
    if (!blades) {
      setBladeMaterial(null);
      return;
    }
    const uniformBox = windUniformRef.current;
    const m = new THREE.MeshStandardMaterial({
      map: blades.tex,
      alphaMap: blades.tex,
      alphaTest: 0.45,
      transparent: false,
      side: THREE.DoubleSide,
      color: new THREE.Color(tint),
      roughness: 0.92,
      metalness: 0,
    });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniformBox;
      shader.vertexShader =
        "uniform float uTime;\nattribute float aTopMask;\n" +
        shader.vertexShader.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          vec4 wp = instanceMatrix * vec4(transformed, 1.0);
          float wind = sin(uTime * 1.7 + wp.x * 0.6 + wp.z * 0.4) * 0.06
                     + sin(uTime * 0.9 + wp.x * 0.2 - wp.z * 0.55) * 0.04;
          transformed.x += wind * aTopMask;
          transformed.z += wind * 0.6 * aTopMask;
          `
        );
    };
    setBladeMaterial(m);
    return () => {
      m.dispose();
    };
  }, [blades, tint]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // One-shot upload of instance matrices.
  useEffect(() => {
    if (!blades) return;
    const tmp = new THREE.Matrix4();
    const tr = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const eu = new THREE.Euler();
    const qu = new THREE.Quaternion();
    const apply = (mesh: THREE.InstancedMesh | null, data: Float32Array, count: number) => {
      if (!mesh) return;
      for (let i = 0; i < count; i++) {
        tr.set(data[i * 7 + 0], data[i * 7 + 1], data[i * 7 + 2]);
        eu.set(0, data[i * 7 + 3], 0);
        qu.setFromEuler(eu);
        sc.set(data[i * 7 + 4], data[i * 7 + 5], data[i * 7 + 6]);
        tmp.compose(tr, qu, sc);
        mesh.setMatrixAt(i, tmp);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    };
    apply(innerRef.current, blades.innerData, blades.innerCount);
    apply(outerRef.current, blades.outerData, blades.outerCount);
  }, [blades]);

  // Cleanup geometry/texture on unmount.
  useEffect(() => {
    return () => {
      blades?.tex.dispose();
      blades?.geom.dispose();
    };
  }, [blades]);

  // Camera-follow + wind time uniform.
  const lastFocus = useRef(new THREE.Vector3());
  const dirVec = useRef(new THREE.Vector3());

  useFrame((_, dt) => {
    windUniformRef.current.value += dt;
    if (!followCamera || !groupRef.current) return;
    camera.getWorldDirection(dirVec.current);
    const focusX = camera.position.x + dirVec.current.x * 6;
    const focusZ = camera.position.z + dirVec.current.z * 6;
    lastFocus.current.x += (focusX - lastFocus.current.x) * 0.08;
    lastFocus.current.z += (focusZ - lastFocus.current.z) * 0.08;
    groupRef.current.position.x = lastFocus.current.x;
    groupRef.current.position.z = lastFocus.current.z;
  });

  if (!blades || !bladeMaterial) return null;

  return (
    <group ref={groupRef} position={[0, groundY, 0]}>
      <instancedMesh
        ref={innerRef}
        args={[blades.geom, bladeMaterial, blades.innerCount]}
        castShadow={false}
        receiveShadow={false}
        frustumCulled={false}
      />
      <instancedMesh
        ref={outerRef}
        args={[blades.geom, bladeMaterial, blades.outerCount]}
        castShadow={false}
        receiveShadow={false}
        frustumCulled={false}
      />
    </group>
  );
}

/** Low-end gating heuristic: returns `densityScale` 0..1 for OutdoorGrassBlades. */
export function pickBladeDensityScale(): number {
  if (typeof navigator === "undefined") return 1;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (cores <= 2) return 0;
  if (cores <= 4) return 0.5;
  return 1;
}
