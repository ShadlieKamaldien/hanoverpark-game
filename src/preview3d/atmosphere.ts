import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { LightingPreset } from "./interface";

/** Original painted sky: no remote panorama, HDR, model or texture request. */
export class PreviewSky {
  private readonly dome: Mesh;
  private readonly sunDisc: Mesh;
  private readonly texture: DynamicTexture;
  private readonly sunMaterial: StandardMaterial;

  constructor(scene: Scene) {
    this.texture = new DynamicTexture("painted-coastal-sky", { width: 1024, height: 512 }, scene, false);
    const material = new StandardMaterial("painted-sky-material", scene);
    material.disableLighting = true;
    material.diffuseColor = Color3.Black();
    material.specularColor = Color3.Black();
    // StandardMaterial adds emissive colour to its texture rather than tinting it.
    material.emissiveColor = Color3.Black();
    material.emissiveTexture = this.texture;
    // Inward-facing triangles render the visible hemisphere once.
    material.backFaceCulling = true;
    this.dome = MeshBuilder.CreateSphere("coastal-sky-dome", { diameter: 1400, segments: 16, sideOrientation: Mesh.BACKSIDE }, scene);
    this.dome.material = material;
    this.dome.isPickable = false;
    this.dome.applyFog = false;
    this.dome.infiniteDistance = true;

    this.sunMaterial = new StandardMaterial("soft-sun-disc", scene);
    this.sunMaterial.disableLighting = true;
    this.sunMaterial.diffuseColor = Color3.Black();
    this.sunMaterial.specularColor = Color3.Black();
    this.sunDisc = MeshBuilder.CreateDisc("distant-sun", { radius: 5, tessellation: 24 }, scene);
    this.sunDisc.material = this.sunMaterial;
    this.sunDisc.billboardMode = Mesh.BILLBOARDMODE_ALL;
    this.sunDisc.isPickable = false;
    this.sunDisc.applyFog = false;
  }

  setLighting(preset: LightingPreset) {
    const context = this.texture.getContext() as CanvasRenderingContext2D;
    const night = preset === "night", sunset = preset === "sunset";
    const gradient = context.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, night ? "#0e1c30" : sunset ? "#68829d" : "#649cc6");
    gradient.addColorStop(0.42, night ? "#1c3045" : sunset ? "#c7ac96" : "#b6d0df");
    gradient.addColorStop(0.54, night ? "#31404b" : sunset ? "#e8bc89" : "#d7dfd5");
    gradient.addColorStop(1, night ? "#202d35" : sunset ? "#baab8e" : "#b9c7c2");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1024, 512);
    let seed = 41871;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 24; i++) {
      const x = random() * 1024, y = 95 + random() * 150;
      context.fillStyle = night ? "rgba(95,115,133,.08)" : sunset ? "rgba(230,213,191,.18)" : "rgba(242,246,241,.23)";
      context.beginPath();
      context.ellipse(x, y, 35 + random() * 110, 2 + random() * 8, 0, 0, Math.PI * 2);
      context.fill();
    }
    if (night) {
      for (let i = 0; i < 110; i++) {
        context.fillStyle = `rgba(211,221,231,${0.15 + random() * 0.42})`;
        context.fillRect(random() * 1024, random() * 195, 1.2, 1.2);
      }
    }
    this.texture.update(false);
    this.sunDisc.setEnabled(!night);
    this.sunMaterial.emissiveColor = Color3.FromHexString(sunset ? "#ffe0ad" : "#fff6dc");
  }

  update(cameraPosition: Vector3, sunDirection: Vector3) {
    this.sunDisc.position.copyFrom(cameraPosition.subtract(sunDirection.scale(580)));
  }
}
