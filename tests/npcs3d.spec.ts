import { expect, test, type Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { MAP } from "./helpers";

const executablePath = process.env.CHROMIUM_PATH ||
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
test.use({ launchOptions: {
  executablePath,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
} });
test.setTimeout(90_000);

type Point = { x: number; y: number };
type Neighbour = { id: string; name: string; role: string; position: Point };

async function enter(page: Page, production = false) {
  await page.goto(production ? "http://127.0.0.1:5174/3d.html" : "/3d.html");
  await expect(page.locator("#preview-start-button")).toBeEnabled({ timeout: 45_000 });
  await page.locator("#preview-start-button").click();
  await expect(page.locator("html")).toHaveAttribute("data-preview-state", "playing");
}

async function neighbours(page: Page): Promise<Neighbour[]> {
  return page.evaluate(() => (window as any).__preview.npcs.actors.map((npc: any) => ({
    id: npc.id, name: npc.name, role: npc.role, position: { ...npc.position },
  })));
}

async function snapshot(page: Page) {
  return page.evaluate(() => {
    const preview = (window as any).__preview;
    return {
      player: { ...preview.player.position },
      neighbours: preview.npcs.actors.map((npc: any) => ({ id: npc.id, ...npc.position })),
    };
  });
}

async function storage(page: Page) {
  return page.evaluate(() => Object.fromEntries(
    Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]),
  ));
}

async function renderedFrames(page: Page, count = 3) {
  const start = await page.evaluate(() => (window as any).__preview.scene.getFrameId());
  // Observe real rendering without injecting time or calling the controller.
  await expect.poll(() => page.evaluate(() => (window as any).__preview.scene.getFrameId()), {
    timeout: 20_000,
  }).toBeGreaterThanOrEqual(start + count);
}

function inRing(point: Point, polygon: Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) &&
      point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function inBuilding(point: Point) {
  return MAP.buildings.some((building: any) => inRing(point, building.points) &&
    !(building.holes ?? []).some((hole: Point[]) => inRing(point, hole)));
}

function clearCircle(point: Point, radius = 3.2) {
  if (inBuilding(point)) return false;
  return !MAP.buildings.some((building: any) => [building.points, ...(building.holes ?? [])].some((ring: Point[]) =>
    ring.some((a, i) => {
      const b = ring[(i + 1) % ring.length], dx = b.x - a.x, dy = b.y - a.y;
      const length = dx * dx + dy * dy;
      const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
      return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy) <= radius;
    }),
  ));
}

function solidBetween(a: Point, b: Point) {
  return Array.from({ length: 101 }, (_, i) => ({
    x: a.x + (b.x - a.x) * i / 100,
    y: a.y + (b.y - a.y) * i / 100,
  })).some(inBuilding);
}

