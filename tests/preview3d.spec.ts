import { chromium, expect, test, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { MAP, hold, wall } from "./helpers";

// SwiftShader is only enabled for the 3D preview tests; the Canvas game keeps
// the same browser configuration and renderer it uses in production.
const executablePath = process.env.CHROMIUM_PATH ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
const webglArgs = ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
test.use({ launchOptions: { executablePath, args: webglArgs } });
test.setTimeout(90_000);

type Point = { x: number; y: number };

async function enter(page: Page, url = "/3d.html") {
  await page.goto(url);
  await expect(page.locator("#preview-start-button")).toBeEnabled({ timeout: 45_000 });
  await page.locator("#preview-start-button").click();
  await expect(page.locator("html")).toHaveAttribute("data-preview-state", "playing");
  await expect(page.locator("#preview-canvas")).toBeFocused();
}

async function actor(page: Page): Promise<Point> {
  return page.evaluate(() => ({ ...(window as any).__preview.player.position }));
}

async function position(page: Page, point: Point) {
  await page.evaluate((point) => {
    const preview = (window as any).__preview;
    Object.assign(preview.player.position, point);
    // Collision uses map coordinates; fix the orbit so test keys have the same
    // north/east interpretation as the independently measured source wall.
    preview.camera.alpha = -Math.PI / 2;
  }, point);
}

function inside(point: Point, polygon: Point[]) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) &&
      point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}

function courtyard() {
  const building = MAP.buildings.find((b: any) => b.id === 15821399);
  const ring: Point[] = building.holes[0];
  const unique = ring.slice(0, -1);
  const centre = {
    x: unique.reduce((s, p) => s + p.x, 0) / unique.length,
    y: unique.reduce((s, p) => s + p.y, 0) / unique.length,
  };
  expect(inside(centre, building.points)).toBe(true);
  expect(inside(centre, ring)).toBe(true);
  return { centre, ring };
}

async function screenshotColours(page: Page, bytes: Buffer) {
  return page.evaluate(async (png) => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const colours = new Set<string>();
    // Inspect the open centre of the scene, avoiding the HUD and map overlay.
    for (let y = Math.floor(canvas.height * 0.25); y < canvas.height * 0.75; y += 8) {
      for (let x = Math.floor(canvas.width * 0.25); x < canvas.width * 0.75; x += 8) {
        const i = (y * canvas.width + x) * 4;
        colours.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
      }
    }
    return colours.size;
  }, bytes.toString("base64"));
}

test("production 3D preview renders WebGL, walks, changes lighting and preserves the 2D save", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const originalSave = JSON.stringify({ sentinel: "existing-2D-progress", money: 247, mission: "complete" });
  await page.addInitScript((save) => localStorage.setItem("hanover-park-v1", save), originalSave);
  await enter(page, "http://127.0.0.1:5174/3d.html");
  expect(await page.evaluate(() => "__preview" in window || "__game" in window)).toBe(false);
  const version = await page.locator("#preview-canvas").evaluate((canvas) => {
    const gl = (canvas as HTMLCanvasElement).getContext("webgl2") ||
      (canvas as HTMLCanvasElement).getContext("webgl");
    return gl?.getParameter(gl.VERSION) as string | undefined;
  });
  expect(version).toContain("WebGL");
  await expect(page.locator('#preview-hud a[href="https://www.openstreetmap.org/copyright"]')).toBeVisible();
  await expect(page.locator("#preview-street")).toContainText("Downberg Road");
  const before = await page.locator("#preview-position").innerText();
  await hold(page, "d", 1_200);
  await expect(page.locator("#preview-position")).not.toHaveText(before);

  await page.locator('[data-lighting="night"]').click();
  await expect(page.locator('[data-lighting="night"]')).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(350);
  const night = await page.locator("#preview-canvas").screenshot({ path: testInfo.outputPath("downberg-night.png") });
  expect(await screenshotColours(page, night)).toBeGreaterThan(50);
  await page.locator('[data-lighting="day"]').click();
  await expect(page.locator('[data-lighting="day"]')).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(350);
  const day = await page.locator("#preview-canvas").screenshot({ path: testInfo.outputPath("downberg-day.png") });
  expect(await screenshotColours(page, day)).toBeGreaterThan(50);
  expect(day.equals(night)).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem("hanover-park-v1"))).toBe(originalSave);
  expect(errors).toEqual([]);
});

