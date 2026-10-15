import { expect, test, type Page, type Route } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { MAP } from "./helpers";

const executablePath = process.env.CHROMIUM_PATH ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
test.use({ launchOptions: { executablePath,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
} });
test.setTimeout(240_000);

type Point = { x: number; y: number };
type Polygon = { points: Point[]; holes?: Point[][] };
type Place = { id: string; sourceId: number; osmType: string; name: string; kind: string;
  point: Point; inPreview: boolean; buildingId?: number };
type DeliveryState = { phase: string; money: number; rep: number; reward: number;
  carryingStock: boolean; vendorMemory: string | null; persistent: boolean; saveWarning: string | null };
type BrainRequest = { npcId: string; trigger: string; currentGoal: string };
const ppm = MAP.projection.pixelsPerMetre;
const saveKey = "hanover-park-3d-v1";
const saved2d = JSON.stringify({ version: 1, mapId: MAP.id, mission: "complete", money: 725, marker: "Keep my 2D game" });
const businesses = MAP.pois.filter((poi: any) => ["supermarket", "pharmacy", "fuel", "fast_food"].includes(poi.kind));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) / ppm;
const screenshotDirectory = resolve("..", "previews", "hanoverpark-shops-delivery");
mkdirSync(screenshotDirectory, { recursive: true });

function inside(point: Point, ring: Point[]) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > point.y) !== (b.y > point.y) &&
      point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}

function edgeDistance(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y, square = dx * dx + dy * dy;
  const t = square ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / square)) : 0;
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}

function clear(point: Point, polygons: Polygon[], radius = 0.4 * ppm) {
  return polygons.every((polygon) =>
    !(inside(point, polygon.points) && !(polygon.holes ?? []).some((hole) => inside(point, hole))) &&
    [polygon.points, ...(polygon.holes ?? [])].every((ring) => ring.every((a, i) =>
      edgeDistance(point, a, ring[(i + 1) % ring.length]) > radius)));
}

function clearLine(a: Point, b: Point, polygons: Polygon[], radius = 0.4 * ppm) {
  const steps = Math.max(1, Math.ceil(distance(a, b) * 8));
  return Array.from({ length: steps + 1 }, (_, i) => ({
    x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps,
  })).every((point) => clear(point, polygons, radius));
}

async function mockLocalBrains(page: Page) {
  await page.route("**/api/npc-brain", async (route) => {
    const body = route.request().postDataJSON() as BrainRequest;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      source: "local", goal: body.currentGoal, say: "I am busy with my plans, my bru.", memory: "", reason: "not_configured",
    }) });
  });
}

async function ready(page: Page, url = "/3d.html") {
  await page.goto(url);
  await expect(page.locator("#preview-start-button")).toBeEnabled({ timeout: 45_000 });
  if (!url.includes("5174")) {
    await expect.poll(() => page.evaluate(() => Boolean((window as any).__preview?.delivery))).toBe(true);
  }
}

async function start(page: Page) {
  await page.locator("#preview-start-button").click();
  await expect(page.locator("html")).toHaveAttribute("data-preview-state", "playing");
  await expect(page.locator("#preview-canvas")).toBeFocused();
}

async function frames(page: Page, count = 3) {
  const first = await page.evaluate(() => (window as any).__preview.scene.getFrameId());
  await expect.poll(() => page.evaluate(() => (window as any).__preview.scene.getFrameId()), {
    timeout: 20_000,
  }).toBeGreaterThanOrEqual(first + count);
}

async function state(page: Page): Promise<DeliveryState> {
  return page.evaluate(() => (window as any).__preview.delivery.state);
}

async function solids(page: Page, vehicles = false): Promise<Polygon[]> {
  return page.evaluate(async (vehicles) => {
    const p = (window as any).__preview, map = await import("/src/preview3d/map.ts");
    return [...map.BUILDINGS.map((building: any) => ({ points: building.points, holes: building.holes })),
      ...map.FIELDS.map((field: any) => ({ points: field.points, holes: field.holes })),
      ...p.properties.solidFootprints,
      ...(vehicles ? [...p.traffic.solids, p.car.solid] : [])];
  }, vehicles);
}