function occludedCorner() {
  const building = MAP.buildings.find((building: any) => building.name === "Blinkwater Hof");
  const ring: Point[] = building.points.slice(0, -1);
  const normal = (a: Point, b: Point) => {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const result = { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
    const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (inBuilding({ x: midpoint.x + result.x, y: midpoint.y + result.y })) {
      result.x *= -1; result.y *= -1;
    }
    return result;
  };
  for (let i = 0; i < ring.length; i++) {
    const vertex = ring[i], before = ring[(i + ring.length - 1) % ring.length], after = ring[(i + 1) % ring.length];
    const incoming = normal(before, vertex), outgoing = normal(vertex, after);
    const beforeLength = Math.hypot(before.x - vertex.x, before.y - vertex.y);
    const afterLength = Math.hypot(after.x - vertex.x, after.y - vertex.y);
    for (const along of [8, 10, 12]) {
      for (const clearance of [3.6, 4.5, 5]) {
        const player = {
          x: vertex.x + (before.x - vertex.x) / beforeLength * along + incoming.x * clearance,
          y: vertex.y + (before.y - vertex.y) / beforeLength * along + incoming.y * clearance,
        };
        const npc = {
          x: vertex.x + (after.x - vertex.x) / afterLength * along + outgoing.x * clearance,
          y: vertex.y + (after.y - vertex.y) / afterLength * along + outgoing.y * clearance,
        };
        if (!clearCircle(player) || !clearCircle(npc) || Math.hypot(player.x - npc.x, player.y - npc.y) >= 22 ||
          !solidBetween(player, npc)) continue;
        const visible = Array.from({ length: 16 }, (_, index) => ({
          x: player.x + Math.cos(index * Math.PI / 8) * 8,
          y: player.y + Math.sin(index * Math.PI / 8) * 8,
        })).find((point) => clearCircle(point) && !solidBetween(player, point));
        if (visible) return { player, npc, visible };
      }
    }
  }
  throw new Error("No independently clear, wall-occluded Blinkwater corner within conversation range.");
}

async function approach(page: Page, role: string, heldKey?: string) {
  const actors = await neighbours(page);
  const npc = actors.find((actor) => actor.role === role)!;
  expect(npc, `A ${role} character exists`).toBeTruthy();
  const candidates = [8, 12, 16].flatMap((distance) => Array.from({ length: 16 }, (_, i) => ({
    x: npc.position.x + Math.cos(i * Math.PI / 8) * distance,
    y: npc.position.y + Math.sin(i * Math.PI / 8) * distance,
  })));
  const point = candidates.find((point) => clearCircle(point) && actors.every((other) =>
    other.id === npc.id || Math.hypot(point.x - other.position.x, point.y - other.position.y) >
      Math.hypot(point.x - npc.position.x, point.y - npc.position.y),
  ));
  expect(point, `A clear approach to ${npc.name} exists`).toBeTruthy();
  await page.evaluate((point) => {
    const preview = (window as any).__preview;
    Object.assign(preview.player.position, point);
    preview.camera.alpha = -Math.PI / 2;
  }, point!);
  await expect(page.locator("#preview-interact")).toBeVisible({ timeout: 15_000 });
  await page.locator("#preview-canvas").focus();
  if (heldKey) await page.keyboard.down(heldKey);
  await page.keyboard.press("e");
  await expect(page.locator("#preview-dialogue")).toBeVisible();
  expect(await page.evaluate(() => (window as any).__preview.npcs.activeNPC?.id)).toBe(npc.id);
  return npc;
}

test("production neighbours greet through accessible keyboard dialogue without changing existing progress", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const saved = JSON.stringify({ sentinel: "original-2D-progress", money: 247, health: 81, mission: "complete" });
  await page.addInitScript((saved) => localStorage.setItem("hanover-park-v1", saved), saved);
  await enter(page, true);
  const beforeStorage = await storage(page);
  expect(await page.evaluate(() => "__preview" in window || "__game" in window)).toBe(false);
  const gl = await page.locator("#preview-canvas").evaluate((canvas) => {
    const context = (canvas as HTMLCanvasElement).getContext("webgl2") ||
      (canvas as HTMLCanvasElement).getContext("webgl");
    return context?.getParameter(context.VERSION) as string | undefined;
  });
  expect(gl).toContain("WebGL");
  await expect(page.locator("#preview-interact")).toBeVisible();
  await page.keyboard.press("e");
  const dialogue = page.getByRole("dialog");
  await expect(dialogue).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-preview-state", "dialogue");
  await expect(page.locator("#preview-dialogue-speaker")).not.toBeEmpty();
  await expect(page.locator("#preview-dialogue-text")).not.toBeEmpty();
  const choices = dialogue.locator("[data-dialogue-choice]");
  expect(await choices.count()).toBeGreaterThan(1);
  await expect(choices.first()).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#preview-dialogue-close")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(choices.first()).toBeFocused();
  const opening = await page.locator("#preview-dialogue-text").innerText();
  await choices.first().click();
  await expect(page.locator("#preview-dialogue-text")).not.toHaveText(opening);
  await page.screenshot({ path: testInfo.outputPath("downberg-neighbour-dialogue.png") });
  await page.keyboard.press("Escape");
  await expect(dialogue).toBeHidden();
  await expect(page.locator("html")).toHaveAttribute("data-preview-state", "playing");
  await expect(page.locator("#preview-canvas")).toBeFocused();
  expect(await storage(page)).toEqual(beforeStorage);
  expect(await page.evaluate(() => localStorage.getItem("hanover-park-v1"))).toBe(saved);
  expect(errors).toEqual([]);
});

