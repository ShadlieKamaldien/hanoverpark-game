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
import { gameCoordinates, type MapPoint } from "../game/world/mapData";
import { Collision } from "../game/systems/collision";
import { PreviewInterface, type LightingPreset, type ViewPreset } from "./interface";
import { BUILDINGS, PREVIEW, SOURCE, closestStreet } from "./map";
import { PreviewPlayer } from "./player";
import { NeighbourhoodNpcs, type Conversation } from "./npcs";
import { buildWorld } from "./world";
import { buildScenery } from "./scenery";
import { PreviewSky } from "./atmosphere";
import { buildProperties } from "./propertiesWorld";
import { buildMappedWallArt } from "./wallArt";
import { Traffic } from "./traffic";
import { CREWS } from "./crews";
import { DriveableCar } from "./driveableCar";
import { DrivingCamera } from "./drivingCamera";
import { BrainClient } from "./brainClient";
import { PLACES, SHOPRITE_APPROACH } from "./places";
import { buildShops } from "./shopsWorld";
import { PROPERTY_SOLIDS } from "./properties";
import { DeliveryJob, DELIVERY_VENDOR_ID, type DeliveryActionContext } from "./delivery";
import { NeighbourhoodMaps } from "./neighbourhoodMaps";
import { buildDeliveryMarker } from "./deliveryMarker";

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
  const properties = buildProperties(scene);
  const wallArt = buildMappedWallArt(scene);
  const scenery = buildScenery(scene);
  const shops = buildShops(scene);
  const sky = new PreviewSky(scene);
  const player = new PreviewPlayer(scene);
  const npcs = new NeighbourhoodNpcs(scene);
  const brains = new BrainClient(npcs);
  const traffic = new Traffic(scene);
  const car = new DriveableCar(scene);
  const delivery = new DeliveryJob({ mapId: SOURCE.id, pixelsPerMetre: SOURCE.projection.pixelsPerMetre,
    collectionPoint: SHOPRITE_APPROACH,
    vendorPosition: () => npcs.actors.find((entity) => entity.id === DELIVERY_VENDOR_ID)?.position });
  const deliveryMarker = buildDeliveryMarker(scene);
  const maps = new NeighbourhoodMaps(ui.minimap, ui.areaMap, properties.placements.map((property) => property.footprint));
  const interactionCollision = new Collision([], [...BUILDINGS.map((building) => ({ points: building.points, holes: building.holes })), ...PROPERTY_SOLIDS]);
  const target = () => (car.occupied ? car.actor.root.position : player.mesh.position).add(new Vector3(0, 1.1, 0));
  const views = { street: { beta: 1.26, radius: 6.5 }, overview: { beta: 0.72, radius: 48 } };
  const drivingViews = { street: { beta: 1.12, radius: 12 }, overview: views.overview };
  let viewPreset: ViewPreset = "street";
  const camera = new ArcRotateCamera("following-camera", -Math.PI / 2, views.street.beta, views.street.radius, target(), scene);
  camera.lowerRadiusLimit = 2;
  camera.upperRadiusLimit = 90;
  camera.lowerBetaLimit = 0.2;
  camera.upperBetaLimit = 1.43;
  camera.minZ = 0.2;
  camera.maxZ = 850;
  camera.wheelPrecision = 12;
  camera.panningSensibility = 0;
  camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");
  const drivingCamera = new DrivingCamera(camera, scene);
  const ambient = new HemisphericLight("sky-fill", Vector3.Up(), scene);
  const characterFill = new HemisphericLight("character-sky-fill", Vector3.Up(), scene);
  characterFill.includedOnlyMeshes = [...player.shadowCasters, ...npcs.shadowCasters, ...traffic.shadowCasters, ...car.shadowCasters];
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
  for (const mesh of [...world.shadowCasters, ...properties.shadowCasters, ...scenery.shadowCasters, ...shops.shadowCasters, ...player.shadowCasters, ...traffic.shadowCasters, ...car.shadowCasters]) shadows.addShadowCaster(mesh);
  // The merged body gives each neighbour a silhouette without five shadow draws.
  for (const entity of npcs.actors) shadows.addShadowCaster(entity.actor.shadowCasters[0]);
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
    traffic.setLighting(preset);
    car.setLighting(preset);
    shops.setLighting(preset);
    ui.setLighting(preset);
  };
  lightScene("sunset");

  const vendor = () => npcs.actors.find((entity) => entity.id === DELIVERY_VENDOR_ID);
  const objectivePosition = (): MapPoint | null => {
    const phase = delivery.state.phase;
    return phase === "complete" ? null : phase === "collect" ? SHOPRITE_APPROACH : vendor()?.position ?? null;
  };
  const objectiveText = () => ({
    available: "Speak to Zeem about a stock run",
    collect: "Collect stock near Shoprite Lansdowne Corner",
    return: "Bring the stock back to Zeem",
    complete: "Stock delivered · R150 earned",
  })[delivery.state.phase];
  const deliveryFacts = () => ({
    available: "I can offer you a stock collection near Shoprite Lansdowne Corner for R150. You have not accepted it yet.",
    collect: "You accepted my R150 stock job. Collect the groceries at the pickup point near Shoprite Lansdowne Corner.",
    return: "You have collected my stock. Bring it back to my stall and I will pay you R150.",
    complete: delivery.state.vendorMemory!,
  })[delivery.state.phase];
  const syncDeliveryFacts = () => npcs.setKnownFact(DELIVERY_VENDOR_ID, deliveryFacts());
  const actionContext = (point: MapPoint | undefined): DeliveryActionContext => {
    let clearSight = !!point && Math.hypot(player.position.x - point.x, player.position.y - point.y) <= 3.5 / PREVIEW.metresPerPixel;
    if (clearSight && point) {
      const vehicles = new Collision([], [...traffic.solids, car.solid]);
      const steps = Math.max(1, Math.ceil(Math.hypot(player.position.x - point.x, player.position.y - point.y)));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps, x = player.position.x + (point.x - player.position.x) * t,
          y = player.position.y + (point.y - player.position.y) * t;
        if (interactionCollision.blocked(x, y, 0.1) || vehicles.blocked(x, y, 0.1)) { clearSight = false; break; }
      }
    }
    return { player: player.position, onFoot: !car.occupied, clearSight, active: started && !paused && !ui.mapOpen && !failed };
  };
  const missionConversation = (conversation: Conversation, message?: string): Conversation => {
    if (npcs.activeNPC?.id !== DELIVERY_VENDOR_ID) return conversation;
    const phase = delivery.state.phase;
    const choice = phase === "available" ? { id: "delivery-accept", label: "Take the stock collection · R150" }
      : phase === "return" ? { id: "delivery-complete", label: "Hand over the stock · collect R150" }
      : { id: "delivery-info", label: phase === "complete" ? "About the completed job" : "Remind me where to collect" };
    const details = phase === "available"
      ? "Awe, my bru. Can you fetch a box of groceries from the pickup point near Shoprite Lansdowne Corner? Bring it back to my stall and I'll pay you R150."
      : phase === "collect" ? "The stock pickup near Shoprite Lansdowne Corner is marked on your map. Step out of the car and press E at the marker to collect it."
      : phase === "return" ? "You've got my stock. Hand it over here and we'll sort your R150."
      : "Sharp, bru. You brought my stock back safely. Your R150 is paid, and I remember the help.";
    return { ...conversation, text: message ?? conversation.text + "\n\n" + details, choices: [choice, ...conversation.choices] };
  };
  const updateMapPlaces = () => ui.setMapPlaces(PLACES.map((place) => ({ id: place.id, name: place.name,
    kind: place.kind, insidePreview: place.inPreview,
    distance: Math.hypot(place.point.x - player.position.x, place.point.y - player.position.y) * PREVIEW.metresPerPixel })));
  const updateLocation = () => {
    const p = player.position, geo = gameCoordinates(p.x, p.y), state = delivery.state, objective = objectivePosition();
    ui.status(closestStreet(p), geo.latitude.toFixed(6) + "°, " + geo.longitude.toFixed(6) + "°");
    maps.draw({ player: p, people: npcs.actors.map((person) => person.position),
      traffic: traffic.vehicles.map((vehicle) => vehicle.position), car: car.position, objective }, ui.mapOpen);
    deliveryMarker.update(objective);
    ui.deliveryStatus({ phase: state.phase, money: state.money, reputation: state.rep,
      objective: objectiveText(), distance: objective ? Math.hypot(p.x - objective.x, p.y - objective.y) * PREVIEW.metresPerPixel : undefined,
      message: state.phase === "available" ? "Collection job · R150 · M opens the map"
        : state.phase === "return" ? "Stock is with you. Return on foot to hand it over." : undefined,
      saveProblem: state.saveWarning ?? undefined });
    const crewState = npcs.crewState;
    const crew = CREWS.find((entry) => entry.id === crewState.affiliation);
    player.setCrewColour(crew?.colour ?? null);
    ui.crewStatus(crewState, crew?.name);
    ui.vehicleStatus({ driving: car.occupied, speed: car.speed,
      gear: Math.abs(car.speed) < 0.05 ? "park" : car.speed < 0 ? "reverse" : "forward",
      message: car.exitMessage });
    updateNpcPlan();
  };

  const updateNpcPlan = () => {
    const id = ui.dialogueOpen ? npcs.activeNPC?.id : undefined;
    const state = id ? npcs.brainStates.find((entry) => entry.npcId === id) : null;
    ui.setNpcBrain(state ? { goalLabel: state.goal.label, stage: state.stage,
      progress: state.progress, source: state.source, say: state.say } : null);
  };

  const keys = new Set<string>();
  const movementKeys = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight", "Space"]);
  let started = false, paused = false, disposed = false, failed = false;
  let hudElapsed = 0;
  let chatSerial = 0;
  let orbitHeld = false, orbitGrace = 0;
  const stopCameraDrift = () => {
    camera.inertialAlphaOffset = 0;
    camera.inertialBetaOffset = 0;
    camera.inertialRadiusOffset = 0;
  };
  const closeConversation = () => {
    keys.clear();
    chatSerial++;
    brains.cancelChat();
    npcs.close();
    ui.closeDialogue();
    ui.clearChat();
    ui.setNpcBrain(null);
    if (started && !paused && !failed && !ui.mapOpen) camera.attachControl(ui.canvas, true);
  };
  const openConversation = () => {
    if (!started || paused || failed || ui.dialogueOpen || ui.mapOpen || car.occupied) return;
    const conversation = npcs.interact(player.position);
    if (!conversation) return;
    keys.clear();
    chatSerial++;
    brains.cancelChat();
    ui.clearChat();
    camera.detachControl();
    camera.inertialAlphaOffset = 0;
    camera.inertialBetaOffset = 0;
    camera.inertialRadiusOffset = 0;
    ui.prompt(null);
    ui.dialogue(missionConversation(conversation));
    updateNpcPlan();
  };
  const interactionPrompt = () => {
    if (!started || paused || failed || ui.dialogueOpen || ui.mapOpen) return null;
    if (car.occupied) return "E · Exit hatchback";
    if (delivery.canCollect(actionContext(SHOPRITE_APPROACH))) return "E · Collect Zeem's stock";
    if (car.canEnter(player.position)) return "E · Drive hatchback";
    const neighbour = npcs.nearest(player.position);
    return neighbour ? `E · Speak to ${neighbour.name}` : null;
  };
  const interact = () => {
    if (!started || paused || failed || ui.dialogueOpen || ui.mapOpen) return;
    if (car.occupied) {
      const exit = car.exit(traffic.solids, npcs.actors.map((entity) => entity.position));
      if (exit) { keys.clear(); player.leaveVehicle(exit); recenter(); }
    } else if (delivery.collect(actionContext(SHOPRITE_APPROACH))) {
      keys.clear(); syncDeliveryFacts();
    } else if (car.canEnter(player.position) && car.enter(player.position)) {
      keys.clear(); player.ride(car.position, car.heading); recenter();
    } else openConversation();
    updateLocation();
    ui.prompt(interactionPrompt());
  };
  ui.onInteract = interact;
  ui.onMapOpen = () => {
    keys.clear(); chatSerial++; brains.suspend();
    stopCameraDrift(); orbitHeld = false; orbitGrace = 0;
    camera.detachControl(); ui.prompt(null); updateMapPlaces();
    maps.draw({ player: player.position, people: npcs.actors.map((person) => person.position),
      traffic: traffic.vehicles.map((vehicle) => vehicle.position), car: car.position, objective: objectivePosition() }, true);
  };
  ui.onMapClose = () => {
    keys.clear(); stopCameraDrift(); orbitHeld = false; orbitGrace = 0;
    if (started && !paused && !failed && !ui.dialogueOpen) camera.attachControl(ui.canvas, true);
    updateLocation(); ui.prompt(interactionPrompt());
  };
  ui.onDialogueChoice = (id) => {
    keys.clear();
    chatSerial++;
    brains.cancelChat();
    ui.chatPending(false);
    if (id.startsWith("delivery-") && npcs.activeNPC?.id === DELIVERY_VENDOR_ID) {
      let message: string | undefined;
      const context = actionContext(vendor()?.position);
      if (id === "delivery-accept") {
        message = delivery.accept(context) ? "Sharp. The stock pickup near Shoprite Lansdowne Corner is marked on your map. Bring it back here for R150."
          : "Come a little closer to the stall before we sort out the stock run.";
      } else if (id === "delivery-complete") {
        message = delivery.complete(context) ? "Lekker, my bru. Stock is sorted. Here's your R150. I remember who helped me."
          : "Bring the stock right up to the stall on foot and I'll pay you.";
      }
      syncDeliveryFacts();
      if (npcs.activeConversation) ui.dialogue(missionConversation(npcs.activeConversation, message));
      updateLocation();
      return;
    }
    const conversation = npcs.choose(id);
    if (conversation) { ui.dialogue(missionConversation(conversation)); updateNpcPlan(); }
    else closeConversation();
  };
  ui.onDialogueClose = closeConversation;
  ui.onChatSubmit = async (text) => {
    const entity = npcs.activeNPC;
    if (!started || paused || failed || disposed || ui.mapOpen || !ui.dialogueOpen || !entity) return;
    const serial = ++chatSerial;
    ui.chatPending(true);
    try {
      const reply = await brains.chat(entity.id, text);
      if (serial !== chatSerial || disposed || failed || paused ||
        !ui.dialogueOpen || npcs.activeNPC?.id !== entity.id) return;
      ui.chatReply(reply.say, reply.source);
      updateNpcPlan();
    } catch {
      if (serial === chatSerial && !disposed && !failed && !paused && ui.dialogueOpen &&
        npcs.activeNPC?.id === entity.id) ui.chatReply(npcs.localBrainReply(entity.id, text), "local");
    } finally {
      if (serial === chatSerial && !disposed && !failed && !paused && ui.dialogueOpen) ui.chatPending(false);
    }
  };
  const setPaused = (value: boolean) => {
    if (!started || failed) return;
    paused = value;
    keys.clear();
    if (value) brains.suspend();
    stopCameraDrift();
    orbitHeld = false;
    if (value) { ui.closeMap(); closeConversation(); ui.prompt(null); }
    if (value) camera.detachControl(); else camera.attachControl(ui.canvas, true);
    ui.pause(value);
  };
  ui.onStart = () => { started = true; paused = false; keys.clear(); ui.start(); camera.attachControl(ui.canvas, true); };
  ui.onPause = () => setPaused(true);
  ui.onResume = () => setPaused(false);
  const recenter = () => {
    stopCameraDrift();
    orbitGrace = 0;
    camera.alpha = -Math.PI / 2 - (car.occupied ? car.heading : 0);
    const view = (car.occupied ? drivingViews : views)[viewPreset];
    camera.lowerRadiusLimit = 2;
    camera.beta = view.beta;
    camera.radius = view.radius;
    drivingCamera.reset(view.radius);
    camera.setTarget(target(), false, false, true);
  };
  ui.onRecenter = recenter;
  ui.onViewChanged = (preset) => { viewPreset = preset; ui.setView(preset); recenter(); };
  ui.setView(viewPreset);
  ui.onLightingChanged = lightScene;
  const keydown = (event: KeyboardEvent) => {
    if (!started || failed || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.code === "Escape" && !event.repeat) {
      event.preventDefault();
      if (ui.mapOpen) ui.closeMap();
      else if (ui.dialogueOpen) closeConversation(); else setPaused(!paused);
      return;
    }
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.code === "KeyM" && !event.repeat) {
      event.preventDefault();
      if (ui.mapOpen) ui.closeMap(); else if (!paused) ui.openMap();
      return;
    }
    if (ui.mapOpen) return;
    if (event.code === "KeyE" && !event.repeat) { event.preventDefault(); interact(); return; }
    if (!paused && !ui.dialogueOpen && movementKeys.has(event.code)) { event.preventDefault(); keys.add(event.code); }
  };
  const keyup = (event: KeyboardEvent) => { keys.delete(event.code); };
  const blur = () => { keys.clear(); setPaused(true); };
  const visibility = () => { if (document.hidden) blur(); };
  const resize = () => engine.resize();
  const orbitStart = () => { if (started && !paused && !ui.dialogueOpen && !ui.mapOpen) { orbitHeld = true; orbitGrace = 2; } };
  const orbitEnd = () => { if (orbitHeld) { orbitHeld = false; orbitGrace = 2; } };
  window.addEventListener("keydown", keydown);
  window.addEventListener("keyup", keyup);
  window.addEventListener("blur", blur);
  window.addEventListener("resize", resize);
  ui.canvas.addEventListener("pointerdown", orbitStart);
  window.addEventListener("pointerup", orbitEnd);
  window.addEventListener("pointercancel", orbitEnd);
  document.addEventListener("visibilitychange", visibility);
  const fail = (error?: unknown) => {
    if (import.meta.env.DEV && error) console.error(error);
    failed = true;
    keys.clear();
    chatSerial++;
    brains.suspend();
    npcs.close();
    camera.detachControl();
    engine.stopRenderLoop();
    ui.error("The 3D preview couldn’t start. Check that your browser supports WebGL, or play the 2D game.");
  };
  const timeout = window.setTimeout(fail, 30_000);
  scene.whenReadyAsync().then(() => {
    if (!disposed && !failed) { window.clearTimeout(timeout); ui.ready(); }
  }).catch(fail);
  syncDeliveryFacts(); updateMapPlaces(); updateLocation();
  engine.runRenderLoop(() => {
    if (disposed || failed) return;
    try {
      const dt = Math.min(engine.getDeltaTime() / 1000, 0.1);
      const frozen = !started || paused || ui.dialogueOpen || ui.mapOpen;
      const pedestrians = npcs.actors.map((entity) => entity.position);
      traffic.update(dt, player.position, pedestrians, frozen, [car.solid]);
      car.update(dt, keys, traffic.solids, pedestrians, frozen);
      const movingSolids = [...traffic.solids, car.solid];
      player.setTrafficSolids(movingSolids);
      npcs.setTrafficSolids(movingSolids);
      if (started && !paused && !ui.mapOpen) {
        if (!ui.dialogueOpen) {
          if (car.occupied) {
            player.ride(car.position, car.heading);
            orbitGrace = Math.max(0, orbitGrace - dt);
            if (!orbitHeld && orbitGrace === 0) {
              const desired = -Math.PI / 2 - car.heading;
              const turn = Math.atan2(Math.sin(desired - camera.alpha), Math.cos(desired - camera.alpha));
              camera.alpha += turn * (1 - Math.exp(-dt * 6));
            }
          } else player.update(dt, keys, camera.getForwardRay().direction);
        }
        if (ui.dialogueOpen) player.converse(dt);
        camera.setTarget(Vector3.Lerp(camera.target, target(), Math.min(1, dt * 12)), false, false, true);
      }
      drivingCamera.update(dt, !frozen && (car.occupied || viewPreset === "street"));
      npcs.update(dt, player.position, !started || paused || ui.mapOpen, car.occupied);
      brains.update(dt, player.position, !frozen);
      sun.position.copyFrom(target().subtract(sun.direction.scale(100)));
      Frustum.GetPlanesToRef(shadows.getTransformMatrix(), shadowFrustum);
      sky.update(camera.position, sun.direction);
      const nearby = [...world.lamps].sort((a, b) => Vector3.DistanceSquared(a, player.mesh.position) - Vector3.DistanceSquared(b, player.mesh.position));
      streetlights.forEach((light, i) => light.position.copyFrom(nearby[i]));
      hudElapsed += dt;
      if (hudElapsed >= 0.12) {
        updateLocation();
        ui.prompt(interactionPrompt());
        hudElapsed = 0;
      }
      scene.render();
    } catch (error) { fail(error); }
  });
  if (import.meta.env.DEV) {
    Object.assign(window, { __preview: { scene, engine, camera, player, world, scenery, npcs, properties, wallArt, traffic, car, brains,
      delivery, places: PLACES, pickup: SHOPRITE_APPROACH, shops,
      get paused() { return paused; }, get lightingPreset() { return lightingPreset; }, get viewPreset() { return viewPreset; } } });
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
    ui.canvas.removeEventListener("pointerdown", orbitStart);
    window.removeEventListener("pointerup", orbitEnd);
    window.removeEventListener("pointercancel", orbitEnd);
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("pagehide", pagehide);
    deliveryMarker.dispose(); shops.dispose(); brains.dispose(); drivingCamera.dispose(); car.dispose(); traffic.dispose(); npcs.dispose(); player.dispose(); properties.dispose(); scene.dispose(); engine.dispose();
  };
  window.addEventListener("pagehide", pagehide);
  if (import.meta.hot) import.meta.hot.dispose(dispose);
}

try { startPreview(); } catch (error) {
  if (import.meta.env.DEV) console.error(error);
  ui.error("Your browser couldn’t start WebGL. Try a browser with graphics acceleration, or play the 2D game.");
}
