import { WORLD, WORLD_ID, type SaveData } from "../config/constants";
const KEY = "hanover-park-v1";
export function loadSave(): SaveData | null {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || "null");
    if (
      !d ||
      d.version !== 1 ||
      !["available", "active", "complete"].includes(d.mission)
    )
      return null;
    if (
      ![d.x, d.y, d.health, d.money, d.carX, d.carY, d.carAngle].every(
        Number.isFinite,
      )
    )
      return null;
    if (d.worldId !== undefined && typeof d.worldId !== "string") return null;
    if (
      d.x < 0 ||
      d.y < 0 ||
      d.carX < 0 ||
      d.carY < 0 ||
      d.money < 0 ||
      d.health < 0 ||
      d.health > 100
    )
      return null;
    // Changed maps respawn positions in the scene while retaining earned progress.
    if (d.worldId === WORLD_ID && (
      d.x > WORLD.width || d.y > WORLD.height ||
      d.carX > WORLD.width || d.carY > WORLD.height
    )) return null;
    return d as SaveData;
  } catch {
    return null;
  }
}
export function saveProgress(data: SaveData): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
