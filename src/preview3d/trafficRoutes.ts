import type { MapPoint, MapRoad } from "../game/world/mapData";
import { PREVIEW, ROADS, SPAWN } from "./map";

interface Link { id: string; from: string; to: string; points: MapPoint[]; road: MapRoad; length: number }
interface Node { id: string; point: MapPoint; links: Link[] }
interface Circuit { points: MapPoint[]; roads: string[]; width: number; length: number; junctions: string[] }
export interface TrafficJunction { id: string; position: MapPoint }
export interface TrafficRoute {
  id: string;
  /** Original source centreline, in the direction this lane travels. */
  centreline: MapPoint[];
  /** Smooth closed left lane, in unchanged source-map pixels. */
  points: MapPoint[];
  roads: string[];
  segments: { a: MapPoint; b: MapPoint; start: number; length: number; heading: number }[];
  length: number;
  junctions: { id: string; distance: number }[];
}

const ppm = 1 / PREVIEW.metresPerPixel;
const separation = (a: MapPoint, b: MapPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const pointKey = (p: MapPoint) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
const lerp = (a: MapPoint, b: MapPoint, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

function streetGraph() {
  const nodes = new Map<string, Node>();
  const added = new Set<string>();
  const bounds = PREVIEW.bounds;
  const valid = (p: MapPoint) => p.x > bounds.minX + 4 * ppm && p.x < bounds.maxX - 4 * ppm && p.y > bounds.minY + 4 * ppm && p.y < bounds.maxY - 4 * ppm;
  const node = (p: MapPoint) => {
    const id = pointKey(p);
    if (!nodes.has(id)) nodes.set(id, { id, point: { ...p }, links: [] });
    return nodes.get(id)!;
  };
  for (const road of ROADS) {
    // Named "Walk" streets can be residential vehicle roads in the source;
    // the source highway classification, rather than its name, decides access.
    if (!["residential", "tertiary", "secondary", "primary", "unclassified"].includes(road.kind)) continue;
    if (road.width * PREVIEW.metresPerPixel < 5.6) continue;
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1], b = road.points[i];
      if (!valid(a) || !valid(b) || separation(a, b) < 0.1) continue;
      const from = node(a), to = node(b);
      const id = [from.id, to.id].sort().join("|");
      if (added.has(id)) continue;
      added.add(id);
      const length = separation(a, b);
      from.links.push({ id, from: from.id, to: to.id, points: [from.point, to.point], road, length });
      to.links.push({ id, from: to.id, to: from.id, points: [to.point, from.point], road, length });
    }
  }
  const corners = new Set([...nodes.values()].filter((n) => n.links.length !== 2 || n.links[0].road.name !== n.links[1].road.name).map((n) => n.id));
  const compressed = new Map<string, Node>();
  for (const id of corners) {
    const start = nodes.get(id)!;
    const links: Link[] = [];
    for (const first of start.links) {
      const points = [...first.points];
      let previous = id, current = first.to, length = first.length;
      const visited = new Set([id]);
      while (!corners.has(current) && !visited.has(current)) {
        visited.add(current);
        const next = nodes.get(current)!.links.find((link) => link.to !== previous)!;
        previous = current;
        current = next.to;
        length += next.length;
        points.push(nodes.get(current)!.point);
      }
      if (current !== id) links.push({ ...first, id: [id, current].sort().join("|"), to: current, points, length });
    }
    compressed.set(id, { ...start, links });
  }
  return { nodes, compressed };
}

function alternative(graph: Map<string, Node>, links: Link[]): Link[] | null {
  const excluded = new Set(links.map((link) => link.id));
  const start = links[0].from, end = links[links.length - 1].to;
  const frontier = [{ id: end, distance: 0, path: [] as Link[] }];
  const visited = new Set<string>();
  while (frontier.length) {
    frontier.sort((a, b) => b.distance - a.distance);
    const current = frontier.pop()!;
    if (visited.has(current.id)) continue;
    if (current.id === start) return current.path;
    visited.add(current.id);
    for (const next of graph.get(current.id)?.links ?? []) {
      if (excluded.has(next.id) || visited.has(next.to)) continue;
      frontier.push({ id: next.to, distance: current.distance + next.length, path: [...current.path, next] });
    }
  }
  return null;
}

