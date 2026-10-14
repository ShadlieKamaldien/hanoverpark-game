import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";
import type { MapPoint } from "../game/world/mapData";
import { Collision, type Polygon } from "../game/systems/collision";
import { BUILDINGS, FIELDS, PREVIEW, SPAWN } from "./map";
import { PROPERTY_SOLIDS } from "./properties";
import { TrafficCar, type TrafficAppearance } from "./trafficCar";
import { createTrafficRoutes, routePose, type TrafficJunction, type TrafficRoute } from "./trafficRoutes";
import { polygonsOverlap } from "./vehicleGeometry";

export interface TrafficVehicle {
  id: string;
  position: MapPoint;
  /** World heading; zero faces north in the source map (+world z). */
  heading: number;
  speed: number;
  maxSpeed: number;
  distanceAlongRoute: number;
  metresTravelled: number;
  route: TrafficRoute;
  actor: TrafficCar;
}

interface Rectangle { position: MapPoint; heading: number; width: number; length: number }
const ppm = 1 / PREVIEW.metresPerPixel;
const BRAKING = 6;
const distance = (a: MapPoint, b: MapPoint) => Math.hypot(a.x - b.x, a.y - b.y) / ppm;

function footprint(rectangle: Rectangle, padding = 0): Polygon {
  const s = Math.sin(rectangle.heading), c = Math.cos(rectangle.heading);
  const w = (rectangle.width / 2 + padding) * ppm, l = (rectangle.length / 2 + padding) * ppm;
  return { points: [[-w, -l], [w, -l], [w, l], [-w, l]].map(([x, z]) => ({
    x: rectangle.position.x + c * x + s * z,
    y: rectangle.position.y + s * x - c * z,
  })) };
}

function overlaps(a: Rectangle, b: Rectangle, padding = 0.25) {
  const dx = (b.position.x - a.position.x) / ppm, dy = (b.position.y - a.position.y) / ppm;
  const aRight = { x: Math.cos(a.heading), y: Math.sin(a.heading) };
  const aForward = { x: Math.sin(a.heading), y: -Math.cos(a.heading) };
  const bRight = { x: Math.cos(b.heading), y: Math.sin(b.heading) };
  const bForward = { x: Math.sin(b.heading), y: -Math.cos(b.heading) };
  for (const axis of [aRight, aForward, bRight, bForward]) {
    const span = (r: Rectangle, right: MapPoint, forward: MapPoint) => Math.abs(axis.x * right.x + axis.y * right.y) * (r.width / 2 + padding / 2) +
      Math.abs(axis.x * forward.x + axis.y * forward.y) * (r.length / 2 + padding / 2);
    if (Math.abs(dx * axis.x + dy * axis.y) > span(a, aRight, aForward) + span(b, bRight, bForward)) return false;
  }
  return true;
}

function touchesPedestrian(rectangle: Rectangle, pedestrian: MapPoint, padding = 0.55) {
  const dx = (pedestrian.x - rectangle.position.x) / ppm, dy = (pedestrian.y - rectangle.position.y) / ppm;
  const side = dx * Math.cos(rectangle.heading) + dy * Math.sin(rectangle.heading);
  const ahead = dx * Math.sin(rectangle.heading) - dy * Math.cos(rectangle.heading);
  return Math.abs(side) < rectangle.width / 2 + padding && Math.abs(ahead) < rectangle.length / 2 + padding;
}

/** Quiet autonomous traffic, independent of the 2D mission and save systems. */
export class Traffic {
  readonly vehicles: TrafficVehicle[] = [];
  readonly shadowCasters: AbstractMesh[] = [];
  readonly solids: Polygon[] = [];
  readonly routes: TrafficRoute[];
  readonly junctions: TrafficJunction[];
  readonly stats: { vehicles: number; circuits: number; routes: number; routeMetres: number[]; streets: string[]; lane: "left" };
  private readonly collision = new Collision([], [
    ...BUILDINGS.map((b) => ({ points: b.points, holes: b.holes })),
    ...PROPERTY_SOLIDS,
    ...FIELDS.map((field) => ({ points: field.points, holes: field.holes })),
  ]);
  private readonly reservations = new Map<string, TrafficVehicle>();
  private readonly claimed = new Map<string, { id: string; distance: number }>();
  private disposed = false;

