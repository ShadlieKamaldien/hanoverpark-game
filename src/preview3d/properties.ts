import type { MapPoint } from "../game/world/mapData";
import type { Polygon } from "../game/systems/collision";
import { BUILDINGS, FIELDS, PREVIEW, ROADS, SOURCE, SPAWN } from "./map";

export interface PropertyWall {
  a: MapPoint;
  b: MapPoint;
  height: number;
  thickness: number;
}

export interface WeatheredProperty {
  id: string;
  centre: MapPoint;
  /** Babylon rotation: zero faces world +z. All dimensions are metres. */
  heading: number;
  width: number;
  depth: number;
  height: number;
  seed: number;
  yardDepth: number;
  footprint: MapPoint[];
  lot: MapPoint[];
  walls: PropertyWall[];
  gate: { centre: MapPoint; width: number; inward: MapPoint };
}

const ppm = 1 / PREVIEW.metresPerPixel;

function inside(p: MapPoint, ring: MapPoint[]) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}

function distance(p: MapPoint, a: MapPoint, b: MapPoint) {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}

function crossed(a: MapPoint, b: MapPoint, c: MapPoint, d: MapPoint) {
  const turn = (p: MapPoint, q: MapPoint, r: MapPoint) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return turn(a, b, c) * turn(a, b, d) < 0 && turn(c, d, a) * turn(c, d, b) < 0;
}

function ringDistance(a: MapPoint[], b: MapPoint[]) {
  let nearest = Infinity;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
    const ae = a[(i + 1) % a.length], be = b[(j + 1) % b.length];
    if (crossed(a[i], ae, b[j], be)) return 0;
    nearest = Math.min(nearest, distance(a[i], b[j], be), distance(ae, b[j], be), distance(b[j], a[i], ae), distance(be, a[i], ae));
  }
  return nearest;
}

function separated(lot: MapPoint[], footprint: { points: MapPoint[]; holes?: MapPoint[][] }, margin: number) {
  const inSolid = (point: MapPoint) => inside(point, footprint.points) && !(footprint.holes ?? []).some((hole) => inside(point, hole));
  // Also exclude court interiors: these additions belong between the flats.
  if (lot.some((point) => inside(point, footprint.points)) || footprint.points.some((point) => inside(point, lot))) return false;
  return !lot.some(inSolid) && ringDistance(lot, footprint.points) > margin;
}

export function propertyPoint(property: Pick<WeatheredProperty, "centre" | "heading">, x: number, z: number): MapPoint {
  const c = Math.cos(property.heading), s = Math.sin(property.heading);
  return { x: property.centre.x + (c * x + s * z) * ppm, y: property.centre.y + (s * x - c * z) * ppm };
}

function makeProperty(centre: MapPoint, heading: number, seed: number): WeatheredProperty {
  const width = 6.2 + seed % 4 * 0.45, depth = 5.8 + seed % 3 * 0.5, yardDepth = 3.1 + seed % 2 * 0.4;
  const property = { id: `original-old-house-${seed}`, centre, heading, width, depth, height: 2.6 + seed % 3 * 0.12, seed, yardDepth };
  const p = (x: number, z: number) => propertyPoint(property, x, z);
  const footprint = [p(-width / 2, -depth / 2), p(width / 2, -depth / 2), p(width / 2, depth / 2), p(-width / 2, depth / 2)];
  const side = width / 2 + 1.55, front = depth / 2 + yardDepth, back = -depth / 2 - 1.1;
  const lot = [p(-side, back), p(side, back), p(side, front), p(-side, front)];
  const gateWidth = 1.9;
  const wall = (a: MapPoint, b: MapPoint, index: number): PropertyWall => ({ a, b, thickness: 0.22, height: 1.12 + (seed + index) % 4 * 0.13 });
  const walls = [wall(lot[0], lot[1], 0), wall(lot[1], lot[2], 1), wall(lot[3], lot[0], 2),
    wall(p(-side, front), p(-gateWidth / 2, front), 3), wall(p(gateWidth / 2, front), p(side, front), 4)];
  return { ...property, footprint, lot, walls, gate: { centre: p(0, front), width: gateWidth,
    inward: { x: -Math.sin(heading), y: Math.cos(heading) } } };
}

