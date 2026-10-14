import type { Scene } from "@babylonjs/core/scene";
import { Collision, type Polygon } from "../game/systems/collision";
import type { MapPoint } from "../game/world/mapData";
import { BUILDINGS, FIELDS, PREVIEW, ROADS, SPAWN } from "./map";
import { PROPERTY_SOLIDS } from "./properties";
import { TrafficCar } from "./trafficCar";
import { pointTouchesVehicle, polygonsOverlap, vehicleFootprint, vehiclePoint, type VehiclePose } from "./vehicleGeometry";

const ppm = 1 / PREVIEW.metresPerPixel;
const PERSON_RADIUS = 0.4;
export const DRIVEABLE_LIMITS = { forwardSpeed: 14, reverseSpeed: 4, exitSpeed: 0.6, doorReach: 1.45 } as const;
type BoundedPolygon = { polygon: Polygon; minX: number; maxX: number; minY: number; maxY: number };
const staticPolygons = [
  ...BUILDINGS.map((building) => ({ points: building.points, holes: building.holes })),
  ...PROPERTY_SOLIDS,
  ...FIELDS.map((field) => ({ points: field.points, holes: field.holes })),
];
const boundedPolygons: BoundedPolygon[] = staticPolygons.map((polygon) => ({ polygon,
  minX: Math.min(...polygon.points.map((point) => point.x)), maxX: Math.max(...polygon.points.map((point) => point.x)),
  minY: Math.min(...polygon.points.map((point) => point.y)), maxY: Math.max(...polygon.points.map((point) => point.y)),
}));
const personCollision = new Collision([], staticPolygons);
const distance = (a: MapPoint, b: MapPoint) => Math.hypot(a.x - b.x, a.y - b.y) / ppm;

function withinPreview(point: MapPoint, radius = 0) {
  const bounds = PREVIEW.bounds, padding = radius * ppm;
  return point.x > bounds.minX + padding && point.x < bounds.maxX - padding &&
    point.y > bounds.minY + padding && point.y < bounds.maxY - padding;
}

function staticBlocked(pose: VehiclePose) {
  const footprint = vehicleFootprint(pose, 0.04);
  if (!footprint.points.every((point) => withinPreview(point))) return true;
  const minX = Math.min(...footprint.points.map((p) => p.x)), maxX = Math.max(...footprint.points.map((p) => p.x));
  const minY = Math.min(...footprint.points.map((p) => p.y)), maxY = Math.max(...footprint.points.map((p) => p.y));
  return boundedPolygons.some((shape) => !(maxX < shape.minX || minX > shape.maxX || maxY < shape.minY || minY > shape.maxY) &&
    polygonsOverlap(footprint, shape.polygon));
}

function clearPerson(point: MapPoint, dynamic: Collision) {
  return withinPreview(point, PERSON_RADIUS) && !personCollision.blocked(point.x, point.y, PERSON_RADIUS * ppm) &&
    !dynamic.blocked(point.x, point.y, PERSON_RADIUS * ppm);
}

function clearPersonLine(a: MapPoint, b: MapPoint, dynamic: Collision) {
  const steps = Math.max(1, Math.ceil(distance(a, b) / 0.18));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!clearPerson({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, dynamic)) return false;
  }
  return true;
}

function clearOfPedestrians(a: MapPoint, b: MapPoint, pedestrians: MapPoint[], clearance: number) {
  const dx = b.x - a.x, dy = b.y - a.y, lengthSquared = dx * dx + dy * dy;
  return pedestrians.every((point) => {
    const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared)) : 0;
    return distance(point, { x: a.x + dx * t, y: a.y + dy * t }) >= clearance;
  });
}

