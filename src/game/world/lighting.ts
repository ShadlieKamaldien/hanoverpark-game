import Phaser from "phaser";
import { MAP, type MapPoint } from "./mapData";
import type { LampGlow, WindowGlow } from "./visualTypes";

export type LightingPeriod = "day" | "sunset" | "night" | "dawn";

export interface LightingState {
  minuteOfDay: number;
  period: LightingPeriod;
  warmAlpha: number;
  coolAlpha: number;
  lampIntensity: number;
  litWindows: number;
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => {
  const p = clamp(n);
  return p * p * (3 - 2 * p);
};

/** Cyclic, deliberately restrained lighting: navigation stays readable at night. */
export function lightingAt(minuteOfDay: number): Omit<LightingState, "litWindows"> {
  const minute = ((minuteOfDay % 1440) + 1440) % 1440;
  let period: LightingPeriod = "day";
  let warmAlpha = 0;
  let coolAlpha = 0;
  let lampIntensity = 0;
  if (minute >= 19.5 * 60 || minute < 6 * 60) {
    period = "night";
    coolAlpha = 0.25;
    lampIntensity = 1;
  } else if (minute < 8 * 60) {
    period = "dawn";
    const daylight = smooth((minute - 6 * 60) / 120);
    coolAlpha = 0.25 * (1 - daylight);
    warmAlpha = Math.sin(daylight * Math.PI) * 0.09;
    lampIntensity = 1 - smooth((minute - 6 * 60) / 90);
  } else if (minute >= 16 * 60) {
    period = "sunset";
    if (minute < 18 * 60) {
      const sunset = smooth((minute - 16 * 60) / 120);
      warmAlpha = 0.13 * sunset;
      coolAlpha = 0.045 * sunset;
    } else {
      const nightfall = smooth((minute - 18 * 60) / 90);
      warmAlpha = 0.13 * (1 - nightfall);
      coolAlpha = 0.045 + 0.205 * nightfall;
    }
    lampIntensity = smooth((minute - 17.75 * 60) / 75);
  }
  return { minuteOfDay: minute, period, warmAlpha, coolAlpha, lampIntensity };
}

function inside(p: MapPoint, ring: readonly MapPoint[]) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > p.y) !== (b.y > p.y) &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      result = !result;
  }
  return result;
}

function segmentDistance(p: MapPoint, a: MapPoint, b: MapPoint) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  const t = length2 ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / length2) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

function clearLampPosition(p: MapPoint) {
  if (!inside(p, MAP.boundary)) return false;
  return !MAP.buildings.some((b) => {
    const r = b.bounds;
    if (p.x < r.x - 12 || p.x > r.x + r.w + 12 ||
      p.y < r.y - 12 || p.y > r.y + r.h + 12) return false;
    if (inside(p, b.points) && !(b.holes ?? []).some((hole) => inside(p, hole)))
      return true;
    return [b.points, ...(b.holes ?? [])].some((ring) =>
      ring.some((a, i) => segmentDistance(p, a, ring[(i + 1) % ring.length]) < 12));
  });
}

/** Decorative placement follows mapped road edges; these are not surveyed lamp assets. */
function makeLamps(): readonly LampGlow[] {
  const anchors = [MAP.locations.spawn, MAP.locations.target, MAP.locations.pitch];
  const candidates: (LampGlow & { distance: number; order: number })[] = [];
  for (const road of MAP.roads) {
    if (!/^(residential|unclassified|living_street|service|tertiary|secondary|primary)$/.test(road.kind)) continue;
    let travelled = road.id % 173;
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1], b = road.points[i];
      const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
      if (length < 1) continue;
      for (let step = 100 - travelled % 220; step < length; step += 220) {
        if (step < 0) continue;
        const t = step / length;
        const side = (road.id + i + Math.floor(step / 220)) % 2 ? 1 : -1;
        const margin = road.width / 2 + 9;
        const p = {
          x: a.x + dx * t - (dy / length) * margin * side,
          y: a.y + dy * t + (dx / length) * margin * side,
        };
        if (!clearLampPosition(p)) continue;
        candidates.push({ ...p,
          distance: Math.min(...anchors.map((anchor) => Math.hypot(anchor.x - p.x, anchor.y - p.y))),
          order: road.id + i,
        });
      }
      travelled += length;
    }
  }
  const lamps: LampGlow[] = [];
  const add = (p: LampGlow, minimumDistance: number) => {
    if (lamps.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < minimumDistance)) return;
    lamps.push(Object.freeze({ x: p.x, y: p.y }));
  };
  // Give the first playable locations useful coverage, then distribute a bounded
  // number throughout the suburb rather than allocating a light to every way.
  for (const p of [...candidates].sort((a, b) => a.distance - b.distance || a.order - b.order)) {
    if (p.distance > 1150 || lamps.length >= 70) break;
    add(p, 180);
  }
  const cells = new Set<string>();
  for (const p of candidates) {
    if (lamps.length >= 120) break;
    const cell = `${Math.floor(p.x / 1200)}:${Math.floor(p.y / 1200)}`;
    if (cells.has(cell)) continue;
    const before = lamps.length;
    add(p, 240);
    if (lamps.length !== before) cells.add(cell);
  }
  return Object.freeze(lamps);
}

