import * as THREE from "three";
import { ceilingY } from "@/app/planner/utils/roomCeiling";
import {
  getRule,
  getSurfacesForRule,
  resolvePlacementRuleId,
} from "@/config/placementRules";

const _n = new THREE.Vector3();
const _t1 = new THREE.Vector3();
const _t2 = new THREE.Vector3();
const _tmp = new THREE.Vector3();

/**
 * @param {THREE.Intersection} intersection
 * @returns {THREE.Vector3}
 */
export function worldNormalFromIntersection(intersection) {
  const mesh = /** @type {THREE.Mesh} */ (intersection.object);
  const face = intersection.face;
  if (!face) {
    return _n.set(0, 1, 0);
  }
  _n.copy(face.normal);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  _n.applyMatrix3(normalMatrix).normalize();
  return _n;
}

/** @param {import("@/app/planner/types").PlannerCatalogItem} catalogItem */
export function ruleIdForCatalogItem(catalogItem) {
  return resolvePlacementRuleId(catalogItem);
}

/**
 * @param {string} categoryId
 * @param {{ widthM?: number }} [itemDims]
 * @returns {{ surfaceType: string; zone: string }[]}
 */
function getValidSurfaces(categoryId, itemDims) {
  return getSurfacesForRule(categoryId, itemDims);
}

/**
 * @param {string} surfaceType
 * @param {string} zone
 * @param {string} categoryId
 * @param {{ widthM?: number }} [itemDims]
 * @param {{ userData?: Record<string, unknown> }} [hitMesh]
 */
function surfaceMatchesRule(surfaceType, zone, categoryId, itemDims, hitMesh) {
  const valid = getValidSurfaces(categoryId, itemDims);
  const ud = hitMesh?.userData ?? {};
  if (categoryId === "kitchen_magnetic_strip" && ud.kitchenWall === false) {
    return false;
  }
  if (categoryId === "refrigerator" && zone === "outdoor") {
    if (ud.patioType !== "covered") return false;
  }
  return valid.some((s) => s.surfaceType === surfaceType && s.zone === zone);
}

/**
 * @param {*} room
 * @param {number} x
 * @param {number} z
 * @returns {THREE.Vector3} room center on floor (xz centroid)
 */
function roomCentroidXZ(room, x, z) {
  const outline = room.floorOutline;
  if (outline && outline.length > 0) {
    let sx = 0;
    let sz = 0;
    for (const p of outline) {
      sx += p.x;
      sz += p.z;
    }
    const n = outline.length;
    return new THREE.Vector3(sx / n, 0, sz / n);
  }
  return new THREE.Vector3(0, 0, 0);
}

/**
 * @param {'face_wall_inward'|'face_wall_outward'|'face_down'|'face_room_center'|'upright'|'lay_flat'} rotation
 * @param {THREE.Vector3} wallNormalWorld — points into room for interior walls
 * @param {THREE.Vector3} fromPoint
 * @param {*} room
 */
function rotationYFromPolicy(rotation, wallNormalWorld, fromPoint, room) {
  if (rotation === "face_down") {
    return 0;
  }
  if (rotation === "lay_flat") {
    return 0;
  }
  if (rotation === "upright") {
    return 0;
  }
  if (rotation === "face_room_center") {
    const c = roomCentroidXZ(room, fromPoint.x, fromPoint.z);
    const dx = c.x - fromPoint.x;
    const dz = c.z - fromPoint.z;
    if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6) return 0;
    return Math.atan2(dx, dz);
  }
  const nx = wallNormalWorld.x;
  const nz = wallNormalWorld.z;
  const base = Math.atan2(nx, nz);
  if (rotation === "face_wall_inward") {
    return base + Math.PI;
  }
  return base;
}

/**
 * Clamp mount height (m) from floor to rule band, using hit Y as starting point for wall mounts.
 */
function clampMountY(y, rule) {
  let yUse = y;
  if (rule.fixedMountY != null) {
    yUse = rule.fixedMountY;
  } else if (rule.mountHeightMin != null && rule.mountHeightMax != null) {
    yUse = Math.min(Math.max(y, rule.mountHeightMin), rule.mountHeightMax);
  }
  return yUse;
}

