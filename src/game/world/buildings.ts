import Phaser from "phaser";
import type { MapFootprint, MapPoint } from "./mapData";
import type { WindowGlow } from "./visualTypes";

type Graphics = Phaser.GameObjects.Graphics;
type Edge = {
  a: MapPoint;
  b: MapPoint;
  length: number;
  ux: number;
  uy: number;
  nx: number;
  ny: number;
};

const ROOFS = [0xa9a391, 0x93998d, 0xb7af99, 0xaaa596];
const PLASTER = [0xd1b99a, 0xbdb59f, 0xd1bfa4, 0xc5b79f];
const CLOTH = [0xb66e62, 0x8ca6a0, 0xc6b078, 0xc7c5b1, 0x82919f];

export function buildingColor(building: MapFootprint, index: number) {
  if (/school/.test(building.kind)) return 0xb1baa2;
  if (/retail|shop|commercial|mall/.test(building.kind)) return 0xa99d88;
  if (/church|worship/.test(building.kind)) return 0xbfb79e;
  return ROOFS[index % ROOFS.length];
}

function ring(points: readonly MapPoint[]) {
  const first = points[0], last = points[points.length - 1];
  return first && last && first.x === last.x && first.y === last.y
    ? points.slice(0, -1) : [...points];
}

function polygon(g: Graphics, points: readonly MapPoint[], stroke = false) {
  if (points.length < 3) return;
  g.beginPath().moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
  g.closePath();
  if (stroke) g.strokePath();
  else g.fillPath();
}

function fillFootprint(g: Graphics, building: MapFootprint, x = 0, y = 0) {
  // Triangles retain the exact source outline and courtyard holes in Canvas
  // and WebGL; no replacement bounding rectangle is ever painted.
  const points = ring(building.points);
  if (points.length < 3) return;
  const holes: number[] = [];
  for (const hole of building.holes ?? []) {
    holes.push(points.length);
    points.push(...ring(hole));
  }
  const triangles = Phaser.Geom.Polygon.Earcut(
    points.flatMap((point) => [point.x, point.y]), holes,
  );
  g.beginPath();
  for (let i = 0; i < triangles.length; i += 3) {
    const a = points[triangles[i]], b = points[triangles[i + 1]], c = points[triangles[i + 2]];
    g.moveTo(a.x + x, a.y + y).lineTo(b.x + x, b.y + y)
      .lineTo(c.x + x, c.y + y).closePath();
  }
  g.fillPath();
}

function inside(point: MapPoint, points: readonly MapPoint[]) {
  let result = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > point.y) !== (b.y > point.y) &&
      point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x)
      result = !result;
  }
  return result;
}

function contains(point: MapPoint, building: MapFootprint) {
  return inside(point, building.points) &&
    !(building.holes ?? []).some((hole) => inside(point, hole));
}

function cross(a: MapPoint, b: MapPoint, c: MapPoint) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function crosses(a: MapPoint, b: MapPoint, c: MapPoint, d: MapPoint) {
  return cross(a, b, c) * cross(a, b, d) < 0 &&
    cross(c, d, a) * cross(c, d, b) < 0;
}

function fits(corners: MapPoint[], building: MapFootprint) {
  if (!corners.every((point) => contains(point, building))) return false;
  const rings = [ring(building.points), ...(building.holes ?? []).map(ring)];
  if (rings.some((outline) => outline.some((a, i) =>
    corners.some((c, j) => crosses(a, outline[(i + 1) % outline.length],
      c, corners[(j + 1) % corners.length]))))) return false;
  // A small hole entirely inside a larger roof fixture also needs exclusion.
  return !(building.holes ?? []).some((hole) => hole.some((p) => inside(p, corners)));
}

function edges(points: readonly MapPoint[], hole = false): Edge[] {
  const outline = ring(points);
  const area = outline.reduce((sum, a, i) => {
    const b = outline[(i + 1) % outline.length];
    return sum + a.x * b.y - b.x * a.y;
  }, 0);
  const sign = (Math.sign(area) || 1) * (hole ? -1 : 1);
  return outline.map((a, i) => {
    const b = outline[(i + 1) % outline.length];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = length ? (b.x - a.x) / length : 0;
    const uy = length ? (b.y - a.y) / length : 0;
    return { a, b, length, ux, uy, nx: -uy * sign, ny: ux * sign };
  });
}

