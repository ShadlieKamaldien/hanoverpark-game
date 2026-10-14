import { expect, test, type Page } from "@playwright/test";
import { existsSync, writeFileSync } from "node:fs";
import { MAP, wall } from "./helpers";

const executablePath = process.env.CHROMIUM_PATH ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
test.use({ launchOptions: { executablePath,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
} });
test.setTimeout(120_000);

type Point = { x: number; y: number };
type Polygon = { points: Point[]; holes?: Point[][] };
type Dimensions = { width: number; length: number };
type Pose = { position: Point; heading: number; dimensions: Dimensions };
type Snapshot = {
  car: Pose & { speed: number; steering: number; occupied: boolean; metresTravelled: number; solid: Polygon };
  player: { position: Point; seated: boolean; visible: boolean };
  camera: { alpha: number; target: { x: number; z: number }; root: { x: number; z: number }; forward: { x: number; z: number } };
  traffic: (Pose & { id: string; speed: number; solid: Polygon })[];
  people: { id: string; role: string; position: Point }[];
};
type Sample = { elapsed: number; frames: Snapshot[] };
type World = { solids: Polygon[]; properties: { walls: { a: Point; b: Point; thickness: number }[] }[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number }; trafficStreets: string[] };
const ppm = MAP.projection.pixelsPerMetre;
const separation = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) / ppm;
const heading = (forward: Point) => Math.atan2(forward.x, -forward.y);

function local(pose: Pick<Pose, "position" | "heading">, right: number, ahead: number): Point {
  return { x: pose.position.x + (Math.cos(pose.heading) * right + Math.sin(pose.heading) * ahead) * ppm,
    y: pose.position.y + (Math.sin(pose.heading) * right - Math.cos(pose.heading) * ahead) * ppm };
}

function footprint(pose: Pose, width = pose.dimensions.width, length = pose.dimensions.length): Polygon {
  return { points: [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => local(pose, x * width / 2, y * length / 2)) };
}

function inside(point: Point, ring: Point[]) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > point.y) !== (b.y > point.y) &&
      point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}

function inSolid(point: Point, polygon: Polygon) {
  return inside(point, polygon.points) && !(polygon.holes ?? []).some((hole) => inside(point, hole));
}

function pointDistance(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y, square = dx * dx + dy * dy;
  const t = square ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / square)) : 0;
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}

function edges(ring: Point[]): [Point, Point][] {
  return ring.map((a, i) => [a, ring[(i + 1) % ring.length]]);
}

function intersects(a: Point, b: Point, c: Point, d: Point) {
  if (Math.max(a.x, b.x) < Math.min(c.x, d.x) || Math.max(c.x, d.x) < Math.min(a.x, b.x) ||
    Math.max(a.y, b.y) < Math.min(c.y, d.y) || Math.max(c.y, d.y) < Math.min(a.y, b.y)) return false;
  const turn = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return turn(a, b, c) * turn(a, b, d) <= 0 && turn(c, d, a) * turn(c, d, b) <= 0;
}

function overlaps(a: Polygon, b: Polygon) {
  return a.points.some((point) => inSolid(point, b)) || b.points.some((point) => inSolid(point, a)) ||
    [a.points, ...(a.holes ?? [])].some((ringA) => [b.points, ...(b.holes ?? [])].some((ringB) =>
      edges(ringA).some(([p, q]) => edges(ringB).some(([r, s]) => intersects(p, q, r, s)))));
}

function clear(point: Point, polygons: Polygon[], radius = 0.4 * ppm) {
  return polygons.every((polygon) => !inSolid(point, polygon) &&
    [polygon.points, ...(polygon.holes ?? [])].every((ring) =>
      edges(ring).every(([a, b]) => pointDistance(point, a, b) > radius)));
}

async function ready(page: Page) {
  await page.goto("/3d.html");
  await expect(page.locator("#preview-start-button")).toBeEnabled({ timeout: 45_000 });
  await expect.poll(() => page.evaluate(() => Boolean((window as any).__preview?.car))).toBe(true);
}

async function start(page: Page) {
  await page.locator("#preview-start-button").click();
  await expect(page.locator("html")).toHaveAttribute("data-preview-state", "playing");
}

