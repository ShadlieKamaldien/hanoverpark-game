import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";
import type { MapFootprint, MapPoint } from "../game/world/mapData";
import { PREVIEW, ROADS, BUILDINGS, FIELDS, SPAWN, toWorld } from "./map";
import { createMaterials } from "./materials";
import { Batch } from "./geometry";

type Ring = Vector3[];

function ring(points: MapPoint[]): Ring {
  const result = points.map((point) => toWorld(point));
  if (result.length > 1 && result[0].subtract(result[result.length - 1]).lengthSquared() < 0.0001) result.pop();
  return result;
}

function area(points: Ring) {
  return points.reduce((sum, point, i) => sum + point.x * points[(i + 1) % points.length].z - points[(i + 1) % points.length].x * point.z, 0) / 2;
}

function inside(point: Vector3, points: Ring) {
  let result = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.z > point.z) !== (b.z > point.z) && point.x < (b.x - a.x) * (point.z - a.z) / (b.z - a.z) + a.x) result = !result;
  }
  return result;
}

function centre(points: Ring) {
  return points.reduce((sum, point) => sum.add(point), Vector3.Zero()).scale(1 / points.length);
}

function strip(batch: Batch, points: Ring, halfWidth: number, y: number, textureScale: number) {
  if (points.length < 2) return;
  const edges = points.map((point, i) => {
    const before = points[Math.max(0, i - 1)], after = points[Math.min(points.length - 1, i + 1)];
    const tangent = after.subtract(before).normalize();
    return [point.add(new Vector3(tangent.z, 0, -tangent.x).scale(halfWidth)), point.add(new Vector3(-tangent.z, 0, tangent.x).scale(halfWidth))];
  });
  for (let i = 1; i < points.length; i++) {
    const quad = [edges[i - 1][0], edges[i][0], edges[i][1], edges[i - 1][1]].map((point) => new Vector3(point.x, y, point.z));
    batch.quad(quad, Vector3.Up(), Vector3.Distance(points[i - 1], points[i]) / textureScale, halfWidth * 2 / textureScale);
  }
}

type FacadeBatches = {
  body: Batch; repair: Batch; roof: Batch; frames: Batch; windows: Batch[];
  dark: Batch; rails: Batch; curb: Batch; curtains: Batch[]; laundry: Batch[];
  planter: Batch; foliage: Batch; pipe: Batch;
};

function variation(id: number, edge: number, column: number, floor = 0) {
  return ((Math.imul(id | 0, 73856093) ^ Math.imul(edge + 1, 19349663)
    ^ Math.imul(column + 1, 83492791) ^ Math.imul(floor + 1, 2654435761)) >>> 0);
}