/** Find a reachable gravel verge beside Downberg, beyond its rendered pavement. */
function parkedPose(dimensions: { width: number; length: number }) {
  const candidates: { pose: VehiclePose; priority: number }[] = [];
  const roadStrips = ROADS.flatMap((road) => road.points.slice(1).map((b, i) => {
    const a = road.points[i], length = distance(a, b);
    const walk = ["footway", "path", "steps", "pedestrian", "cycleway"].includes(road.kind);
    return vehicleFootprint({ position: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      heading: Math.atan2(b.x - a.x, -(b.y - a.y)), width: road.width / ppm + (walk ? 0.5 : 2.7), length }, 0.15);
  }));
  for (const road of ROADS.filter((r) => r.name === "Downberg Road")) for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1], b = road.points[i], length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 4 * ppm) continue;
    const tx = (b.x - a.x) / length, ty = (b.y - a.y) / length;
    const projection = Math.max(0, Math.min(length, (SPAWN.x - a.x) * tx + (SPAWN.y - a.y) * ty));
    for (let along = Math.max(dimensions.length * ppm, projection - 30 * ppm);
      along <= Math.min(length - dimensions.length * ppm, projection + 30 * ppm); along += 1.5 * ppm) {
      for (const side of [-1, 1]) for (const extra of [0, 1, 2.5]) {
        const offset = road.width / 2 + (1.35 + dimensions.width / 2 + 0.3 + extra) * ppm;
        const position = { x: a.x + tx * along + ty * side * offset, y: a.y + ty * along - tx * side * offset };
        if (distance(position, SPAWN) > 40) continue;
        // Point the bonnet along the street; reverse the far-side parked car so
        // the driver can reach the pavement without circling through the road.
        const heading = Math.atan2(tx * side, -ty * side);
        const pose = { position, heading, ...dimensions };
        const footprint = vehicleFootprint(pose, 0.08);
        if (staticBlocked(pose) || roadStrips.some((strip) => polygonsOverlap(footprint, strip))) continue;
        const dynamic = new Collision([], [vehicleFootprint(pose)]);
        const doors = [-1, 1].map((s) => vehiclePoint(pose, s * (dimensions.width / 2 + 0.6), 0.2));
        if (!doors.some((door) => clearPersonLine(SPAWN, door, dynamic))) continue;
        candidates.push({ pose, priority: distance(position, SPAWN) + extra * 0.1 });
      }
    }
  }
  candidates.sort((a, b) => a.priority - b.priority);
  if (!candidates.length) throw new Error("No clear, reachable Downberg parking place in this preview.");
  return candidates[0].pose;
}

/** One original player car; all distances and limits below are real metres. */
export class DriveableCar {
  readonly actor: TrafficCar;
  readonly position: MapPoint;
  readonly shadowCasters;
  heading: number;
  speed = 0;
  steering = 0;
  metresTravelled = 0;
  exitMessage = "";
  private occupiedState = false;
  private disposed = false;
  private lastTraffic: Polygon[] = [];
  private lastPedestrians: MapPoint[] = [];

  constructor(scene: Scene) {
    this.actor = new TrafficCar(scene, "player-hatchback", { kind: "hatchback", color: "#bd984f" },
      { driver: false, steerable: true });
    const parked = parkedPose(this.actor.dimensions);
    this.position = { ...parked.position };
    this.heading = parked.heading;
    this.shadowCasters = this.actor.shadowCasters;
    this.actor.sync(this.position, this.heading, 0);
  }

  get occupied() { return this.occupiedState; }
  get solid(): Polygon { return vehicleFootprint(this.pose()); }

  canEnter(playerPosition: MapPoint) {
    if (this.disposed || this.occupiedState || Math.abs(this.speed) > DRIVEABLE_LIMITS.exitSpeed || staticBlocked(this.pose())) return false;
    const dynamic = new Collision([], [this.solid, ...this.lastTraffic]);
    return this.doorPoints().some((door) => distance(playerPosition, door) <= DRIVEABLE_LIMITS.doorReach &&
      clearOfPedestrians(playerPosition, door, this.lastPedestrians, 0.8) && clearPersonLine(playerPosition, door, dynamic));
  }

  enter(playerPosition: MapPoint) {
    if (!this.canEnter(playerPosition)) return false;
    this.occupiedState = true;
    this.speed = 0;
    this.exitMessage = "";
    return true;
  }

  exit(trafficSolids: Polygon[], pedestrians: MapPoint[]): MapPoint | null {
    if (this.disposed || !this.occupiedState) return null;
    if (Math.abs(this.speed) > DRIVEABLE_LIMITS.exitSpeed) {
      this.exitMessage = "Stop the car before getting out.";
      return null;
    }
    const dynamic = new Collision([], [this.solid, ...trafficSolids]);
    // Right-hand driver first, then the opposite door. A short connected path
    // begins just beyond the body; it never jumps through a wall or another car.
    for (const side of [1, -1]) {
      const doorway = vehiclePoint(this.pose(), side * (this.actor.dimensions.width / 2 + PERSON_RADIUS + 0.05), 0.2);
      for (const extra of [0.15, 0.5, 0.9]) {
        const point = vehiclePoint(this.pose(), side * (this.actor.dimensions.width / 2 + PERSON_RADIUS + 0.05 + extra), 0.2);
        if (clearPersonLine(doorway, point, dynamic) && clearOfPedestrians(doorway, point, pedestrians, 0.85)) {
          this.occupiedState = false;
          this.speed = 0;
          this.steering = 0;
          this.exitMessage = "";
          this.actor.sync(this.position, this.heading, this.metresTravelled, false, 0);
          return point;
        }
      }
    }
    this.exitMessage = "Both doors are blocked. Move to a clear spot.";
    return null;
  }