async function frames(page: Page, count = 3) {
  const first = await page.evaluate(() => (window as any).__preview.scene.getFrameId());
  await expect.poll(() => page.evaluate(() => (window as any).__preview.scene.getFrameId()), {
    timeout: 20_000,
  }).toBeGreaterThanOrEqual(first + count);
}

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const p = (window as any).__preview;
    const pose = (car: any) => ({ position: { ...car.position }, heading: car.heading, dimensions: { ...car.actor.dimensions } });
    const forward = p.camera.getForwardRay().direction;
    return {
      car: { ...pose(p.car), speed: p.car.speed, steering: p.car.steering, occupied: p.car.occupied,
        metresTravelled: p.car.metresTravelled, solid: p.car.solid },
      player: { position: { ...p.player.position }, seated: p.player.inVehicle, visible: p.player.mesh.isEnabled() },
      camera: { alpha: p.camera.alpha, target: { x: p.camera.target.x, z: p.camera.target.z },
        root: { x: p.car.actor.root.position.x, z: p.car.actor.root.position.z }, forward: { x: forward.x, z: forward.z } },
      traffic: p.traffic.vehicles.map((car: any, index: number) => ({ ...pose(car), id: car.id, speed: car.speed,
        solid: { points: p.traffic.solids[index].points.map((point: Point) => ({ ...point })) } })),
      people: p.npcs.actors.map((person: any) => ({ id: person.id, role: person.role, position: { ...person.position } })),
    };
  });
}

async function world(page: Page): Promise<World> {
  return page.evaluate(async () => {
    const p = (window as any).__preview, map = await import("/src/preview3d/map.ts");
    return { solids: [...map.BUILDINGS.map((building: any) => ({ points: building.points, holes: building.holes })),
      ...map.FIELDS.map((field: any) => ({ points: field.points, holes: field.holes })), ...p.properties.solidFootprints],
      properties: p.properties.placements, bounds: map.PREVIEW.bounds, trafficStreets: p.traffic.stats.streets };
  });
}

function openStreet(state: Snapshot, source: World): Pose {
  const candidates = MAP.roads.filter((road: any) => road.name && road.width >= 10 * ppm &&
    !source.trafficStreets.includes(road.name)).flatMap((road: any) => road.points.slice(1).flatMap((b: Point, index: number) => {
    const a = road.points[index], length = separation(a, b);
    if (length < 55) return [];
    return [0.35, 0.5, 0.65].map((t) => ({ position: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
      heading: heading({ x: b.x - a.x, y: b.y - a.y }), dimensions: state.car.dimensions }));
  }));
  const pose = candidates.find((pose: Pose) => {
    const corridor = footprint(pose, 8, 35);
    return corridor.points.every((point) => point.x > source.bounds.minX + 10 && point.x < source.bounds.maxX - 10 &&
      point.y > source.bounds.minY + 10 && point.y < source.bounds.maxY - 10) &&
      [...source.solids, ...state.traffic.map((car) => car.solid)].every((polygon) => !overlaps(corridor, polygon)) &&
      state.people.every((person) => clear(person.position, [corridor], 3 * ppm));
  });
  expect(pose, "An independently clear mapped street outside the autonomous circuits").toBeTruthy();
  return pose!;
}

async function fixture(page: Page, pose: Pose) {
  // Pose fixtures arrange a scenario once. Driving and collision thereafter
  // use real keyboard events, the actual render loop and its unmodified dt.
  await page.evaluate((pose) => {
    const p = (window as any).__preview;
    Object.assign(p.car.position, pose.position);
    p.car.heading = pose.heading;
    p.car.speed = 0;
    p.car.steering = 0;
    p.car.exitMessage = "";
    p.car.actor.sync(p.car.position, p.car.heading, p.car.metresTravelled, false, 0);
  }, pose);
  await frames(page, 1);
}

async function cameraOcclusion(page: Page) {
  return page.evaluate(() => {
    const p = (window as any).__preview;
    const Ray = p.camera.getForwardRay().constructor;
    const delta = p.camera.target.subtract(p.camera.position), distance = delta.length();
    // Check the actual rendered view, independently of the camera controller:
    // all static building/house details and tree surfaces along the sightline.
    // The car and its seated driver are deliberately outside this predicate.
    const ray = new Ray(p.camera.position.clone(), delta.normalize(), Math.max(0, distance - 0.1));
    const hits = p.scene.multiPickWithRay(ray, (mesh: any) => mesh.isEnabled() && mesh.isVisible &&
      (mesh.name.startsWith("building-") || mesh.name.startsWith("weathered-property-") ||
        mesh.name === "scenery-bark" || mesh.name.startsWith("scenery-leaves-"))) ?? [];
    return { radius: p.camera.radius, hits: hits.filter((hit: any) => hit.hit && hit.distance < ray.length)
      .map((hit: any) => ({ name: hit.pickedMesh.name, distance: hit.distance })) };
  });
}

