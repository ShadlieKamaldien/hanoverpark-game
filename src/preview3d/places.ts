import { Collision } from "../game/systems/collision";
import type { MapFootprint, MapPoint } from "../game/world/mapData";
import { BUILDINGS, FIELDS, PREVIEW, ROADS, SOURCE } from "./map";
import { PROPERTY_SOLIDS } from "./properties";

export interface MappedPlace {
  id: string;
  sourceId: number;
  osmType: "node" | "way";
  name: string;
  kind: string;
  /** The original licensed POI coordinate, including places outside the 3D crop. */
  point: MapPoint;
  inPreview: boolean;
  /** Present only for a same-way identity or a containing mapped footprint. */
  buildingId?: number;
}

export interface StorefrontAnchor {
  placeId: string;
  buildingId: number;
  point: MapPoint;
  /** Unit vectors in source map coordinates. */
  tangent: MapPoint;
  normal: MapPoint;
  width: number;
}

function inside(point: MapPoint, ring: MapPoint[]) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > point.y) !== (b.y > point.y) &&
      point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}

const businessKinds = new Set(["supermarket", "pharmacy", "fuel", "fast_food"]);
const bounds = PREVIEW.bounds;

/** Reuse public map identities; no invented branches or relocated businesses. */
export const PLACES: readonly MappedPlace[] = SOURCE.pois.filter((poi) => businessKinds.has(poi.kind)).map((poi) => {
  const building = SOURCE.buildings.find((item) => poi.osmType === "way" && item.osmType === "way" && item.id === poi.id)
    ?? SOURCE.buildings.find((item) => inside(poi, item.points) && !(item.holes ?? []).some((hole) => inside(poi, hole)));
  return {
    id: `osm-${poi.osmType}-${poi.id}`, sourceId: poi.id, osmType: poi.osmType,
    name: poi.name, kind: poi.kind, point: { x: poi.x, y: poi.y },
    inPreview: poi.x >= bounds.minX && poi.x <= bounds.maxX && poi.y >= bounds.minY && poi.y <= bounds.maxY,
    ...(building ? { buildingId: building.id } : {}),
  };
});

function storefront(place: MappedPlace, building: MapFootprint): StorefrontAnchor | undefined {
  const ring = building.points;
  const orientation = ring.reduce((sum, a, i) => {
    const b = ring[(i + 1) % ring.length];
    return sum + a.x * b.y - b.x * a.y;
  }, 0) > 0 ? 1 : -1;
  const candidates = ring.flatMap((a, i) => {
    const b = ring[(i + 1) % ring.length], dx = b.x - a.x, dy = b.y - a.y;
    const length = Math.hypot(dx, dy), metres = length * PREVIEW.metresPerPixel;
    if (metres < 5) return [];
    const width = Math.min(place.kind === "fuel" ? 7 : place.kind === "supermarket" ? 12 : 8, metres - 0.7);
    // Keep the full approximate sign inside this actual facade edge.
    const margin = (width / 2 + 0.2) / metres;
    const t = Math.max(margin, Math.min(1 - margin,
      ((place.point.x - a.x) * dx + (place.point.y - a.y) * dy) / (length * length)));
    const point = { x: a.x + dx * t, y: a.y + dy * t };
    return [{ anchor: { placeId: place.id, buildingId: building.id, point,
      // Read left-to-right when seen from outside, regardless of source winding.
      tangent: { x: -dx / length * orientation, y: -dy / length * orientation },
      normal: { x: dy / length * orientation, y: -dx / length * orientation }, width },
    distance: Math.hypot(point.x - place.point.x, point.y - place.point.y) }];
  });
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0]?.anchor;
}

/** Original facade artwork is attached only to verified source geometry. */
export const STOREFRONTS: readonly StorefrontAnchor[] = PLACES.filter((place) => place.inPreview && place.buildingId !== undefined)
  .flatMap((place) => {
    const building = BUILDINGS.find((item) => item.id === place.buildingId);
    const anchor = building && storefront(place, building);
    return anchor ? [anchor] : [];
  });

export const SHOPRITE_PLACE_ID = "osm-node-2119093639";

function segmentDistance(point: MapPoint, a: MapPoint, b: MapPoint) {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
  return Math.hypot(point.x - a.x - dx * t, point.y - a.y - dy * t);
}

function shopriteApproach(): MapPoint {
  const anchor = STOREFRONTS.find((item) => item.placeId === SHOPRITE_PLACE_ID);
  if (!anchor) throw new Error("The mapped Shoprite facade is unavailable.");
  const ppm = 1 / PREVIEW.metresPerPixel;
  const collision = new Collision([], [
    ...BUILDINGS.map(({ points, holes }) => ({ points, holes })),
    ...PROPERTY_SOLIDS, ...FIELDS.map(({ points, holes }) => ({ points, holes })),
  ]);
  for (const offset of [2.2, 3.2, 4.5, 6]) for (const along of [0, -2, 2, -4, 4]) {
    const point = {
      x: anchor.point.x + (anchor.normal.x * offset + anchor.tangent.x * along) * ppm,
      y: anchor.point.y + (anchor.normal.y * offset + anchor.tangent.y * along) * ppm,
    };
    if (collision.blocked(point.x, point.y, 0.8 * ppm)) continue;
    if (ROADS.some((road) => !["path", "footway", "steps", "pedestrian", "cycleway"].includes(road.kind) &&
      road.points.slice(1).some((b, i) => segmentDistance(point, road.points[i], b) < road.width / 2 + 1.1 * ppm))) continue;
    return point;
  }
  throw new Error("No clear approach was found outside the mapped Shoprite facade.");
}

/** Gameplay collection point outside the wall; it does not relocate the POI. */
export const SHOPRITE_APPROACH: MapPoint = shopriteApproach();
