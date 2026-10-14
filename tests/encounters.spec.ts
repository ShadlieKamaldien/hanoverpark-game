import { expect, test, type Page } from "@playwright/test";
import { hold, position, state } from "./helpers";

type Actor = {
  id: string;
  name: string;
  kind: "request" | "robber";
  x: number;
  y: number;
  resolved: boolean;
};

async function start(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "START GAME" }).click();
}

async function configure(
  page: Page,
  money: number,
  mission: "available" | "complete" = "available",
) {
  await page.evaluate(
    ({ money, mission }) => {
      const g = (window as any).__game;
      g.money = money;
      g.mission.status = mission;
      g.refreshHUD();
      g.store();
    },
    { money, mission },
  );
}

async function actors(page: Page, kind: Actor["kind"]): Promise<Actor[]> {
  return page.evaluate((kind) =>
    (window as any).__game.encounters.actors
      .filter((a: Actor) => a.kind === kind)
      .map((a: Actor) => ({
        id: a.id,
        name: a.name,
        kind: a.kind,
        x: a.x,
        y: a.y,
        resolved: a.resolved,
      })),
    kind,
  );
}

async function approach(page: Page, actor: Actor) {
  const point = await page.evaluate(({ x, y }) => {
    const g = (window as any).__game;
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      const p = { x: x + Math.cos(angle) * 45, y: y + Math.sin(angle) * 45 };
      if (!g.collision.blocked(p.x, p.y, 10)) return p;
    }
    return null;
  }, actor);
  expect(point, `${actor.name} must have an accessible approach`).not.toBeNull();
  await position(page, point!.x, point!.y);
}

async function settled(page: Page) {
  return page.evaluate(() => (window as any).__game.encounters.snapshot().settled as string[]);
}

async function continueGame(page: Page) {
  await page.reload();
  await page.getByRole("button", { name: "CONTINUE GAME" }).click();
}

test("R2 requests can be paid or refused once and survive refresh", async ({ page }) => {
  await start(page);
  await configure(page, 50);
  const requests = await actors(page, "request");
  expect(requests).toHaveLength(2);

  await approach(page, requests[0]);
  await page.keyboard.press("e");
  await expect(page.getByRole("heading", { name: requests[0].name })).toBeVisible();
  await page.locator('[data-choice="give"]').click();
  await expect(page.locator("#money")).toHaveText("R48");
  expect(await settled(page)).toContain(requests[0].id);
  await page.keyboard.press("e");
  await expect(page.locator('[data-choice="give"]')).toBeHidden();
  expect((await state(page)).money).toBe(48);

  await configure(page, 1);
  await approach(page, requests[1]);
  await page.keyboard.press("e");
  await expect(page.locator('[data-choice="give"]')).toBeDisabled();
  await page.locator('[data-choice="later"]').click();
  expect((await state(page)).money).toBe(1);
  expect(await settled(page)).not.toContain(requests[1].id);
  await page.keyboard.press("e");
  await page.locator('[data-choice="refuse"]').click();
  expect((await state(page)).money).toBe(1);
  expect(await settled(page)).toEqual(expect.arrayContaining(requests.map((a) => a.id)));

  await continueGame(page);
  expect((await state(page)).money).toBe(1);
  expect((await actors(page, "request")).every((a) => a.resolved)).toBe(true);
  for (const request of requests) {
    await approach(page, request);
    await page.keyboard.press("e");
    await expect(page.locator('[data-choice="give"]')).toBeHidden();
  }
  expect((await state(page)).money).toBe(1);
});

