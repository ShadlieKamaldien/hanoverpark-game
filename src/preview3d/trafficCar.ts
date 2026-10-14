import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { MapPoint } from "../game/world/mapData";
import { toWorld } from "./map";

export type TrafficAppearance = { kind: "hatchback" | "sedan" | "minibus"; color: string };
type Lighting = "day" | "sunset" | "night";
type Materials = { body: StandardMaterial; glass: StandardMaterial; lamps: StandardMaterial; users: number };
const sceneMaterials = new WeakMap<Scene, Materials>();

function acquireMaterials(scene: Scene): Materials {
  let shared = sceneMaterials.get(scene);
  if (!shared) {
    const body = new StandardMaterial("neighbourhood-traffic-paint", scene);
    body.diffuseColor = Color3.White();
    body.specularColor = new Color3(0.13, 0.14, 0.14);
    body.specularPower = 24;
    const glass = new StandardMaterial("neighbourhood-traffic-glass", scene);
    glass.diffuseColor = Color3.White();
    glass.specularColor = new Color3(0.35, 0.41, 0.44);
    glass.specularPower = 64;
    glass.alpha = 0.43;
    glass.disableDepthWrite = true;
    const lamps = new StandardMaterial("neighbourhood-traffic-lamps", scene);
    lamps.diffuseColor = Color3.White();
    lamps.specularColor = Color3.Black();
    shared = { body, glass, lamps, users: 0 };
    sceneMaterials.set(scene, shared);
  }
  shared.users++;
  return shared;
}

/** Original vehicles with right-hand drivers, clear glazing and two rolling axles. */
export class TrafficCar {
  readonly root: TransformNode;
  readonly shadowCasters: AbstractMesh[];
  readonly dimensions: { width: number; length: number };
  private readonly shared: Materials;
  private readonly axles: Mesh[] = [];
  private readonly wheelRadius: number;
  private disposed = false;

