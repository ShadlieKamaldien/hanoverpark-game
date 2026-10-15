import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { Batch } from "./geometry";
import { BUILDINGS, toWorld } from "./map";
import { PLACES, STOREFRONTS, type MappedPlace, type StorefrontAnchor } from "./places";
import type { LightingPreset } from "./interface";

type Region = { x: number; y: number; width: number; height: number };
type Style = { title: string; subtitle: string; colour: string; ink: string; row: number };
const SIZE = 1024, ROW = 128;
const STYLES: Record<string, Style> = {
  "osm-node-2119093639": { title: "SHOPRITE", subtitle: "LANSDOWNE CORNER", colour: "#c32632", ink: "#fff9e9", row: 0 },
  "osm-node-2119095799": { title: "Clicks", subtitle: "LANSDOWNE", colour: "#156da1", ink: "#fbfaf0", row: 1 },
  "osm-node-13912423531": { title: "ASTRON ENERGY", subtitle: "LANSDOWNE CORNER", colour: "#d64b26", ink: "#fff6dd", row: 2 },
  "osm-way-747351793": { title: "CALTEX", subtitle: "", colour: "#bd2835", ink: "#fff8e9", row: 3 },
  "osm-way-1272576243": { title: "KFC", subtitle: "WETTON", colour: "#b82d36", ink: "#fff8e9", row: 4 },
  "osm-way-1272576267": { title: "McDonald's", subtitle: "", colour: "#353d3c", ink: "#f3c74b", row: 5 },
};
const COLOURS = ["#d6d4bf", "#344449", "#66858a", "#202f32", "#9b9c8e", "#e1d6ac", "#554d40", "#4a615e"];
const colourRegion = (index: number): Region => ({ x: index * 128 + 5, y: ROW * 7 + 5, width: 118, height: 118 });
const signRegion = (row: number): Region => ({ x: 5, y: row * ROW + 5, width: SIZE - 10, height: ROW - 10 });
const windowRegion: Region = { x: 5, y: ROW * 6 + 5, width: 374, height: ROW - 10 };

