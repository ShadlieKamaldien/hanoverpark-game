import Phaser from "phaser";
import type { Rect } from "../systems/collision";
import { MAP } from "./mapData";

type Point = { x: number; y: number };
type Graphics = Phaser.GameObjects.Graphics;
type MappedBuilding = (typeof MAP.buildings)[number];
type MappedRoad = (typeof MAP.roads)[number];

const PALETTE = {
  ground: 0xb8b29a,
  pavement: 0xcec7af,
  kerb: 0x949686,
  asphalt: 0x626e6a,
  grass: 0x929e78,
  roof: [0xa6a697, 0x999b8d, 0xb4b19d, 0x9a9688],
};

function buildingColor(b: MappedBuilding, index: number) {
  if (/school/.test(b.kind)) return 0xb5b8a2;
  if (/retail|shop|commercial|mall/.test(b.kind)) return 0xa59b83;
  if (/church|worship/.test(b.kind)) return 0xbcb5a0;
  return PALETTE.roof[index % PALETTE.roof.length];
}

// Bounds remain available to the minimap. Runtime collision uses the original
// polygons in mapData rather than boxes spanning rotated flats or courtyards.
export const BUILDINGS = MAP.buildings.map((b, index) => ({
  ...b.bounds,
  name: b.name ?? "Mapped building",
  color: buildingColor(b, index),
}));

function fillPolygon(g: Graphics, points: readonly Point[], x = 0, y = 0) {
  if (points.length < 3) return;
  g.beginPath().moveTo(points[0].x + x, points[0].y + y);
  for (const p of points.slice(1)) g.lineTo(p.x + x, p.y + y);
  g.closePath().fillPath();
}

// Earcut keeps courtyard interiors transparent. A single path containing
// triangle subpaths works for both Phaser's WebGL and Canvas geometry masks.
function fillFootprint(g: Graphics, b: MappedBuilding, x = 0, y = 0) {
  const holes = b.holes ?? [];
  if (!holes.length) {
    fillPolygon(g, b.points, x, y);
    return;
  }
  const points = closedPoints(b.points);
  const holeIndices: number[] = [];
  for (const hole of holes) {
    holeIndices.push(points.length);
    points.push(...closedPoints(hole));
  }
  const triangles = Phaser.Geom.Polygon.Earcut(points.flatMap((p) => [p.x, p.y]), holeIndices);
  g.beginPath();
  for (let i = 0; i < triangles.length; i += 3) {
    const a = points[triangles[i]], b = points[triangles[i + 1]], c = points[triangles[i + 2]];
    g.moveTo(a.x + x, a.y + y).lineTo(b.x + x, b.y + y)
      .lineTo(c.x + x, c.y + y).closePath();
  }
  g.fillPath();
}

function footprintContains(p: Point, b: MappedBuilding) {
  return inside(p, b.points) && !(b.holes ?? []).some((hole) => inside(p, hole));
}

function strokeLine(g: Graphics, points: readonly Point[]) {
  if (points.length < 2) return;
  g.beginPath().moveTo(points[0].x, points[0].y);
  for (const p of points.slice(1)) g.lineTo(p.x, p.y);
  g.strokePath();
}

function closedPoints(points: readonly Point[]) {
  const first = points[0], last = points[points.length - 1];
  return first && last && first.x === last.x && first.y === last.y
    ? points.slice(0, -1)
    : [...points];
}

function centre(points: readonly Point[]): Point {
  const ring = closedPoints(points);
  let area = 0, x = 0, y = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const cross = a.x * b.y - b.x * a.y;
    area += cross;
    x += (a.x + b.x) * cross;
    y += (a.y + b.y) * cross;
  }
  if (Math.abs(area) > 0.01) return { x: x / (3 * area), y: y / (3 * area) };
  return ring[0] ?? { x: 0, y: 0 };
}

function inside(p: Point, points: readonly Point[]) {
  let result = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > p.y) !== (b.y > p.y) &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      result = !result;
  }
  return result;
}

function distanceToSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  const t = length2 ? Phaser.Math.Clamp(
    ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2, 0, 1,
  ) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

