import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { MapPoint, MapRoad } from "../game/world/mapData";
import { Collision, type Polygon } from "../game/systems/collision";
import { BUILDINGS, FIELDS, PREVIEW, ROADS, SPAWN } from "./map";
import { NpcActor, type Appearance } from "./npcActor";
import { PROPERTY_SOLIDS } from "./properties";
import { CREWS, CrewNavigation, type CrewPhase, type CrewState } from "./crews";

export type NpcRole = "neighbour" | "vendor" | "pedestrian" | "requester" | "stranger" | "crew";
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
  readonly crewId?: string;
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
  crewId?: string;
  appearance: Appearance;
  anchor: MapPoint;
  patrol?: boolean;
  dialogue: Record<string, DialogueNode>;
};
type Placement = { position: MapPoint; heading: number; route: MapPoint[]; road: MapRoad };
type Patrol = { route: MapPoint[]; index: number; speed: number; wait: number; phase: number };
type CrewMovement = { home: MapPoint; path: MapPoint[]; replan: number; target: MapPoint | null };

const BODY_RADIUS = 3.2;
const PIXELS_PER_METRE = 1 / PREVIEW.metresPerPixel;
const TALK_RANGE = 2.75 * PIXELS_PER_METRE;
const WARNING_RANGE = 13 * PIXELS_PER_METRE;
const WARNING_GRACE = 5;
const MAX_PURSUIT = 18;
const motorSegments = ROADS.filter((road) => !["path", "footway", "steps", "pedestrian", "cycleway"].includes(road.kind) &&
  road.width >= 8 * PIXELS_PER_METRE).flatMap((road) => road.points.slice(1).map((b, index) => ({ road, a: road.points[index], b })));
const projection = (point: MapPoint, a: MapPoint, b: MapPoint): MapPoint => {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
  return { x: a.x + dx * t, y: a.y + dy * t };
};
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

