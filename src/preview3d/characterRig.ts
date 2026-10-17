import { Bone } from "@babylonjs/core/Bones/bone";
import { Skeleton } from "@babylonjs/core/Bones/skeleton";
import { BoundingInfo } from "@babylonjs/core/Culling/boundingInfo";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

type Ring = { y: number; x?: number; z?: number; width: number; depth: number; bone: number; blend?: [number, number] };
export type CharacterMotion = "idle" | "walk" | "sprint" | "seated" | "talk";

/** Original mesh and bind pose in metres. No remote models, clips or game assets. */
export class CharacterRig {
  readonly mesh: Mesh;
  readonly skeleton: Skeleton;
  readonly material: StandardMaterial;
  readonly bones: Record<string, Bone> = {};
  private readonly rotations: Record<string, Vector3> = {};
  private readonly colours: number[] = [];
  private readonly shirtVertices: { offset: number; shade: number }[] = [];
  private shirtColour = "";
  private phase = 0;
  private time = 0;
  private blend = 0;
  private runBlend = 0;
  private disposed = false;
  private currentMotion: CharacterMotion = "idle";
  get motion(): CharacterMotion { return this.currentMotion; }

  constructor(scene: Scene, root: TransformNode) {
    this.skeleton = new Skeleton("riyaad-skeleton", "riyaad-skeleton", scene);
    const joint = (name: string, parent: string | null, x: number, y: number, z = 0) => {
      const bone = new Bone(name, this.skeleton, parent ? this.bones[parent] : null, Matrix.Translation(x, y, z));
      this.bones[name] = bone;
      this.rotations[name] = Vector3.Zero();
      return this.skeleton.bones.indexOf(bone);
    };
    const pelvis = joint("pelvis", null, 0, 0.87);
    const chest = joint("chest", "pelvis", 0, 0.17);
    const head = joint("head", "chest", 0, 0.49);
    const limbs = [-1, 1].map((side) => {
      const suffix = side < 0 ? "L" : "R";
      return { side,
        shoulder: joint(`shoulder${suffix}`, "chest", side * 0.255, 0.36),
        elbow: joint(`elbow${suffix}`, `shoulder${suffix}`, side * 0.025, -0.27),
        wrist: joint(`wrist${suffix}`, `elbow${suffix}`, 0, -0.25),
        hip: joint(`hip${suffix}`, "pelvis", side * 0.105, -0.01),
        knee: joint(`knee${suffix}`, `hip${suffix}`, 0, -0.39),
        ankle: joint(`ankle${suffix}`, `knee${suffix}`, 0, -0.37),
      };
    });
    const positions: number[] = [], indices: number[] = [], weights: number[] = [], joints: number[] = [];
    const skin = Color3.FromHexString("#a87555"), jeans = Color3.FromHexString("#34495c");
    const hair = Color3.FromHexString("#211d1b"), dark = Color3.FromHexString("#352820");
    const white = Color3.FromHexString("#d5d0bb"), rubber = Color3.FromHexString("#292c2b");
    const shirt = Color3.FromHexString("#d2a44c");
    const vertex = (x: number, y: number, z: number, color: Color3, bone: number,
      shade = 1, shirtPart = false, blend?: [number, number]) => {
      const index = positions.length / 3;
      positions.push(x, y, z);
      if (shirtPart) this.shirtVertices.push({ offset: this.colours.length, shade });
      this.colours.push(color.r * shade, color.g * shade, color.b * shade, 1);
      joints.push(bone, blend?.[0] ?? bone, 0, 0);
      weights.push(1 - (blend?.[1] ?? 0), blend?.[1] ?? 0, 0, 0);
      return index;
    };
    // Contoured cross-sections replace the old independent cubes. Shared rings
    // carry blended bone weights so knees and elbows deform without open seams.
    const surface = (rings: Ring[], colour: Color3, segments = 10, shirtPart = false) => {
      const start = positions.length / 3;
      rings.forEach((ring, row) => {
        for (let i = 0; i < segments; i++) {
          const angle = i / segments * Math.PI * 2;
          const shade = (0.94 + Math.cos(angle * 2) * 0.035) * (row === 0 ? 0.86 : 1);
          vertex((ring.x ?? 0) + Math.cos(angle) * ring.width, ring.y,
            (ring.z ?? 0) + Math.sin(angle) * ring.depth, colour, ring.bone, shade, shirtPart, ring.blend);
          if (row > 0) {
            const a = start + (row - 1) * segments + i, b = start + row * segments + i;
            const next = (i + 1) % segments;
            indices.push(a, start + (row - 1) * segments + next, b,
              b, start + (row - 1) * segments + next, start + row * segments + next);
          }
        }
      });
      for (const row of [0, rings.length - 1]) {
        const ring = rings[row], centre = vertex(ring.x ?? 0, ring.y, ring.z ?? 0, colour, ring.bone, 1, shirtPart, ring.blend);
        for (let i = 0; i < segments; i++) {
          const a = start + row * segments + i, b = start + row * segments + (i + 1) % segments;
          indices.push(...(row === 0 ? [centre, b, a] : [centre, a, b]));
        }
      }
    };
    const patch = (points: number[][], colour: Color3, bone: number) => {
      const start = positions.length / 3;
      points.forEach(([x, y, z]) => vertex(x, y, z, colour, bone));
      for (let i = 1; i < points.length - 1; i++) indices.push(start, start + i, start + i + 1);
    };
    surface([
      { y: 0.79, width: 0.185, depth: 0.115, bone: pelvis },
      { y: 0.91, width: 0.20, depth: 0.13, bone: pelvis },
      { y: 1.02, width: 0.175, depth: 0.12, bone: chest, blend: [pelvis, 0.5] },
    ], jeans);
    surface([
      { y: 0.97, width: 0.193, depth: 0.132, bone: chest, blend: [pelvis, 0.6] },
      { y: 1.02, width: 0.19, depth: 0.137, bone: chest, blend: [pelvis, 0.35] },
      { y: 1.18, width: 0.212, depth: 0.142, bone: chest },
      { y: 1.36, width: 0.246, depth: 0.139, bone: chest },
      { y: 1.43, width: 0.23, depth: 0.112, bone: chest },
      { y: 1.47, width: 0.092, depth: 0.078, bone: chest },
    ], shirt, 12, true);
    surface([{ y: 1.44, width: 0.066, depth: 0.065, bone: head },
      { y: 1.57, width: 0.07, depth: 0.067, bone: head }], skin);
    // Jaw, cheekbones, brow and close-cropped crown form an original silhouette.
    surface([
      { y: 1.53, z: 0.008, width: 0.062, depth: 0.073, bone: head },
      { y: 1.57, z: 0.004, width: 0.091, depth: 0.092, bone: head },
      { y: 1.64, width: 0.116, depth: 0.103, bone: head },
      { y: 1.72, width: 0.111, depth: 0.097, bone: head },
      { y: 1.78, z: -0.008, width: 0.075, depth: 0.065, bone: head },
    ], skin, 12);
    surface([{ y: 1.72, z: -0.012, width: 0.113, depth: 0.098, bone: head },
      { y: 1.775, z: -0.012, width: 0.09, depth: 0.076, bone: head },
      { y: 1.8, z: -0.014, width: 0.025, depth: 0.025, bone: head }], hair, 12);
    patch([[-0.018, 1.69, 0.104], [0.018, 1.69, 0.104], [0.026, 1.625, 0.106],
      [0, 1.62, 0.146], [-0.026, 1.625, 0.106]], skin.scale(0.9), head);
    patch([[-0.031, 1.592, 0.094], [-0.024, 1.602, 0.105], [0.026, 1.602, 0.105],
      [0.033, 1.592, 0.094], [0, 1.588, 0.103]], dark.scale(1.5), head);
    for (const side of [-1, 1]) {
      const x = side * 0.047;
      patch([[x - 0.019, 1.678, 0.094], [x + 0.019, 1.678, 0.094],
        [x + 0.017, 1.665, 0.102], [x - 0.017, 1.665, 0.102]], white, head);
      patch([[x - 0.007, 1.678, 0.104], [x + 0.007, 1.678, 0.104],
        [x + 0.007, 1.665, 0.106], [x - 0.007, 1.665, 0.106]], dark, head);
      patch([[x - 0.023, 1.69, 0.1], [x + 0.021, 1.694, 0.1],
        [x + 0.021, 1.684, 0.104], [x - 0.023, 1.683, 0.104]], hair, head);
      surface([{ y: 1.615, x: side * 0.113, width: 0.022, depth: 0.025, bone: head },
        { y: 1.673, x: side * 0.113, width: 0.024, depth: 0.023, bone: head }], skin, 6);
    }
    // Collar and original stitched shirt panel; no borrowed logos or textures.
    patch([[-0.07, 1.465, 0.072], [0, 1.42, 0.128], [0.07, 1.465, 0.072],
      [0.045, 1.445, 0.096], [0, 1.406, 0.139], [-0.045, 1.445, 0.096]], shirt.scale(0.55), chest);
    patch([[-0.13, 1.31, 0.128], [-0.065, 1.31, 0.143], [-0.065, 1.25, 0.148],
      [-0.13, 1.25, 0.133]], white.scale(0.8), chest);
    for (const { side, shoulder, elbow, wrist, hip, knee, ankle } of limbs) {
      const x = side * 0.28;
      surface([{ y: 1.25, x, width: 0.084, depth: 0.089, bone: shoulder },
        { y: 1.36, x: side * 0.267, width: 0.092, depth: 0.106, bone: shoulder },
        { y: 1.43, x: side * 0.24, width: 0.065, depth: 0.069, bone: shoulder }], shirt, 10, true);
      surface([{ y: 0.88, x, width: 0.044, depth: 0.044, bone: wrist },
        { y: 0.99, x, width: 0.047, depth: 0.05, bone: elbow, blend: [wrist, 0.3] },
        { y: 1.09, x, width: 0.059, depth: 0.064, bone: elbow },
        { y: 1.13, x, width: 0.059, depth: 0.06, bone: shoulder, blend: [elbow, 0.5] },
        { y: 1.24, x, width: 0.071, depth: 0.073, bone: shoulder },
        { y: 1.29, x, width: 0.075, depth: 0.078, bone: shoulder }], skin);
      surface([{ y: 0.77, x, z: 0.012, width: 0.041, depth: 0.038, bone: wrist },
        { y: 0.81, x, z: 0.014, width: 0.054, depth: 0.042, bone: wrist },
        { y: 0.9, x, width: 0.046, depth: 0.043, bone: wrist }], skin, 8);
      surface([{ y: 0.09, x: side * 0.105, width: 0.069, depth: 0.078, bone: ankle },
        { y: 0.16, x: side * 0.105, width: 0.075, depth: 0.082, bone: knee },
        { y: 0.35, x: side * 0.105, width: 0.077, depth: 0.089, bone: knee },
        { y: 0.47, x: side * 0.105, width: 0.081, depth: 0.086, bone: hip, blend: [knee, 0.5] },
        { y: 0.65, x: side * 0.105, width: 0.089, depth: 0.101, bone: hip },
        { y: 0.85, x: side * 0.105, width: 0.097, depth: 0.111, bone: hip }], jeans);
      surface([{ y: 0.015, x: side * 0.105, z: 0.048, width: 0.08, depth: 0.147, bone: ankle },
        { y: 0.046, x: side * 0.105, z: 0.048, width: 0.083, depth: 0.15, bone: ankle }], white, 10);
      surface([{ y: 0.045, x: side * 0.105, z: 0.048, width: 0.081, depth: 0.144, bone: ankle },
        { y: 0.095, x: side * 0.105, z: 0.044, width: 0.077, depth: 0.14, bone: ankle },
        { y: 0.139, x: side * 0.105, z: 0.005, width: 0.062, depth: 0.076, bone: ankle }], rubber, 10);
    }
    const data = new VertexData();
    data.positions = positions; data.indices = indices; data.colors = this.colours;
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    data.normals = normals; data.matricesIndices = joints; data.matricesWeights = weights;
    this.mesh = new Mesh("riyaad-skinned-character", scene);
    data.applyToMesh(this.mesh, true);
    this.mesh.parent = root;
    this.mesh.skeleton = this.skeleton;
    this.mesh.numBoneInfluencers = 2;
    this.mesh.isPickable = false;
    this.mesh.receiveShadows = true;
    this.mesh.hasVertexAlpha = false;
    this.material = new StandardMaterial("riyaad-clothing-and-skin", scene);
    this.material.diffuseColor = Color3.White();
    this.material.specularColor = new Color3(0.035, 0.035, 0.035);
    this.mesh.material = this.material;
    // Covers animated reach, including the seated legs, without per-frame scans.
    this.mesh.setBoundingInfo(new BoundingInfo(new Vector3(-0.8, -0.15, -0.9), new Vector3(0.8, 1.95, 0.9)));
    this.reset();
  }

