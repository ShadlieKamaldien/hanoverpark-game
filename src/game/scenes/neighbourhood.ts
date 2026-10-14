import Phaser from "phaser";
import { WORLD, WORLD_ID, SPAWN, type SaveData } from "../config/constants";
import { Player } from "../entities/player";
import { Vehicle } from "../entities/vehicle";
import { NPCS, STREET_LINES } from "../entities/npc";
import { Collision } from "../systems/collision";
import { loadSave, saveProgress } from "../systems/save";
import { DeliveryMission, DESTINATION } from "../missions/delivery";
import { createArt } from "../world/art";
import { drawWorld } from "../world/neighbourhood";
import { MAP, distanceToRoad, gameCoordinates } from "../world/mapData";
import { Interface } from "../ui/interface";
import { Ambience } from "../systems/ambience";
import { StreetVoices } from "../systems/streetVoices";
import { EncounterSystem, type EncounterActor } from "../systems/encounters";

export class Neighbourhood extends Phaser.Scene {
  player!: Player;
  car!: Vehicle;
  collision!: Collision;
  encounters!: EncounterSystem;
  encounterSprites = new Map<string, {
    sprite: Phaser.GameObjects.Sprite;
    label: Phaser.GameObjects.Text;
  }>();
  ui!: Interface;
  audio = new Ambience();
  voices = new StreetVoices();
  private streetClock = 0;
  private streetLine = 0;
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
    this.collision = new Collision(
      drawWorld(this),
      MAP.buildings.map((b) => ({ points: b.points, holes: b.holes })),
    );
    this.encounters = new EncounterSystem(this.collision);
    for (const actor of this.encounters.actors) {
      const sprite = this.add.sprite(actor.x, actor.y, `${actor.texture}-down-0`).setDepth(30);
      const label = this.add.text(actor.x, actor.y - 36, actor.kind === "request" ? `${actor.name} · R2?` : actor.name, {
        fontFamily: "monospace", fontSize: "11px", color: "#fff0d1",
        backgroundColor: actor.kind === "request" ? "#315f5ce8" : "#733e32e8",
        padding: { x: 6, y: 4 },
      }).setOrigin(0.5).setDepth(32);
      this.encounterSprites.set(actor.id, { sprite, label });
    }
    this.car = new Vehicle(this, MAP.locations.car.x, MAP.locations.car.y);
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
    for (const [i, walker] of MAP.locations.walkers.entries()) {
      const { x, y, dx, dy } = walker;
      this.pedestrians.push({
        sprite: this.add.sprite(x, y, `walker${i % 3}-down-0`).setDepth(29),
        from: { x, y },
        to: { x: x + dx, y: y + dy },
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
    this.ui.onResume = () => {
      this.paused = false;
      this.audio.setPaused(false);
      this.audio.initialize();
    };
    this.ui.onCloseDialogue = (reason) => {
      if (reason === "dismiss" && this.encounters.dismissDialog()) {
        this.store();
        this.ui.encounterStatus("KEEP MOVING · Shift to sprint, or reach the car", true);
      }
      this.voices.cancel();
      this.audio.setPaused(false);
      this.audio.initialize();
    };
    this.ui.onSoundToggle = () => {
      this.audio.setMuted(!this.audio.muted);
      if (this.audio.muted) this.voices.cancel();
      else this.audio.initialize();
      this.syncSoundUI();
    };
    this.ui.onVolumeChanged = (volume) => {
      this.audio.setVolume(volume);
      this.voices.cancel();
      this.audio.initialize();
      this.syncSoundUI();
    };
    this.ui.onVoiceToggle = (enabled) => {
      this.voices.setEnabled(enabled);
      this.syncSoundUI();
    };
    this.syncSoundUI();
    // Discrete DOM events avoid replaying queued Phaser key events on rapid taps.
    window.addEventListener("keydown", (e) => {
      if (e.repeat || !this.started) return;
      if (e.code === "Escape") {
        e.preventDefault();
        if (this.ui.blocked) {
          this.ui.close();
          this.paused = false;
          this.audio.setPaused(false);
          this.audio.initialize();
        } else {
          this.paused = true;
          this.voices.cancel();
          this.audio.setPaused(true);
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
        this.audio.setPaused(true);
        this.voices.cancel();
        if (!this.ui.blocked) {
          this.paused = true;
          this.ui.pause(() => this.store());
        }
      }
    });
    window.addEventListener("pagehide", () => {
      if (this.started) this.store();
      this.audio.dispose();
      this.voices.cancel();
    });
    // Read-only development state plus positioning for repeatable browser tests.
    if (import.meta.env.DEV)
      (window as unknown as { __game: Neighbourhood }).__game = this;
    this.drawMap();
  }
  syncSoundUI() {
    this.ui.soundSettings(
      this.audio.muted,
      this.audio.volume,
      this.voices.enabled,
      this.audio.available,
    );
  }
  start(continuing: boolean) {
    this.audio.setPaused(false);
    this.audio.initialize();
    const d = continuing ? loadSave() : null;
    const sameWorld = d?.worldId === WORLD_ID;
    this.player.x = sameWorld ? d!.x : SPAWN.x;
    this.player.y = sameWorld ? d!.y : SPAWN.y;
    this.player.health = d?.health ?? 100;
    this.player.stamina = 100;
    this.money = d?.money ?? 0;
    this.mission.status = d?.mission ?? "available";
    this.car.x = sameWorld ? d!.carX : MAP.locations.car.x;
    this.car.y = sameWorld ? d!.carY : MAP.locations.car.y;
    this.car.angle = sameWorld ? d!.carAngle : MAP.locations.car.angle;
    this.car.sprite.rotation = this.car.angle;
    this.car.speed = 0;
    if (this.collision.blocked(this.player.x, this.player.y, 10)) {
      this.player.x = SPAWN.x;
      this.player.y = SPAWN.y;
    }
    if (this.collision.blocked(this.car.x, this.car.y, 32)) {
      this.car.x = MAP.locations.car.x;
      this.car.y = MAP.locations.car.y;
    }
    this.encounters.restore(sameWorld ? d?.encounters : d?.encounters ? { ...d.encounters, active: undefined } : undefined);
    this.started = true;
    this.ui.start();
    this.store();
    this.refreshHUD();
    this.syncSoundUI();
    this.ui.notify(
      this.mission.status === "complete"
        ? "Welcome back to the block, Riyaad!"
        : this.mission.status === "active"
          ? `Groceries on board · ${DESTINATION.name} is waiting.`
          : "Awe, Riyaad! Aunty Fatima is waiting by Shoprite.",
    );
    if (this.encounters.active && this.encounters.phase === "demand")
      this.robberyDialogue(this.encounters.active);
    else if (this.encounters.phase === "chase")
      this.ui.encounterStatus("KEEP MOVING · Shift to sprint, or reach the car", true);
  }
  store() {
    if (!this.started) return;
    const exit = this.driving ? this.car.exitPosition(this.collision) : null;
    const d: SaveData = {
      version: 1,
      worldId: WORLD_ID,
      x: exit?.x ?? this.player.x,
      y: exit?.y ?? this.player.y,
      health: this.player.health,
      money: this.money,
      mission: this.mission.status,
      carX: this.car.x,
      carY: this.car.y,
      carAngle: this.car.angle,
      encounters: this.encounters.snapshot(),
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
      if (this.encounters.phase && this.distance(this.car.x, this.car.y) >= 80) {
        this.ui.notify("Keep moving, my bru — reach some space or the car!");
        return;
      }
      const encounter = this.encounters.phase ? null : this.encounters.nearestRequest(this.player);
      if (encounter) {
        this.requestDialogue(encounter);
        return;
      }
      const npc = this.encounters.phase ? undefined : NPCS.find((n) => this.distance(n.x, n.y) < 70);
      if (npc) {
        const available =
          npc.name === "Aunty Fatima" && this.mission.status === "available";
        const text =
          npc.name === "Aunty Fatima" && this.mission.status !== "available"
            ? this.mission.status === "active"
              ? `Dankie, my kind. Reguit na ${DESTINATION.name} — volg die marker. Loop mooi deur die courtyard, né.`
              : "Lekker, alles het mooi aangekom. Dankie, my kind. Daai R150 is joune. Kom sê weer howzit as jy verbyloop."
            : npc.dialogue;
        this.voices.speak(text, this.audio.muted ? 0 : this.audio.volume);
        this.ui.dialogue(
          npc.name,
          text,
          available
            ? () => {
                this.mission.accept();
                this.store();
                this.refreshHUD();
                this.ui.notify(
                  `GROCERIES COLLECTED · Head to ${DESTINATION.name}`,
                );
              }
            : undefined,
          npc.help,
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
  requestDialogue(actor: EncounterActor) {
    this.voices.speak(actor.dialogue, this.audio.muted ? 0 : this.audio.volume);
    this.ui.choiceDialogue(actor.name, actor.dialogue, [
      { id: "refuse", label: "NO, SORRY", onChoose: () => {
        if (this.encounters.refuse(actor.id)) {
          this.store();
          this.ui.notify("Sharp, my bru. Hou mooi.");
        }
      } },
      { id: "later", label: "MAYBE LATER", onChoose: () => this.ui.notify("Come back when you want to talk.") },
      { id: "give", label: "GIVE R2", disabled: this.money < 2, onChoose: () => {
        const result = this.encounters.giveR2(actor.id, this.money);
        this.money = result.money;
        this.store();
        this.refreshHUD();
        if (result.paid) this.ui.notify("−R2 · Dankie, my bru. Sharp sharp.");
      } },
    ], this.money < 2 ? "You need R2 to give. You can refuse or return later." : "Giving R2 is optional. You can also say no.");
  }
  robberyDialogue(actor: EncounterActor) {
    const amount = Math.min(20, this.money);
    this.voices.speak(actor.dialogue, this.audio.muted ? 0 : this.audio.volume);
    this.ui.encounterStatus("A STRANGER IS DEMANDING CASH", true);
    this.ui.choiceDialogue(actor.name, actor.dialogue, [
      { id: "run", label: "BACK AWAY & RUN", onChoose: () => {
        this.encounters.run();
        this.store();
        this.ui.encounterStatus("KEEP MOVING · Shift to sprint, or reach the car", true);
      } },
      { id: "pay", label: amount > 0 ? `HAND OVER R${amount}` : "SHOW EMPTY POCKETS", onChoose: () => {
        const result = this.encounters.surrender(actor.id, this.money);
        this.money = result.money;
        this.store();
        this.refreshHUD();
        this.ui.encounterStatus(null);
        this.ui.notify(result.lost > 0 ? `−R${result.lost} · The stranger takes the cash and leaves.` : "No cash to take. The stranger moves on.");
      } },
    ], "Choose how to respond. If you run, hold Shift and move away, or enter the car. Getting caught costs up to R20.", "warning");
  }
  updateEncounters(dt: number, time: number) {
    if (!this.driving) {
      const halfW = Math.abs(Math.cos(this.car.angle)) * 18 + Math.abs(Math.sin(this.car.angle)) * 31;
      const halfH = Math.abs(Math.sin(this.car.angle)) * 18 + Math.abs(Math.cos(this.car.angle)) * 31;
      this.collision.solids.push({ x: this.car.x - halfW, y: this.car.y - halfH, w: halfW * 2, h: halfH * 2 });
    }
    const event = this.encounters.update(dt, this.player, this.driving);
    if (!this.driving) this.collision.solids.pop();
    if (event && "caught" in event) {
      const loss = Math.min(this.money, event.caught.lostCap);
      this.money -= loss;
      this.store();
      this.refreshHUD();
      this.ui.encounterStatus(null);
      this.ui.notify(loss > 0 ? `CAUGHT · −R${loss}. The stranger leaves.` : "The stranger finds no cash and leaves.");
    } else if (event && "escaped" in event) {
      this.store();
      this.ui.encounterStatus(null);
      this.ui.notify("YOU GOT AWAY · Your money is safe.");
    }
    if (this.encounters.phase === "chase")
      this.ui.encounterStatus("KEEP MOVING · Shift to sprint, or reach the car", true);
    for (const actor of this.encounters.actors) {
      const view = this.encounterSprites.get(actor.id)!;
      const moved = Math.hypot(actor.x - view.sprite.x, actor.y - view.sprite.y) > 0.1;
      const direction = actor.x > view.sprite.x ? "right" : "left";
      view.sprite.setPosition(actor.x, actor.y).setAlpha(actor.resolved ? 0.65 : 1);
      if (moved) view.sprite.setTexture(`${actor.texture}-${direction}-${Math.floor(time / 220) % 2}`);
      view.label.setPosition(actor.x, actor.y - 36).setVisible(!actor.resolved);
    }
    if (this.mission.status === "complete" && !this.driving && !this.encounters.phase) {
      const robber = this.encounters.nearbyRobber(this.player);
      if (robber && this.encounters.beginRobbery(robber.id)) {
        this.store();
        this.robberyDialogue(robber);
      }
    }
  }
  update(time: number, delta: number) {
    if (!this.ui) return;
    const dt = Math.min(delta / 1000, 0.04);
    this.audio.setPaused(
      !this.started || this.ui.blocked || this.paused || document.hidden,
    );
    if (!this.started || this.ui.blocked || this.paused) return;
    const dx =
      Number(this.keys.D.isDown || this.keys.RIGHT.isDown) -
      Number(this.keys.A.isDown || this.keys.LEFT.isDown);
    const dy =
      Number(this.keys.S.isDown || this.keys.DOWN.isDown) -
      Number(this.keys.W.isDown || this.keys.UP.isDown);
    const oldX = this.player.x,
      oldY = this.player.y;
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
    this.updateEncounters(dt, time);
    if (this.ui.blocked) {
      this.refreshHUD();
      this.drawMap();
      return;
    }
    this.audio.update(dt, {
      x: this.player.x,
      y: this.player.y,
      driving: this.driving,
      speed: this.car.speed,
      walking: Math.hypot(this.player.x - oldX, this.player.y - oldY) > 0.1,
      sprinting: this.keys.SHIFT.isDown && this.player.stamina > 2,
      surface: distanceToRoad(this.player.x, this.player.y),
    });
    this.streetClock += dt;
    if (this.streetClock > 12) {
      this.streetClock = 0;
      const nearby = STREET_LINES.find(
        (zone) => this.distance(zone.x, zone.y) < zone.radius,
      );
      if (nearby) {
        const line = nearby.lines[this.streetLine++ % nearby.lines.length];
        this.ui.caption(nearby.speaker, line);
        this.voices.speak(
          line,
          this.audio.muted ? 0 : this.audio.volume * 0.65,
        );
      }
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
      const progress = (Math.sin(this.worldTime * 0.5 + p.phase) + 1) / 2;
      const x = p.from.x + (p.to.x - p.from.x) * progress,
        y = p.from.y + (p.to.y - p.from.y) * progress;
      const dx = x - p.sprite.x,
        dy = y - p.sprite.y;
      const a = { x: p.sprite.x, y: p.sprite.y };
      this.collision.move(a, dx, dy, 10);
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
      const request = this.encounters.nearestRequest(this.player);
      const n = NPCS.find((n) => this.distance(n.x, n.y) < 70);
      if (this.encounters.phase === "chase") prompt = this.distance(this.car.x, this.car.y) < 80 ? "E · Get into the car" : "Shift + WASD · Get away";
      else if (request) prompt = `E · ${request.name} is asking for R2`;
      else if (n) prompt = `E · Talk to ${n.name}`;
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
    c.fillStyle = "#a5b18d";
    c.fillRect(0, 0, canvas.width, canvas.height);
    const polygon = (points: { x: number; y: number }[], color: string, holes: { x: number; y: number }[][] = []) => {
      if (!points.length) return;
      c.fillStyle = color;
      c.beginPath();
      for (const ring of [points, ...holes]) {
        ring.forEach((p, i) =>
          i ? c.lineTo(p.x * sx, p.y * sy) : c.moveTo(p.x * sx, p.y * sy),
        );
        c.closePath();
      }
      c.fill("evenodd");
    };
    polygon(MAP.boundary, "#899777");
    for (const f of MAP.fields) polygon(f.points, "#547c58");
    for (const r of MAP.roads) {
      c.strokeStyle = "#425b50";
      c.lineWidth = Math.max(0.45, r.width * sx);
      c.beginPath();
      r.points.forEach((p, i) =>
        i ? c.lineTo(p.x * sx, p.y * sy) : c.moveTo(p.x * sx, p.y * sy),
      );
      c.stroke();
    }
    for (const b of MAP.buildings)
      polygon(b.points, b.kind === "retail" ? "#c99668" : "#d5c7a5", b.holes);
    c.font = "6px monospace";
    c.fillStyle = "#244336";
    for (const name of [
      "Downberg Road",
      "Hanover Park Avenue",
      "Surran Road",
    ]) {
      const road = MAP.roads.find((r) => r.name === name);
      if (road) {
        const p = road.points[Math.floor(road.points.length / 2)];
        c.fillText(
          name.replace(" Road", " Rd").replace("Avenue", "Ave"),
          p.x * sx,
          p.y * sy,
        );
      }
    }
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
    for (const actor of this.encounters.actors) {
      if (actor.resolved) continue;
      c.fillStyle = actor.kind === "request" ? "#9ad6d2" : "#f29272";
      c.beginPath();
      c.arc(actor.x * sx, actor.y * sy, 2.5, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = "#91d7cf";
    c.fillRect(this.car.x * sx - 2, this.car.y * sy - 3, 4, 6);
    c.fillStyle = "#fffbe1";
    c.beginPath();
    c.arc(this.player.x * sx, this.player.y * sy, 3, 0, Math.PI * 2);
    c.fill();
    const coordinates = gameCoordinates(this.player.x, this.player.y);
    this.ui.text(
      "map-position",
      `${coordinates.latitude.toFixed(4)}, ${coordinates.longitude.toFixed(4)} · N ↑`,
    );
  }
}