const ROAD_SEGMENTS = MAP.roads.flatMap((r) => r.points.slice(1).map((b, i) => ({
  a: r.points[i], b, width: r.width,
})));

function roadAt(p: Point, margin = 0) {
  return ROAD_SEGMENTS.some((s) =>
    distanceToSegment(p, s.a, s.b) < s.width / 2 + margin,
  );
}

function buildingAt(p: Point, margin: number) {
  return MAP.buildings.some((b) => {
    const r = b.bounds;
    if (p.x < r.x - margin || p.x > r.x + r.w + margin ||
      p.y < r.y - margin || p.y > r.y + r.h + margin) return false;
    return footprintContains(p, b) || [b.points, ...(b.holes ?? [])].some((ring) =>
      ring.some((a, i) => distanceToSegment(p, a, ring[(i + 1) % ring.length]) < margin),
    );
  });
}

function label(scene: Phaser.Scene, p: Point, name: string, style: "street" | "place") {
  return scene.add.text(p.x, p.y, name, {
    fontFamily: "monospace",
    fontSize: style === "street" ? "12px" : "11px",
    color: style === "street" ? "#ede9d2" : "#fff4d8",
    backgroundColor: style === "street" ? "#4d605b" : "#3d594e",
    padding: { x: 6, y: 3 },
  }).setOrigin(0.5).setDepth(8);
}

function drawGround(g: Graphics) {
  const random = new Phaser.Math.RandomDataGenerator(["hanover-mapped-ground"]);
  g.fillStyle(PALETTE.ground).fillRect(0, 0, MAP.width, MAP.height);
  // These restrained textures are original scenery, not invented building
  // footprints. Missing OSM coverage stays visibly open on the map.
  for (let i = 0; i < 420; i++) {
    g.fillStyle(random.pick([0xa4ab87, 0xc5bc9c, 0xa8a98d]), 0.32).fillRect(
      random.between(0, MAP.width), random.between(0, MAP.height),
      random.between(75, 290), random.between(40, 150),
    );
  }
  for (let i = 0; i < 8500; i++) {
    g.fillStyle(random.pick([0x8e987c, 0xd5cdb0, 0xa99c7f]), 0.35).fillRect(
      random.between(0, MAP.width), random.between(0, MAP.height),
      random.between(2, 7), random.between(1, 3),
    );
  }
  g.lineStyle(3, 0x71836c, 0.25);
  strokeLine(g, MAP.boundary);
}

