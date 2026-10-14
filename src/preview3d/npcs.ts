import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { MapPoint, MapRoad } from "../game/world/mapData";
import { Collision } from "../game/systems/collision";
import { BUILDINGS, PREVIEW, ROADS, SPAWN } from "./map";
import { NpcActor, type Appearance } from "./npcActor";

export type NpcRole = "neighbour" | "vendor" | "pedestrian" | "requester" | "stranger";
export interface Conversation {
  speaker: string;
  text: string;
  choices: { id: string; label: string }[];
}
export interface NpcEntity {
  readonly id: string;
  readonly name: string;
  readonly nickname?: string;
  readonly role: NpcRole;
  readonly position: MapPoint;
  readonly actor: NpcActor;
  readonly patrolRoute?: readonly MapPoint[];
  heading: number;
}

type DialogueNode = { text: string; choices: { id: string; label: string; next?: string }[] };
type Definition = {
  id: string;
  name: string;
  nickname?: string;
  role: NpcRole;
  appearance: Appearance;
  anchor: MapPoint;
  patrol?: boolean;
  dialogue: Record<string, DialogueNode>;
};
type Placement = { position: MapPoint; heading: number; route: MapPoint[]; road: MapRoad };
type Patrol = { route: MapPoint[]; index: number; speed: number; wait: number; phase: number };

const BODY_RADIUS = 3.2;
const PIXELS_PER_METRE = 1 / PREVIEW.metresPerPixel;
const TALK_RANGE = 2.75 * PIXELS_PER_METRE;
const farewell = [{ id: "dismiss", label: "Cheers, see you around." }];
const at = (dx: number, dy: number): MapPoint => ({ x: SPAWN.x + dx, y: SPAWN.y + dy });
const courtAnchor = (name: string, fallback: MapPoint): MapPoint => {
  const building = BUILDINGS.find((item) => item.name === name);
  return building ? { x: building.bounds.x + building.bounds.w / 2, y: building.bounds.y + building.bounds.h / 2 } : fallback;
};

