"use client";

import { useMemo, useEffect } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { usePlannerStore } from "../store/usePlannerStore";
import type { FloorOutlinePoint, Opening, Room } from "../types";
import { createPlannerFloorMaterial } from "../laminateFloor";
import { ROOM_WALL_THICKNESS_M as WALL_THICKNESS } from "../constants/roomGeometry";
import {
  createPolygonWallSegmentWithHoles,
  edgeFrame,
  polygonWallHoleCutsForSegment,
} from "../utils/polygonWallCsg";

const OPENING_TRIM_BIAS = 0.005;

function createOutlineShape(outline: FloorOutlinePoint[]): THREE.Shape {
  const shape = new THREE.Shape();
  if (!outline.length) return shape;
  const p0 = outline[0]!;
  shape.moveTo(p0.x, p0.z);
  for (let i = 1; i < outline.length; i++) {
    const p = outline[i]!;
    shape.lineTo(p.x, p.z);
  }
  shape.closePath();
  return shape;
}

function outlineNormalAtEdge(outline: FloorOutlinePoint[], edgeIndex: number) {
  const n = outline.length;
  const a = outline[edgeIndex % n]!;
  const b = outline[(edgeIndex + 1) % n]!;
  const { tx, tz, ox, oz } = edgeFrame(a.x, a.z, b.x, b.z);
  return { tx, tz, ox, oz, ax: a.x, az: a.z, bx: b.x, bz: b.z, L: Math.hypot(b.x - a.x, b.z - a.z) };
}

function openingTrimWorldPosPolygon(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  position: number,
  halfLen: number,
  y: number,
  ox: number,
  oz: number,
  tx: number,
  tz: number
): [number, number, number] {
  const Mx = (ax + bx) / 2;
  const Mz = (az + bz) / 2;
  const along = position * halfLen;
  const ix = Mx + tx * along;
  const iz = Mz + tz * along;
  const e = OPENING_TRIM_BIAS;
  return [ix - ox * e, y, iz - oz * e];
}

