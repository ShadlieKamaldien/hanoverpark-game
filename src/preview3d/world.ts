import earcut from "earcut";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";
import type { MapFootprint, MapPoint } from "../game/world/mapData";
import { PREVIEW, ROADS, BUILDINGS, FIELDS, toWorld } from "./map";
import { createMaterials } from "./materials";

type Ring = Vector3[];

/** One static mesh per material keeps the facade details cheap to render. */
class Batch {
  positions: number[] = [];
  normals: number[] = [];
  uvs: number[] = [];
  indices: number[] = [];
  constructor(readonly name: string, readonly material: StandardMaterial) {}

  quad(points: Vector3[], normal: Vector3, width = 1, height = 1) {
    const start = this.positions.length / 3;
    const geometric = Vector3.Cross(points[1].subtract(points[0]), points[2].subtract(points[0]));
    // Babylon's default left-handed mesh convention winds opposite the
    // right-handed geometric cross product (as its CreateGround builder does).
    const reverse = Vector3.Dot(geometric, normal) > 0;
    for (let i = 0; i < 4; i++) {
      const point = points[i];
      this.positions.push(point.x, point.y, point.z);
      this.normals.push(normal.x, normal.y, normal.z);
      this.uvs.push(i === 1 || i === 2 ? width : 0, i >= 2 ? height : 0);
    }
    this.indices.push(...(reverse ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]).map((i) => start + i));
  }

  box(center: Vector3, width: number, height: number, depth: number, tangent = Vector3.Right(), normal = Vector3.Forward()) {
    const point = (x: number, y: number, z: number) => center.add(tangent.scale(x * width / 2)).add(new Vector3(0, y * height / 2, 0)).add(normal.scale(z * depth / 2));
    this.quad([point(-1, -1, 1), point(1, -1, 1), point(1, 1, 1), point(-1, 1, 1)], normal);
    this.quad([point(1, -1, -1), point(-1, -1, -1), point(-1, 1, -1), point(1, 1, -1)], normal.negate());
    this.quad([point(1, -1, 1), point(1, -1, -1), point(1, 1, -1), point(1, 1, 1)], tangent);
    this.quad([point(-1, -1, -1), point(-1, -1, 1), point(-1, 1, 1), point(-1, 1, -1)], tangent.negate());
    this.quad([point(-1, 1, 1), point(1, 1, 1), point(1, 1, -1), point(-1, 1, -1)], Vector3.Up());
    this.quad([point(-1, -1, -1), point(1, -1, -1), point(1, -1, 1), point(-1, -1, 1)], Vector3.Down());
  }

  polygon(rings: Ring[], y: number, textureScale = 1) {
    const flat: number[] = [], holes: number[] = [];
    for (let i = 0; i < rings.length; i++) {
      if (i > 0) holes.push(flat.length / 2);
      for (const point of rings[i]) flat.push(point.x, point.z);
    }
    const start = this.positions.length / 3;
    for (let i = 0; i < flat.length; i += 2) {
      this.positions.push(flat[i], y, flat[i + 1]);
      this.normals.push(0, 1, 0);
      this.uvs.push(flat[i] / textureScale, flat[i + 1] / textureScale);
    }
    const triangles = earcut(flat, holes, 2);
    for (let i = 0; i < triangles.length; i += 3) {
      const a = triangles[i], b = triangles[i + 1], c = triangles[i + 2];
      // Babylon's left-handed convention uses positive x/z winding for Up.
      const cross = (flat[b * 2] - flat[a * 2]) * (flat[c * 2 + 1] - flat[a * 2 + 1]) - (flat[b * 2 + 1] - flat[a * 2 + 1]) * (flat[c * 2] - flat[a * 2]);
      this.indices.push(start + a, start + (cross < 0 ? c : b), start + (cross < 0 ? b : c));
    }
  }

  finish(scene: Scene): Mesh | null {
    if (!this.positions.length) return null;
    const mesh = new Mesh(this.name, scene);
    const data = new VertexData();
    data.positions = this.positions; data.normals = this.normals; data.uvs = this.uvs; data.indices = this.indices;
    data.applyToMesh(mesh);
    mesh.material = this.material;
    mesh.receiveShadows = true;
    mesh.freezeWorldMatrix();
    return mesh;
  }
}

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