async function cameraViewDiagnostics(page: Page) {
  return page.evaluate(() => {
    const p = (window as any).__preview;
    return { camera: { alpha: p.camera.alpha, beta: p.camera.beta, radius: p.camera.radius,
      position: p.camera.position.asArray(), target: p.camera.target.asArray() }, car: { position: { ...p.car.position }, heading: p.car.heading },
      picks: [[350, 150], [630, 110], [1000, 400], [740, 455], [900, 450]].map(([x, y]) => {
        const hit = p.scene.pick(x, y, (mesh: any) => mesh.isEnabled() && mesh.isVisible);
        return { x, y, hit: hit?.hit, mesh: hit?.pickedMesh?.name, material: hit?.pickedMesh?.material?.name,
          distance: hit?.distance, point: hit?.pickedPoint?.asArray() };
      }) };
  });
}

async function validateVehicleMeshes(page: Page) {
  const meshes = await page.evaluate(() => {
    const p = (window as any).__preview;
    return [p.car.actor, ...p.traffic.vehicles.map((car: any) => car.actor)].flatMap((actor: any) =>
      actor.root.getChildMeshes().map((mesh: any) => ({ name: mesh.name, vertices: mesh.getTotalVertices(),
        indices: Array.from(mesh.getIndices() ?? []), positions: Array.from(mesh.getVerticesData("position") ?? []),
        normals: Array.from(mesh.getVerticesData("normal") ?? []), colours: Array.from(mesh.getVerticesData("color") ?? []) })));
  });
  expect(meshes.length).toBeGreaterThanOrEqual(9 * 5);
  for (const mesh of meshes) {
    expect(mesh.vertices, `${mesh.name}: nonempty geometry`).toBeGreaterThan(0);
    expect(mesh.positions).toHaveLength(mesh.vertices * 3);
    expect(mesh.normals).toHaveLength(mesh.vertices * 3);
    if (mesh.colours.length) expect(mesh.colours).toHaveLength(mesh.vertices * 4);
    expect([...mesh.positions, ...mesh.normals, ...mesh.colours].every(Number.isFinite), `${mesh.name}: finite vertex attributes`).toBe(true);
    expect(mesh.indices.length % 3, `${mesh.name}: complete triangles`).toBe(0);
    expect(mesh.indices.every((index: number) => Number.isInteger(index) && index >= 0 && index < mesh.vertices),
      `${mesh.name}: triangles reference their own vertices`).toBe(true);
  }
}

async function enterCar(page: Page, source: World) {
  const state = await snapshot(page);
  const door = [1, -1].map((side) => local(state.car, side * (state.car.dimensions.width / 2 + 0.6), 0.2))
    .find((point) => clear(point, [...source.solids, state.car.solid, ...state.traffic.map((car) => car.solid)]) &&
      state.people.every((person) => separation(point, person.position) > 0.85));
  expect(door, "A clear approach to the hatchback door").toBeTruthy();
  await page.evaluate((point) => Object.assign((window as any).__preview.player.position, point), door!);
  await expect(page.locator("#preview-interact-prompt")).toContainText("Drive hatchback");
  await page.locator("#preview-canvas").focus();
  await page.keyboard.press("e");
  await expect(page.locator("#preview-hud")).toHaveAttribute("data-driving", "true");
  await expect(page.locator("#preview-vehicle-status")).toBeVisible();
  await frames(page, 1);
  expect((await snapshot(page)).car.occupied).toBe(true);
}