function lane(circuit: Circuit, reversed: boolean, index: number, junctions: TrafficJunction[]): TrafficRoute {
  const centreline = reversed ? [...circuit.points].reverse() : [...circuit.points];
  // Keep comfortably inside the mapped asphalt, with a separate opposing lane.
  const offset = Math.min(3, circuit.width * PREVIEW.metresPerPixel * 0.25) * ppm;
  const shifted = centreline.map((p, i) => {
    const previous = centreline[(i + centreline.length - 1) % centreline.length];
    const next = centreline[(i + 1) % centreline.length];
    const aLength = separation(previous, p), bLength = separation(p, next);
    const ax = (p.x - previous.x) / aLength, ay = (p.y - previous.y) / aLength;
    const bx = (next.x - p.x) / bLength, by = (next.y - p.y) / bLength;
    const divisor = Math.max(0.35, 1 + ax * bx + ay * by);
    // Source y increases southward: (dy, -dx) is the physical left side.
    return { x: p.x + (ay + by) / divisor * offset, y: p.y - (ax + bx) / divisor * offset };
  });
  const corners = shifted.map((p, i) => {
    const previous = shifted[(i + shifted.length - 1) % shifted.length], next = shifted[(i + 1) % shifted.length];
    const trim = Math.min(3.5 * ppm, separation(previous, p) * 0.30, separation(p, next) * 0.30);
    return { p, entry: lerp(p, previous, trim / separation(previous, p)), exit: lerp(p, next, trim / separation(p, next)) };
  });
  const points: MapPoint[] = [];
  const append = (p: MapPoint) => { if (!points.length || separation(points[points.length - 1], p) > 0.05) points.push(p); };
  for (let i = 0; i < corners.length; i++) {
    const { p, entry, exit } = corners[i], previous = corners[(i + corners.length - 1) % corners.length].exit;
    const steps = Math.max(1, Math.ceil(separation(previous, entry) / (0.65 * ppm)));
    for (let step = 0; step < steps; step++) append(lerp(previous, entry, step / steps));
    const curveSteps = Math.max(3, Math.ceil((separation(entry, p) + separation(p, exit)) / (0.5 * ppm)));
    for (let step = 0; step < curveSteps; step++) {
      const t = step / curveSteps, s = 1 - t;
      append({ x: s * s * entry.x + 2 * s * t * p.x + t * t * exit.x, y: s * s * entry.y + 2 * s * t * p.y + t * t * exit.y });
    }
    append(exit);
  }
  let length = 0;
  const segments = points.map((a, i) => {
    const b = points[(i + 1) % points.length], start = length, distance = separation(a, b);
    length += distance;
    return { a, b, start, length: distance, heading: Math.atan2(b.x - a.x, -(b.y - a.y)) };
  });
  const crossings = junctions.flatMap((junction) => {
    if (!circuit.junctions.includes(junction.id)) return [];
    let nearest = Infinity, distance = 0;
    for (const segment of segments) {
      const dx = segment.b.x - segment.a.x, dy = segment.b.y - segment.a.y;
      const t = Math.max(0, Math.min(1, ((junction.position.x - segment.a.x) * dx + (junction.position.y - segment.a.y) * dy) / (segment.length ** 2)));
      const d = separation(junction.position, lerp(segment.a, segment.b, t));
      if (d < nearest) { nearest = d; distance = segment.start + segment.length * t; }
    }
    return [{ id: junction.id, distance }];
  });
  return { id: `mapped-circuit-${index}-${reversed ? "reverse" : "forward"}`, centreline, points, roads: circuit.roads, segments, length, junctions: crossings };
}