function wallNormalFromHit(ud, faceNormalWorld) {
  if (ud.wallNormal instanceof THREE.Vector3) {
    return ud.wallNormal.clone().normalize();
  }
  const arr = ud.wallNormalArr;
  if (Array.isArray(arr) && arr.length >= 3) {
    return new THREE.Vector3(Number(arr[0]), Number(arr[1]), Number(arr[2])).normalize();
  }
  return faceNormalWorld.clone().normalize();
}

/**
 * @param {object} placedItem
 * @param {THREE.Vector3} hitPoint
 * @param {THREE.Intersection} intersection
 * @param {{ width: number; depth: number; height: number }} dims meters
 * @param {*} room
 * @param {string} ruleId
 * @returns {{ position: {x:number;z:number}; positionY: number; rotationY: number }}
 */
export function snapToSurface(placedItem, hitPoint, intersection, dims, room, ruleId) {
  const mesh = /** @type {THREE.Mesh} */ (intersection.object);
  const ud = mesh.userData || {};
  const surfaceType = ud.surfaceType ?? "";
  const zone = ud.zone ?? "indoor";
  const rule = getRule(ruleId);
  const normal = worldNormalFromIntersection(intersection);

  const width = dims.width;
  const depth = dims.depth;
  const height = dims.height;

  /** @type {THREE.Vector3} */
  let wallN;
  if (surfaceType === "wall") {
    if (ud.wallNormal instanceof THREE.Vector3) {
      wallN = ud.wallNormal.clone().normalize();
    } else {
      wallN = wallNormalFromHit(ud, normal);
      if (wallN.y > 0.9) wallN.set(0, 0, 1);
    }
  } else {
    wallN = normal.clone();
  }

  let px = hitPoint.x;
  let pz = hitPoint.z;
  let py = 0;
  let rotY = placedItem.rotationY ?? 0;

  if (surfaceType === "wall") {
    const mountCenterY = clampMountY(hitPoint.y, rule);
    py = mountCenterY - height / 2;
    /** Push item into room so back face sits on wall plane */
    const offset = depth / 2 + 0.002;
    px = hitPoint.x + wallN.x * offset;
    pz = hitPoint.z + wallN.z * offset;
    rotY = rotationYFromPolicy(rule.rotation ?? "face_wall_inward", wallN, new THREE.Vector3(px, mountCenterY, pz), room);
  } else if (surfaceType === "ceiling") {
    const cy = ceilingY(room, hitPoint.x, hitPoint.z);
    const hang = height / 2 + 0.02;
    py = cy - hang;
    px = hitPoint.x;
    pz = hitPoint.z;
    rotY = rotationYFromPolicy(rule.rotation ?? "face_down", new THREE.Vector3(0, -1, 0), new THREE.Vector3(px, py, pz), room);
  } else if (
    surfaceType === "floor" ||
    surfaceType === "ground" ||
    surfaceType === "countertop" ||
    surfaceType === "table" ||
    surfaceType === "shelf" ||
    surfaceType === "fence"
  ) {
    /** Bottom of bbox: `positionY` is floor contact height (see FurnitureMesh). */
    const top =
      typeof ud.surfaceTopY === "number"
        ? ud.surfaceTopY
        : surfaceType === "fence"
          ? hitPoint.y
          : 0;
    py = top;
    px = hitPoint.x;
    pz = hitPoint.z;
    rotY = rotationYFromPolicy(rule.rotation ?? "upright", new THREE.Vector3(0, 1, 0), new THREE.Vector3(px, py, pz), room);
  } else {
    py = height / 2;
    px = hitPoint.x;
    pz = hitPoint.z;
  }

  return {
    position: { x: px, z: pz },
    positionY: py,
    rotationY: rotY,
  };
}

/**
 * @param {*} placedItem
 * @param {THREE.Intersection|null} intersection
 * @param {*} room
 * @param {string} ruleId
 * @param {{ widthM: number }} dims
 * @returns {{ valid: boolean; reason: string }}
 */
