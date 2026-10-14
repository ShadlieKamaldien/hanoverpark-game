import { expect, test, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { MAP } from "./helpers";

const executablePath = process.env.CHROMIUM_PATH ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
test.use({ launchOptions: {
  executablePath,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
} });
test.setTimeout(90_000);

type Point = { x: number; y: number };
type Polygon = { points: Point[]; holes?: Point[][] };
type Property = {
  id: string;
  centre: Point;
  heading: number;
  footprint: Point[];
  lot: Point[];
  walls: { a: Point; b: Point; thickness: number }[];
  gate: { centre: Point; width: number; inward: Point };
};
const pixelsPerMetre = MAP.projection.pixelsPerMetre;

function ring(points: Point[]) {
  return points.length > 1 && points[0].x === points[points.length - 1].x &&
    points[0].y === points[points.length - 1].y ? points.slice(0, -1) : points;
}

function edges(points: Point[]): [Point, Point][] {
  const open = ring(points);
  return open.map((point, index) => [point, open[(index + 1) % open.length]]);
}

function inside(point: Point, points: Point[]) {
  let result = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > point.y) !== (b.y > point.y) &&
      point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}

function inSolid(point: Point, polygon: Polygon) {
  return inside(point, polygon.points) && !(polygon.holes ?? []).some((hole) => inside(point, hole));
}

function pointDistance(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const fraction = length ? Math.max(0, Math.min(1,
    ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
  return Math.hypot(point.x - a.x - fraction * dx, point.y - a.y - fraction * dy);
}

function cross(a: Point, b: Point, c: Point) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function intersects(a: Point, b: Point, c: Point, d: Point) {
  if (Math.max(a.x, b.x) < Math.min(c.x, d.x) || Math.max(c.x, d.x) < Math.min(a.x, b.x) ||
    Math.max(a.y, b.y) < Math.min(c.y, d.y) || Math.max(c.y, d.y) < Math.min(a.y, b.y)) return false;
  return cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0;
}

function segmentDistance(a: Point, b: Point, c: Point, d: Point) {
  return intersects(a, b, c, d) ? 0 : Math.min(pointDistance(a, c, d), pointDistance(b, c, d),
    pointDistance(c, a, b), pointDistance(d, a, b));
}

function intersectsSolid(points: Point[], polygon: Polygon) {
  return points.some((point) => inSolid(point, polygon)) ||
    polygon.points.some((point) => inside(point, points)) ||
    edges(points).some(([a, b]) => [polygon.points, ...(polygon.holes ?? [])].some((boundary) =>
      edges(boundary).some(([c, d]) => intersects(a, b, c, d))));
}

function segmentToRing(a: Point, b: Point, points: Point[]) {
  if (inside(a, points) || inside(b, points)) return 0;
  return Math.min(...edges(points).map(([c, d]) => segmentDistance(a, b, c, d)));
}

function clear(point: Point, solids: Polygon[], radius = 3.2) {
  return solids.every((solid) => !inSolid(point, solid) &&
    [solid.points, ...(solid.holes ?? [])].every((boundary) =>
      edges(boundary).every(([a, b]) => pointDistance(point, a, b) > radius)));
}

async function enter(page: Page) {
  await page.goto("/3d.html");
  await expect(page.locator("#preview-start-button")).toBeEnabled({ timeout: 45_000 });
  await page.locator("#preview-start-button").click();
  await expect(page.locator("html")).toHaveAttribute("data-preview-state", "playing");
}

async function frames(page: Page, count = 3) {
  const start = await page.evaluate(() => (window as any).__preview.scene.getFrameId());
  await expect.poll(() => page.evaluate(() => (window as any).__preview.scene.getFrameId()), {
    timeout: 20_000,
  }).toBeGreaterThanOrEqual(start + count);
}

async function data(page: Page): Promise<{
  placements: Property[];
  solids: Polygon[];
  spawn: Point;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  npcs: { position: Point; route: Point[] }[];
}> {
  return page.evaluate(async () => {
    const preview = (window as any).__preview;
    const map = await import("/src/preview3d/map.ts");
    return {
      placements: preview.properties.placements,
      solids: preview.properties.solidFootprints,
      spawn: map.SPAWN,
      bounds: map.PREVIEW.bounds,
      npcs: preview.npcs.actors.map((npc: any) => ({ position: npc.position, route: npc.patrolRoute ?? [] })),
    };
  });
}

async function place(page: Page, point: Point, forward: Point) {
  await page.evaluate(({ point, forward }) => {
    const preview = (window as any).__preview;
    Object.assign(preview.player.position, point);
    preview.camera.alpha = Math.atan2(forward.y, -forward.x);
    preview.camera.beta = 1.2;
    preview.camera.radius = 13;
    preview.camera.inertialAlphaOffset = 0;
    preview.camera.inertialBetaOffset = 0;
    preview.camera.inertialRadiusOffset = 0;
  }, { point, forward });
  await frames(page);
  await page.locator("#preview-canvas").focus();
}

async function walk(page: Page, seconds = 0.7): Promise<Point> {
  // Observe elapsed time supplied by the real loop while holding a real key;
  // changing dt would conceal tunnelling and software GPU timing regressions.
  await page.evaluate(() => {
    const preview = (window as any).__preview;
    const sample = { elapsed: 0, original: preview.player.update };
    preview.propertyMovementSample = sample;
    preview.player.update = function (dt: number, keys: Set<string>, forward: unknown) {
      const result = sample.original.call(this, dt, keys, forward);
      if (keys.has("KeyW")) sample.elapsed += dt;
      return result;
    };
  });
  let point!: Point;
  try {
    await page.keyboard.down("w");
    await expect.poll(() => page.evaluate(() => (window as any).__preview.propertyMovementSample.elapsed), {
      timeout: 20_000,
    }).toBeGreaterThanOrEqual(seconds);
  } finally {
    await page.keyboard.up("w");
    point = await page.evaluate(() => {
      const preview = (window as any).__preview;
      preview.player.update = preview.propertyMovementSample.original;
      delete preview.propertyMovementSample;
      return { ...preview.player.position };
    });
  }
  return point;
}

async function appearance(page: Page, png: Buffer) {
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const colours = new Set<string>(), luminance: number[] = [];
    // This is the house and street below the horizon, excluding the minimap
    // and other overlays. A colourful sky cannot satisfy the rendering check.
    for (let y = Math.floor(canvas.height * 0.5); y < canvas.height * 0.78; y += 8) {
      for (let x = Math.floor(canvas.width * 0.2); x < canvas.width * 0.65; x += 8) {
        const i = (y * canvas.width + x) * 4;
        colours.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
        luminance.push(pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722);
      }
    }
    luminance.sort((a, b) => a - b);
    return { colours: colours.size, bright: luminance[Math.floor(luminance.length * 0.9)] };
  }, png.toString("base64"));
}

