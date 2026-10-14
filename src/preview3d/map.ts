import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MAP, type MapPoint, type MapRoad } from "../game/world/mapData";
import { Collision } from "../game/systems/collision";

export const SOURCE = MAP;
const origin = { x: 3400, y: 10400 };
const radius = 400 * MAP.projection.pixelsPerMetre;
const minX = Math.max(MAP.projection.padding, origin.x - radius);
const maxX = Math.min(MAP.width - MAP.projection.padding, origin.x + radius);
const minY = Math.max(MAP.projection.padding, origin.y - radius);
const maxY = Math.min(MAP.height - MAP.projection.padding, origin.y + radius);
export const PREVIEW = {
  origin,
  metresPerPixel: 1 / MAP.projection.pixelsPerMetre,
  bounds: { minX, maxX, minY, maxY, x: minX, y: minY, w: maxX - minX, h: maxY - minY },
};

export function toWorld(point: MapPoint, height = 0) {
  return new Vector3((point.x - origin.x) * PREVIEW.metresPerPixel, height,
    -(point.y - origin.y) * PREVIEW.metresPerPixel);
}
export function fromWorld(point: Vector3): MapPoint {
  return { x: origin.x + point.x / PREVIEW.metresPerPixel,
    y: origin.y - point.z / PREVIEW.metresPerPixel };
}
function intersects(b: { x: number; y: number; w: number; h: number }) {
  return b.x <= maxX && b.y <= maxY && b.x + b.w >= minX && b.y + b.h >= minY;
}
export const BUILDINGS = MAP.buildings.filter((b) => intersects(b.bounds));
export const FIELDS = MAP.fields.filter((b) => intersects(b.bounds));
export const POIS = MAP.pois.filter((p) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY);

/** Clip source centreline segments without inventing streets or changing the database. */
function clipSegment(a: MapPoint, b: MapPoint): [MapPoint, MapPoint] | null {
  const dx = b.x - a.x, dy = b.y - a.y;
  let lo = 0, hi = 1;
  for (const [p, q] of [[-dx, a.x - minX], [dx, maxX - a.x], [-dy, a.y - minY], [dy, maxY - a.y]]) {
    if (p === 0) { if (q < 0) return null; continue; }
    const t = q / p;
    if (p < 0) lo = Math.max(lo, t); else hi = Math.min(hi, t);
    if (lo > hi) return null;
  }
  return [{ x: a.x + dx * lo, y: a.y + dy * lo }, { x: a.x + dx * hi, y: a.y + dy * hi }];
}
export const ROADS: MapRoad[] = MAP.roads.flatMap((road) => {
  const sections: MapRoad[] = [];
  let current: MapPoint[] = [];
  const finish = () => { if (current.length >= 2) sections.push({ ...road, points: current }); current = []; };
  for (let i = 1; i < road.points.length; i++) {
    const segment = clipSegment(road.points[i - 1], road.points[i]);
    if (!segment) { finish(); continue; }
    const [a, b] = segment, previous = current[current.length - 1];
    if (!previous || Math.hypot(previous.x - a.x, previous.y - a.y) > 0.1) { finish(); current.push(a); }
    if (Math.hypot(a.x - b.x, a.y - b.y) > 0.1) current.push(b);
  }
  finish();
  return sections;
});
const collision = new Collision([], BUILDINGS.map((b) => ({ points: b.points, holes: b.holes })));
const downberg = ROADS.filter((r) => r.name === "Downberg Road").flatMap((r) => r.points)
  .filter((p) => p.x > minX + 8 && p.x < maxX - 8 && p.y > minY + 8 && p.y < maxY - 8 && !collision.blocked(p.x, p.y, 6));
if (!downberg.length) throw new Error("No accessible mapped Downberg Road spawn in this preview.");
export const SPAWN: MapPoint = { ...downberg.sort((a, b) => Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y))[0] };

export function closestStreet(point: MapPoint) {
  let nearest = Infinity, name = "Hanover Park";
  for (const road of ROADS) {
    if (!road.name) continue;
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1], b = road.points[i], dx = b.x - a.x, dy = b.y - a.y;
      const length = dx * dx + dy * dy;
      const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
      const distance = Math.hypot(point.x - a.x - dx * t, point.y - a.y - dy * t);
      if (distance < nearest) { nearest = distance; name = road.name; }
    }
  }
  return name;
}
