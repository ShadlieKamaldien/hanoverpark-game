import catalogue from "../../api/shared/npc-profiles.json";
import type { MapPoint } from "../game/world/mapData";

export type BrainNeed = "purpose" | "energy" | "social";
export type BrainActivity = "home" | "errand" | "social" | "rest";
export interface BrainGoal {
  id: string;
  label: string;
  need: BrainNeed;
  activity: BrainActivity;
  duration: number;
}
export interface NpcProfile {
  id: string;
  name: string;
  role: string;
  personality: string;
  goals: BrainGoal[];
}
export interface BrainNeeds { energy: number; social: number; purpose: number }
export interface BrainDecision { goal: string; say: string; memory: string; source: "local" | "llm" }
export interface BrainState {
  npcId: string;
  name: string;
  role: string;
  goal: BrainGoal;
  needs: BrainNeeds;
  stage: "travelling" | "doing" | "waiting";
  progress: number;
  completed: number;
  source: "local" | "llm";
  say: string;
  memory: string[];
  target: MapPoint;
}
export interface BrainContext {
  profile: NpcProfile;
  currentGoal: string;
  needs: BrainNeeds;
  memory: string[];
  recentChat: { user: string; reply: string }[];
  nearbyEvents: string[];
}

export const NPC_PROFILES: Readonly<Record<string, NpcProfile>> = catalogue as Record<string, NpcProfile>;
const clean = (value: string, maximum: number) => value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maximum);
const bound = (value: number) => Math.min(100, Math.max(0, value));

/** The model may choose one catalogue goal; only the game supplies destinations and effects. */
export class NpcBrain {
  readonly profile: NpcProfile;
  readonly needs: BrainNeeds;
  readonly memory: string[] = [];
  readonly recentChat: { user: string; reply: string }[] = [];
  goal: BrainGoal;
  stage: BrainState["stage"] = "travelling";
  source: BrainState["source"] = "local";
  say = "";
  completed = 0;
  lived = 0;
  private dwell = 0;
  private readonly successes = new Map<string, number>();
  private pending: BrainDecision | null = null;

  constructor(readonly npcId: string, readonly targets: Record<BrainActivity, MapPoint>, ordinal: number) {
    const profile = NPC_PROFILES[npcId];
    if (!profile) throw new Error(`Missing fictional NPC profile: ${npcId}`);
    this.profile = profile;
    this.goal = profile.goals[0];
    this.needs = { energy: npcId === "commuter_luthando" ? 44 : 72 + ordinal % 5 * 3,
      social: 48 + ordinal % 4 * 4, purpose: 56 + ordinal % 3 * 5 };
  }

  get target() { return this.targets[this.goal.activity]; }
  get state(): BrainState {
    return { npcId: this.npcId, name: this.profile.name, role: this.profile.role,
      goal: { ...this.goal }, needs: { ...this.needs }, stage: this.stage,
      progress: Math.min(1, this.dwell / this.goal.duration), completed: this.completed,
      source: this.source, say: this.say, memory: [...this.memory], target: { ...this.target } };
  }

  apply(decision: BrainDecision, defer = false) {
    if (!decision || !this.profile.goals.some((goal) => goal.id === decision.goal) ||
      typeof decision.say !== "string" || typeof decision.memory !== "string" ||
      !["local", "llm"].includes(decision.source)) return false;
    const safe = { goal: decision.goal, say: clean(decision.say, 400), memory: clean(decision.memory, 180), source: decision.source };
    if (defer) this.pending = safe;
    else this.accept(safe);
    return true;
  }

  flush() {
    if (!this.pending) return;
    this.accept(this.pending);
    this.pending = null;
  }

  /** Called only during live play. Waiting is a real obstruction, never task completion. */
  tick(dt: number, arrived: boolean, waiting: boolean, moving: boolean) {
    this.lived += dt;
    this.needs.energy = bound(this.needs.energy - dt * (moving ? 0.13 : 0.04));
    this.needs.social = bound(this.needs.social - dt * 0.08);
    this.needs.purpose = bound(this.needs.purpose - dt * 0.09);
    this.stage = waiting ? "waiting" : arrived ? "doing" : "travelling";
    if (!arrived || waiting) return;
    this.dwell += dt;
    // Satisfaction is earned by doing the activity at its destination.
    this.needs[this.goal.need] = bound(this.needs[this.goal.need] + dt * 22 / this.goal.duration);
    if (this.dwell < this.goal.duration) return;
    this.completed++;
    this.successes.set(this.goal.id, (this.successes.get(this.goal.id) ?? 0) + 1);
    this.remember(`Finished: ${this.goal.label}.`);
    this.selectLocal();
  }

  localReply(userText: string) {
    const text = clean(userText, 240).toLowerCase();
    if (/remember|earlier|before|last time/.test(text) && this.recentChat.length) {
      const previous = this.recentChat.at(-1)!;
      return `Ja, you said “${previous.user.slice(0, 100)}”. I'm busy with ${this.goal.label.toLowerCase()} now.`;
    }
    if (/how are|alright|okay|tired|rest/.test(text)) {
      return this.needs.energy < 50 ? `A bit tired, hey. I'm taking it slowly. Next up is ${this.goal.label.toLowerCase()}.`
        : `I'm alright, thanks for asking. Just ${this.goal.label.toLowerCase()} before the afternoon gets away from me.`;
    }
    if (/what|doing|plan|goal|where|help/.test(text)) {
      return `Hoesit. I'm trying to ${this.goal.label.charAt(0).toLowerCase() + this.goal.label.slice(1)}. ${this.stage === "travelling" ? "I'm heading there now." : "Give me a little time to finish."}`;
    }
    return `Awe, thanks for the chat. I've still got ${this.goal.label.toLowerCase()} to get on with. We'll catch up again.`;
  }

  chat(userText: string, reply: string) {
    const user = clean(userText, 240), answer = clean(reply, 400);
    if (!user || !answer) return;
    this.recentChat.push({ user, reply: answer });
    if (this.recentChat.length > 6) this.recentChat.shift();
    this.remember(`Player said: ${user.slice(0, 100)}; I replied: ${answer.slice(0, 100)}`);
  }

  private accept(decision: BrainDecision) {
    const goal = this.profile.goals.find((item) => item.id === decision.goal)!;
    // Refreshing the same goal must not reset work already completed towards it.
    if (goal.id !== this.goal.id) { this.goal = goal; this.dwell = 0; this.stage = "travelling"; }
    this.source = decision.source;
    this.say = decision.say;
    this.remember(decision.memory);
  }

  private selectLocal() {
    const leastDone = Math.min(...this.profile.goals.map((goal) => this.successes.get(goal.id) ?? 0));
    const ranked = this.profile.goals.map((goal, index) => ({ goal, index,
      // Every personal duty gets a turn; unmet needs decide between equally neglected goals.
      score: 100 - this.needs[goal.need] + ((this.successes.get(goal.id) ?? 0) === leastDone ? 55 : 0) -
        (goal.id === this.goal.id ? 35 : 0) }));
    ranked.sort((a, b) => b.score - a.score || a.index - b.index);
    this.goal = ranked[0].goal;
    this.source = "local"; this.say = ""; this.dwell = 0; this.stage = "travelling";
  }

  private remember(line: string) {
    const safe = clean(line, 180);
    if (!safe || this.memory.at(-1) === safe) return;
    this.memory.push(safe);
    if (this.memory.length > 6) this.memory.shift();
  }
}
