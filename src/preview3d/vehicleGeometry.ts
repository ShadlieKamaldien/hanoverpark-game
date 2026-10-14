import type { Polygon } from "../game/systems/collision";
import type { MapPoint } from "../game/world/mapData";
import { PREVIEW } from "./map";

const ppm = 1 / PREVIEW.metresPerPixel;
export type VehiclePose = { position: MapPoint; heading: number; width: number; length: number };

/** Full body including mirrors, in unchanged source-map coordinates. */
export function vehicleFootprint(pose: VehiclePose, padding = 0): Polygon {
  const c = Math.cos(pose.heading), s = Math.sin(pose.heading);
  const w = (pose.width / 2 + padding) * ppm, l = (pose.length / 2 + padding) * ppm;
  return { points: [[-w, -l], [w, -l], [w, l], [-w, l]].map(([x, z]) => ({
    x: pose.position.x + c * x + s * z,
    y: pose.position.y + s * x - c * z,
  })) };
}

function inside(point: MapPoint, ring: MapPoint[]) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}

function inSolid(point: MapPoint, polygon: Polygon) {
  return inside(point, polygon.points) && !(polygon.holes ?? []).some((hole) => inside(point, hole));
}

function segmentsTouch(a: MapPoint, b: MapPoint, c: MapPoint, d: MapPoint) {
  const turn = (p: MapPoint, q: MapPoint, r: MapPoint) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const abC = turn(a, b, c), abD = turn(a, b, d), cdA = turn(c, d, a), cdB = turn(c, d, b);
  if ((abC > 0 && abD < 0 || abC < 0 && abD > 0) && (cdA > 0 && cdB < 0 || cdA < 0 && cdB > 0)) return true;
  const on = (p: MapPoint, q: MapPoint, r: MapPoint, value: number) => Math.abs(value) < 1e-7 &&
    r.x >= Math.min(p.x, q.x) - 1e-7 && r.x <= Math.max(p.x, q.x) + 1e-7 &&
    r.y >= Math.min(p.y, q.y) - 1e-7 && r.y <= Math.max(p.y, q.y) + 1e-7;
  return on(a, b, c, abC) || on(a, b, d, abD) || on(c, d, a, cdA) || on(c, d, b, cdB);
}

/** Handles thin fences, concave buildings and the source courtyard holes. */
export function polygonsOverlap(a: Polygon, b: Polygon) {
  if (a.points.some((point) => inSolid(point, b)) || b.points.some((point) => inSolid(point, a))) return true;
  for (const ringA of [a.points, ...(a.holes ?? [])]) for (const ringB of [b.points, ...(b.holes ?? [])]) {
    for (let i = 0; i < ringA.length; i++) for (let j = 0; j < ringB.length; j++) {
      if (segmentsTouch(ringA[i], ringA[(i + 1) % ringA.length], ringB[j], ringB[(j + 1) % ringB.length])) return true;
    }
  }
  return false;
}

export function pointTouchesVehicle(pose: VehiclePose, point: MapPoint, radius = 0.5) {
  const dx = (point.x - pose.position.x) / ppm, dy = (point.y - pose.position.y) / ppm;
  const x = dx * Math.cos(pose.heading) + dy * Math.sin(pose.heading);
  const z = dx * Math.sin(pose.heading) - dy * Math.cos(pose.heading);
  const gapX = Math.max(0, Math.abs(x) - pose.width / 2);
  const gapZ = Math.max(0, Math.abs(z) - pose.length / 2);
  return gapX * gapX + gapZ * gapZ <= radius * radius;
}

export function vehiclePoint(pose: Pick<VehiclePose, "position" | "heading">, x: number, z: number): MapPoint {
  const c = Math.cos(pose.heading), s = Math.sin(pose.heading);
  return { x: pose.position.x + (c * x + s * z) * ppm,
    y: pose.position.y + (s * x - c * z) * ppm };
}