function drawFields(scene: Phaser.Scene, g: Graphics, names: Set<string>) {
  for (const field of MAP.fields) {
    const pitch = /pitch/.test(field.kind);
    g.fillStyle(pitch ? 0x829a77 : PALETTE.grass, 0.88);
    fillFootprint(g, field);
    const c = centre(field.points);
    const ring = closedPoints(field.points);
    const bounds = field.bounds;
    const random = new Phaser.Math.RandomDataGenerator([`sports-ground-${field.id}`]);
    if (pitch) {
      // Original lawn variation stays within the sourced field boundary.
      // These stripes and practice markings are game scenery, not surveyed
      // pitch dimensions or a claim about its current sporting arrangement.
      for (let y = bounds.y; y < bounds.y + bounds.h; y += 70) {
        if (Math.floor((y - bounds.y) / 70) % 2) continue;
        for (let x = bounds.x; x < bounds.x + bounds.w; x += 60) {
          const corners = [{ x, y }, { x: x + 60, y },
            { x: x + 60, y: y + 70 }, { x, y: y + 70 }];
          if (corners.every((p) => footprintContains(p, field)))
            g.fillStyle(0x91a47e, 0.28).fillRect(x, y, 60, 70);
        }
      }
      const patches = Math.min(650, Math.max(25, Math.round(bounds.w * bounds.h / 6500)));
      for (let i = 0; i < patches; i++) {
        const x = random.between(bounds.x + 8, bounds.x + bounds.w - 8);
        const y = random.between(bounds.y + 5, bounds.y + bounds.h - 5);
        if (!footprintContains({ x, y }, field)) continue;
        g.fillStyle(random.pick([0xc3b788, 0xa6b58c, 0x647f5d]), 0.34)
          .fillRect(x, y, random.between(2, 7), random.between(1, 3));
      }
      g.lineStyle(2, 0x667e62, 0.8);
      strokeLine(g, [...ring, ring[0]]);
    }
    const inset = ring.map((p) => ({
      x: c.x + (p.x - c.x) * 0.88,
      y: c.y + (p.y - c.y) * 0.88,
    }));
    if (pitch && ring.length <= 5) {
      g.lineStyle(2, 0xede9d0, 0.66);
      strokeLine(g, [...inset, inset[0]]);
      if (inset.length === 4) {
        const mid = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        const a = mid(inset[0], inset[1]), b = mid(inset[2], inset[3]);
        g.lineBetween(a.x, a.y, b.x, b.y);
        g.strokeCircle(c.x, c.y, Math.min(bounds.w, bounds.h) * 0.1);
      }
    }
    let namePosition = c;
    if (field.name === MAP.locations.pitch.name && footprintContains(MAP.locations.pitch, field)) {
      const p = MAP.locations.pitch;
      const corners = [{ x: p.x - 300, y: p.y - 170 }, { x: p.x + 300, y: p.y - 170 },
        { x: p.x + 300, y: p.y + 170 }, { x: p.x - 300, y: p.y + 170 }];
      if (corners.every((q) => footprintContains(q, field))) {
        g.lineStyle(2, 0xf0ead1, 0.82)
          .strokeRect(p.x - 280, p.y - 170, 560, 340)
          .lineBetween(p.x, p.y - 170, p.x, p.y + 170)
          .strokeCircle(p.x, p.y, 47)
          .strokeRect(p.x - 280, p.y - 90, 82, 180)
          .strokeRect(p.x + 198, p.y - 90, 82, 180);
        g.fillStyle(0xf0ead1, 0.85).fillCircle(p.x, p.y, 3);
        for (const x of [p.x - 298, p.x + 280]) {
          g.lineStyle(1, 0xe3e4c9, 0.75).strokeRect(x, p.y - 35, 18, 70);
          for (let y = p.y - 28; y < p.y + 35; y += 9)
            g.lineBetween(x, y, x + 18, y);
          g.lineStyle(3, 0xf1edd5).lineBetween(
            x < p.x ? x + 18 : x, p.y - 35,
            x < p.x ? x + 18 : x, p.y + 35,
          );
        }
        namePosition = { x: p.x, y: p.y - 135 };
      }
    }
    if (field.name && !names.has(field.name)) {
      label(scene, namePosition, field.name, "place");
      names.add(field.name);
    }
  }
}