test("weathered infill keeps mapped public space open and renders original wall art by day and night", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const saved = JSON.stringify({ sentinel: "original-2D-progress-before-infill", money: 279, health: 84 });
  await page.addInitScript((saved) => localStorage.setItem("hanover-park-v1", saved), saved);
  await enter(page);
  const sourceBefore = await page.evaluate(async () => JSON.stringify((await import("/src/game/world/mapData.ts")).MAP));
  expect(JSON.parse(sourceBefore)).toEqual(MAP);
  const state = await data(page);
  expect(state.placements.length).toBeGreaterThan(2);
  expect(state.solids.length).toBeGreaterThan(state.placements.length);
  for (const property of state.placements) {
    expect(property.id).toBeTruthy();
    expect(property.lot.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y) &&
      point.x >= state.bounds.minX && point.x <= state.bounds.maxX &&
      point.y >= state.bounds.minY && point.y <= state.bounds.maxY), property.id).toBe(true);
    expect(MAP.buildings.some((building: Polygon) => intersectsSolid(property.lot, building)),
      `${property.id}: preserve all mapped buildings and court holes`).toBe(false);
    expect(MAP.fields.some((field: Polygon) => intersectsSolid(property.lot, field)),
      `${property.id}: preserve mapped fields`).toBe(false);
    const blockedRoads = MAP.roads.flatMap((road: { name: string; kind: string; width: number; points: Point[] }) => {
      const distance = Math.min(...road.points.slice(1).map((end, index) =>
        segmentToRing(road.points[index], end, property.lot)));
      return distance < road.width / 2 + 0.4 * pixelsPerMetre - 0.1 ?
        [{ road: road.name ?? road.kind, distance, halfWidth: road.width / 2 }] : [];
    });
    expect(blockedRoads, `${property.id}: preserve every mapped road and path with body clearance`).toEqual([]);
  }
  expect(clear(state.spawn, state.solids, 3.2)).toBe(true);
  for (const npc of state.npcs) {
    expect(clear(npc.position, state.solids)).toBe(true);
    for (let i = 1; i < npc.route.length; i++) {
      expect(state.solids.every((solid) =>
        segmentToRing(npc.route[i - 1], npc.route[i], solid.points) > 3.2),
      "New walls leave the complete real NPC patrol segment clear").toBe(true);
    }
  }
  const art = await page.evaluate(() => {
    const preview = (window as any).__preview;
    const meshes = preview.scene.meshes.filter((mesh: any) => mesh.metadata?.wallArt);
    const texture = preview.scene.textures.find((texture: any) => texture.name === "original-graffiti-atlas");
    const canvas = texture.getContext().canvas;
    const rgba = texture.getContext().getImageData(0, 0, canvas.width, canvas.height).data;
    let transparent = 0, painted = 0;
    const colours = new Set<string>();
    for (let i = 0; i < rgba.length; i += 16) {
      if (!rgba[i + 3]) transparent++;
      else {
        painted++;
        if (colours.size < 500) colours.add(`${rgba[i]},${rgba[i + 1]},${rgba[i + 2]}`);
      }
    }
    return {
      width: canvas.width, height: canvas.height, transparent, painted, colours: colours.size,
      groups: meshes.map((mesh: any) => ({
        vertices: mesh.getTotalVertices(),
        panels: mesh.metadata.wallArt.graffitiPanels,
        original: mesh.metadata.wallArt.original,
        textured: mesh.material?.diffuseTexture === texture,
        property: preview.properties.meshes.includes(mesh),
      })),
    };
  });
  expect(art.width).toBe(1024);
  expect(art.height).toBe(1024);
  expect(art.painted).toBeGreaterThan(1_000);
  expect(art.transparent).toBeGreaterThan(1_000);
  expect(art.colours).toBeGreaterThan(20);
  expect(art.groups.some((group) => group.property && group.panels > 0 && group.vertices > 0)).toBe(true);
  expect(art.groups.some((group) => !group.property && group.panels > 0 && group.vertices > 0)).toBe(true);
  expect(art.groups.every((group) => group.original && group.textured)).toBe(true);

  const property = [...state.placements].sort((a, b) =>
    Math.hypot(a.centre.x - state.spawn.x, a.centre.y - state.spawn.y) -
    Math.hypot(b.centre.x - state.spawn.x, b.centre.y - state.spawn.y))[0];
  const viewing = {
    x: property.gate.centre.x - property.gate.inward.x * 24,
    y: property.gate.centre.y - property.gate.inward.y * 24,
  };
  expect(clear(viewing, [...MAP.buildings, ...state.solids])).toBe(true);
  await place(page, viewing, property.gate.inward);
  const visibleHouse = await page.evaluate((id) => {
    const scene = (window as any).__preview.scene;
    const active = scene.getActiveMeshes();
    return active.data.slice(0, active.length).some((mesh: any) =>
      mesh.metadata?.weatheredProperty === id && mesh.metadata?.part === "shell" &&
      mesh.getTotalVertices() > 0 && mesh.metadata.boardedWindows > 0 && mesh.metadata.damagedRoofEdges > 0);
  }, property.id);
  expect(visibleHouse, "The selected damaged house is actually rendered in the screenshot view").toBe(true);
  const images: Buffer[] = [];
  for (const lighting of ["day", "night"]) {
    await page.locator(`[data-lighting="${lighting}"]`).click();
    await frames(page);
    const image = await page.locator("#preview-canvas").screenshot({
      path: testInfo.outputPath(`weathered-house-${lighting}.png`),
    });
    const visible = await appearance(page, image);
    expect(visible.colours, `${lighting}: actual house and street detail`).toBeGreaterThan(30);
    expect(visible.bright, `${lighting}: property remains readable`).toBeGreaterThan(20);
    images.push(image);
  }
  expect(images[0].equals(images[1])).toBe(false);
  expect(await page.evaluate(async () => JSON.stringify((await import("/src/game/world/mapData.ts")).MAP))).toBe(sourceBefore);
  expect(await page.evaluate(() => localStorage.getItem("hanover-park-v1"))).toBe(saved);
  expect(errors).toEqual([]);
});

