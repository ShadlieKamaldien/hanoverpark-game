import type { Collision, Point } from "./collision";
import { MAP } from "../world/mapData";

export type EncounterKind = "request" | "robber";
export type RobberyPhase = "demand" | "chase";

/** These adults and their stories are fictional; no mapped business is involved. */
export interface EncounterActor extends Point {
  id: string;
  name: string;
  kind: EncounterKind;
  home: Point;
  street: string;
  dialogue: string;
  texture: "walker0" | "walker1" | "walker2" | "robber-navy" | "robber-rust";
  resolved: boolean;
}

export interface EncounterSnapshot {
  version: 1;
  settled: string[];
  cooldown: number;
  active?: {
    id: string;
    phase: RobberyPhase;
    x: number;
    y: number;
    elapsed: number;
  };
}

export type EncounterEvent =
  | { caught: { lostCap: number; actorId: string }; actorId: string }
  | { escaped: true; actorId: string };

const ROBBERY_CAP = 20;
const ROBBERY_COOLDOWN = 20;
const CHASE_SPEED = 105;
const CHASE_LIMIT = 10;
const ESCAPE_DISTANCE = 260;
const BODY_RADIUS = 10;

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function segmentDistance(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared
    ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared))
    : 0;
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}

function inSuburb(point: Point) {
  let inside = false;
  const boundary = MAP.boundary;
  for (let i = 0, j = boundary.length - 1; i < boundary.length; j = i++) {
    const a = boundary[i];
    const b = boundary[j];
    if ((a.y > point.y) !== (b.y > point.y) &&
      point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}

function routeDistance(point: Point) {
  let nearest = Infinity;
  for (let i = 1; i < MAP.deliveryPath.length; i++)
    nearest = Math.min(nearest, segmentDistance(point, MAP.deliveryPath[i - 1], MAP.deliveryPath[i]));
  return nearest;
}

function balance(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export class EncounterSystem {
  readonly actors: EncounterActor[];
  private cooldown = 0;
  private current: { actor: EncounterActor; phase: RobberyPhase; elapsed: number } | null = null;

  constructor(private readonly collision: Collision) {
    const locations = MAP.locations;
    const reserved: Point[] = [
      locations.spawn, locations.car, locations.fatima, locations.gatie,
      locations.jerome, locations.target, locations.pitch, locations.taxi, locations.shop,
    ];
    const candidates: Array<Point & { street: string; key: string }> = [];
    const seen = new Set<string>();
    for (const road of MAP.roads) {
      if (!["residential", "living_street", "service", "footway", "path", "pedestrian"].includes(road.kind)) continue;
      for (const [i, point] of road.points.entries()) {
        const coordinateKey = `${point.x},${point.y}`;
        if (seen.has(coordinateKey)) continue;
        seen.add(coordinateKey);
        if (!inSuburb(point) || collision.blocked(point.x, point.y, 14) ||
          reserved.some(anchor => distance(anchor, point) < 160) || routeDistance(point) < 180) continue;
        candidates.push({ ...point, street: road.name ?? "Neighbourhood walk", key: `${road.id}:${i}` });
      }
    }

    const profiles: Array<Omit<EncounterActor, "x" | "y" | "home" | "street" | "resolved"> & { seed: Point }> = [
      {
        id: "shaun-r2", name: "Shaun", kind: "request", texture: "walker0",
        seed: { x: locations.spawn.x - 320, y: locations.spawn.y - 300 },
        dialogue: "Awe, my bru. Ek sukkel met tik, maar ek probeer hulp kry. Het jy miskien 'n R2 vir my? Dis reg as jy nie kan nie.",
      },
      {
        id: "rico-r2", name: "Rico", kind: "request", texture: "walker2",
        seed: { x: locations.pitch.x + 850, y: locations.pitch.y + 400 },
        dialogue: "Howzit, my bru. Ek's kort 'n R2 vandag. Kan jy help? As jy nie het nie, sharp — hou mooi.",
      },
      {
        id: "navy-stranger", name: "Stranger in a navy top", kind: "robber", texture: "robber-navy",
        seed: { x: locations.target.x + 350, y: locations.target.y + 650 },
        dialogue: "Hosh. Staan stil, my bru. Gee hier die cash. Moenie probeer wegkom nie — ek gaan agter jou aan.",
      },
      {
        id: "rust-stranger", name: "Stranger in a rust top", kind: "robber", texture: "robber-rust",
        seed: { x: locations.target.x - 700, y: locations.target.y + 800 },
        dialogue: "Awe, wag gou daar. Haal die cash uit, my bru. Gee wat jy het, dan laat ek jou loop.",
      },
    ];

    const picked: Point[] = [];
    this.actors = profiles.map(({ seed, ...profile }) => {
      const spot = candidates
        .filter(point => picked.every(other => distance(point, other) >= 300))
        .sort((a, b) => distance(a, seed) - distance(b, seed) || a.key.localeCompare(b.key))[0];
      if (!spot) throw new Error("No clear mapped road position for a fictional encounter.");
      picked.push(spot);
      const home = { x: spot.x, y: spot.y };
      return { ...profile, ...home, home, street: spot.street, resolved: false };
    });
  }

  get active() {
    return this.current?.actor ?? null;
  }

  get phase(): RobberyPhase | null {
    return this.current?.phase ?? null;
  }

  private visible(a: Point, b: Point) {
    const steps = Math.max(1, Math.ceil(distance(a, b) / 10));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (this.collision.blocked(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, BODY_RADIUS)) return false;
    }
    return true;
  }

  private nearest(kind: EncounterKind, player: Point, radius: number) {
    if (this.current || !Number.isFinite(radius) || radius < 0) return null;
    let nearest: EncounterActor | null = null;
    let range = radius;
    for (const actor of this.actors) {
      if (actor.kind !== kind || actor.resolved) continue;
      const separation = distance(actor, player);
      if (separation <= range && this.visible(player, actor)) {
        nearest = actor;
        range = separation;
      }
    }
    return nearest;
  }

  nearestRequest(player: Point, maxDistance = 70) {
    return this.nearest("request", player, maxDistance);
  }

  nearbyRobber(player: Point, radius = 100) {
    return this.cooldown > 0 ? null : this.nearest("robber", player, radius);
  }

  beginRobbery(actorId: string) {
    const actor = this.actors.find(candidate => candidate.id === actorId);
    if (this.current || this.cooldown > 0 || !actor || actor.kind !== "robber" || actor.resolved) return false;
    this.current = { actor, phase: "demand", elapsed: 0 };
    return true;
  }

  giveR2(actorId: string, money: number) {
    const funds = balance(money);
    const actor = this.actors.find(candidate => candidate.id === actorId);
    if (this.current || !actor || actor.kind !== "request" || actor.resolved || funds < 2)
      return { money: funds, paid: false };
    actor.resolved = true;
    return { money: funds - 2, paid: true };
  }

  refuse(actorId: string) {
    const actor = this.actors.find(candidate => candidate.id === actorId);
    if (this.current || !actor || actor.kind !== "request" || actor.resolved) return false;
    actor.resolved = true;
    return true;
  }

  private settleRobbery() {
    const actor = this.current!.actor;
    actor.resolved = true;
    this.current = null;
    this.cooldown = ROBBERY_COOLDOWN;
    return actor.id;
  }

  surrender(actorId: string, money: number) {
    const funds = balance(money);
    if (!this.current || this.current.actor.id !== actorId || this.current.phase !== "demand")
      return { money: funds, lost: 0 };
    const lost = Math.min(ROBBERY_CAP, funds);
    this.settleRobbery();
    return { money: funds - lost, lost };
  }

  run() {
    if (!this.current || this.current.phase !== "demand") return false;
    this.current.phase = "chase";
    this.current.elapsed = 0;
    return true;
  }

  dismissDialog() {
    return this.run();
  }

  /** dt is simulation seconds; the scene stops calling update while paused. */
  update(dt: number, player: Point, driving: boolean): EncounterEvent | null {
    if (!Number.isFinite(dt) || dt < 0 || !Number.isFinite(player.x) || !Number.isFinite(player.y)) return null;
    this.cooldown = Math.max(0, this.cooldown - dt);
    const active = this.current;
    if (!active) return null;
    if (driving || distance(active.actor, player) > ESCAPE_DISTANCE) {
      return { escaped: true, actorId: this.settleRobbery() };
    }
    if (active.phase !== "chase") return null;
    active.elapsed += dt;
    if (active.elapsed >= CHASE_LIMIT) return { escaped: true, actorId: this.settleRobbery() };

    const separation = distance(active.actor, player);
    if (separation > 0) {
      const step = Math.min(separation, CHASE_SPEED * dt);
      this.collision.move(active.actor,
        (player.x - active.actor.x) / separation * step,
        (player.y - active.actor.y) / separation * step, BODY_RADIUS);
    }
    if (active.elapsed >= 0.8 && distance(active.actor, player) <= 20 && this.visible(active.actor, player)) {
      const actorId = this.settleRobbery();
      return { caught: { lostCap: ROBBERY_CAP, actorId }, actorId };
    }
    return null;
  }

  snapshot(): EncounterSnapshot {
    const active = this.current;
    return {
      version: 1,
      settled: this.actors.filter(actor => actor.resolved).map(actor => actor.id),
      cooldown: this.cooldown,
      ...(active ? { active: {
        id: active.actor.id, phase: active.phase,
        x: active.actor.x, y: active.actor.y, elapsed: active.elapsed,
      } } : {}),
    };
  }

  restore(value: unknown) {
    this.current = null;
    this.cooldown = 0;
    for (const actor of this.actors) {
      actor.resolved = false;
      actor.x = actor.home.x;
      actor.y = actor.home.y;
    }
    if (!value || typeof value !== "object") return;
    const snapshot = value as Record<string, unknown>;
    if (snapshot.version !== 1) return;
    if (Array.isArray(snapshot.settled)) {
      const ids = new Set(snapshot.settled.filter((id): id is string => typeof id === "string"));
      for (const actor of this.actors) actor.resolved = ids.has(actor.id);
    }
    if (typeof snapshot.cooldown === "number" && Number.isFinite(snapshot.cooldown) &&
      snapshot.cooldown >= 0 && snapshot.cooldown <= ROBBERY_COOLDOWN)
      this.cooldown = snapshot.cooldown;
    if (!snapshot.active || typeof snapshot.active !== "object") return;
    const active = snapshot.active as Record<string, unknown>;
    const actor = this.actors.find(candidate => candidate.id === active.id);
    if (!actor || actor.kind !== "robber" || actor.resolved ||
      (active.phase !== "demand" && active.phase !== "chase") ||
      typeof active.x !== "number" || !Number.isFinite(active.x) ||
      typeof active.y !== "number" || !Number.isFinite(active.y) ||
      typeof active.elapsed !== "number" || !Number.isFinite(active.elapsed) ||
      active.elapsed < 0 || active.elapsed > CHASE_LIMIT ||
      distance(actor.home, { x: active.x, y: active.y }) > CHASE_SPEED * CHASE_LIMIT + BODY_RADIUS ||
      this.collision.blocked(active.x, active.y, BODY_RADIUS)) return;
    actor.x = active.x;
    actor.y = active.y;
    this.current = { actor, phase: active.phase, elapsed: active.elapsed };
  }
}
