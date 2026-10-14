import { MAP } from "../world/mapData";
export const WORLD = { width: MAP.width, height: MAP.height };
export const WORLD_ID = MAP.id;
export const SPAWN = MAP.locations.spawn;
export type MissionStatus = "available" | "active" | "complete";
export interface SaveData {
  version: 1;
  worldId?: string;
  x: number;
  y: number;
  health: number;
  money: number;
  mission: MissionStatus;
  carX: number;
  carY: number;
  carAngle: number;
}