test("real walking stops at rotated infill houses and boundary walls while their gate stays walkable", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await enter(page);
  const state = await data(page);
  const solids = [...MAP.buildings, ...state.solids];
  const candidates = state.placements.filter((property) => Math.abs(Math.sin(property.heading)) > 0.1 &&
    Math.abs(Math.cos(property.heading)) > 0.1);
  const approaches = candidates.flatMap((property) => edges(property.footprint).map(([a, b]) => {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    let normal = { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
    if ((property.centre.x - mid.x) * normal.x + (property.centre.y - mid.y) * normal.y > 0) {
      normal = { x: -normal.x, y: -normal.y };
    }
    return { property, mid, normal, start: { x: mid.x + normal.x * 14, y: mid.y + normal.y * 14 } };
  }));
  const house = approaches.find((approach) => clear(approach.start, solids) &&
    Array.from({ length: 8 }, (_, index) => ({
      x: approach.mid.x + approach.normal.x * (4 + index * 1.5),
      y: approach.mid.y + approach.normal.y * (4 + index * 1.5),
    })).every((point) => clear(point, solids)));
  expect(house, "A rotated house has an independently clear external approach").toBeTruthy();
  await place(page, house!.start, { x: -house!.normal.x, y: -house!.normal.y });
  const stoppedAtHouse = await walk(page);
  const houseClearance = (stoppedAtHouse.x - house!.mid.x) * house!.normal.x +
    (stoppedAtHouse.y - house!.mid.y) * house!.normal.y;
  expect(houseClearance).toBeGreaterThanOrEqual(3.15);
  expect(houseClearance).toBeLessThan(6);
  expect(inside(stoppedAtHouse, house!.property.footprint)).toBe(false);

  const boundaryApproaches = state.placements.flatMap((property) => property.walls.map((wall) => {
    const length = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
    const mid = { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 };
    let normal = { x: -(wall.b.y - wall.a.y) / length, y: (wall.b.x - wall.a.x) / length };
    const centre = ring(property.lot).reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
    centre.x /= ring(property.lot).length; centre.y /= ring(property.lot).length;
    if ((centre.x - mid.x) * normal.x + (centre.y - mid.y) * normal.y > 0) {
      normal = { x: -normal.x, y: -normal.y };
    }
    return { property, wall, length, mid, normal, start: { x: mid.x + normal.x * 12, y: mid.y + normal.y * 12 } };
  }));
  const boundary = boundaryApproaches.find((approach) => approach.length > 20 && clear(approach.start, solids));
  expect(boundary, "A real boundary wall has an independently clear external approach").toBeTruthy();
  await place(page, boundary!.start, { x: -boundary!.normal.x, y: -boundary!.normal.y });
  const stoppedAtWall = await walk(page, 0.6);
  const wallClearance = (stoppedAtWall.x - boundary!.mid.x) * boundary!.normal.x +
    (stoppedAtWall.y - boundary!.mid.y) * boundary!.normal.y;
  expect(wallClearance).toBeGreaterThanOrEqual(3.15 + boundary!.wall.thickness * pixelsPerMetre / 2);
  expect(wallClearance).toBeLessThan(7 + boundary!.wall.thickness * pixelsPerMetre / 2);

  const gate = state.placements.find((property) => {
    if (property.gate.width * pixelsPerMetre <= 2 * 3.2) return false;
    return Array.from({ length: 21 }, (_, index) => ({
      x: property.gate.centre.x + property.gate.inward.x * (index - 10),
      y: property.gate.centre.y + property.gate.inward.y * (index - 10),
    })).every((point) => clear(point, solids));
  });
  expect(gate, "At least one gate has a clear approach and walkable opening").toBeTruthy();
  await place(page, {
    x: gate!.gate.centre.x - gate!.gate.inward.x * 9,
    y: gate!.gate.centre.y - gate!.gate.inward.y * 9,
  }, gate!.gate.inward);
  const throughGate = await walk(page, 0.65);
  const insideDistance = (throughGate.x - gate!.gate.centre.x) * gate!.gate.inward.x +
    (throughGate.y - gate!.gate.centre.y) * gate!.gate.inward.y;
  expect(insideDistance).toBeGreaterThan(6);
  expect(clear(throughGate, solids)).toBe(true);
  expect(inside(throughGate, gate!.lot)).toBe(true);
  expect(errors).toEqual([]);
});
