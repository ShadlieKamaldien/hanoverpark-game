import type { MapPoint } from "../game/world/mapData";
import type { BrainContext, BrainDecision, BrainState } from "./brains";
import { PREVIEW } from "./map";

export type BrainReply = BrainDecision;
export interface BrainClientStatus {
  state: "local" | "connecting" | "live" | "offline";
  message: string;
}

interface BrainNpcs {
  readonly actors: readonly { readonly id: string; readonly position: MapPoint }[];
  readonly brainStates: readonly BrainState[];
  getBrainContext(npcId: string): BrainContext | null;
  applyBrainDecision(npcId: string, decision: BrainDecision): boolean;
  localBrainReply(npcId: string, userText: string): string;
  rememberChat(npcId: string, userText: string, reply: string): void;
}

interface BrainRequest {
  npcId: string;
  trigger: "goal" | "chat";
  currentGoal: string;
  needs: BrainContext["needs"];
  memory: string[];
  recentChat: { user: string; reply: string }[];
  nearbyEvents: string[];
  userText?: string;
}

type RequestKind = BrainRequest["trigger"];
type LocalReason = "not_configured" | "rate_limited" | "unavailable" | "invalid_output";
type PendingRequest = { kind: RequestKind; controller: AbortController };
type ReceivedReply = { reply: BrainReply; reason?: LocalReason };

const FIRST_PLAN_AFTER = 14;
const PLAN_SPACING = 15;
const NPC_PLAN_INTERVAL = 90;
const NEARBY_METRES = 35;
const OFFLINE_COOLDOWN_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 10_000;
const clean = (value: string, maximum: number) => value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maximum);
const clampNeed = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 50;

/** Sparse, same-origin decisions; movement and goal completion always stay in the game. */
export class BrainClient {
  private elapsed = 0;
  private nextPlanAt = FIRST_PLAN_AFTER;
  private readonly lastPlanAt = new Map<string, number>();
  private readonly sessionId = globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  private pending: PendingRequest | null = null;
  private active = false;
  private playerPosition: MapPoint | null = null;
  private cooldownUntil = 0;
  private connection: BrainClientStatus["state"] = "local";
  private chatSerial = 0;
  private disposed = false;

  constructor(private readonly npcs: BrainNpcs) {}

  get status(): BrainClientStatus {
    if (this.pending) return { state: "connecting", message: "Thinking about the next step." };
    if (this.cooldownUntil > Date.now()) return { state: "offline", message: "Following neighbourhood routines." };
    return this.connection === "live" ? { state: "live", message: "Choosing plans and remembering conversations." }
      : { state: "local", message: "Following neighbourhood routines." };
  }

  /** Simulation time freezes on menus, dialogue and blur; requests never run once per frame. */
  update(dt: number, playerPosition: MapPoint, active: boolean) {
    if (this.disposed) return;
    this.active = active;
    this.playerPosition = { ...playerPosition };
    if (!active) {
      this.abort("goal");
      return;
    }
    if (Number.isFinite(dt)) this.elapsed += Math.max(0, Math.min(dt, 0.25));
    if (this.pending || this.elapsed < this.nextPlanAt || this.cooldownUntil > Date.now()) return;

    // Oldest request first prevents a nearby character from monopolising the budget.
    const candidate = this.npcs.actors.filter((actor) => this.nearby(actor.position) &&
      this.elapsed - (this.lastPlanAt.get(actor.id) ?? -Infinity) >= NPC_PLAN_INTERVAL)
      .sort((a, b) => (this.lastPlanAt.get(a.id) ?? -Infinity) - (this.lastPlanAt.get(b.id) ?? -Infinity) ||
        this.distance(a.position) - this.distance(b.position))
      .find((actor) => this.npcs.getBrainContext(actor.id));
    if (!candidate) return;
    const context = this.npcs.getBrainContext(candidate.id);
    if (!context) return;
    const completed = this.npcs.brainStates.find((state) => state.npcId === candidate.id)?.completed;
    this.lastPlanAt.set(candidate.id, this.elapsed);
    this.nextPlanAt = this.elapsed + PLAN_SPACING;
    void this.plan(candidate.id, context, completed);
  }

  /** Player submissions take priority over ambient planning. No key or endpoint is sent by the browser. */
  async chat(npcId: string, userText: string): Promise<BrainReply> {
    this.cancelChat();
    this.abort("goal");
    const serial = this.chatSerial;
    const text = clean(userText, 280);
    const context = this.npcs.getBrainContext(npcId);
    if (this.disposed || !context || !text) return this.localReply(npcId, text, context);
    this.nextPlanAt = Math.max(this.nextPlanAt, this.elapsed + PLAN_SPACING);
    const received = this.cooldownUntil > Date.now() ? null : await this.request(npcId, "chat", context, text);
    // A closed conversation cannot leave a memory, change a goal or update another speaker.
    if (this.disposed || serial !== this.chatSerial) return this.localReply(npcId, text, context);
    const reply = received?.reply ?? this.localReply(npcId, text, context);
    this.npcs.applyBrainDecision(npcId, reply);
    this.npcs.rememberChat(npcId, text, reply.say);
    return reply;
  }