test("R2 requests and skelm warnings stay conversational, with frozen movement and safe pause or blur", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const saved = JSON.stringify({ sentinel: "existing-wallet-and-health", money: 193, health: 78 });
  await page.addInitScript((saved) => localStorage.setItem("hanover-park-v1", saved), saved);
  await enter(page);
  const beforeStorage = await storage(page);
  await approach(page, "requester", "d");
  await expect(page.locator("#preview-dialogue-text")).toContainText(/R\s?2/);
  await expect(page.locator('[data-dialogue-choice="listen"]')).toBeVisible();
  await expect(page.locator('[data-dialogue-choice="refuse"]')).toBeVisible();
  await expect(page.getByRole("button", { name: /pay|rob|chase|attack/i })).toHaveCount(0);
  const speaking = await snapshot(page);
  await renderedFrames(page);
  expect(await snapshot(page)).toEqual(speaking);
  await page.locator('[data-dialogue-choice="listen"]').click();
  await expect(page.locator("#preview-dialogue")).toBeVisible();
  await expect(page.locator("#preview-dialogue-text")).toContainText(/tik/i);
  expect(await storage(page)).toEqual(beforeStorage);
  await page.keyboard.press("Escape");
  await expect(page.locator("#preview-dialogue")).toBeHidden();
  const returned = (await snapshot(page)).player;
  await renderedFrames(page);
  expect((await snapshot(page)).player).toEqual(returned);
  await page.keyboard.up("d");

  await approach(page, "requester");
  await page.locator('[data-dialogue-choice="refuse"]').click();
  await expect(page.locator("#preview-dialogue")).toBeVisible();
  expect(await storage(page)).toEqual(beforeStorage);
  await page.locator('[data-dialogue-choice="dismiss"]').click();
  await expect(page.locator("#preview-dialogue")).toBeHidden();

  await approach(page, "stranger");
  const reply = page.locator('[data-dialogue-choice="peace"], [data-dialogue-choice="listen"]').first();
  await expect(reply).toBeVisible();
  await reply.click();
  await expect(page.locator("#preview-dialogue")).toBeVisible();
  expect(await storage(page)).toEqual(beforeStorage);
  await page.keyboard.down("w");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.locator("html")).toHaveAttribute("data-preview-state", "paused");
  await expect(page.locator("#preview-dialogue")).toBeHidden();
  const paused = await snapshot(page);
  await renderedFrames(page);
  expect(await snapshot(page)).toEqual(paused);
  await page.locator("#preview-resume-button").click();
  await renderedFrames(page);
  expect((await snapshot(page)).player).toEqual(paused.player);
  await page.keyboard.up("w");
  await page.keyboard.down("d");
  try {
    await expect.poll(async () => {
      const current = (await snapshot(page)).player;
      return Math.hypot(current.x - paused.player.x, current.y - paused.player.y);
    }, { timeout: 15_000 }).toBeGreaterThan(3);
  } finally { await page.keyboard.up("d"); }
  expect(await storage(page)).toEqual(beforeStorage);
  expect(await page.evaluate(() => "__game" in window)).toBe(false);
  expect(errors).toEqual([]);
});

test("walking neighbours remain outside mapped buildings and conversation cannot pass through a flat wall", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await enter(page);
  const initial = await neighbours(page);
  expect(initial.some((npc) => npc.role === "pedestrian")).toBe(true);
  await expect.poll(async () => {
    const current = await neighbours(page);
    for (const npc of current) expect(inBuilding(npc.position), `${npc.name} is outside solid building footprints`).toBe(false);
    return current.filter((npc) => npc.role === "pedestrian").some((npc) => {
      const start = initial.find((actor) => actor.id === npc.id)!;
      return Math.hypot(npc.position.x - start.position.x, npc.position.y - start.position.y) > 3;
    });
  }, { timeout: 25_000 }).toBe(true);

  const corner = occludedCorner();
  expect(clearCircle(corner.player)).toBe(true);
  expect(clearCircle(corner.npc)).toBe(true);
  expect(solidBetween(corner.player, corner.npc)).toBe(true);
  expect(Math.hypot(corner.player.x - corner.npc.x, corner.player.y - corner.npc.y)).toBeLessThan(22);
  await page.evaluate(({ player, npc }) => {
    const preview = (window as any).__preview;
    Object.assign(preview.player.position, player);
    const neighbour = preview.npcs.actors.find((npc: any) => npc.role === "neighbour");
    Object.assign(neighbour.position, npc);
    for (const other of preview.npcs.actors) {
      if (other !== neighbour) Object.assign(other.position, { x: 3400, y: 10400 });
    }
  }, corner);
  await expect(page.locator("#preview-interact-prompt")).toBeHidden();
  expect(await page.evaluate(() => {
    const preview = (window as any).__preview;
    return preview.npcs.nearest(preview.player.position);
  })).toBeNull();
  await page.keyboard.press("e");
  await expect(page.locator("#preview-dialogue")).toBeHidden();
  // The same character becomes available on the clear side of that wall.
  await page.evaluate((point) => {
    const preview = (window as any).__preview;
    const neighbour = preview.npcs.actors.find((npc: any) => npc.role === "neighbour");
    Object.assign(neighbour.position, point);
  }, corner.visible);
  await expect(page.locator("#preview-interact")).toBeVisible();
  await page.keyboard.press("e");
  await expect(page.locator("#preview-dialogue")).toBeVisible();
  await page.locator("#preview-dialogue-close").click();
  await expect(page.locator("#preview-canvas")).toBeFocused();
  expect(errors).toEqual([]);
});