function drawRoads(scene: Phaser.Scene, g: Graphics) {
  const roads = [...MAP.roads].sort((a, b) => a.width - b.width);
  // Lay every pavement before any asphalt so junctions stay connected.
  for (const road of roads) {
    const footway = /footway|path|steps|cycleway/.test(road.kind);
    g.lineStyle(road.width + (footway ? 3 : 21), PALETTE.kerb);
    strokeLine(g, road.points);
    g.lineStyle(road.width + (footway ? 1 : 17), PALETTE.pavement);
    strokeLine(g, road.points);
  }
  for (const road of roads) {
    g.lineStyle(road.width, /footway|path|steps|cycleway/.test(road.kind)
      ? 0xb4b59c : PALETTE.asphalt);
    strokeLine(g, road.points);
  }
  for (const road of roads) {
    if (!/trunk|primary|secondary|tertiary/.test(road.kind)) continue;
    g.lineStyle(2, 0xe5deba, 0.82);
    let travelled = 0;
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1], b = road.points[i];
      const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
      if (!length) continue;
      for (let d = -(travelled % 78); d < length; d += 78) {
        const start = Math.max(0, d), end = Math.min(length, d + 31);
        if (end > start) g.lineBetween(
          a.x + dx * start / length, a.y + dy * start / length,
          a.x + dx * end / length, a.y + dy * end / length,
        );
      }
      travelled += length;
    }
  }
  const groups = new Map<string, { road: MappedRoad; length: number }>();
  for (const road of MAP.roads) {
    if (!road.name) continue;
    const length = road.points.slice(1).reduce((sum, p, i) =>
      sum + Math.hypot(p.x - road.points[i].x, p.y - road.points[i].y), 0);
    if (length > (groups.get(road.name)?.length ?? 0)) groups.set(road.name, { road, length });
  }
  const placed: Point[] = [];
  // Downberg Road is labelled first, then main roads, before smaller streets.
  const streets = [...groups.entries()].sort(([a, va], [b, vb]) =>
    Number(b === "Downberg Road") - Number(a === "Downberg Road") || vb.length - va.length);
  for (const [name, { road, length }] of streets) {
    if (length < 125) continue;
    let travelled = 0;
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1], b = road.points[i];
      const segment = Math.hypot(b.x - a.x, b.y - a.y);
      if (travelled + segment >= length / 2) {
        const t = (length / 2 - travelled) / segment;
        const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        if (p.x < 40 || p.y < 40 || p.x > MAP.width - 40 || p.y > MAP.height - 40 ||
          placed.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 160)) break;
        let angle = Math.atan2(b.y - a.y, b.x - a.x);
        if (angle > Math.PI / 2) angle -= Math.PI;
        if (angle < -Math.PI / 2) angle += Math.PI;
        label(scene, p, name, "street").setRotation(angle);
        placed.push(p);
        break;
      }
      travelled += segment;
    }
  }
}