  cancelChat() {
    this.chatSerial++;
    this.abort("chat");
  }

  /** Use on a pause or blur. Dialogue alone stops ambient plans, but can still receive a reply. */
  suspend() {
    this.active = false;
    this.cancelChat();
    this.abort("goal");
  }

  dispose() {
    if (this.disposed) return;
    this.suspend();
    this.disposed = true;
    this.playerPosition = null;
    this.lastPlanAt.clear();
  }

  private async plan(npcId: string, context: BrainContext, completed: number | undefined) {
    const received = await this.request(npcId, "goal", context);
    if (!received || this.disposed || !this.active) return;
    const actor = this.npcs.actors.find((item) => item.id === npcId);
    const current = this.npcs.getBrainContext(npcId);
    const state = this.npcs.brainStates.find((item) => item.npcId === npcId);
    if (!actor || !this.nearby(actor.position) || current?.currentGoal !== context.currentGoal ||
      state?.completed !== completed) return;
    this.npcs.applyBrainDecision(npcId, received.reply);
  }

  private async request(npcId: string, trigger: RequestKind, context: BrainContext, userText?: string): Promise<ReceivedReply | null> {
    if (this.disposed || this.pending || !context.profile.goals.some((goal) => goal.id === context.currentGoal)) return null;
    const pending: PendingRequest = { kind: trigger, controller: new AbortController() };
    this.pending = pending;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; pending.controller.abort(); }, REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch("/api/npc-brain", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json", "X-Npc-Session": this.sessionId },
        signal: pending.controller.signal,
        body: JSON.stringify(this.requestBody(npcId, trigger, context, userText)),
      });
      if (pending.controller.signal.aborted || this.pending !== pending || this.disposed) return null;
      // An unlinked Static Web App may rewrite this URL to index.html with HTTP 200.
      if (!response.ok || !response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
        this.offline();
        return null;
      }
      const raw: unknown = await response.json();
      if (pending.controller.signal.aborted || this.pending !== pending || this.disposed) return null;
      const received = this.validateReply(raw, context, trigger);
      if (!received) { this.offline(); return null; }
      if (received.reply.source === "llm") {
        this.cooldownUntil = 0;
        this.connection = "live";
      } else {
        this.offline(received.reason === "rate_limited" ? 60_000 : OFFLINE_COOLDOWN_MS);
      }
      return received;
    } catch {
      // Closing dialogue or pausing is not a failed API connection.
      if (this.pending === pending && !this.disposed && (timedOut || !pending.controller.signal.aborted)) this.offline();
      return null;
    } finally {
      clearTimeout(timeout);
      if (this.pending === pending) this.pending = null;
    }
  }

  private requestBody(npcId: string, trigger: RequestKind, context: BrainContext, userText?: string): BrainRequest {
    return {
      npcId, trigger, currentGoal: context.currentGoal,
      needs: { energy: clampNeed(context.needs.energy), social: clampNeed(context.needs.social), purpose: clampNeed(context.needs.purpose) },
      memory: context.memory.slice(-6).map((memory) => clean(memory, 160)),
      recentChat: context.recentChat.slice(-3).map((chat) => ({ user: clean(chat.user, 280), reply: clean(chat.reply, 400) })),
      nearbyEvents: context.nearbyEvents.slice(-4).map((event) => clean(event, 120)),
      ...(trigger === "chat" ? { userText } : {}),
    };
  }

  private validateReply(value: unknown, context: BrainContext, trigger: RequestKind): ReceivedReply | null {
    if (!value || typeof value !== "object") return null;
    const data = value as Record<string, unknown>;
    if ((data.source !== "llm" && data.source !== "local") || typeof data.goal !== "string" ||
      !context.profile.goals.some((goal) => goal.id === data.goal) || typeof data.say !== "string" ||
      (trigger === "chat" && !data.say.trim()) || data.say.length > 400 || typeof data.memory !== "string" || data.memory.length > 160) return null;
    const reply: BrainReply = { source: data.source, goal: data.goal, say: clean(data.say, 400), memory: clean(data.memory, 160) };
    const reason = ["not_configured", "rate_limited", "unavailable", "invalid_output"].includes(String(data.reason))
      ? data.reason as LocalReason : undefined;
    return { reply, reason };
  }

  private localReply(npcId: string, text: string, context: BrainContext | null): BrainReply {
    return { source: "local", goal: context?.currentGoal ?? "", memory: "",
      say: context ? clean(this.npcs.localBrainReply(npcId, text), 400) : "Let's catch up another time, hey." };
  }

  private offline(milliseconds = OFFLINE_COOLDOWN_MS) {
    this.cooldownUntil = Math.max(this.cooldownUntil, Date.now() + milliseconds);
    this.connection = "local";
  }

  private abort(kind: RequestKind) {
    if (this.pending?.kind !== kind) return;
    const pending = this.pending;
    this.pending = null;
    pending.controller.abort();
  }

  private distance(point: MapPoint) {
    return this.playerPosition ? Math.hypot(point.x - this.playerPosition.x, point.y - this.playerPosition.y) * PREVIEW.metresPerPixel : Infinity;
  }

  private nearby(point: MapPoint) { return this.distance(point) <= NEARBY_METRES; }
}
