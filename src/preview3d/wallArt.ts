import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { Batch } from "./geometry";
import { BUILDINGS, toWorld } from "./map";

export type WallArtKind = "graffiti" | "weather";
const ATLAS_SIZE = 1024, TILE_WIDTH = 512, TILE_HEIGHT = 256;
const materials = new WeakMap<Scene, StandardMaterial>();

function randomSource(initial: number) {
  let seed = initial >>> 0;
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** All marks are original drawings; they do not reproduce real crew signatures. */
function sprayArt(context: CanvasRenderingContext2D, variant: number) {
  const random = randomSource(2817 + variant * 619);
  const words = ["AWE", "HOU MOED", "HP", "MA SE KIND"];
  const colours = ["#53a6a2", "#c88b51", "#ba809e", "#88a66a"];
  const colour = colours[variant];
  context.save();
  context.translate(256, 126);
  context.rotate([-0.06, 0.03, -0.09, 0.035][variant]);

  // An older half-painted mark peeks out beneath the newer aerosol lettering.
  context.strokeStyle = "#aaa998"; context.lineWidth = 9;
  context.beginPath(); context.moveTo(-184, 43);
  context.bezierCurveTo(-58, 6, 68, 58, 194, 24); context.stroke();
  context.strokeStyle = "#797d73"; context.lineWidth = 2;
  context.beginPath(); context.moveTo(-198, 50); context.lineTo(185, 59); context.stroke();
  for (let i = 0; i < 420; i++) {
    const x = random() * 428 - 214, y = random() * 150 - 79;
    const edge = Math.max(0, 1 - Math.abs(y) / 95);
    context.globalAlpha = 0.23 + random() * 0.35;
    context.fillStyle = i % 3 ? colour : "#dee0bf";
    context.beginPath(); context.arc(x, y, 0.25 + random() * edge * 1.25, 0, Math.PI * 2); context.fill();
  }
  context.globalAlpha = 1;

  const text = words[variant];
  const size = [119, 65, 136, 59][variant];
  context.font = `italic 900 ${size}px Arial, sans-serif`;
  context.textAlign = "center"; context.textBaseline = "middle";
  context.lineJoin = "round";
  // Uneven hand-painted outlines, a faded warm inner edge and solid pigment.
  context.strokeStyle = "#424b4a"; context.lineWidth = 14;
  context.strokeText(text, 2, 3, 407);
  context.strokeStyle = "#ded3b3"; context.lineWidth = 8;
  context.strokeText(text, -1, -1, 407);
  context.fillStyle = colour; context.fillText(text, -1, -1, 407);
  context.strokeStyle = "#54675f"; context.lineWidth = 1.5;
  context.strokeText(text, -1, -1, 407);

  // Small dark flares and runs follow the spray line instead of forming a decal box.
  context.lineCap = "round"; context.strokeStyle = colour;
  for (let i = 0; i < 11; i++) {
    const x = random() * 350 - 175, y = 27 + random() * 24;
    context.lineWidth = 1.2 + random() * 2.3;
    context.beginPath(); context.moveTo(x, y);
    context.lineTo(x + random() * 3, y + 10 + random() * 37); context.stroke();
  }
  context.strokeStyle = "#dfd8bc"; context.lineWidth = 3;
  context.beginPath(); context.moveTo(-171, -43); context.lineTo(-148, -52); context.stroke();
  if (variant === 2) {
    // A simple original sun-and-waves fragment beside the handwritten initials.
    context.strokeStyle = "#d0a158"; context.lineWidth = 4;
    context.beginPath(); context.arc(168, -29, 20, 0, Math.PI * 2); context.stroke();
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      context.beginPath(); context.moveTo(168 + Math.cos(angle) * 26, -29 + Math.sin(angle) * 26);
      context.lineTo(168 + Math.cos(angle) * 34, -29 + Math.sin(angle) * 34); context.stroke();
    }
  }
  // Wind, rain and old paint interrupt the lettering with actual missing pixels.
  context.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 170; i++) {
    const x = random() * 405 - 202, y = random() * 118 - 59;
    context.beginPath(); context.arc(x, y, 0.4 + random() * 1.9, 0, Math.PI * 2); context.fill();
  }
  context.restore();
}

