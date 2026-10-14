import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
export const MAP = JSON.parse(
  readFileSync(
    new URL("../src/game/world/mapData.json", import.meta.url),
    "utf8",
  ),
);
export async function state(page: Page) {
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
export async function position(page: Page, x: number, y: number) {
  await page.evaluate(
    ({ x, y }) => {
      const g = (window as any).__game;
      g.player.x = x;
      g.player.y = y;
    },
    { x, y },
  );
}
export async function hold(page: Page, key: string, ms = 500) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}
// Independent signed-edge contract for the mapped, rotated Blinkwater footprint.
export function wall() {
  const b = MAP.buildings.find((b: any) => b.name === "Blinkwater Hof");
  const ps = b.points;
  let a = ps[0],
    c = ps[1],
    longest = 0;
  for (let i = 1; i < ps.length; i++) {
    const p = ps[i - 1],
      q = ps[i],
      l = Math.hypot(q.x - p.x, q.y - p.y);
    if (l > longest) {
      a = p;
      c = q;
      longest = l;
    }
  }
  const centre = {
    x: ps.reduce((s: number, p: any) => s + p.x, 0) / ps.length,
    y: ps.reduce((s: number, p: any) => s + p.y, 0) / ps.length,
  };
  const mid = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 };
  let nx = -(c.y - a.y) / longest,
    ny = (c.x - a.x) / longest;
  if ((centre.x - mid.x) * nx + (centre.y - mid.y) * ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  return {
    mid,
    nx,
    ny,
    start: { x: mid.x + nx * 75, y: mid.y + ny * 75 },
    key:
      Math.abs(nx) > Math.abs(ny) ? (nx > 0 ? "a" : "d") : ny > 0 ? "w" : "s",
  };
}