  constructor(scene: Scene) {
    const network = createTrafficRoutes();
    this.routes = network.routes;
    this.junctions = network.junctions;
    const colours = ["#b8b09c", "#406c7c", "#974f43", "#cbc2aa", "#596966", "#dfd9c5", "#68677e", "#87928b"];
    const kinds: TrafficAppearance["kind"][] = ["hatchback", "sedan", "sedan", "minibus", "hatchback", "minibus", "sedan", "hatchback"];
    for (let i = 0; i < 8; i++) {
      const route = this.routes[i % this.routes.length];
      const actor = new TrafficCar(scene, `neighbourhood-car-${i + 1}`, { kind: kinds[i], color: colours[i] });
      let closest = 0, nearest = Infinity;
      for (const segment of route.segments) {
        const d = distance(segment.a, SPAWN);
        if (d < nearest) { nearest = d; closest = segment.start; }
      }
      let progress = closest + (18 + i % this.routes.length * 13) * ppm + Math.floor(i / this.routes.length) * route.length / 2;
      let pose = routePose(route, progress);
      const rectangle = (): Rectangle => ({ ...pose, ...actor.dimensions });
      // The first visible vehicles are already on roads, with enough room for
      // the player, other cars and the nearby greeting encounter.
      for (let attempt = 0; attempt < Math.ceil(route.length / (5 * ppm)); attempt++) {
        if (!this.staticBlocked(rectangle()) && distance(pose.position, SPAWN) > 7 &&
          !this.vehicles.some((v) => overlaps(rectangle(), this.rectangle(v), 2))) break;
        progress += 5 * ppm;
        pose = routePose(route, progress);
      }
      if (this.staticBlocked(rectangle()) || this.vehicles.some((v) => overlaps(rectangle(), this.rectangle(v), 0.5))) {
        actor.dispose();
        throw new Error("No safe vehicle position on the mapped traffic circuit.");
      }
      const vehicle: TrafficVehicle = { id: `neighbourhood-car-${i + 1}`, position: { ...pose.position }, heading: pose.heading,
        speed: 3.5, maxSpeed: 6.2 + i % 5 * 0.5, distanceAlongRoute: progress % route.length, metresTravelled: 0, route, actor };
      this.vehicles.push(vehicle);
      this.shadowCasters.push(...actor.shadowCasters);
      this.solids.push(footprint(this.rectangle(vehicle)));
      actor.sync(vehicle.position, vehicle.heading, 0);
      actor.root.setEnabled(distance(vehicle.position, SPAWN) < 165);
    }
    this.stats = { vehicles: this.vehicles.length, circuits: this.routes.length / 2, routes: this.routes.length,
      routeMetres: this.routes.map((route) => route.length / ppm),
      streets: [...new Set(this.routes.flatMap((route) => route.roads))], lane: "left" };
  }

