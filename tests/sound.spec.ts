import { test, expect } from "@playwright/test";
import { MAP } from "./helpers";
test("neighbourhood audio produces a signal, follows location, mutes and persists preferences", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__game.audio.contextState))
    .toBe("running");
  await expect
    .poll(() => page.evaluate(() => (window as any).__game.audio.level()))
    .toBeGreaterThan(0.00001);
  const levels = () =>
    page.evaluate(() => (window as any).__game.audio.zoneLevels);
  const shop = (await levels()).shop;
  expect(shop).toBeGreaterThan(0);
  await page.evaluate((point) => {
    const g = (window as any).__game;
    g.player.x = point.x;
    g.player.y = point.y;
  }, MAP.locations.taxi);
  await expect
    .poll(async () => (await levels()).taxi)
    .toBeGreaterThan(shop * 0.5);
  expect((await levels()).shop).toBeLessThanOrEqual(shop);
  await page.evaluate((point) => {
    const g = (window as any).__game;
    g.player.x = point.x;
    g.player.y = point.y;
    g.streetClock = 13;
  }, MAP.locations.pitch);
  await expect.poll(async () => (await levels()).pitch).toBeGreaterThan(0.5);
  await expect(page.locator("#street-caption")).toContainText(
    "Downberg Sports Field",
  );
  await page.getByRole("button", { name: "Mute neighbourhood sound" }).click();
  await expect(page.locator("#sound-toggle")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect
    .poll(() => page.evaluate(() => (window as any).__game.audio.level()))
    .toBeLessThan(0.000001);
  await page.reload();
  await expect(page.locator("#sound-toggle")).toHaveText("SOUND OFF");
  await page.getByRole("button", { name: "START GAME" }).click();
  await page
    .getByRole("button", { name: "Enable neighbourhood sound" })
    .click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__game.audio.level()))
    .toBeGreaterThan(0.00001);
  const slider = page.getByRole("slider", { name: "Neighbourhood volume" });
  await slider.focus();
  await slider.press("Home");
  expect(await page.evaluate(() => (window as any).__game.audio.volume)).toBe(
    0,
  );
  await slider.press("End");
  expect(await page.evaluate(() => (window as any).__game.audio.volume)).toBe(
    1,
  );
  await page.keyboard.press("Escape");
  await expect
    .poll(() => page.evaluate(() => (window as any).__game.audio.level()))
    .toBeLessThan(0.000001);
  await page.getByRole("button", { name: "BACK TO THE STREETS" }).click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__game.audio.contextState))
    .toBe("running");
  await expect
    .poll(() => page.evaluate(() => (window as any).__game.audio.level()))
    .toBeGreaterThan(0.00001);
  expect(errors).toEqual([]);
});

test("gameplay remains available when the browser has no Web Audio API", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, "AudioContext", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(window, "webkitAudioContext", {
      value: undefined,
      configurable: true,
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await expect(page.locator("#sound-toggle")).toHaveText("SOUND UNAVAILABLE");
  const initial = await page.evaluate(() => (window as any).__game.player.x);
  await page.keyboard.down("d");
  await page.waitForTimeout(400);
  await page.keyboard.up("d");
  expect(
    await page.evaluate(() => (window as any).__game.player.x),
  ).toBeGreaterThan(initial + 20);
  expect(errors).toEqual([]);
});
