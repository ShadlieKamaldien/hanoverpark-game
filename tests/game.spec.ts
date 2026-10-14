import { test, expect, type Page } from "@playwright/test";
// Position the character to isolate each interaction; input, collision, driving,
// mission reward and persistence still run through the real game loop.
async function state(page: Page) {
  return page.evaluate(() => {
    const g = (window as any).__game;
    return {
      x: g.player.x,
      y: g.player.y,
      stamina: g.player.stamina,
      money: g.money,
      mission: g.mission.status,
      driving: g.driving,
      carX: g.car.x,
      carY: g.car.y,
      speed: g.car.speed,
      angle: g.car.angle,
    };
  });
}
async function position(page: Page, x: number, y: number) {
  await page.evaluate(
    ({ x, y }) => {
      const g = (window as any).__game;
      g.player.x = x;
      g.player.y = y;
    },
    { x, y },
  );
}
async function hold(page: Page, key: string, ms = 500) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}
test("walk, sprint, collision, NPCs, delivery reward and saved progress", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "START GAME" })).toBeVisible();
  await page.getByRole("button", { name: "START GAME" }).click();
  await expect(page.locator("#hud")).toBeVisible();
  const initial = await state(page);
  await hold(page, "d");
  expect((await state(page)).x).toBeGreaterThan(initial.x + 30);
  await page.keyboard.down("Shift");
  await hold(page, "s");
  await page.keyboard.up("Shift");
  expect((await state(page)).stamina).toBeLessThan(100);
  await position(page, 300, 510);
  await hold(page, "w", 700);
  const collision = await state(page);
  expect(collision.y).toBeGreaterThanOrEqual(470);
  expect(collision.y).toBeLessThan(490);
  await position(page, 545, 740);
  await page.keyboard.press("e");
  await expect(
    page.getByRole("heading", { name: "Aunty Fatima" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "ACCEPT DELIVERY" }).click();
  expect((await state(page)).mission).toBe("active");
  await expect(page.locator("#objective")).toContainText("Block C");
  await position(page, 1780, 510);
  await page.keyboard.press("e");
  await expect(page.locator("#money")).toHaveText("R150");
  expect((await state(page)).mission).toBe("complete");
  await page.keyboard.press("e");
  expect((await state(page)).money).toBe(150);
  await page.reload();
  await page.getByRole("button", { name: "CONTINUE GAME" }).click();
  await expect(page.locator("#money")).toHaveText("R150");
  expect((await state(page)).mission).toBe("complete");
  await position(page, 730, 970);
  await page.keyboard.press("e");
  await expect(
    page.getByRole("heading", { name: "Uncle Gatie" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "SHARP SHARP" }).click();
  await position(page, 1200, 1440);
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
  await page.screenshot({ path: "test-results/neighbourhood.png" });
  expect(errors).toEqual([]);
});
test("enter, accelerate, steer, collide, brake and exit hatchback", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  await position(page, 620, 1005);
  await page.keyboard.press("e");
  expect((await state(page)).driving).toBe(true);
  const start = await state(page);
  await hold(page, "w", 800);
  expect((await state(page)).carY).toBeLessThan(start.carY - 30);
  await page.keyboard.down("w");
  await hold(page, "d", 250);
  await page.keyboard.up("w");
  expect(Math.abs((await state(page)).angle)).toBeGreaterThan(0.1);
  await page.keyboard.press("e");
  expect((await state(page)).driving).toBe(true);
  // Collision against Block A; vehicle's 32px collision radius must stop it.
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.car.x = 300;
    g.car.y = 535;
    g.car.angle = 0;
    g.car.speed = 0;
  });
  await hold(page, "w", 1500);
  expect((await state(page)).carY).toBeGreaterThanOrEqual(492);
  expect((await state(page)).carY).toBeLessThan(520);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.car.x = 620;
    g.car.y = 960;
    g.car.angle = 0;
    g.car.speed = 100;
  });
  await hold(page, "s", 420);
  expect(Math.abs((await state(page)).speed)).toBeLessThan(35);
  await page.keyboard.press("e");
  expect((await state(page)).driving).toBe(false);
  expect(
    await page.evaluate(() => (window as any).__game.player.sprite.visible),
  ).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "CONTINUE GAME" }).click();
  expect((await state(page)).driving).toBe(false);
  expect(
    Math.abs((await state(page)).x - (await state(page)).carX),
  ).toBeGreaterThan(20);
});
test("corrupt saves are ignored and small desktop menu fits", async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem("hanover-park-v1", '{"version":1,"x":"bad"}'),
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "CONTINUE GAME" }),
  ).toBeHidden();
  await page.getByRole("button", { name: "START GAME" }).click();
  await expect(page.locator("#game canvas")).toBeVisible();
});

test("complete delivery by walking the connected streets from spawn", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
  async function walk(
    key: string,
    axis: "x" | "y",
    target: number,
    increasing = true,
  ) {
    await page.keyboard.down(key);
    try {
      await expect
        .poll(
          async () => {
            const v = (await state(page))[axis];
            return increasing ? v >= target : v <= target;
          },
          { timeout: 25000, intervals: [30] },
        )
        .toBe(true);
    } finally {
      await page.keyboard.up(key);
    }
  }
  await walk("d", "x", 545);
  await page.keyboard.press("e");
  await page.getByRole("button", { name: "ACCEPT DELIVERY" }).click();
  await page.keyboard.down("Shift");
  await walk("d", "x", 1250);
  await page.keyboard.up("Shift");
  await walk("w", "y", 510, false);
  await walk("d", "x", 1750);
  await page.keyboard.press("e");
  await expect(page.locator("#money")).toHaveText("R150");
  await expect(page.locator("#objective")).toContainText("Delivery complete");
  await page.reload();
  await page.getByRole("button", { name: "CONTINUE GAME" }).click();
  await expect(page.locator("#money")).toHaveText("R150");
});
