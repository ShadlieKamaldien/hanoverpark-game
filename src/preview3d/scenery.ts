import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";
import type { MapFootprint, MapPoint } from "../game/world/mapData";
import { Batch } from "./geometry";
import { BUILDINGS, FIELDS, PREVIEW, ROADS, SPAWN, fromWorld, toWorld } from "./map";
import { WEATHERED_PROPERTIES } from "./properties";

export interface SceneryPlacement {
  kind: "tree" | "shrub" | "bench" | "bin" | "bollard" | "drain" | "wear";
  position: MapPoint;
  /** Ground footprint for decorative furniture; tree crowns sit above it. */
  radiusMetres: number;
}

type Candidate = { point: Vector3; tangent: Vector3; normal: Vector3; halfWidth: number; side: number; priority: number; index: number };

function inside(point: MapPoint, ring: MapPoint[]) {
  let value = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) value = !value;
  }
  return value;
}

function distance(point: MapPoint, a: MapPoint, b: MapPoint) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const squared = dx * dx + dy * dy;
  const t = squared ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / squared)) : 0;
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}

function clearOfFootprint(point: MapPoint, radius: number, footprint: Pick<MapFootprint, "points" | "holes">) {
  const rings = [footprint.points, ...(footprint.holes ?? [])];
  const inOuter = inside(point, footprint.points);
  const inHole = (footprint.holes ?? []).some((hole) => inside(point, hole));
  if (inOuter && !inHole) return false;
  return !rings.some((ring) => ring.some((a, i) => distance(point, a, ring[(i + 1) % ring.length]) < radius));
}

