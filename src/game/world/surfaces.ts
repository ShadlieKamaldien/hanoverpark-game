import type Phaser from "phaser";
import { MAP, type MapFootprint, type MapPoint, type MapRoad } from "./mapData";

type Graphics = Phaser.GameObjects.Graphics;
type Point = MapPoint;
type Segment = {
  road: MapRoad;
  key: number;
  a: Point;
  b: Point;
  length: number;
  ux: number;
  uy: number;
  nx: number;
  ny: number;
  paintDistance: number;
  focus: number;
  footway: boolean;
};

const CELL = 320;
const COLUMNS = Math.ceil(MAP.width / CELL) + 1;
// Phaser's Canvas renderer replays Graphics commands every frame. Keep the
// entire suburb's additional layer below 6,000 drawing primitives, including
// drain bars and crack forks; never create a full-world raster texture.
const LIMITS = { grain: 1700, joints: 2000, chips: 350, patches: 250, cracks: 150, drains: 80, sand: 300, paint: 200 };

// Detail is original scenery. Its position follows the downloaded centreline;
// patched tar, paving seams and drains are not claims about surveyed furniture.
function randomFor(key: number) {
  let value = (key ^ 0x6d2b79f5) >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(value ^ (value >>> 15), value | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function inside(p: Point, ring: readonly Point[]) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > p.y) !== (b.y > p.y) &&
      p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}

function buildingContains(p: Point, b: MapFootprint) {
  const bounds = b.bounds;
  return p.x >= bounds.x && p.x <= bounds.x + bounds.w &&
    p.y >= bounds.y && p.y <= bounds.y + bounds.h &&
    inside(p, b.points) && !(b.holes ?? []).some((hole) => inside(p, hole));
}

// Clip first: a returned OSM way can extend far outside the suburb crop. Never
// sample its off-world length or add those coordinates to the spatial index.
function clip(a: Point, b: Point, margin: number): [Point, Point] | null {
  const dx = b.x - a.x, dy = b.y - a.y;
  let lo = 0, hi = 1;
  for (const [p, q] of [
    [-dx, a.x + margin], [dx, MAP.width + margin - a.x],
    [-dy, a.y + margin], [dy, MAP.height + margin - a.y],
  ]) {
    if (p === 0) { if (q < 0) return null; continue; }
    const t = q / p;
    if (p < 0) lo = Math.max(lo, t);
    else hi = Math.min(hi, t);
    if (lo > hi) return null;
  }
  return [{ x: a.x + dx * lo, y: a.y + dy * lo },
    { x: a.x + dx * hi, y: a.y + dy * hi }];
}

function cellKeys(x: number, y: number, w: number, h: number) {
  const keys: number[] = [];
  const x0 = Math.max(0, Math.floor(x / CELL));
  const y0 = Math.max(0, Math.floor(y / CELL));
  const x1 = Math.min(COLUMNS - 1, Math.floor((x + w) / CELL));
  const y1 = Math.min(Math.ceil(MAP.height / CELL), Math.floor((y + h) / CELL));
  for (let cy = y0; cy <= y1; cy++)
    for (let cx = x0; cx <= x1; cx++) keys.push(cy * COLUMNS + cx);
  return keys;
}

function pointKey(p: Point) {
  return Math.floor(p.y / CELL) * COLUMNS + Math.floor(p.x / CELL);
}

function distance(p: Point, segment: Segment) {
  const along = Math.max(0, Math.min(segment.length,
    (p.x - segment.a.x) * segment.ux + (p.y - segment.a.y) * segment.uy));
  return Math.hypot(p.x - segment.a.x - segment.ux * along,
    p.y - segment.a.y - segment.uy * along);
}

function at(s: Segment, along: number, across = 0): Point {
  return { x: s.a.x + s.ux * along + s.nx * across,
    y: s.a.y + s.uy * along + s.ny * across };
}

function polygon(g: Graphics, points: Point[]) {
  g.beginPath().moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
  g.closePath().fillPath();
}

function stroke(g: Graphics, points: Point[]) {
  g.beginPath().moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
  g.strokePath();
}