function point(edge: Edge, along: number, inset: number): MapPoint {
  return {
    x: edge.a.x + edge.ux * along + edge.nx * inset,
    y: edge.a.y + edge.uy * along + edge.ny * inset,
  };
}

function rectangle(edge: Edge, along: number, inset: number, width: number, height: number) {
  return [point(edge, along - width / 2, inset - height / 2),
    point(edge, along + width / 2, inset - height / 2),
    point(edge, along + width / 2, inset + height / 2),
    point(edge, along - width / 2, inset + height / 2)];
}

function rect(g: Graphics, edge: Edge, along: number, inset: number, width: number, height: number) {
  polygon(g, rectangle(edge, along, inset, width, height));
}

function line(g: Graphics, edge: Edge, from: number, inset: number, to: number, otherInset = inset) {
  const a = point(edge, from, inset), b = point(edge, to, otherInset);
  g.lineBetween(a.x, a.y, b.x, b.y);
}

function centre(building: MapFootprint): MapPoint {
  const points = ring(building.points);
  let area = 0, x = 0, y = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const weight = a.x * b.y - b.x * a.y;
    area += weight;
    x += (a.x + b.x) * weight;
    y += (a.y + b.y) * weight;
  }
  return Math.abs(area) > 0.01 ? { x: x / (3 * area), y: y / (3 * area) }
    : { x: building.bounds.x + building.bounds.w / 2, y: building.bounds.y + building.bounds.h / 2 };
}

function shade(color: number, factor: number) {
  return (Math.round(((color >> 16) & 255) * factor) << 16) |
    (Math.round(((color >> 8) & 255) * factor) << 8) |
    Math.round((color & 255) * factor);
}

function drawWindow(
  g: Graphics, building: MapFootprint, edge: Edge, along: number, inset: number,
  random: Phaser.Math.RandomDataGenerator, windows: WindowGlow[], balcony: boolean,
) {
  const window = rectangle(edge, along, inset, 17, 8);
  if (!fits(window, building)) return;
  const curtained = random.frac() < 0.65;
  const closed = random.frac() < 0.17;
  // The shadow recess, pale jamb and inset glass remain legible at game zoom.
  g.fillStyle(0x6a6458);
  rect(g, edge, along + 0.5, inset - 0.6, 20, 10);
  g.fillStyle(0xded4b9);
  rect(g, edge, along, inset, 18, 9);
  g.fillStyle(closed ? 0x8d9584 : 0x3e5859);
  rect(g, edge, along, inset, 15, 6);
  if (curtained) {
    const cloth = random.pick(CLOTH);
    g.fillStyle(cloth, 0.92);
    rect(g, edge, along - 5.3, inset, closed ? 7 : 3.6, 6);
    rect(g, edge, along + 5.3, inset, closed ? 7 : 3.6, 6);
  }
  g.lineStyle(0.8, 0xc5ccb9, 0.85);
  line(g, edge, along, inset - 3, along, inset + 3);
  g.lineStyle(1, 0xe7d9ba, 0.9);
  line(g, edge, along - 9, inset + 4.2, along + 9);
  if (balcony) {
    g.fillStyle(0x776f61);
    rect(g, edge, along, inset - 5.7, 25, 3);
    g.lineStyle(1.3, 0x3c4d47);
    line(g, edge, along - 12, inset - 7, along + 12);
    for (let d = -10; d <= 10; d += 5)
      line(g, edge, along + d, inset - 7, along + d, inset - 3.8);
    g.lineStyle(0.8, 0xc7c3aa, 0.8);
    line(g, edge, along - 12, inset - 7.6, along + 12);
    if (random.frac() < 0.25) {
      g.fillStyle(0x94644f);
      rect(g, edge, along + 8, inset - 4.3, 4, 3);
      g.fillStyle(0x597454);
      rect(g, edge, along + 8, inset - 2.7, 6, 3);
      g.fillStyle(0x83a072);
      rect(g, edge, along + 6.5, inset - 1.8, 2, 2);
    }
    if (random.frac() < 0.2) {
      // A few small garments hang within balconies, never across a street.
      g.lineStyle(0.6, 0x68675b);
      line(g, edge, along - 10, inset - 3, along + 10);
      for (let garment = 0; garment < 3; garment++) {
        g.fillStyle(random.pick(CLOTH));
        rect(g, edge, along - 6 + garment * 6, inset - 3.6, 4, random.between(3, 5));
      }
    }
  }
  if (!closed) {
    const p = point(edge, along, inset);
    windows.push({ ...p, width: 13, height: 5, angle: Math.atan2(edge.uy, edge.ux), phase: random.frac() });
  }
}

