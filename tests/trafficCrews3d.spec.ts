import { expect, test, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { MAP } from "./helpers";

const executablePath = process.env.CHROMIUM_PATH ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
test.use({ launchOptions: {
  executablePath,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
} });
test.setTimeout(150_000);

type Point = { x: number; y: number };
type Polygon = { points: Point[]; holes?: Point[][] };
type Member = { id: string; name: string; role: string; crewId?: string; position: Point };
type Car = {
  id: string; position: Point; heading: number; speed: number;
  dimensions: { width: number; length: number }; distanceAlongRoute: number;
  route: { id: string; centreline: Point[]; roads: string[]; length: number };
};
type CrewState = {
  affiliation: string | null; phase: string; text: string; remaining?: number; chasingIds: string[];
};
type Snapshot = { player: Point; members: Member[]; cars: Car[]; solids: Polygon[]; crew: CrewState };
type Sample = { elapsed: number; snapshots: Snapshot[] };
const ppm = MAP.projection.pixelsPerMetre;

function inRing(point: Point, ring: Point[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > point.y) !== (b.y > point.y) &&
      point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function project(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
  const t = length ? Math.max(0, Math.min(1,
    ((point.x - a.x) * dx + (point.y - a.y) * dy) / (length * length))) : 0;
  const x = point.x - a.x - t * dx, y = point.y - a.y - t * dy;
  return { distance: Math.hypot(x, y), t, length, signed: length ? (dx * y - dy * x) / length : 0 };
}

function clear(point: Point, polygons: Polygon[], radius = 3.2) {
  return polygons.every((polygon) => {
    const holes = polygon.holes ?? [];
    if (inRing(point, polygon.points) && !holes.some((hole) => inRing(point, hole))) return false;
    return [polygon.points, ...holes].every((ring) => ring.every((a, i) =>
      project(point, a, ring[(i + 1) % ring.length]).distance > radius));
  });
}

function hasLineOfSight(a: Point, b: Point, polygons: Polygon[]) {
  const count = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2);
  return Array.from({ length: count + 1 }, (_, i) => ({
    x: a.x + (b.x - a.x) * i / count, y: a.y + (b.y - a.y) * i / count,
  })).every((point) => clear(point, polygons, 0));
}

function crossesBoundary(ring: Point[], polygon: Polygon) {
  const turn = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return ring.some((a, i) => {
    const b = ring[(i + 1) % ring.length];
    return [polygon.points, ...(polygon.holes ?? [])].some((other) => other.some((c, j) => {
      const d = other[(j + 1) % other.length];
      return turn(a, b, c) * turn(a, b, d) < 0 && turn(c, d, a) * turn(c, d, b) < 0;
    }));
  });
}

async function ready(page: Page) {
  await page.goto("/3d.html");
  await expect(page.locator("#preview-start-button")).toBeEnabled({ timeout: 45_000 });
  await expect.poll(() => page.evaluate(() => Boolean((window as any).__preview?.traffic))).toBe(true);
}

async function start(page: Page) {
  await page.locator("#preview-start-button").click();
  await expect(page.locator("html")).toHaveAttribute("data-preview-state", "playing");
}

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const preview = (window as any).__preview;
    return {
      player: { ...preview.player.position },
      members: preview.npcs.actors.map((npc: any) => ({
        id: npc.id, name: npc.name, role: npc.role, crewId: npc.crewId, position: { ...npc.position },
      })),
      cars: preview.traffic.vehicles.map((car: any) => ({
        id: car.id, position: { ...car.position }, heading: car.heading, speed: car.speed,
        dimensions: { ...car.actor.dimensions }, distanceAlongRoute: car.distanceAlongRoute,
        route: { id: car.route.id, centreline: car.route.centreline,
          roads: car.route.roads, length: car.route.length },
      })),
      solids: preview.traffic.solids.map((polygon: any) => ({ points: polygon.points.map((p: Point) => ({ ...p })) })),
      crew: { ...preview.npcs.crewState, chasingIds: [...preview.npcs.crewState.chasingIds] },
    };
  });
}