async function position(page: Page, point: Point) {
  await page.evaluate((point) => {
    const p = (window as any).__preview;
    Object.assign(p.player.position, point);
    p.camera.alpha = -Math.PI / 2;
    p.camera.inertialAlphaOffset = 0;
  }, point);
}

async function talkVendor(page: Page) {
  const geometry = await solids(page, true);
  const people = await page.evaluate(() => (window as any).__preview.npcs.actors.map((actor: any) => ({
    id: actor.id, name: actor.name, position: { ...actor.position },
  }))) as { id: string; name: string; position: Point }[];
  const vendor = people.find((person) => person.id === "vendor_nazeem")!;
  expect(vendor).toBeTruthy();
  const approach = [1, 1.5, 2].flatMap((metres) => Array.from({ length: 24 }, (_, i) => ({
    x: vendor.position.x + Math.cos(i * Math.PI / 12) * metres * ppm,
    y: vendor.position.y + Math.sin(i * Math.PI / 12) * metres * ppm,
  }))).find((point) => clear(point, geometry) && clearLine(point, vendor.position, geometry, 0) &&
    people.every((person) => person.id === vendor.id || distance(point, person.position) > distance(point, vendor.position)));
  expect(approach, "Nazeem has an independently clear, visible conversation approach").toBeTruthy();
  // Only the initial approach is a fixture. The real E action opens dialogue;
  // the game, rather than the test, performs every mission transition.
  await position(page, approach!);
  await expect(page.locator("#preview-interact-prompt")).toContainText(vendor.name);
  await page.locator("#preview-canvas").focus();
  await page.keyboard.press("e");
  await expect(page.locator("#preview-dialogue")).toBeVisible();
  expect(await page.evaluate(() => (window as any).__preview.npcs.activeNPC?.id)).toBe("vendor_nazeem");
}

async function closeTalk(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.locator("#preview-dialogue")).toBeHidden();
  await expect(page.locator("html")).toHaveAttribute("data-preview-state", "playing");
}

async function accept(page: Page) {
  await talkVendor(page);
  await page.locator('[data-dialogue-choice="delivery-accept"]').click();
  await expect(page.locator("#preview-delivery-status")).toHaveAttribute("data-phase", "collect");
  await expect(page.locator("#preview-wallet")).toHaveText("R0");
  if (await page.locator("#preview-dialogue").isVisible()) await closeTalk(page);
}

async function vehicleCollectionGuard(page: Page) {
  const fixture = await page.evaluate(() => {
    const p = (window as any).__preview;
    return { pickup: { ...p.pickup }, position: { ...p.car.position }, heading: p.car.heading,
      dimensions: p.car.actor.dimensions, people: p.npcs.actors.map((actor: any) => ({ ...actor.position })) };
  }) as { pickup: Point; position: Point; heading: number; dimensions: { width: number; length: number }; people: Point[] };
  const geometry = await solids(page, true);
  const local = (point: Point, heading: number, right: number, ahead: number) => ({
    x: point.x + (Math.cos(heading) * right + Math.sin(heading) * ahead) * ppm,
    y: point.y + (Math.sin(heading) * right - Math.cos(heading) * ahead) * ppm,
  });
  const candidates = [0, 0.9, 1.8, 2.8].flatMap((offset) => Array.from({ length: offset ? 8 : 1 }, (_, j) => ({
    x: fixture.pickup.x + Math.cos(j * Math.PI / 4) * offset * ppm,
    y: fixture.pickup.y + Math.sin(j * Math.PI / 4) * offset * ppm,
  }))).flatMap((point) => Array.from({ length: 16 }, (_, i) => {
    const heading = i * Math.PI / 8;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([right, ahead]) =>
      local(point, heading, right * fixture.dimensions.width / 2, ahead * fixture.dimensions.length / 2));
    const door = [-1, 1].map((side) => local(point, heading, side * (fixture.dimensions.width / 2 + 0.6), 0.2))
      .find((point) => distance(point, fixture.pickup) > 3.6 && clear(point, geometry) &&
        fixture.people.every((person) => distance(point, person) > 1));
    const bodyClear = corners.every((a, j) => clearLine(a, corners[(j + 1) % corners.length], geometry, 0.08 * ppm)) &&
      geometry.every((shape) => shape.points.every((point) => !inside(point, corners)));
    return { point, heading, door, bodyClear };
  }));
  const candidate = candidates.find((candidate) => candidate.bodyClear && candidate.door);
  expect(candidate, "A fully clear parked car fits within the collection radius for the on-foot guard").toBeTruthy();
  // Relocate only the parked fixture, with the full body and door independently
  // checked. Real E actions enter and exit; the test never sets occupied state.
  await page.evaluate(({ candidate }) => {
    const p = (window as any).__preview;
    Object.assign(p.car.position, candidate.point);
    p.car.heading = candidate.heading;
    p.car.actor.sync(p.car.position, p.car.heading, p.car.metresTravelled);
    Object.assign(p.player.position, candidate.door);
  }, { candidate: candidate! });
  await frames(page);
  await expect(page.locator("#preview-interact-prompt")).toContainText(/Drive hatchback/i);
  await page.locator("#preview-canvas").focus();
  await page.keyboard.press("e");
  await expect.poll(() => page.evaluate(() => (window as any).__preview.car.occupied)).toBe(true);
  expect(distance(await page.evaluate(() => ({ ...(window as any).__preview.player.position })), fixture.pickup)).toBeLessThan(3.5);
  expect((await state(page)).phase).toBe("collect");
  await expect(page.locator("#preview-interact-prompt")).toContainText(/Exit hatchback/i);
  await page.keyboard.press("e");
  await expect.poll(() => page.evaluate(() => (window as any).__preview.car.occupied)).toBe(false);
  expect((await state(page)).phase).toBe("collect");
  await page.evaluate((fixture) => {
    const p = (window as any).__preview;
    Object.assign(p.car.position, fixture.position); p.car.heading = fixture.heading;
    p.car.actor.sync(p.car.position, p.car.heading, p.car.metresTravelled);
  }, fixture);
  await frames(page);
}