function facade(building: MapFootprint, rings: Ring[], height: number, batches: FacadeBatches) {
  const levels = Math.max(1, Math.round(height / 3.05));
  const apartments = building.kind === "apartments" || levels > 1;
  if (building.kind === "roof") {
    // Mapped petrol-station shelters remain open canopies, not solid buildings.
    batches.roof.polygon(rings, height, 3.5);
    const points = rings[0];
    const middle = centre(points);
    for (let e = 0; e < points.length; e++) {
      const a = points[e], end = points[(e + 1) % points.length];
      const tangent = end.subtract(a).normalize();
      const normal = new Vector3(tangent.z, 0, -tangent.x);
      batches.roof.box(a.add(end).scale(0.5).add(new Vector3(0, height - 0.1, 0)), Vector3.Distance(a, end), 0.24, 0.15, tangent, normal);
      const pillar = a.scale(0.86).add(middle.scale(0.14)).add(new Vector3(0, height / 2, 0));
      batches.frames.box(pillar, 0.2, height, 0.2);
    }
    return;
  }
  for (let r = 0; r < rings.length; r++) {
    const points = rings[r];
    const orientation = (area(points) > 0 ? 1 : -1) * (r === 0 ? 1 : -1);
    for (let e = 0; e < points.length; e++) {
      const a = points[e], b = points[(e + 1) % points.length];
      const length = Vector3.Distance(a, b);
      if (length < 0.15) continue;
      const tangent = b.subtract(a).normalize();
      const normal = new Vector3(tangent.z * orientation, 0, -tangent.x * orientation);
      const at = (distance: number, y: number, depth = 0) => a.add(tangent.scale(distance)).add(normal.scale(depth)).add(new Vector3(0, y, 0));
      batches.body.quad([at(0, 0), at(length, 0), at(length, height), at(0, height)], normal, length / 4, height / 4);
      // Original low parapet follows every source edge, including court holes.
      batches.roof.box(at(length / 2, height + 0.09), length + 0.06, 0.18, 0.21, tangent, normal);
      batches.curb.box(at(length / 2, 0.12, 0.15), length, 0.24, 0.28, tangent, normal, false);
      if (length < 3.3) continue;
      if (apartments) {
        for (let floor = 1; floor < levels; floor++) {
          // Thin slab edges break up large elevations without adding floors.
          batches.roof.box(at(length / 2, floor * 3.05 - 0.05, 0.045), length, 0.095, 0.11, tangent, normal);
        }
      }
      const count = Math.min(22, Math.max(1, Math.floor(length / (apartments ? 3.4 : 4.8))));
      const spacing = length / count;
      for (let column = 0; column < count; column++) {
        const distance = (column + 0.5) * spacing;
        for (let floor = 0; floor < levels; floor++) {
          const key = variation(building.id, e + r * 31, column, floor);
          const y = floor * 3.05 + 1.6;
          const width = apartments ? 1.32 : 1.75;
          const pane = (batch: Batch, distance: number, y: number, depth: number, w: number, h: number) => {
            batch.quad([at(distance - w / 2, y - h / 2, depth), at(distance + w / 2, y - h / 2, depth),
              at(distance + w / 2, y + h / 2, depth), at(distance - w / 2, y + h / 2, depth)], normal);
          };
          // Only these front faces can be seen: solid source walls and the
          // surrounding frames hide the pane/recess backs and side faces.
          pane(batches.dark, distance, y, 0.0675, width + 0.22, 1.56);
          const glazing = batches.windows[key % batches.windows.length];
          pane(glazing, distance, y, 0.12, width, 1.3);
          // Curtains vary by home; some are open, some partly drawn. Their
          // folds are original canvas art, with no surveyed-interior claims.
          const curtain = batches.curtains[(key >>> 4) % batches.curtains.length];
          if (key % 7 !== 0) {
            const draw = key % 4 === 0 ? 0.43 : 0.2;
            for (const side of [-1, 1]) {
              pane(curtain, distance + side * (width / 2 - width * draw / 2 - 0.045), y + 0.015, 0.134, width * draw, 1.23);
            }
          }
          pane(batches.frames, distance - width / 2 - 0.035, y, 0.20, 0.075, 1.5);
          pane(batches.frames, distance + width / 2 + 0.035, y, 0.20, 0.075, 1.5);
          pane(batches.frames, distance, y + 0.72, 0.20, width + 0.15, 0.075);
          batches.frames.box(at(distance, y - 0.72, 0.18), width + 0.23, 0.10, 0.27, tangent, normal);
          pane(batches.frames, distance, y, 0.2025, 0.055, 1.35);
          if (key % 6 === 0) {
            // Modest repairs and rain marks replace an entirely uniform wall.
            const w = 0.55 + (key % 13) * 0.035, patchY = y - 0.9;
            batches.repair.quad([at(distance - w / 2, patchY - 0.23, 0.004), at(distance + w / 2, patchY - 0.19, 0.004), at(distance + w / 2 - 0.06, patchY + 0.12, 0.004), at(distance - w / 2 + 0.07, patchY + 0.18, 0.004)], normal);
          }
          if (apartments && floor > 0 && column % 4 === 1 && length > 11) {
            const deckY = floor * 3.05 + 0.08;
            batches.roof.box(at(distance, deckY, 0.63), 2.45, 0.18, 1.1, tangent, normal);
            batches.rails.box(at(distance, deckY + 1.0, 1.15), 2.4, 0.065, 0.07, tangent, normal);
            batches.rails.box(at(distance, deckY + 0.32, 1.15), 2.4, 0.06, 0.07, tangent, normal);
            for (let rail = 0; rail <= 6; rail++) batches.rails.box(at(distance - 1.18 + rail * 0.393, deckY + 0.56, 1.15), 0.045, 0.92, 0.055, tangent, normal);
            for (const side of [-1, 1]) batches.rails.box(at(distance + side * 1.18, deckY + 1.0, 0.62), 0.06, 0.06, 1.07, tangent, normal);
            if (key % 3 !== 0) {
              const cloth = batches.laundry[(key >>> 5) % batches.laundry.length];
              batches.rails.box(at(distance - 0.31, deckY + 1.3, 0.84), 1.12, 0.025, 0.025, tangent, normal);
              cloth.box(at(distance - 0.57, deckY + 0.96, 0.84), 0.44, 0.64, 0.025, tangent, normal);
              batches.laundry[(key + 1) % batches.laundry.length].box(at(distance + 0.03, deckY + 1.05, 0.84), 0.36, 0.48, 0.025, tangent, normal);
            }
            if (key % 4 !== 0) {
              batches.planter.box(at(distance + 0.8, deckY + 0.3, 0.83), 0.33, 0.4, 0.32, tangent, normal);
              batches.dark.box(at(distance + 0.8, deckY + 0.51, 0.83), 0.3, 0.025, 0.28, tangent, normal);
              for (const leaf of [-1, 0, 1]) batches.foliage.box(at(distance + 0.8 + leaf * 0.12, deckY + 0.67 + (leaf === 0 ? 0.14 : 0), 0.83), 0.16, 0.35, 0.17, tangent, normal);
            }
          }
        }
      }
      // Exposed rainwater pipes are sparse batched details, never new walls.
      if (apartments && length > 8 && e % 2 === 0) {
        const drain = Math.min(length - 0.4, 0.6 + (variation(building.id, e, 0) % 5) * 0.13);
        batches.pipe.box(at(drain, height / 2, 0.17), 0.10, height, 0.10, tangent, normal);
        for (let y = 1; y < height; y += 2.8) batches.rails.box(at(drain, y, 0.14), 0.17, 0.045, 0.16, tangent, normal);
        batches.pipe.box(at(drain + 0.16, 0.15, 0.17), 0.4, 0.10, 0.10, tangent, normal);
      }
      // A recessed entry and original security gate; entrances are artwork.
      if (e % 2 === 0 && length >= 9) {
        const distance = Math.min(length - 1.2, spacing);
        batches.dark.box(at(distance, 1.08, 0.07), 1.18, 2.16, 0.14, tangent, normal);
        for (let rail = 0; rail < 5; rail++) batches.rails.box(at(distance - 0.48 + rail * 0.24, 1.04, 0.18), 0.04, 2.03, 0.04, tangent, normal);
        batches.rails.box(at(distance, 1.84, 0.2), 1.04, 0.045, 0.045, tangent, normal);
        batches.rails.box(at(distance, 0.64, 0.2), 1.04, 0.045, 0.045, tangent, normal);
        batches.roof.box(at(distance, 2.32, 0.38), 1.66, 0.10, 0.82, tangent, normal);
        for (let step = 0; step < 3; step++) batches.roof.box(at(distance, 0.065 + step * 0.06, 0.4 + (2 - step) * 0.25), 1.5, 0.12 + step * 0.12, 0.34, tangent, normal);
      }
    }
  }
  batches.roof.polygon(rings, height, 3.5);
  if (apartments) {
    // A few low roof vents and aerials sit inside the real outer footprint,
    // with courtyard holes explicitly excluded. These are procedural art.
    const points = rings[0], orientation = area(points) > 0 ? 1 : -1;
    const edges = points.map((a, index) => ({ a, b: points[(index + 1) % points.length] }))
      .filter(({ a, b }) => Vector3.Distance(a, b) > 8).slice(0, 4);
    for (let index = 0; index < edges.length; index++) {
      const { a, b } = edges[index], tangent = b.subtract(a).normalize();
      const outward = new Vector3(tangent.z * orientation, 0, -tangent.x * orientation);
      const location = a.scale(0.55).add(b.scale(0.45)).subtract(outward.scale(1.8));
      const roofCorners = [-1, 1].flatMap((x) => [-1, 1].map((z) => location.add(tangent.scale(x * 0.7)).add(outward.scale(z * 0.7))));
      if (!roofCorners.every((corner) => inside(corner, points) && !rings.slice(1).some((hole) => inside(corner, hole)))) continue;
      if (index === 0 && Math.abs(building.id) % 3 !== 0) {
        batches.rails.box(location.add(new Vector3(0, height + 1.05, 0)), 0.065, 2.1, 0.065);
        batches.rails.box(location.add(new Vector3(0, height + 1.84, 0)), 1.05, 0.035, 0.035, tangent, outward);
        for (const offset of [-0.38, 0, 0.38]) batches.rails.box(location.add(tangent.scale(offset)).add(new Vector3(0, height + 1.84, 0)), 0.025, 0.025, 0.75, tangent, outward);
      } else {
        batches.roof.box(location.add(new Vector3(0, height + 0.22, 0)), 0.52, 0.44, 0.58, tangent, outward);
        batches.rails.box(location.add(new Vector3(0, height + 0.46, 0)), 0.67, 0.07, 0.73, tangent, outward);
      }
    }
  }
}