  update(dt: number, player: MapPoint, pedestrians: MapPoint[], frozen: boolean, obstacles: Polygon[] = []) {
    if (this.disposed || frozen) return;
    const elapsed = Math.min(0.1, Math.max(0, dt));
    if (!elapsed) return;
    const steps = Math.max(1, Math.ceil(elapsed / 0.025)), step = elapsed / steps;
    const people = [player, ...pedestrians];
    for (let substep = 0; substep < steps; substep++) {
      this.reserveJunctions();
      for (const vehicle of this.vehicles) {
        let target = vehicle.maxSpeed;
        const next = this.nextJunction(vehicle);
        if (next && next.remaining < 30 * ppm) {
          target = Math.min(target, 4.5);
          if (this.reservations.get(next.id) !== vehicle) {
            const junction = this.junctions.find((j) => j.id === next.id)!;
            // Different turning lanes have different arc-length markers.
            // Keep a common physical refuge around the junction as well, so
            // an awaiting car cannot block the current owner's exit lane.
            const clearance = Math.min(next.remaining / ppm - 12, distance(vehicle.position, junction.position) - 14);
            target = Math.min(target, Math.sqrt(2 * BRAKING * Math.max(0, clearance)));
          }
        }
        const clear = this.clearDistance(vehicle, people, obstacles);
        target = Math.min(target, Math.sqrt(2 * BRAKING * Math.max(0, clear - 1.1)));
        const acceleration = target > vehicle.speed ? 2.1 : BRAKING;
        const speed = vehicle.speed + Math.sign(target - vehicle.speed) * Math.min(Math.abs(target - vehicle.speed), acceleration * step);
        const travel = speed * step;
        const pose = routePose(vehicle.route, vehicle.distanceAlongRoute + travel * ppm);
        const proposed = { ...pose, ...vehicle.actor.dimensions };
        // This final conservative check uses short real-time substeps. Traffic
        // cannot push a pedestrian or pass through a stopped leading vehicle.
        if (this.staticBlocked(proposed) || people.some((p) => distance(pose.position, p) < 5 && touchesPedestrian(proposed, p, 0.5)) ||
          this.vehicles.some((other) => other !== vehicle && distance(other.position, pose.position) < 8 && overlaps(proposed, this.rectangle(other), 0.3)) ||
          obstacles.some((solid) => polygonsOverlap(footprint(proposed, 0.2), solid))) {
          vehicle.speed = 0;
          continue;
        }
        vehicle.speed = speed;
        vehicle.distanceAlongRoute = (vehicle.distanceAlongRoute + travel * ppm) % vehicle.route.length;
        vehicle.metresTravelled += travel;
        vehicle.position.x = pose.position.x;
        vehicle.position.y = pose.position.y;
        vehicle.heading = pose.heading;
      }
    }
    for (let i = 0; i < this.vehicles.length; i++) {
      const vehicle = this.vehicles[i];
      const visible = distance(vehicle.position, player) < 165;
      vehicle.actor.root.setEnabled(visible);
      // Source pose stays current for collision and minimap, even when culled.
      vehicle.actor.sync(vehicle.position, vehicle.heading, vehicle.metresTravelled);
      this.solids[i].points = footprint(this.rectangle(vehicle)).points;
    }
  }

