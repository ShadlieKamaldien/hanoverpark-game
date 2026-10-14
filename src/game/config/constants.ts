export const WORLD = { width: 2400, height: 1800 };
export const SPAWN = { x: 470, y: 740 };
export type MissionStatus = "available" | "active" | "complete";
export interface SaveData {
  version: 1;
  x: number;
  y: number;
  health: number;
  money: number;
  mission: MissionStatus;
  carX: number;
  carY: number;
  carAngle: number;
}
