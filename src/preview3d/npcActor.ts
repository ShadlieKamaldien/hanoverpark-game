import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { type AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { type MapPoint } from "../game/world/mapData";
import { toWorld } from "./map";

export type Appearance = {
  skin: string;
  shirt: string;
  trousers: string;
  hair: string;
  variant?: "cap" | "headscarf" | "none";
  height?: number;
};

type SharedMaterial = { material: StandardMaterial; users: number };
const sceneMaterials = new WeakMap<Scene, SharedMaterial>();

function acquireMaterial(scene: Scene): SharedMaterial {
  let shared = sceneMaterials.get(scene);
  if (!shared) {
    const material = new StandardMaterial("neighbourhood-people", scene);
    // A single material reads each part's vertex colour, including animated limbs.
    material.diffuseColor = Color3.White();
    material.specularColor = new Color3(0.05, 0.05, 0.05);
    shared = { material, users: 0 };
    sceneMaterials.set(scene, shared);
  }
  shared.users++;
  return shared;
}

/** Original low-poly people: one body and four articulated, merged limbs. */
export class NpcActor {
  readonly root: TransformNode;
  readonly shadowCasters: AbstractMesh[] = [];
  private readonly limbs: Mesh[] = [];
  private readonly shared: SharedMaterial;
  private gait = 0;
  private idleTime = 0;
  private wave = 0;
  private disposed = false;

  constructor(private readonly scene: Scene, id: string, appearance: Appearance) {
    this.root = new TransformNode(`neighbour-${id}`, scene);
    this.root.scaling.setAll(Math.max(1.4, Math.min(2.05, appearance.height ?? 1.76)) / 1.85);
    this.shared = acquireMaterial(scene);
    const skin = Color3.FromHexString(appearance.skin);
    const shirt = Color3.FromHexString(appearance.shirt);
    const trousers = Color3.FromHexString(appearance.trousers);
    const hair = Color3.FromHexString(appearance.hair);
    const shoes = new Color3(0.075, 0.085, 0.09);
    const face = new Color3(0.1, 0.075, 0.055);
    const body: Mesh[] = [];
    const box = (parts: Mesh[], name: string, width: number, height: number, depth: number,
      x: number, y: number, z: number, color: Color3) => {
      const mesh = MeshBuilder.CreateBox(`neighbour-${id}-${name}`, { width, height, depth }, scene);
      mesh.position.set(x, y, z);
      this.color(mesh, color);
      parts.push(mesh);
      return mesh;
    };
    const sphere = (name: string, diameter: number, x: number, y: number, z: number,
      scaleY: number, color: Color3) => {
      const mesh = MeshBuilder.CreateSphere(`neighbour-${id}-${name}`, { diameter, segments: 8 }, scene);
      mesh.position.set(x, y, z);
      mesh.scaling.y = scaleY;
      this.color(mesh, color);
      body.push(mesh);
      return mesh;
    };

    box(body, "torso", 0.46, 0.56, 0.27, 0, 1.18, 0, shirt);
    box(body, "hips", 0.41, 0.23, 0.26, 0, 0.82, 0, trousers);
    box(body, "collar", 0.14, 0.035, 0.018, 0, 1.444, 0.142, shirt.scale(0.72));
    box(body, "neck", 0.105, 0.13, 0.105, 0, 1.5, 0, skin);
    sphere("head", 0.31, 0, 1.64, 0, 1.12, skin);
    box(body, "nose", 0.04, 0.06, 0.045, 0, 1.64, 0.149, skin);
    for (const side of [-1, 1]) {
      box(body, `eye-${side}`, 0.021, 0.019, 0.012, side * 0.052, 1.691, 0.141, face);
    }
    box(body, "mouth", 0.054, 0.012, 0.011, 0, 1.588, 0.145, face.scale(1.5));

    if (appearance.variant === "headscarf") {
      const scarf = shirt.scale(0.68);
      sphere("scarf-crown", 0.337, 0, 1.78, -0.014, 0.47, scarf);
      box(body, "scarf-back", 0.30, 0.30, 0.085, 0, 1.65, -0.129, scarf);
      const fold = box(body, "scarf-fold", 0.13, 0.20, 0.035, -0.075, 1.51, 0.146, scarf.scale(1.14));
      fold.rotation.z = -0.22;
    } else {
      sphere("hair", 0.318, 0, 1.779, -0.012, 0.49, hair);
      box(body, "hair-back", 0.26, 0.12, 0.045, 0, 1.711, -0.13, hair);
      if (appearance.variant === "cap") {
        const cap = shirt.scale(0.67);
        sphere("cap-crown", 0.342, 0, 1.792, -0.013, 0.45, cap);
        box(body, "cap-brim", 0.29, 0.025, 0.19, 0, 1.738, 0.144, cap);
      }
    }
    this.merge(body, `neighbour-${id}-body`);

    for (const side of [-1, 1]) {
      const armParts: Mesh[] = [];
      box(armParts, `sleeve-${side}`, 0.165, 0.255, 0.20, 0, -0.12, 0, shirt);
      box(armParts, `forearm-${side}`, 0.105, 0.28, 0.11, 0, -0.34, 0, skin);
      box(armParts, `hand-${side}`, 0.108, 0.13, 0.11, 0, -0.515, 0.014, skin);
      const arm = this.merge(armParts, `neighbour-${id}-arm-${side}`);
      arm.position.set(side * 0.294, 1.41, 0);
      this.limbs.push(arm);

      const legParts: Mesh[] = [];
      box(legParts, `thigh-${side}`, 0.18, 0.39, 0.20, 0, -0.18, 0, trousers);
      box(legParts, `shin-${side}`, 0.16, 0.34, 0.175, 0, -0.52, 0, trousers);
      box(legParts, `shoe-${side}`, 0.20, 0.13, 0.315, 0, -0.705, 0.05, shoes);
      const leg = this.merge(legParts, `neighbour-${id}-leg-${side}`);
      leg.position.set(side * 0.12, 0.77, 0);
      this.limbs.push(leg);
    }
  }

  sync(position: MapPoint, heading: number, moving: boolean, dt: number, greeting = false) {
    if (this.disposed) return;
    const elapsed = Math.max(0, Math.min(0.1, dt));
    this.idleTime += elapsed;
    if (moving) this.gait += elapsed * 8;
    this.wave += ((greeting ? 1 : 0) - this.wave) * Math.min(1, elapsed * 8);
    const swing = moving ? Math.sin(this.gait) * 0.45 : 0;
    // Limb order is left arm, left leg, right arm, right leg.
    this.limbs[0].rotation.set(-swing, 0, -0.075);
    this.limbs[1].rotation.x = swing;
    this.limbs[2].rotation.set(swing * (1 - this.wave), 0,
      0.075 + this.wave * (2.1 + Math.sin(this.idleTime * 7.5) * 0.18));
    this.limbs[3].rotation.x = -swing;
    this.root.position.copyFrom(toWorld(position));
    this.root.position.y = moving ? Math.abs(Math.sin(this.gait)) * 0.025 :
      Math.sin(this.idleTime * 2.1) * 0.003;
    this.root.rotation.y = heading;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.root.dispose(false, false);
    this.shared.users--;
    if (this.shared.users === 0) {
      this.shared.material.dispose();
      sceneMaterials.delete(this.scene);
    }
  }

  private color(mesh: Mesh, color: Color3) {
    const colors = new Float32Array(mesh.getTotalVertices() * 4);
    for (let i = 0; i < colors.length; i += 4) {
      colors[i] = color.r; colors[i + 1] = color.g;
      colors[i + 2] = color.b; colors[i + 3] = 1;
    }
    mesh.setVerticesData(VertexBuffer.ColorKind, colors);
    mesh.material = this.shared.material;
    mesh.useVertexColors = true;
    mesh.hasVertexAlpha = false;
  }

  private merge(parts: Mesh[], name: string) {
    const mesh = Mesh.MergeMeshes(parts, true, true);
    if (!mesh) throw new Error(`Could not build NPC body part: ${name}`);
    mesh.name = name;
    mesh.parent = this.root;
    mesh.material = this.shared.material;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    mesh.useVertexColors = true;
    mesh.hasVertexAlpha = false;
    this.shadowCasters.push(mesh);
    return mesh;
  }
}