function createAtlas(scene: Scene) {
  const texture = new DynamicTexture("original-mapped-shop-atlas", { width: SIZE, height: SIZE }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
  texture.wrapU = Texture.CLAMP_ADDRESSMODE; texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  texture.anisotropicFilteringLevel = 4;
  const context = texture.getContext() as CanvasRenderingContext2D;
  context.fillStyle = "#d2d0bc"; context.fillRect(0, 0, SIZE, SIZE);
  for (const style of Object.values(STYLES)) {
    const y = style.row * ROW;
    context.fillStyle = style.colour; context.fillRect(0, y, SIZE, ROW);
    context.fillStyle = "rgba(255,250,223,.14)"; context.fillRect(0, y + 5, SIZE, 3);
    context.fillStyle = style.ink;
    context.textAlign = "center"; context.textBaseline = "middle";
    context.font = `700 ${style.subtitle ? 79 : 89}px sans-serif`;
    context.fillText(style.title, SIZE / 2, y + (style.subtitle ? 50 : 66), SIZE - 70);
    if (style.subtitle) {
      context.font = "600 22px sans-serif";
      context.fillText(style.subtitle, SIZE / 2, y + 104, SIZE - 70);
    }
    context.fillStyle = "rgba(33,39,31,.18)"; context.fillRect(0, y + ROW - 7, SIZE, 4);
  }
  // A shallow opaque shop window: original reflections, shelves and stock shapes.
  // These panels illustrate a facade; they do not claim surveyed interiors.
  const y = ROW * 6;
  const glass = context.createLinearGradient(0, y, 0, y + ROW);
  glass.addColorStop(0, "#8ca7aa"); glass.addColorStop(0.42, "#536c70"); glass.addColorStop(1, "#304446");
  context.fillStyle = glass; context.fillRect(0, y, 384, ROW);
  context.fillStyle = "rgba(32,39,34,.55)"; context.fillRect(12, y + 56, 360, 65);
  for (let shelf = 0; shelf < 2; shelf++) {
    context.fillStyle = "#a5a693"; context.fillRect(20, y + 83 + shelf * 26, 340, 3);
    for (let item = 0; item < 18; item++) {
      context.fillStyle = ["#afaa7b", "#a16f54", "#899b71", "#ad9b87"][item % 4];
      context.fillRect(23 + item * 18, y + 68 + shelf * 26, 10, 14);
    }
  }
  context.fillStyle = "rgba(210,227,213,.16)";
  context.beginPath(); context.moveTo(12, y + 5); context.lineTo(65, y + 5); context.lineTo(198, y + 123); context.lineTo(143, y + 123); context.fill();
  for (let index = 0; index < COLOURS.length; index++) {
    context.fillStyle = COLOURS[index]; context.fillRect(index * 128, ROW * 7, 128, ROW);
  }
  // Canvas top rows become the corresponding atlas regions in bottom-up UVs.
  texture.update(true);
  const surfaces = new StandardMaterial("shared-mapped-shop-surfaces", scene);
  surfaces.diffuseTexture = texture; surfaces.diffuseColor = Color3.White();
  surfaces.specularColor = new Color3(0.05, 0.05, 0.045);
  surfaces.maxSimultaneousLights = 3;
  const signs = new StandardMaterial("shared-mapped-shop-signs", scene);
  signs.diffuseTexture = texture; signs.diffuseColor = Color3.White();
  signs.specularColor = Color3.Black(); signs.maxSimultaneousLights = 3;
  signs.emissiveTexture = texture;
  signs.emissiveColor = new Color3(0.04, 0.04, 0.035);
  return { texture, surfaces, signs };
}

class ShopBatch extends Batch {
  private region: Region = colourRegion(0);
  paint(region: Region, draw: () => void) {
    const before = this.region; this.region = region; draw(); this.region = before;
  }
  override quad(points: Vector3[], normal: Vector3) {
    const before = this.uvs.length;
    super.quad(points, normal);
    const region = this.region;
    for (let i = before; i < this.uvs.length; i += 2) {
      this.uvs[i] = (region.x + this.uvs[i] * region.width) / SIZE;
      this.uvs[i + 1] = 1 - (region.y + (1 - this.uvs[i + 1]) * region.height) / SIZE;
    }
  }
}

function plate(batch: ShopBatch, region: Region, centre: Vector3, tangent: Vector3, normal: Vector3, width: number, height: number) {
  batch.paint(region, () => batch.quad([
    centre.subtract(tangent.scale(width / 2)).add(new Vector3(0, -height / 2, 0)),
    centre.add(tangent.scale(width / 2)).add(new Vector3(0, -height / 2, 0)),
    centre.add(tangent.scale(width / 2)).add(new Vector3(0, height / 2, 0)),
    centre.subtract(tangent.scale(width / 2)).add(new Vector3(0, height / 2, 0)),
  ], normal));
}

function storefront(place: MappedPlace, anchor: StorefrontAnchor, surfaces: ShopBatch, signs: ShopBatch, details: ShopBatch) {
  const style = STYLES[place.id];
  const origin = toWorld(anchor.point);
  const tangent = new Vector3(anchor.tangent.x, 0, -anchor.tangent.y);
  const normal = new Vector3(anchor.normal.x, 0, -anchor.normal.y);
  const at = (along: number, height: number, out: number) => origin.add(tangent.scale(along)).add(normal.scale(out)).add(new Vector3(0, height, 0));
  const width = Math.min(anchor.width, 9);
  // Existing generic window strips project 0.20m from the source wall.
  // The shallow shop treatment covers them without opening the solid hull.
  plate(surfaces, colourRegion(0), at(0, 1.52, 0.22), tangent, normal, width + 0.12, 2.94);
  plate(signs, signRegion(style.row), at(0, 2.58, 0.275), tangent, normal, width, 0.86);
  const panes = Math.max(2, Math.floor(width / 2.1)), span = width / panes;
  for (let pane = 0; pane < panes; pane++) {
    const x = -width / 2 + (pane + 0.5) * span;
    plate(surfaces, windowRegion, at(x, 1.12, 0.245), tangent, normal, span - 0.13, 1.72);
    plate(details, colourRegion(1), at(x - span / 2 + 0.03, 1.15, 0.265), tangent, normal, 0.055, 1.83);
    plate(details, colourRegion(0), at(x, 0.22, 0.266), tangent, normal, span, 0.12);
  }
  // The central pair reads as a closed glazed entrance, not a traversable door.
  for (const side of [-1, 1]) {
    const x = side * 0.53;
    plate(details, colourRegion(3), at(x, 1.11, 0.283), tangent, normal, 0.98, 1.79);
    plate(details, windowRegion, at(x, 1.26, 0.289), tangent, normal, 0.86, 1.45);
    plate(details, colourRegion(0), at(side * 0.12, 1.01, 0.301), tangent, normal, 0.035, 0.34);
  }
  const stripe = signRegion(style.row);
  // A slim shelter remains above walking head height and within a metre of the wall.
  surfaces.paint(colourRegion(4), () => surfaces.box(at(0, 2.12, 0.64), width + 0.16, 0.08, 0.88, tangent, normal));
  plate(signs, { ...stripe, y: style.row * ROW + 9, height: 3 }, at(0, 2.08, 1.085), tangent, normal, width + 0.16, 0.16);
}

function fuelCanopy(place: MappedPlace, anchor: StorefrontAnchor, surfaces: ShopBatch, signs: ShopBatch, details: ShopBatch) {
  const style = STYLES[place.id], building = BUILDINGS.find((item) => item.id === anchor.buildingId)!;
  const points = building.points.map((point) => toWorld(point));
  if (points.length > 1 && Vector3.Distance(points[0], points[points.length - 1]) < 0.001) points.pop();
  const orientation = points.reduce((sum, a, i) => {
    const b = points[(i + 1) % points.length]; return sum + a.x * b.z - b.x * a.z;
  }, 0) > 0 ? 1 : -1;
  for (let index = 0; index < points.length; index++) {
    const a = points[index], b = points[(index + 1) % points.length];
    const length = Vector3.Distance(a, b); if (length < 0.1) continue;
    const tangent = b.subtract(a).normalize(), normal = new Vector3(tangent.z * orientation, 0, -tangent.x * orientation);
    const centre = a.add(b).scale(0.5).add(normal.scale(0.09)).add(new Vector3(0, 3.45, 0));
    plate(signs, { x: 6, y: style.row * ROW + 10, width: 2, height: 2 }, centre, tangent, normal, length, 0.32);
    plate(surfaces, colourRegion(0), centre.add(new Vector3(0, -0.22, 0)), tangent, normal, length, 0.09);
  }
  const tangent = new Vector3(anchor.tangent.x, 0, -anchor.tangent.y);
  const normal = new Vector3(anchor.normal.x, 0, -anchor.normal.y);
  plate(signs, signRegion(style.row), toWorld(anchor.point, 3.47).add(normal.scale(0.112)), tangent, normal, Math.min(anchor.width, 7), 0.59);
  // Pumps remain inside the already mapped canopy footprint, adding no collision
  // areas or roadside furniture. Their placement is original illustrative detail.
  const longest = points.map((a, i) => ({ a, b: points[(i + 1) % points.length] }))
    .sort((a, b) => Vector3.Distance(b.a, b.b) - Vector3.Distance(a.a, a.b))[0];
  const along = longest.b.subtract(longest.a).normalize(), across = new Vector3(-along.z, 0, along.x);
  const centre = points.reduce((sum, point) => sum.add(point), Vector3.Zero()).scale(1 / points.length);
  for (const offset of [-4.1, 4.1]) {
    const base = centre.add(along.scale(offset));
    surfaces.paint(colourRegion(0), () => surfaces.box(base.add(new Vector3(0, 0.69, 0)), 0.64, 1.38, 0.5, along, across, false));
    surfaces.paint(colourRegion(4), () => surfaces.box(base.add(new Vector3(0, 0.05, 0)), 1.08, 0.1, 0.85, along, across, false));
    for (const side of [-1, 1]) {
      plate(details, colourRegion(3), base.add(across.scale(side * 0.257)).add(new Vector3(0, 1.05, 0)), along.scale(side), across.scale(side), 0.43, 0.3);
      plate(details, colourRegion(5), base.add(across.scale(side * 0.266)).add(new Vector3(0, 1.08, 0)), along.scale(side), across.scale(side), 0.26, 0.06);
    }
  }
}

function exactPoiMarker(place: MappedPlace, signs: ShopBatch) {
  // No mapped footprint exists here: keep a compact sign over the exact POI,
  // without fabricating a restaurant building, entrance, plot or drive-through.
  const centre = toWorld(place.point, 3.15), width = 5.4;
  for (const side of [-1, 1]) plate(signs, signRegion(STYLES[place.id].row), centre.add(new Vector3(0, 0, side * 0.025)),
    new Vector3(-side, 0, 0), new Vector3(0, 0, side), width, 0.72);
}

/** Six source-mapped businesses share one original atlas and two materials. */
export function buildShops(scene: Scene) {
  const atlas = createAtlas(scene);
  const meshes: Mesh[] = [], shadowCasters: AbstractMesh[] = [];
  for (const place of PLACES.filter((item) => item.inPreview)) {
    if (!STYLES[place.id]) continue;
    const anchor = STOREFRONTS.find((item) => item.placeId === place.id);
    const surfaces = new ShopBatch(`mapped-shop-${place.id}-surfaces`, atlas.surfaces);
    const signs = new ShopBatch(`mapped-shop-${place.id}-signs`, atlas.signs);
    const details = new ShopBatch(`mapped-shop-${place.id}-details`, atlas.surfaces);
    if (anchor) {
      if (place.kind === "fuel") fuelCanopy(place, anchor, surfaces, signs, details);
      else storefront(place, anchor, surfaces, signs, details);
    } else exactPoiMarker(place, signs);
    for (const [part, batch, distance] of [["surfaces", surfaces, 200], ["signs", signs, 350], ["details", details, 90]] as const) {
      const mesh = batch.finish(scene); if (!mesh) continue;
      mesh.metadata = { mappedPlace: place.id, sourceId: place.sourceId, osmType: place.osmType,
        ...(anchor ? { buildingId: anchor.buildingId } : {}), part, originalArt: true,
        decorative: true, placement: anchor ? "mapped-facade" : "exact-poi-marker" };
      mesh.addLODLevel(distance + mesh.getBoundingInfo().boundingSphere.radiusWorld, null);
      meshes.push(mesh);
      if (anchor && part === "surfaces") shadowCasters.push(mesh);
    }
  }
  return {
    meshes, shadowCasters,
    stats: { places: PLACES.length, inPreview: PLACES.filter((place) => place.inPreview).length,
      storefronts: STOREFRONTS.length, meshes: meshes.length, materials: 2, textures: 1 },
    setLighting(preset: LightingPreset) {
      const level = preset === "night" ? 0.55 : preset === "sunset" ? 0.13 : 0.025;
      atlas.signs.emissiveColor.set(level, level, level * 0.94);
    },
    dispose() {
      for (const mesh of meshes) mesh.dispose(false, false);
      atlas.surfaces.dispose(false, false); atlas.signs.dispose(false, false); atlas.texture.dispose();
    },
  };
}