export function isValidPlacement(placedItem, intersection, room, ruleId, dims) {
  if (!intersection) {
    return { valid: false, reason: "Point at an empty area" };
  }
  const mesh = /** @type {THREE.Mesh} */ (intersection.object);
  const ud = mesh.userData || {};
  if (ud.placementRaycast === false) {
    return { valid: false, reason: "Cannot place here" };
  }
  const surfaceType = ud.surfaceType;
  const zone = ud.zone ?? "indoor";
  if (!surfaceType) {
    return { valid: false, reason: "Not a placement surface" };
  }

  const rule = getRule(ruleId);
  if (!surfaceMatchesRule(surfaceType, zone, ruleId, { widthM: dims.widthM }, mesh)) {
    return {
      valid: false,
      reason: getInvalidReasonForRule(ruleId, surfaceType, zone),
    };
  }

  if (rule.interiorWallOnly && zone === "exterior") {
    return { valid: false, reason: "Interior wall only" };
  }
  if (rule.exteriorWallOnly && zone !== "exterior") {
    return { valid: false, reason: "Exterior wall only" };
  }
  if (rule.kitchenWallOnly && !ud.kitchenWall) {
    return { valid: false, reason: "Kitchen wall only" };
  }

  if (rule.requiresWallTouch && (surfaceType === "floor" || surfaceType === "ground")) {
    const w = room.width;
    const d = room.depth;
    const px = intersection.point.x;
    const pz = intersection.point.z;
    const margin = 0.03;
    const hw = w / 2;
    const hd = d / 2;
    const nearWall =
      px <= -hw + margin ||
      px >= hw - margin ||
      pz <= -hd + margin ||
      pz >= hd - margin;
    let nearPolyWall = nearWall;
    const outline = room.floorOutline;
    if (outline && outline.length > 2) {
      const eps = 0.08;
      nearPolyWall = false;
      for (let i = 0; i < outline.length; i++) {
        const a = outline[i];
        const b = outline[(i + 1) % outline.length];
        const dist = pointSegmentDistXZ(px, pz, a.x, a.z, b.x, b.z);
        if (dist < eps) {
          nearPolyWall = true;
          break;
        }
      }
    }
    if (!nearPolyWall) {
      return { valid: false, reason: "Must be against a wall" };
    }
  }

  return { valid: true, reason: "" };
}

function pointSegmentDistXZ(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const apx = px - ax;
  const apz = pz - az;
  const t = Math.max(0, Math.min(1, (apx * abx + apz * abz) / (abx * abx + abz * abz || 1)));
  const qx = ax + t * abx;
  const qz = az + t * abz;
  return Math.hypot(px - qx, pz - qz);
}

function getInvalidReasonForRule(ruleId, surfaceType, zone) {
  if (ruleId === "smart_tv" && surfaceType !== "wall") {
    return "Wall mount only (or use a large TV for floor stand)";
  }
  if (/^small_appliance|^kitchen_/.test(ruleId) && surfaceType === "floor") {
    return "Belongs on a counter or table";
  }
  if (ruleId === "refrigerator" && zone === "outdoor") {
    return "Fridge: covered patio floor only";
  }
  return `Cannot place on ${surfaceType} (${zone})`;
}

/**
 * @param {*} placedItem
 * @param {THREE.Intersection|null} intersection
 * @param {string} ruleId
 */
