import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Collision, type Polygon } from "../game/systems/collision";
import { BUILDINGS, PREVIEW, SPAWN, toWorld } from "./map";
import type { MapPoint } from "../game/world/mapData";
import { PROPERTY_SOLIDS } from "./properties";
import { CharacterRig } from "./characterRig";

const BODY_RADIUS = 3.2;
const SOURCE_PIXELS_PER_METRE = 8;
const WALK_SPEED = 4;
const SPRINT_SPEED = 7;

/** Independent preview actor; source map pixels keep the original wall collision. */
export class PreviewPlayer {
  readonly mesh: TransformNode;
  readonly position = { x: SPAWN.x, y: SPAWN.y };
  readonly shadowCasters: Mesh[] = [];
  readonly rig: CharacterRig;
  private readonly collision = new Collision(
    [],
    [...BUILDINGS.map((building) => ({
      points: building.points,
      holes: building.holes,
    })), ...PROPERTY_SOLIDS],
  );
  private trafficCollision = new Collision([]);
  private vehicleOccupied = false;

  get inVehicle() { return this.vehicleOccupied; }

  /** Keep map position at the car centre while rendering the right-hand driver. */
  ride(position: MapPoint, heading: number) {
    this.vehicleOccupied = true;
    Object.assign(this.position, position);
    const c = Math.cos(heading), s = Math.sin(heading);
    this.mesh.position.copyFrom(toWorld(position));
    this.mesh.position.x += c * 0.4 + s * 0.08;
    this.mesh.position.z += -s * 0.4 + c * 0.08;
    this.mesh.position.y = -0.32;
    this.mesh.rotation.set(0, heading, 0);
    this.rig.seat();
  }

  leaveVehicle(position: MapPoint) {
    this.vehicleOccupied = false;
    Object.assign(this.position, position);
    this.mesh.position.copyFrom(toWorld(position));
    this.rig.reset();
  }

  setTrafficSolids(polygons: Polygon[]) {
    this.trafficCollision = new Collision([], polygons);
  }

  setCrewColour(colour: string | null) {
    this.rig.setShirtColour(colour ?? "#d2a44c");
  }

  constructor(scene: Scene) {
    this.mesh = new TransformNode("preview-player", scene);
    this.rig = new CharacterRig(scene, this.mesh);
    this.shadowCasters.push(this.rig.mesh);
    this.reset();
  }

  /** Animate the conversation pose without moving or accepting held keys. */
  converse(dt: number) {
    if (this.vehicleOccupied) return;
    this.rig.update(dt, 0, false, "talk");
    this.mesh.position.copyFrom(toWorld(this.position));
  }

  update(
    dt: number,
    keys: Set<string>,
    forward: { x: number; z: number } = { x: 0, z: 1 },
  ) {
    if (this.vehicleOccupied) return;
    const elapsed = Math.min(Math.max(dt, 0), 0.1);
    let dx = Number(keys.has("KeyD") || keys.has("ArrowRight")) -
      Number(keys.has("KeyA") || keys.has("ArrowLeft"));
    let dy = Number(keys.has("KeyS") || keys.has("ArrowDown")) -
      Number(keys.has("KeyW") || keys.has("ArrowUp"));
    // Camera-facing movement stays intuitive after orbiting around the actor.
    const forwardLength = Math.hypot(forward.x, forward.z);
    const forwardX = forwardLength > 0.0001 ? forward.x / forwardLength : 0;
    const forwardZ = forwardLength > 0.0001 ? forward.z / forwardLength : 1;
    const inputX = dx;
    const inputY = dy;
    dx = inputX * forwardZ - inputY * forwardX;
    dy = inputX * forwardX + inputY * forwardZ;
    const length = Math.hypot(dx, dy);
    const sprinting = keys.has("ShiftLeft") || keys.has("ShiftRight");
    const oldX = this.position.x;
    const oldY = this.position.y;
    if (length > 0) {
      const distance = (sprinting ? SPRINT_SPEED : WALK_SPEED) *
        SOURCE_PIXELS_PER_METRE * elapsed;
      dx = dx / length * distance;
      dy = dy / length * distance;
      // Smaller than the body radius: even a thin source polygon cannot be skipped.
      const steps = Math.max(1, Math.ceil(distance / (BODY_RADIUS / 2)));
      for (let i = 0; i < steps; i++) {
        const oldX = this.position.x;
        this.collision.move(this.position, dx / steps, 0, BODY_RADIUS);
        if (this.trafficCollision.blocked(this.position.x, this.position.y, BODY_RADIUS)) this.position.x = oldX;
        const oldY = this.position.y;
        this.collision.move(this.position, 0, dy / steps, BODY_RADIUS);
        if (this.trafficCollision.blocked(this.position.x, this.position.y, BODY_RADIUS)) this.position.y = oldY;
        this.clampToPreview();
      }
    }
    const actualX = this.position.x - oldX;
    const actualY = this.position.y - oldY;
    const travelled = Math.hypot(actualX, actualY) / SOURCE_PIXELS_PER_METRE;
    if (travelled > 0.0001) {
      const facing = Math.atan2(actualX, -actualY);
      const turn = Math.atan2(
        Math.sin(facing - this.mesh.rotation.y),
        Math.cos(facing - this.mesh.rotation.y),
      );
      this.mesh.rotation.y += turn * Math.min(1, elapsed * 14);
    }
    const bob = this.rig.update(elapsed, travelled, sprinting) ?? 0;
    this.mesh.position.copyFrom(toWorld(this.position));
    this.mesh.position.y += bob;
  }

  reset() {
    this.vehicleOccupied = false;
    this.position.x = SPAWN.x;
    this.position.y = SPAWN.y;
    this.rig.reset();
    this.mesh.position.copyFrom(toWorld(this.position));
    this.mesh.rotation.set(0, 0, 0);
  }

  dispose() {
    this.rig.dispose();
    this.mesh.dispose(false, false);
  }

  private clampToPreview() {
    const bounds = PREVIEW.bounds;
    this.position.x = Math.max(
      bounds.x + BODY_RADIUS,
      Math.min(bounds.x + bounds.w - BODY_RADIUS, this.position.x),
    );
    this.position.y = Math.max(
      bounds.y + BODY_RADIUS,
      Math.min(bounds.y + bounds.h - BODY_RADIUS, this.position.y),
    );
  }

}
