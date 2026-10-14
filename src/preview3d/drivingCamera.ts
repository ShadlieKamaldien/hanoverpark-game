import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Ray } from "@babylonjs/core/Culling/ray";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { Scene } from "@babylonjs/core/scene";

/** Keep a driving orbit outside rendered walls without replacing the player's zoom. */
export class DrivingCamera {
  private readonly obstacles: AbstractMesh[];
  private readonly observer: Observer<Camera>;
  private readonly ray = new Ray(Vector3.Zero(), Vector3.Forward());
  private requestedRadius: number;
  private appliedRadius: number;
  private active = false;
  private dt = 0;

  constructor(private readonly camera: ArcRotateCamera, scene: Scene) {
    // Exact shell triangles retain court holes, open canopies, roof height and
    // thin garden walls. Include nearby tree crowns without testing every prop.
    this.obstacles = scene.meshes.filter((mesh) =>
      (mesh.name.startsWith("building-") &&
        (mesh.material?.name.startsWith("weathered-plaster-") || mesh.material?.name === "flat-concrete-roof")) ||
      (mesh.metadata?.weatheredProperty && mesh.metadata?.part === "shell") ||
      mesh.name === "scenery-bark" || mesh.name.startsWith("scenery-leaves-"));
    this.requestedRadius = this.appliedRadius = camera.radius;
    // Babylon applies wheel zoom and drag before this observer. Test the final
    // orbit before its view matrix is rendered, including the first entry frame.
    this.observer = camera.onAfterCheckInputsObservable.add(() => this.afterInputs());
  }

  /** Call when entering, recentering or choosing a view with a new zoom distance. */
  reset(radius: number) {
    this.requestedRadius = this.appliedRadius = this.userRadius(radius);
    this.camera.radius = this.appliedRadius;
  }

  /** Call each frame; disabling preserves the requested zoom across a pause. */
  update(dt: number, active: boolean) {
    this.active = active;
    this.dt = Math.max(0, Math.min(dt, 0.1));
    if (active && Math.abs(this.camera.radius - this.appliedRadius) > 0.00001) {
      // Also support deliberate external camera/view changes. Our own wall
      // correction was recorded in appliedRadius and never becomes a zoom request.
      this.requestedRadius = this.userRadius(this.camera.radius);
      this.appliedRadius = this.camera.radius;
    }
  }

  private userRadius(radius: number) {
    return Math.max(this.camera.lowerRadiusLimit ?? 2, Math.min(this.camera.upperRadiusLimit ?? 90, radius));
  }

  private afterInputs() {
    if (!this.active) return;
    // ArcRotate clamps to its zoom limits before notifying us. A very close
    // wall may require a shorter temporary radius than the user's zoom minimum;
    // do not mistake that automatic clamp for a fresh wheel input next frame.
    const inputDelta = this.camera.radius - this.userRadius(this.appliedRadius);
    this.requestedRadius = this.userRadius(this.requestedRadius + inputDelta);
    const sinBeta = Math.sin(this.camera.beta);
    this.ray.origin.copyFrom(this.camera.target);
    this.ray.direction.set(Math.cos(this.camera.alpha) * sinBeta, Math.cos(this.camera.beta),
      Math.sin(this.camera.alpha) * sinBeta).normalize();
    this.ray.length = this.requestedRadius;
    let allowedRadius = this.requestedRadius;
    for (const mesh of this.obstacles) {
      if (mesh.isDisposed() || !mesh.isEnabled() || !mesh.isVisible) continue;
      const hit = this.ray.intersectsMesh(mesh, false);
      if (hit.hit) allowedRadius = Math.min(allowedRadius, Math.max(0.6, hit.distance - 0.5));
    }
    // Contract immediately so a wall never occludes an intervening frame;
    // extend gradually as the car or player's orbit clears the obstruction.
    const restored = this.camera.radius + (this.requestedRadius - this.camera.radius) * (1 - Math.exp(-this.dt * 5));
    this.camera.radius = this.appliedRadius = Math.min(allowedRadius, restored);
  }

  dispose() {
    this.active = false;
    this.camera.onAfterCheckInputsObservable.remove(this.observer);
  }
}