async function walkToParkedCar(page: Page, source: World) {
  const state = await snapshot(page), polygons = [...source.solids, state.car.solid, ...state.traffic.map((car) => car.solid)];
  const door = [1, -1].map((side) => local(state.car, side * (state.car.dimensions.width / 2 + 0.6), 0.2))
    .find((point) => Array.from({ length: 81 }, (_, i) => ({
      x: state.player.position.x + (point.x - state.player.position.x) * i / 80,
      y: state.player.position.y + (point.y - state.player.position.y) * i / 80,
    })).every((point) => clear(point, polygons)));
  expect(door, "The actual parked car has a clear walking approach from the unchanged spawn").toBeTruthy();
  const forward = { x: door!.x - state.player.position.x, y: door!.y - state.player.position.y };
  await page.evaluate((alpha) => { (window as any).__preview.camera.alpha = alpha; }, Math.atan2(forward.y, -forward.x));
  await page.locator("#preview-canvas").focus();
  await beginSample(page, "KeyW");
  let walking!: Sample;
  try {
    await page.keyboard.down("w");
    await expect.poll(() => page.evaluate(() => {
      const p = (window as any).__preview;
      return p.car.canEnter(p.player.position);
    }), { timeout: 25_000, intervals: [50, 100, 100] }).toBe(true);
  } finally {
    await page.keyboard.up("w");
    walking = await endSample(page);
  }
  expect(separation((await snapshot(page)).player.position, state.player.position)).toBeGreaterThan(4);
  expect(walking.elapsed).toBeGreaterThan(1);
  expect((await snapshot(page)).car.position).toEqual(state.car.position);
  await expect(page.locator("#preview-interact-prompt")).toContainText("Drive hatchback");
  await page.keyboard.press("e");
  await expect(page.locator("#preview-hud")).toHaveAttribute("data-driving", "true");
  await frames(page, 1);
  expect((await snapshot(page)).player.seated).toBe(true);
}

async function beginSample(page: Page, code: string | null = null) {
  await page.evaluate((code) => {
    const p = (window as any).__preview, held = new Set<string>();
    const sample: any = { elapsed: 0, frames: [], held };
    p.drivingSample = sample;
    sample.down = (event: KeyboardEvent) => held.add(event.code);
    sample.up = (event: KeyboardEvent) => held.delete(event.code);
    window.addEventListener("keydown", sample.down);
    window.addEventListener("keyup", sample.up);
    sample.observer = p.scene.onAfterRenderObservable.add(() => {
      if (document.documentElement.dataset.previewState !== "playing" || code && !held.has(code)) return;
      sample.elapsed += Math.min(0.1, Math.max(0, p.engine.getDeltaTime() / 1000));
      const pose = (car: any) => ({ position: { ...car.position }, heading: car.heading, dimensions: { ...car.actor.dimensions } });
      const forward = p.camera.getForwardRay().direction;
      sample.frames.push({ car: { ...pose(p.car), speed: p.car.speed, steering: p.car.steering,
        occupied: p.car.occupied, metresTravelled: p.car.metresTravelled, solid: p.car.solid },
        player: { position: { ...p.player.position }, seated: p.player.inVehicle, visible: p.player.mesh.isEnabled() },
        camera: { alpha: p.camera.alpha, target: { x: p.camera.target.x, z: p.camera.target.z },
          root: { x: p.car.actor.root.position.x, z: p.car.actor.root.position.z }, forward: { x: forward.x, z: forward.z } },
        traffic: p.traffic.vehicles.map((car: any, index: number) => ({ ...pose(car), id: car.id, speed: car.speed,
          solid: { points: p.traffic.solids[index].points.map((point: Point) => ({ ...point })) } })),
        people: p.npcs.actors.map((person: any) => ({ id: person.id, role: person.role, position: { ...person.position } })),
      });
    });
  }, code);
}

async function seconds(page: Page, duration: number) {
  await expect.poll(() => page.evaluate(() => (window as any).__preview.drivingSample.elapsed), {
    timeout: 30_000,
  }).toBeGreaterThanOrEqual(duration);
}

async function endSample(page: Page): Promise<Sample> {
  return page.evaluate(() => {
    const p = (window as any).__preview, sample = p.drivingSample;
    p.scene.onAfterRenderObservable.remove(sample.observer);
    window.removeEventListener("keydown", sample.down);
    window.removeEventListener("keyup", sample.up);
    delete p.drivingSample;
    return { elapsed: sample.elapsed, frames: sample.frames };
  });
}

async function drive(page: Page, keys: string[], duration: number, code: string): Promise<Sample> {
  await beginSample(page, code);
  let sample!: Sample;
  try {
    for (const key of keys) await page.keyboard.down(key);
    await seconds(page, duration);
  } finally {
    for (const key of keys) await page.keyboard.up(key);
    sample = await endSample(page);
  }
  expect(sample.frames.length).toBeGreaterThan(2);
  return sample;
}

function noOverlap(sample: Sample, source: World, pedestrians = false) {
  for (const frame of sample.frames) {
    expect(source.solids.some((polygon) => overlaps(frame.car.solid, polygon)), "The full car stays outside walls and fields").toBe(false);
    expect(frame.traffic.some((car) => overlaps(frame.car.solid, car.solid)), "The full car stays outside live traffic").toBe(false);
    if (pedestrians) for (const person of frame.people) expect(clear(person.position, [frame.car.solid], 0.49 * ppm), person.id).toBe(true);
  }
}