/** Decorative locations are deliberately approximate, never source map records. */
export function buildScenery(scene: Scene): {
  shadowCasters: AbstractMesh[];
  stats: { trees: number; props: number };
  placements: SceneryPlacement[];
} {
  const make = (name: string, colour: string) => {
    const material = new StandardMaterial(`scenery-${name}`, scene);
    material.diffuseColor = Color3.FromHexString(colour);
    material.specularColor = new Color3(0.02, 0.02, 0.02);
    return new Batch(`scenery-${name}`, material);
  };
  const b = {
    bark: make("bark", "#685547"),
    leaves: [make("leaves-olive", "#627947"), make("leaves-light", "#819652"), make("leaves-shadow", "#4d6643")],
    mulch: make("tree-beds", "#84795b"),
    wood: make("bench-timber", "#9b7d53"),
    metal: make("furniture-metal", "#435458"),
    bin: make("wheelie-bins", "#526650"),
    dark: make("grates-and-wheels", "#303d3e"),
    cap: make("bollard-reflectors", "#c8ae62"),
    patch: make("tar-repairs", "#41494a"),
    concrete: make("pavement-wear", "#979a8e"),
  };
  const batches = Object.values(b).flat();
  const placements: SceneryPlacement[] = [];
  const occupied: { point: Vector3; radius: number }[] = [];
  const spawn = toWorld(SPAWN);
  const mpp = PREVIEW.metresPerPixel;
  const segments = ROADS.flatMap((road) => road.points.slice(1).map((end, i) => ({ road, a: road.points[i], end })));

  const clear = (point: Vector3, radius: number, roadClearance = radius) => {
    const p = fromWorld(point), sourceRadius = radius / mpp;
    const bounds = PREVIEW.bounds;
    if (p.x < bounds.minX + sourceRadius || p.x > bounds.maxX - sourceRadius || p.y < bounds.minY + sourceRadius || p.y > bounds.maxY - sourceRadius) return false;
    if (BUILDINGS.some((building) => !clearOfFootprint(p, sourceRadius + 2.4 / mpp, building))) return false;
    if (WEATHERED_PROPERTIES.some((property) => !clearOfFootprint(p, sourceRadius + 0.7 / mpp, { points: property.lot }))) return false;
    // Keep every mapped playing surface clear, including nested pitch outlines.
    if (FIELDS.some((field) => !clearOfFootprint(p, sourceRadius, field))) return false;
    if (segments.some(({ road, a, end }) => {
      const walk = ["footway", "path", "steps", "pedestrian"].includes(road.kind);
      const outsidePavement = road.width / 2 + (walk ? 0.15 : 1.35) / mpp;
      return distance(p, a, end) < outsidePavement + roadClearance / mpp;
    })) return false;
    return !occupied.some((item) => Vector3.DistanceSquared(point, item.point) < (radius + item.radius + 1.2) ** 2);
  };
  const record = (kind: SceneryPlacement["kind"], point: Vector3, radiusMetres: number, reserve = true) => {
    placements.push({ kind, position: fromWorld(point), radiusMetres });
    if (reserve) occupied.push({ point, radius: radiusMetres });
  };

  // Sample along complete paths so short source segments receive equal care.
  const candidates: Candidate[] = [];
  let index = 0;
  for (const road of ROADS) {
    if (["footway", "path", "steps", "pedestrian", "cycleway"].includes(road.kind)) continue;
    let untilNext = 9;
    for (let i = 1; i < road.points.length; i++) {
      const start = toWorld(road.points[i - 1]), end = toWorld(road.points[i]);
      const length = Vector3.Distance(start, end);
      if (length < 0.01) continue;
      const tangent = end.subtract(start).scale(1 / length), normal = new Vector3(tangent.z, 0, -tangent.x);
      for (; untilNext < length; untilNext += 21) {
        const point = start.add(tangent.scale(untilNext));
        for (const side of [-1, 1]) candidates.push({ point, tangent, normal, halfWidth: road.width * mpp / 2, side,
          priority: (road.name === "Downberg Road" ? -140 : 0) + Vector3.Distance(point, spawn), index: index++ });
      }
      untilNext -= length;
    }
  }
  candidates.sort((a, z) => a.priority - z.priority || a.index - z.index);
  const atEdge = (candidate: Candidate, extra: number) => candidate.point.add(candidate.normal.scale(candidate.side * (candidate.halfWidth + extra)));

  const branch = (start: Vector3, end: Vector3, width: number) => {
    const axis = end.subtract(start).normalize();
    const right = Vector3.Cross(axis, Vector3.Forward()).normalize();
    const across = Vector3.Cross(axis, right).normalize();
    const corners = (p: Vector3) => [p.add(right.scale(width)).add(across.scale(width)), p.subtract(right.scale(width)).add(across.scale(width)),
      p.subtract(right.scale(width)).subtract(across.scale(width)), p.add(right.scale(width)).subtract(across.scale(width))];
    const a = corners(start), z = corners(end);
    for (let i = 0; i < 4; i++) {
      const normal = a[i].add(a[(i + 1) % 4]).scale(0.5).subtract(start).normalize();
      b.bark.quad([a[i], a[(i + 1) % 4], z[(i + 1) % 4], z[i]], normal);
    }
  };
  const crown = (point: Vector3, width: number, height: number, variant: number) => {
    const rings = [0.12, 0.55, 0.91].map((fraction, r) => Array.from({ length: 8 }, (_, i) => {
      const angle = i / 8 * Math.PI * 2 + variant * 0.38;
      const radius = width * [0.62, 1, 0.39][r] * (i % 2 ? 0.94 : 1.06);
      return point.add(new Vector3(Math.cos(angle) * radius, fraction * height, Math.sin(angle) * radius * 0.88));
    }));
    for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < 8; i++) {
      const vertices = [rings[r][i], rings[r][(i + 1) % 8], rings[r + 1][(i + 1) % 8], rings[r + 1][i]];
      const normal = vertices.reduce((sum, p) => sum.add(p), Vector3.Zero()).scale(0.25).subtract(point.add(new Vector3(0, height * 0.55, 0))).normalize();
      b.leaves[(variant + i + r) % b.leaves.length].quad(vertices, normal);
    }
    for (let i = 0; i < 8; i++) {
      const top = point.add(new Vector3(0.07, height, -0.05));
      const a = rings[2][i], z = rings[2][(i + 1) % 8];
      const normal = a.add(z).add(top).scale(1 / 3).subtract(point.add(new Vector3(0, height * 0.55, 0))).normalize();
      b.leaves[(variant + i) % 3].quad([a, z, top, top], normal);
      const bottom = point.add(new Vector3(0, 0, 0));
      b.leaves[(variant + 2) % 3].quad([rings[0][(i + 1) % 8], rings[0][i], bottom, bottom], Vector3.Down());
    }
  };
  let trees = 0;
  for (const candidate of candidates) {
    if (trees >= 42) break;
    const point = atEdge(candidate, 3.9 + (candidate.index % 3) * 0.45);
    // Wide spacing preserves long views and the open entrances to court blocks.
    if (!clear(point, 1.4, 0.5) || occupied.some((item) => Vector3.Distance(item.point, point) < 17)) continue;
    const height = 5.2 + candidate.index % 4 * 0.35;
    const trunk = height * 0.53;
    b.bark.box(point.add(new Vector3(0, trunk / 2, 0)), 0.27, trunk, 0.25);
    branch(point.add(new Vector3(0, trunk * 0.60, 0)), point.add(candidate.tangent.scale(0.58)).add(new Vector3(0, trunk + 0.25, 0)), 0.075);
    branch(point.add(new Vector3(0, trunk * 0.70, 0)), point.subtract(candidate.tangent.scale(0.5)).add(new Vector3(0, trunk + 0.4, 0)), 0.065);
    crown(point.add(new Vector3(0, height * 0.37, 0)), 1.95 + candidate.index % 3 * 0.18, height * 0.66, candidate.index);
    const bed = Array.from({ length: 10 }, (_, i) => point.add(new Vector3(Math.cos(i / 10 * Math.PI * 2) * 0.91, 0, Math.sin(i / 10 * Math.PI * 2) * 0.78)));
    b.mulch.polygon([bed], 0.004);
    record("tree", point, 1.4);
    trees++;
  }

  let benches = 0, bins = 0, bollards = 0, shrubs = 0;
  for (const candidate of candidates) {
    if (benches >= 8 && bins >= 12 && bollards >= 18 && shrubs >= 20) break;
    const choice = candidate.index % 6;
    if (choice === 0 && benches < 8) {
      const point = atEdge(candidate, 3.0);
      if (!clear(point, 1.1)) continue;
      const tangent = candidate.tangent, normal = candidate.normal.scale(candidate.side);
      const at = (x: number, y: number, z: number) => point.add(tangent.scale(x)).add(normal.scale(z)).add(new Vector3(0, y, 0));
      for (let plank = 0; plank < 4; plank++) b.wood.box(at(0, 0.48, -0.23 + plank * 0.15), 1.85, 0.07, 0.12, tangent, normal);
      for (const x of [-0.7, 0.7]) {
        b.metal.box(at(x, 0.25, 0), 0.075, 0.50, 0.46, tangent, normal);
        b.metal.box(at(x, 0.71, 0.32), 0.065, 0.87, 0.065, tangent, normal);
        b.metal.box(at(x, 0.68, 0), 0.06, 0.05, 0.57, tangent, normal);
      }
      for (let plank = 0; plank < 3; plank++) b.wood.box(at(0, 0.69 + plank * 0.15, 0.31), 1.85, 0.12, 0.06, tangent, normal);
      record("bench", point, 1.1); benches++;
    } else if (choice === 1 && bins < 12) {
      const point = atEdge(candidate, 2.25);
      if (!clear(point, 0.42)) continue;
      const tangent = candidate.tangent, normal = candidate.normal.scale(candidate.side);
      b.bin.box(point.add(new Vector3(0, 0.46, 0)), 0.53, 0.8, 0.49, tangent, normal);
      b.dark.box(point.add(new Vector3(0, 0.90, 0)), 0.58, 0.08, 0.54, tangent, normal);
      for (const side of [-1, 1]) b.dark.box(point.add(tangent.scale(side * 0.24)).add(normal.scale(0.15)).add(new Vector3(0, 0.10, 0)), 0.10, 0.19, 0.17, tangent, normal);
      b.metal.box(point.add(normal.scale(0.26)).add(new Vector3(0, 0.79, 0)), 0.35, 0.045, 0.08, tangent, normal);
      record("bin", point, 0.42); bins++;
    } else if (choice === 2 && bollards < 18) {
      const point = atEdge(candidate, 1.75);
      if (!clear(point, 0.18)) continue;
      b.metal.box(point.add(new Vector3(0, 0.48, 0)), 0.16, 0.96, 0.16);
      b.cap.box(point.add(new Vector3(0, 0.79, 0)), 0.175, 0.11, 0.175);
      record("bollard", point, 0.18); bollards++;
    } else if (choice >= 3 && shrubs < 20) {
      const point = atEdge(candidate, 3.1 + choice * 0.13);
      if (!clear(point, 1.0)) continue;
      crown(point, 0.86, 1.3 + choice * 0.07, candidate.index);
      crown(point.add(candidate.tangent.scale(0.6)), 0.55, 0.75, candidate.index + 1);
      record("shrub", point, 1.0); shrubs++;
    }
  }

  // Small road repairs and grates follow the real centreline; no invented roads.
  let drains = 0, wear = 0;
  const surfaceCandidates = [...candidates].sort((a, z) => Vector3.DistanceSquared(a.point, spawn) - Vector3.DistanceSquared(z.point, spawn));
  const surface = new Set<number>();
  for (const candidate of surfaceCandidates) {
    if (surface.has(candidate.index >> 1)) continue;
    surface.add(candidate.index >> 1);
    const tangent = candidate.tangent, normal = candidate.normal;
    const point = candidate.point.add(normal.scale(candidate.side * Math.max(0.5, candidate.halfWidth - 0.8)));
    const p = fromWorld(point);
    if (BUILDINGS.some((building) => !clearOfFootprint(p, 0.6 / mpp, building)) || FIELDS.some((field) => !clearOfFootprint(p, 0.6 / mpp, field))) continue;
    if (drains < 20) {
      const drain = candidate.point.add(normal.scale(candidate.side * (candidate.halfWidth - 0.32)));
      b.patch.box(drain.add(new Vector3(0, 0.077, 0)), 0.85, 0.018, 0.62, tangent, normal);
      for (let i = 0; i < 6; i++) b.dark.box(drain.add(tangent.scale(-0.31 + i * 0.125)).add(new Vector3(0, 0.089, 0)), 0.07, 0.015, 0.49, tangent, normal);
      record("drain", drain, 0.55, false); drains++;
    }
    if (wear < 34) {
      const length = 1.4 + candidate.index % 4 * 0.25, width = 0.6 + candidate.index % 3 * 0.22;
      const vertices = [[-0.5, -0.4], [0.46, -0.5], [0.54, 0.33], [0.22, 0.51], [-0.45, 0.46]].map(([x, z]) => point.add(tangent.scale(x * length)).add(normal.scale(z * width)));
      b.patch.polygon([vertices], 0.079);
      const verge = candidate.point.add(normal.scale(candidate.side * (candidate.halfWidth + 0.9)));
      // Sparse concrete seams stop the pavement looking like a single ribbon.
      for (const shift of [-0.9, 0, 0.9]) b.concrete.box(verge.add(tangent.scale(shift)).add(new Vector3(0, 0.039, 0)), 0.025, 0.012, 0.75, tangent, normal);
      record("wear", point, 0.95, false); wear++;
    }
    if (drains >= 20 && wear >= 34) break;
  }
  const shadowCasters: AbstractMesh[] = [];
  for (const batch of batches) {
    const mesh = batch.finish(scene);
    if (!mesh) continue;
    mesh.isPickable = false;
    mesh.metadata = { decorative: true, approximatePlacement: true };
    if (![b.mulch, b.patch, b.concrete].includes(batch)) shadowCasters.push(mesh);
  }
  return { shadowCasters, stats: { trees, props: benches + bins + bollards + shrubs + drains + wear }, placements };
}