/** Painted rectangles have no visible volume or hidden underside. */
function paint(batch: Batch, center: Vector3, width: number, depth: number, tangent: Vector3, across: Vector3) {
  const point = (x: number, z: number) => center.add(tangent.scale(x * width / 2)).add(across.scale(z * depth / 2));
  batch.quad([point(-1, -1), point(1, -1), point(1, 1), point(-1, 1)], Vector3.Up());
}

function fieldMarkings(field: MapFootprint, points: Ring, markings: Batch, rails: Batch) {
  if (field.kind !== "pitch" || points.length !== 4) return;
  const pairs = points.map((point, i) => ({ a: point, b: points[(i + 1) % 4], length: Vector3.Distance(point, points[(i + 1) % 4]) })).sort((a, b) => b.length - a.length);
  const long = pairs[0], mid = centre(points);
  const length = long.length * 0.86;
  const width = Math.min(...pairs.map((pair) => pair.length)) * 0.85;
  // Small courts can represent other sports; reserve football artwork for large pitches.
  if (length < 40 || width < 25) return;
  const tangent = long.b.subtract(long.a).normalize(), across = new Vector3(-tangent.z, 0, tangent.x);
  const at = (x: number, z: number, y = 0.16) => mid.add(tangent.scale(x)).add(across.scale(z)).add(new Vector3(0, y, 0));
  // Draw markings only when the full rectangular outline fits the mapped pitch.
  if (![at(-length / 2, -width / 2), at(length / 2, -width / 2), at(length / 2, width / 2), at(-length / 2, width / 2)].every((point) => inside(point, points))) return;
  for (const z of [-width / 2, width / 2]) paint(markings, at(0, z, 0.1725), length, 0.14, tangent, across);
  for (const x of [-length / 2, 0, length / 2]) paint(markings, at(x, 0, 0.1725), 0.14, width, tangent, across);
  const radius = Math.min(9.15, width * 0.18);
  const circle = Array.from({ length: 49 }, (_, i) => at(Math.cos(i / 48 * Math.PI * 2) * radius, Math.sin(i / 48 * Math.PI * 2) * radius));
  strip(markings, circle, 0.065, 0.17, 1);
  for (const x of [-length / 2, length / 2]) {
    const goalWidth = Math.min(7.3, width * 0.25);
    for (const z of [-goalWidth / 2, goalWidth / 2]) rails.box(at(x, z, 1.3), 0.10, 2.5, 0.10, tangent, across);
    rails.box(at(x, 0, 2.55), 0.10, 0.10, goalWidth, tangent, across);
  }
}