async function collect(page: Page, walkApproach = false) {
  const pickup = await page.evaluate(() => ({ ...(window as any).__preview.pickup })) as Point;
  const geometry = await solids(page, true);
  expect(clear(pickup, geometry), "The collection marker is outside all walls, fields, houses and vehicles").toBe(true);
  if (walkApproach) {
    const directions = [
      { x: 1, y: 0, key: "a" }, { x: -1, y: 0, key: "d" },
      { x: 0, y: 1, key: "w" }, { x: 0, y: -1, key: "s" },
    ];
    const candidate = directions.map((direction) => ({ direction, point: {
      x: pickup.x + direction.x * 5.2 * ppm, y: pickup.y + direction.y * 5.2 * ppm,
    } })).find(({ point }) => clearLine(point, pickup, geometry));
    expect(candidate, "A genuine 5.2 metre pedestrian approach reaches the Shoprite marker").toBeTruthy();
    await position(page, candidate!.point);
    await frames(page);
    const before = await page.evaluate(() => ({ ...(window as any).__preview.player.position })) as Point;
    expect(distance(before, pickup)).toBeGreaterThan(5);
    await page.keyboard.press("e");
    expect((await state(page)).phase).toBe("collect");
    await page.evaluate(() => {
      const p = (window as any).__preview;
      p.deliveryApproachFrames = [];
      p.deliveryApproachObserver = p.scene.onAfterRenderObservable.add(() => {
        p.deliveryApproachFrames.push({ point: { ...p.player.position },
          vehicles: [...p.traffic.solids, p.car.solid] });
      });
    });
    try {
      await page.keyboard.down(candidate!.direction.key);
      await expect.poll(() => page.evaluate(({ pickup, ppm }) => {
        const point = (window as any).__preview.player.position;
        return Math.hypot(point.x - pickup.x, point.y - pickup.y) / ppm;
      }, { pickup, ppm }), { timeout: 30_000, intervals: [100, 200, 300] }).toBeLessThan(2.8);
    } finally {
      await page.keyboard.up(candidate!.direction.key);
    }
    const sample = await page.evaluate(() => {
      const p = (window as any).__preview;
      p.scene.onAfterRenderObservable.remove(p.deliveryApproachObserver);
      const sample = p.deliveryApproachFrames;
      delete p.deliveryApproachFrames; delete p.deliveryApproachObserver;
      return sample;
    }) as { point: Point; vehicles: Polygon[] }[];
    expect(sample.length).toBeGreaterThan(5);
    const staticGeometry = await solids(page);
    for (const frame of sample) expect(clear(frame.point, [...staticGeometry, ...frame.vehicles]), "Every real walking frame clears collision geometry").toBe(true);
    const after = await page.evaluate(() => ({ ...(window as any).__preview.player.position })) as Point;
    expect(distance(before, after)).toBeGreaterThan(2.2);
    for (const lighting of ["day", "night"] as const) {
      await page.locator(`[data-lighting="${lighting}"]`).click();
      await frames(page);
      await page.screenshot({ path: resolve(screenshotDirectory, `shoprite-${lighting}.png`) });
    }
    await page.locator('[data-lighting="sunset"]').click();
  } else {
    await position(page, pickup);
  }
  await expect(page.locator("#preview-interact-prompt")).toContainText(/collect|stock/i);
  await page.locator("#preview-canvas").focus();
  await page.keyboard.press("e");
  await expect(page.locator("#preview-delivery-status")).toHaveAttribute("data-phase", "return");
  await expect(page.locator("#preview-dialogue")).toBeHidden();
  await expect(page.locator("#preview-wallet")).toHaveText("R0");
  expect((await state(page)).carryingStock).toBe(true);
}

