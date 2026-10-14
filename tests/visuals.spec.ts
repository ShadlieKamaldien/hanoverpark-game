import { test, expect, type Page } from "@playwright/test";
import { MAP, hold, position, state } from "./helpers";

async function lighting(page: Page) {
  return page.evaluate(() => {
    const g = (window as any).__game;
    const camera = g.cameras.main;
    const { warm, cool } = g.lighting.overlays;
    const bounds = (overlay: any) => ({
      x:
        camera.x +
        (overlay.x - camera.width * camera.originX) * camera.zoomX +
        camera.width * camera.originX,
      y:
        camera.y +
        (overlay.y - camera.height * camera.originY) * camera.zoomY +
        camera.height * camera.originY,
      width: overlay.width * camera.zoomX,
      height: overlay.height * camera.zoomY,
    });
    const glows = g.children.list.filter(
      (object: any) =>
        object.type === "Image" &&
        object.texture.key.startsWith("hanover-amber-light-"),
    );
    return {
      ...g.lighting.state,
      worldTime: g.worldTime,
      warmAlpha: warm.alpha,
      coolAlpha: cool.alpha,
      warmBounds: bounds(warm),
      coolBounds: bounds(cool),
      viewport: {
        x: camera.x,
        y: camera.y,
        width: camera.width,
        height: camera.height,
      },
      glowingImages: glows.filter((object: any) => object.alpha > 0.05)
        .length,
      glowAlpha: glows.reduce(
        (total: number, object: any) => total + object.alpha,
        0,
      ),
      renderer: g.game.renderer.type,
    };
  });
}

async function setTime(page: Page, minute: number) {
  // Advance the existing simulation clock, allowing the real scene update to
  // apply lighting; do not call the lighting renderer directly.
  await page.evaluate((minute) => {
    (window as any).__game.worldTime =
      ((minute - (16 * 60 + 30) + 1440) % 1440) * 3;
  }, minute);
  await expect
    .poll(async () => Math.floor((await lighting(page)).minuteOfDay))
    .toBe(minute);
  return lighting(page);
}

function expectCoverage(sample: Awaited<ReturnType<typeof lighting>>) {
  for (const overlay of [sample.warmBounds, sample.coolBounds]) {
    expect(overlay.x).toBeCloseTo(sample.viewport.x, 3);
    expect(overlay.y).toBeCloseTo(sample.viewport.y, 3);
    expect(overlay.width).toBeCloseTo(sample.viewport.width, 3);
    expect(overlay.height).toBeCloseTo(sample.viewport.height, 3);
  }
}

test("Canvas sunset, night and dawn lighting stays readable, pauses and resizes with gameplay", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  const initial = await lighting(page);
  // The production game uses Canvas, including its gradients and glow pools.
  expect(initial.renderer).toBe(1);
  expectCoverage(initial);

  await position(page, MAP.locations.target.x, MAP.locations.target.y);
  const dusk = await setTime(page, 18 * 60 + 30);
  expect(dusk.period).toBe("sunset");
  expect(dusk.warmAlpha).toBeGreaterThan(initial.warmAlpha);
  expect(dusk.glowingImages).toBeGreaterThan(0);
  await page.waitForTimeout(650); // Let the follow camera settle on the flats.
  await page.screenshot({ path: testInfo.outputPath("blinkwater-dusk.png") });

  const night = await setTime(page, 21 * 60 + 30);
  expect(night.period).toBe("night");
  expect(night.coolAlpha).toBeGreaterThan(dusk.coolAlpha);
  expect(night.coolAlpha).toBeLessThan(0.5);
  expect(night.warmAlpha).toBeLessThan(dusk.warmAlpha);
  expect(night.glowAlpha).toBeGreaterThan(dusk.glowAlpha);
  expect(night.litWindows).toBeGreaterThan(0);
  expectCoverage(night);
  await page.screenshot({ path: testInfo.outputPath("blinkwater-night.png") });

  const dawn = await setTime(page, 7 * 60);
  expect(dawn.period).toBe("dawn");
  expect(dawn.coolAlpha).toBeLessThan(night.coolAlpha);
  expect(dawn.glowAlpha).toBeLessThan(night.glowAlpha);
  const day = await setTime(page, 10 * 60);
  expect(day.period).toBe("day");
  expect(day.warmAlpha + day.coolAlpha).toBe(0);
  expect(day.glowingImages).toBe(0);
  expect(day.litWindows).toBe(0);

  await setTime(page, 21 * 60 + 30);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "On pause." })).toBeVisible();
  const pausedLighting = await lighting(page);
  const pausedPlayer = await state(page);
  await hold(page, "d", 400);
  const stillPaused = await lighting(page);
  expect(stillPaused.worldTime).toBe(pausedLighting.worldTime);
  expect(stillPaused.minuteOfDay).toBe(pausedLighting.minuteOfDay);
  expect(stillPaused.glowAlpha).toBe(pausedLighting.glowAlpha);
  expect((await state(page)).x).toBe(pausedPlayer.x);

  // Resize during pause, when the scene's usual update path is frozen.
  await page.setViewportSize({ width: 800, height: 600 });
  await expect
    .poll(async () => (await lighting(page)).viewport.width)
    .toBe(800);
  const resized = await lighting(page);
  expectCoverage(resized);
  expect(resized.coolAlpha).toBeGreaterThan(0);
  expect(resized.coolAlpha).toBeLessThan(0.5);
  const canvas = await page.locator("#game canvas").boundingBox();
  const container = await page.locator("#game").boundingBox();
  expect(canvas).not.toBeNull();
  expect(container).not.toBeNull();
  expect(canvas!.width).toBeCloseTo(container!.width, 0);
  expect(canvas!.height).toBeCloseTo(container!.height, 0);

  await position(page, MAP.locations.spawn.x, MAP.locations.spawn.y);
  await page.getByRole("button", { name: "BACK TO THE STREETS" }).click();
  const beforeMove = await state(page);
  await hold(page, "d", 400);
  expect((await state(page)).x).toBeGreaterThan(beforeMove.x + 20);
  expect((await lighting(page)).worldTime).toBeGreaterThan(
    pausedLighting.worldTime,
  );
  expect(errors).toEqual([]);
});
