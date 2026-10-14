import { WORLD } from "../config/constants";
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export class Collision {
  constructor(public solids: Rect[]) {}
  blocked(x: number, y: number, radius: number) {
    return (
      x < radius ||
      y < radius ||
      x > WORLD.width - radius ||
      y > WORLD.height - radius ||
      this.solids.some(
        (r) =>
          x + radius > r.x &&
          x - radius < r.x + r.w &&
          y + radius > r.y &&
          y - radius < r.y + r.h,
      )
    );
  }
  move(
    actor: { x: number; y: number },
    dx: number,
    dy: number,
    radius: number,
  ) {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 6));
    let hit = false;
    for (let i = 0; i < steps; i++) {
      if (!this.blocked(actor.x + dx / steps, actor.y, radius))
        actor.x += dx / steps;
      else hit = true;
      if (!this.blocked(actor.x, actor.y + dy / steps, radius))
        actor.y += dy / steps;
      else hit = true;
    }
    return hit;
  }
}