  update(dt: number, keys: Set<string>, trafficSolids: Polygon[], pedestrians: MapPoint[], frozen: boolean) {
    if (this.disposed) return;
    this.lastTraffic = trafficSolids;
    this.lastPedestrians = pedestrians;
    if (frozen || !this.occupiedState) return;
    const elapsed = Math.min(Math.max(dt, 0), 0.1);
    if (!Number.isFinite(elapsed) || elapsed === 0) return;
    const accelerating = keys.has("KeyW") || keys.has("ArrowUp");
    const reversing = keys.has("KeyS") || keys.has("ArrowDown");
    const hardBrake = keys.has("Space");
    const steerInput = Number(keys.has("KeyD") || keys.has("ArrowRight")) - Number(keys.has("KeyA") || keys.has("ArrowLeft"));
    const oldPosition = { ...this.position };
    const maxSteering = 0.58 / (1 + Math.abs(this.speed) / 14);
    const targetSteering = steerInput * maxSteering;
    this.steering += Math.max(-2.4 * elapsed, Math.min(2.4 * elapsed, targetSteering - this.steering));
    // Small time and distance steps bound the swept corner motion, including
    // the rotation of the full body through thin property walls.
    const steps = Math.max(1, Math.ceil(elapsed / 0.01), Math.ceil(Math.abs(this.speed) * elapsed / 0.08));
    const stepTime = elapsed / steps;
    for (let i = 0; i < steps; i++) {
      if (hardBrake || accelerating && reversing) this.speed = this.approach(this.speed, 0, (hardBrake ? 12 : 8) * stepTime);
      else if (accelerating) this.speed = this.speed < 0 ? this.approach(this.speed, 0, 8 * stepTime) : Math.min(14, this.speed + 4.4 * stepTime);
      else if (reversing) this.speed = this.speed > 0 ? this.approach(this.speed, 0, 8 * stepTime) : Math.max(-4, this.speed - 2.8 * stepTime);
      else this.speed = this.approach(this.speed, 0, 1.3 * stepTime);
      if (Math.abs(this.speed) < 0.0001) { this.speed = 0; continue; }
      const travelled = this.speed * stepTime;
      const turn = travelled / 2.35 * Math.tan(this.steering);
      const middle = this.heading + turn / 2;
      const position = { x: this.position.x + Math.sin(middle) * travelled * ppm,
        y: this.position.y - Math.cos(middle) * travelled * ppm };
      const proposed = { position, heading: this.heading + turn, ...this.actor.dimensions };
      const body = vehicleFootprint(proposed, 0.12);
      if (staticBlocked(proposed) || trafficSolids.some((polygon) => polygonsOverlap(body, polygon)) ||
        pedestrians.some((point) => pointTouchesVehicle(proposed, point, 0.5))) {
        this.speed = 0;
        break;
      }
      this.position.x = position.x;
      this.position.y = position.y;
      this.heading = Math.atan2(Math.sin(proposed.heading), Math.cos(proposed.heading));
      this.metresTravelled += travelled;
    }
    this.actor.sync(this.position, this.heading, this.metresTravelled, false, this.steering);
    if (this.exitMessage === "Stop the car before getting out." && Math.abs(this.speed) <= DRIVEABLE_LIMITS.exitSpeed ||
      this.exitMessage === "Both doors are blocked. Move to a clear spot." && distance(oldPosition, this.position) > 0.05) this.exitMessage = "";
  }

  setLighting(preset: "day" | "sunset" | "night") { this.actor.setLighting(preset); }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.actor.dispose();
  }

  private pose(): VehiclePose { return { position: this.position, heading: this.heading, ...this.actor.dimensions }; }
  private doorPoints() {
    return [1, -1].map((side) => vehiclePoint(this.pose(), side * (this.actor.dimensions.width / 2 + 0.6), 0.2));
  }
  private approach(value: number, target: number, amount: number) {
    return value < target ? Math.min(target, value + amount) : Math.max(target, value - amount);
  }
}