test("robbery demand resumes after refresh and handing over money never creates debt", async ({ page }) => {
  await start(page);
  await configure(page, 10, "complete");
  const robbers = await actors(page, "robber");
  expect(robbers).toHaveLength(2);
  await approach(page, robbers[0]);
  await expect(page.locator('[data-choice="pay"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: robbers[0].name })).toBeVisible();

  await continueGame(page);
  await expect(page.locator('[data-choice="pay"]')).toBeVisible();
  expect((await state(page)).money).toBe(10);
  await page.locator('[data-choice="pay"]').click();
  await expect(page.locator("#money")).toHaveText("R0");
  expect(await settled(page)).toContain(robbers[0].id);
  await continueGame(page);
  expect((await state(page)).money).toBe(0);
  expect((await actors(page, "robber"))[0].resolved).toBe(true);
  await configure(page, 37, "complete");
  await approach(page, robbers[0]);
  await page.waitForTimeout(300);
  await expect(page.locator('[data-choice="pay"]')).toBeHidden();
  expect((await state(page)).money).toBe(37);

  // Starting a new game clears the settled actors and their cooldown.
  // This lets the zero-money case run without waiting out the other encounter.
  await page.reload();
  await page.getByRole("button", { name: "START GAME" }).click();
  await configure(page, 0, "complete");
  await approach(page, robbers[1]);
  await expect(page.locator('[data-choice="pay"]')).toBeVisible();
  await page.locator('[data-choice="pay"]').click();
  expect((await state(page)).money).toBe(0);
  expect(await settled(page)).toContain(robbers[1].id);
  await continueGame(page);
  expect((await state(page)).money).toBe(0);
  expect((await actors(page, "robber"))[1].resolved).toBe(true);
  await approach(page, robbers[1]);
  await page.waitForTimeout(300);
  await expect(page.locator('[data-choice="pay"]')).toBeHidden();
  expect((await state(page)).money).toBe(0);
});

test("running away uses real movement and saves an escape without charging money", async ({ page }) => {
  test.setTimeout(30000);
  await start(page);
  await configure(page, 50, "complete");
  const robber = (await actors(page, "robber"))[0];
  // Pick a clear starting side and a real open route away from this actor.
  const route = await page.evaluate(({ x, y }) => {
    const g = (window as any).__game;
    for (const [nx, ny, key] of [[1, 0, "d"], [0, 1, "s"], [-1, 0, "a"], [0, -1, "w"]] as const) {
      let clear = true;
      for (let distance = 45; distance <= 750; distance += 15) {
        if (g.collision.blocked(x + nx * distance, y + ny * distance, 10)) {
          clear = false;
          break;
        }
      }
      if (clear) return { x: x + nx * 45, y: y + ny * 45, key };
    }
    return null;
  }, robber);
  expect(route, "The robbery actor needs a clear escape route").not.toBeNull();
  await position(page, route!.x, route!.y);
  await expect(page.locator('[data-choice="run"]')).toBeVisible();
  await page.locator('[data-choice="run"]').click();
  await expect.poll(() => page.evaluate(() => (window as any).__game.encounters.phase)).toBe("chase");
  const before = await state(page);
  try {
    await page.keyboard.down("Shift");
    await page.keyboard.down(route!.key);
    await expect.poll(() => settled(page), { timeout: 9000 }).toContain(robber.id);
  } finally {
    await page.keyboard.up(route!.key);
    await page.keyboard.up("Shift");
  }
  const escaped = await state(page);
  expect(Math.hypot(escaped.x - before.x, escaped.y - before.y)).toBeGreaterThan(200);
  expect(escaped.money).toBe(50);
  await continueGame(page);
  expect((await state(page)).money).toBe(50);
  expect(await settled(page)).toContain(robber.id);
  await expect(page.locator('[data-choice="pay"]')).toBeHidden();
});

test("a chase pauses, resumes after refresh, and a catch takes at most R20 once", async ({ page }) => {
  test.setTimeout(30000);
  await start(page);
  await configure(page, 50, "complete");
  const robber = (await actors(page, "robber"))[0];
  await approach(page, robber);
  await expect(page.locator('[data-choice="run"]')).toBeVisible();
  await page.locator('[data-choice="run"]').click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "On pause." })).toBeVisible();
  const paused = await page.evaluate(() => {
    const g = (window as any).__game;
    return { x: g.player.x, y: g.player.y, active: g.encounters.snapshot().active };
  });
  expect(paused.active?.phase).toBe("chase");
  await hold(page, "d", 750);
  const stillPaused = await page.evaluate(() => {
    const g = (window as any).__game;
    return { x: g.player.x, y: g.player.y, active: g.encounters.snapshot().active };
  });
  expect(stillPaused).toEqual(paused);
  expect((await state(page)).money).toBe(50);

  await continueGame(page);
  await expect.poll(() => page.evaluate(() => (window as any).__game.encounters.phase)).toBe("chase");
  // No time injection or forced catch: standing still lets the NPC reach the player.
  await expect.poll(() => settled(page), { timeout: 7000 }).toContain(robber.id);
  await expect(page.locator("#money")).toHaveText("R30");
  expect((await state(page)).money).toBe(30);
  await continueGame(page);
  expect((await state(page)).money).toBe(30);
  expect(await settled(page)).toContain(robber.id);
  await page.waitForTimeout(1100);
  await expect(page.locator('[data-choice="pay"]')).toBeHidden();
  expect((await state(page)).money).toBe(30);
});