function placements(): WeatheredProperty[] {
  const segments = ROADS.flatMap((road) => road.points.slice(1).map((b, i) => ({ road, a: road.points[i], b })));
  const flats = BUILDINGS.filter((building) => building.kind === "apartments");
  const candidates: { property: WeatheredProperty; priority: number }[] = [];
  let seed = 0;
  for (const { road, a, b } of segments) {
    if (["footway", "path", "steps", "pedestrian", "cycleway"].includes(road.kind)) continue;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 7 * ppm) continue;
    const tx = (b.x - a.x) / length, ty = (b.y - a.y) / length;
    const count = Math.max(1, Math.floor(length / (14 * ppm)));
    for (let i = 0; i < count; i++) for (const side of [-1, 1]) {
      const number = seed++;
      const frontX = ty * side, frontY = -tx * side;
      const heading = Math.atan2(frontX, -frontY);
      const along = (i + 0.5) / count * length;
      // Reserve the complete pavement and the gate's half-thickness.
      const reach = road.width / 2 + (2.65 + (5.8 + number % 3 * 0.5) / 2 + 3.1 + number % 2 * 0.4) * ppm;
      const centre = { x: a.x + tx * along - frontX * reach, y: a.y + ty * along - frontY * reach };
      const property = makeProperty(centre, heading, number);
      const nearFlats = flats.map((flat) => Math.min(...flat.points.map((point, j) => distance(centre, point, flat.points[(j + 1) % flat.points.length])))).sort((x, y) => x - y);
      if (nearFlats[0] > 58 * ppm || nearFlats[1] > 145 * ppm) continue;
      const bounds = PREVIEW.bounds;
      if (!property.lot.every((point) => point.x > bounds.minX + 2 * ppm && point.x < bounds.maxX - 2 * ppm && point.y > bounds.minY + 2 * ppm && point.y < bounds.maxY - 2 * ppm && inside(point, SOURCE.boundary))) continue;
      if (BUILDINGS.some((building) => !separated(property.lot, building, 2.1 * ppm)) || FIELDS.some((field) => !separated(property.lot, field, 0.8 * ppm))) continue;
      if (inside(SPAWN, property.lot) || property.lot.some((point) => Math.hypot(point.x - SPAWN.x, point.y - SPAWN.y) < 12 * ppm)) continue;
      if (segments.some(({ road: other, a: start, b: end }) => {
        if (inside(start, property.lot) || inside(end, property.lot)) return true;
        const clearance = other.width / 2 + (["footway", "path", "steps", "pedestrian"].includes(other.kind) ? 1.0 : 2.1) * ppm;
        return property.lot.some((point, j) => crossed(point, property.lot[(j + 1) % property.lot.length], start, end) ||
          Math.min(distance(point, start, end), distance(start, point, property.lot[(j + 1) % property.lot.length]), distance(end, point, property.lot[(j + 1) % property.lot.length])) <= clearance);
      })) continue;
      candidates.push({ property, priority: Math.hypot(centre.x - SPAWN.x, centre.y - SPAWN.y) + nearFlats[0] * 0.7 + nearFlats[1] * 0.15 });
    }
  }
  candidates.sort((a, b) => a.priority - b.priority || a.property.seed - b.property.seed);
  const result: WeatheredProperty[] = [];
  for (const { property } of candidates) {
    if (result.length >= 10) break;
    if (result.some((other) => !separated(property.lot, { points: other.lot }, 3.0 * ppm))) continue;
    result.push(property);
  }
  return result;
}

/** Original infill artwork, independent of the unchanged OpenStreetMap records. */
export const WEATHERED_PROPERTIES = placements();
export const PROPERTY_SOLIDS: Polygon[] = WEATHERED_PROPERTIES.flatMap((property) => [
  { points: property.footprint },
  ...property.walls.map(({ a, b, thickness }) => {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const nx = -(b.y - a.y) / length * thickness * ppm / 2, ny = (b.x - a.x) / length * thickness * ppm / 2;
    return { points: [{ x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny }, { x: b.x - nx, y: b.y - ny }, { x: a.x - nx, y: a.y - ny }] };
  }),
]);