/** These adults and their situations are fictional, never identified residents. */
const definitions: Definition[] = [
  {
    id: "neighbour_soraya", name: "Aunty Soraya", role: "neighbour", anchor: SPAWN,
    appearance: { skin: "#9b654a", shirt: "#618989", trousers: "#343d50", hair: "#ddd1b7", variant: "headscarf", height: 1.61 },
    dialogue: {
      start: { text: "Hoesit, ma se kind. Taking a walk? Say hello when you pass — we look out for one another here.", choices: [
        { id: "greet", label: "Hoesit, Aunty. How are you?", next: "greet" },
        { id: "directions", label: "Which street is this?", next: "directions" },
        { id: "later", label: "Just passing, Aunty. See you later." },
      ] },
      greet: { text: "I'm alright, thanks. Still got washing to bring in before the wind picks up. Enjoy your walk.", choices: farewell },
      directions: { text: "You're on Downberg Road. Take your time and have a look around. Look for the signs on the flats.", choices: farewell },
    },
  },
  {
    id: "neighbour_moosa", name: "Boeta Moosa", role: "neighbour", anchor: at(-165, -135),
    appearance: { skin: "#ac795b", shirt: "#947844", trousers: "#3d454a", hair: "#d3d0c7", variant: "cap", height: 1.73 },
    dialogue: {
      start: { text: "Howzit. Just taking a break before I sort that loose hinge on my gate. And djy?", choices: [
        { id: "greet", label: "Howzit, Boeta.", next: "greet" },
        { id: "life", label: "Been living here long?", next: "life" },
        { id: "later", label: "Enjoy your afternoon." },
      ] },
      greet: { text: "Good to see you. Let me finish that gate before it gets dark — it's been squeaking all week!", choices: farewell },
      life: { text: "Long enough to recognise the neighbours, my friend. A street feels different once you know who to greet.", choices: farewell },
    },
  },
  {
    id: "neighbour_patricia", name: "Aunty Patricia", role: "neighbour", anchor: at(100, 140),
    appearance: { skin: "#b18064", shirt: "#b86d55", trousers: "#34484b", hair: "#342722", variant: "headscarf", height: 1.68 },
    dialogue: {
      start: { text: "Hoesit! I'm just tidying up before I head home. Everybody stops for a chat on their way past.", choices: [
        { id: "greet", label: "How's the afternoon going?", next: "greet" },
        { id: "life", label: "What's happening around here?", next: "life" },
        { id: "later", label: "I'll let you carry on." },
      ] },
      greet: { text: "Not bad at all. Just getting home and putting the kettle on. You take care.", choices: farewell },
      life: { text: "Just everyday things — people coming home, neighbours talking, washing on the balconies. Take a slow walk and you'll see.", choices: farewell },
    },
  },
  {
    id: "vendor_nazeem", name: "Nazeem", nickname: "Zeem", role: "vendor", anchor: courtAnchor("Blinkwater Hof", at(490, -840)),
    appearance: { skin: "#9d664e", shirt: "#718f66", trousers: "#5e5662", hair: "#362b24", variant: "cap", height: 1.72 },
    dialogue: {
      start: { text: "Hoesit! Zeem to my friends. Got chips and sweets here — I'm just sorting my things before I pack up.", choices: [
        { id: "greet", label: "Hoesit, Zeem.", next: "greet" },
        { id: "life", label: "How's the afternoon going?", next: "life" },
        { id: "later", label: "Go well, Zeem." },
      ] },
      greet: { text: "All good, thanks. Everybody stops for a quick chat on their way past.", choices: farewell },
      life: { text: "Lekker, thanks. A bit of selling, a bit of chatting. Everybody's got a story when they stop here.", choices: farewell },
    },
  },
  {
    id: "student_ashleigh", name: "Ashleigh", nickname: "Ash", role: "neighbour", anchor: at(-240, 245),
    appearance: { skin: "#b78061", shirt: "#668095", trousers: "#454b49", hair: "#292725", height: 1.69 },
    dialogue: {
      start: { text: "Hoesit! Finally taking a break from my books. Needed a bit of fresh air before studying again.", choices: [
        { id: "greet", label: "Awe, all good.", next: "greet" },
        { id: "life", label: "What do your friends call you?", next: "life" },
        { id: "later", label: "Catch you later, Ash." },
      ] },
      greet: { text: "Lekker. Sometimes a walk and a chat help more than staring at the same page for another hour.", choices: farewell },
      life: { text: "Ash. It's just short for Ashleigh — nothing fancy. Only my aunt uses the whole name when she's cross!", choices: farewell },
    },
  },
  {
    id: "pedestrian_wesley", name: "Wesley", nickname: "Wes", role: "pedestrian", anchor: at(50, -200), patrol: true,
    appearance: { skin: "#a06c53", shirt: "#7f756e", trousers: "#344455", hair: "#2c2420", height: 1.82 },
    dialogue: {
      start: { text: "Awe! Taking the long way home. Hoping to kick a ball with my friends later.", choices: [
        { id: "greet", label: "Howzit, Wes.", next: "greet" },
        { id: "life", label: "What's the plan for later?", next: "life" },
        { id: "later", label: "Safe walk home." },
      ] },
      greet: { text: "All good, my bru. Nice to see a familiar face.", choices: farewell },
      life: { text: "A little football if everyone's around. Nothing serious — just a run around and a good laugh.", choices: farewell },
    },
  },
  {
    id: "commuter_luthando", name: "Luthando", nickname: "Lu", role: "pedestrian", anchor: at(-70, 285), patrol: true,
    appearance: { skin: "#79543e", shirt: "#7d8d8a", trousers: "#424e52", hair: "#282321", height: 1.79 },
    dialogue: {
      start: { text: "Howzit. Lu to my friends. I'm just getting home from work — it's been a long day.", choices: [
        { id: "greet", label: "Hi, enjoy your walk.", next: "greet" },
        { id: "life", label: "Taking a break?", next: "life" },
        { id: "later", label: "See you around." },
      ] },
      greet: { text: "Thanks. Just glad to be out of that taxi and stretching my legs. Nearly home now.", choices: farewell },
      life: { text: "Ja, a quick breather after work. Then it's supper and sorting things out for tomorrow.", choices: farewell },
    },
  },
  {
    id: "jogger_carmen", name: "Carmen", role: "pedestrian", anchor: courtAnchor("Agulhas Court", at(100, -650)), patrol: true,
    appearance: { skin: "#946146", shirt: "#ab8a57", trousers: "#3b474d", hair: "#272421", height: 1.66 },
    dialogue: {
      start: { text: "Howzit! Catching my breath before another little jog. You enjoying your walk?", choices: [
        { id: "greet", label: "Ja, it's lekker out here.", next: "greet" },
        { id: "life", label: "Keeping active?", next: "life" },
        { id: "later", label: "Enjoy your jog." },
      ] },
      greet: { text: "Good stuff. Greet the people you pass; you never know when a small hello helps.", choices: farewell },
      life: { text: "Trying! Some days it's a jog, some days it's a walk. Either way, getting outside does me good.", choices: farewell },
    },
  },
  {
    id: "requester_shaun", name: "Shaun", nickname: "Shaunie", role: "requester", anchor: at(220, 80),
    appearance: { skin: "#a7775b", shirt: "#7b806c", trousers: "#4c4e53", hair: "#3b312a", height: 1.72 },
    dialogue: {
      start: { text: "Hoesit, my bru. Have you got a R2 for me? Things are a bit rough today.", choices: [
        { id: "listen", label: "How are you holding up?", next: "listen" },
        { id: "refuse", label: "Sorry, I can't help with money.", next: "refuse" },
        { id: "later", label: "I need to get going." },
      ] },
      listen: { text: "I'm struggling with tik. Not proud of where I'm at, hey. I need to speak to someone I trust. Thanks for hearing me.", choices: [{ id: "dismiss", label: "Take care, Shaunie." }] },
      refuse: { text: "Alright, I hear you. No pressure. Thanks for being straight with me.", choices: [{ id: "dismiss", label: "Take care." }] },
    },
  },
  {
    id: "requester_ricardo", name: "Ricardo", nickname: "Rico", role: "requester", anchor: at(-110, -440),
    appearance: { skin: "#966449", shirt: "#76858a", trousers: "#514a43", hair: "#302722", variant: "cap", height: 1.8 },
    dialogue: {
      start: { text: "Awe. Can you help me with a R2, please? I'm trying to get through the afternoon.", choices: [
        { id: "listen", label: "You alright, Rico?", next: "listen" },
        { id: "refuse", label: "I can't give you money.", next: "refuse" },
        { id: "later", label: "Sorry, I've got to go." },
      ] },
      listen: { text: "It's been a hard day. Don't worry, I won't hold you up. Sometimes I just need someone to listen for a moment.", choices: [{ id: "dismiss", label: "Take care of yourself." }] },
      refuse: { text: "That's okay. You don't owe me anything. Go well.", choices: [{ id: "dismiss", label: "Go well." }] },
    },
  },
  {
    id: "stranger_darren", name: "Darren", nickname: "Daz", role: "stranger", anchor: at(130, 510),
    appearance: { skin: "#a16f54", shirt: "#546777", trousers: "#424046", hair: "#322824", height: 1.76 },
    dialogue: {
      start: { text: "Hey, wag gou, my bru. What have you got in your pockets? Give me your cash.", choices: [
        { id: "peace", label: "Let's keep this peaceful.", next: "peace" },
        { id: "leave", label: "I'm leaving." },
      ] },
      peace: { text: "Alright. Keep moving then. I'm not stopping you.", choices: [{ id: "dismiss", label: "Walk away." }] },
    },
  },
  {
    id: "stranger_brendan", name: "Brendan", nickname: "Bren", role: "stranger", anchor: at(-250, -690),
    appearance: { skin: "#ad785b", shirt: "#775c60", trousers: "#39464d", hair: "#2c2926", variant: "cap", height: 1.81 },
    dialogue: {
      start: { text: "Wag daar. You've got money, né? Hand it over.", choices: [
        { id: "peace", label: "No trouble. I'm just passing.", next: "peace" },
        { id: "leave", label: "Walk away." },
      ] },
      peace: { text: "Ja, fine. Carry on with your day.", choices: [{ id: "dismiss", label: "Leave peacefully." }] },
    },
  },
];