function drawBuilding(scene: Phaser.Scene, ground: Graphics, building: MappedBuilding, index: number) {
  const points = closedPoints(building.points);
  if (points.length < 3) return;
  const flats = /apartments|residential/.test(building.kind) || /court|hof/i.test(building.name ?? "");
  const commercial = /retail|shop|commercial|mall/.test(building.kind);
  const color = buildingColor(building, index);
  ground.fillStyle(0x35473e, 0.22);
  fillFootprint(ground, building, 8, 11);
  ground.fillStyle(color);
  fillFootprint(ground, building);
  ground.lineStyle(3, 0x6f7568);
  for (const ring of [points, ...(building.holes ?? [])]) {
    strokeLine(ground, [...ring, ring[0]]);
  }
  let g = ground;
  if (building.holes?.length) {
    // Mask every roof/facade detail, including long ridges and windows, rather
    // than painting over holes afterwards and losing real ground or paths.
    const shape = scene.make.graphics({}, false).fillStyle(0xffffff);
    fillFootprint(shape, building);
    g = scene.add.graphics().setDepth(0).setMask(shape.createGeometryMask());
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      g.clearMask(true);
      shape.destroy();
    });
  }
  const area = points.reduce((sum, a, i) => {
    const b = points[(i + 1) % points.length];
    return sum + a.x * b.y - b.x * a.y;
  }, 0);
  const c = centre(points);
  const edges = points.map((a, i) => {
    const b = points[(i + 1) % points.length], length = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = length ? (b.x - a.x) / length : 0;
    const uy = length ? (b.y - a.y) / length : 0;
    return { a, b, length, ux, uy, nx: -uy * Math.sign(area), ny: ux * Math.sign(area) };
  });
  const longest = [...edges].sort((a, b) => b.length - a.length)[0];
  if (longest && longest.length > 65) {
    const { ux, uy, length } = longest;
    const ridge = [{ x: c.x - ux * length * 0.38, y: c.y - uy * length * 0.38 },
      { x: c.x + ux * length * 0.38, y: c.y + uy * length * 0.38 }];
    if (ridge.every((p) => inside(p, points))) {
      g.lineStyle(3, 0xd1cbb2, 0.8);
      strokeLine(g, ridge);
      g.lineStyle(1, 0x646f64, 0.35);
      for (let d = -length * 0.38; d < length * 0.38; d += 12) {
        const p = { x: c.x + ux * d, y: c.y + uy * d };
        const a = { x: p.x - uy * 12, y: p.y + ux * 12 };
        const b = { x: p.x + uy * 12, y: p.y - ux * 12 };
        if (inside(a, points) && inside(b, points)) strokeLine(g, [a, b]);
      }
    }
  }
  if (commercial) {
    const bounds = building.bounds;
    for (let y = bounds.y + 45; y < bounds.y + bounds.h - 30; y += 95) {
      for (let x = bounds.x + 45; x < bounds.x + bounds.w - 30; x += 110) {
        const corners = [{ x: x - 15, y: y - 10 }, { x: x + 15, y: y - 10 },
          { x: x + 15, y: y + 10 }, { x: x - 15, y: y + 10 }];
        if (!corners.every((p) => footprintContains(p, building))) continue;
        g.fillStyle(0x687c78).fillRect(x - 17, y - 12, 34, 24);
        g.fillStyle(0x93b0ac).fillRect(x - 14, y - 9, 28, 18);
        g.fillStyle(0xc3d0ba).fillRect(x - 13, y - 9, 26, 3);
        g.lineStyle(2, 0x677e77).lineBetween(x, y - 9, x, y + 9);
      }
    }
  }
  for (const edge of edges) {
    if (edge.length < 25) continue;
    const { a, b, nx, ny, ux, uy, length } = edge;
    if (ny >= -0.12 && nx >= -0.12) {
      g.lineStyle(2, 0xded4b8, 0.9).lineBetween(a.x, a.y, b.x, b.y);
      continue;
    }
    // The visible south-facing wall stays within the mapped footprint.
    const depth = flats ? 22 : 13;
    g.fillStyle(flats ? (nx < -0.12 ? 0xb5aa91 : 0xc6b99c) : 0xb6b39c);
    fillPolygon(g, [a, b, { x: b.x + nx * depth, y: b.y + ny * depth },
      { x: a.x + nx * depth, y: a.y + ny * depth }]);
    g.lineStyle(2, 0x6f7868).lineBetween(a.x, a.y, b.x, b.y);
    const rows = flats ? [6, 15] : [6];
    for (let d = 18; d < length - 10; d += 34) {
      for (const inset of rows) {
        const p = { x: a.x + ux * d + nx * inset, y: a.y + uy * d + ny * inset };
        g.lineStyle(5, 0x435e5f).lineBetween(p.x, p.y, p.x + ux * 13, p.y + uy * 13);
        g.lineStyle(1, 0xe4d9ba).lineBetween(
          p.x + ux * 6, p.y + uy * 6,
          p.x + ux * 6 + nx * 4, p.y + uy * 6 + ny * 4,
        );
      }
      if (flats && Math.floor(d / 34) % 3 === 1) {
        const p = { x: a.x + ux * (d + 15) + nx * 8, y: a.y + uy * (d + 15) + ny * 8 };
        g.lineStyle(5, [0xb96b59, 0xd8c08c, 0x809f9a][index % 3])
          .lineBetween(p.x, p.y, p.x + ux * 6, p.y + uy * 6);
      }
    }
    const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (commercial && length > 110) {
      g.lineStyle(10, 0x537c6c).lineBetween(
        middle.x - ux * 37 + nx * 6, middle.y - uy * 37 + ny * 6,
        middle.x + ux * 37 + nx * 6, middle.y + uy * 37 + ny * 6,
      );
      g.lineStyle(3, 0xe7dcba);
      for (let d = -34; d < 35; d += 13) {
        g.lineBetween(middle.x + ux * d + nx * 2, middle.y + uy * d + ny * 2,
          middle.x + ux * d + nx * 10, middle.y + uy * d + ny * 10);
      }
    }
    g.lineStyle(8, 0x3f554b).lineBetween(middle.x + nx * 3, middle.y + ny * 3,
      middle.x + nx * 10, middle.y + ny * 10);
  }
  if (footprintContains(c, building)) {
    g.fillStyle(0x69786a).fillRect(c.x - 7, c.y - 9, 12, 9);
    g.fillStyle(0xbec1ab).fillRect(c.x - 9, c.y - 11, 12, 7);
    g.lineStyle(1, 0x56685c).lineBetween(c.x + 15, c.y - 6, c.x + 15, c.y - 20);
    g.lineBetween(c.x + 9, c.y - 16, c.x + 21, c.y - 16);
  }
}