interface WindowLight {
  sprite: Phaser.GameObjects.Image;
  phase: number;
  strength: number;
}

export class DayLighting {
  readonly lamps: readonly LampGlow[] = makeLamps();
  private readonly warm: Phaser.GameObjects.Rectangle;
  private readonly cool: Phaser.GameObjects.Rectangle;
  private readonly stands: Phaser.GameObjects.Graphics;
  private readonly pools: Phaser.GameObjects.Image[] = [];
  private readonly halos: Phaser.GameObjects.Image[] = [];
  private readonly bulbs: Phaser.GameObjects.Arc[] = [];
  private readonly windows: WindowLight[] = [];
  private readonly textureKey: string;
  private readonly ownsTexture: boolean;
  private dead = false;
  private lastMinute = -1;
  private lastViewport = "";
  private currentState: Readonly<LightingState> = Object.freeze({ ...lightingAt(990), litWindows: 0 });

  constructor(private readonly scene: Phaser.Scene, windows: readonly WindowGlow[]) {
    this.textureKey = `hanover-amber-light-${scene.sys.settings.key}`;
    this.ownsTexture = !scene.textures.exists(this.textureKey);
    if (this.ownsTexture) {
      const texture = scene.textures.createCanvas(this.textureKey, 128, 128);
      if (!texture) throw new Error("Unable to create neighbourhood lighting texture");
      const context = texture.context;
      const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, "rgba(255,236,170,1)");
      gradient.addColorStop(0.16, "rgba(255,221,139,0.78)");
      gradient.addColorStop(0.42, "rgba(255,205,120,0.32)");
      gradient.addColorStop(0.74, "rgba(255,205,120,0.09)");
      gradient.addColorStop(1, "rgba(255,205,120,0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 128, 128);
      texture.refresh();
    }
    this.warm = scene.add.rectangle(0, 0, 1, 1, 0xf2a264)
      .setOrigin(0).setScrollFactor(0).setDepth(90);
    this.cool = scene.add.rectangle(0, 0, 1, 1, 0x182942)
      .setOrigin(0).setScrollFactor(0).setDepth(90);
    this.stands = scene.add.graphics().setDepth(14);
    for (const lamp of this.lamps) {
      // Slim poles and small heads stay visible by day. They are visual scenery,
      // so they never change source building or route collision geometry.
      this.stands.fillStyle(0x39433e, 0.14).fillEllipse(lamp.x + 8, lamp.y + 5, 27, 9);
      this.stands.lineStyle(5, 0x5b6157, 1).lineBetween(lamp.x, lamp.y, lamp.x, lamp.y - 33);
      this.stands.lineStyle(2, 0x9eaa93, 1).lineBetween(lamp.x - 1, lamp.y - 2, lamp.x - 1, lamp.y - 33);
      this.stands.lineStyle(3, 0x5b6157, 1).lineBetween(lamp.x, lamp.y - 33, lamp.x + 8, lamp.y - 33);
      this.stands.fillStyle(0xe5dbb5).fillRoundedRect(lamp.x + 3, lamp.y - 35, 11, 5, 2);
      this.pools.push(scene.add.image(lamp.x + 5, lamp.y + 3, this.textureKey)
        .setDisplaySize(226, 166).setDepth(89));
      this.halos.push(scene.add.image(lamp.x + 8, lamp.y - 33, this.textureKey)
        .setDisplaySize(74, 74).setDepth(91));
      this.bulbs.push(scene.add.circle(lamp.x + 8, lamp.y - 33, 2, 0xfff0b2).setDepth(91));
    }
    const anchors = [MAP.locations.spawn, MAP.locations.target, MAP.locations.pitch];
    const nearest = [...windows].sort((a, b) => {
      const distance = (w: WindowGlow) => Math.min(...anchors.map((p) => Math.hypot(p.x - w.x, p.y - w.y)));
      return distance(a) - distance(b);
    });
    const selected = new Set<WindowGlow>(nearest.slice(0, 180));
    const stride = Math.max(1, Math.ceil(windows.length / 180));
    for (let i = 0; i < windows.length && selected.size < 360; i += stride) selected.add(windows[i]);
    for (const window of selected) {
      const phase = ((window.phase % 1) + 1) % 1;
      // Some rooms stay dark, and illuminated rooms have different strengths.
      // Phase is seeded by scenery rather than a flashing random update.
      if (phase > 0.66) continue;
      this.windows.push({
        sprite: scene.add.image(window.x, window.y, this.textureKey)
          .setDisplaySize(Math.max(12, window.width * 2.7), Math.max(9, window.height * 3.4))
          .setRotation(window.angle).setDepth(91),
        phase,
        strength: 0.34 + phase * 0.38,
      });
    }
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.resize, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.resize();
    this.update(16 * 60 + 30);
  }

