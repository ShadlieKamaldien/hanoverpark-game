import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import type { MapPoint } from "../game/world/mapData";
import { toWorld } from "./map";

/** Decorative objective marker; it adds no obstacle, physics body or light. */
export function buildDeliveryMarker(scene: Scene) {
  const material = new StandardMaterial("delivery-objective-gold", scene);
  material.diffuseColor = Color3.FromHexString("#edbd59");
  material.emissiveColor = material.diffuseColor.scale(0.55);
  material.specularColor = Color3.Black();
  const ring = MeshBuilder.CreateTorus("delivery-objective-ring", { diameter: 2.4, thickness: 0.07, tessellation: 24 }, scene);
  const arrow = MeshBuilder.CreateCylinder("delivery-objective-arrow", {
    height: 0.65, diameterTop: 0.6, diameterBottom: 0, tessellation: 4,
  }, scene);
  for (const mesh of [ring, arrow]) { mesh.material = material; mesh.isPickable = false; mesh.setEnabled(false); }
  return {
    update(point: MapPoint | null) {
      ring.setEnabled(!!point); arrow.setEnabled(!!point);
      if (!point) return;
      ring.position.copyFrom(toWorld(point, 0.08));
      arrow.position.copyFrom(toWorld(point, 3.1));
    },
    dispose() { ring.dispose(); arrow.dispose(); material.dispose(); },
  };
}