function drawTree(g: Graphics, p: Point, index: number) {
  const { x, y } = p;
  g.fillStyle(0x3f4d3a, 0.18).fillRect(x + 3, y - 9, 43, 34);
  g.fillStyle(0x7f684b).fillRect(x - 4, y - 4, 8, 25);
  g.fillStyle(0x41674d).fillRect(x - 20, y - 23, 42, 32);
  g.fillStyle(index % 2 ? 0x62835d : 0x72906b)
    .fillRect(x - 26, y - 27, 40, 22).fillRect(x - 16, y - 39, 29, 18);
  g.fillStyle(0x97aa78).fillRect(x - 19, y - 28, 16, 10).fillRect(x + 4, y - 31, 7, 6);
}

function drawScenery(scene: Phaser.Scene, g: Graphics, solids: Rect[]) {
  const random = new Phaser.Math.RandomDataGenerator(["mapped-hanover-scenery"]);
  const important = [MAP.locations.spawn, MAP.locations.car, MAP.locations.fatima,
    MAP.locations.gatie, MAP.locations.jerome, MAP.locations.target, MAP.locations.pitch,
    MAP.locations.shop, MAP.locations.taxi, ...MAP.locations.walkers];
  const clear = (p: Point, radius: number) => p.x > 35 && p.y > 45 &&
    p.x < MAP.width - 45 && p.y < MAP.height - 35 && !roadAt(p, radius) &&
    !buildingAt(p, radius) && important.every((q) => Math.hypot(p.x - q.x, p.y - q.y) > 145) &&
    !MAP.deliveryPath.slice(1).some((b, i) => distanceToSegment(p, MAP.deliveryPath[i], b) < 150) &&
    !MAP.fields.some((f) => /pitch/.test(f.kind) && inside(p, f.points));
  let trees = 0;
  for (let i = 0; i < 1600 && trees < 155; i++) {
    const p = { x: random.between(40, MAP.width - 40), y: random.between(50, MAP.height - 40) };
    if (!clear(p, 32)) continue;
    drawTree(g, p, trees++);
    solids.push({ x: p.x - 7, y: p.y - 6, w: 14, h: 27 });
  }
  // Unbranded parked minibuses are simulation scenery, not asserted taxi-rank
  // coordinates. Keep all mapped streets and mission approaches unobstructed.
  const taxi = MAP.locations.taxi;
  for (const offset of [{ x: 80, y: 70 }, { x: 130, y: 70 }]) {
    const p = { x: taxi.x + offset.x, y: taxi.y + offset.y };
    if (!clear(p, 40)) continue;
    scene.add.sprite(p.x, p.y, "taxi").setDepth(20);
    solids.push({ x: p.x - 19, y: p.y - 32, w: 38, h: 64 });
  }
}

export function drawWorld(scene: Phaser.Scene): Rect[] {
  const g = scene.add.graphics().setDepth(0);
  const solids: Rect[] = [];
  const names = new Set<string>();
  drawGround(g);
  drawFields(scene, g, names);
  drawRoads(scene, g);
  for (const [index, b] of MAP.buildings.entries()) {
    drawBuilding(scene, g, b, index);
    if (b.name && !names.has(b.name)) {
      label(scene, centre(b.points), b.name, "place");
      names.add(b.name);
    }
  }
  for (const poi of MAP.pois) {
    if (!names.has(poi.name)) {
      // A small map marker identifies sourced POIs whose building footprint
      // is absent. It does not add a made-up shop building or a collider.
      g.fillStyle(0x395c50).fillCircle(poi.x, poi.y, 11);
      g.lineStyle(2, 0xf0e2bc).strokeCircle(poi.x, poi.y, 11);
      g.fillStyle(0xf0e2bc).fillRect(poi.x - 4, poi.y - 4, 8, 7);
      label(scene, { x: poi.x, y: poi.y - 24 }, poi.name, "place");
      names.add(poi.name);
    }
  }
  drawScenery(scene, g, solids);
  return solids;
}