  setShirtColour(hex: string) {
    if (this.shirtColour === hex) return;
    this.shirtColour = hex;
    const color = Color3.FromHexString(hex);
    for (const { offset, shade } of this.shirtVertices) {
      this.colours[offset] = color.r * shade;
      this.colours[offset + 1] = color.g * shade;
      this.colours[offset + 2] = color.b * shade;
    }
    this.mesh.updateVerticesData(VertexBuffer.ColorKind, this.colours);
  }

  /** Phase follows actual collision-resolved distance, never held input. */
  update(dt: number, distance: number, sprinting: boolean, mode?: "talk") {
    const elapsed = Math.max(0, Math.min(dt, 0.1));
    if (elapsed === 0 || this.disposed) return;
    const speed = Math.max(0, distance) / elapsed;
    const moving = speed > 0.05;
    const blend = 1 - Math.exp(-elapsed * 14);
    this.blend += ((moving ? Math.min(1, speed / 4) : 0) - this.blend) * blend;
    this.runBlend += ((sprinting && moving ? 1 : 0) - this.runBlend) * blend;
    this.phase += Math.max(0, distance) * (2 * Math.PI / (1.8 + this.runBlend * 1.4));
    this.time += elapsed;
    this.currentMotion = moving ? (sprinting ? "sprint" : "walk") : mode ?? "idle";
    const wave = Math.sin(this.phase), run = this.runBlend, amount = this.blend;
    const hipSwing = wave * (0.52 + run * 0.30) * amount;
    const breath = Math.sin(this.time * 2.2) * 0.009;
    this.pose("pelvis", 0, Math.sin(this.phase) * 0.055 * amount, 0);
    this.pose("chest", breath + run * amount * 0.13, -wave * 0.08 * amount, Math.sin(this.phase) * 0.025 * amount);
    this.pose("head", -breath, mode === "talk" ? Math.sin(this.time * 1.8) * 0.08 : wave * 0.035 * amount, 0);
    for (const [suffix, side] of [["L", -1], ["R", 1]] as const) {
      const swing = hipSwing * side;
      const lift = Math.max(0, wave * side);
      this.pose(`hip${suffix}`, swing, 0, side * 0.025);
      this.pose(`knee${suffix}`, Math.max(0, -wave * side) * (0.72 + run * 0.65) * amount + 0.035, 0, 0);
      this.pose(`ankle${suffix}`, -lift * 0.18 * amount, 0, 0);
      this.pose(`shoulder${suffix}`, -swing * 0.8 - run * amount * 0.16, 0, side * 0.04);
      this.pose(`elbow${suffix}`, -0.12 - run * amount * 0.85 - lift * 0.15 * amount, 0, 0);
      this.pose(`wrist${suffix}`, 0, 0, 0);
    }
    if (mode === "talk" && !moving) {
      this.pose("shoulderR", -0.28, 0.1, 0.12);
      this.pose("elbowR", -0.65 + Math.sin(this.time * 3.2) * 0.12, 0, 0);
    }
    return (Math.abs(Math.cos(this.phase)) * 0.018 + run * 0.012) * amount;
  }

  seat() {
    this.currentMotion = "seated";
    for (const name of Object.keys(this.bones)) this.pose(name, 0, 0, 0);
    this.pose("chest", 0.07, 0, 0);
    for (const suffix of ["L", "R"]) {
      this.pose(`hip${suffix}`, -1.32, 0, 0);
      this.pose(`knee${suffix}`, 1.45, 0, 0);
      this.pose(`ankle${suffix}`, -0.13, 0, 0);
      this.pose(`shoulder${suffix}`, -0.78, 0, suffix === "L" ? -0.12 : 0.12);
      this.pose(`elbow${suffix}`, -0.6, 0, 0);
    }
  }

  reset() {
    this.phase = this.time = this.blend = this.runBlend = 0;
    this.currentMotion = "idle";
    for (const name of Object.keys(this.bones)) this.pose(name, 0, 0, 0);
    this.pose("elbowL", -0.12, 0, 0); this.pose("elbowR", -0.12, 0, 0);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.mesh.dispose(); this.skeleton.dispose(); this.material.dispose();
  }

  private pose(name: string, x: number, y: number, z: number) {
    const rotation = this.rotations[name];
    rotation.set(x, y, z);
    this.bones[name].setRotation(rotation);
  }
}