/** Fictional dialogue does not mutate the real game's money, health or saves. */
export class NeighbourhoodNpcs {
  readonly actors: NpcEntity[] = [];
  readonly shadowCasters: AbstractMesh[] = [];
  private readonly collision = new Collision([], BUILDINGS.map((building) => ({ points: building.points, holes: building.holes })));
  private readonly scripts = new Map<string, Definition>();
  private readonly patrols = new Map<string, Patrol>();
  private active: NpcEntity | null = null;
  private conversation: Conversation | null = null;
  private dialogueNode = "start";
  private disposed = false;

  constructor(scene: Scene) {
    const candidates = this.placements();
    definitions.forEach((definition, index) => {
      const placement = index === 0 ? this.welcomePlacement(candidates) : this.selectPlacement(candidates, definition.anchor, !!definition.patrol);
      const actor = new NpcActor(scene, definition.id, definition.appearance);
      const entity: NpcEntity = {
        id: definition.id, name: definition.name, nickname: definition.nickname,
        role: definition.role, position: { ...placement.position }, heading: placement.heading, actor,
        patrolRoute: definition.patrol ? placement.route.map((point) => ({ ...point })) : undefined,
      };
      this.actors.push(entity);
      this.shadowCasters.push(...actor.shadowCasters);
      this.scripts.set(entity.id, definition);
      if (definition.patrol) this.patrols.set(entity.id, {
        route: placement.route, index: 0, speed: (1.1 + index % 4 * 0.14) * PIXELS_PER_METRE,
        wait: 0.6 + index * 0.08, phase: index,
      });
      actor.root.setEnabled(Math.hypot(entity.position.x - SPAWN.x, entity.position.y - SPAWN.y) <= 110 * PIXELS_PER_METRE);
      actor.sync(entity.position, entity.heading, false, 0);
    });
  }