function courtLabel(scene: Scene, building: MapFootprint, points: Ring, height: number) {
  if (!building.name) return;
  const longest = points.map((a, i) => ({ a, b: points[(i + 1) % points.length] })).sort((a, b) => Vector3.Distance(b.a, b.b) - Vector3.Distance(a.a, a.b))[0];
  const tangent = longest.b.subtract(longest.a).normalize();
  const orientation = area(points) > 0 ? 1 : -1;
  const normal = new Vector3(tangent.z * orientation, 0, -tangent.x * orientation);
  const material = new StandardMaterial(`original-${building.id}-name-sign`, scene);
  const texture = new DynamicTexture(`court-name-${building.id}`, { width: 512, height: 128 }, scene, false);
  const context = texture.getContext() as CanvasRenderingContext2D;
  context.fillStyle = "#354b4d"; context.fillRect(0, 0, 512, 128);
  context.strokeStyle = "#cabf9b"; context.lineWidth = 4; context.strokeRect(7, 7, 498, 114);
  context.font = "bold 36px sans-serif"; context.textAlign = "center"; context.textBaseline = "middle";
  context.fillStyle = "#eee6ca"; context.fillText(building.name, 256, 65, 465);
  texture.update(true);
  material.diffuseTexture = texture;
  material.specularColor = Color3.Black();
  const batch = new Batch(`court-label-${building.id}`, material);
  const center = longest.a.add(longest.b).scale(0.5).add(normal.scale(0.29)).add(new Vector3(0, Math.min(height - 0.5, 2.75), 0));
  batch.quad([center.subtract(tangent.scale(2.2)).add(new Vector3(0, -0.55, 0)), center.add(tangent.scale(2.2)).add(new Vector3(0, -0.55, 0)), center.add(tangent.scale(2.2)).add(new Vector3(0, 0.55, 0)), center.subtract(tangent.scale(2.2)).add(new Vector3(0, 0.55, 0))], normal);
  batch.finish(scene);
}