export function constrainMovement(placedItem, intersection, ruleId) {
  const rule = getRule(ruleId);
  const mode = rule.movement ?? "floor_plane";
  const mesh = intersection ? /** @type {THREE.Mesh} */ (intersection.object) : null;
  const ud = mesh?.userData ?? {};
  let wallNormal = null;
  if (ud.wallNormal instanceof THREE.Vector3) {
    wallNormal = ud.wallNormal.clone().normalize();
  } else if (Array.isArray(ud.wallNormalArr) && ud.wallNormalArr.length >= 3) {
    wallNormal = new THREE.Vector3(
      Number(ud.wallNormalArr[0]),
      Number(ud.wallNormalArr[1]),
      Number(ud.wallNormalArr[2])
    ).normalize();
  }

  if (mode === "wall_slide" && wallNormal) {
    _t1.set(-wallNormal.z, 0, wallNormal.x).normalize();
    _t2.set(0, 1, 0);
    return {
      mode: "wall",
      wallNormal: wallNormal.clone(),
      tangentAlong: _t1.clone(),
      vertical: _t2.clone(),
      heightLocked: rule.fixedMountY != null,
    };
  }
  if (mode === "ceiling_plane") {
    return {
      mode: "ceiling",
      wallNormal: new THREE.Vector3(0, -1, 0),
      tangentAlong: new THREE.Vector3(1, 0, 0),
      tangent2: new THREE.Vector3(0, 0, 1),
      heightLocked: true,
    };
  }
  return {
    mode: "floor",
    wallNormal: new THREE.Vector3(0, 1, 0),
    tangentAlong: new THREE.Vector3(1, 0, 0),
    tangent2: new THREE.Vector3(0, 0, 1),
    heightLocked: rule.fixedMountY != null,
  };
}

function itemBox(item, cat) {
  const w = item.width ?? cat.width;
  const h = item.height ?? cat.height;
  const d = item.depth ?? cat.depth;
  const x = item.position.x;
  const z = item.position.z;
  const y = (item.positionY ?? 0) + h / 2;
  return {
    minX: x - w / 2,
    maxX: x + w / 2,
    minY: item.positionY ?? 0,
    maxY: (item.positionY ?? 0) + h,
    minZ: z - d / 2,
    maxZ: z + d / 2,
  };
}

function boxesOverlap(a, b) {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY || a.maxZ < b.minZ || a.minZ > b.maxZ);
}

/**
 * @param {*} item
 * @param {*} catalogItem
 * @param {*} scene — unused; reserved
 * @param {*} placedItems
 * @param {*} room
 * @param {*} catalog
 * @param {string} ruleId
 */
export function checkClearance(item, scene, placedItems, room, catalog, ruleId) {
  const warnings = [];
  const rule = getRule(ruleId);
  const cat = catalogItemById(catalog, item.catalogId);
  if (!cat) return { clear: true, warnings };

  const box = itemBox(item, cat);

  if (rule.clearance?.sideM || rule.clearance?.topM) {
    const sideM = rule.clearance.sideM ?? 0;
    const topM = rule.clearance.topM ?? 0;
    for (const other of placedItems) {
      if (other.id === item.id) continue;
      const oc = catalogItemById(catalog, other.catalogId);
      if (!oc) continue;
      const ob = itemBox(other, oc);
      const gapX = Math.min(box.maxX, ob.maxX) - Math.max(box.minX, ob.minX);
      const gapZ = Math.min(box.maxZ, ob.maxZ) - Math.max(box.minZ, ob.minZ);
      if (gapX > 0 && gapZ > 0 && gapX < sideM * 2 && boxesOverlap(box, ob)) {
        warnings.push(`Side clearance: keep ${sideM * 100}cm from neighbors`);
        break;
      }
      if (ob.minY > box.maxY - 1e-6 && ob.minY < box.maxY + topM) {
        const ox = (ob.minX + ob.maxX) / 2;
        const oz = (ob.minZ + ob.maxZ) / 2;
        if (Math.abs(ox - (box.minX + box.maxX) / 2) < (box.maxX - box.minX) && Math.abs(oz - (box.minZ + box.maxZ) / 2) < (box.maxZ - box.minZ)) {
          warnings.push(`Top clearance: need ${topM * 100}cm above`);
          break;
        }
      }
    }
  }

  if (rule.clearanceAboveM != null) {
    const scanY0 = box.maxY;
    const scanY1 = box.maxY + rule.clearanceAboveM;
    for (const other of placedItems) {
      if (other.id === item.id) continue;
      const oc = catalogItemById(catalog, other.catalogId);
      if (!oc) continue;
      const ob = itemBox(other, oc);
      if (ob.maxY <= scanY0) continue;
      if (ob.minY > scanY1) continue;
      const ocx = (ob.minX + ob.maxX) / 2;
      const ocz = (ob.minZ + ob.maxZ) / 2;
      const icx = (box.minX + box.maxX) / 2;
      const icz = (box.minZ + box.maxZ) / 2;
      const overlapXZ =
        Math.abs(ocx - icx) < (box.maxX - box.minX) / 2 + (ob.maxX - ob.minX) / 2 &&
        Math.abs(ocz - icz) < (box.maxZ - box.minZ) / 2 + (ob.maxZ - ob.minZ) / 2;
      if (overlapXZ && ob.minY < scanY1) {
        warnings.push(`Need ${Math.round(rule.clearanceAboveM * 100)}cm clearance above (cabinet)`);
        break;
      }
    }
  }

  return { clear: warnings.length === 0, warnings };
}