test("3D walking and sprinting respect rotated walls and open courtyards, pause and blur", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await enter(page);
  await expect.poll(() => page.evaluate(() => Boolean((window as any).__preview))).toBe(true);
  const stats = await page.evaluate(() => (window as any).__preview.world.stats);
  expect(stats.roads).toBeGreaterThan(100);
  expect(stats.buildings).toBeGreaterThan(10);

  const open = courtyard();
  await position(page, open.centre);
  const initial = await actor(page);
  await hold(page, "d", 1_000);
  const walking = await actor(page);
  const walkDistance = walking.x - initial.x;
  expect(walkDistance).toBeGreaterThan(10);
  expect(inside(walking, open.ring)).toBe(true);
  const orbit = await page.evaluate(() => {
    const camera = (window as any).__preview.camera;
    return { alpha: camera.alpha, beta: camera.beta, radius: camera.radius };
  });
  expect(orbit.alpha).toBeCloseTo(-Math.PI / 2, 5);
  expect(orbit.beta).toBeCloseTo(0.9, 5);
  expect(orbit.radius).toBeCloseTo(34, 5);
  await position(page, open.centre);
  await page.keyboard.down("Shift");
  await hold(page, "d", 1_000);
  await page.keyboard.up("Shift");
  const sprinting = await actor(page);
  expect(sprinting.x - open.centre.x).toBeGreaterThan(walkDistance * 1.2);
  expect(inside(sprinting, open.ring)).toBe(true);

  const sourceWall = wall();
  await position(page, sourceWall.start);
  await page.keyboard.down(sourceWall.key);
  try {
    // Software WebGL can render fewer simulation steps under load. Wait for
    // actual keyboard movement to reach the wall rather than changing time.
    await expect.poll(async () => {
      const p = await actor(page);
      return (p.x - sourceWall.mid.x) * sourceWall.nx +
        (p.y - sourceWall.mid.y) * sourceWall.ny;
    }, { timeout: 15_000 }).toBeLessThan(7);
    await page.waitForTimeout(350);
  } finally {
    await page.keyboard.up(sourceWall.key);
  }
  const stopped = await actor(page);
  const clearance = (stopped.x - sourceWall.mid.x) * sourceWall.nx +
    (stopped.y - sourceWall.mid.y) * sourceWall.ny;
  expect(clearance).toBeGreaterThanOrEqual(3.15);
  expect(clearance).toBeLessThan(7);
  expect(inside(stopped, MAP.buildings.find((b: any) => b.name === "Blinkwater Hof").points)).toBe(false);

  await position(page, open.centre);
  await page.keyboard.down("d");
  await page.waitForTimeout(250);
  await page.keyboard.press("Escape");
  await expect(page.locator("html")).toHaveAttribute("data-preview-state", "paused");
  const paused = await actor(page);
  await page.waitForTimeout(350);
  expect(await actor(page)).toEqual(paused);
  await page.locator("#preview-resume-button").click();
  await page.waitForTimeout(350);
  expect(await actor(page)).toEqual(paused);
  await page.keyboard.up("d");

  await page.keyboard.down("d");
  await page.waitForTimeout(250);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.locator("html")).toHaveAttribute("data-preview-state", "paused");
  const blurred = await actor(page);
  await page.locator("#preview-resume-button").click();
  await page.waitForTimeout(350);
  expect(await actor(page)).toEqual(blurred);
  await page.keyboard.up("d");
  await hold(page, "d", 350);
  expect((await actor(page)).x).toBeGreaterThan(blurred.x + 3);
  expect(errors).toEqual([]);
});

test.describe("WebGL unavailable", () => {
  test("3D preview shows a readable error and a working route to the original game", async () => {
    const browser = await chromium.launch({ executablePath, args: ["--no-sandbox", "--disable-webgl"] });
    const page = await browser.newPage();
    try {
      const uncaught: string[] = [];
      page.on("pageerror", (error) => uncaught.push(error.message));
      await page.goto("http://127.0.0.1:5174/3d.html");
      await expect(page.locator("html")).toHaveAttribute("data-preview-state", "error", { timeout: 20_000 });
      await expect(page.locator("#preview-error")).toBeVisible();
      await expect(page.locator("#preview-error-message")).toContainText(/WebGL|3D|graphics/i);
      await expect(page.locator("#preview-start")).toBeHidden();
      const fallback = page.locator('#preview-error a[href="/"]');
      await expect(fallback).toBeVisible();
      await fallback.click();
      await expect(page.getByRole("button", { name: "START GAME" })).toBeVisible();
      expect(uncaught).toEqual([]);
    } finally {
      await browser.close();
    }
  });
});
