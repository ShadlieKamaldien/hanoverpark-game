import { WORLD } from "../config/constants";
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Point {
  x: number;
  y: number;
}
export interface Polygon {
  points: Point[];
  holes?: Point[][];
}

function inRing(x: number, y: number, points: Point[]) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if (
      (a.y > y) !== (b.y > y) &&
      x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}

function touchesRing(
  x: number,
  y: number,
  radiusSquared: number,
  points: Point[],
) {
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[j];
    const b = points[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const t =
      lengthSquared === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / lengthSquared),
          );
    const distanceX = x - (a.x + t * dx);
    const distanceY = y - (a.y + t * dy);
    if (distanceX * distanceX + distanceY * distanceY <= radiusSquared)
      return true;
  }
  return false;
}

export class Collision {
  private readonly polygons: Array<{
    shape: Polygon;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }>;

  constructor(public solids: Rect[], polygons: Polygon[] = []) {
    this.polygons = polygons
      .filter((shape) => shape.points.length >= 3)
      .map((shape) => ({
        shape,
        minX: Math.min(...shape.points.map((p) => p.x)),
        minY: Math.min(...shape.points.map((p) => p.y)),
        maxX: Math.max(...shape.points.map((p) => p.x)),
        maxY: Math.max(...shape.points.map((p) => p.y)),
      }));
  }
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
      ) ||
      this.polygons.some(({ shape, minX, minY, maxX, maxY }) => {
        if (
          x + radius < minX ||
          y + radius < minY ||
          x - radius > maxX ||
          y - radius > maxY
        )
          return false;

        const holes = shape.holes ?? [];
        // A courtyard is empty space, but its walls still block the actor's circle.
        if (
          inRing(x, y, shape.points) &&
          !holes.some((hole) => inRing(x, y, hole))
        )
          return true;
        const radiusSquared = radius * radius;
        return (
          touchesRing(x, y, radiusSquared, shape.points) ||
          holes.some((hole) => touchesRing(x, y, radiusSquared, hole))
        );
      })
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