function catalogItemById(catalog, id) {
  return catalog.find((c) => c.id === id);
}

/**
 * Push floor item flush to nearest wall (XZ).
 */
export function autoAlign(item, scene, placedItems, room, catalog, ruleId) {
  const rule = getRule(ruleId);
  const cat = catalogItemById(catalog, item.catalogId);
  if (!cat) return item;

  const w = item.width ?? cat.width;
  const d = item.depth ?? cat.depth;
  const h = item.height ?? cat.height;

  let next = { ...item };

  if (ruleId === "speaker_soundbar") {
    let bestTv = null;
    let bestD = Infinity;
    for (const p of placedItems) {
      if (p.id === item.id) continue;
      const pc = catalogItemById(catalog, p.catalogId);
      if (!pc) continue;
      const rid = resolvePlacementRuleId(pc);
      if (rid !== "smart_tv") continue;
      const dist = Math.hypot(p.position.x - item.position.x, p.position.z - item.position.z);
      if (dist < bestD) {
        bestD = dist;
        bestTv = p;
      }
    }
    if (bestTv && bestD < 2.5) {
      const pc = catalogItemById(catalog, bestTv.catalogId);
      if (pc) {
        const th = bestTv.height ?? pc.height;
        const ty = (bestTv.positionY ?? 0) + th / 2;
        const barHalf = h / 2;
        next = {
          ...next,
          position: { x: bestTv.position.x, z: bestTv.position.z },
          positionY: ty - th / 2 - barHalf - 0.05,
          rotationY: bestTv.rotationY ?? 0,
        };
      }
    }
    return next;
  }

  if (
    ruleId === "refrigerator" ||
    ruleId === "speaker_subwoofer" ||
    ruleId === "ac_floor" ||
    (ruleId === "ac_outdoor_unit" && !item.positionY)
  ) {
    const hw = room.width / 2;
    const hd = room.depth / 2;
    const px = item.position.x;
    const pz = item.position.z;
    const halfW = w / 2;
    const halfD = d / 2;
    const dists = [
      { wall: "left", dist: px - (-hw + halfW), nx: 1, nz: 0, cx: -hw + halfW, cz: pz },
      { wall: "right", dist: hw - halfW - px, nx: -1, nz: 0, cx: hw - halfW, cz: pz },
      { wall: "front", dist: pz - (-hd + halfD), nx: 0, nz: 1, cx: px, cz: -hd + halfD },
      { wall: "back", dist: hd - halfD - pz, nx: 0, nz: -1, cx: px, cz: hd - halfD },
    ].sort((a, b) => a.dist - b.dist);
    const best = dists[0];
    if (best) {
      next = {
        ...next,
        position: { x: best.cx, z: best.cz },
        rotationY: Math.atan2(best.nx, best.nz) + Math.PI,
      };
    }
  }

  if (ruleId === "smart_display") {
    const c = roomCentroidXZ(room, next.position.x, next.position.z);
    next = {
      ...next,
      rotationY: Math.atan2(c.x - next.position.x, c.z - next.position.z),
    };
  }

  return next;
}

const PlacementManager = {
  getValidSurfaces,
  snapToSurface,
  isValidPlacement,
  constrainMovement,
  checkClearance,
  autoAlign,
  worldNormalFromIntersection,
  ruleIdForCatalogItem,
  resolvePlacementRuleId,
};

export default PlacementManager;