function drawStairBay(g: Graphics, building: MapFootprint, edge: Edge, along: number, depth: number) {
  if (!fits(rectangle(edge, along, depth / 2, 24, depth - 4), building)) return;
  g.fillStyle(0x766d5f);
  rect(g, edge, along, depth / 2, 25, depth - 3);
  g.fillStyle(0x55594d);
  rect(g, edge, along, depth / 2, 18, depth - 6);
  for (let inset = 7; inset < depth - 4; inset += 3.7) {
    g.fillStyle(0xb8b09b);
    rect(g, edge, along, inset, 15, 1.5);
    g.fillStyle(0x6a6f60);
    rect(g, edge, along, inset - 1, 15, 0.8);
  }
  g.lineStyle(1.2, 0xd9d0b8);
  line(g, edge, along - 8, 7, along - 8, depth - 5);
  line(g, edge, along + 8, 7, along + 8, depth - 5);
  // Original steel gate and front threshold, drawn inside the source footprint.
  g.fillStyle(0x34483f);
  rect(g, edge, along, 4.5, 18, 6);
  g.lineStyle(0.8, 0xa0a695);
  for (let d = -7; d <= 7; d += 3) line(g, edge, along + d, 2, along + d, 7);
  g.fillStyle(0xcac0a3);
  rect(g, edge, along, 1.4, 23, 1.7);
}

function drawFacade(
  g: Graphics, building: MapFootprint, edge: Edge, index: number,
  random: Phaser.Math.RandomDataGenerator, windows: WindowGlow[], flats: boolean,
) {
  if (edge.length < 29 || (edge.ny >= -0.12 && edge.nx >= -0.12)) return;
  const residential = /apartments|residential/.test(building.kind);
  const depth = flats ? 43 : residential ? 16 : 15;
  const plaster = flats ? PLASTER[index % PLASTER.length] : 0xb9b49d;
  g.fillStyle(shade(plaster, edge.nx < -0.12 ? 0.88 : 1));
  polygon(g, [edge.a, edge.b, point(edge, edge.length, depth), point(edge, 0, depth)]);
  // Three floor bands give the flats a readable elevation without moving their
  // roof beyond the mapped parcel. School and single-storey roofs stay low.
  for (const inset of flats ? [14, 26, 39] : [13]) {
    g.lineStyle(flats ? 1.2 : 1, 0x9c917c, 0.65);
    line(g, edge, 0, inset, edge.length);
    g.lineStyle(0.8, 0xe6d9bb, 0.75);
    line(g, edge, 0, inset + 1, edge.length);
  }
  g.fillStyle(0x696a5a, 0.65);
  rect(g, edge, edge.length / 2, 1.8, edge.length, 3.6);
  // Plaster repairs and restrained weathering differ between buildings.
  for (let repair = 0; repair < Math.min(12, Math.floor(edge.length / 40)); repair++) {
    const along = random.realInRange(8, edge.length - 8), inset = random.realInRange(3, depth - 4);
    g.fillStyle(random.pick([0xddd0b4, 0xa69c85, 0xc3b398]), 0.4);
    rect(g, edge, along, inset, random.between(4, 11), random.between(2, 5));
  }
  const baySpacing = flats ? 39 : 44;
  const bayCount = Math.min(40, Math.floor((edge.length - 14) / baySpacing));
  const spacing = edge.length / Math.max(1, bayCount + 1);
  const stairBay = flats && edge.length > 130 ? Math.floor(bayCount / 2) : -1;
  for (let bay = 0; bay < bayCount; bay++) {
    const along = spacing * (bay + 1);
    if (bay === stairBay) {
      drawStairBay(g, building, edge, along, depth);
      continue;
    }
    const rows = flats ? [8.5, 20.5, 32.5] : [7.5];
    for (const [storey, inset] of rows.entries())
      drawWindow(g, building, edge, along, inset, random, windows, flats && storey > 0 && bay % 2 === 0);
    if (flats && bay % 4 === 1) {
      g.lineStyle(1.2, 0x746f5d, 0.75);
      line(g, edge, along + 15, 3, along + 15, depth - 3);
      g.lineStyle(0.8, 0xc0b79d, 0.8);
      line(g, edge, along + 16, 3, along + 16, depth - 3);
    }
  }
  g.lineStyle(2.8, 0x5d6659, 0.8);
  line(g, edge, 0, depth, edge.length);
  g.lineStyle(1.1, 0xddd0b1, 0.95);
  line(g, edge, 0, depth + 1.3, edge.length);
}