async function complete(page: Page) {
  await talkVendor(page);
  await page.locator('[data-dialogue-choice="delivery-complete"]').click();
  await expect(page.locator("#preview-delivery-status")).toHaveAttribute("data-phase", "complete");
  await expect(page.locator("#preview-wallet")).toHaveText("R150");
  await expect(page.locator("#preview-vendor-reputation")).toHaveText("1");
}

async function frozenSnapshot(page: Page) {
  return page.evaluate(() => {
    const p = (window as any).__preview;
    return { player: { ...p.player.position }, car: { position: { ...p.car.position }, speed: p.car.speed, heading: p.car.heading },
      traffic: p.traffic.vehicles.map((car: any) => ({ position: { ...car.position }, speed: car.speed, heading: car.heading })),
      people: p.npcs.actors.map((actor: any) => ({ id: actor.id, position: { ...actor.position } })),
      brains: p.npcs.brainStates, delivery: p.delivery.state };
  });
}

async function frozen(page: Page) {
  const before = await frozenSnapshot(page);
  await page.evaluate(() => {
    const p = (window as any).__preview;
    p.deliveryFrozenSample = { elapsed: 0 };
    p.deliveryFrozenObserver = p.scene.onAfterRenderObservable.add(() => {
      p.deliveryFrozenSample.elapsed += Math.min(0.1, Math.max(0, p.engine.getDeltaTime() / 1000));
    });
  });
  await page.keyboard.down("w");
  try {
    await expect.poll(() => page.evaluate(() => (window as any).__preview.deliveryFrozenSample.elapsed), {
      timeout: 30_000,
    }).toBeGreaterThanOrEqual(0.7);
  } finally {
    await page.keyboard.up("w");
    await page.evaluate(() => {
      const p = (window as any).__preview;
      p.scene.onAfterRenderObservable.remove(p.deliveryFrozenObserver);
      delete p.deliveryFrozenSample; delete p.deliveryFrozenObserver;
    });
  }
  expect(await frozenSnapshot(page)).toEqual(before);
}