test("a parked hatchback supports keyboard driving, braking, reverse, steering and a following camera without changing saves", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const saved = JSON.stringify({ sentinel: "2D-progress-before-driving", money: 284, health: 83 });
  await page.addInitScript((saved) => localStorage.setItem("hanover-park-v1", saved), saved);
  await ready(page);
  await validateVehicleMeshes(page);
  const parked = (await snapshot(page)).car;
  expect(parked.occupied).toBe(false);
  expect(parked.speed).toBe(0);
  await frames(page);
  expect((await snapshot(page)).car).toEqual(parked);
  await start(page);
  const source = await world(page), road = openStreet(await snapshot(page), source);
  await walkToParkedCar(page, source);
  const borrowed = await drive(page, ["w"], 0.9, "KeyW");
  expect(separation(borrowed.frames.at(-1)!.car.position, parked.position)).toBeGreaterThan(1);
  noOverlap(borrowed, source, true);
  await drive(page, ["Space"], 0.5, "Space");
  await page.locator('[data-lighting="day"]').click();
  await frames(page);
  expect((await cameraOcclusion(page)).hits, "The borrowed car stays visible from the actual driving camera").toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("driveable-hatchback-day.png") });
  const diagnosticsPath = testInfo.outputPath("downberg-camera-picks.json");
  writeFileSync(diagnosticsPath, JSON.stringify(await cameraViewDiagnostics(page), null, 2));
  await testInfo.attach("downberg-camera-picks", { path: diagnosticsPath, contentType: "application/json" });
  await page.setViewportSize({ width: 800, height: 600 });
  await frames(page);
  await expect(page.locator("#preview-vehicle-status")).toBeVisible();
  await expect(page.locator("#preview-interact")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const vehicleBounds = (await page.locator("#preview-vehicle-status").boundingBox())!;
  expect(vehicleBounds.x).toBeGreaterThanOrEqual(0);
  expect(vehicleBounds.y).toBeGreaterThanOrEqual(0);
  expect(vehicleBounds.x + vehicleBounds.width).toBeLessThanOrEqual(800);
  expect(vehicleBounds.y + vehicleBounds.height).toBeLessThanOrEqual(600);
  await page.screenshot({ path: testInfo.outputPath("driveable-hatchback-800x600.png") });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.locator("#preview-canvas").focus();
  await page.keyboard.press("e");
  await expect(page.locator("#preview-hud")).toHaveAttribute("data-driving", "false");
  await fixture(page, road); await enterCar(page, source);
  const entered = await snapshot(page);
  expect(entered.player.seated).toBe(true);
  expect(entered.player.visible).toBe(true);
  expect(entered.player.position).toEqual(entered.car.position);
  await expect(page.locator("#preview-vehicle-gear")).toHaveText("PARK");
  const forward = await drive(page, ["w"], 1.2, "KeyW"), moving = forward.frames.at(-1)!;
  expect(moving.car.speed).toBeGreaterThan(4);
  expect(moving.car.speed).toBeLessThanOrEqual(14);
  expect(separation(moving.car.position, entered.car.position)).toBeGreaterThan(2);
  await expect(page.locator("#preview-vehicle-gear")).toHaveText("FWD");
  expect(Number(await page.locator("#preview-vehicle-speed").innerText())).toBeGreaterThan(10);
  await page.keyboard.press("e");
  expect((await snapshot(page)).car.occupied).toBe(true);
  await expect(page.locator("#preview-vehicle-message")).toContainText(/stop/i);
  const braking = await drive(page, ["Space"], 0.7, "Space");
  expect(braking.frames.at(-1)!.car.speed).toBe(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const reverse = await drive(page, ["ArrowDown"], 0.8, "ArrowDown");
  expect(reverse.frames.at(-1)!.car.speed).toBeLessThan(-1.8);
  expect(reverse.frames.at(-1)!.car.speed).toBeGreaterThanOrEqual(-4);
  await expect(page.locator("#preview-vehicle-gear")).toHaveText("REV");
  await drive(page, ["Space"], 0.5, "Space");
  const beforeTurn = await snapshot(page);
  const steering = await drive(page, ["ArrowUp", "ArrowRight"], 0.9, "ArrowUp");
  const turned = steering.frames.at(-1)!;
  expect(turned.car.steering).toBeGreaterThan(0.2);
  expect(Math.abs(turned.car.heading - beforeTurn.car.heading)).toBeGreaterThan(0.1);
  expect(Math.abs(turned.camera.alpha - beforeTurn.camera.alpha)).toBeGreaterThan(0.05);
  await drive(page, ["Space"], 0.6, "Space");
  await page.locator("#preview-recenter").click();
  await frames(page);
  const clearCamera = await cameraOcclusion(page);
  expect(clearCamera.hits, "The chase camera has an unobstructed line of sight to the car").toEqual([]);
  const followed = await snapshot(page);
  expect(Math.hypot(followed.camera.target.x - followed.camera.root.x, followed.camera.target.z - followed.camera.root.z)).toBeLessThan(0.15);
  const horizontal = Math.hypot(followed.camera.forward.x, followed.camera.forward.z);
  expect((followed.camera.forward.x * Math.sin(followed.car.heading) + followed.camera.forward.z * Math.cos(followed.car.heading)) / horizontal).toBeGreaterThan(0.99);
  await page.locator('[data-view="overview"]').click();
  await expect(page.locator('[data-view="overview"]')).toHaveAttribute("aria-pressed", "true");
  await page.locator('[data-view="street"]').click();
  for (const sample of [forward, braking, reverse, steering]) noOverlap(sample, source, true);
  // The unchanged source flat lies between this independently clear car pose
  // and the requested 12 m camera orbit. This explicitly exercises contraction.
  const facade = wall(), cameraFixture = { position: facade.start,
    heading: heading({ x: facade.nx, y: facade.ny }), dimensions: road.dimensions };
  expect(source.solids.some((polygon) => overlaps(footprint(cameraFixture), polygon))).toBe(false);
  await fixture(page, cameraFixture);
  await page.locator("#preview-recenter").click();
  await frames(page);
  const outsideFlat = await cameraOcclusion(page);
  expect(outsideFlat.hits, "The camera stays outside the real flat behind this clear car pose").toEqual([]);
  expect(outsideFlat.radius).toBeLessThan(12);
  await page.locator("#preview-canvas").focus();
  await page.keyboard.press("e");
  await expect(page.locator("#preview-hud")).toHaveAttribute("data-driving", "false");
  await expect(page.locator("#preview-vehicle-status")).toBeHidden();
  const outside = await snapshot(page);
  expect(outside.player.seated).toBe(false);
  expect(clear(outside.player.position, [...source.solids, outside.car.solid, ...outside.traffic.map((car) => car.solid)])).toBe(true);
  await page.keyboard.press("e");
  await expect(page.locator("#preview-hud")).toHaveAttribute("data-driving", "true");
  expect(await page.evaluate(() => localStorage.getItem("hanover-park-v1"))).toBe(saved);
  expect(errors).toEqual([]);
});