function raggedPatch(context: CanvasRenderingContext2D, random: () => number, inset = 35) {
  context.beginPath();
  for (let i = 0; i < 30; i++) {
    const angle = i / 30 * Math.PI * 2;
    const rough = 0.83 + random() * 0.2;
    const x = 256 + Math.cos(angle) * (256 - inset) * rough;
    const y = 128 + Math.sin(angle) * (128 - inset / 2) * rough;
    if (i === 0) context.moveTo(x, y); else context.lineTo(x, y);
  }
  context.closePath();
}

function weatherArt(context: CanvasRenderingContext2D, variant: number) {
  const random = randomSource(6119 + variant * 1049);
  context.save();
  if (variant === 0 || variant === 1) {
    // Ragged plaster lips surround either exposed brick or an old cement repair.
    raggedPatch(context, random, 32);
    context.fillStyle = "#a59b84"; context.fill();
    context.strokeStyle = "#d2cbb6"; context.lineWidth = 7; context.stroke();
    raggedPatch(context, random, 43); context.clip();
    if (variant === 0) {
      context.fillStyle = "#837567"; context.fillRect(0, 0, TILE_WIDTH, TILE_HEIGHT);
      for (let row = 0; row < 8; row++) {
        for (let column = -1; column < 9; column++) {
          const x = column * 67 + (row % 2 ? 33 : 0), y = row * 34;
          context.fillStyle = ["#a06e56", "#96725d", "#b07c60", "#8c6955"][Math.floor(random() * 4)];
          context.fillRect(x + 3, y + 3, 61, 28);
          context.strokeStyle = "#c09071"; context.lineWidth = 1;
          context.beginPath(); context.moveTo(x + 5, y + 5); context.lineTo(x + 61, y + 5); context.stroke();
          context.fillStyle = "#765747";
          context.fillRect(x + 13 + random() * 28, y + 12 + random() * 10, 7 + random() * 12, 1.4);
        }
      }
    } else {
      context.fillStyle = "#aaa99a"; context.fillRect(0, 0, TILE_WIDTH, TILE_HEIGHT);
      for (let i = 0; i < 1000; i++) {
        context.fillStyle = random() > 0.5 ? "#929482" : "#b9bbaa";
        context.fillRect(random() * TILE_WIDTH, random() * TILE_HEIGHT, 0.7 + random() * 3.4, 0.8 + random() * 1.2);
      }
      context.strokeStyle = "#767969"; context.lineWidth = 1.3;
      context.beginPath(); context.moveTo(157, 10); context.lineTo(183, 60); context.lineTo(177, 118);
      context.lineTo(222, 175); context.lineTo(207, 246); context.stroke();
    }
  } else if (variant === 2) {
    context.strokeStyle = "#746f60"; context.lineWidth = 1.3;
    for (let line = 0; line < 3; line++) {
      let x = 65 + line * 146 + random() * 32, y = 11;
      context.beginPath(); context.moveTo(x, y);
      for (let step = 0; step < 10; step++) {
        const previousX = x, previousY = y;
        x += random() * 41 - 21; y += 17 + random() * 9;
        context.lineTo(x, y);
        if (step % 3 === 1) {
          context.lineTo(x + (line % 2 ? -1 : 1) * (16 + random() * 29), y + 7);
          context.moveTo(previousX, previousY); context.lineTo(x, y);
        }
      }
      context.stroke();
    }
  } else {
    // Interrupted damp streaks and pale efflorescence stay local to the wall base.
    for (let i = 0; i < 80; i++) {
      const x = 15 + random() * 475, height = 20 + random() * 151;
      const y = 237 - height;
      context.fillStyle = ["#82907a", "#8f9680", "#b3b39a", "#a3a48d"][i % 4];
      context.globalAlpha = 0.45 + random() * 0.5;
      context.beginPath(); context.ellipse(x, y + height / 2, 2 + random() * 11, height / 2, 0, 0, Math.PI * 2); context.fill();
    }
    context.globalAlpha = 1;
    context.fillStyle = "#c6c4a9";
    for (let i = 0; i < 260; i++) context.fillRect(18 + random() * 473, 166 + random() * 69, 0.4 + random() * 2.4, 0.6 + random() * 1.7);
  }
  context.restore();
}