test("production area map names all eight real stores, preserves crop boundaries and supports keyboard navigation", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((save) => localStorage.setItem("hanover-park-v1", save), saved2d);
  await mockLocalBrains(page);
  await ready(page, "http://127.0.0.1:5174/3d.html");
  expect(await page.evaluate(() => typeof (window as any).__preview)).toBe("undefined");
  await start(page);
  await page.keyboard.press("m");
  const dialog = page.locator("#preview-area-map-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("role", "dialog");
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(page.locator("html")).toHaveAttribute("data-preview-state", "map");
  await expect(page.locator("#preview-map-button")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#preview-map-close")).toBeFocused();
  const list = page.locator("#preview-map-places li");
  await expect(list).toHaveCount(8);
  expect(await list.locator("h3").allTextContents()).toEqual(businesses.map((poi: any) => poi.name));
  await expect(page.locator('#preview-map-places li[data-inside-preview="true"]')).toHaveCount(6);
  await expect(page.locator('#preview-map-places li[data-inside-preview="false"]')).toHaveCount(2);
  for (const poi of businesses) {
    const item = page.locator(`#preview-map-places li[data-place-id="osm-${poi.osmType}-${poi.id}"]`);
    await expect(item.locator("h3")).toHaveText(poi.name);
    const outside = ["Jumbo Wholesale", "Engen Hanover Park Service Station"].includes(poi.name);
    await expect(item).toHaveAttribute("data-inside-preview", String(!outside));
    await expect(item.locator(".preview-map-place-area")).toContainText(outside ? "Outside current 3D area" : "In current 3D area");
  }
  await expect(page.locator("#preview-area-map")).toHaveAccessibleName(/Hanover Park.*numbered places/i);
  // Read the actual production canvas, rather than trusting only its place
  // list. Two isolated source POIs establish the drawing's north-up scale;
  // every other marker must preserve its independently mapped coordinate.
  const markers = await page.locator("#preview-area-map").evaluate((node) => {
    const canvas = node as HTMLCanvasElement, width = canvas.width, height = canvas.height;
    const pixels = canvas.getContext("2d")!.getImageData(0, 0, width, height).data;
    const visited = new Uint8Array(width * height), components: { x: number; y: number; area: number }[] = [];
    const teal = (index: number) => pixels[index * 4] === 142 && pixels[index * 4 + 1] === 214 && pixels[index * 4 + 2] === 206;
    for (let start = 0; start < visited.length; start++) {
      if (visited[start] || !teal(start)) continue;
      const pending = [start]; visited[start] = 1;
      let area = 0, minX = width, maxX = 0, minY = height, maxY = 0;
      while (pending.length) {
        const index = pending.pop()!, x = index % width, y = Math.floor(index / width);
        area++; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        for (const next of [x ? index - 1 : -1, x + 1 < width ? index + 1 : -1, index - width, index + width]) {
          if (next < 0 || next >= visited.length || visited[next] || !teal(next)) continue;
          visited[next] = 1; pending.push(next);
        }
      }
      if (area > 35) components.push({ x: (minX + maxX) / 2, y: (minY + maxY) / 2, area });
    }
    return components;
  });
  expect(markers).toHaveLength(8);
  const engen = businesses.find((poi: any) => poi.name === "Engen Hanover Park Service Station");
  const jumbo = businesses.find((poi: any) => poi.name === "Jumbo Wholesale");
  const north = [...markers].sort((a, b) => a.y - b.y)[0], east = [...markers].sort((a, b) => b.x - a.x)[0];
  const scale = (east.x - north.x) / (jumbo.x - engen.x);
  expect(scale).toBeGreaterThan(0);
  expect(Math.abs(east.y - north.y - (jumbo.y - engen.y) * scale)).toBeLessThan(2);
  for (const poi of businesses) {
    const expected = { x: north.x + (poi.x - engen.x) * scale, y: north.y + (poi.y - engen.y) * scale };
    expect(Math.min(...markers.map((marker) => Math.hypot(marker.x - expected.x, marker.y - expected.y))), poi.name).toBeLessThan(4);
  }
  await expect(dialog.locator('a[href="https://www.openstreetmap.org/copyright"]')).toBeVisible();
  await page.screenshot({ path: resolve(screenshotDirectory, "production-area-map.png") });
  await page.keyboard.press("Tab");
  await expect(page.locator(".preview-map-place-section")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.locator('a[href="https://www.openstreetmap.org/copyright"]')).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("#preview-map-close")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.locator('a[href="https://www.openstreetmap.org/copyright"]')).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.locator("#preview-canvas")).toBeFocused();
  await expect(page.locator("html")).toHaveAttribute("data-preview-state", "playing");
  await page.locator("#preview-map-button").click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("m");
  await expect(dialog).toBeHidden();
  await expect(page.locator("#preview-canvas")).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem("hanover-park-v1"))).toBe(saved2d);
  expect(await page.evaluate((key) => localStorage.getItem(key), saveKey)).toBeNull();
  expect(errors).toEqual([]);
});

