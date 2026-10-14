import { test, expect } from "@playwright/test";
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
  expect(saved.x).toBeGreaterThan(500);
  expect(saved.y).toBe(740);
  await page.getByRole("button", { name: "BACK TO THE STREETS" }).click();
  await page.keyboard.press("e");
  await expect(
    page.getByRole("heading", { name: "Aunty Fatima" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "ACCEPT DELIVERY" }).click();
  await page.reload();
  await page.getByRole("button", { name: "CONTINUE GAME" }).click();
  await expect(page.locator("#objective")).toContainText("Block C");
  await page.screenshot({ path: "test-results/production-game.png" });
  expect(errors).toEqual([]);
});
