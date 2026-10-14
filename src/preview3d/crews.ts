import type { MapPoint } from "../game/world/mapData";
import { PREVIEW } from "./map";

export interface CrewDefinition {
  id: string;
  name: string;
  colour: string;
  street: string;
  members: { id: string; name: string; nickname: string; skin: string; height: number }[];
}

/** Story factions, never names, territories or identities of real gangs. */
export const CREWS: readonly CrewDefinition[] = [
  {
    id: "downberg_side", name: "Downberg Side", colour: "#b67c4b", street: "Downberg Road",
    members: [
      { id: "crew_ismail", name: "Ismail", nickname: "Izzy", skin: "#aa795d", height: 1.78 },
      { id: "crew_clayton", name: "Clayton", nickname: "Clay", skin: "#94694d", height: 1.83 },
      { id: "crew_andre", name: "André", nickname: "Dre", skin: "#b28165", height: 1.74 },
    ],
  },
  {
    id: "lansry_crew", name: "Lansry Crew", colour: "#4b8c89", street: "Lansry Walk",
    members: [
      { id: "crew_daniel", name: "Daniel", nickname: "Danie", skin: "#a87355", height: 1.79 },
      { id: "crew_marcel", name: "Marcel", nickname: "Marz", skin: "#956149", height: 1.84 },
      { id: "crew_yusuf", name: "Yusuf", nickname: "Yus", skin: "#b28367", height: 1.72 },
    ],
  },
];

export type CrewPhase = "neutral" | "joined" | "warning" | "pursuit" | "escaped" | "caught";
export interface CrewState {
  affiliation: string | null;
  phase: CrewPhase;
  crewName?: string;
  text: string;
  remaining?: number;
  chasingIds: string[];
}

type SearchNode = { x: number; y: number; key: string; cost: number; score: number; parent?: SearchNode };
const cell = 1.5 / PREVIEW.metresPerPixel;

/** Small, cached A* searches around walls; actual movement still checks every step. */
export class CrewNavigation {
  private readonly openCells = new Map<string, boolean>();
  private readonly openEdges = new Map<string, boolean>();

  constructor(private readonly clear: (point: MapPoint) => boolean,
    private readonly clearLine: (a: MapPoint, b: MapPoint) => boolean) {}

  route(from: MapPoint, to: MapPoint): MapPoint[] {
    if (this.clearLine(from, to)) return [{ ...to }];
    const start = this.nearby(from), end = this.nearby(to);
    if (!start || !end) return [];
    const margin = Math.ceil(18 / PREVIEW.metresPerPixel / cell);
    const bounds = {
      minX: Math.min(start.x, end.x) - margin, maxX: Math.max(start.x, end.x) + margin,
      minY: Math.min(start.y, end.y) - margin, maxY: Math.max(start.y, end.y) + margin,
    };
    const goal = this.key(end.x, end.y);
    const heap: SearchNode[] = [];
    const best = new Map<string, number>();
    const push = (node: SearchNode) => {
      heap.push(node);
      let index = heap.length - 1;
      while (index > 0) {
        const parent = Math.floor((index - 1) / 2);
        if (heap[parent].score <= node.score) break;
        heap[index] = heap[parent]; index = parent;
      }
      heap[index] = node;
    };
    const pop = () => {
      const first = heap[0], last = heap.pop()!;
      if (heap.length) {
        let index = 0;
        while (index * 2 + 1 < heap.length) {
          const left = index * 2 + 1, right = left + 1;
          const child = right < heap.length && heap[right].score < heap[left].score ? right : left;
          if (heap[child].score >= last.score) break;
          heap[index] = heap[child]; index = child;
        }
        heap[index] = last;
      }
      return first;
    };
    const first = { ...start, key: this.key(start.x, start.y), cost: 0,
      score: Math.hypot(start.x - end.x, start.y - end.y) };
    push(first); best.set(first.key, 0);
    let visited = 0;
    while (heap.length && visited++ < 1200) {
      const node = pop();
      if (node.cost > best.get(node.key)!) continue;
      if (node.key === goal) {
        const path: MapPoint[] = [{ ...to }];
        for (let cursor: SearchNode | undefined = node; cursor; cursor = cursor.parent) path.unshift(this.point(cursor.x, cursor.y));
        // Skip redundant points only where the actor's complete circle fits.
        const smooth: MapPoint[] = [];
        let previous = from, index = 0;
        while (index < path.length) {
          let next = index;
          while (next + 1 < path.length && this.clearLine(previous, path[next + 1])) next++;
          smooth.push(path[next]); previous = path[next]; index = next + 1;
        }
        return smooth;
      }
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        const x = node.x + dx, y = node.y + dy, key = this.key(x, y);
        if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY || !this.isOpen(x, y)) continue;
        const cost = node.cost + Math.hypot(dx, dy);
        if (cost >= (best.get(key) ?? Infinity) || !this.edge(node, { x, y })) continue;
        best.set(key, cost);
        push({ x, y, key, cost, score: cost + Math.hypot(x - end.x, y - end.y), parent: node });
      }
    }
    return [];
  }

  private nearby(point: MapPoint) {
    const x = Math.round((point.x - PREVIEW.origin.x) / cell), y = Math.round((point.y - PREVIEW.origin.y) / cell);
    const candidates: { x: number; y: number; distance: number }[] = [];
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
      const p = this.point(x + dx, y + dy);
      candidates.push({ x: x + dx, y: y + dy, distance: Math.hypot(point.x - p.x, point.y - p.y) });
    }
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates.find((candidate) => this.isOpen(candidate.x, candidate.y) && this.clearLine(point, this.point(candidate.x, candidate.y)));
  }

  private point(x: number, y: number): MapPoint {
    return { x: PREVIEW.origin.x + x * cell, y: PREVIEW.origin.y + y * cell };
  }
  private key(x: number, y: number) { return `${x},${y}`; }
  private isOpen(x: number, y: number) {
    const key = this.key(x, y);
    let result = this.openCells.get(key);
    if (result === undefined) { result = this.clear(this.point(x, y)); this.openCells.set(key, result); }
    return result;
  }
  private edge(a: { x: number; y: number }, b: { x: number; y: number }) {
    const keys = [this.key(a.x, a.y), this.key(b.x, b.y)].sort();
    const key = `${keys[0]}:${keys[1]}`;
    let result = this.openEdges.get(key);
    if (result === undefined) {
      result = this.clearLine(this.point(a.x, a.y), this.point(b.x, b.y));
      this.openEdges.set(key, result);
    }
    return result;
  }
}
