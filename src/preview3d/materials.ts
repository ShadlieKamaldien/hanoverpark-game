import { Color3 } from "@babylonjs/core/Maths/math.color";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Scene } from "@babylonjs/core/scene";

/** All texture pixels are generated here; no aerial imagery or third-party art. */
export function createMaterials(scene: Scene) {
  const make = (name: string, colour: string, rough = true) => {
    const material = new StandardMaterial(name, scene);
    material.diffuseColor = Color3.FromHexString(colour);
    material.specularColor = rough ? new Color3(0.035, 0.035, 0.035) : new Color3(0.3, 0.3, 0.3);
    return material;
  };
  const texture = (name: string, base: string, kind: "earth" | "tar" | "plaster" | "grass") => {
    const map = new DynamicTexture(`${name}-original-texture`, { width: 256, height: 256 }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
    map.wrapU = Texture.WRAP_ADDRESSMODE;
    map.wrapV = Texture.WRAP_ADDRESSMODE;
    map.anisotropicFilteringLevel = 4;
    const context = map.getContext();
    context.fillStyle = base;
    context.fillRect(0, 0, 256, 256);
    let seed = 711 + name.length * 313;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 4500; i++) {
      const value = random() > 0.52 ? 255 : 0;
      context.fillStyle = `rgba(${value},${value},${value},${0.015 + random() * 0.065})`;
      const size = kind === "earth" || kind === "grass" ? 0.65 + random() * 1.6 : 0.6 + random() * 1.3;
      context.fillRect(random() * 256, random() * 256, size, size);
    }
    if (kind === "earth" || kind === "grass") {
      // Broad, soft tonal variation sits beneath fine grain instead of looking
      // like oversized square tiles when a low camera gets close to the ground.
      for (let i = 0; i < 22; i++) {
        const x = random() * 256, y = random() * 256, radius = 8 + random() * 28;
        const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, random() > 0.5 ? "rgba(242,229,196,.05)" : "rgba(42,48,34,.045)");
        gradient.addColorStop(1, "rgba(0,0,0,0)");
        context.fillStyle = gradient;
        context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      }
    }
    if (kind === "tar") {
      context.strokeStyle = "rgba(22,29,29,.34)";
      context.lineWidth = 0.9;
      for (let i = 0; i < 9; i++) {
        let x = random() * 256, y = random() * 256;
        context.beginPath(); context.moveTo(x, y);
        for (let j = 0; j < 6; j++) { x += random() * 23 - 11; y += random() * 27 - 6; context.lineTo(x, y); }
        context.stroke();
      }
    }
    if (kind === "plaster") {
      for (let i = 0; i < 9; i++) {
        context.fillStyle = "rgba(74,66,54,.045)";
        context.fillRect(random() * 256, random() * 256, 15 + random() * 45, 2 + random() * 12);
      }
    }
    map.update(false);
    return map;
  };
  const textured = (name: string, colour: string, kind: "earth" | "tar" | "plaster" | "grass") => {
    const material = make(name, "#ffffff");
    material.diffuseTexture = texture(name, colour, kind);
    return material;
  };
  const plaster = ["#d4b998", "#c5c0a7", "#b89b89", "#b7bfba", "#c9bb9d"].map((colour, i) => textured(`weathered-plaster-${i}`, colour, "plaster"));
  const windowGroups = ["#354c50", "#3e555a", "#425859", "#293c42"].map((colour, index) => {
    const material = make(index === 0 ? "shared-window-glazing" : `window-glazing-group-${index}`, colour, false);
    material.emissiveColor = new Color3(0.008, 0.012, 0.014);
    material.specularPower = 48;
    return material;
  });
  const curtains = ["#c0b79d", "#a6b3a2", "#aa8071"].map((colour, index) => {
    const material = make(`woven-curtain-${index}`, "#ffffff");
    const map = new DynamicTexture(`original-curtain-folds-${index}`, { width: 128, height: 128 }, scene, true, Texture.TRILINEAR_SAMPLINGMODE);
    map.wrapU = Texture.WRAP_ADDRESSMODE;
    map.wrapV = Texture.WRAP_ADDRESSMODE;
    const context = map.getContext();
    context.fillStyle = colour; context.fillRect(0, 0, 128, 128);
    for (let x = 0; x < 128; x += 13) {
      const fold = context.createLinearGradient(x, 0, x + 13, 0);
      fold.addColorStop(0, "rgba(26,30,26,.17)"); fold.addColorStop(0.45, "rgba(255,251,231,.1)"); fold.addColorStop(1, "rgba(26,30,26,.08)");
      context.fillStyle = fold; context.fillRect(x, 0, 13, 128);
    }
    map.update(false);
    material.diffuseTexture = map;
    return material;
  });
  return {
    ground: textured("sandy-earth", "#a69b77", "earth"),
    asphalt: textured("patched-asphalt", "#4b5354", "tar"),
    pavement: textured("concrete-pavement", "#b1ada0", "earth"),
    grass: textured("sports-ground-grass", "#78895b", "grass"),
    park: textured("park-grass", "#87976c", "grass"),
    plaster,
    repairs: ["#bca789", "#b8b49b", "#a88d7d", "#a7b0a9", "#b9aa8e"].map((colour, index) => make(`plaster-repair-${index}`, colour)),
    windowGroups, curtains,
    laundry: ["#b99273", "#9faeaf", "#d4cdb7"].map((colour, index) => make(`hanging-laundry-${index}`, colour)),
    planter: make("terracotta-balcony-planters", "#9c715a"),
    foliage: make("balcony-plant-foliage", "#596b47"),
    pipe: make("exposed-drainpipes", "#928f80"),
    roof: textured("flat-concrete-roof", "#928a77", "earth"),
    metalRoof: make("metal-roof", "#6d777b"),
    frame: make("painted-window-frames", "#d6d5c4"),
    dark: make("door-recesses", "#394849"),
    rails: make("security-rails", "#465555"),
    curb: make("kerbs", "#d3cec1"),
    line: make("faded-road-and-pitch-markings", "#d5cfad"),
    lamp: make("streetlamp-columns", "#536064"),
    lampGlass: make("streetlamp-diffusers", "#e9e0b5"),
    glazing: windowGroups[0],
  };
}