  constructor(private readonly scene: Scene, id: string, appearance: TrafficAppearance) {
    const taxi = appearance.kind === "minibus";
    const hatch = appearance.kind === "hatchback";
    const width = taxi ? 1.77 : hatch ? 1.52 : 1.63;
    const length = taxi ? 5.25 : hatch ? 3.55 : 4.38;
    this.dimensions = { width: width + 0.17, length };
    this.wheelRadius = taxi ? 0.33 : 0.29;
    this.root = new TransformNode(`traffic-${id}`, scene);
    this.shared = acquireMaterials(scene);
    const paint = Color3.FromHexString(appearance.color);
    const trim = new Color3(0.115, 0.125, 0.125);
    const rubber = new Color3(0.025, 0.032, 0.035);
    const metal = new Color3(0.57, 0.59, 0.55);
    const pale = new Color3(0.85, 0.83, 0.73);
    const glassColor = new Color3(0.24, 0.39, 0.40);
    const bodyParts: Mesh[] = [], glassParts: Mesh[] = [], lampParts: Mesh[] = [];
    const wheelY = this.wheelRadius + 0.025;
    const chassisY = taxi ? 0.71 : 0.66;
    const beltY = taxi ? 1.31 : 0.985;
    const roofY = taxi ? 2.30 : hatch ? 1.53 : 1.47;
    const cabinFront = taxi ? 1.93 : hatch ? 0.70 : 0.77;
    const cabinBack = taxi ? -2.26 : hatch ? -1.44 : -1.25;
    const frontRoof = taxi ? 1.52 : hatch ? 0.31 : 0.33;
    const backRoof = taxi ? -2.17 : hatch ? -1.33 : -0.91;
    const windowX = width * 0.45;
    const roofX = width * 0.405;

    const box = (parts: Mesh[], name: string, w: number, h: number, d: number,
      x: number, y: number, z: number, color: Color3, material = this.shared.body) => {
      const mesh = MeshBuilder.CreateBox(`traffic-${id}-${name}`, { width: w, height: h, depth: d }, scene);
      mesh.position.set(x, y, z);
      this.color(mesh, color, material);
      parts.push(mesh);
      return mesh;
    };
    const beam = (name: string, a: Vector3, b: Vector3, thickness: number, color: Color3) => {
      const direction = b.subtract(a);
      const mesh = box(bodyParts, name, thickness, direction.length(), thickness,
        (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, color);
      mesh.rotationQuaternion = Quaternion.FromUnitVectorsToRef(Vector3.Up(), direction.normalize(), new Quaternion());
    };
    const pane = (parts: Mesh[], name: string, points: Vector3[], normal: Vector3,
      color: Color3, material: StandardMaterial) => {
      const mesh = new Mesh(`traffic-${id}-${name}`, scene);
      const data = new VertexData();
      data.positions = points.flatMap((point) => [point.x, point.y, point.z]);
      data.normals = points.flatMap(() => [normal.x, normal.y, normal.z]);
      const reverse = Vector3.Dot(Vector3.Cross(points[1].subtract(points[0]), points[2].subtract(points[0])), normal) > 0;
      data.indices = reverse ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
      data.applyToMesh(mesh);
      this.color(mesh, color, material);
      parts.push(mesh);
    };

    box(bodyParts, "chassis", width, taxi ? 0.84 : 0.48, length - 0.14, 0, chassisY, 0, paint);
    box(bodyParts, "underside", width * 0.9, 0.12, length * 0.93, 0, 0.395, 0, trim);
    box(bodyParts, "bonnet", width * 0.98, 0.09, length / 2 - cabinFront, 0, beltY - 0.03,
      (length / 2 + cabinFront) / 2 - 0.06, paint.scale(1.035));
    if (!hatch && !taxi) {
      box(bodyParts, "boot", width * 0.98, 0.08, length / 2 + cabinBack,
        0, beltY - 0.04, -(length / 2 - cabinBack) / 2 + 0.06, paint);
    }
    box(bodyParts, "roof", roofX * 2 + 0.08, 0.085, frontRoof - backRoof + 0.10,
      0, roofY, (frontRoof + backRoof) / 2, paint.scale(0.92));
    box(bodyParts, "front-bumper", width * 0.99, 0.145, 0.11, 0, taxi ? 0.51 : 0.53,
      length / 2 - 0.025, trim);
    box(bodyParts, "rear-bumper", width * 0.99, 0.14, 0.11, 0, 0.52,
      -length / 2 + 0.025, trim);
    box(bodyParts, "grille", width * 0.37, 0.20, 0.017, 0, taxi ? 0.92 : 0.79, length / 2 - 0.062, trim);
    for (const side of [-1, 1]) {
      const x = side * windowX, topX = side * roofX;
      beam(`front-pillar-${side}`, new Vector3(x, beltY, cabinFront),
        new Vector3(topX, roofY - 0.035, frontRoof), 0.073, paint);
      beam(`rear-pillar-${side}`, new Vector3(x, beltY, cabinBack),
        new Vector3(topX, roofY - 0.035, backRoof), taxi ? 0.10 : 0.08, paint);
      const doorSplit = taxi ? 0.73 : -0.31;
      const pillarX = x + (topX - x) * 0.5;
      box(bodyParts, `middle-pillar-${side}`, 0.065, roofY - beltY, 0.075,
        pillarX, (roofY + beltY) / 2 - 0.02, doorSplit, trim);
      box(bodyParts, `rubber-strip-${side}`, 0.028, 0.055, length * 0.87,
        side * (width / 2 + 0.01), taxi ? 1.02 : 0.69, 0, trim);
      box(bodyParts, `mirror-${side}`, 0.17, 0.10, 0.18, side * (width / 2),
        beltY + 0.09, cabinFront - 0.2, trim);
      box(bodyParts, `mirror-glass-${side}`, 0.107, 0.065, 0.009, side * (width / 2),
        beltY + 0.095, cabinFront - 0.293, metal);
      const doors = taxi ? [0.74, -0.85] : [-0.26, -1.09];
      for (let i = 0; i < doors.length; i++) {
        box(bodyParts, `door-handle-${side}-${i}`, 0.025, 0.029, 0.17,
          side * (width / 2 + 0.014), beltY - 0.11, doors[i], trim);
      }
      pane(glassParts, `side-glass-${side}`, [
        new Vector3(x, beltY + 0.04, cabinBack + 0.06),
        new Vector3(x, beltY + 0.04, cabinFront - 0.06),
        new Vector3(topX, roofY - 0.06, frontRoof - 0.04),
        new Vector3(topX, roofY - 0.06, backRoof + 0.05),
      ], new Vector3(side, 0, 0), glassColor, this.shared.glass);
      if (taxi) {
        for (const z of [-0.36, -1.30]) {
          box(bodyParts, `taxi-window-divider-${side}-${z}`, 0.035, roofY - beltY - 0.07,
            0.063, pillarX, (roofY + beltY) / 2, z, trim);
        }
        // An original abstract yellow/teal stripe, with no operator or gang insignia.
        box(bodyParts, `taxi-stripe-${side}`, 0.029, 0.07, length * 0.86,
          side * (width / 2 + 0.011), 1.15, 0, new Color3(0.68, 0.63, 0.18));
        box(bodyParts, `taxi-step-${side}`, 0.13, 0.06, 1.35,
          side * (width / 2 - 0.02), 0.40, -0.4, trim);
      }
    }
    const frontNormal = new Vector3(0, cabinFront - frontRoof, roofY - beltY).normalize();
    const rearNormal = new Vector3(0, backRoof - cabinBack, -(roofY - beltY)).normalize();
    pane(glassParts, "windscreen", [
      new Vector3(-windowX + 0.035, beltY + 0.035, cabinFront - 0.008),
      new Vector3(windowX - 0.035, beltY + 0.035, cabinFront - 0.008),
      new Vector3(roofX - 0.035, roofY - 0.07, frontRoof + 0.018),
      new Vector3(-roofX + 0.035, roofY - 0.07, frontRoof + 0.018),
    ], frontNormal, glassColor, this.shared.glass);
    pane(glassParts, "rear-glass", [
      new Vector3(windowX - 0.035, beltY + 0.035, cabinBack + 0.005),
      new Vector3(-windowX + 0.035, beltY + 0.035, cabinBack + 0.005),
      new Vector3(-roofX + 0.035, roofY - 0.07, backRoof - 0.01),
      new Vector3(roofX - 0.035, roofY - 0.07, backRoof - 0.01),
    ], rearNormal, glassColor, this.shared.glass);
    box(bodyParts, "dash", width * 0.84, 0.10, 0.21, 0, beltY + 0.04, cabinFront - 0.22, trim);
    for (const side of [-1, 1]) {
      box(bodyParts, `front-seat-${side}`, 0.39, taxi ? 0.65 : 0.42, 0.14,
        side * width * 0.22, beltY + 0.06, taxi ? 0.77 : -0.05, trim);
    }
    const driverX = width * 0.22;
    const driverZ = taxi ? 1.05 : 0.22;
    const driverHeight = taxi ? 0.37 : 0.21;
    box(bodyParts, "driver-shirt", 0.28, driverHeight, 0.17, driverX,
      beltY + driverHeight / 2 + 0.015, driverZ, new Color3(0.25, 0.33, 0.34));
    const head = MeshBuilder.CreateSphere(`traffic-${id}-driver-head`, { diameter: 0.18, segments: 6 }, scene);
    head.position.set(driverX, beltY + driverHeight + 0.11, driverZ + 0.01);
    this.color(head, new Color3(0.50, 0.31, 0.21), this.shared.body);
    bodyParts.push(head);
    box(bodyParts, "driver-hair", 0.16, 0.04, 0.15, driverX,
      beltY + driverHeight + 0.18, driverZ, trim);
    box(bodyParts, "steering-wheel", 0.20, 0.045, 0.17, driverX,
      beltY + 0.07, cabinFront - 0.27, trim);
    for (const side of [-1, 1]) {
      box(lampParts, `headlamp-${side}`, taxi ? 0.27 : 0.31, taxi ? 0.18 : 0.13,
        0.023, side * width * 0.34, taxi ? 0.91 : 0.81,
        length / 2 - 0.052, new Color3(0.97, 0.93, 0.74), this.shared.lamps);
      box(lampParts, `rear-lamp-${side}`, taxi ? 0.10 : 0.22, taxi ? 0.29 : 0.14,
        0.023, side * width * 0.40, taxi ? 0.93 : 0.83,
        -length / 2 + 0.052, new Color3(0.76, 0.055, 0.035), this.shared.lamps);
      box(lampParts, `indicator-${side}`, 0.09, 0.065, 0.022,
        side * width * 0.46, taxi ? 0.91 : 0.81, length / 2 - 0.049,
        new Color3(0.76, 0.36, 0.055), this.shared.lamps);
    }
    box(bodyParts, "front-plate", 0.38, 0.09, 0.022, 0, 0.535, length / 2 + 0.02, pale);
    box(bodyParts, "rear-plate", 0.38, 0.09, 0.022, 0, taxi ? 0.76 : 0.68, -length / 2 + 0.014, pale);
    // Small scratches and a dull replacement panel keep the original cars varied.
    box(bodyParts, "worn-sill", 0.015, 0.018, 0.24, width / 2 + 0.013, 0.57, -0.47, metal.scale(0.72));
    if (hatch) box(bodyParts, "replacement-bonnet", width * 0.76, 0.012, 0.55,
      0, beltY + 0.021, cabinFront + 0.47, paint.scale(0.86));

    const body = this.merge(bodyParts, `traffic-${id}-body`, this.shared.body);
    this.shadowCasters = [body];
    this.merge(glassParts, `traffic-${id}-glass`, this.shared.glass).receiveShadows = false;
    this.merge(lampParts, `traffic-${id}-lamps`, this.shared.lamps).receiveShadows = false;
    const wheelBase = taxi ? 3.37 : hatch ? 2.35 : 2.77;
    const wheelOffset = taxi ? -0.06 : hatch ? 0.05 : 0.015;
    const wheelParts: Mesh[] = [];
    for (const side of [-1, 1]) {
      const wheel = MeshBuilder.CreateCylinder(`traffic-${id}-tyre-${side}`, {
        diameter: this.wheelRadius * 2, height: 0.19, tessellation: 12,
      }, scene);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.x = side * (width / 2 - 0.08);
      this.color(wheel, rubber, this.shared.body);
      wheelParts.push(wheel);
      const hub = MeshBuilder.CreateCylinder(`traffic-${id}-hub-${side}`, {
        diameter: this.wheelRadius * 1.14, height: 0.024, tessellation: 8,
      }, scene);
      hub.rotation.z = Math.PI / 2;
      hub.position.x = side * (width / 2 + 0.021);
      this.color(hub, metal, this.shared.body);
      wheelParts.push(hub);
      for (const angle of [0, Math.PI / 3, Math.PI * 2 / 3]) {
        const spoke = box(wheelParts, `wheel-spoke-${side}-${angle}`, 0.028,
          this.wheelRadius * 0.88, 0.023, side * (width / 2 + 0.036), 0, 0, trim);
        spoke.rotation.x = angle;
      }
    }
    const frontAxle = this.merge(wheelParts, `traffic-${id}-front-axle`, this.shared.body);
    frontAxle.position.set(0, wheelY, wheelOffset + wheelBase / 2);
    const rearAxle = frontAxle.clone(`traffic-${id}-rear-axle`, this.root, false);
    rearAxle.position.z = wheelOffset - wheelBase / 2;
    rearAxle.isPickable = false;
    this.axles.push(frontAxle, rearAxle);
    this.setLighting("day");
  }

  sync(position: MapPoint, heading: number, metresTravelled: number, frozen = false) {
    if (this.disposed) return;
    this.root.position.copyFrom(toWorld(position));
    this.root.rotation.y = heading;
    if (!frozen) {
      const rotation = (metresTravelled / this.wheelRadius) % (Math.PI * 2);
      for (const axle of this.axles) axle.rotation.x = rotation;
    }
  }

  setLighting(preset: Lighting) {
    if (this.disposed) return;
    // All vehicles use the same preset; emissive vertex colours preserve white
    // headlights and red tail lights without a light for every moving car.
    this.shared.lamps.emissiveColor.setAll(preset === "night" ? 0.9 : preset === "sunset" ? 0.24 : 0.045);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.root.dispose(false, false);
    this.shared.users--;
    if (this.shared.users === 0) {
      this.shared.body.dispose();
      this.shared.glass.dispose();
      this.shared.lamps.dispose();
      sceneMaterials.delete(this.scene);
    }
  }

  private color(mesh: Mesh, color: Color3, material: StandardMaterial) {
    const colors = new Float32Array(mesh.getTotalVertices() * 4);
    for (let i = 0; i < colors.length; i += 4) {
      colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b; colors[i + 3] = 1;
    }
    mesh.setVerticesData(VertexBuffer.ColorKind, colors);
    mesh.material = material;
    mesh.useVertexColors = true;
    mesh.hasVertexAlpha = false;
  }

  private merge(parts: Mesh[], name: string, material: StandardMaterial) {
    const mesh = Mesh.MergeMeshes(parts, true, true);
    if (!mesh) throw new Error(`Could not build traffic model: ${name}`);
    mesh.name = name;
    mesh.parent = this.root;
    mesh.material = material;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    mesh.useVertexColors = true;
    mesh.hasVertexAlpha = false;
    return mesh;
  }
}
