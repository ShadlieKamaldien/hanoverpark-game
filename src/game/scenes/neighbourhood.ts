import Phaser from "phaser";
import { WORLD, SPAWN, type SaveData } from "../config/constants";
import { Player } from "../entities/player";
import { Vehicle } from "../entities/vehicle";
import { NPCS } from "../entities/npc";
import { Collision } from "../systems/collision";
import { loadSave, saveProgress } from "../systems/save";
import { DeliveryMission, DESTINATION } from "../missions/delivery";
import { createArt } from "../world/art";
import { BUILDINGS, drawWorld } from "../world/neighbourhood";
import { Interface } from "../ui/interface";

export class Neighbourhood extends Phaser.Scene {
  player!: Player;
  car!: Vehicle;
  collision!: Collision;
  ui!: Interface;
  mission = new DeliveryMission();
  money = 0;
  driving = false;
  started = false;
  paused = false;
  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  marker!: Phaser.GameObjects.Graphics;
  light!: Phaser.GameObjects.Rectangle;
  residents: { sprite: Phaser.GameObjects.Sprite; x: number; y: number }[] = [];
  pedestrians: {
    sprite: Phaser.GameObjects.Sprite;
    from: { x: number; y: number };
    to: { x: number; y: number };
    phase: number;
  }[] = [];
  private saveClock = 0;
  private mapClock = 0;
  private worldTime = 0;
  constructor() {
    super("Neighbourhood");
  }
  create() {
    createArt(this);
    this.collision = new Collision(drawWorld(this));
    this.car = new Vehicle(this, 620, 960);
    this.player = new Player(this, SPAWN.x, SPAWN.y);
    for (const npc of NPCS) {
      const resident = this.add
        .sprite(
          npc.x,
          npc.y,
          `${npc.name === "Aunty Fatima" ? "fatima" : npc.name === "Uncle Gatie" ? "gatie" : "jerome"}-down-0`,
        )
        .setDepth(31);
      this.residents.push({ sprite: resident, x: npc.x, y: npc.y });
      this.add
        .text(npc.x, npc.y - 32, npc.name, {
          fontFamily: "monospace",
          fontSize: "11px",
          color: "#f5eed9",
          backgroundColor: "#24473be0",
          padding: { x: 6, y: 4 },
        })
        .setOrigin(0.5)
        .setDepth(32);
    }
    for (let i = 0; i < 12; i++) {
      const x = 710 + (i % 6) * 190,
        y = i < 6 ? 865 : 1556;
      this.pedestrians.push({
        sprite: this.add.sprite(x, y, `walker${i % 3}-down-0`).setDepth(29),
        from: { x, y },
        to: { x: x + 110, y },
        phase: i,
      });
    }
    this.marker = this.add.graphics().setDepth(35);
    this.cameras.main
      .setBounds(0, 0, WORLD.width, WORLD.height)
      .startFollow(this.player.sprite, true, 0.1, 0.1);
    this.cameras.main.setZoom(1.35);
    this.light = this.add
      .rectangle(0, 0, 10000, 10000, 0x162c50, 0)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(90);
    this.keys = this.input.keyboard!.addKeys(
      "W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT,E,M,ESC",
    ) as Record<string, Phaser.Input.Keyboard.Key>;
    this.ui = new Interface();
    this.ui.onStart = (continuing) => this.start(continuing);
    this.ui.onResume = () => (this.paused = false);
    // Discrete DOM events avoid replaying queued Phaser key events on rapid taps.
    window.addEventListener("keydown", (e) => {
      if (e.repeat || !this.started) return;
      if (e.code === "Escape") {
        e.preventDefault();
        if (this.ui.blocked) {
          this.ui.close();
          this.paused = false;
        } else {
          this.paused = true;
          this.store();
          this.ui.pause(() => this.store());
        }
      } else if (!this.ui.blocked && !this.paused) {
        if (e.code === "KeyE") {
          e.preventDefault();
          this.interact();
        }
        if (e.code === "KeyM") {
          e.preventDefault();
          this.ui.root.querySelector(".map-card")!.classList.toggle("expanded");
        }
      }
    });
    this.game.events.on(Phaser.Core.Events.BLUR, () => {
      if (this.started) {
        this.store();
        if (!this.ui.blocked) {
          this.paused = true;
          this.ui.pause(() => this.store());
        }
      }
    });
    window.addEventListener("pagehide", () => {
      if (this.started) this.store();
    });
    // Read-only development state plus positioning for repeatable browser tests.
    if (import.meta.env.DEV)
      (window as unknown as { __game: Neighbourhood }).__game = this;
    this.drawMap();
  }
  start(continuing: boolean) {
    const d = continuing ? loadSave() : null;
    this.player.x = d?.x ?? SPAWN.x;
    this.player.y = d?.y ?? SPAWN.y;
    this.player.health = d?.health ?? 100;
    this.player.stamina = 100;
    this.money = d?.money ?? 0;
    this.mission.status = d?.mission ?? "available";
    this.car.x = d?.carX ?? 620;
    this.car.y = d?.carY ?? 960;
    this.car.angle = d?.carAngle ?? 0;
    this.car.sprite.rotation = this.car.angle;
    this.car.speed = 0;
    if (this.collision.blocked(this.player.x, this.player.y, 10)) {
      this.player.x = SPAWN.x;
      this.player.y = SPAWN.y;
    }
    if (this.collision.blocked(this.car.x, this.car.y, 32)) {
      this.car.x = 620;
      this.car.y = 960;
    }
    this.started = true;
    this.ui.start();
    this.store();
    this.refreshHUD();
    this.ui.notify(
      this.mission.status === "complete"
        ? "Welcome back to the block, Riyaad!"
        : this.mission.status === "active"
          ? "Groceries on board · Block C is waiting."
          : "Awe, Riyaad! Aunty Fatima is just up the road.",
    );
  }
  store() {
    if (!this.started) return;
    const exit = this.driving ? this.car.exitPosition(this.collision) : null;
    const d: SaveData = {
      version: 1,
      x: exit?.x ?? this.player.x,
      y: exit?.y ?? this.player.y,
      health: this.player.health,
      money: this.money,
      mission: this.mission.status,
      carX: this.car.x,
      carY: this.car.y,
      carAngle: this.car.angle,
    };
    if (!saveProgress(d))
      this.ui.notify(
        "Saving is unavailable in this browser. Progress will last for this session.",
      );
  }
  refreshHUD() {
    this.ui.text("money", `R${this.money.toLocaleString("en-ZA")}`);
    this.ui.text("objective", this.mission.objective);
    this.ui.bars(this.player.health, this.player.stamina);
  }
  distance(x: number, y: number) {
    const a = this.driving ? this.car : this.player;
    return Math.hypot(a.x - x, a.y - y);
  }
  interact() {
    if (
      this.mission.status === "active" &&
      this.distance(DESTINATION.x, DESTINATION.y) < 85
    ) {
      this.money += this.mission.complete();
      this.store();
      this.refreshHUD();
      this.ui.notify("DELIVERY COMPLETE · +R150 · Sharp sharp!");
      return;
    }
    if (!this.driving) {
      const npc = NPCS.find((n) => this.distance(n.x, n.y) < 70);
      if (npc) {
        const available =
          npc.name === "Aunty Fatima" && this.mission.status === "available";
        const text =
          npc.name === "Aunty Fatima" && this.mission.status !== "available"
            ? this.mission.status === "active"
              ? "Maak gou, Riyaad! Block C is across the neighbourhood — follow the gold diamond on your map."
              : "Thank you, my child! Everything arrived safe. Here's your R150. You're always welcome on this block."
            : npc.dialogue;
        this.ui.dialogue(
          npc.name,
          text,
          available
            ? () => {
                this.mission.accept();
                this.store();
                this.refreshHUD();
                this.ui.notify("GROCERIES COLLECTED · Head to Block C");
              }
            : undefined,
        );
        return;
      }
    }
    if (this.driving) {
      if (Math.abs(this.car.speed) > 35) {
        this.ui.notify("Slow down before getting out, my bru.");
        return;
      }
      const pos = this.car.exitPosition(this.collision);
      if (!pos) {
        this.ui.notify("No space to get out here. Move the car into the open.");
        return;
      }
      this.player.x = pos.x;
      this.player.y = pos.y;
      this.player.sprite.visible = true;
      this.driving = false;
      this.car.speed = 0;
      this.cameras.main.startFollow(this.player.sprite, true, 0.1, 0.1);
      this.store();
    } else if (this.distance(this.car.x, this.car.y) < 80) {
      this.driving = true;
      this.player.sprite.visible = false;
      this.cameras.main.startFollow(this.car.sprite, true, 0.1, 0.1);
      this.ui.notify(
        "W / S accelerate & brake · A / D steer · E exit when stopped",
      );
    }
  }
  update(time: number, delta: number) {
    if (!this.ui) return;
    const dt = Math.min(delta / 1000, 0.04);
    if (!this.started || this.ui.blocked || this.paused) return;
    const dx =
      Number(this.keys.D.isDown || this.keys.RIGHT.isDown) -
      Number(this.keys.A.isDown || this.keys.LEFT.isDown);
    const dy =
      Number(this.keys.S.isDown || this.keys.DOWN.isDown) -
      Number(this.keys.W.isDown || this.keys.UP.isDown);
    if (this.driving) {
      this.car.update(-dy, dx, dt, this.collision);
      this.player.x = this.car.x;
      this.player.y = this.car.y;
      this.player.stamina = Math.min(100, this.player.stamina + 19 * dt);
    } else {
      const halfW =
        Math.abs(Math.cos(this.car.angle)) * 18 +
        Math.abs(Math.sin(this.car.angle)) * 31;
      const halfH =
        Math.abs(Math.sin(this.car.angle)) * 18 +
        Math.abs(Math.cos(this.car.angle)) * 31;
      this.collision.solids.push({
        x: this.car.x - halfW,
        y: this.car.y - halfH,
        w: halfW * 2,
        h: halfH * 2,
      });
      this.player.update(
        dx,
        dy,
        this.keys.SHIFT.isDown,
        dt,
        time,
        this.collision,
      );
      this.collision.solids.pop();
    }
    this.worldTime += dt;
    this.light.setAlpha((0.14 * (1 - Math.cos(this.worldTime / 90))) / 2);
    const minute = (16 * 60 + 30 + Math.floor(this.worldTime / 3)) % (24 * 60);
    this.ui.text(
      "time",
      `${Math.floor(minute / 60)
        .toString()
        .padStart(2, "0")}:${(minute % 60).toString().padStart(2, "0")}`,
    );
    for (const [i, r] of this.residents.entries())
      r.sprite.y = r.y + Math.sin(this.worldTime * 2 + i) * 0.8;
    for (const [i, p] of this.pedestrians.entries()) {
      const x = p.from.x + Math.sin(this.worldTime * 0.5 + p.phase) * 55 + 55,
        dx = x - p.sprite.x;
      const a = { x: p.sprite.x, y: p.sprite.y };
      this.collision.move(a, dx, 0, 10);
      p.sprite
        .setPosition(a.x, a.y)
        .setTexture(
          `walker${i % 3}-${dx > 0 ? "right" : "left"}-${Math.floor(time / 220) % 2}`,
        );
    }
    this.marker.clear();
    const target =
      this.mission.status === "active"
        ? DESTINATION
        : this.mission.status === "available"
          ? NPCS[0]
          : null;
    if (target) {
      const y = target.y - 42 + Math.sin(time / 250) * 4;
      this.marker.fillStyle(0xf3c359).fillPoints(
        [
          { x: target.x, y: y - 10 },
          { x: target.x + 9, y },
          { x: target.x, y: y + 10 },
          { x: target.x - 9, y },
        ],
        true,
      );
      this.marker
        .lineStyle(2, 0xf3c359, 0.5)
        .strokeCircle(target.x, target.y, 26);
    }
    let prompt = "";
    if (
      this.mission.status === "active" &&
      this.distance(DESTINATION.x, DESTINATION.y) < 85
    )
      prompt = "E · Deliver Aunty’s groceries";
    else if (this.driving)
      prompt = `${Math.round(Math.abs(this.car.speed) * 0.22)} km/h · E to exit when stopped`;
    else {
      const n = NPCS.find((n) => this.distance(n.x, n.y) < 70);
      if (n) prompt = `E · Talk to ${n.name}`;
      else if (this.distance(this.car.x, this.car.y) < 80)
        prompt = "E · Borrow the mint hatchback";
    }
    this.ui.text("prompt", prompt);
    this.refreshHUD();
    this.saveClock += dt;
    this.mapClock += dt;
    if (this.saveClock > 2) {
      this.store();
      this.saveClock = 0;
    }
    if (this.mapClock > 0.1) {
      this.drawMap();
      this.mapClock = 0;
    }
  }
  drawMap() {
    const canvas = this.ui.root.querySelector<HTMLCanvasElement>("#minimap")!;
    const c = canvas.getContext("2d")!;
    const sx = canvas.width / WORLD.width,
      sy = canvas.height / WORLD.height;
    c.fillStyle = "#879478";
    c.fillRect(0, 0, 240, 180);
    c.fillStyle = "#44594f";
    for (const r of [
      { x: 0, y: 700, w: 2400, h: 140 },
      { x: 0, y: 1390, w: 2400, h: 140 },
      { x: 480, y: 0, w: 220, h: 1800 },
      { x: 1130, y: 0, w: 250, h: 1800 },
      { x: 2000, y: 0, w: 190, h: 1800 },
    ])
      c.fillRect(r.x * sx, r.y * sy, r.w * sx, r.h * sy);
    c.fillStyle = "#d7c7a2";
    for (const b of BUILDINGS)
      c.fillRect(b.x * sx, b.y * sy, b.w * sx, b.h * sy);
    c.fillStyle = "#506d53";
    c.fillRect(145, 123, 47, 48);
    const target =
      this.mission.status === "active"
        ? DESTINATION
        : this.mission.status === "available"
          ? NPCS[0]
          : null;
    if (target) {
      c.fillStyle = "#ffe09b";
      c.beginPath();
      c.moveTo(target.x * sx, target.y * sy - 5);
      c.lineTo(target.x * sx + 4, target.y * sy);
      c.lineTo(target.x * sx, target.y * sy + 5);
      c.lineTo(target.x * sx - 4, target.y * sy);
      c.closePath();
      c.fill();
    }
    c.fillStyle = "#91d7cf";
    c.fillRect(this.car.x * sx - 2, this.car.y * sy - 3, 4, 6);
    c.fillStyle = "#fffbe1";
    c.beginPath();
    c.arc(this.player.x * sx, this.player.y * sy, 3, 0, Math.PI * 2);
    c.fill();
  }
}