/** Add static wear after every base carriageway has been painted. */
export function drawStreetSurfaces(_scene: Phaser.Scene, g: Graphics): void {
  const segments: Segment[] = [];
  const roadCells = new Map<number, Segment[]>();
  const buildingCells = new Map<number, MapFootprint[]>();
  for (const building of MAP.buildings) {
    const b = building.bounds;
    for (const key of cellKeys(b.x, b.y, b.w, b.h)) {
      const cell = buildingCells.get(key) ?? [];
      cell.push(building);
      buildingCells.set(key, cell);
    }
  }
  for (const road of MAP.roads) {
    let travelled = 0;
    for (let i = 1; i < road.points.length; i++) {
      const sourceA = road.points[i - 1], sourceB = road.points[i];
      const startDistance = travelled;
      travelled += Math.hypot(sourceB.x - sourceA.x, sourceB.y - sourceA.y);
      const clipped = clip(road.points[i - 1], road.points[i], road.width / 2 + 12);
      if (!clipped) continue;
      const [a, b] = clipped;
      const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
      if (length < 12) continue;
      const s: Segment = { road, key: Math.imul(road.id, 31) ^ i,
        a, b, length, ux: dx / length, uy: dy / length,
        nx: -dy / length, ny: dx / length,
        paintDistance: startDistance + Math.hypot(a.x - sourceA.x, a.y - sourceA.y),
        focus: 1,
        footway: /footway|path|steps|cycleway/.test(road.kind) };
      segments.push(s);
      const margin = road.width / 2 + 35;
      const x = Math.min(a.x, b.x) - margin, y = Math.min(a.y, b.y) - margin;
      for (const key of cellKeys(x, y, Math.abs(dx) + margin * 2, Math.abs(dy) + margin * 2)) {
        const cell = roadCells.get(key) ?? [];
        cell.push(s);
        roadCells.set(key, cell);
      }
    }
  }

  function onGround(points: Point[]) {
    return points.every((p) => p.x >= 2 && p.y >= 2 && p.x <= MAP.width - 2 && p.y <= MAP.height - 2 &&
      !(buildingCells.get(pointKey(p)) ?? []).some((b) => buildingContains(p, b)));
  }

  function junction(p: Point, own: Segment, margin: number, edge = false) {
    return (roadCells.get(pointKey(p)) ?? []).some((other) => {
      if (other === own) return false;
      const cross = Math.abs(other.ux * own.uy - other.uy * own.ux);
      // Collinear consecutive OSM ways may be split at a node. Do not leave a
      // conspicuous untextured seam there, but keep pavement out of cross roads.
      if (!edge && cross < 0.3) return false;
      if (edge && cross < 0.15 && distance(p, other) >= own.road.width / 2 - 3) return false;
      return distance(p, other) < other.road.width / 2 + margin;
    });
  }

  const anchors = [MAP.locations.spawn, MAP.locations.target, MAP.locations.pitch];
  for (const s of segments) {
    const nearest = Math.min(...anchors.map((p) => distance(p, s)));
    s.focus = nearest <= 1200 ? 4 : 1;
  }
  // Redistribute the same bounded command budget toward the playable places.
  // Closest-point distance includes a long segment that enters the area even
  // when its midpoint lies elsewhere. Remote streets still receive detail.
  const totalArea = segments.reduce((sum, s) => sum + s.length * s.road.width * s.focus, 0);
  const totalLength = segments.reduce((sum, s) => sum + s.length * s.focus, 0);
  const streetWeight = (s: Segment) => s.focus *
    (s.focus > 1 && /service|residential|living_street/.test(s.road.kind) && s.length < 240 ? 2 : 1);
  const streetLength = segments.filter((s) => !s.footway)
    .reduce((sum, s) => sum + s.length * streetWeight(s), 0);
  const counts = { grain: 0, joints: 0, chips: 0, patches: 0, cracks: 0, drains: 0, sand: 0, paint: 0 };
  const jointSpacing = Math.max(52, totalLength * 2 / LIMITS.joints);
  const patchSpacing = Math.max(320, streetLength / LIMITS.patches);
  const crackSpacing = Math.max(450, streetLength / LIMITS.cracks);
  const drainSpacing = Math.max(1000, streetLength / LIMITS.drains);
  const sandSpacing = Math.max(550, streetLength / LIMITS.sand);
  const paintedLength = segments.filter((s) => /trunk|primary|secondary|tertiary/.test(s.road.kind))
    .reduce((sum, s) => sum + s.length * s.focus, 0);
  const paintChance = Math.min(0.18, LIMITS.paint * 78 / Math.max(1, paintedLength));

  for (const s of segments) {
    const random = randomFor(s.key);
    const half = s.road.width / 2;
    // Allocate grain proportionally across the entire source, instead of using
    // a global cap that would make later streets abruptly lose their texture.
    const expected = LIMITS.grain * s.length * s.road.width * s.focus / totalArea;
    const grains = Math.floor(expected) + Number(random() < expected % 1);
    for (let i = 0; i < grains && counts.grain < LIMITS.grain; i++) {
      const p = at(s, 3 + random() * Math.max(0, s.length - 6), (random() * 2 - 1) * (half - 4));
      if (!onGround([p])) continue;
      const light = random() > 0.56;
      g.fillStyle(s.footway ? (light ? 0xd3cbb0 : 0x878b7c) : (light ? 0x999789 : 0x414a46),
        0.3).fillRect(p.x, p.y, 1 + random() * 3, 1 + random() * 2);
      counts.grain++;
    }

    // Paving joints and kerb wear are oriented to each original straight road
    // segment. A neighbour check suppresses joints laid across another street.
    const localJointSpacing = jointSpacing / s.focus;
    for (let d = 14 + random() * localJointSpacing; d < s.length - 14; d += localJointSpacing) {
      for (const side of [-1, 1]) {
        if (counts.joints >= LIMITS.joints) break;
        const start = at(s, d, side * (s.footway ? -half + 3 : half + 1));
        const end = at(s, d + (random() - 0.5) * 2, side * (s.footway ? half - 3 : half + 8));
        const middle = at(s, d, side * (s.footway ? 0 : half + 5));
        if (!onGround([start, end]) || junction(middle, s, 4, !s.footway)) continue;
        g.lineStyle(1, 0x777d70, 0.4).lineBetween(start.x, start.y, end.x, end.y);
        if (!s.footway && random() < 0.18 && counts.chips < LIMITS.chips) {
          const chip = at(s, d + 3, side * (half + 9));
          g.fillStyle(0xe3dcc3, 0.42).fillRect(chip.x, chip.y, 3, 2);
          counts.chips++;
        }
        counts.joints++;
        if (s.footway) break;
      }
    }

    if (s.footway) continue;
    const wearWeight = streetWeight(s);
    const localPatchSpacing = patchSpacing / wearWeight;
    const localCrackSpacing = crackSpacing / wearWeight;
    const localDrainSpacing = drainSpacing / wearWeight;
    const localSandSpacing = sandSpacing / wearWeight;
    if (/trunk|primary|secondary|tertiary/.test(s.road.kind)) {
      // Match the existing 31-pixel dash / 78-pixel repeat exactly, including
      // clipping and bends. Only weather existing paint; add no new road rules.
      for (let d = 12 - s.paintDistance % 78; d < s.length - 9; d += 78) {
        if (counts.paint >= LIMITS.paint) break;
        if (d < 8 || random() > paintChance * s.focus || junction(at(s, d), s, 14)) continue;
        const a = at(s, d - 3), b = at(s, d + 6);
        if (!onGround([a, b])) continue;
        g.lineStyle(2, 0x626966, 0.48).lineBetween(a.x, a.y, b.x, b.y);
        counts.paint++;
      }
    }
    for (let d = 15 + random() * localPatchSpacing; d < s.length - 15; d += localPatchSpacing) {
      if (counts.patches >= LIMITS.patches) break;
      const across = (random() * 2 - 1) * Math.max(0, half - 20);
      const p = at(s, d, across);
      if (junction(p, s, 28)) continue;
      const length = Math.min(16 + random() * 22, d - 4, s.length - d - 4);
      const width = 6 + random() * 9;
      const points = [at(s, d - length, across - width * 0.7),
        at(s, d - length * 0.7, across - width), at(s, d + length * 0.7, across - width),
        at(s, d + length, across - width * 0.5), at(s, d + length * 0.8, across + width),
        at(s, d - length * 0.7, across + width * 0.8)];
      if (!onGround(points)) continue;
      g.fillStyle(random() > 0.6 ? 0x8a8877 : 0x3f4b46, 0.38);
      polygon(g, points);
      g.lineStyle(1, 0x454d47, 0.22);
      stroke(g, [...points, points[0]]);
      counts.patches++;
    }

    for (let d = 23 + random() * localCrackSpacing; d < s.length - 23; d += localCrackSpacing) {
      if (counts.cracks >= LIMITS.cracks) break;
      const across = (random() * 2 - 1) * Math.max(0, half - 12);
      if (junction(at(s, d, across), s, 20)) continue;
      const points = [at(s, d - 18, across - 5), at(s, d - 5, across + 1),
        at(s, d + 2, across - 3), at(s, d + 19, across + 5)];
      if (!onGround(points)) continue;
      g.lineStyle(1, 0x343f38, 0.36);
      stroke(g, points);
      const fork = [points[1], at(s, d, across + 9)];
      if (onGround(fork)) stroke(g, fork);
      counts.cracks++;
    }

    for (let d = 14 + random() * localDrainSpacing; d < s.length - 14; d += localDrainSpacing) {
      if (counts.drains >= LIMITS.drains) break;
      const side = random() > 0.5 ? 1 : -1, across = side * (half - 5);
      const p = at(s, d, across);
      if (junction(p, s, 22, true)) continue;
      const points = [at(s, d - 8, across - 3), at(s, d + 8, across - 3),
        at(s, d + 8, across + 3), at(s, d - 8, across + 3)];
      if (!onGround(points)) continue;
      g.fillStyle(0x3e4941, 0.9);
      polygon(g, points);
      g.lineStyle(1, 0x92988a, 0.75);
      for (let k = -5; k <= 5; k += 3) {
        const a = at(s, d + k, across - 2), b = at(s, d + k, across + 2);
        g.lineBetween(a.x, a.y, b.x, b.y);
      }
      counts.drains++;
    }

    for (let d = 30 + random() * localSandSpacing; d < s.length - 30; d += localSandSpacing) {
      if (counts.sand >= LIMITS.sand) break;
      const side = random() > 0.5 ? 1 : -1, across = side * (half - 2);
      if (junction(at(s, d, across), s, 24, true)) continue;
      const points = [at(s, d - 20, across), at(s, d + 25, across + side),
        at(s, d + 12, across - side * 3), at(s, d - 9, across - side * 5)];
      if (!onGround(points)) continue;
      g.fillStyle(0xb9ac87, 0.45);
      polygon(g, points);
      counts.sand++;
    }
  }
}
