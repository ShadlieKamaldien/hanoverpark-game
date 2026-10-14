import { test, expect } from "@playwright/test";
import { MAP } from "./helpers";
test("production output starts, moves, accepts mission and continues without console errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("http://127.0.0.1:5174");
  await expect(page.getByRole("button", { name: "START GAME" })).toBeVisible();
  expect(await page.evaluate(() => "__game" in window)).toBe(false);
  await page.screenshot({ path: "test-results/main-menu.png" });
  await page.getByRole("button", { name: "START GAME" }).click();
  await page.keyboard.down("d");
  await page.waitForTimeout(550);
  await page.keyboard.up("d");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "On pause." })).toBeVisible();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("hanover-park-v1")!),
  );
  expect(saved.x).toBeGreaterThan(MAP.locations.spawn.x + 20);
  expect(saved.y).toBe(MAP.locations.spawn.y);
  await page.getByRole("button", { name: "BACK TO THE STREETS" }).click();
  await page.keyboard.press("e");
  await expect(
    page.getByRole("heading", { name: "Aunty Fatima" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "ACCEPT DELIVERY" }).click();
  await page.reload();
  await page.getByRole("button", { name: "CONTINUE GAME" }).click();
  await expect(page.locator("#objective")).toContainText("Blinkwater Hof");
  await expect(page.locator("#hud .map-attribution")).toHaveAttribute(
    "href", "https://www.openstreetmap.org/copyright",
  );
  const snapshotResponse = await page.request.get("http://127.0.0.1:5174/map-data/hanover-park.osm.json");
  expect(snapshotResponse.ok()).toBe(true);
  const snapshot = await snapshotResponse.json();
  expect(snapshot.boundary.relationId).toBe(2046907);
  expect(snapshot.source.license).toBe("Open Database License (ODbL) 1.0");
  const geometryResponse = await page.request.get("http://127.0.0.1:5174/map-data/hanover-park.game.json");
  expect(geometryResponse.ok()).toBe(true);
  const geometry = await geometryResponse.json();
  expect(geometry.id).toBe(MAP.id);
  expect(geometry.roads.some((road: any) => road.name === "Downberg Road")).toBe(true);
  expect(geometry.buildings.some((building: any) => building.osmType === "relation" && building.holes?.length)).toBe(true);
  await page.getByRole("button", { name: "AREA GUIDE" }).click();
  await expect(
    page.getByRole("heading", { name: "Know your area." }),
  ).toBeVisible();
  await expect(
    page.getByText("Blinkwater Court", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Etosha Court", { exact: true })).toBeVisible();
  await expect(page.locator(".facility-list")).toContainText(
    "Downberg Sports Ground",
  );
  await expect(page.locator(".guide-status").first()).toContainText(
    "OpenStreetMap",
  );
  await page.getByRole("button", { name: "BACK TO THE STREETS" }).click();
  await expect(page.locator("#objective")).toContainText("Blinkwater Hof");
  await page.screenshot({ path: "test-results/production-game.png" });
  expect(errors).toEqual([]);
});