  get activeNPC() { return this.active; }
  get activeConversation() { return this.conversation; }

  update(dt: number, player: MapPoint, frozen: boolean) {
    if (this.disposed) return;
    if (frozen) return;
    const elapsed = Math.min(0.1, Math.max(0, dt));
    for (const entity of this.actors) {
      let moving = false;
      if (this.active) {
        if (entity === this.active) entity.heading = Math.atan2(player.x - entity.position.x, -(player.y - entity.position.y));
      } else {
        const patrol = this.patrols.get(entity.id);
        if (patrol) moving = this.walk(entity, patrol, elapsed, player);
      }
      const visible = entity === this.active || Math.hypot(entity.position.x - player.x, entity.position.y - player.y) <= 110 * PIXELS_PER_METRE;
      entity.actor.root.setEnabled(visible);
      if (visible) entity.actor.sync(entity.position, entity.heading, moving, elapsed, entity === this.active);
    }
  }

  nearest(player: MapPoint): NpcEntity | null {
    if (this.disposed) return null;
    let nearest: NpcEntity | null = null;
    let nearestDistance = TALK_RANGE;
    for (const entity of this.actors) {
      const distance = Math.hypot(player.x - entity.position.x, player.y - entity.position.y);
      if (distance <= nearestDistance && this.clearLine(player, entity.position)) {
        nearestDistance = distance;
        nearest = entity;
      }
    }
    return nearest;
  }