function drawRoof(
  g: Graphics, building: MapFootprint, longest: Edge,
  random: Phaser.Math.RandomDataGenerator, commercial: boolean, school: boolean,
) {
  const c = centre(building), bounds = building.bounds;
  const frame: Edge = { ...longest, a: c, nx: -longest.uy, ny: longest.ux };
  const radius = Math.hypot(bounds.w, bounds.h) / 2;
  // Roof seams are constructed in the building's direction then clipped by
  // the exact source geometry, not scanned across the full suburb.
  const seamSpacing = commercial || school ? 31 : 12;
  const seamCount = Math.min(90, Math.ceil(radius * 2 / seamSpacing));
  for (let seam = 0; seam < seamCount; seam++) {
    const along = -radius + seam * seamSpacing;
    g.lineStyle(0.8, 0x5e6b5d, 0.2);
    line(g, frame, along, -radius, along, radius);
    g.lineStyle(0.7, 0xd4ccb2, 0.4);
    line(g, frame, along + 1.7, -radius, along + 1.7, radius);
  }
  // Flat roofs show repaired sheets and grime rather than a repeated clean grid.
  const speckles = Math.min(120, Math.max(14, Math.round(bounds.w * bounds.h / 6000)));
  for (let i = 0; i < speckles; i++) {
    const x = random.realInRange(bounds.x, bounds.x + bounds.w);
    const y = random.realInRange(bounds.y, bounds.y + bounds.h);
    if (!contains({ x, y }, building)) continue;
    const local = { ...frame, a: { x, y } };
    g.fillStyle(random.pick([0x717c69, 0xd1c9ad, 0x8b8874]), random.realInRange(0.12, 0.3));
    rect(g, local, 0, 0, random.between(4, 14), random.between(2, 6));
  }
  if (commercial || school) {
    // Roof fixtures have a fixed cap even on a giant irregular mall footprint.
    const fixtureCount = Math.min(75, Math.max(1, Math.round(bounds.w * bounds.h / 16000)));
    for (let fixture = 0; fixture < fixtureCount; fixture++) {
      const local = { ...frame, a: {
        x: random.realInRange(bounds.x + 15, bounds.x + bounds.w - 15),
        y: random.realInRange(bounds.y + 15, bounds.y + bounds.h - 15),
      } };
      const skylight = fixture % 3 !== 0;
      const width = skylight ? 30 : 16, height = skylight ? 21 : 15;
      if (!fits(rectangle(local, 0, 0, width + 6, height + 6), building)) continue;
      g.fillStyle(0x586759, 0.35);
      rect(g, local, 3, -2, width + 5, height + 3);
      g.fillStyle(skylight ? 0x626f68 : 0xc2bca5);
      rect(g, local, 0, 0, width + 3, height + 3);
      g.fillStyle(skylight ? 0x8ea6a0 : 0x9ca38e);
      rect(g, local, 0, 0, width, height);
      g.lineStyle(1, skylight ? 0xc4d0bb : 0x626c5d, 0.8);
      for (let split = -width / 2 + 5; split < width / 2; split += skylight ? 10 : 3)
        line(g, local, split, -height / 2, split, height / 2);
      g.fillStyle(0xd6d4b8, 0.6);
      rect(g, local, 0, height / 2 - 1.5, width, 2);
    }
  } else if (contains(c, building)) {
    const local = { ...frame, a: c };
    if (fits(rectangle(local, 0, 0, 17, 13), building)) {
      g.fillStyle(0x63735e, 0.4);
      rect(g, local, 2, -2, 17, 13);
      g.fillStyle(0xc4bda4);
      rect(g, local, 0, 0, 14, 10);
      g.fillStyle(0x8e9882);
      rect(g, local, 0, 1, 11, 7);
      g.lineStyle(1, 0x5d6e5d);
      line(g, local, 15, -3, 15, -17);
      line(g, local, 10, -13, 20, -13);
    }
  }
}