function facade(building: MapFootprint, rings: Ring[], height: number, batches: { body: Batch; roof: Batch; frames: Batch; windows: Batch; dark: Batch; rails: Batch; curb: Batch }) {
  const levels = Math.max(1, Math.round(height / 3.05));
  const apartments = building.kind === "apartments" || levels > 1;
  if (building.kind === "roof") {
    // Mapped petrol-station shelters remain open canopies, not solid buildings.
    batches.roof.polygon(rings, height, 4);
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
      batches.body.quad([at(0, 0), at(length, 0), at(length, height), at(0, height)], normal, length / 5, height / 5);
      // Original low parapet/roof fascia follows every real edge, including courtyards.
      batches.roof.box(at(length / 2, height + 0.09), length + 0.06, 0.18, 0.21, tangent, normal);
      batches.curb.box(at(length / 2, 0.12, 0.15), length, 0.24, 0.28, tangent, normal);
      if (length < 3.3 || building.kind === "roof") continue;
      const count = Math.min(22, Math.max(1, Math.floor(length / (apartments ? 3.4 : 4.8))));
      const spacing = length / count;
      for (let column = 0; column < count; column++) {
        const distance = (column + 0.5) * spacing;
        for (let floor = 0; floor < levels; floor++) {
          const y = floor * 3.05 + 1.6;
          const width = apartments ? 1.32 : 1.75;
          batches.dark.box(at(distance, y, 0.04), width + 0.22, 1.56, 0.09, tangent, normal);
          batches.windows.box(at(distance, y, 0.10), width, 1.3, 0.06, tangent, normal);
          batches.frames.box(at(distance - width / 2 - 0.035, y, 0.15), 0.075, 1.5, 0.10, tangent, normal);
          batches.frames.box(at(distance + width / 2 + 0.035, y, 0.15), 0.075, 1.5, 0.10, tangent, normal);
          batches.frames.box(at(distance, y + 0.72, 0.15), width + 0.15, 0.075, 0.10, tangent, normal);
          batches.frames.box(at(distance, y - 0.72, 0.18), width + 0.23, 0.10, 0.27, tangent, normal);
          batches.frames.box(at(distance, y, 0.16), 0.055, 1.35, 0.085, tangent, normal);
          if (apartments && floor > 0 && column % 4 === 1 && length > 11) {
            const deckY = floor * 3.05 + 0.08;
            batches.roof.box(at(distance, deckY, 0.63), 2.45, 0.18, 1.1, tangent, normal);
            batches.rails.box(at(distance, deckY + 1.0, 1.15), 2.4, 0.065, 0.07, tangent, normal);
            batches.rails.box(at(distance, deckY + 0.32, 1.15), 2.4, 0.06, 0.07, tangent, normal);
            for (let rail = 0; rail <= 6; rail++) batches.rails.box(at(distance - 1.18 + rail * 0.393, deckY + 0.56, 1.15), 0.045, 0.92, 0.055, tangent, normal);
            for (const side of [-1, 1]) batches.rails.box(at(distance + side * 1.18, deckY + 1.0, 0.62), 0.06, 0.06, 1.07, tangent, normal);
          }
        }
      }
      // A recessed entry and simple original security gate; entrances are artwork.
      if (e % 2 === 0 && length >= 9) {
        const distance = Math.min(length - 1.2, spacing);
        batches.dark.box(at(distance, 1.08, 0.07), 1.18, 2.16, 0.14, tangent, normal);
        for (let rail = 0; rail < 5; rail++) batches.rails.box(at(distance - 0.48 + rail * 0.24, 1.04, 0.18), 0.04, 2.03, 0.04, tangent, normal);
        batches.rails.box(at(distance, 1.84, 0.2), 1.04, 0.045, 0.045, tangent, normal);
        batches.rails.box(at(distance, 0.64, 0.2), 1.04, 0.045, 0.045, tangent, normal);
        for (let step = 0; step < 3; step++) batches.roof.box(at(distance, 0.065 + step * 0.06, 0.4 + (2 - step) * 0.25), 1.5, 0.12 + step * 0.12, 0.34, tangent, normal);
      }
    }
  }
  batches.roof.polygon(rings, height, 4);
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
  for (const z of [-width / 2, width / 2]) markings.box(at(0, z), length, 0.025, 0.14, tangent, across);
  for (const x of [-length / 2, 0, length / 2]) markings.box(at(x, 0), 0.14, 0.025, width, tangent, across);
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
    roof: batch(materials.roof), frames: batch(materials.frame), windows: batch(materials.glazing), dark: batch(materials.dark), rails: batch(materials.rails), lines: batch(materials.line), lamps: batch(materials.lamp), lampGlass: batch(materials.lampGlass),
  };
  const bounds = PREVIEW.bounds;
  // Source footprints that cross the preview edge keep their full shape.
  const margin = 80 / PREVIEW.metresPerPixel;
  const terrain = ring([{ x: bounds.minX - margin, y: bounds.minY - margin }, { x: bounds.maxX + margin, y: bounds.minY - margin }, { x: bounds.maxX + margin, y: bounds.maxY + margin }, { x: bounds.minX - margin, y: bounds.maxY + margin }]);
  b.ground.polygon([terrain], -0.05, 19);
  const lampPositions: Vector3[] = [];
  const footprintRings = BUILDINGS.map((building) => ({ outer: ring(building.points), holes: (building.holes ?? []).map(ring) }));
  const blocked = (point: Vector3) => footprintRings.some(({ outer, holes }) => inside(point, outer) && !holes.some((hole) => inside(point, hole)));
  for (const road of ROADS) {
    const points = road.points.map((point) => toWorld(point));
    if (points.length < 2) continue;
    const walk = ["footway", "path", "steps", "pedestrian"].includes(road.kind);
    const width = road.width * PREVIEW.metresPerPixel;
    strip(b.pavements, points, width / 2 + (walk ? 0.15 : 1.35), 0.025, 6);
    if (!walk) strip(b.roads, points, width / 2, 0.065, 7);
    if (!walk) {
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], end = points[i];
        const length = Vector3.Distance(a, end), tangent = end.subtract(a).normalize(), normal = new Vector3(tangent.z, 0, -tangent.x);
        for (const side of [-1, 1]) b.curb.box(a.add(end).scale(0.5).add(normal.scale(side * (width / 2 + 0.16))).add(new Vector3(0, 0.095, 0)), length, 0.15, 0.22, tangent, normal);
        if (["residential", "tertiary", "secondary", "primary"].includes(road.kind) && length > 9) {
          for (let distance = 3; distance < length - 2; distance += 9) b.lines.box(a.add(tangent.scale(distance)).add(new Vector3(0, 0.081, 0)), 3.6, 0.015, 0.13, tangent, normal);
        }
        if (road.name && length > 25 && lampPositions.length < 12) {
          const lamp = a.add(end).scale(0.5).add(normal.scale(width / 2 + 1.04));
          if (!blocked(lamp) && !lampPositions.some((existing) => Vector3.Distance(existing, lamp) < 35)) {
            b.lamps.box(lamp.add(new Vector3(0, 3.1, 0)), 0.13, 6.2, 0.13);
            b.lamps.box(lamp.add(normal.scale(-0.62)).add(new Vector3(0, 6.0, 0)), 1.3, 0.12, 0.13, normal, tangent);
            b.lampGlass.box(lamp.add(normal.scale(-1.05)).add(new Vector3(0, 5.94, 0)), 0.68, 0.12, 0.3, normal, tangent);
            lampPositions.push(lamp.add(normal.scale(-1.05)).add(new Vector3(0, 5.79, 0)));
          }
        }
      }
    }
  }
  for (const field of FIELDS) {
    const points = ring(field.points);
    const rings = [points, ...(field.holes ?? []).map(ring)];
    batch(field.kind === "park" ? materials.park : materials.grass).polygon(rings, 0.105, 13);
    fieldMarkings(field, points, b.lines, b.frames);
  }
  for (const building of BUILDINGS) {
    const points = ring(building.points);
    const rings = [points, ...(building.holes ?? []).map(ring)];
    const levels = Math.max(1, Math.min(6, building.levels ?? (building.kind === "apartments" ? 3 : 1)));
    const height = building.kind === "roof" ? 3.6 : levels * 3.05;
    const body = batch(materials.plaster[Math.abs(building.id) % materials.plaster.length]);
    facade(building, rings, height, { ...b, body });
    if (building.name && building.kind === "apartments") courtLabel(scene, building, points, height);
  }
  const shadowCasters: AbstractMesh[] = [];
  for (const [material, geometry] of batches) {
    const mesh = geometry.finish(scene);
    if (mesh && ![materials.ground, materials.asphalt, materials.pavement, materials.grass, materials.park, materials.line].includes(material)) shadowCasters.push(mesh);
  }
  return { shadowCasters, windowMaterial: materials.glazing, lamps: lampPositions, stats: { roads: ROADS.length, buildings: BUILDINGS.length, fields: FIELDS.length } };
}
