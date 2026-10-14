import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { Batch } from "./geometry";
import { toWorld } from "./map";
import { PROPERTY_SOLIDS, WEATHERED_PROPERTIES, type WeatheredProperty } from "./properties";
import { createWallArt } from "./wallArt";

const ATLAS_SIZE = 512, TILE = 128;
const SWATCH = {
  plaster: 0, brick: 4, concrete: 5, wood: 6, tin: 7, rust: 8,
  recess: 9, frame: 10, grime: 11, tar: 12, glass: 13, sand: 14, pale: 15,
};

function random(seed: number) {
  let value = seed >>> 0;
  return () => ((value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** Sixteen original surface swatches share one opaque texture and material. */
function houseMaterial(scene: Scene) {
  const atlas = new DynamicTexture("original-weathered-property-surfaces", { width: ATLAS_SIZE, height: ATLAS_SIZE }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
  atlas.wrapU = Texture.CLAMP_ADDRESSMODE;
  atlas.wrapV = Texture.CLAMP_ADDRESSMODE;
  atlas.anisotropicFilteringLevel = 4;
  const context = atlas.getContext();
  const colours = ["#afa18a", "#939f91", "#aa9990", "#b8b5a4", "#927057", "#a49e8b", "#7f6548", "#78837d", "#91715b", "#263631", "#919b89", "#49534c", "#424b47", "#4e615d", "#9c8c6a", "#b6ae9a"];
  for (let tile = 0; tile < colours.length; tile++) {
    const x = tile % 4 * TILE, y = Math.floor(tile / 4) * TILE;
    const rng = random(613 + tile * 1709);
    context.save();
    context.beginPath(); context.rect(x, y, TILE, TILE); context.clip();
    context.fillStyle = colours[tile]; context.fillRect(x, y, TILE, TILE);
    for (let i = 0; i < 1400; i++) {
      const light = rng() > 0.55 ? 235 : 18;
      context.fillStyle = `rgba(${light},${light},${light},${0.035 + rng() * 0.11})`;
      context.fillRect(x + rng() * TILE, y + rng() * TILE, 0.6 + rng() * 1.4, 0.6 + rng() * 1.5);
    }
    if (tile < 4) {
      // Flaking paint reveals the older grey plaster beneath each colour.
      for (let patch = 0; patch < 19; patch++) {
        const px = x + rng() * TILE, py = y + rng() * TILE;
        const width = 5 + rng() * 22, height = 4 + rng() * 17;
        context.fillStyle = patch % 3 === 0 ? "rgba(94,87,70,.38)" : "rgba(207,201,181,.4)";
        context.beginPath(); context.moveTo(px, py);
        context.lineTo(px + width * 0.72, py - 2); context.lineTo(px + width, py + height * 0.4);
        context.lineTo(px + width * 0.67, py + height); context.lineTo(px + 2, py + height * 0.76);
        context.closePath(); context.fill();
      }
      context.strokeStyle = "rgba(57,64,52,.17)";
      for (let streak = 0; streak < 14; streak++) {
        const px = x + rng() * TILE, py = y + rng() * 20;
        context.lineWidth = 1 + rng() * 2; context.beginPath(); context.moveTo(px, py);
        context.lineTo(px + rng() * 2, py + 12 + rng() * 49); context.stroke();
      }
    } else if (tile === SWATCH.brick) {
      context.strokeStyle = "#b0a086"; context.lineWidth = 2.2;
      for (let row = 0; row < 9; row++) {
        const yy = y + row * 16;
        context.beginPath(); context.moveTo(x, yy); context.lineTo(x + TILE, yy); context.stroke();
        for (let col = -1; col < 5; col++) {
          const xx = x + col * 38 + (row % 2 ? 19 : 0);
          context.beginPath(); context.moveTo(xx, yy); context.lineTo(xx, yy + 16); context.stroke();
          context.fillStyle = "rgba(48,35,26,.1)"; context.fillRect(xx + 3, yy + 3, 31, 4);
        }
      }
    } else if (tile === SWATCH.wood) {
      for (let stripe = 0; stripe < 30; stripe++) {
        context.strokeStyle = stripe % 3 ? "rgba(32,26,20,.2)" : "rgba(226,202,158,.16)";
        const yy = y + rng() * TILE;
        context.lineWidth = 0.6 + rng() * 1.8; context.beginPath(); context.moveTo(x, yy);
        context.lineTo(x + 38, yy + rng() * 4); context.lineTo(x + 83, yy - rng() * 5); context.lineTo(x + TILE, yy + 2); context.stroke();
      }
      for (let knot = 0; knot < 4; knot++) {
        context.strokeStyle = "rgba(42,29,21,.35)"; context.lineWidth = 2;
        context.beginPath(); context.arc(x + 10 + rng() * 108, y + 10 + rng() * 108, 2 + rng() * 4, 0, Math.PI * 2); context.stroke();
      }
    } else if (tile === SWATCH.tin || tile === SWATCH.rust) {
      for (let stripe = 0; stripe < 16; stripe++) {
        const xx = x + stripe * 8;
        context.fillStyle = "rgba(24,38,32,.23)"; context.fillRect(xx, y, 2, TILE);
        context.fillStyle = "rgba(236,239,213,.18)"; context.fillRect(xx + 2, y, 2, TILE);
      }
      for (let patch = 0; patch < (tile === SWATCH.rust ? 40 : 15); patch++) {
        context.fillStyle = `rgba(113,58,30,${0.14 + rng() * 0.24})`;
        context.fillRect(x + rng() * TILE, y + rng() * TILE, 3 + rng() * 13, 5 + rng() * 29);
      }
    }
    context.restore();
  }
  atlas.update(false);
  const material = new StandardMaterial("shared-weathered-property-atlas", scene);
  material.diffuseColor = Color3.White();
  material.diffuseTexture = atlas;
  material.specularColor = new Color3(0.035, 0.035, 0.03);
  return { atlas, material };
}

/** Every quad chooses one atlas region, so a property needs only two meshes. */
class HouseBatch extends Batch {
  tile = SWATCH.plaster;
  paint(tile: number, work: () => void) {
    const before = this.tile; this.tile = tile; work(); this.tile = before;
  }
  override quad(points: Vector3[], normal: Vector3) {
    const before = this.uvs.length;
    super.quad(points, normal);
    const x = this.tile % 4 * TILE + 2, y = Math.floor(this.tile / 4) * TILE + 2;
    for (let i = before; i < this.uvs.length; i += 2) {
      this.uvs[i] = (x + this.uvs[i] * (TILE - 4)) / ATLAS_SIZE;
      this.uvs[i + 1] = (y + this.uvs[i + 1] * (TILE - 4)) / ATLAS_SIZE;
    }
  }
}

function beam(batch: HouseBatch, a: Vector3, b: Vector3, width: number, thickness: number, tile: number) {
  const axis = b.subtract(a).normalize();
  const tangent = Vector3.Cross(axis, Math.abs(axis.y) > 0.9 ? Vector3.Forward() : Vector3.Up()).normalize();
  const normal = Vector3.Cross(axis, tangent).normalize();
  const corners = (point: Vector3) => [point.add(tangent.scale(width / 2)).add(normal.scale(thickness / 2)),
    point.subtract(tangent.scale(width / 2)).add(normal.scale(thickness / 2)),
    point.subtract(tangent.scale(width / 2)).subtract(normal.scale(thickness / 2)),
    point.add(tangent.scale(width / 2)).subtract(normal.scale(thickness / 2))];
  const start = corners(a), end = corners(b);
  batch.paint(tile, () => {
    for (let i = 0; i < 4; i++) batch.quad([start[i], start[(i + 1) % 4], end[(i + 1) % 4], end[i]], start[i].add(start[(i + 1) % 4]).scale(0.5).subtract(a).normalize());
    batch.quad(end, axis);
  });
}

function propertyGeometry(scene: Scene, property: WeatheredProperty, material: StandardMaterial) {
  const shell = new HouseBatch(`weathered-property-${property.id}-shell`, material);
  const details = new HouseBatch(`weathered-property-${property.id}-details`, material);
  const art = createWallArt(scene, `property-${property.id}`);
  const origin = toWorld(property.centre);
  const right = new Vector3(Math.cos(property.heading), 0, -Math.sin(property.heading));
  const front = new Vector3(Math.sin(property.heading), 0, Math.cos(property.heading));
  const at = (x: number, y: number, z: number) => origin.add(right.scale(x)).add(front.scale(z)).add(new Vector3(0, y, 0));
  const { width: w, depth: d, height: h, seed } = property;
  const rng = random(seed);
  const plaster = seed % 4;
  const plate = (batch: HouseBatch, tile: number, centre: Vector3, tangent: Vector3, normal: Vector3, width: number, height: number) => {
    batch.paint(tile, () => batch.quad([centre.subtract(tangent.scale(width / 2)).add(new Vector3(0, -height / 2, 0)),
      centre.add(tangent.scale(width / 2)).add(new Vector3(0, -height / 2, 0)),
      centre.add(tangent.scale(width / 2)).add(new Vector3(0, height / 2, 0)),
      centre.subtract(tangent.scale(width / 2)).add(new Vector3(0, height / 2, 0))], normal));
  };
  const crack = (base: Vector3, tangent: Vector3, normal: Vector3, size: number, salt: number) => {
    const points = [[0, 0], [0.025, 0.27], [-0.07, 0.43], [0.055, 0.73], [-0.02, 1]].map(([x, y]) => base.add(tangent.scale((salt % 2 ? -x : x) * size)).add(new Vector3(0, y * size, 0)).add(normal.scale(0.008)));
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], across = Vector3.Cross(b.subtract(a).normalize(), normal).scale(0.009);
      details.paint(SWATCH.grime, () => details.quad([a.subtract(across), a.add(across), b.add(across), b.subtract(across)], normal));
    }
  };

  shell.paint(plaster, () => shell.box(at(0, h / 2, 0), w, h, d, right, front, false));
  shell.paint(SWATCH.concrete, () => shell.box(at(0, 0.11, 0), w + 0.12, 0.22, d + 0.12, right, front, false));
  const rise = 0.58 + seed % 3 * 0.10;
  const roofY = (z: number) => h + rise * (1 - Math.abs(z) / (d / 2 + 0.22));
  const roofNormal = (side: number) => Vector3.Up().add(front.scale(side * rise / (d / 2 + 0.22))).normalize();
  // The dark underlay keeps roof damage shallow; these are solid exterior props.
  for (const side of [-1, 1]) {
    const z = side * (d / 2 + 0.22);
    shell.paint(SWATCH.recess, () => shell.quad([at(-w / 2 - 0.18, roofY(z) - 0.13, z), at(w / 2 + 0.18, roofY(z) - 0.13, z),
      at(w / 2 + 0.18, roofY(0) - 0.13, 0), at(-w / 2 - 0.18, roofY(0) - 0.13, 0)], roofNormal(side)));
  }
  for (const side of [-1, 1]) {
    const x = side * w / 2;
    shell.paint(plaster, () => shell.quad([at(x, h, -d / 2), at(x, h, d / 2), at(x, h + rise, 0), at(x, h + rise, 0)], right.scale(side)));
  }
  const sheetCount = Math.ceil((w + 0.36) / 0.86);
  const sheetWidth = (w + 0.36) / sheetCount;
  const missing = seed % 2 ? 0 : sheetCount - 1;
  for (let sheet = 0; sheet < sheetCount; sheet++) {
    const left = -w / 2 - 0.18 + sheet * sheetWidth, end = left + sheetWidth - 0.012;
    for (const side of [-1, 1]) {
      let edge = side * (d / 2 + 0.22);
      // One torn edge sheet exposes rafters while the rest retain the roof line.
      if (side === 1 && sheet === missing) edge -= 0.95;
      const tile = (sheet + seed) % 3 === 0 ? SWATCH.rust : SWATCH.tin;
      shell.paint(tile, () => shell.quad([at(left, roofY(edge), edge), at(end, roofY(edge), edge),
        at(end, roofY(0), 0), at(left, roofY(0), 0)], roofNormal(side)));
      // Raised seams catch low sunset light without separate materials or meshes.
      for (let ridge = left + 0.12; ridge < end; ridge += 0.22) {
        details.paint(tile, () => details.quad([at(ridge - 0.023, roofY(edge) + 0.025, edge), at(ridge + 0.023, roofY(edge) + 0.025, edge),
          at(ridge + 0.023, roofY(0) + 0.025, 0), at(ridge - 0.023, roofY(0) + 0.025, 0)], roofNormal(side)));
      }
    }
    if (sheet === missing) {
      for (const x of [left + 0.14, end - 0.14]) beam(details, at(x, h - 0.035, d / 2 + 0.15), at(x, roofY(d / 2 - 1.15) - 0.07, d / 2 - 1.15), 0.085, 0.11, SWATCH.wood);
      beam(details, at(left, h - 0.03, d / 2 - 0.18), at(end, h - 0.03, d / 2 - 0.18), 0.10, 0.12, SWATCH.wood);
    }
  }
  beam(shell, at(-w / 2 - 0.20, h + rise + 0.025, 0), at(w / 2 + 0.20, h + rise + 0.025, 0), 0.16, 0.05, SWATCH.rust);

  // Uneven rain gutters are broken into short sections, with one lowered end.
  for (let section = 0; section < 3; section++) {
    const start = -w / 2 + section * w / 3, end = start + w / 3 - 0.08;
    beam(details, at(start, h - 0.025, d / 2 + 0.24), at(end, h - (section === seed % 3 ? 0.16 : 0.055), d / 2 + 0.25), 0.12, 0.105, SWATCH.rust);
  }
  beam(details, at(-w / 2 + 0.16, h - 0.15, d / 2 + 0.15), at(-w / 2 + 0.22, 0.65, d / 2 + 0.17), 0.085, 0.08, SWATCH.tin);

  // An old closed door and shallow boarded recesses preserve the solid hull.
  plate(shell, SWATCH.recess, at(0, 1.04, d / 2 + 0.012), right, front, 1.13, 2.08);
  plate(shell, SWATCH.wood, at(0, 1.03, d / 2 + 0.027), right, front, 0.91, 1.98);
  for (const x of [-0.52, 0.52]) plate(details, SWATCH.frame, at(x, 1.08, d / 2 + 0.050), right, front, 0.075, 2.14);
  plate(details, SWATCH.frame, at(0, 2.12, d / 2 + 0.05), right, front, 1.11, 0.085);
  shell.paint(SWATCH.concrete, () => shell.box(at(0, 0.07, d / 2 + 0.29), 1.24, 0.14, 0.55, right, front, false));
  details.paint(SWATCH.rust, () => details.box(at(0.35, 1.04, d / 2 + 0.065), 0.055, 0.08, 0.07, right, front));
  for (const side of [-1, 1]) {
    const x = side * w * 0.29, z = d / 2 + 0.027;
    plate(shell, SWATCH.recess, at(x, 1.58, z), right, front, 1.35, 1.24);
    plate(details, SWATCH.glass, at(x + side * 0.39, 1.89, z + 0.012), right, front, 0.44, 0.50);
    for (const frameX of [-0.70, 0.70]) plate(details, SWATCH.frame, at(x + frameX, 1.58, z + 0.022), right, front, 0.065, 1.34);
    for (const frameY of [-0.66, 0.66]) plate(details, SWATCH.frame, at(x, 1.58 + frameY, z + 0.025), right, front, 1.47, 0.06);
    shell.paint(SWATCH.concrete, () => shell.box(at(x, 0.88, z + 0.05), 1.5, 0.10, 0.25, right, front, false));
    for (const board of [-1, 1]) {
      const slope = board * (side < 0 ? 0.42 : 0.10), y = 1.58 + board * 0.19;
      const a = at(x - 0.70, y - slope, z + 0.062), b = at(x + 0.70, y + slope, z + 0.062);
      const across = Vector3.Cross(b.subtract(a).normalize(), front).scale(0.10);
      details.paint(SWATCH.wood, () => details.quad([a.subtract(across), b.subtract(across), b.add(across), a.add(across)], front));
      for (const nailX of [-0.54, 0.54]) plate(details, SWATCH.grime, at(x + nailX, y + nailX / 0.70 * slope, z + 0.070), right, front, 0.019, 0.019);
    }
    art.panel(at(x, 0.53, z + 0.007), right, front, 1.65, 0.70, seed + (side + 1) * 71, "weather");
  }

  // Large irregular missing-plaster patches, then smaller cracks, read at street distance.
  for (const side of [-1, 1]) {
    const normal = right.scale(side), tangent = front.scale(side);
    const x = side * (w / 2 + 0.008);
    details.paint(SWATCH.brick, () => details.quad([at(x, 0.18, -d * 0.34), at(x, 0.14, d * 0.12),
      at(x, 1.18, d * 0.04), at(x, 1.42, -d * 0.28)], normal));
    art.panel(at(x, 1.58, d * 0.20), tangent, normal, Math.min(3.1, d * 0.61), 1.50, seed + side * 919, "graffiti");
    crack(at(x, 0.23, -d * 0.32), tangent, normal, 1.72, seed);
  }
  plate(details, SWATCH.concrete, at(w * 0.33, 0.26, d / 2 + 0.009), right, front, Math.min(1.9, w * 0.3), 0.38);
  crack(at(-w * 0.39, 0.18, d / 2), right, front, 1.78, seed + 3);
  art.panel(at(0, h * 0.55, -d / 2 - 0.008), right.negate(), front.negate(), Math.min(3.4, w * 0.62), 1.56, seed + 407, "graffiti");

  // These wall endpoints are also the collision data: the gate remains a real gap.
  for (let wallIndex = 0; wallIndex < property.walls.length; wallIndex++) {
    const wall = property.walls[wallIndex], a = toWorld(wall.a), b = toWorld(wall.b);
    const length = Vector3.Distance(a, b), tangent = b.subtract(a).normalize();
    const normal = new Vector3(tangent.z, 0, -tangent.x);
    const blocks = Math.max(1, Math.ceil(length / 0.90));
    for (let part = 0; part < blocks; part++) {
      const key = (seed + wallIndex * 13 + part * 7) >>> 0;
      const height = wall.height * (0.78 + key % 5 * 0.055);
      const centre = a.add(tangent.scale((part + 0.5) * length / blocks)).add(new Vector3(0, height / 2, 0));
      shell.paint((key % 7 === 0 ? SWATCH.brick : plaster), () => shell.box(centre, length / blocks + 0.006, height, wall.thickness, tangent, normal, false));
      shell.paint(SWATCH.brick, () => shell.box(centre.add(new Vector3(0, height / 2 - 0.065, 0)), length / blocks + 0.006, 0.13, wall.thickness + 0.025, tangent, normal, false));
      if (part % 4 === 1) crack(centre.add(normal.scale(wall.thickness / 2 + 0.006)).add(new Vector3(0, -height * 0.36, 0)), tangent, normal, Math.min(0.82, height * 0.76), key);
    }
    if (length > 2.3) {
      const middle = a.add(b).scale(0.5).add(new Vector3(0, wall.height * 0.42, 0));
      // Both faces receive original art so the courtyard and street can see it.
      for (const side of [-1, 1]) art.panel(middle.add(normal.scale(side * (wall.thickness / 2 + 0.005))), tangent.scale(side), normal.scale(side), Math.min(length - 0.45, 3.2), Math.min(wall.height * 0.58, 0.86), seed + wallIndex * 101, "graffiti");
    }
  }

  // Rubble stays along yard edges, away from the central entrance route.
  for (let piece = 0; piece < 9; piece++) {
    const side = piece % 2 ? -1 : 1;
    const x = side * (w * 0.31 + rng() * 0.12);
    const z = d / 2 + property.yardDepth * (0.35 + rng() * 0.40);
    const height = 0.055 + rng() * 0.08;
    const angle = rng() * Math.PI;
    const rubbleRight = right.scale(Math.cos(angle)).add(front.scale(Math.sin(angle)));
    const rubbleFront = front.scale(Math.cos(angle)).subtract(right.scale(Math.sin(angle)));
    details.paint(piece % 3 === 0 ? SWATCH.concrete : SWATCH.brick, () => details.box(at(x, height / 2, z), 0.16 + rng() * 0.17, height, 0.10 + rng() * 0.14, rubbleRight, rubbleFront, false));
  }
  // A short abandoned plank lies flat at the edge, without pretending to be a wall.
  details.paint(SWATCH.wood, () => details.box(at(w * 0.32, 0.043, d / 2 + property.yardDepth * 0.43), 1.15, 0.035, 0.16, front, right, false));

  const meshes: Mesh[] = [];
  const shellMesh = shell.finish(scene), detailsMesh = details.finish(scene), artMesh = art.finish(scene);
  if (shellMesh) {
    shellMesh.metadata = { collidable: true, approximatePlacement: true, originalArt: true, weatheredProperty: property.id, part: "shell", boardedWindows: 2, damagedRoofEdges: 1 };
    shellMesh.addLODLevel(250 + shellMesh.getBoundingInfo().boundingSphere.radiusWorld, null);
    meshes.push(shellMesh);
  }
  if (detailsMesh) {
    detailsMesh.metadata = { decorative: true, approximatePlacement: true, originalArt: true, weatheredProperty: property.id, part: "details", rubblePieces: 9 };
    detailsMesh.addLODLevel(95 + detailsMesh.getBoundingInfo().boundingSphere.radiusWorld, null);
    meshes.push(detailsMesh);
  }
  if (artMesh) {
    artMesh.metadata = { ...artMesh.metadata, weatheredProperty: property.id };
    meshes.push(artMesh);
  }
  return { meshes, shadow: shellMesh as AbstractMesh | null };
}

/** Fictional weathered infill is separate from the unchanged public map. */
export function buildProperties(scene: Scene) {
  const surfaces = houseMaterial(scene);
  const meshes: Mesh[] = [], shadowCasters: AbstractMesh[] = [];
  for (const property of WEATHERED_PROPERTIES) {
    const built = propertyGeometry(scene, property, surfaces.material);
    meshes.push(...built.meshes);
    if (built.shadow) shadowCasters.push(built.shadow);
  }
  return {
    placements: WEATHERED_PROPERTIES,
    solidFootprints: PROPERTY_SOLIDS,
    meshes,
    shadowCasters,
    stats: { houses: WEATHERED_PROPERTIES.length, boundaryWalls: WEATHERED_PROPERTIES.reduce((sum, property) => sum + property.walls.length, 0), meshes: meshes.length, opaqueMaterials: 1, opaqueTextures: 1 },
    dispose() {
      for (const mesh of meshes) mesh.dispose(false, false);
      surfaces.material.dispose(false, false);
      surfaces.atlas.dispose();
    },
  };
}