  get state(): Readonly<LightingState> {
    return this.currentState;
  }

  get overlays(): Readonly<{
    warm: Phaser.GameObjects.Rectangle;
    cool: Phaser.GameObjects.Rectangle;
  }> {
    return { warm: this.warm, cool: this.cool };
  }

  private resize() {
    if (this.dead) return;
    const camera = this.scene.cameras.main;
    const zoomX = camera.zoomX || 1, zoomY = camera.zoomY || 1;
    const width = camera.width / zoomX, height = camera.height / zoomY;
    // Scroll-factor zero still receives the camera's centered zoom transform.
    // Inverting that transform gives exact viewport coverage at every size.
    const x = camera.width * camera.originX * (1 - 1 / zoomX);
    const y = camera.height * camera.originY * (1 - 1 / zoomY);
    for (const overlay of [this.warm, this.cool])
      overlay.setPosition(x, y).setSize(width, height);
    this.lastViewport = `${camera.width}:${camera.height}:${zoomX}:${zoomY}`;
  }

  update(minuteOfDay: number) {
    if (this.dead) return;
    const camera = this.scene.cameras.main;
    const viewport = `${camera.width}:${camera.height}:${camera.zoomX}:${camera.zoomY}`;
    if (viewport !== this.lastViewport) this.resize();
    // The game advances one minute per three seconds. Quarter-minute updates
    // keep transitions smooth without revisiting hundreds of lights every frame.
    const tick = Math.floor(minuteOfDay * 4) / 4;
    if (tick === this.lastMinute) return;
    this.lastMinute = tick;
    const state = lightingAt(tick);
    this.warm.setAlpha(state.warmAlpha);
    this.cool.setAlpha(state.coolAlpha);
    for (const pool of this.pools) pool.setAlpha(state.lampIntensity * 0.31);
    for (const halo of this.halos) halo.setAlpha(state.lampIntensity * 0.52);
    for (const bulb of this.bulbs) bulb.setAlpha(state.lampIntensity * 0.9);
    let litWindows = 0;
    for (const window of this.windows) {
      const onset = 17.6 * 60 + window.phase * 70;
      const evening = state.minuteOfDay >= 12 * 60
        ? smooth((state.minuteOfDay - onset) / 35) : 1;
      const intensity = Math.min(state.lampIntensity, evening);
      window.sprite.setAlpha(intensity * window.strength);
      if (intensity > 0.05) litWindows++;
    }
    this.currentState = Object.freeze({ ...state, litWindows });
  }

  destroy() {
    if (this.dead) return;
    this.dead = true;
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.resize, this);
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.warm.destroy();
    this.cool.destroy();
    this.stands.destroy();
    for (const sprite of [...this.pools, ...this.halos, ...this.bulbs]) sprite.destroy();
    for (const window of this.windows) window.sprite.destroy();
    if (this.ownsTexture && this.scene.textures.exists(this.textureKey))
      this.scene.textures.remove(this.textureKey);
  }
}