async function staticSolids(page: Page): Promise<Polygon[]> {
  const properties = await page.evaluate(() => (window as any).__preview.properties.placements.map((property: any) => ({
    footprint: property.footprint, walls: property.walls,
  })));
  return [...MAP.buildings.map((building: any) => ({ points: building.points, holes: building.holes })),
    ...properties.flatMap((property: any) => [
      { points: property.footprint },
      ...property.walls.map(({ a, b, thickness }: { a: Point; b: Point; thickness: number }) => {
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        const nx = -(b.y - a.y) / length * thickness * ppm / 2;
        const ny = (b.x - a.x) / length * thickness * ppm / 2;
        return { points: [{ x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny },
          { x: b.x - nx, y: b.y - ny }, { x: a.x - nx, y: a.y - ny }] };
      }),
    ])];
}

async function frames(page: Page, count = 3) {
  const before = await page.evaluate(() => (window as any).__preview.scene.getFrameId());
  await expect.poll(() => page.evaluate(() => (window as any).__preview.scene.getFrameId()), {
    timeout: 20_000,
  }).toBeGreaterThanOrEqual(before + count);
}

async function beginSample(page: Page) {
  // Observe the real render loop. No injected time, direct controller updates,
  // or synthetic movement is used to advance traffic or pursuit timers.
  await page.evaluate(() => {
    const preview = (window as any).__preview;
    const sample: any = { elapsed: 0, snapshots: [] };
    preview.trafficCrewSample = sample;
    sample.observer = preview.scene.onAfterRenderObservable.add(() => {
      if (document.documentElement.dataset.previewState !== "playing") return;
      sample.elapsed += Math.min(0.1, Math.max(0, preview.engine.getDeltaTime() / 1000));
      sample.snapshots.push({
        player: { ...preview.player.position },
        members: preview.npcs.actors.map((npc: any) => ({
          id: npc.id, name: npc.name, role: npc.role, crewId: npc.crewId, position: { ...npc.position },
        })),
        cars: preview.traffic.vehicles.map((car: any) => ({
          id: car.id, position: { ...car.position }, heading: car.heading, speed: car.speed,
          dimensions: { ...car.actor.dimensions }, distanceAlongRoute: car.distanceAlongRoute,
          route: { id: car.route.id, centreline: car.route.centreline,
            roads: car.route.roads, length: car.route.length },
        })),
        solids: preview.traffic.solids.map((polygon: any) => ({ points: polygon.points.map((p: Point) => ({ ...p })) })),
        crew: { ...preview.npcs.crewState, chasingIds: [...preview.npcs.crewState.chasingIds] },
      });
    });
  });
}

async function endSample(page: Page): Promise<Sample> {
  return page.evaluate(() => {
    const preview = (window as any).__preview, sample = preview.trafficCrewSample;
    preview.scene.onAfterRenderObservable.remove(sample.observer);
    delete preview.trafficCrewSample;
    return { elapsed: sample.elapsed, snapshots: sample.snapshots };
  });
}

async function simulatedSeconds(page: Page, seconds: number) {
  await expect.poll(() => page.evaluate(() => (window as any).__preview.trafficCrewSample.elapsed), {
    timeout: 45_000,
  }).toBeGreaterThanOrEqual(seconds);
}

async function storage(page: Page) {
  return page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)])));
}

async function shirtColour(page: Page): Promise<string> {
  return page.evaluate(() => (window as any).__preview.scene.getMaterialByName("preview-player-shirt").diffuseColor.toHexString());
}

async function place(page: Page, point: Point, alpha = -Math.PI / 2) {
  await page.evaluate(({ point, alpha }) => {
    const preview = (window as any).__preview;
    Object.assign(preview.player.position, point);
    preview.camera.alpha = alpha;
  }, { point, alpha });
}

async function talkTo(page: Page, member: Member, polygons: Polygon[]) {
  const current = await snapshot(page);
  const candidates = [16, 12, 8].flatMap((distance) => Array.from({ length: 16 }, (_, i) => ({
    x: member.position.x + Math.cos(i * Math.PI / 8) * distance,
    y: member.position.y + Math.sin(i * Math.PI / 8) * distance,
  })));
  const point = candidates.find((point) => clear(point, [...polygons, ...current.solids]) &&
    hasLineOfSight(point, member.position, polygons) && current.members.every((other) =>
      other.id === member.id || Math.hypot(point.x - other.position.x, point.y - other.position.y) >
        Math.hypot(point.x - member.position.x, point.y - member.position.y)));
  expect(point, `An independently clear approach to ${member.name}`).toBeTruthy();
  await place(page, point!);
  await expect(page.locator("#preview-interact")).toBeVisible({ timeout: 15_000 });
  await page.locator("#preview-canvas").focus();
  await page.keyboard.press("e");
  await expect(page.locator("#preview-dialogue")).toBeVisible();
  expect(await page.evaluate(() => (window as any).__preview.npcs.activeNPC?.id)).toBe(member.id);
}