function bakeDetails(scene: Phaser.Scene, details: Graphics, building: MapFootprint, index: number) {
  const bounds = building.bounds;
  const left = Math.floor(bounds.x), top = Math.floor(bounds.y);
  const right = Math.ceil(bounds.x + bounds.w), bottom = Math.ceil(bounds.y + bounds.h);
  const textures: string[] = [];
  const outlines = [ring(building.points), ...(building.holes ?? []).map(ring)];
  // Local bounded tiles are culled like other sprites. Neither the full suburb
  // nor a giant source bounding box becomes a single Canvas allocation.
  for (let y = top; y < bottom; y += 768) {
    for (let x = left; x < right; x += 768) {
      const width = Math.min(768, right - x), height = Math.min(768, bottom - y);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) continue;
      context.beginPath();
      for (const points of outlines) {
        if (!points.length) continue;
        context.moveTo(points[0].x - x, points[0].y - y);
        for (const p of points.slice(1)) context.lineTo(p.x - x, p.y - y);
        context.closePath();
      }
      // Even-odd clipping retains courtyards regardless of source ring winding.
      context.clip("evenodd");
      const tile = scene.make.graphics({}, false).translateCanvas(-x, -y);
      tile.commandBuffer.push(...details.commandBuffer);
      tile.generateTexture(canvas, width, height);
      tile.destroy();
      const key = `${scene.sys.settings.key}-building-${building.id}-${index}-${x}-${y}`;
      if (scene.textures.exists(key)) scene.textures.remove(key);
      scene.textures.addCanvas(key, canvas);
      scene.add.image(x, y, key).setOrigin(0).setDepth(0.2);
      textures.push(key);
    }
  }
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    for (const key of textures) if (scene.textures.exists(key)) scene.textures.remove(key);
  });
}

/** Original architectural scenery inside the unchanged mapped footprint. */
export function drawMappedBuilding(
  scene: Phaser.Scene, ground: Graphics, building: MapFootprint, index: number,
): WindowGlow[] {
  const outline = ring(building.points);
  if (outline.length < 3) return [];
  const flats = /apartments/.test(building.kind) || /court|hof/i.test(building.name ?? "");
  const commercial = /retail|shop|commercial|mall/.test(building.kind);
  const school = /school/.test(building.kind);
  const random = new Phaser.Math.RandomDataGenerator([`hanover-architecture-${building.id}`]);
  const windows: WindowGlow[] = [];
  // Three inexpensive translucent silhouettes soften the contact shadow.
  // These are scenery shadows, never new collision shapes or surveyed objects.
  for (const [x, y, alpha] of [[11, 15, 0.045], [7, 10, 0.065], [3, 5, 0.12]]) {
    ground.fillStyle(0x354038, alpha);
    fillFootprint(ground, building, x, y);
  }
  ground.fillStyle(buildingColor(building, index));
  fillFootprint(ground, building);
  const allEdges = [...edges(outline), ...(building.holes ?? []).flatMap((hole) => edges(hole, true))];
  const longest = [...allEdges].sort((a, b) => b.length - a.length)[0];
  if (!longest || !longest.length) return windows;
  const details = scene.make.graphics({}, false);
  drawRoof(details, building, longest, random, commercial, school);
  for (const edge of allEdges) {
    drawFacade(details, building, edge, index, random, windows, flats);
    details.lineStyle(1.4, 0xeee0be, 0.65);
    const a = point(edge, 0, 1), b = point(edge, edge.length, 1);
    details.lineBetween(a.x, a.y, b.x, b.y);
  }
  details.lineStyle(1.8, 0x656e5d, 0.85);
  for (const points of [outline, ...(building.holes ?? []).map(ring)]) polygon(details, points, true);
  bakeDetails(scene, details, building, index);
  details.destroy();
  return windows;
}
