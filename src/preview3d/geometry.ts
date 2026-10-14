import earcut from "earcut";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Scene } from "@babylonjs/core/scene";

type Ring = Vector3[];

/** One static mesh per material keeps the facade details cheap to render. */
export class Batch {
  positions: number[] = [];
  normals: number[] = [];
  uvs: number[] = [];
  indices: number[] = [];
  constructor(readonly name: string, readonly material: StandardMaterial) {}

  quad(points: Vector3[], normal: Vector3, width = 1, height = 1) {
    const start = this.positions.length / 3;
    const geometric = Vector3.Cross(points[1].subtract(points[0]), points[2].subtract(points[0]));
    // Babylon's default left-handed mesh convention winds opposite the
    // right-handed geometric cross product (as its CreateGround builder does).
    const reverse = Vector3.Dot(geometric, normal) > 0;
    for (let i = 0; i < 4; i++) {
      const point = points[i];
      this.positions.push(point.x, point.y, point.z);
      this.normals.push(normal.x, normal.y, normal.z);
      this.uvs.push(i === 1 || i === 2 ? width : 0, i >= 2 ? height : 0);
    }
    this.indices.push(...(reverse ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]).map((i) => start + i));
  }

  box(center: Vector3, width: number, height: number, depth: number, tangent = Vector3.Right(), normal = Vector3.Forward(), closedBottom = true) {
    const point = (x: number, y: number, z: number) => center.add(tangent.scale(x * width / 2)).add(new Vector3(0, y * height / 2, 0)).add(normal.scale(z * depth / 2));
    this.quad([point(-1, -1, 1), point(1, -1, 1), point(1, 1, 1), point(-1, 1, 1)], normal);
    this.quad([point(1, -1, -1), point(-1, -1, -1), point(-1, 1, -1), point(1, 1, -1)], normal.negate());
    this.quad([point(1, -1, 1), point(1, -1, -1), point(1, 1, -1), point(1, 1, 1)], tangent);
    this.quad([point(-1, -1, -1), point(-1, -1, 1), point(-1, 1, 1), point(-1, 1, -1)], tangent.negate());
    this.quad([point(-1, 1, 1), point(1, 1, 1), point(1, 1, -1), point(-1, 1, -1)], Vector3.Up());
    if (closedBottom) this.quad([point(-1, -1, -1), point(1, -1, -1), point(1, -1, 1), point(-1, -1, 1)], Vector3.Down());
  }

  polygon(rings: Ring[], y: number, textureScale = 1) {
    const flat: number[] = [], holes: number[] = [];
    for (let i = 0; i < rings.length; i++) {
      if (i > 0) holes.push(flat.length / 2);
      for (const point of rings[i]) flat.push(point.x, point.z);
    }
    const start = this.positions.length / 3;
    for (let i = 0; i < flat.length; i += 2) {
      this.positions.push(flat[i], y, flat[i + 1]);
      this.normals.push(0, 1, 0);
      this.uvs.push(flat[i] / textureScale, flat[i + 1] / textureScale);
    }
    const triangles = earcut(flat, holes, 2);
    for (let i = 0; i < triangles.length; i += 3) {
      const a = triangles[i], b = triangles[i + 1], c = triangles[i + 2];
      // Babylon's left-handed convention uses positive x/z winding for Up.
      const cross = (flat[b * 2] - flat[a * 2]) * (flat[c * 2 + 1] - flat[a * 2 + 1]) - (flat[b * 2 + 1] - flat[a * 2 + 1]) * (flat[c * 2] - flat[a * 2]);
      this.indices.push(start + a, start + (cross < 0 ? c : b), start + (cross < 0 ? b : c));
    }
  }

  finish(scene: Scene): Mesh | null {
    if (!this.positions.length) return null;
    const mesh = new Mesh(this.name, scene);
    const data = new VertexData();
    data.positions = this.positions; data.normals = this.normals; data.uvs = this.uvs; data.indices = this.indices;
    data.applyToMesh(mesh);
    mesh.material = this.material;
    // Static scenery is decorative: pointer movement must not ray-test every
    // window frame, curtain and railing triangle to decide a mouse cursor.
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    mesh.freezeWorldMatrix();
    return mesh;
  }
}