function sharedMaterial(scene: Scene) {
  const existing = materials.get(scene);
  if (existing) return existing;
  const material = new StandardMaterial("original-street-wall-art", scene);
  const texture = new DynamicTexture("original-graffiti-atlas", { width: ATLAS_SIZE, height: ATLAS_SIZE }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
  texture.hasAlpha = true;
  texture.wrapU = Texture.CLAMP_ADDRESSMODE; texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  texture.anisotropicFilteringLevel = 4;
  const context = texture.getContext() as CanvasRenderingContext2D;
  context.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
  for (let tile = 0; tile < 8; tile++) {
    const x = tile % 2 * TILE_WIDTH, y = Math.floor(tile / 2) * TILE_HEIGHT;
    context.save(); context.translate(x, y);
    context.beginPath(); context.rect(10, 9, TILE_WIDTH - 20, TILE_HEIGHT - 18); context.clip();
    if (tile < 4) sprayArt(context, tile); else weatherArt(context, tile - 4);
    context.restore();
  }
  // Canvas rows are inverted for bottom-to-top mesh UVs, including atlas subrects.
  texture.update(true);
  material.diffuseTexture = texture;
  material.diffuseColor = Color3.White(); material.emissiveColor = Color3.Black();
  material.specularColor = Color3.Black();
  material.useAlphaFromDiffuseTexture = true;
  material.transparencyMode = Material.MATERIAL_ALPHATEST;
  material.alphaCutOff = 0.18;
  material.maxSimultaneousLights = 3;
  material.zOffset = -1;
  materials.set(scene, material);
  scene.onDisposeObservable.addOnce(() => materials.delete(scene));
  return material;
}

/** One outward-facing static batch per property or flat; no per-tag draw calls. */
export class WallArtBatch extends Batch {
  private graffitiPanels = 0;
  private weatherPanels = 0;

  panel(center: Vector3, tangent: Vector3, normal: Vector3, width: number, height: number, seed: number, kind: WallArtKind = "graffiti") {
    if (!(width > 0 && height > 0) || ![center.x, center.y, center.z, width, height].every(Number.isFinite)) return;
    // Fit the lettering inside the available wall span without distorting it.
    if (kind === "graffiti") {
      const aspect = (TILE_WIDTH - 8) / (TILE_HEIGHT - 8);
      width = Math.min(width, height * aspect);
      height = width / aspect;
    }
    const tile = ((Math.imul(seed | 0, 2654435761) >>> 0) % 4) + (kind === "weather" ? 4 : 0);
    const direction = tangent.normalizeToNew(), outward = normal.normalizeToNew();
    const at = (x: number, y: number) => center.add(direction.scale(x * width / 2)).add(outward.scale(0.025)).add(new Vector3(0, y * height / 2, 0));
    const first = this.uvs.length;
    this.quad([at(-1, -1), at(1, -1), at(1, 1), at(-1, 1)], outward);
    const u0 = (tile % 2 * TILE_WIDTH + 4) / ATLAS_SIZE;
    const u1 = (tile % 2 * TILE_WIDTH + TILE_WIDTH - 4) / ATLAS_SIZE;
    const v1 = 1 - (Math.floor(tile / 2) * TILE_HEIGHT + 4) / ATLAS_SIZE;
    const v0 = 1 - (Math.floor(tile / 2) * TILE_HEIGHT + TILE_HEIGHT - 4) / ATLAS_SIZE;
    this.uvs.splice(first, 8, u0, v0, u1, v0, u1, v1, u0, v1);
    if (kind === "graffiti") this.graffitiPanels++; else this.weatherPanels++;
  }

  override finish(scene: Scene): Mesh | null {
    const mesh = super.finish(scene);
    if (mesh) {
      mesh.metadata = { wallArt: { original: true, atlas: "original-graffiti-atlas", tileCount: 8,
        panels: this.graffitiPanels + this.weatherPanels, graffitiPanels: this.graffitiPanels, weatherPanels: this.weatherPanels } };
      mesh.addLODLevel(150 + mesh.getBoundingInfo().boundingSphere.radiusWorld, null);
    }
    return mesh;
  }
}

export function createWallArt(scene: Scene, name: string) {
  return new WallArtBatch(`wall-art-${name}`, sharedMaterial(scene));
}

/** Art follows existing footprint edges; only original visual condition is invented. */
export function buildMappedWallArt(scene: Scene) {
  const meshes: Mesh[] = [];
  const stats = { buildings: 0, graffitiPanels: 0, weatherPanels: 0 };
  for (const building of BUILDINGS) {
    if (building.kind === "roof") continue;
    const points = building.points.map((point) => toWorld(point));
    if (points.length > 1 && Vector3.DistanceSquared(points[0], points[points.length - 1]) < 0.0001) points.pop();
    if (points.length < 3) continue;
    const signedArea = points.reduce((sum, a, i) => sum + a.x * points[(i + 1) % points.length].z - points[(i + 1) % points.length].x * a.z, 0);
    const orientation = signedArea > 0 ? 1 : -1;
    const art = createWallArt(scene, `mapped-${building.id}`);
    const apartments = building.kind === "apartments" || (building.levels ?? 1) > 1;
    let graffiti = 0, weather = 0;
    for (let edge = 0; edge < points.length; edge++) {
      const a = points[edge], b = points[(edge + 1) % points.length];
      const length = Vector3.Distance(a, b);
      if (length < 3.3) continue;
      const tangent = b.subtract(a).normalize();
      const normal = new Vector3(tangent.z * orientation, 0, -tangent.x * orientation);
      const count = Math.min(22, Math.max(1, Math.floor(length / (apartments ? 3.4 : 4.8))));
      const spacing = length / count;
      const at = (distance: number, y: number) => a.add(tangent.scale(distance)).add(new Vector3(0, y, 0));
      // These spans coincide with gaps between the world's regular ground-floor
      // window columns. The first even-edge gap contains a security gate.
      for (let gap = 1; gap < count; gap++) {
        const gate = edge % 2 === 0 && length >= 9 && gap === 1;
        if (gate) continue;
        const key = (Math.imul(building.id | 0, 19349663) ^ Math.imul(edge + 1, 73856093) ^ Math.imul(gap + 3, 83492791)) >>> 0;
        if (graffiti < 5 && (key % 4 === 0 || (graffiti === 0 && gap === count - 1))) {
          art.panel(at(gap * spacing, 1.25), tangent, normal, Math.min(2.1, spacing - (apartments ? 1.58 : 2)), 1.35, key, "graffiti");
          graffiti++;
        }
        if (weather < 8 && key % 3 === 1) {
          art.panel(at(gap * spacing, 0.72), tangent, normal, Math.min(1.35, spacing - 1.6), 1.18, key + 1, "weather");
          weather++;
        }
      }
      // The low wall skirt is clear of glazing, lettering/nameplates and gates.
      if (weather < 10 && length > 6) {
        const distance = (Math.min(count - 1, 2) + 0.5) * spacing;
        art.panel(at(distance, 0.48), tangent, normal, Math.min(3.9, spacing * 0.92), 0.63, building.id + edge * 31, "weather");
        weather++;
      }
    }
    const mesh = art.finish(scene);
    if (mesh) { meshes.push(mesh); stats.buildings++; stats.graffitiPanels += graffiti; stats.weatherPanels += weather; }
  }
  return { meshes, stats };
}