test("mapped store identities stay at source coordinates and the real delivery pays only after collection and return", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((save) => localStorage.setItem("hanover-park-v1", save), saved2d);
  await mockLocalBrains(page);
  await ready(page);
  const places = await page.evaluate(() => (window as any).__preview.places) as Place[];
  expect(places).toHaveLength(8);
  for (const poi of businesses) {
    const place = places.find((item) => item.id === `osm-${poi.osmType}-${poi.id}`)!;
    expect(place).toMatchObject({ sourceId: poi.id, osmType: poi.osmType, name: poi.name, kind: poi.kind,
      point: { x: poi.x, y: poi.y } });
    if (place.buildingId !== undefined) {
      const building = MAP.buildings.find((item: any) => item.id === place.buildingId);
      expect(building).toBeTruthy();
      expect(poi.osmType === "way" && poi.id === building.id ||
        inside(place.point, building.points) && !(building.holes ?? []).some((hole: Point[]) => inside(place.point, hole))).toBe(true);
    }
  }
  expect(places.filter((place) => place.inPreview)).toHaveLength(6);
  await start(page);
  const pickup = await page.evaluate(() => ({ ...(window as any).__preview.pickup })) as Point;
  expect(clear(pickup, await solids(page, true))).toBe(true);
  await position(page, pickup);
  await frames(page);
  await page.keyboard.press("e");
  expect((await state(page)).phase).toBe("available");
  await expect(page.locator("#preview-dialogue")).toBeHidden();
  expect((await state(page)).money).toBe(0);
  await accept(page);
  await talkVendor(page);
  await expect(page.locator('[data-dialogue-choice="delivery-complete"]')).toHaveCount(0);
  if (await page.locator('[data-dialogue-choice="delivery-info"]').count()) {
    await page.locator('[data-dialogue-choice="delivery-info"]').click();
    expect((await state(page)).phase).toBe("collect");
  }
  await closeTalk(page);
  await vehicleCollectionGuard(page);
  await collect(page, true);
  await page.keyboard.press("e");
  expect((await state(page)).phase).toBe("return");
  expect((await state(page)).money).toBe(0);
  await complete(page);
  const completed = await state(page);
  await page.screenshot({ path: resolve(screenshotDirectory, "delivery-complete.png") });
  expect(completed).toMatchObject({ phase: "complete", reward: 150, money: 150, rep: 1, carryingStock: false, persistent: true, saveWarning: null });
  expect(completed.vendorMemory).toMatch(/stock.*back safely/i);
  await expect(page.locator('[data-dialogue-choice="delivery-accept"], [data-dialogue-choice="delivery-complete"]')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("hanover-park-v1"))).toBe(saved2d);
  expect(errors).toEqual([]);
});

test("collection, carried stock, the single reward and Nazeem's favour survive real reloads", async ({ page }) => {
  await page.addInitScript((save) => localStorage.setItem("hanover-park-v1", save), saved2d);
  await mockLocalBrains(page);
  await ready(page); await start(page); await accept(page);
  const collectSave = await page.evaluate((key) => localStorage.getItem(key), saveKey);
  expect(JSON.parse(collectSave!)).toMatchObject({ version: 1, mapId: MAP.id, phase: "collect", money: 0, rep: 0, vendorMemory: null });
  await page.reload();
  await expect(page.locator("#preview-start-button")).toBeEnabled({ timeout: 45_000 });
  await start(page);
  expect((await state(page)).phase).toBe("collect");
  await expect(page.locator("#preview-wallet")).toHaveText("R0");
  await collect(page);
  await page.reload();
  await expect(page.locator("#preview-start-button")).toBeEnabled({ timeout: 45_000 });
  await start(page);
  expect(await state(page)).toMatchObject({ phase: "return", carryingStock: true, money: 0, rep: 0 });
  await complete(page);
  const completeSave = await page.evaluate((key) => localStorage.getItem(key), saveKey);
  const memory = (await state(page)).vendorMemory;
  expect(memory).toBeTruthy();
  await page.reload();
  await expect(page.locator("#preview-start-button")).toBeEnabled({ timeout: 45_000 });
  await start(page);
  expect(await state(page)).toMatchObject({ phase: "complete", money: 150, rep: 1, carryingStock: false, vendorMemory: memory });
  await expect(page.locator("#preview-wallet")).toHaveText("R150");
  await expect(page.locator("#preview-vendor-reputation")).toHaveText("1");
  const context = await page.evaluate(() => (window as any).__preview.npcs.getBrainContext("vendor_nazeem"));
  expect(context.memory).toContain(memory);
  await talkVendor(page);
  await expect(page.locator('[data-dialogue-choice="delivery-accept"], [data-dialogue-choice="delivery-complete"]')).toHaveCount(0);
  await expect(page.locator("#preview-dialogue")).toContainText(/stock|delivery|help/i);
  await page.locator("#preview-chat-input").fill("Do you remember the stock delivery?");
  await page.locator("#preview-chat-send").click();
  await expect(page.locator("#preview-chat-reply")).toHaveAttribute("data-reply-source", "local");
  await expect(page.locator("#preview-chat-reply")).toContainText(memory!);
  await closeTalk(page);
  expect((await state(page)).money).toBe(150);
  expect(await page.evaluate((key) => localStorage.getItem(key), saveKey)).toBe(completeSave);
  expect(await page.evaluate(() => localStorage.getItem("hanover-park-v1"))).toBe(saved2d);
});

