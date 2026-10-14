import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Collision, type Polygon } from "../game/systems/collision";
import { BUILDINGS, PREVIEW, SPAWN, toWorld } from "./map";
import { PROPERTY_SOLIDS } from "./properties";

const BODY_RADIUS = 3.2;
const SOURCE_PIXELS_PER_METRE = 8;
const WALK_SPEED = 4;
const SPRINT_SPEED = 7;

/** Independent preview actor; source map pixels keep the original wall collision. */
export class PreviewPlayer {
  readonly mesh: TransformNode;
  readonly position = { x: SPAWN.x, y: SPAWN.y };
  readonly shadowCasters: Mesh[] = [];
  private readonly materials: StandardMaterial[] = [];
  private readonly limbs: TransformNode[] = [];
  private readonly collision = new Collision(
    [],
    [...BUILDINGS.map((building) => ({
      points: building.points,
      holes: building.holes,
    })), ...PROPERTY_SOLIDS],
  );
  private gait = 0;
  private idleTime = 0;
  private trafficCollision = new Collision([]);
  private readonly shirt: StandardMaterial;
  private shirtColour = "#dda93c";

  setTrafficSolids(polygons: Polygon[]) {
    this.trafficCollision = new Collision([], polygons);
  }

  setCrewColour(colour: string | null) {
    const next = colour ?? "#dda93c";
    if (next === this.shirtColour) return;
    this.shirtColour = next;
    this.shirt.diffuseColor.copyFrom(Color3.FromHexString(next));
  }

  constructor(scene: Scene) {
    this.mesh = new TransformNode("preview-player", scene);
    const skin = this.material(scene, "skin", "#9b6449");
    const shirt = this.shirt = this.material(scene, "shirt", "#dda93c");
    const trousers = this.material(scene, "trousers", "#283741");
    const shoes = this.material(scene, "shoes", "#1c242a");
    const hair = this.material(scene, "hair", "#241d1a");
    const eye = this.material(scene, "eyes", "#251d18");

    this.box(scene, "torso", 0.47, 0.58, 0.28, 0, 1.18, 0, shirt);
    this.box(scene, "hips", 0.41, 0.23, 0.26, 0, 0.82, 0, trousers);
    this.box(scene, "neck", 0.105, 0.13, 0.1, 0, 1.48, 0, skin);
    const head = MeshBuilder.CreateSphere(
      "preview-player-head",
      { diameter: 0.285, segments: 12 },
      scene,
    );
    head.scaling.y = 1.08;
    head.position.set(0, 1.635, 0);
    this.attach(head, this.mesh, skin);
    const hairCap = MeshBuilder.CreateSphere(
      "preview-player-hair",
      { diameter: 0.291, segments: 12 },
      scene,
    );
    hairCap.scaling.y = 0.57;
    hairCap.position.set(0, 1.705, -0.018);
    this.attach(hairCap, this.mesh, hair);
    this.box(scene, "nose", 0.045, 0.055, 0.047, 0, 1.63, 0.143, skin);
    for (const side of [-1, 1]) {
      this.box(scene, `eye-${side}`, 0.024, 0.021, 0.012, side * 0.055, 1.675, 0.13, eye);
      const arm = new TransformNode(`preview-player-arm-${side}`, scene);
      arm.parent = this.mesh;
      arm.position.set(side * 0.295, 1.4, 0);
      this.limbs.push(arm);
      this.box(scene, `sleeve-${side}`, 0.17, 0.25, 0.21, 0, -0.12, 0, shirt, arm);
      this.box(scene, `forearm-${side}`, 0.105, 0.31, 0.115, 0, -0.365, 0, skin, arm);
      this.box(scene, `hand-${side}`, 0.11, 0.125, 0.11, 0, -0.55, 0.014, skin, arm);

      const leg = new TransformNode(`preview-player-leg-${side}`, scene);
      leg.parent = this.mesh;
      leg.position.set(side * 0.12, 0.77, 0);
      this.limbs.push(leg);
      this.box(scene, `upper-leg-${side}`, 0.18, 0.38, 0.205, 0, -0.18, 0, trousers, leg);
      this.box(scene, `lower-leg-${side}`, 0.16, 0.34, 0.175, 0, -0.52, 0, trousers, leg);
      this.box(scene, `shoe-${side}`, 0.205, 0.14, 0.33, 0, -0.70, 0.055, shoes, leg);
    }
    this.reset();
  }

  update(
    dt: number,
    keys: Set<string>,
    forward: { x: number; z: number } = { x: 0, z: 1 },
  ) {
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
      this.gait += travelled * (sprinting ? 6.4 : 8.2);
    }
    this.idleTime += elapsed;
    const moving = travelled > 0.0001;
    const swing = moving ? Math.sin(this.gait) * (sprinting ? 0.8 : 0.5) : 0;
    // Limb order is left arm, left leg, right arm, right leg.
    this.limbs[0].rotation.x = -swing;
    this.limbs[1].rotation.x = swing;
    this.limbs[2].rotation.x = swing;
    this.limbs[3].rotation.x = -swing;
    this.limbs[0].rotation.z = 0.075;
    this.limbs[2].rotation.z = -0.075;
    this.mesh.position.copyFrom(toWorld(this.position));
    this.mesh.position.y += moving ? Math.abs(Math.sin(this.gait)) * 0.035 :
      Math.sin(this.idleTime * 2.3) * 0.004;
  }

  reset() {
    this.position.x = SPAWN.x;
    this.position.y = SPAWN.y;
    this.gait = 0;
    this.idleTime = 0;
    this.mesh.position.copyFrom(toWorld(this.position));
    this.mesh.rotation.set(0, 0, 0);
    for (const limb of this.limbs) limb.rotation.set(0, 0, 0);
  }

  dispose() {
    this.mesh.dispose(false, false);
    for (const material of this.materials) material.dispose();
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

  private material(scene: Scene, name: string, color: string) {
    const material = new StandardMaterial(`preview-player-${name}`, scene);
    material.diffuseColor = Color3.FromHexString(color);
    material.specularColor = new Color3(0.08, 0.08, 0.08);
    this.materials.push(material);
    return material;
  }

  private box(
    scene: Scene,
    name: string,
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    material: StandardMaterial,
    parent = this.mesh,
  ) {
    const mesh = MeshBuilder.CreateBox(`preview-player-${name}`, { width, height, depth }, scene);
    mesh.position.set(x, y, z);
    this.attach(mesh, parent, material);
    return mesh;
  }

  private attach(mesh: Mesh, parent: TransformNode, material: StandardMaterial) {
    mesh.parent = parent;
    mesh.material = material;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    this.shadowCasters.push(mesh);
  }
}
