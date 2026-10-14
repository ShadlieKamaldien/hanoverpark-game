import { test, expect } from "@playwright/test";
import { MAP, state, position, hold, wall } from "./helpers";
test("movement, rotated building collision, NPCs, delivery reward, save, map and pause", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  const initial = await state(page);
  await hold(page, "d");
  expect((await state(page)).x).toBeGreaterThan(initial.x + 20);
  await page.keyboard.down("Shift");
  await hold(page, "s");
  await page.keyboard.up("Shift");
  expect((await state(page)).stamina).toBeLessThan(100);
  const courtyard = MAP.buildings.find((b: any) => b.osmType === "relation" && b.kind === "school")!;
  expect(await page.evaluate((b) => {
    const ring = b.holes![0].slice(0, -1);
    const centre = ring.reduce((p, v) => ({ x: p.x + v.x / ring.length, y: p.y + v.y / ring.length }), { x: 0, y: 0 });
    return (window as any).__game.collision.blocked(centre.x, centre.y, 10);
  }, courtyard)).toBe(false);
  const w = wall();
  await position(page, w.start.x, w.start.y);
  await hold(page, w.key, 1100);
  const after = await state(page);
  const clearance = (after.x - w.mid.x) * w.nx + (after.y - w.mid.y) * w.ny;
  expect(clearance).toBeGreaterThanOrEqual(9.5);
  expect(clearance).toBeLessThan(25);
  await position(page, MAP.locations.fatima.x - 40, MAP.locations.fatima.y);
  await page.keyboard.press("e");
  await expect(
    page.getByRole("heading", { name: "Aunty Fatima" }),
  ).toBeVisible();
  await expect(page.locator(".dialogue p").first()).toContainText(
    "Blinkwater Hof",
  );
  await page.getByRole("button", { name: "ACCEPT DELIVERY" }).click();
  expect((await state(page)).mission).toBe("active");
  await position(page, MAP.locations.target.x, MAP.locations.target.y);
  await page.keyboard.press("e");
  await expect(page.locator("#money")).toHaveText("R150");
  expect((await state(page)).mission).toBe("complete");
  await page.keyboard.press("e");
  expect((await state(page)).money).toBe(150);
  await page.reload();
  await page.getByRole("button", { name: "CONTINUE GAME" }).click();
  await expect(page.locator("#money")).toHaveText("R150");
  expect((await state(page)).mission).toBe("complete");
  await position(page, MAP.locations.gatie.x + 40, MAP.locations.gatie.y);
  await page.keyboard.press("e");
  await expect(
    page.getByRole("heading", { name: "Uncle Gatie" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "SHARP SHARP" }).click();
  await position(page, MAP.locations.jerome.x + 40, MAP.locations.jerome.y);
  await page.keyboard.press("e");
  await expect(page.getByRole("heading", { name: "Jerome" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("m");
  await expect(page.locator(".map-card")).toHaveClass(/expanded/);
  await page.keyboard.press("m");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "On pause." })).toBeVisible();
  const before = await state(page);
  await hold(page, "d");
  expect((await state(page)).x).toBe(before.x);
  await page.getByRole("button", { name: "BACK TO THE STREETS" }).click();
  expect(errors).toEqual([]);
});
test("enter, accelerate, steer, collide, brake and exit on actual streets", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await position(page, MAP.locations.car.x + 55, MAP.locations.car.y);
  await page.keyboard.press("e");
  expect((await state(page)).driving).toBe(true);
  const start = await state(page);
  await hold(page, "w", 800);
  const accelerated = await state(page);
  expect(Math.hypot(accelerated.carX - start.carX, accelerated.carY - start.carY)).toBeGreaterThan(25);
  await page.keyboard.down("w");
  await hold(page, "d", 250);
  await page.keyboard.up("w");
  expect(Math.abs((await state(page)).angle - start.angle)).toBeGreaterThan(0.1);
  await page.keyboard.press("e");
  expect((await state(page)).driving).toBe(true);
  const w = wall();
  await page.evaluate(
    ({ w }) => {
      const g = (window as any).__game;
      g.car.x = w.start.x;
      g.car.y = w.start.y;
      g.car.angle = Math.atan2(-w.nx, w.ny);
      g.car.speed = 0;
    },
    { w },
  );
  await hold(page, "w", 1500);
  const hit = await state(page),
    clearance = (hit.carX - w.mid.x) * w.nx + (hit.carY - w.mid.y) * w.ny;
  expect(clearance).toBeGreaterThanOrEqual(31.5);
  expect(clearance).toBeLessThan(48);
  await page.evaluate(
    ({ car }) => {
      const g = (window as any).__game;
      g.car.x = car.x;
      g.car.y = car.y;
      g.car.angle = car.angle;
      g.car.speed = 100;
    },
    { car: MAP.locations.car },
  );
  await hold(page, "s", 420);
  expect(Math.abs((await state(page)).speed)).toBeLessThan(35);
  await page.keyboard.press("e");
  expect((await state(page)).driving).toBe(false);
  await page.reload();
  await page.getByRole("button", { name: "CONTINUE GAME" }).click();
  expect((await state(page)).driving).toBe(false);
});
test("old saves keep earned money and mission completion while positions migrate", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(({ width, height }) =>
    localStorage.setItem(
      "hanover-park-v1",
      JSON.stringify({
        version: 1,
        worldId: "older-larger-map",
        x: width + 300,
        y: height + 300,
        health: 88,
        money: 150,
        mission: "complete",
        carX: width + 100,
        carY: height + 100,
        carAngle: 0,
      }),
    ),
    { width: MAP.width, height: MAP.height },
  );
  await page.reload();
  await page.getByRole("button", { name: "CONTINUE GAME" }).click();
  expect((await state(page)).x).toBe(MAP.locations.spawn.x);
  expect((await state(page)).money).toBe(150);
  expect((await state(page)).mission).toBe("complete");
  await page.setViewportSize({ width: 800, height: 600 });
  await page.addInitScript(() =>
    localStorage.setItem("hanover-park-v1", '{"version":1,"x":"bad"}'),
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "CONTINUE GAME" }),
  ).toBeHidden();
  await page.getByRole("button", { name: "START GAME" }).click();
  await expect(page.locator("#game canvas")).toBeVisible();
});
test("walk the mapped street route from Shoprite to Blinkwater and retain reward after refresh", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await page.keyboard.press("e");
  await page.getByRole("button", { name: "ACCEPT DELIVERY" }).click();
  // Hold real keys, steer through sourced route bends; no teleport or game update injection.
  for (const point of MAP.deliveryPath) {
    const deadline = Date.now() + 20000;
    let held: string[] = [];
    try {
      while (Date.now() < deadline) {
        const p = await state(page),
          dx = point.x - p.x,
          dy = point.y - p.y;
        if (Math.hypot(dx, dy) < 18) break;
        const next: string[] = ["Shift"];
        if (Math.abs(dx) > 10) next.push(dx > 0 ? "d" : "a");
        if (Math.abs(dy) > 10) next.push(dy > 0 ? "s" : "w");
        for (const key of held.filter((k) => !next.includes(k)))
          await page.keyboard.up(key);
        for (const key of next.filter((k) => !held.includes(k)))
          await page.keyboard.down(key);
        held = next;
        await page.waitForTimeout(35);
      }
      const p = await state(page);
      expect(Math.hypot(p.x - point.x, p.y - point.y)).toBeLessThan(28);
    } finally {
      for (const key of held) await page.keyboard.up(key);
    }
  }
  await page.keyboard.press("e");
  await expect(page.locator("#money")).toHaveText("R150");
  await page.reload();
  await page.getByRole("button", { name: "CONTINUE GAME" }).click();
  await expect(page.locator("#money")).toHaveText("R150");
});