function PolygonOpeningMeshes({
  opening,
  edge,
}: {
  opening: Opening;
  edge: ReturnType<typeof outlineNormalAtEdge>;
}) {
  const { ax, az, bx, bz, tx, tz, ox, oz, L } = edge;
  const halfLen = L / 2;
  const rotationY = Math.atan2(-tz, tx);
  const openingWidth = opening.width;
  const openingHeight = Math.min(
    opening.height || (opening.type === "door" ? 2.1 : 1.2),
    Math.max(0.5, 2.8 - 0.04)
  );

  const doorSlabMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#e2e0dc",
        roughness: 0.62,
        metalness: 0,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: 2,
        polygonOffsetUnits: 4,
      }),
    []
  );
  const doorFrameMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#f4f1ec",
        side: THREE.DoubleSide,
        roughness: 0.5,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: 3,
        polygonOffsetUnits: 5,
      }),
    []
  );
  const doorHandleMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#c9a96e",
        roughness: 0.18,
        metalness: 0.88,
      }),
    []
  );
  const windowGlassMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#a8c4dd",
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.24,
        roughness: 0.22,
        metalness: 0,
        emissive: "#000000",
        emissiveIntensity: 0,
        polygonOffset: true,
        polygonOffsetFactor: 2,
        polygonOffsetUnits: 3,
      }),
    []
  );
  const windowFrameMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#f8f9fa",
        side: THREE.DoubleSide,
        roughness: 0.45,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: 3,
        polygonOffsetUnits: 5,
      }),
    []
  );

  useEffect(() => {
    return () => {
      doorSlabMaterial.dispose();
      doorFrameMaterial.dispose();
      doorHandleMaterial.dispose();
      windowGlassMaterial.dispose();
      windowFrameMaterial.dispose();
    };
  }, [
    doorSlabMaterial,
    doorFrameMaterial,
    doorHandleMaterial,
    windowGlassMaterial,
    windowFrameMaterial,
  ]);

  const T = WALL_THICKNESS;

  if (opening.type === "door") {
    const frameWidth = 0.06;
    const jambH = Math.max(0.05, openingHeight - frameWidth);
    const jambCy = jambH / 2;
    const doorW = openingWidth - frameWidth * 2;
    const doorH = openingHeight - frameWidth;
    const doorThick = 0.045;
    const reveal = 0.008;
    const slabW = Math.max(0.2, doorW - reveal * 2);
    const slabH = Math.max(0.4, doorH - reveal * 2);
    const handleX = slabW * 0.36;
    const handleY = -slabH * 0.02;
    const hFaceZ = doorThick / 2 + 0.002;
    const roseR = 0.028;
    const leverLen = 0.1;
    const leverR = 0.009;

    const openingPos = openingTrimWorldPosPolygon(
      ax,
      az,
      bx,
      bz,
      opening.position,
      halfLen,
      openingHeight / 2,
      ox,
      oz,
      tx,
      tz
    );

    return (
      <group key={opening.id}>
        <group position={openingPos} rotation={[0, rotationY + Math.PI, 0]}>
          <mesh material={doorSlabMaterial} castShadow receiveShadow={false}>
            <boxGeometry args={[slabW, slabH, doorThick]} />
          </mesh>
          <mesh position={[handleX, handleY, hFaceZ]} rotation={[Math.PI / 2, 0, 0]} material={doorHandleMaterial} castShadow>
            <cylinderGeometry args={[roseR, roseR, 0.006, 32]} />
          </mesh>
          <mesh
            position={[handleX - leverLen / 2 + roseR * 0.2, handleY, hFaceZ + 0.025]}
            rotation={[0, 0, Math.PI / 2]}
            material={doorHandleMaterial}
            castShadow
          >
            <cylinderGeometry args={[leverR, leverR, leverLen, 16]} />
          </mesh>
          <mesh position={[handleX, handleY, -hFaceZ]} rotation={[Math.PI / 2, 0, 0]} material={doorHandleMaterial} castShadow>
            <cylinderGeometry args={[roseR, roseR, 0.006, 32]} />
          </mesh>
          <mesh
            position={[handleX - leverLen / 2 + roseR * 0.2, handleY, -hFaceZ - 0.025]}
            rotation={[0, 0, Math.PI / 2]}
            material={doorHandleMaterial}
            castShadow
          >
            <cylinderGeometry args={[leverR, leverR, leverLen, 16]} />
          </mesh>
        </group>
        <mesh
          position={openingTrimWorldPosPolygon(
            ax,
            az,
            bx,
            bz,
            opening.position,
            halfLen,
            openingHeight - frameWidth / 2,
            ox,
            oz,
            tx,
            tz
          )}
          rotation={[0, rotationY, 0]}
          material={doorFrameMaterial}
          castShadow
          receiveShadow={false}
        >
          <boxGeometry args={[openingWidth, frameWidth, T]} />
        </mesh>
        <mesh
          position={openingTrimWorldPosPolygon(
            ax,
            az,
            bx,
            bz,
            opening.position + (-openingWidth / 2 + frameWidth / 2) / halfLen,
            halfLen,
            jambCy,
            ox,
            oz,
            tx,
            tz
          )}
          rotation={[0, rotationY, 0]}
          material={doorFrameMaterial}
          castShadow
          receiveShadow={false}
        >
          <boxGeometry args={[frameWidth, jambH, T]} />
        </mesh>
        <mesh
          position={openingTrimWorldPosPolygon(
            ax,
            az,
            bx,
            bz,
            opening.position + (openingWidth / 2 - frameWidth / 2) / halfLen,
            halfLen,
            jambCy,
            ox,
            oz,
            tx,
            tz
          )}
          rotation={[0, rotationY, 0]}
          material={doorFrameMaterial}
          castShadow
          receiveShadow={false}
        >
          <boxGeometry args={[frameWidth, jambH, T]} />
        </mesh>
        <mesh
          position={openingTrimWorldPosPolygon(
            ax,
            az,
            bx,
            bz,
            opening.position,
            halfLen,
            0.005,
            ox,
            oz,
            tx,
            tz
          )}
          rotation={[0, rotationY, 0]}
        >
          <boxGeometry args={[openingWidth, 0.01, T]} />
          <meshStandardMaterial
            color="#c0b8a8"
            roughness={0.35}
            metalness={0.25}
            polygonOffset
            polygonOffsetFactor={3}
            polygonOffsetUnits={5}
          />
        </mesh>
      </group>
    );
  }

  const frameThickness = 0.05;
  const paneWidth = (openingWidth - frameThickness * 3) / 2;
  const paneHeight = openingHeight - frameThickness * 2;
  const stileH = Math.max(0.05, openingHeight - frameThickness * 2);
  const sillHeight = openingHeight > 1.5 ? 0 : 0.8;
  const windowBaseY = sillHeight + openingHeight / 2;

  const offsetAlong = (paneWidth / 2 + frameThickness / 2) / (halfLen > 1e-6 ? halfLen : 1);
  // Slight along-offset for two panes in wall plane
  const normalizePos = opening.position;
  const p1 = openingTrimWorldPosPolygon(
    ax,
    az,
    bx,
    bz,
    normalizePos - offsetAlong * 0.15,
    halfLen,
    windowBaseY,
    ox,
    oz,
    tx,
    tz
  );
  const p2 = openingTrimWorldPosPolygon(
    ax,
    az,
    bx,
    bz,
    normalizePos + offsetAlong * 0.15,
    halfLen,
    windowBaseY,
    ox,
    oz,
    tx,
    tz
  );

  return (
    <group key={opening.id}>
      <mesh position={p1} rotation={[0, rotationY, 0]} material={windowGlassMaterial} receiveShadow={false}>
        <boxGeometry args={[paneWidth, paneHeight, 0.006]} />
      </mesh>
      <mesh position={p2} rotation={[0, rotationY, 0]} material={windowGlassMaterial} receiveShadow={false}>
        <boxGeometry args={[paneWidth, paneHeight, 0.006]} />
      </mesh>
      <mesh
        position={openingTrimWorldPosPolygon(
          ax,
          az,
          bx,
          bz,
          opening.position,
          halfLen,
          windowBaseY + openingHeight / 2 - frameThickness / 2,
          ox,
          oz,
          tx,
          tz
        )}
        rotation={[0, rotationY, 0]}
        material={windowFrameMaterial}
        castShadow
        receiveShadow={false}
      >
        <boxGeometry args={[openingWidth, frameThickness, T]} />
      </mesh>
      <mesh
        position={openingTrimWorldPosPolygon(
          ax,
          az,
          bx,
          bz,
          opening.position,
          halfLen,
          windowBaseY - openingHeight / 2 + frameThickness / 2,
          ox,
          oz,
          tx,
          tz
        )}
        rotation={[0, rotationY, 0]}
        material={windowFrameMaterial}
        castShadow
        receiveShadow={false}
      >
        <boxGeometry args={[openingWidth, frameThickness, T]} />
      </mesh>
      <mesh
        position={openingTrimWorldPosPolygon(ax, az, bx, bz, opening.position, halfLen, windowBaseY, ox, oz, tx, tz)}
        rotation={[0, rotationY, 0]}
        material={windowFrameMaterial}
        castShadow
        receiveShadow={false}
      >
        <boxGeometry args={[frameThickness, stileH, T]} />
      </mesh>
    </group>
  );
}