export function buildWorld(scene: Scene): {
  shadowCasters: AbstractMesh[];
  windowMaterial: StandardMaterial;
  windowMaterials: StandardMaterial[];
  lamps: Vector3[];
  stats: { roads: number; buildings: number; fields: number };
} {
  const materials = createMaterials(scene);
  const batches = new Map<StandardMaterial, Batch>();
  const batch = (material: StandardMaterial) => {
    let value = batches.get(material);
    if (!value) { value = new Batch(`static-${material.name}`, material); batches.set(material, value); }
    return value;
  };
  const b = {
    ground: batch(materials.ground), roads: batch(materials.asphalt), pavements: batch(materials.pavement), curb: batch(materials.curb),
    frames: batch(materials.frame), lines: batch(materials.line), lamps: batch(materials.lamp), lampGlass: batch(materials.lampGlass),
  };
  const bounds = PREVIEW.bounds;
  // Source footprints that cross the preview edge keep their full shape.
  const margin = 80 / PREVIEW.metresPerPixel;
  const terrain = ring([{ x: bounds.minX - margin, y: bounds.minY - margin }, { x: bounds.maxX + margin, y: bounds.minY - margin }, { x: bounds.maxX + margin, y: bounds.maxY + margin }, { x: bounds.minX - margin, y: bounds.maxY + margin }]);
  b.ground.polygon([terrain], -0.05, 4.5);
  const lampPositions: Vector3[] = [];
  const footprintRings = BUILDINGS.map((building) => ({ outer: ring(building.points), holes: (building.holes ?? []).map(ring) }));
  const blocked = (point: Vector3) => footprintRings.some(({ outer, holes }) => inside(point, outer) && !holes.some((hole) => inside(point, hole)));
  const roads = ROADS.map((road, index) => ({ road, index, points: road.points.map((point) => toWorld(point)), width: road.width * PREVIEW.metresPerPixel,
    walk: ["footway", "path", "steps", "pedestrian"].includes(road.kind) }));
  const segments = roads.filter(({ walk }) => !walk).flatMap(({ points, width, index }) => points.slice(1).map((end, i) => ({ a: points[i], end, width, index })));
  const crossesRoad = (point: Vector3, current: number) => segments.some(({ a, end, width, index }) => {
    if (index === current) return false;
    const dx = end.x - a.x, dz = end.z - a.z, denominator = dx * dx + dz * dz;
    const t = denominator ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / denominator)) : 0;
    return Math.hypot(point.x - a.x - dx * t, point.z - a.z - dz * t) < width / 2 + 0.28;
  });
  const lampCandidates: { position: Vector3; tangent: Vector3; normal: Vector3; priority: number }[] = [];
  const spawn = toWorld(SPAWN);
  for (const { road, points, width, walk, index } of roads) {
    if (points.length < 2) continue;
    strip(b.pavements, points, width / 2 + (walk ? 0.15 : 1.35), 0.025, 3);
    if (!walk) strip(b.roads, points, width / 2, 0.065, 7);
    if (!walk) {
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], end = points[i];
        const length = Vector3.Distance(a, end), tangent = end.subtract(a).normalize(), normal = new Vector3(tangent.z, 0, -tangent.x);
        // Kerbs stop at crossing carriageways instead of drawing an apparent
        // concrete barrier straight through a real mapped junction.
        for (const side of [-1, 1]) {
          const curbPoint = (distance: number) => a.add(tangent.scale(distance)).add(normal.scale(side * (width / 2 + 0.16)));
          const steps = Math.max(1, Math.ceil(length / 1.25));
          let start: number | null = null;
          const finish = (endDistance: number) => {
            if (start === null) return;
            if (endDistance - start > 0.12) b.curb.box(curbPoint((start + endDistance) / 2).add(new Vector3(0, 0.095, 0)), endDistance - start, 0.15, 0.22, tangent, normal, false);
            start = null;
          };
          for (let step = 0; step < steps; step++) {
            const begin = step / steps * length, finishDistance = (step + 1) / steps * length;
            if (crossesRoad(curbPoint((begin + finishDistance) / 2), index)) finish(begin);
            else if (start === null) start = begin;
          }
          finish(length);
        }
        if (["residential", "tertiary", "secondary", "primary"].includes(road.kind) && length > 9) {
          for (let distance = 3; distance < length - 2; distance += 9) {
            const location = a.add(tangent.scale(distance));
            if (!crossesRoad(location, index)) paint(b.lines, location.add(new Vector3(0, 0.0885, 0)), 3.6, 0.13, tangent, normal);
          }
        }
        if (road.name && length > 25) {
          const locations = length < 50 ? [length / 2] : Array.from({ length: Math.min(20, Math.floor(length / 42)) }, (_, step) => 21 + step * 42);
          for (const distance of locations) {
            const lamp = a.add(tangent.scale(distance)).add(normal.scale(width / 2 + 1.04));
            if (!blocked(lamp) && !crossesRoad(lamp, index)) lampCandidates.push({ position: lamp, tangent, normal,
              priority: Vector3.Distance(lamp, spawn) - (road.name === "Downberg Road" ? 30 : 0) });
          }
        }
      }
    }
  }
  // Twelve decorative lamps are concentrated around Downberg and the entry
  // area so the small nearby light pool actually lights the first night walk.
  lampCandidates.sort((a, b) => a.priority - b.priority);
  for (const { position: lamp, tangent, normal } of lampCandidates) {
    if (lampPositions.length >= 12) break;
    if (lampPositions.some((existing) => Math.hypot(existing.x - lamp.x, existing.z - lamp.z) < 30)) continue;
    b.lamps.box(lamp.add(new Vector3(0, 3.1, 0)), 0.13, 6.2, 0.13);
    b.lamps.box(lamp.add(normal.scale(-0.62)).add(new Vector3(0, 6.0, 0)), 1.3, 0.12, 0.13, normal, tangent);
    b.lampGlass.box(lamp.add(normal.scale(-1.05)).add(new Vector3(0, 5.94, 0)), 0.68, 0.12, 0.3, normal, tangent);
    lampPositions.push(lamp.add(normal.scale(-1.05)).add(new Vector3(0, 5.79, 0)));
  }
  for (const field of FIELDS) {
    const points = ring(field.points);
    const rings = [points, ...(field.holes ?? []).map(ring)];
    batch(field.kind === "park" ? materials.park : materials.grass).polygon(rings, 0.105, 5.5);
    fieldMarkings(field, points, b.lines, b.frames);
  }
  const shadowCasters: AbstractMesh[] = [];
  // The terrain stays in large batches. Facades are grouped per mapped
  // building so a flat behind the camera does not submit all of its windows
  // merely because a distant building with the same material is visible.
  const opaqueStructure = new Set<StandardMaterial>([...materials.plaster, materials.roof, materials.rails, materials.planter, materials.foliage]);
  const fineDetails = new Set<StandardMaterial>([...materials.windowGroups, ...materials.curtains, ...materials.laundry,
    ...materials.repairs, materials.frame, materials.dark, materials.pipe, materials.planter, materials.foliage, materials.rails]);
  for (const building of BUILDINGS) {
    const localBatches = new Map<StandardMaterial, Batch>();
    const localBatch = (material: StandardMaterial) => {
      let value = localBatches.get(material);
      if (!value) { value = new Batch(`building-${building.id}-${material.name}`, material); localBatches.set(material, value); }
      return value;
    };
    const points = ring(building.points);
    const rings = [points, ...(building.holes ?? []).map(ring)];
    const levels = Math.max(1, Math.min(6, building.levels ?? (building.kind === "apartments" ? 3 : 1)));
    const height = building.kind === "roof" ? 3.6 : levels * 3.05;
    const body = localBatch(materials.plaster[Math.abs(building.id) % materials.plaster.length]);
    facade(building, rings, height, {
      body, repair: localBatch(materials.repairs[Math.abs(building.id) % materials.repairs.length]),
      roof: localBatch(materials.roof), frames: localBatch(materials.frame), windows: materials.windowGroups.map(localBatch),
      dark: localBatch(materials.dark), rails: localBatch(materials.rails), curb: localBatch(materials.curb),
      curtains: materials.curtains.map(localBatch), laundry: materials.laundry.map(localBatch),
      planter: localBatch(materials.planter), foliage: localBatch(materials.foliage), pipe: localBatch(materials.pipe),
    });
    for (const [material, geometry] of localBatches) {
      const mesh = geometry.finish(scene);
      if (!mesh) continue;
      if (fineDetails.has(material)) {
        // Keep full detail within 180 m of even a large building's near edge;
        // at longer distances these narrow strips occupy less than a pixel.
        mesh.addLODLevel(180 + mesh.getBoundingInfo().boundingSphere.radiusWorld, null);
      }
      if (opaqueStructure.has(material)) shadowCasters.push(mesh);
    }
    if (building.name && building.kind === "apartments") courtLabel(scene, building, points, height);
  }
  for (const [material, geometry] of batches) {
    const mesh = geometry.finish(scene);
    if (mesh && [materials.frame, materials.lamp].includes(material)) shadowCasters.push(mesh);
  }
  return { shadowCasters, windowMaterial: materials.glazing, windowMaterials: materials.windowGroups, lamps: lampPositions, stats: { roads: ROADS.length, buildings: BUILDINGS.length, fields: FIELDS.length } };
}
