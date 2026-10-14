import data from "./mapData.json";
export interface MapPoint {
  x: number;
  y: number;
}
export interface MapRoad {
  id: number;
  name: string | null;
  kind: string;
  width: number;
  points: MapPoint[];
}
export interface MapFootprint {
  osmType: "way" | "relation";
  holes?: MapPoint[][];
  id: number;
  name: string | null;
  kind: string;
  points: MapPoint[];
  bounds: { x: number; y: number; w: number; h: number };
  levels?: number;
}
export interface MapPOI extends MapPoint {
  osmType: "node" | "way";
  id: number;
  name: string;
  kind: string;
}
export interface MapDefinition {
  id: string;
  width: number;
  height: number;
  boundary: MapPoint[];
  source: { attribution: string; license: string; [key: string]: unknown };
  projection: {
    originLatitude: number;
    originLongitude: number;
    pixelsPerMetre: number;
    latitudeCosine: number;
    padding: number;
    orientation: string;
  };
  roads: MapRoad[];
  buildings: MapFootprint[];
  fields: MapFootprint[];
  pois: MapPOI[];
  locations: {
    spawn: MapPoint;
    car: MapPoint & { angle: number };
    fatima: MapPoint;
    gatie: MapPoint;
    jerome: MapPoint;
    target: MapPoint & { name: string; id: number };
    pitch: MapPoint & { name: string };
    taxi: MapPoint;
    shop: MapPOI;
    walkers: (MapPoint & { dx: number; dy: number })[];
  };
  deliveryPath: MapPoint[];
  notes: string[];
}
export const MAP = data as MapDefinition;
export function gameCoordinates(x: number, y: number) {
  const p = MAP.projection;
  return {
    latitude: p.originLatitude - (y - p.padding) / (111320 * p.pixelsPerMetre),
    longitude:
      p.originLongitude +
      (x - p.padding) / (111320 * p.pixelsPerMetre * p.latitudeCosine),
  };
}
export function distanceToRoad(x: number, y: number) {
  let nearest = Infinity;
  let kind = "earth";
  for (const road of MAP.roads)
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1],
        b = road.points[i];
      const dx = b.x - a.x,
        dy = b.y - a.y,
        l = dx * dx + dy * dy;
      const t = l
        ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l))
        : 0;
      const distance = Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
      if (distance < nearest) {
        nearest = distance;
        kind =
          distance <= road.width / 2
            ? ["footway", "path", "steps"].includes(road.kind)
              ? "pavement"
              : "road"
            : "earth";
      }
    }
  return kind as "road" | "pavement" | "earth";
}