function WallSegmentMesh({
  ax,
  az,
  bx,
  bz,
  height,
  wallMaterial,
  openingsDigest,
  room,
  edgeIndex,
  openings,
}: {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  height: number;
  wallMaterial: THREE.MeshStandardMaterial;
  openingsDigest: string;
  room: Room;
  edgeIndex: number;
  openings: Opening[];
}) {
  const geom = useMemo(() => {
    const segOpenings = openings.filter((o) => o.edgeIndex === edgeIndex);
    const { L } = edgeFrame(ax, az, bx, bz);
    const halfLen = L / 2;
    const cuts = polygonWallHoleCutsForSegment(
      -halfLen,
      halfLen,
      halfLen,
      segOpenings,
      room.height
    );
    return createPolygonWallSegmentWithHoles(ax, az, bx, bz, height, WALL_THICKNESS, cuts);
  }, [ax, az, bx, bz, height, edgeIndex, openingsDigest, room.height]);

  useEffect(() => () => geom.dispose(), [geom]);

  return <mesh geometry={geom} material={wallMaterial} castShadow receiveShadow />;
}

export default function PolygonRoomMesh() {
  const room = usePlannerStore((s) => s.room);
  const topView = usePlannerStore((s) => s.ui.topView);
  const { invalidate } = useThree();
  const outline = room.floorOutline!;
  const n = outline.length;
  const h = room.height;
  const w = room.width;
  const d = room.depth;
  const openEdge = new Set(room.openEdgeIndices ?? []);

  const floorStyle = room.floorStyle ?? "laminate-natural-oak";

  const floorMaterial = useMemo(() => {
    const repX = Math.max(1.45, w * 0.4);
    const repY = Math.max(1.45, d * 0.4);
    return createPlannerFloorMaterial({
      floorStyle,
      repeat: [repX, repY],
      onTextureUpdate: invalidate,
      roughness: 0.75,
      metalness: 0,
    });
  }, [floorStyle, w, d, invalidate]);
  useEffect(() => () => floorMaterial.dispose(), [floorMaterial]);

  const wallColor = room.wallColor ?? "#fafafa";
  const wallMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: wallColor,
        emissive: wallColor,
        emissiveIntensity: 0.3,
        roughness: 0.85,
        metalness: 0,
      }),
    []
  );
  useEffect(() => {
    wallMaterial.color.set(wallColor);
    wallMaterial.emissive.set(wallColor);
  }, [wallColor, wallMaterial]);

  const ceilingColor = useMemo(() => {
    const hex = wallColor.replace("#", "");
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const f = 0.5;
    return `rgb(${Math.round(r + (255 - r) * f)},${Math.round(g + (255 - g) * f)},${Math.round(
      b + (255 - b) * f
    )})`;
  }, [wallColor]);

  const ceilingMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: ceilingColor,
        emissive: ceilingColor,
        emissiveIntensity: 0.35,
        roughness: 0.95,
        metalness: 0,
      }),
    [ceilingColor]
  );
  useEffect(() => {
    ceilingMaterial.color.set(ceilingColor);
    ceilingMaterial.emissive.set(ceilingColor);
    invalidate();
  }, [ceilingColor, ceilingMaterial, invalidate]);

  const shape = useMemo(() => createOutlineShape(outline), [outline]);

  const floorCeilingGeom = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(shape, { depth: WALL_THICKNESS, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    g.translate(0, -WALL_THICKNESS / 2, 0);
    return g;
  }, [shape]);
  const ceilingGeom = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    g.translate(0, h - 0.04, 0);
    return g;
  }, [shape, h]);

  useEffect(() => {
    return () => {
      floorCeilingGeom.dispose();
      ceilingGeom.dispose();
    };
  }, [floorCeilingGeom, ceilingGeom]);

  const openings = room.openings || [];
  const openingsDigest = openings
    .map((o) => `${o.id}:${o.edgeIndex ?? ""}:${o.position}:${o.width}:${o.height ?? ""}`)
    .join("|");

  const maxH = h;
  const lightPositions = useMemo(() => {
    const grid: [number, number, number][] = [];
    const numX = 3;
    const numZ = 2;
    const marginX = w * 0.12;
    const marginZ = d * 0.12;
    const spanX = w - 2 * marginX;
    const spanZ = d - 2 * marginZ;
    const spacingX = numX > 1 ? spanX / (numX - 1) : 0;
    const spacingZ = numZ > 1 ? spanZ / (numZ - 1) : 0;
    for (let i = 0; i < numX; i++) {
      for (let j = 0; j < numZ; j++) {
        const lx = -w / 2 + marginX + i * spacingX;
        const lz = -d / 2 + marginZ + j * spacingZ;
        grid.push([lx, maxH, lz]);
      }
    }
    return grid;
  }, [w, d, maxH]);

  const hideCeiling = topView;

  return (
    <group>
      <mesh geometry={floorCeilingGeom} material={floorMaterial} receiveShadow name="floor" />

      {!hideCeiling &&
        lightPositions.map((pos, idx) => (
          <group key={`pl-${idx}`} position={pos}>
            <pointLight
              position={[0, -0.08, 0]}
              intensity={2.4}
              distance={Math.max(maxH, w, d) * 3.2}
              decay={2}
              color="#fff8ee"
              castShadow
              shadow-mapSize={[1024, 1024]}
            />
            <pointLight
              position={[0, -0.12, 0]}
              intensity={0.75}
              distance={Math.max(maxH, w, d) * 2.9}
              decay={2}
              color="#fffaf0"
            />
          </group>
        ))}

      {!hideCeiling && (
        <mesh geometry={ceilingGeom} material={ceilingMaterial} castShadow receiveShadow name="ceiling" />
      )}

      {Array.from({ length: n }, (_, i) => {
        if (openEdge.has(i)) return null;
        const a = outline[i]!;
        const b = outline[(i + 1) % n]!;
        return (
          <WallSegmentMesh
            key={`w-${i}`}
            ax={a.x}
            az={a.z}
            bx={b.x}
            bz={b.z}
            height={h}
            wallMaterial={wallMaterial}
            openingsDigest={openingsDigest}
            room={room}
            edgeIndex={i}
            openings={openings}
          />
        );
      })}

      {openings.map((o) => {
        if (o.edgeIndex === undefined) return null;
        const edge = outlineNormalAtEdge(outline, o.edgeIndex);
        return <PolygonOpeningMeshes key={`o-${o.id}`} opening={o} edge={edge} />;
      })}
    </group>
  );
}