  interact(player: MapPoint): Conversation | null {
    if (this.disposed) return null;
    if (this.active) return this.conversation;
    const entity = this.nearest(player);
    if (!entity) return null;
    this.active = entity;
    entity.actor.root.setEnabled(true);
    this.dialogueNode = "start";
    entity.heading = Math.atan2(player.x - entity.position.x, -(player.y - entity.position.y));
    entity.actor.sync(entity.position, entity.heading, false, 0, true);
    return this.showNode();
  }

  choose(choiceId: string): Conversation | null {
    if (!this.active || this.disposed) return null;
    const node = this.scripts.get(this.active.id)!.dialogue[this.dialogueNode];
    const choice = node.choices.find((item) => item.id === choiceId);
    if (!choice) return this.conversation;
    if (!choice.next) { this.close(); return null; }
    this.dialogueNode = choice.next;
    return this.showNode();
  }

  close() {
    if (this.active && !this.disposed) this.active.actor.sync(this.active.position, this.active.heading, false, 0, false);
    this.active = null;
    this.conversation = null;
    this.dialogueNode = "start";
  }

  dispose() {
    if (this.disposed) return;
    this.close();
    this.disposed = true;
    for (const entity of this.actors) entity.actor.dispose();
    this.patrols.clear();
  }

  private showNode(): Conversation {
    const entity = this.active!;
    const node = this.scripts.get(entity.id)!.dialogue[this.dialogueNode];
    this.conversation = {
      speaker: entity.nickname ? `${entity.name} ‘${entity.nickname}’` : entity.name, text: node.text,
      choices: node.choices.map(({ id, label }) => ({ id, label })),
    };
    return this.conversation;
  }