test("pause and window blur freeze a driven car and clear held accelerator, steering and brake keys", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page); await start(page);
  const source = await world(page);
  await fixture(page, openStreet(await snapshot(page), source)); await enterCar(page, source);
  await drive(page, ["w"], 0.8, "KeyW");
  await page.keyboard.down("w");
  await page.keyboard.down("d");
  await page.keyboard.press("Escape");
  await expect(page.locator("html")).toHaveAttribute("data-preview-state", "paused");
  const paused = await snapshot(page);
  await frames(page);
  expect(await snapshot(page)).toEqual(paused);
  await page.locator("#preview-resume-button").click();
  await beginSample(page);
  await seconds(page, 0.45);
  const resumed = await endSample(page);
  expect(resumed.frames.at(-1)!.car.speed).toBeLessThan(paused.car.speed);
  expect(Math.abs(resumed.frames.at(-1)!.car.steering)).toBeLessThan(0.05);
  await page.keyboard.up("w"); await page.keyboard.up("d");
  await beginSample(page, "Space");
  await page.keyboard.down("w"); await page.keyboard.down("Space");
  await seconds(page, 0.6);
  expect((await snapshot(page)).car.speed).toBe(0);
  await endSample(page);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.locator("html")).toHaveAttribute("data-preview-state", "paused");
  const blurred = await snapshot(page);
  await frames(page);
  expect(await snapshot(page)).toEqual(blurred);
  await page.locator("#preview-resume-button").click();
  await page.keyboard.up("Space");
  await frames(page, 5);
  const resting = await snapshot(page);
  expect(resting.car.speed).toBe(0);
  expect(resting.car.position).toEqual(blurred.car.position);
  await page.keyboard.up("w");
  const fresh = await drive(page, ["ArrowUp"], 0.6, "ArrowUp");
  expect(fresh.frames.at(-1)!.car.speed).toBeGreaterThan(2);
  expect(separation(fresh.frames.at(-1)!.car.position, resting.car.position)).toBeGreaterThan(0.5);
  await drive(page, ["Space"], 0.5, "Space");
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(errors).toEqual([]);
});