test("eight autonomous cars use mapped streets continuously in both left-hand directions and wait before play", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page);
  const beforeStart = await snapshot(page);
  expect(beforeStart.cars).toHaveLength(8);
  await frames(page);
  expect(await snapshot(page)).toEqual(beforeStart);
  const polygons = await staticSolids(page);
  await start(page);
  await beginSample(page);
  await simulatedSeconds(page, 0.9);
  const sample = await endSample(page);
  expect(sample.snapshots.length).toBeGreaterThan(4);
  const initial = sample.snapshots[0], final = sample.snapshots.at(-1)!;
  const roadNames = new Set(initial.cars.flatMap((car) => car.route.roads));
  expect([...roadNames]).toContain("Downberg Road");
  expect(roadNames.size).toBeGreaterThan(1);
  const sourceSegments = MAP.roads.filter((road: any) => roadNames.has(road.name)).flatMap((road: any) =>
    road.points.slice(1).map((b: Point, i: number) => ({ a: road.points[i], b, width: road.width })));
  expect(final.cars.filter((car) => {
    const first = initial.cars.find((item) => item.id === car.id)!;
    return Math.hypot(car.position.x - first.position.x, car.position.y - first.position.y) > 8;
  }).length).toBeGreaterThanOrEqual(6);
  const actualDirections = final.cars.flatMap((car) => {
    const first = initial.cars.find((item) => item.id === car.id)!;
    const dx = car.position.x - first.position.x, dy = car.position.y - first.position.y;
    return Math.hypot(dx, dy) > 8 ? [{ dx, dy }] : [];
  });
  expect(actualDirections.some((a, i) => actualDirections.some((b, j) => i !== j &&
    (a.dx * b.dx + a.dy * b.dy) / Math.hypot(a.dx, a.dy) / Math.hypot(b.dx, b.dy) < -0.8))).toBe(true);
  let straightLaneSamples = 0;
  for (const frame of sample.snapshots) for (let index = 0; index < frame.cars.length; index++) {
    const car = frame.cars[index];
    expect(sourceSegments.some(({ a, b, width }: { a: Point; b: Point; width: number }) =>
      project(car.position, a, b).distance <= width / 2 + 0.5)).toBe(true);
    const footprint = frame.solids[index].points;
    for (const corner of footprint) {
      expect(clear(corner, polygons, 0)).toBe(true);
      expect(sourceSegments.some(({ a, b, width }: { a: Point; b: Point; width: number }) =>
        project(corner, a, b).distance <= width / 2 + 0.5)).toBe(true);
    }
    expect(polygons.some((polygon) => crossesBoundary(footprint, polygon))).toBe(false);
    const edges = car.route.centreline.map((a, i) =>
      project(car.position, a, car.route.centreline[(i + 1) % car.route.centreline.length]));
    const nearest = edges.sort((a, b) => a.distance - b.distance)[0];
    if (nearest.length > 40 && nearest.t > 0.1 && nearest.t < 0.9) {
      // In projected map coordinates y increases southward. The driver's left
      // therefore has a negative signed cross-product against forward travel.
      expect(nearest.signed).toBeLessThan(-ppm * 0.5);
      straightLaneSamples++;
    }
  }
  expect(straightLaneSamples).toBeGreaterThan(8);
  expect(errors).toEqual([]);
});