  private walk(entity: NpcEntity, patrol: Patrol, dt: number, player: MapPoint) {
    // A pedestrian waits for someone standing in their way rather than clipping through them.
    if (Math.hypot(entity.position.x - player.x, entity.position.y - player.y) < 1.1 * PIXELS_PER_METRE) return false;
    if (patrol.wait > 0) { patrol.wait = Math.max(0, patrol.wait - dt); return false; }
    const destination = patrol.route[patrol.index];
    const dx = destination.x - entity.position.x, dy = destination.y - entity.position.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 1) {
      patrol.index = (patrol.index + 1) % patrol.route.length;
      patrol.wait = 0.5 + (patrol.phase % 3) * 0.4;
      return false;
    }
    const travel = Math.min(distance, patrol.speed * dt);
    const steps = Math.max(1, Math.ceil(travel / (BODY_RADIUS / 2)));
    const old = { ...entity.position };
    for (let step = 0; step < steps; step++) {
      const next = { x: entity.position.x + dx / distance * travel / steps, y: entity.position.y + dy / distance * travel / steps };
      const occupied = this.actors.some((other) => other !== entity && Math.hypot(other.position.x - next.x, other.position.y - next.y) < BODY_RADIUS * 2.2);
      if (occupied || Math.hypot(next.x - player.x, next.y - player.y) < BODY_RADIUS * 2.2) break;
      this.collision.move(entity.position, dx / distance * travel / steps, dy / distance * travel / steps, BODY_RADIUS);
      this.clamp(entity.position);
    }
    const movedX = entity.position.x - old.x, movedY = entity.position.y - old.y;
    const moving = Math.hypot(movedX, movedY) > 0.001;
    if (moving) entity.heading = Math.atan2(movedX, -movedY);
    else if (!this.clearLine(entity.position, destination, BODY_RADIUS)) {
      patrol.index = (patrol.index + 1) % patrol.route.length;
      patrol.wait = 1;
    }
    return moving;
  }

  private clear(point: MapPoint, radius = BODY_RADIUS) {
    const b = PREVIEW.bounds;
    return point.x > b.minX + radius && point.x < b.maxX - radius && point.y > b.minY + radius && point.y < b.maxY - radius &&
      !this.collision.blocked(point.x, point.y, radius);
  }

  private clearLine(a: MapPoint, b: MapPoint, radius = 0.4) {
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(distance / Math.min(1, radius)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (!this.clear({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, radius)) return false;
    }
    return true;
  }

  private clamp(point: MapPoint) {
    const b = PREVIEW.bounds;
    point.x = Math.max(b.minX + BODY_RADIUS, Math.min(b.maxX - BODY_RADIUS, point.x));
    point.y = Math.max(b.minY + BODY_RADIUS, Math.min(b.maxY - BODY_RADIUS, point.y));
  }

  private placements(): Placement[] {
    const result: Placement[] = [];
    for (const road of ROADS) {
      const path = ["path", "footway", "steps", "pedestrian"].includes(road.kind);
      for (let i = 1; i < road.points.length; i++) {
        const a = road.points[i - 1], b = road.points[i];
        const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
        if (length < BODY_RADIUS * 3) continue;
        const count = Math.max(1, Math.ceil(length / (8 * PIXELS_PER_METRE)));
        for (let sample = 0; sample < count; sample++) {
          const along = length * (sample + 0.5) / count;
          for (const side of path ? [0] : [-1, 1]) {
            const offset = side * (road.width / 2 + 0.65 * PIXELS_PER_METRE);
            const position = { x: a.x + dx / length * along - dy / length * offset, y: a.y + dy / length * along + dx / length * offset };
            if (!this.clear(position, BODY_RADIUS + 1)) continue;
            const route = [Math.max(BODY_RADIUS * 2, along - 8 * PIXELS_PER_METRE), Math.min(length - BODY_RADIUS * 2, along + 8 * PIXELS_PER_METRE)]
              .map((distance) => ({ x: a.x + dx / length * distance - dy / length * offset, y: a.y + dy / length * distance + dx / length * offset }));
            if (this.clearLine(route[0], route[1], BODY_RADIUS + 0.8)) result.push({ position, heading: Math.atan2(dy * side, dx * side), route, road });
          }
        }
      }
    }
    if (!result.length) throw new Error("No safe mapped NPC walking positions in this preview.");
    return result;
  }

  private selectPlacement(candidates: Placement[], anchor: MapPoint, walking: boolean): Placement {
    const available = candidates.filter((candidate) => (!walking || Math.hypot(candidate.route[0].x - candidate.route[1].x, candidate.route[0].y - candidate.route[1].y) >= 6 * PIXELS_PER_METRE) &&
      this.actors.every((entity) => Math.hypot(entity.position.x - candidate.position.x, entity.position.y - candidate.position.y) >= 4.5 * PIXELS_PER_METRE));
    available.sort((a, b) => Math.hypot(a.position.x - anchor.x, a.position.y - anchor.y) - Math.hypot(b.position.x - anchor.x, b.position.y - anchor.y));
    if (!available.length) throw new Error("Not enough clear mapped positions for neighbourhood characters.");
    return available[0];
  }

  private welcomePlacement(candidates: Placement[]): Placement {
    const nearby = [...candidates].sort((a, b) => Math.hypot(a.position.x - SPAWN.x, a.position.y - SPAWN.y) - Math.hypot(b.position.x - SPAWN.x, b.position.y - SPAWN.y))[0];
    const offset = 1.85 * PIXELS_PER_METRE;
    for (const angle of [Math.PI * 0.7, Math.PI * 0.3, 0, Math.PI, -Math.PI / 2]) {
      const position = { x: SPAWN.x + Math.cos(angle) * offset, y: SPAWN.y + Math.sin(angle) * offset };
      if (this.clear(position, BODY_RADIUS + 1) && this.clearLine(SPAWN, position)) return { ...nearby, position, route: [position, position], heading: Math.atan2(SPAWN.x - position.x, -(SPAWN.y - position.y)) };
    }
    return nearby;
  }
}