test("the full car stops at an actual flat facade and a thin property wall without tunnelling", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page); await start(page);
  const source = await world(page), original = await snapshot(page), facade = wall();
  const facing = heading({ x: -facade.nx, y: -facade.ny });
  const pose = { position: facade.start, heading: facing, dimensions: original.car.dimensions };
  expect(source.solids.some((polygon) => overlaps(footprint(pose), polygon))).toBe(false);
  await fixture(page, pose); await enterCar(page, source);
  const contact = await drive(page, ["w"], 2.4, "KeyW");
  const stopped = contact.frames.at(-1)!.car;
  expect(separation(stopped.position, pose.position)).toBeGreaterThan(2);
  expect(stopped.speed).toBe(0);
  const signed = ((stopped.position.x - facade.mid.x) * facade.nx + (stopped.position.y - facade.mid.y) * facade.ny) / ppm;
  expect(signed).toBeGreaterThanOrEqual(stopped.dimensions.length / 2);
  noOverlap(contact, source, true);
  const state = await snapshot(page);
  const wallPose = source.properties.flatMap((property) => property.walls.flatMap(({ a, b, thickness }) => {
    const length = separation(a, b), normal = { x: -(b.y - a.y) / (length * ppm), y: (b.x - a.x) / (length * ppm) };
    if (length < state.car.dimensions.width + 0.8) return [];
    return [1, -1].map((side) => ({ position: { x: (a.x + b.x) / 2 + normal.x * side * 5.5 * ppm,
      y: (a.y + b.y) / 2 + normal.y * side * 5.5 * ppm },
      heading: heading({ x: -normal.x * side, y: -normal.y * side }), dimensions: state.car.dimensions,
      wall: { a, b, thickness }, normal: { x: normal.x * side, y: normal.y * side } }));
  })).find((candidate) => {
    const envelope = footprint(candidate, 4.5, 4.5);
    return [...source.solids, ...state.traffic.map((car) => car.solid)].every((polygon) => !overlaps(envelope, polygon)) &&
      state.people.every((person) => clear(person.position, [envelope], 0.8 * ppm));
  });
  expect(wallPose, "A clear approach perpendicular to a generated thin boundary wall").toBeTruthy();
  await fixture(page, wallPose!);
  const boundary = await drive(page, ["ArrowUp"], 2.2, "ArrowUp");
  const atBoundary = boundary.frames.at(-1)!.car;
  expect(separation(atBoundary.position, wallPose!.position)).toBeGreaterThan(1);
  expect(atBoundary.speed).toBe(0);
  const midpoint = { x: (wallPose!.wall.a.x + wallPose!.wall.b.x) / 2, y: (wallPose!.wall.a.y + wallPose!.wall.b.y) / 2 };
  const clearance = ((atBoundary.position.x - midpoint.x) * wallPose!.normal.x +
    (atBoundary.position.y - midpoint.y) * wallPose!.normal.y) / ppm - atBoundary.dimensions.length / 2;
  expect(clearance).toBeGreaterThanOrEqual(wallPose!.wall.thickness / 2);
  expect(clearance).toBeLessThan(wallPose!.wall.thickness / 2 + 0.3);
  noOverlap(boundary, source, true);
  expect(errors).toEqual([]);
});