test("traffic yields to a neighbour and real walking stops at the car instead of crossing its body", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await ready(page); await start(page);
  const polygons = await staticSolids(page);
  const state = await snapshot(page);
  const neighbour = state.members.find((member) => member.role === "neighbour")!;
  const fixture = state.cars.map((car) => {
    const forward = { x: Math.sin(car.heading), y: -Math.cos(car.heading) };
    const front = car.dimensions.length * ppm / 2;
    const blocker = { x: car.position.x + forward.x * (front + 10), y: car.position.y + forward.y * (front + 10) };
    const rear = { x: car.position.x - forward.x * (front + 24), y: car.position.y - forward.y * (front + 24) };
    const lane = car.route.centreline.map((a, i) =>
      project(car.position, a, car.route.centreline[(i + 1) % car.route.centreline.length]))
      .sort((a, b) => a.distance - b.distance)[0];
    return { car, forward, blocker, rear, lane };
  }).find(({ car, blocker, rear, lane }) => lane.t > 0.15 && lane.t < 0.85 &&
    clear(blocker, [...polygons, ...state.solids]) && clear(rear, [...polygons, ...state.solids]) &&
    state.members.every((member) => member.id === neighbour.id || Math.hypot(member.position.x - car.position.x, member.position.y - car.position.y) > 60));
  expect(fixture, "A clear straight road fixture away from other pedestrians").toBeTruthy();
  await page.evaluate(({ id, blocker, rear }) => {
    const preview = (window as any).__preview;
    Object.assign(preview.npcs.actors.find((member: any) => member.id === id).position, blocker);
    Object.assign(preview.player.position, rear);
  }, { id: neighbour.id, blocker: fixture!.blocker, rear: fixture!.rear });
  await expect.poll(async () => (await snapshot(page)).cars.find((car) => car.id === fixture!.car.id)!.speed, {
    timeout: 15_000,
  }).toBe(0);
  const stopped = (await snapshot(page)).cars.find((car) => car.id === fixture!.car.id)!;
  const forward = { x: Math.sin(stopped.heading), y: -Math.cos(stopped.heading) };
  const rearDistance = stopped.dimensions.length * ppm / 2 + 22;
  const approach = { x: stopped.position.x - forward.x * rearDistance, y: stopped.position.y - forward.y * rearDistance };
  await place(page, approach, Math.atan2(forward.y, -forward.x));
  await frames(page, 1);
  await page.locator("#preview-canvas").focus();
  await beginSample(page);
  await page.keyboard.down("w");
  let sample!: Sample;
  try { await simulatedSeconds(page, 1.2); }
  finally { await page.keyboard.up("w"); sample = await endSample(page); }
  const final = sample.snapshots.at(-1)!;
  const halted = final.cars.find((car) => car.id === stopped.id)!;
  expect(halted.position).toEqual(stopped.position);
  const progress = (final.player.x - approach.x) * forward.x + (final.player.y - approach.y) * forward.y;
  expect(progress).toBeGreaterThan(4);
  const along = (final.player.x - halted.position.x) * forward.x + (final.player.y - halted.position.y) * forward.y;
  expect(along).toBeLessThanOrEqual(-halted.dimensions.length * ppm / 2 - 3.1);
  for (const frame of sample.snapshots) {
    expect(clear(frame.player, frame.solids, 3.1)).toBe(true);
    const member = frame.members.find((item) => item.id === neighbour.id)!;
    expect(clear(member.position, frame.solids, 3.1)).toBe(true);
  }
  await page.evaluate(({ id, original, player }) => {
    const preview = (window as any).__preview;
    Object.assign(preview.npcs.actors.find((member: any) => member.id === id).position, original);
    Object.assign(preview.player.position, player);
  }, { id: neighbour.id, original: neighbour.position, player: state.player });
  await expect.poll(async () => {
    const position = (await snapshot(page)).cars.find((car) => car.id === stopped.id)!.position;
    return Math.hypot(position.x - stopped.position.x, position.y - stopped.position.y);
  }, { timeout: 15_000 }).toBeGreaterThan(8);
  expect(errors).toEqual([]);
});