test("unreadable saves and denied writes keep the job playable while map, pause and blur freeze the simulation", async ({ page }) => {
  await page.addInitScript(({ key, save }) => {
    localStorage.setItem("hanover-park-v1", save);
    localStorage.setItem(key, '{"version":1,"phase":"invented","money":999999}');
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException("Storage unavailable", "QuotaExceededError");
      return original.call(this, name, value);
    };
  }, { key: saveKey, save: saved2d });
  let held: Route | undefined;
  let chatSeen = false;
  await page.route("**/api/npc-brain", async (route) => {
    const body = route.request().postDataJSON() as BrainRequest;
    if (body.trigger === "chat") { held = route; chatSeen = true; return; }
    // Mock a healthy provider for ambient plans so a local fallback cooldown
    // cannot prevent the separate, deliberately delayed chat request.
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      source: "llm", goal: body.currentGoal, say: "I have plans today.", memory: "",
    }) });
  });
  await ready(page); await start(page);
  await expect(page.locator("#preview-save-problem")).toBeVisible();
  await expect(page.locator("#preview-save-problem")).toContainText(/started fresh/i);
  expect(await state(page)).toMatchObject({ phase: "available", money: 0, rep: 0 });
  await accept(page);
  await expect(page.locator("#preview-save-problem")).toContainText(/cannot be saved.*Keep this tab open/i);
  expect((await state(page)).persistent).toBe(false);
  await page.keyboard.press("m");
  await expect(page.locator("#preview-area-map-dialog")).toBeVisible();
  await frozen(page);
  await page.keyboard.press("Escape");
  await expect(page.locator("#preview-area-map-dialog")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.locator("html")).toHaveAttribute("data-preview-state", "paused");
  await frozen(page);
  await page.locator("#preview-resume-button").click();
  await expect(page.locator("html")).toHaveAttribute("data-preview-state", "playing");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.locator("html")).toHaveAttribute("data-preview-state", "paused");
  await frozen(page);
  await page.locator("#preview-resume-button").click();
  await talkVendor(page);
  await page.locator("#preview-chat-input").fill("Can you remember this delivery?");
  await page.locator("#preview-chat-send").click();
  await expect.poll(() => chatSeen).toBe(true);
  await page.locator("#preview-dialogue-close").focus();
  await page.keyboard.press("m");
  await expect(page.locator("#preview-area-map-dialog")).toBeVisible();
  const before = await frozenSnapshot(page);
  const body = held!.request().postDataJSON() as BrainRequest;
  await held!.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    source: "llm", goal: body.currentGoal, say: "This late reply must stay closed.", memory: "Late abandoned delivery chat.",
  }) }).catch(() => undefined); // The browser may already have aborted the request.
  await frames(page, 4);
  expect(await frozenSnapshot(page)).toEqual(before);
  const context = await page.evaluate(() => (window as any).__preview.npcs.getBrainContext("vendor_nazeem"));
  expect(context.memory).not.toContain("Late abandoned delivery chat.");
  await expect(page.locator("#preview-dialogue")).toBeHidden();
  await page.keyboard.press("Escape");
  await collect(page);
  await complete(page);
  expect(await state(page)).toMatchObject({ phase: "complete", money: 150, rep: 1, persistent: false });
  await expect(page.locator("#preview-save-problem")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("hanover-park-v1"))).toBe(saved2d);
});