test("driving respects pedestrians and stopped traffic, and blocked doors keep the driver inside until a safe exit opens", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page); await start(page);
  const source = await world(page), original = await snapshot(page), road = openStreet(original, source);
  const stationary = original.people.filter((person) => !["pedestrian", "crew"].includes(person.role));
  expect(stationary.length).toBeGreaterThanOrEqual(3);
  await fixture(page, road); await enterCar(page, source);
  const person = local(road, 0, 6);
  await page.evaluate(({ id, point }) => Object.assign((window as any).__preview.npcs.actors.find((npc: any) => npc.id === id).position, point),
    { id: stationary[0].id, point: person });
  const approach = await drive(page, ["w"], 2.2, "KeyW");
  const stopped = approach.frames.at(-1)!.car;
  expect(separation(stopped.position, road.position)).toBeGreaterThan(1.5);
  expect(stopped.speed).toBe(0);
  expect(clear(person, [stopped.solid], 0.49 * ppm)).toBe(true);
  noOverlap(approach, source, true);
  await page.evaluate(({ id, point }) => Object.assign((window as any).__preview.npcs.actors.find((npc: any) => npc.id === id).position, point),
    { id: stationary[0].id, point: stationary[0].position });
  const current = await snapshot(page);
  const waiting = current.traffic.map((car) => {
    const rear = local(car, 0, -(car.dimensions.length / 2 + current.car.dimensions.length / 2 + 6));
    const pose = { position: rear, heading: car.heading, dimensions: current.car.dimensions };
    return { car, pose, blocker: local(car, 0, car.dimensions.length / 2 + 1) };
  }).find(({ car, pose, blocker }) => {
    const corridor = footprint({ ...pose, position: local(pose, 0, 3) }, 4.5, 9);
    return clear(blocker, source.solids) && !overlaps(footprint(pose), car.solid) &&
      source.solids.every((polygon) => !overlaps(corridor, polygon)) &&
      current.traffic.every((other) => other.id === car.id || !overlaps(corridor, other.solid)) &&
      current.people.every((person) => clear(person.position, [corridor], 1.5 * ppm));
  });
  expect(waiting, "A independently clear rear approach to a live road vehicle").toBeTruthy();
  await page.evaluate(({ id, point }) => Object.assign((window as any).__preview.npcs.actors.find((npc: any) => npc.id === id).position, point),
    { id: stationary[0].id, point: waiting!.blocker });
  await fixture(page, waiting!.pose);
  await expect.poll(async () => (await snapshot(page)).traffic.find((car) => car.id === waiting!.car.id)!.speed, {
    timeout: 20_000,
  }).toBe(0);
  // The neighbour holds the leading car at its real current route position.
  const leading = (await snapshot(page)).traffic.find((car) => car.id === waiting!.car.id)!;
  const behind = { position: local(leading, 0, -(leading.dimensions.length / 2 + current.car.dimensions.length / 2 + 6)),
    heading: leading.heading, dimensions: current.car.dimensions };
  await fixture(page, behind);
  const queue = await drive(page, ["w"], 2.5, "KeyW");
  expect(separation(queue.frames.at(-1)!.car.position, behind.position)).toBeGreaterThan(2);
  expect(queue.frames.at(-1)!.car.speed).toBe(0);
  noOverlap(queue, source, true);
  await page.evaluate(({ id, point }) => Object.assign((window as any).__preview.npcs.actors.find((npc: any) => npc.id === id).position, point),
    { id: stationary[0].id, point: stationary[0].position });
  await fixture(page, road);
  const rightBlocker = local(road, road.dimensions.width / 2 + 0.65, 0.2);
  const leftBlocker = local(road, -(road.dimensions.width / 2 + 0.65), 0.2);
  await page.evaluate(({ rightId, leftId, right, left }) => {
    const p = (window as any).__preview;
    Object.assign(p.npcs.actors.find((npc: any) => npc.id === rightId).position, right);
    Object.assign(p.npcs.actors.find((npc: any) => npc.id === leftId).position, left);
  }, { rightId: stationary[1].id, leftId: stationary[2].id, right: rightBlocker, left: leftBlocker });
  await frames(page, 1);
  await page.keyboard.press("e");
  expect((await snapshot(page)).car.occupied).toBe(true);
  await expect(page.locator("#preview-vehicle-message")).toContainText(/both doors.*blocked/i);
  await page.evaluate(({ id, point }) => Object.assign((window as any).__preview.npcs.actors.find((npc: any) => npc.id === id).position, point),
    { id: stationary[2].id, point: stationary[2].position });
  await frames(page, 1);
  await page.keyboard.press("e");
  await expect(page.locator("#preview-hud")).toHaveAttribute("data-driving", "false");
  const safe = await snapshot(page);
  const dx = safe.player.position.x - safe.car.position.x, dy = safe.player.position.y - safe.car.position.y;
  expect(dx * Math.cos(safe.car.heading) + dy * Math.sin(safe.car.heading)).toBeLessThan(0);
  expect(clear(safe.player.position, [...source.solids, safe.car.solid, ...safe.traffic.map((car) => car.solid)])).toBe(true);
  expect(safe.people.every((person) => separation(safe.player.position, person.position) >= 0.85)).toBe(true);
  expect(safe.player.seated).toBe(false);
  expect(errors).toEqual([]);
});