test("fictional crews require joining, warn before real pursuit, freeze safely and catch without changing progress", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const save = JSON.stringify({ sentinel: "original-progress", money: 271, health: 86, mission: "complete" });
  await page.addInitScript((save) => localStorage.setItem("hanover-park-v1", save), save);
  await ready(page); await start(page);
  const saved = await storage(page), polygons = await staticSolids(page);
  const original = await snapshot(page);
  expect(await shirtColour(page)).toBe("#DDA93C");
  const crew = original.members.filter((member) => member.role === "crew");
  expect(crew).toHaveLength(6);
  expect(new Set(crew.map((member) => member.crewId)).size).toBe(2);
  const contact = crew[0], rival = crew.find((member) => member.crewId !== contact.crewId)!;
  await talkTo(page, rival, polygons);
  await page.keyboard.press("Escape");
  await frames(page);
  expect((await snapshot(page)).crew.phase).toBe("neutral");
  expect((await snapshot(page)).crew.affiliation).toBeNull();
  await talkTo(page, contact, polygons);
  await page.locator('[data-dialogue-choice="join_crew"]').click();
  expect((await snapshot(page)).crew.affiliation).toBe(contact.crewId);
  await expect.poll(() => shirtColour(page)).toBe(contact.crewId === "downberg_side" ? "#B67C4B" : "#4B8C89");
  await expect(page.locator("#preview-crew-status")).toHaveAttribute("data-affiliation", contact.crewId!);
  await page.keyboard.press("Escape");
  await talkTo(page, rival, polygons);
  const warning = await snapshot(page);
  expect(warning.crew.phase).toBe("warning");
  expect(warning.crew.remaining).toBeGreaterThan(3);
  await expect(page.locator("#preview-crew-status")).toHaveAttribute("data-phase", "warning");
  await frames(page);
  expect(await snapshot(page)).toEqual(warning);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.locator("html")).toHaveAttribute("data-preview-state", "paused");
  const paused = await snapshot(page);
  await frames(page);
  expect(await snapshot(page)).toEqual(paused);
  await page.locator("#preview-resume-button").click();
  await page.keyboard.down("w");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.locator("html")).toHaveAttribute("data-preview-state", "paused");
  const blurred = await snapshot(page);
  await frames(page);
  expect(await snapshot(page)).toEqual(blurred);
  const rivals = blurred.members.filter((member) => member.crewId === rival.crewId);
  const rivalCentre = rivals.find((member) => member.id === rival.id)!.position;
  const pursuitPoint = [6, 8, 10].flatMap((metres) => Array.from({ length: 32 }, (_, i) => ({
    x: rivalCentre.x + Math.cos(i * Math.PI / 16) * metres * ppm,
    y: rivalCentre.y + Math.sin(i * Math.PI / 16) * metres * ppm,
  }))).find((point) => clear(point, [...polygons, ...blurred.solids]) &&
    rivals.every((member) => Math.hypot(point.x - member.position.x, point.y - member.position.y) > 5 * ppm) &&
    rivals.some((member) => hasLineOfSight(point, member.position, polygons)));
  expect(pursuitPoint, "A clear pursuit fixture outside the immediate catch radius").toBeTruthy();
  // Position only establishes the fixture while paused; the warning expiry,
  // pursuit path and catch all advance through subsequent real render frames.
  await place(page, pursuitPoint!);
  await page.locator("#preview-resume-button").click();
  await page.keyboard.up("w");
  const stationary = (await snapshot(page)).player;
  await beginSample(page);
  let pursuit!: Sample;
  try {
    await expect.poll(async () => (await snapshot(page)).crew.phase, {
      timeout: 45_000, intervals: [100, 200, 300],
    }).toBe("caught");
  } finally { pursuit = await endSample(page); }
  expect((await snapshot(page)).player).toEqual(stationary);
  const chasing = pursuit.snapshots.filter((frame) => frame.crew.phase === "pursuit");
  expect(chasing.length).toBeGreaterThan(0);
  expect(chasing[0].crew.chasingIds.length).toBeGreaterThan(0);
  const moved = chasing[0].crew.chasingIds.some((id) => {
    const initial = warning.members.find((member) => member.id === id)!;
    const final = pursuit.snapshots.at(-1)!.members.find((member) => member.id === id)!;
    return Math.hypot(final.position.x - initial.position.x, final.position.y - initial.position.y) > 3;
  });
  expect(moved).toBe(true);
  for (const frame of pursuit.snapshots) for (const member of frame.members.filter((member) => member.role === "crew")) {
    expect(clear(member.position, [...polygons, ...frame.solids], 3.1)).toBe(true);
  }
  expect(await storage(page)).toEqual(saved);
  const caught = await snapshot(page);
  expect(caught.crew.remaining).toBeGreaterThan(4);
  await beginSample(page);
  try {
    await expect.poll(async () => (await snapshot(page)).crew.phase, { timeout: 45_000 }).toBe("joined");
    await frames(page);
    expect((await snapshot(page)).crew.phase).toBe("joined");
  } finally { await endSample(page); }
  await talkTo(page, (await snapshot(page)).members.find((member) => member.id === contact.id)!, polygons);
  await page.locator('[data-dialogue-choice="leave_crew"]').click();
  expect((await snapshot(page)).crew.affiliation).toBeNull();
  expect((await snapshot(page)).crew.phase).toBe("neutral");
  await expect.poll(() => shirtColour(page)).toBe("#DDA93C");
  await page.keyboard.press("Escape");
  expect(await storage(page)).toEqual(saved);
  expect(await page.evaluate(() => localStorage.getItem("hanover-park-v1"))).toBe(save);
  expect(errors).toEqual([]);
});