  setLighting(preset: "day" | "sunset" | "night") {
    for (const vehicle of this.vehicles) vehicle.actor.setLighting(preset);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const vehicle of this.vehicles) vehicle.actor.dispose();
    this.reservations.clear();
    this.claimed.clear();
    this.solids.length = 0;
  }

  private rectangle(vehicle: TrafficVehicle): Rectangle {
    return { position: vehicle.position, heading: vehicle.heading, ...vehicle.actor.dimensions };
  }

  private staticBlocked(rectangle: Rectangle) {
    const bounds = PREVIEW.bounds;
    const radius = (rectangle.width / 2 + 0.08) * ppm;
    const half = rectangle.length / 2;
    // A short series of overlapping circles conservatively covers the body,
    // including corners, without relying on render-mesh collision.
    const count = Math.ceil(rectangle.length / 0.5);
    for (let i = 0; i <= count; i++) {
      const along = -half + rectangle.length * i / count;
      const x = rectangle.position.x + Math.sin(rectangle.heading) * along * ppm;
      const y = rectangle.position.y - Math.cos(rectangle.heading) * along * ppm;
      if (x - radius < bounds.minX || x + radius > bounds.maxX || y - radius < bounds.minY || y + radius > bounds.maxY || this.collision.blocked(x, y, radius)) return true;
    }
    return false;
  }

  private nextJunction(vehicle: TrafficVehicle) {
    let next: { id: string; remaining: number; distance: number } | null = null;
    for (const junction of vehicle.route.junctions) {
      const remaining = (junction.distance - vehicle.distanceAlongRoute + vehicle.route.length) % vehicle.route.length;
      if (!next || remaining < next.remaining) next = { ...junction, remaining };
    }
    return next;
  }

  private reserveJunctions() {
    for (const [id, owner] of this.reservations) {
      const claim = this.claimed.get(owner.id)!;
      const remaining = (claim.distance - owner.distanceAlongRoute + owner.route.length) % owner.route.length;
      const junction = this.junctions.find((j) => j.id === id)!;
      // Keep ownership until the complete car has cleared the junction.
      if (remaining > owner.route.length / 2 && distance(owner.position, junction.position) > 12) {
        this.reservations.delete(id);
        this.claimed.delete(owner.id);
      }
    }
    const requests = this.vehicles.flatMap((vehicle) => {
      const next = this.nextJunction(vehicle);
      return next && next.remaining < 30 * ppm && !this.claimed.has(vehicle.id) ? [{ vehicle, ...next }] : [];
    });
    // Compare the same physical junction centre, rather than lane arc
    // distances: a turning route's closest marker can be several metres
    // beyond a straight route's marker, which would grant a follower priority
    // over the leading car and leave both waiting.
    requests.sort((a, b) => {
      const aPosition = this.junctions.find((j) => j.id === a.id)!.position;
      const bPosition = this.junctions.find((j) => j.id === b.id)!.position;
      return distance(a.vehicle.position, aPosition) - distance(b.vehicle.position, bPosition) || a.vehicle.id.localeCompare(b.vehicle.id);
    });
    for (const request of requests) {
      if (this.reservations.has(request.id)) continue;
      // Never grant a crossing occupied by a car approaching from another
      // route. The nearest request wins, then clears before the next arrives.
      const junction = this.junctions.find((j) => j.id === request.id)!;
      if (this.vehicles.some((other) => other !== request.vehicle && distance(other.position, junction.position) < 6 &&
        !this.claimed.has(other.id))) continue;
      this.reservations.set(request.id, request.vehicle);
      this.claimed.set(request.vehicle.id, { id: request.id, distance: request.distance });
    }
  }

  private clearDistance(vehicle: TrafficVehicle, people: MapPoint[], obstacles: Polygon[]) {
    const look = Math.max(12, vehicle.speed ** 2 / (2 * BRAKING) + 7);
    const nearbyPeople = people.filter((p) => distance(p, vehicle.position) < look + vehicle.actor.dimensions.length);
    const nearbyCars = this.vehicles.filter((other) => other !== vehicle && distance(other.position, vehicle.position) < look + 7);
    const reach = (look + vehicle.actor.dimensions.length) * ppm;
    const nearbyObstacles = obstacles.filter((solid) =>
      Math.min(...solid.points.map((p) => p.x)) <= vehicle.position.x + reach &&
      Math.max(...solid.points.map((p) => p.x)) >= vehicle.position.x - reach &&
      Math.min(...solid.points.map((p) => p.y)) <= vehicle.position.y + reach &&
      Math.max(...solid.points.map((p) => p.y)) >= vehicle.position.y - reach);
    if (!nearbyPeople.length && !nearbyCars.length && !nearbyObstacles.length) return look;
    for (let ahead = 0; ahead <= look; ahead += 0.7) {
      const pose = routePose(vehicle.route, vehicle.distanceAlongRoute + ahead * ppm);
      const rectangle = { ...pose, ...vehicle.actor.dimensions };
      if (nearbyPeople.some((p) => touchesPedestrian(rectangle, p, 0.55)) || nearbyCars.some((other) => overlaps(rectangle, this.rectangle(other), 0.75)) ||
        nearbyObstacles.some((solid) => polygonsOverlap(footprint(rectangle, 0.38), solid))) return Math.max(0, ahead - 0.7);
    }
    return look;
  }
}