/** Original crews keep affiliations and pursuit outcomes in this session only. */
export class NeighbourhoodNpcs {
  readonly actors: NpcEntity[] = [];
  readonly shadowCasters: AbstractMesh[] = [];
  private readonly collision = new Collision([], [...BUILDINGS.map((building) => ({ points: building.points, holes: building.holes })), ...PROPERTY_SOLIDS]);
  private readonly fieldCollision = new Collision([], FIELDS.map((field) => ({ points: field.points, holes: field.holes })));
  private readonly scripts = new Map<string, Definition>();
  private readonly patrols = new Map<string, Patrol>();
  private readonly crewMovement = new Map<string, CrewMovement>();
  private readonly navigation = new CrewNavigation((point) => this.clear(point, BODY_RADIUS + 0.3),
    (a, b) => this.clearLine(a, b, BODY_RADIUS + 0.3));
  private trafficCollision: Collision | null = null;
  private affiliation: string | null = null;
  private phase: CrewPhase = "neutral";
  private rivalCrew: string | null = null;
  private phaseTime = 0;
  private lostSightTime = 0;
  private cooldown = 0;
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
    const crewCandidates = this.crewCandidates(candidates);
    for (const [crewIndex, crew] of CREWS.entries()) {
      const anchor = crewIndex === 0 ? at(-210, -250) : at(520, -490);
      const roadside = crewCandidates.filter((candidate) => candidate.road.name === crew.street);
      const group = this.selectCrewGroup(roadside.length ? roadside : crewCandidates, anchor);
      const centre = group[0].position;
      for (const [index, member] of crew.members.entries()) {
        const placement = group[index];
        const definition: Definition = {
          ...member, crewId: crew.id, role: "crew", anchor: centre,
          appearance: { skin: member.skin, height: member.height, shirt: crew.colour,
            trousers: index % 2 ? "#39444b" : "#414047", hair: "#302722", variant: "cap" },
          dialogue: {},
        };
        const actor = new NpcActor(scene, definition.id, definition.appearance);
        const entity: NpcEntity = { id: definition.id, name: definition.name, nickname: definition.nickname,
          role: "crew", crewId: crew.id, position: { ...placement.position }, heading: placement.heading, actor };
        this.actors.push(entity); this.shadowCasters.push(...actor.shadowCasters);
        this.scripts.set(entity.id, definition);
        this.crewMovement.set(entity.id, { home: { ...entity.position }, path: [], replan: 0, target: null });
        actor.root.setEnabled(Math.hypot(entity.position.x - SPAWN.x, entity.position.y - SPAWN.y) <= 110 * PIXELS_PER_METRE);
        actor.sync(entity.position, entity.heading, false, 0);
      }
    }
  }

  get activeNPC() { return this.active; }
  get activeConversation() { return this.conversation; }
  get crewState(): CrewState {
    const joined = CREWS.find((crew) => crew.id === this.affiliation);
    const rival = CREWS.find((crew) => crew.id === this.rivalCrew);
    const text: Record<CrewPhase, string> = {
      neutral: "No crew · Speak to a crew contact to choose a side.",
      joined: `Running with ${joined?.name ?? "your crew"}. Rival crews react to your colours.`,
      warning: `${rival?.name}: Move along before this gets worse.`,
      pursuit: `${rival?.name} are coming after you. Sprint away or speak to a contact to leave your crew.`,
      escaped: `You got away. Keep some distance from ${rival?.name}.`,
      caught: "They caught up. Move on, or speak to leave your crew.",
    };
    return { affiliation: this.affiliation, phase: this.phase, crewName: rival?.name ?? joined?.name,
      text: text[this.phase], remaining: ["warning", "pursuit", "escaped", "caught"].includes(this.phase) ? this.phaseTime : undefined,
      chasingIds: this.phase === "pursuit" ? this.actors.filter((entity) => entity.crewId === this.rivalCrew).map((entity) => entity.id) : [] };
  }

  setTrafficSolids(polygons: Polygon[]) {
    this.trafficCollision = polygons.length ? new Collision([], polygons) : null;
  }

  leaveCrew() {
    this.affiliation = null; this.phase = "neutral"; this.rivalCrew = null;
    this.phaseTime = 0; this.lostSightTime = 0; this.cooldown = 15;
  }

  update(dt: number, player: MapPoint, frozen: boolean) {
    if (this.disposed) return;
    if (frozen) return;
    const elapsed = Math.min(0.1, Math.max(0, dt));
    // A conversation pauses everyone, including warning, chase and cooldown timers.
    if (!this.active) this.updateCrewState(elapsed, player);
    for (const entity of this.actors) {
      let moving = false;
      if (this.active) {
        if (entity === this.active) entity.heading = Math.atan2(player.x - entity.position.x, -(player.y - entity.position.y));
      } else {
        const patrol = this.patrols.get(entity.id);
        if (patrol) moving = this.walk(entity, patrol, elapsed, player);
        else if (entity.crewId) moving = this.moveCrew(entity, elapsed, player);
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
    if (this.active.crewId) return this.chooseCrew(choiceId);
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
    this.crewMovement.clear();
    this.trafficCollision = null;
  }

  private showNode(): Conversation {
    const entity = this.active!;
    if (entity.crewId) return this.showCrew();
    const node = this.scripts.get(entity.id)!.dialogue[this.dialogueNode];
    this.conversation = {
      speaker: entity.nickname ? `${entity.name} ‘${entity.nickname}’` : entity.name, text: node.text,
      choices: node.choices.map(({ id, label }) => ({ id, label })),
    };
    return this.conversation;
  }

  private showCrew(): Conversation {
    const entity = this.active!;
    const crew = CREWS.find((item) => item.id === entity.crewId)!;
    const other = CREWS.find((item) => item.id !== crew.id)!;
    let text: string;
    let choices: Conversation["choices"];
    if (this.dialogueNode === "joined") {
      text = `Awe. You're running with ${crew.name} now. ${other.name} will see you as a rival. Give their corner space unless you want trouble.`;
      choices = [{ id: "dismiss", label: "Let's go." }, { id: "leave_crew", label: "Actually, I'll stay neutral." }];
    } else if (this.dialogueNode === "left") {
      text = "Sharp. We leave it here. You can walk through without picking sides.";
      choices = [{ id: "dismiss", label: "Keep it peaceful." }];
    } else if (this.affiliation === crew.id) {
      text = crew.id === "downberg_side"
        ? "Howzit, bru. Same side. Mind the cars coming up Downberg Road. The other crew won't be pleased to see our colours."
        : "Awe, Danie's people. Don't block the gate — people must get to their flats. Keep an eye out for the other crew.";
      choices = [{ id: "life", label: "What's happening today?" },
        { id: "leave_crew", label: "I'm leaving the crew. Let's keep it peaceful." }, { id: "dismiss", label: "Catch you later." }];
    } else if (this.affiliation) {
      text = "Hey, bru. You're with the other side. Move along before this gets worse. Leave that crew if you want to keep this peaceful.";
      choices = [{ id: "leave_crew", label: "I'm leaving the crew. No trouble." }, { id: "dismiss", label: "I'm moving on." }];
    } else {
      text = crew.id === "downberg_side"
        ? `Howzit, bru. We're ${crew.name}. Mind the cars coming up the road. You can pass through, or run with us — but ${other.name} will treat you as a rival.`
        : `Awe. We're ${crew.name}. Don't block the gate — people must get to their flats. Walk with us if you want, but ${other.name} will see you as a rival.`;
      choices = [{ id: "join_crew", label: `Run with ${crew.name}.` },
        { id: "life", label: "What's happening around here?" }, { id: "dismiss", label: "Just passing. I'll stay neutral." }];
    }
    if (this.dialogueNode === "life") {
      text = crew.id === "downberg_side"
        ? "Clay's looking for a football later. Right now we're just chatting while the neighbours bring in their washing. If you're choosing a side, know what comes with it."
        : "Just a bit of music and a chat. The flats don't belong to us; everyone needs to get home. Leave space for the neighbours.";
      choices = [{ id: "back", label: "Alright. About the crew..." }, { id: "dismiss", label: "Enjoy your afternoon." }];
    }
    this.conversation = { speaker: `${entity.name} ‘${entity.nickname}’ · ${crew.name}`, text, choices };
    return this.conversation;
  }

  private chooseCrew(choiceId: string): Conversation | null {
    if (!this.conversation?.choices.some((choice) => choice.id === choiceId)) return this.conversation;
    if (choiceId === "dismiss") { this.close(); return null; }
    if (choiceId === "join_crew") {
      this.affiliation = this.active!.crewId!; this.phase = "joined";
      this.rivalCrew = null; this.phaseTime = 0; this.lostSightTime = 0;
      this.dialogueNode = "joined";
    } else if (choiceId === "leave_crew") {
      this.leaveCrew(); this.dialogueNode = "left";
    } else this.dialogueNode = choiceId === "back" ? "start" : "life";
    return this.showCrew();
  }

  private updateCrewState(dt: number, player: MapPoint) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (!this.affiliation) { this.phase = "neutral"; return; }
    if (this.phase === "caught" || this.phase === "escaped") {
      this.phaseTime = Math.max(0, this.phaseTime - dt);
      if (this.phaseTime === 0) { this.phase = "joined"; this.rivalCrew = null; }
      return;
    }
    if (this.phase === "joined") {
      if (this.cooldown > 0) return;
      const rival = this.actors.find((entity) => entity.crewId && entity.crewId !== this.affiliation &&
        Math.hypot(entity.position.x - player.x, entity.position.y - player.y) <= WARNING_RANGE && this.clearLine(player, entity.position));
      if (rival) { this.rivalCrew = rival.crewId!; this.phase = "warning"; this.phaseTime = WARNING_GRACE; }
      return;
    }
    const rivals = this.actors.filter((entity) => entity.crewId === this.rivalCrew);
    const distance = (entity: NpcEntity) => Math.hypot(entity.position.x - player.x, entity.position.y - player.y);
    if (this.phase === "warning") {
      if (!rivals.some((entity) => distance(entity) <= 18 * PIXELS_PER_METRE && this.clearLine(player, entity.position))) {
        this.phase = "joined"; this.rivalCrew = null; this.phaseTime = 0; return;
      }
      this.phaseTime = Math.max(0, this.phaseTime - dt);
      if (this.phaseTime === 0) {
        this.phase = "pursuit"; this.phaseTime = MAX_PURSUIT; this.lostSightTime = 0;
        for (const entity of rivals) { const movement = this.crewMovement.get(entity.id)!; movement.path = []; movement.replan = 0; }
      }
      return;
    }
    if (this.phase === "pursuit") {
      if (rivals.some((entity) => distance(entity) <= 1.2 * PIXELS_PER_METRE && this.clearLine(player, entity.position))) {
        this.finishPursuit("caught"); return;
      }
      const nearest = Math.min(...rivals.map(distance));
      const visible = rivals.some((entity) => this.clearLine(player, entity.position));
      this.lostSightTime = !visible && nearest > 8 * PIXELS_PER_METRE ? this.lostSightTime + dt : 0;
      this.phaseTime = Math.max(0, this.phaseTime - dt);
      if (nearest > 25 * PIXELS_PER_METRE || this.lostSightTime >= 6 || this.phaseTime === 0) this.finishPursuit("escaped");
    }
  }

  private finishPursuit(result: "escaped" | "caught") {
    this.phase = result; this.phaseTime = 6; this.cooldown = 15;
    for (const movement of this.crewMovement.values()) { movement.path = []; movement.replan = 0; movement.target = null; }
  }

  private moveCrew(entity: NpcEntity, dt: number, player: MapPoint) {
    const movement = this.crewMovement.get(entity.id)!;
    const pursuing = this.phase === "pursuit" && entity.crewId === this.rivalCrew;
    const target = pursuing ? player : movement.home;
    const distance = Math.hypot(entity.position.x - target.x, entity.position.y - target.y);
    if (distance <= (pursuing ? 1.1 * PIXELS_PER_METRE : 0.8)) {
      movement.path = [];
      if (Math.hypot(entity.position.x - player.x, entity.position.y - player.y) < WARNING_RANGE)
        entity.heading = Math.atan2(player.x - entity.position.x, -(player.y - entity.position.y));
      return false;
    }
    movement.replan = Math.max(0, movement.replan - dt);
    if (this.clearLine(entity.position, target, BODY_RADIUS + 0.3)) movement.path = [{ ...target }];
    else if (movement.replan === 0 || !movement.target || Math.hypot(target.x - movement.target.x, target.y - movement.target.y) > 2 * PIXELS_PER_METRE) {
      movement.path = this.navigation.route(entity.position, target);
      movement.target = { ...target }; movement.replan = 0.85;
    }
    while (movement.path.length && Math.hypot(entity.position.x - movement.path[0].x, entity.position.y - movement.path[0].y) < 1.2) movement.path.shift();
    const destination = movement.path[0];
    if (!destination) return false;
    const dx = destination.x - entity.position.x, dy = destination.y - entity.position.y;
    const length = Math.hypot(dx, dy);
    const travel = Math.min(length, (pursuing ? 4.8 : 1.5) * PIXELS_PER_METRE * dt);
    const steps = Math.max(1, Math.ceil(travel / (BODY_RADIUS / 2)));
    const old = { ...entity.position };
    for (let step = 0; step < steps; step++) {
      const mx = dx / length * travel / steps, my = dy / length * travel / steps;
      const next = { x: entity.position.x + mx, y: entity.position.y + my };
      if (this.actors.some((other) => other !== entity && Math.hypot(other.position.x - next.x, other.position.y - next.y) < BODY_RADIUS * 2.2)) break;
      if (!pursuing && Math.hypot(player.x - next.x, player.y - next.y) < 1.1 * PIXELS_PER_METRE) break;
      this.moveStep(entity.position, mx, my);
    }
    const mx = entity.position.x - old.x, my = entity.position.y - old.y;
    const moving = Math.hypot(mx, my) > 0.001;
    if (moving) entity.heading = Math.atan2(mx, -my);
    return moving;
  }

  private moveStep(position: MapPoint, dx: number, dy: number) {
    const next = { x: position.x + dx, y: position.y + dy };
    if (this.trafficCollision?.blocked(next.x, next.y, BODY_RADIUS)) return;
    const previous = { ...position };
    this.collision.move(position, dx, dy, BODY_RADIUS);
    this.clamp(position);
    if (this.trafficCollision?.blocked(position.x, position.y, BODY_RADIUS)) Object.assign(position, previous);
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
      this.moveStep(entity.position, dx / distance * travel / steps, dy / distance * travel / steps);
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

  private outsideTrafficLanes(point: MapPoint) {
    return motorSegments.every(({ road, a, b }) => {
      const nearest = projection(point, a, b);
      return Math.hypot(point.x - nearest.x, point.y - nearest.y) >= road.width / 2 + PIXELS_PER_METRE;
    });
  }

  private crewCandidates(candidates: Placement[]): Placement[] {
    // At a junction, being beside one road can still mean standing in another.
    // Shift onto the outer pavement and require clearance from every motor road.
    const result: Placement[] = [];
    for (const candidate of candidates) {
      const projections = candidate.road.points.slice(1).map((b, index) => projection(candidate.position, candidate.road.points[index], b));
      projections.sort((a, b) => Math.hypot(a.x - candidate.position.x, a.y - candidate.position.y) -
        Math.hypot(b.x - candidate.position.x, b.y - candidate.position.y));
      const nearest = projections[0];
      const dx = candidate.position.x - nearest.x, dy = candidate.position.y - nearest.y, distance = Math.hypot(dx, dy);
      if (distance < 1) continue;
      const shift = Math.max(0, candidate.road.width / 2 + 1.4 * PIXELS_PER_METRE - distance);
      const mx = dx / distance * shift, my = dy / distance * shift;
      const position = { x: candidate.position.x + mx, y: candidate.position.y + my };
      if (!this.clear(position, BODY_RADIUS + 1) || this.fieldCollision.blocked(position.x, position.y, BODY_RADIUS + 1) || !this.outsideTrafficLanes(position)) continue;
      result.push({ ...candidate, position, route: candidate.route.map((point) => ({ x: point.x + mx, y: point.y + my })) });
    }
    return result;
  }

  private selectCrewGroup(candidates: Placement[], anchor: MapPoint): Placement[] {
    const available = candidates.filter((candidate) => this.actors.every((entity) =>
      Math.hypot(entity.position.x - candidate.position.x, entity.position.y - candidate.position.y) >= 4.5 * PIXELS_PER_METRE));
    available.sort((a, b) => Math.hypot(a.position.x - anchor.x, a.position.y - anchor.y) - Math.hypot(b.position.x - anchor.x, b.position.y - anchor.y));
    for (const centre of available) {
      const first = this.crewPlacement(centre, 1, [centre.position]);
      if (!first) continue;
      const second = this.crewPlacement(centre, 2, [centre.position, first.position]);
      if (second) return [centre, first, second];
    }
    throw new Error("No clear outer pavement for this fictional crew's corner.");
  }

  private crewPlacement(centre: Placement, index: number, reserved: MapPoint[]): Placement | null {
    const [a, b] = centre.route;
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
    if (length > 0) {
      const side = index === 1 ? -1 : 1;
      for (const metres of [4, 5, 6, 7, 8]) {
        const position = { x: centre.position.x + dx / length * metres * PIXELS_PER_METRE * side,
          y: centre.position.y + dy / length * metres * PIXELS_PER_METRE * side };
        if (this.clear(position, BODY_RADIUS + 1) && !this.fieldCollision.blocked(position.x, position.y, BODY_RADIUS + 1) &&
          this.outsideTrafficLanes(position) && this.clearLine(centre.position, position, BODY_RADIUS + 0.8) &&
          reserved.every((point) => Math.hypot(point.x - position.x, point.y - position.y) >= 2 * PIXELS_PER_METRE) &&
          this.actors.every((entity) => Math.hypot(entity.position.x - position.x, entity.position.y - position.y) >= 2 * PIXELS_PER_METRE))
          return { ...centre, position };
      }
    }
    return null;
  }

  private welcomePlacement(candidates: Placement[]): Placement {
    const nearby = [...candidates].sort((a, b) => Math.hypot(a.position.x - SPAWN.x, a.position.y - SPAWN.y) - Math.hypot(b.position.x - SPAWN.x, b.position.y - SPAWN.y))[0];
    const offset = 1.85 * PIXELS_PER_METRE;
    const downberg = motorSegments.filter(({ road }) => road.name === "Downberg Road").map((segment) => {
      const nearest = projection(SPAWN, segment.a, segment.b);
      return { ...segment, distance: Math.hypot(SPAWN.x - nearest.x, SPAWN.y - nearest.y), length: Math.hypot(segment.b.x - segment.a.x, segment.b.y - segment.a.y) };
    }).sort((a, b) => a.distance - b.distance || b.length - a.length)[0];
    if (downberg?.length) {
      const tx = (downberg.b.x - downberg.a.x) / downberg.length, ty = (downberg.b.y - downberg.a.y) / downberg.length;
      for (const side of [1, -1]) {
        const position = { x: SPAWN.x + tx * offset * side, y: SPAWN.y + ty * offset * side };
        if (this.clear(position, BODY_RADIUS + 1) && this.clearLine(SPAWN, position))
          return { ...nearby, position, route: [position, position], heading: Math.atan2(SPAWN.x - position.x, -(SPAWN.y - position.y)) };
      }
    }
    for (const angle of [Math.PI * 0.7, Math.PI * 0.3, 0, Math.PI, -Math.PI / 2]) {
      const position = { x: SPAWN.x + Math.cos(angle) * offset, y: SPAWN.y + Math.sin(angle) * offset };
      if (this.clear(position, BODY_RADIUS + 1) && this.clearLine(SPAWN, position)) return { ...nearby, position, route: [position, position], heading: Math.atan2(SPAWN.x - position.x, -(SPAWN.y - position.y)) };
    }
    return nearby;
  }
}
