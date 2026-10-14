import "./style.css";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Frustum } from "@babylonjs/core/Maths/math.frustum";
import "@babylonjs/core/Culling/ray";
import { gameCoordinates } from "../game/world/mapData";
import { PreviewInterface, type LightingPreset, type ViewPreset } from "./interface";
import { BUILDINGS, FIELDS, PREVIEW, ROADS, closestStreet } from "./map";
import { PreviewPlayer } from "./player";
import { buildWorld } from "./world";
import { buildScenery } from "./scenery";
import { PreviewSky } from "./atmosphere";

const ui = new PreviewInterface();

function startPreview() {
  const engine = new Engine(ui.canvas, true, { stencil: true }, false);
  // Cap render density on high-DPI screens; the scene stays full viewport size.
  engine.setHardwareScalingLevel(Math.max(1, window.devicePixelRatio / 1.5));
  const scene = new Scene(engine);
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogStart = 180;
  scene.fogEnd = 650;
  const world = buildWorld(scene);
  const scenery = buildScenery(scene);
  const sky = new PreviewSky(scene);
  const player = new PreviewPlayer(scene);
  const target = () => player.mesh.position.add(new Vector3(0, 1.1, 0));
  const views = { street: { beta: 1.18, radius: 18 }, overview: { beta: 0.72, radius: 48 } };
  let viewPreset: ViewPreset = "street";
  const camera = new ArcRotateCamera("following-camera", -Math.PI / 2, views.street.beta, views.street.radius, target(), scene);
  camera.lowerRadiusLimit = 8;
  camera.upperRadiusLimit = 90;
  camera.lowerBetaLimit = 0.2;
  camera.upperBetaLimit = 1.43;
  camera.minZ = 0.2;
  camera.maxZ = 850;
  camera.wheelPrecision = 12;
  camera.panningSensibility = 0;
  camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");
  const ambient = new HemisphericLight("sky-fill", Vector3.Up(), scene);
  const characterFill = new HemisphericLight("character-sky-fill", Vector3.Up(), scene);
  characterFill.includedOnlyMeshes = player.shadowCasters;
  characterFill.renderPriority = 1;
  characterFill.diffuse = new Color3(0.82, 0.9, 1);
  characterFill.groundColor = new Color3(0.26, 0.31, 0.35);
  characterFill.specular = Color3.Black();
  const sun = new DirectionalLight("afternoon-sun", new Vector3(-0.6, -0.65, 0.45), scene);
  sun.shadowFrustumSize = 135;
  sun.shadowMinZ = 1;
  sun.shadowMaxZ = 240;
  const shadows = new ShadowGenerator(1024, sun);
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = ShadowGenerator.QUALITY_LOW;
  shadows.bias = 0.003;
  shadows.normalBias = 0.02;
  for (const mesh of [...world.shadowCasters, ...scenery.shadowCasters, ...player.shadowCasters]) shadows.addShadowCaster(mesh);
  // An explicit shadow render list otherwise submits off-screen buildings too.
  const shadowFrustum = Frustum.GetPlanes(shadows.getTransformMatrix());
  shadows.customAllowRendering = (subMesh) => subMesh.getMesh().isInFrustum(shadowFrustum);
  // A small pool follows the nearest mapped-road decorative lamp positions.
  const streetlights = Array.from({ length: Math.min(2, world.lamps.length) }, (_, i) => {
    const light = new PointLight(`nearby-streetlight-${i}`, world.lamps[i].clone(), scene);
    light.diffuse = new Color3(1, 0.73, 0.37);
    light.range = 24;
    return light;
  });
  let lightingPreset: LightingPreset = "sunset";
  const lightScene = (preset: LightingPreset) => {
    lightingPreset = preset;
    const night = preset === "night", sunset = preset === "sunset";
    const horizon = Color3.FromHexString(night ? "#31404b" : sunset ? "#e8bc89" : "#d7dfd5");
    scene.clearColor = new Color4(horizon.r, horizon.g, horizon.b, 1);
    scene.fogColor = horizon;
    ambient.diffuse = Color3.FromHexString(night ? "#8ea8c9" : sunset ? "#dfd3b6" : "#e6f0ef");
    ambient.groundColor = Color3.FromHexString(night ? "#26303b" : "#756d59");
    ambient.intensity = night ? 0.62 : sunset ? 0.64 : 0.8;
    characterFill.setEnabled(night);
    characterFill.intensity = 0.6;
    sun.diffuse = Color3.FromHexString(night ? "#a7b7d5" : sunset ? "#ffd292" : "#fff7df");
    sun.intensity = night ? 0.12 : sunset ? 1.0 : 1.05;
    sun.direction.set(-0.6, sunset ? -0.36 : -0.8, 0.45).normalize();
    shadows.setDarkness(night ? 0.7 : 0.25);
    const occupancy = [0.7, 0.28, 0.08, 0.012];
    world.windowMaterials.forEach((material, i) => {
      material.emissiveColor = night ? new Color3(1, 0.63, 0.26).scale(occupancy[i]) : new Color3(0.008, 0.012, 0.014);
    });
    const lampGlass = scene.getMaterialByName("streetlamp-diffusers");
    if (lampGlass && "emissiveColor" in lampGlass) {
      (lampGlass as typeof world.windowMaterial).emissiveColor = night ? new Color3(1, 0.76, 0.36) : Color3.Black();
    }
    for (const light of streetlights) {
      light.setEnabled(night);
      light.intensity = 3.2;
    }
    sky.setLighting(preset);
    ui.setLighting(preset);
  };
  lightScene("sunset");

  const context = ui.minimap.getContext("2d")!;
  const background = document.createElement("canvas");
  background.width = ui.minimap.width;
  background.height = ui.minimap.height;
  const map = background.getContext("2d")!;
  const bounds = PREVIEW.bounds, margin = 8;
  const scale = Math.min((background.width - margin * 2) / bounds.w, (background.height - margin * 2) / bounds.h);
  const ox = (background.width - bounds.w * scale) / 2, oy = (background.height - bounds.h * scale) / 2;
  const path = (points: { x: number; y: number }[], close = false) => {
    points.forEach((p, i) => map[i ? "lineTo" : "moveTo"](ox + (p.x - bounds.minX) * scale, oy + (p.y - bounds.minY) * scale));
    if (close) map.closePath();
  };
  map.fillStyle = "#273d31"; map.fillRect(0, 0, background.width, background.height);
  map.fillStyle = "#4b6342";
  for (const field of FIELDS) { map.beginPath(); path(field.points, true); for (const hole of field.holes ?? []) path(hole, true); map.fill("evenodd"); }
  map.strokeStyle = "#85917b";
  for (const road of ROADS) { map.lineWidth = Math.max(0.7, road.width * scale); map.beginPath(); path(road.points); map.stroke(); }
  map.fillStyle = "#b0a78c";
  for (const building of BUILDINGS) { map.beginPath(); path(building.points, true); for (const hole of building.holes ?? []) path(hole, true); map.fill("evenodd"); }
  const updateLocation = () => {
    const p = player.position, geo = gameCoordinates(p.x, p.y);
    ui.status(closestStreet(p), `${geo.latitude.toFixed(6)}°, ${geo.longitude.toFixed(6)}°`);
    context.drawImage(background, 0, 0);
    const x = ox + (p.x - bounds.minX) * scale, y = oy + (p.y - bounds.minY) * scale;
    context.fillStyle = "#edbd59"; context.strokeStyle = "#172e26"; context.lineWidth = 2;
    context.beginPath(); context.arc(x, y, 4, 0, Math.PI * 2); context.fill(); context.stroke();
  };

  const keys = new Set<string>();
  const movementKeys = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"]);
  let started = false, paused = false, disposed = false, failed = false;
  let hudElapsed = 0;
  const setPaused = (value: boolean) => {
    if (!started || failed) return;
    paused = value;
    keys.clear();
    if (value) camera.detachControl(); else camera.attachControl(ui.canvas, true);
    ui.pause(value);
  };
  ui.onStart = () => { started = true; paused = false; keys.clear(); ui.start(); camera.attachControl(ui.canvas, true); };
  ui.onPause = () => setPaused(true);
  ui.onResume = () => setPaused(false);
  const recenter = () => {
    camera.inertialAlphaOffset = 0;
    camera.inertialBetaOffset = 0;
    camera.inertialRadiusOffset = 0;
    camera.alpha = -Math.PI / 2;
    camera.beta = views[viewPreset].beta;
    camera.radius = views[viewPreset].radius;
    camera.setTarget(target(), false, false, true);
  };
  ui.onRecenter = recenter;
  ui.onViewChanged = (preset) => { viewPreset = preset; ui.setView(preset); recenter(); };
  ui.setView(viewPreset);
  ui.onLightingChanged = lightScene;
  const keydown = (event: KeyboardEvent) => {
    if (!started || failed || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.code === "Escape" && !event.repeat) { event.preventDefault(); setPaused(!paused); }
    if (!paused && movementKeys.has(event.code)) { event.preventDefault(); keys.add(event.code); }
  };
  const keyup = (event: KeyboardEvent) => { keys.delete(event.code); };
  const blur = () => { keys.clear(); setPaused(true); };
  const visibility = () => { if (document.hidden) blur(); };
  const resize = () => engine.resize();
  window.addEventListener("keydown", keydown);
  window.addEventListener("keyup", keyup);
  window.addEventListener("blur", blur);
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", visibility);
  const fail = (error?: unknown) => {
    if (import.meta.env.DEV && error) console.error(error);
    failed = true;
    keys.clear();
    camera.detachControl();
    engine.stopRenderLoop();
    ui.error("The 3D preview couldn’t start. Check that your browser supports WebGL, or play the 2D game.");
  };
  const timeout = window.setTimeout(fail, 30_000);
  scene.whenReadyAsync().then(() => {
    if (!disposed && !failed) { window.clearTimeout(timeout); ui.ready(); }
  }).catch(fail);
  updateLocation();
  engine.runRenderLoop(() => {
    if (disposed || failed) return;
    try {
      const dt = Math.min(engine.getDeltaTime() / 1000, 0.1);
      if (started && !paused) {
        player.update(dt, keys, camera.getForwardRay().direction);
        camera.setTarget(Vector3.Lerp(camera.target, target(), Math.min(1, dt * 12)), false, false, true);
      }
      sun.position.copyFrom(target().subtract(sun.direction.scale(100)));
      Frustum.GetPlanesToRef(shadows.getTransformMatrix(), shadowFrustum);
      sky.update(camera.position, sun.direction);
      const nearby = [...world.lamps].sort((a, b) => Vector3.DistanceSquared(a, player.mesh.position) - Vector3.DistanceSquared(b, player.mesh.position));
      streetlights.forEach((light, i) => light.position.copyFrom(nearby[i]));
      hudElapsed += dt;
      if (hudElapsed >= 0.12) { updateLocation(); hudElapsed = 0; }
      scene.render();
    } catch (error) { fail(error); }
  });
  if (import.meta.env.DEV) {
    Object.assign(window, { __preview: { scene, engine, camera, player, world, scenery, get paused() { return paused; }, get lightingPreset() { return lightingPreset; }, get viewPreset() { return viewPreset; } } });
  }
  const pagehide = (event: PageTransitionEvent) => {
    if (event.persisted) blur();
    else dispose();
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    window.clearTimeout(timeout);
    window.removeEventListener("keydown", keydown);
    window.removeEventListener("keyup", keyup);
    window.removeEventListener("blur", blur);
    window.removeEventListener("resize", resize);
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("pagehide", pagehide);
    player.dispose(); scene.dispose(); engine.dispose();
  };
  window.addEventListener("pagehide", pagehide);
  if (import.meta.hot) import.meta.hot.dispose(dispose);
}

try { startPreview(); } catch (error) {
  if (import.meta.env.DEV) console.error(error);
  ui.error("Your browser couldn’t start WebGL. Try a browser with graphics acceleration, or play the 2D game.");
}