/** Two real closed road circuits; cars never reverse or teleport at an endpoint. */
export function createTrafficRoutes(): { routes: TrafficRoute[]; junctions: TrafficJunction[] } {
  const { nodes, compressed } = streetGraph();
  // Adjacent source nodes can describe one wide junction. Treat them as one
  // reservation so a car cannot hold one half while waiting for the other.
  const groups: { id: string; points: MapPoint[]; nodeIds: string[] }[] = [];
  for (const node of [...nodes.values()].filter((n) => n.links.length >= 3)) {
    const group = groups.find((g) => g.points.some((p) => separation(p, node.point) < 11 * ppm));
    if (group) { group.points.push(node.point); group.nodeIds.push(node.id); }
    else groups.push({ id: node.id, points: [node.point], nodeIds: [node.id] });
  }
  const junctionIds = new Map(groups.flatMap((group) => group.nodeIds.map((id) => [id, group.id] as const)));
  const junctions = groups.map((group) => ({ id: group.id, position: {
    x: group.points.reduce((sum, p) => sum + p.x, 0) / group.points.length,
    y: group.points.reduce((sum, p) => sum + p.y, 0) / group.points.length,
  } }));
  const candidates: Circuit[] = [];
  const seen = new Set<string>();
  for (const node of compressed.values()) for (const downberg of node.links) {
    if (downberg.road.name !== "Downberg Road") continue;
    const chains = [[downberg], ...(compressed.get(downberg.to)?.links ?? []).filter((link) => link.road.name === "Downberg Road" && link.to !== downberg.from).map((link) => [downberg, link])];
    for (const chain of chains) {
      const key = chain.map((link) => link.id).sort().join(";");
      if (seen.has(key)) continue;
      seen.add(key);
      const alternate = alternative(compressed, chain);
      if (!alternate) continue;
      const links = [...chain, ...alternate];
      const points = links.flatMap((link) => link.points.slice(0, -1));
      const length = links.reduce((sum, link) => sum + link.length, 0);
      if (length < 180 * ppm || length > 1200 * ppm || points.length < 4) continue;
      // A standing player and the first greeting need a safe centre refuge.
      // Cars pass straight through the spawn junction instead of cutting a
      // tight turn across that refuge; turns occur at other mapped junctions.
      if (points.some((p, i) => {
        if (separation(p, SPAWN) > 9 * ppm) return false;
        const a = points[(i + points.length - 1) % points.length], b = points[(i + 1) % points.length];
        return ((p.x - a.x) * (b.x - p.x) + (p.y - a.y) * (b.y - p.y)) / (separation(p, a) * separation(p, b)) < 0.96;
      })) continue;
      candidates.push({ points, length, roads: [...new Set(links.map((link) => link.road.name).filter((name): name is string => Boolean(name)))],
        width: Math.min(...links.map((link) => link.road.width)), junctions: [...new Set(points.map(pointKey).flatMap((id) => junctionIds.has(id) ? [junctionIds.get(id)!] : []))] });
    }
  }
  const proximity = (circuit: Circuit) => Math.min(...circuit.points.map((p) => separation(p, SPAWN)));
  candidates.sort((a, b) => proximity(a) - proximity(b) || a.length - b.length);
  const first = candidates[0];
  if (!first) throw new Error("Mapped streets do not contain an accessible traffic circuit.");
  const second = candidates.find((candidate) => candidate !== first && (candidate.length > 400 * ppm) !== (first.length > 400 * ppm) && proximity(candidate) < 110 * ppm) ?? candidates.find((candidate) => candidate !== first);
  const selected = second ? [first, second] : [first];
  return { routes: selected.flatMap((circuit, i) => [lane(circuit, false, i, junctions), lane(circuit, true, i, junctions)]), junctions };
}

export function routePose(route: TrafficRoute, distance: number): { position: MapPoint; heading: number } {
  const wrapped = ((distance % route.length) + route.length) % route.length;
  let lo = 0, hi = route.segments.length - 1;
  while (lo < hi) {
    const middle = Math.floor((lo + hi + 1) / 2);
    if (route.segments[middle].start <= wrapped) lo = middle; else hi = middle - 1;
  }
  const segment = route.segments[lo], t = (wrapped - segment.start) / segment.length;
  return { position: lerp(segment.a, segment.b, t), heading: segment.heading };
}
